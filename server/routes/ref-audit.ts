/* Audit de référence : dépôt entier sur un commit figé, manifeste récursif, statut de lecture par fichier, constats sourcés.
   Distinct de la revue de PR. Lecture seule : aucune écriture vers GitHub. */
import {Hono} from 'hono';import {z} from 'zod';
import {credentialsFor} from './connections.ts';
import {jsonRequest} from '../connectors/http.ts';
import {event,fail,jsonBody,many,now,one,owned,page,run,uid,userId} from '../core.ts';
import {READ_STATUS,auditCoverage,classifyRepoPath,prGraph} from '../audit-core.ts';
import {readBlobText} from '../github-blob.ts';
import {secretFindings} from '../handoff-core.ts';
import {loadChecks} from '../github-checks.ts';
import {ciSummary} from '../github-tracking.ts';
import {treeToDocs} from '../memory-index.ts';
import type {AppEnv,Env,Row} from '../types.ts';
export const refAudit=new Hono<AppEnv>();
const like=(q:string)=>'%'+q.slice(0,120).replace(/[\\%_]/g,m=>'\\'+m)+'%';
async function auditOf(env:Env,user:string,id:string){return owned<Row>(env,'ref_audits',id,user);}
async function filesOf(env:Env,user:string,id:string){return many<Row>(env,'SELECT kind,read_status,size FROM ref_audit_files WHERE user_id=? AND audit_id=?',user,id);}
async function view(env:Env,user:string,a:Row){
 const cov=auditCoverage(await filesOf(env,user,a.id) as any[]);
 return {...a,truncated:Boolean(a.truncated),coverage:cov,warning:a.truncated?'GitHub a tronqué l’arbre : le manifeste est incomplet et l’audit ne peut pas être déclaré intégral.':null,
  links:{commit:'https://github.com/'+a.full_name+'/commit/'+a.commit_sha,tree:'https://github.com/'+a.full_name+'/tree/'+a.commit_sha}};
}
refAudit.get('/',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.query('project')||'',user),out=[];
 for(const a of await many<Row>(c.env,'SELECT * FROM ref_audits WHERE user_id=? AND project_id=? ORDER BY created_at DESC LIMIT 20',user,p.id))out.push(await view(c.env,user,a));
 return c.json({items:out,labels:READ_STATUS});
});
/** Crée le manifeste au commit actuel de la branche principale. Les statuts d'un audit précédent sont repris pour les blobs inchangés. */
refAudit.post('/',async c=>{
 const user=userId(c),d=z.object({project_id:z.string().uuid(),repository_id:z.string().uuid()}).parse(await jsonBody(c));
 const p=await owned(c.env,'projects',d.project_id,user);
 const repo=await one<Row>(c.env,'SELECT * FROM repositories WHERE id=? AND user_id=? AND project_id=?',d.repository_id,user,p.id);
 if(!repo)fail(404,'Ce dépôt n’est pas associé à ce projet.');
 const {secret}=await credentialsFor(c.env,repo.connection_id,user,'read'),branch=repo.default_branch||repo.branch;
 let head:any,tree:any;
 try{head=(await jsonRequest('github',secret,'/repos/'+repo.full_name+'/branches/'+encodeURIComponent(branch))).data;
  const treeSha=String(head?.commit?.commit?.tree?.sha||'');if(!/^[0-9a-f]{40}$/.test(treeSha))throw Object.assign(new Error('arbre'),{status:502});
  tree=(await jsonRequest('github',secret,'/repos/'+repo.full_name+'/git/trees/'+treeSha+'?recursive=1')).data;}
 catch(e:any){fail(502,'GitHub n’a pas renvoyé le commit ou l’arbre du dépôt'+(e?.status?' (HTTP '+e.status+')':'')+' : aucun audit n’est créé.');}
 const commit=String(head.commit.sha),treeSha=String(head.commit.commit.tree.sha);
 const existing=await one<Row>(c.env,'SELECT * FROM ref_audits WHERE user_id=? AND repository_id=? AND commit_sha=?',user,repo.id,commit);
 if(existing)return c.json({...(await view(c.env,user,existing)),resumed:true});
 const files=treeToDocs(Array.isArray(tree?.tree)?tree.tree:[]);
 if(files.length>6000)fail(413,'Ce dépôt dépasse 6 000 fichiers : l’audit de référence n’est pas pris en charge à cette taille.');
 const previous=await one<Row>(c.env,'SELECT id,commit_sha FROM ref_audits WHERE user_id=? AND repository_id=? ORDER BY created_at DESC LIMIT 1',user,repo.id);
 const reuse=new Map<string,Row>();
 if(previous)for(const f of await many<Row>(c.env,"SELECT path,blob_sha,read_status,note,lines,flags FROM ref_audit_files WHERE user_id=? AND audit_id=? AND read_status IN ('full','segments','tool','excluded','metadata')",user,previous.id))reuse.set(f.path+'\n'+f.blob_sha,f);
 const id=uid(),at=now(),st=[c.env.DB.prepare('INSERT INTO ref_audits(id,user_id,project_id,repository_id,full_name,branch,commit_sha,tree_sha,truncated,file_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user,p.id,repo.id,repo.full_name,branch,commit,treeSha,Number(tree?.truncated===true),files.length,at,at)];
 let reused=0;
 for(const f of files){const old=reuse.get(f.path+'\n'+f.blob_sha);if(old)reused++;
  st.push(c.env.DB.prepare('INSERT INTO ref_audit_files(audit_id,user_id,path,blob_sha,size,kind,read_status,note,lines,flags,reused_from,analysed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user,f.path,f.blob_sha,f.size,classifyRepoPath(f.path),old?old.read_status:'not_started',old?old.note:'',old?old.lines:null,old?old.flags:'',old?previous!.id:null,old?at:null));}
 for(let i=0;i<st.length;i+=60)await c.env.DB.batch(st.slice(i,i+60));
 await event(c.env,user,'ref_audit_created','Audit de référence de '+repo.full_name+' au commit '+commit.slice(0,8)+' : '+files.length+' fichiers'+(reused?' ('+reused+' statuts repris, blobs inchangés)':''),p.id);
 return c.json({...(await view(c.env,user,await auditOf(c.env,user,id))),resumed:false,reused},201);
});
refAudit.get('/:id',async c=>{
 const user=userId(c),a=await auditOf(c.env,user,c.req.param('id')),{limit,offset}=page(c),status=c.req.query('status')||'',kind=c.req.query('kind')||'',q=(c.req.query('q')||'').trim();
 const files=await many<Row>(c.env,"SELECT path,blob_sha,size,kind,read_status,note,lines,flags,reused_from,analysed_at FROM ref_audit_files WHERE user_id=? AND audit_id=? AND (?='' OR read_status=?) AND (?='' OR kind=?) AND (?='' OR path LIKE ? ESCAPE '\\') ORDER BY path LIMIT ? OFFSET ?",user,a.id,status,status,kind,kind,q,like(q),limit+1,offset);
 const findings=await many<Row>(c.env,'SELECT id,title,detail,severity,confidence,path,reproduction,origin,status,created_at,updated_at FROM ref_audit_findings WHERE user_id=? AND audit_id=? ORDER BY severity,created_at',user,a.id);
 return c.json({...(await view(c.env,user,a)),files:files.slice(0,limit),next:files.length>limit?offset+limit:null,findings,labels:READ_STATUS});
});
refAudit.patch('/:id/files',async c=>{
 const user=userId(c),a=await auditOf(c.env,user,c.req.param('id')),d=z.object({paths:z.array(z.string().min(1).max(400)).min(1).max(100),read_status:z.enum(['full','segments','metadata','excluded','not_started']),note:z.string().max(500).default('')}).parse(await jsonBody(c));
 if(a.status==='closed')fail(409,'Cet audit est clos. Créez un nouvel audit pour un autre commit.');
 if(d.read_status==='excluded'&&!d.note.trim())fail(400,'Une exclusion exige un motif.');
 const st=d.paths.map(p=>c.env.DB.prepare('UPDATE ref_audit_files SET read_status=?,note=?,analysed_at=?,reused_from=NULL WHERE audit_id=? AND user_id=? AND path=?').bind(d.read_status,d.note,now(),a.id,user,p));
 for(let i=0;i<st.length;i+=60)await c.env.DB.batch(st.slice(i,i+60));
 await run(c.env,"UPDATE ref_audits SET status=CASE WHEN status='manifest' THEN 'in_progress' ELSE status END,updated_at=? WHERE id=? AND user_id=?",now(),a.id,user);
 return c.json(await view(c.env,user,await auditOf(c.env,user,a.id)));
});
/** Analyse par outil (sans IA) de quelques fichiers non commencés : lignes, indices de secrets (nom du type seulement), marqueurs TODO. Reprise possible. */
refAudit.post('/:id/analyse',async c=>{
 const user=userId(c),a=await auditOf(c.env,user,c.req.param('id'));
 if(a.status==='closed')fail(409,'Cet audit est clos.');
 const repo=await one<Row>(c.env,'SELECT connection_id FROM repositories WHERE id=? AND user_id=?',a.repository_id,user);if(!repo)fail(404,'Le dépôt de cet audit n’est plus associé.');
 const {secret}=await credentialsFor(c.env,repo.connection_id,user,'read');
 const todo=await many<Row>(c.env,"SELECT path,blob_sha,size,kind FROM ref_audit_files WHERE user_id=? AND audit_id=? AND read_status='not_started' ORDER BY kind='code' DESC,kind='migration' DESC,size LIMIT 10",user,a.id);
 let done=0,failed=0;
 for(const f of todo){
  let status='tool',note='',lines:number|null=null,flags='';
  if(f.kind==='asset'){status='metadata';note='Fichier non textuel : métadonnées seulement.';}
  else if(f.size>250000){status='metadata';note='Fichier de plus de 250 Ko : non lu par l’outil.';}
  else{
   try{const b=await readBlobText(secret,a.full_name,f.blob_sha);
    if(b.binary){status='metadata';note='Contenu binaire : métadonnées seulement.';}
    else{lines=b.text.split('\n').length;const fl:string[]=[];const s=secretFindings(b.text);if(s.length&&f.kind!=='test')fl.push('secret possible : '+s.join(', '));const todoCount=(b.text.match(/\b(TODO|FIXME|XXX)\b/g)||[]).length;if(todoCount)fl.push(todoCount+' marqueur(s) TODO');flags=fl.join(' ; ');note='Analyse automatique sans IA : comptage et indices seulement, pas une lecture.';}
   }catch(e:any){status='failed';note='Lecture impossible'+(e?.status?' (HTTP '+e.status+')':'')+'.';failed++;}
  }
  await run(c.env,'UPDATE ref_audit_files SET read_status=?,note=?,lines=?,flags=?,analysed_at=? WHERE audit_id=? AND user_id=? AND path=?',status,note,lines,flags,now(),a.id,user,f.path);
  if(status!=='failed')done++;
  if(failed>=2)break;
 }
 await run(c.env,"UPDATE ref_audits SET status=CASE WHEN status='manifest' THEN 'in_progress' ELSE status END,updated_at=? WHERE id=? AND user_id=?",now(),a.id,user);
 const remaining=(await one<Row>(c.env,"SELECT COUNT(*) AS n FROM ref_audit_files WHERE user_id=? AND audit_id=? AND read_status='not_started'",user,a.id))?.n||0;
 return c.json({analysed:done,failed,remaining,audit:await view(c.env,user,await auditOf(c.env,user,a.id))});
});
/** Contrôles du commit audité et PR ouvertes comparées à leurs vraies bases (PR empilées). */
refAudit.get('/:id/context',async c=>{
 const user=userId(c),a=await auditOf(c.env,user,c.req.param('id'));
 const repo=await one<Row>(c.env,'SELECT connection_id FROM repositories WHERE id=? AND user_id=?',a.repository_id,user);if(!repo)fail(404,'Le dépôt de cet audit n’est plus associé.');
 const {secret}=await credentialsFor(c.env,repo.connection_id,user,'read'),get=(path:string)=>jsonRequest('github',secret,path),base='/repos/'+a.full_name;
 const checks=await loadChecks(get,base,a.commit_sha),ci=ciSummary(checks.error?null:checks.checks,checks.error?null:checks.source);
 await run(c.env,'UPDATE ref_audits SET ci_state=?,ci_checked_at=? WHERE id=? AND user_id=?',ci.state,now(),a.id,user);
 let prs:any[]|null=null,head:string|null=null;
 try{prs=(await get(base+'/pulls?state=open&per_page=30')).data;}catch{prs=null;}
 try{head=String((await get(base+'/branches/'+encodeURIComponent(a.branch))).data?.commit?.sha||'')||null;}catch{head=null;}
 return c.json({ci,checks:checks.error?[]:checks.checks,branch_head:head,behind:head===null?null:head!==a.commit_sha,
  pulls:prs===null?null:prGraph(prs.map((p:any)=>({number:Number(p.number),title:String(p.title||'').slice(0,200),head:String(p.head?.ref||''),base:String(p.base?.ref||''),draft:Boolean(p.draft)})),a.branch),
  notice:'Le déploiement n’est rattaché à ce commit que si une page de santé publique expose le SHA en ligne ; sinon il reste « inconnu ».'});
});
const findingInput=z.object({title:z.string().trim().min(3).max(200),detail:z.string().max(4000),severity:z.enum(['P0','P1','P2','P3','info']),confidence:z.enum(['high','medium','low']),path:z.string().max(400),reproduction:z.string().max(2000),origin:z.enum(['user','tool','ai']),status:z.enum(['open','confirmed','fixed','rejected'])});
refAudit.post('/:id/findings',async c=>{
 const user=userId(c),a=await auditOf(c.env,user,c.req.param('id')),d=findingInput.partial().required({title:true}).parse(await jsonBody(c));
 if(d.path&&!await one(c.env,'SELECT path FROM ref_audit_files WHERE user_id=? AND audit_id=? AND path=?',user,a.id,d.path))fail(400,'Ce chemin n’est pas dans le manifeste de l’audit.');
 const id=uid(),at=now();
 await run(c.env,'INSERT INTO ref_audit_findings(id,audit_id,user_id,title,detail,severity,confidence,path,reproduction,origin,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',id,a.id,user,d.title,d.detail||'',d.severity||'P2',d.confidence||'medium',d.path||'',d.reproduction||'',d.origin||'user',d.status||'open',at,at);
 return c.json({id},201);
});
refAudit.patch('/findings/:fid',async c=>{
 const user=userId(c),cur=await one<Row>(c.env,'SELECT * FROM ref_audit_findings WHERE id=? AND user_id=?',c.req.param('fid'),user);if(!cur)fail(404,'Constat introuvable.');
 const d=findingInput.partial().parse(await jsonBody(c));
 await run(c.env,'UPDATE ref_audit_findings SET title=?,detail=?,severity=?,confidence=?,reproduction=?,status=?,updated_at=? WHERE id=? AND user_id=?',d.title??cur.title,d.detail??cur.detail,d.severity??cur.severity,d.confidence??cur.confidence,d.reproduction??cur.reproduction,d.status??cur.status,now(),cur.id,user);
 return c.json({ok:true});
});
refAudit.post('/:id/close',async c=>{
 const user=userId(c),a=await auditOf(c.env,user,c.req.param('id'));
 await run(c.env,"UPDATE ref_audits SET status='closed',updated_at=? WHERE id=? AND user_id=?",now(),a.id,user);
 const v=await view(c.env,user,await auditOf(c.env,user,a.id));
 await event(c.env,user,'ref_audit_closed','Audit de référence clos au commit '+String(a.commit_sha).slice(0,8)+' : '+v.coverage.statement,a.project_id);
 return c.json(v);
});
/** Rapport Markdown : référence, couverture exacte, statuts, constats. N'emploie « intégral » que si la couverture le démontre. */
refAudit.get('/:id/report',async c=>{
 const user=userId(c),a=await auditOf(c.env,user,c.req.param('id')),v=await view(c.env,user,a);
 const files=await many<Row>(c.env,'SELECT path,kind,read_status,note,lines,flags,size FROM ref_audit_files WHERE user_id=? AND audit_id=? ORDER BY path',user,a.id);
 const findings=await many<Row>(c.env,'SELECT title,detail,severity,confidence,path,reproduction,origin,status FROM ref_audit_findings WHERE user_id=? AND audit_id=? ORDER BY severity,created_at',user,a.id);
 const o:string[]=['# Audit de référence — '+a.full_name,'','- Branche : '+a.branch,'- Commit figé : '+a.commit_sha,'- Arbre : '+a.tree_sha+(a.truncated?' (TRONQUÉ par GitHub : manifeste incomplet)':' (complet, truncated=false)'),'- Fichiers : '+a.file_count,'- Créé le : '+a.created_at,'- État : '+(v.coverage.integral&&!a.truncated?'intégral':'partiel'),'','## Couverture',v.coverage.statement,'',
  '- Code lu intégralement : '+v.coverage.code.full+'/'+v.coverage.code.total+' ('+v.coverage.code.percent_full+' %)','- Code examiné (lecture ou outil) : '+v.coverage.code.examined+'/'+v.coverage.code.total,'- Tous fichiers examinés : '+v.coverage.examined+'/'+v.coverage.total,''];
 for(const [k,label] of Object.entries(READ_STATUS))o.push('- '+label+' : '+(v.coverage.by_status[k]||0));
 o.push('','## Constats');if(!findings.length)o.push('Aucun constat enregistré.');
 for(const f of findings)o.push('### ['+f.severity+'] '+f.title,'- Confiance : '+f.confidence+' · origine : '+f.origin+' · état : '+f.status+(f.path?' · fichier : '+f.path:''),f.detail||'',f.reproduction?'Reproduction : '+f.reproduction:'','');
 o.push('','## Manifeste','| Fichier | Type | Statut | Lignes | Note |','|---|---|---|---|---|');
 for(const f of files)o.push('| '+f.path+' | '+f.kind+' | '+(READ_STATUS[f.read_status]||f.read_status)+' | '+(f.lines??'')+' | '+String([f.note,f.flags].filter(Boolean).join(' — ')).replace(/\|/g,'/')+' |');
 return new Response(o.join('\n')+'\n',{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="audit-reference-'+String(a.commit_sha).slice(0,8)+'.md"','Cache-Control':'no-store'}});
});
