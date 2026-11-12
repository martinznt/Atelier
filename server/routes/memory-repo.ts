/* Référentiel mémoire : dépôt Git privé (Memoire-Projets) en LECTURE SEULE. Aucune écriture vers GitHub n'existe ici.
   Le jeton reste côté serveur ; les documents sont des données non fiables, jamais des instructions. */
import {Hono} from 'hono';import {z} from 'zod';
import {credentialsFor} from './connections.ts';
import {jsonRequest} from '../connectors/http.ts';
import {event,fail,jsonBody,many,now,one,page,run,uid,userId} from '../core.ts';
import {readBlobText} from '../github-blob.ts';
import {MEMORY_PROJECTS,MEMORY_TYPES,isTextDoc,treeToDocs} from '../memory-index.ts';
import type {AppEnv,Env,Row} from '../types.ts';
export const memoryRepo=new Hono<AppEnv>();
const repoName=z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
const branchName=z.string().min(1).max(160).refine(s=>!s.includes('..')&&!/[\x00-\x20~^:?*\[\\]/.test(s));
const MAX_DOC_BYTES=300000,MAX_CACHE_BYTES=8*1048576;
const like=(q:string)=>'%'+q.slice(0,120).replace(/[\\%_]/g,m=>'\\'+m)+'%';
async function repoOf(env:Env,user:string,id:string){const r=await one<Row>(env,'SELECT * FROM memory_repos WHERE id=? AND user_id=?',id,user);if(!r)fail(404,'Ce référentiel est introuvable ou ne vous appartient pas.');return r;}
const repoView=(r:Row)=>({id:r.id,full_name:r.full_name,branch:r.branch,commit_sha:r.commit_sha,commit_date:r.commit_date,synced_at:r.synced_at,last_attempt_at:r.last_attempt_at,status:r.status,last_error:r.last_error,file_count:r.file_count,truncated:Boolean(r.truncated),
 stale:!r.synced_at||Date.now()-Date.parse(r.synced_at)>7*86400000,url:'https://github.com/'+r.full_name+(r.commit_sha?'/tree/'+r.commit_sha:'')});
const githubError=(e:any,what:string)=>{const s=Number(e?.status);return s===401||s===403?'GitHub refuse l’accès ('+what+', HTTP '+s+') : vérifiez le jeton dans Réglages → Connexions.':s===404?what+' introuvable avec cet accès (HTTP 404).':s===429?'Limite GitHub atteinte ('+what+') : réessayez plus tard.':'GitHub n’a pas répondu ('+what+(s?', HTTP '+s:'')+').';};

memoryRepo.get('/',async c=>{
 const user=userId(c),repos=await many<Row>(c.env,'SELECT * FROM memory_repos WHERE user_id=? ORDER BY created_at',user),out=[];
 for(const r of repos){
  const stats=await many<Row>(c.env,'SELECT project_key,doc_type,COUNT(*) AS n,SUM(content IS NOT NULL AND content_blob_sha=blob_sha) AS cached,SUM(content IS NOT NULL AND content_blob_sha<>blob_sha) AS stale FROM memory_docs WHERE user_id=? AND repo_id=? AND present=1 GROUP BY project_key,doc_type',user,r.id);
  out.push({...repoView(r),stats,cached:stats.reduce((s,x)=>s+(x.cached||0),0),stale_content:stats.reduce((s,x)=>s+(x.stale||0),0)});
 }
 return c.json({items:out,projects:MEMORY_PROJECTS,types:MEMORY_TYPES});
});
memoryRepo.post('/',async c=>{
 const user=userId(c),d=z.object({connection_id:z.string().uuid(),full_name:repoName,branch:branchName.optional()}).parse(await jsonBody(c));
 const {conn,secret}=await credentialsFor(c.env,d.connection_id,user,'read');
 if(conn.provider!=='github')fail(400,'Connexion GitHub requise.');
 // Un dépôt mémoire n'est jamais confondu avec un dépôt de code d'un projet.
 if(await one(c.env,'SELECT id FROM repositories WHERE user_id=? AND lower(full_name)=lower(?) LIMIT 1',user,d.full_name))fail(409,'Ce dépôt est déjà associé à un projet comme dépôt de code : il ne peut pas servir aussi de référentiel mémoire.');
 let info:any;try{info=(await jsonRequest('github',secret,'/repos/'+d.full_name)).data;}catch(e){fail(403,githubError(e,'dépôt')+' Rien n’est enregistré.');}
 if(String(info?.full_name||'').toLowerCase()!==d.full_name.toLowerCase())fail(400,'Le dépôt renvoyé par GitHub ne correspond pas au nom choisi : rien n’est enregistré.');
 const branch=d.branch||String(info?.default_branch||'');if(!branch)fail(502,'GitHub n’a pas indiqué la branche principale.');
 try{await jsonRequest('github',secret,'/repos/'+d.full_name+'/branches/'+encodeURIComponent(branch));}catch(e){fail(400,githubError(e,'branche « '+branch+' »')+' Rien n’est enregistré.');}
 if(await one(c.env,'SELECT id FROM memory_repos WHERE user_id=? AND lower(full_name)=lower(?)',user,d.full_name))fail(409,'Ce référentiel est déjà connecté.');
 const id=uid();
 await run(c.env,'INSERT INTO memory_repos(id,user_id,connection_id,full_name,branch,created_at) VALUES(?,?,?,?,?,?)',id,user,d.connection_id,String(info.full_name),branch,now());
 await event(c.env,user,'memory_repo_linked','Référentiel mémoire connecté en lecture seule : '+info.full_name+' ('+branch+')');
 return c.json({...repoView(await repoOf(c.env,user,id)),private:info?.private===true,default_branch:info?.default_branch||null},201);
});
memoryRepo.patch('/:id',async c=>{
 const user=userId(c),r=await repoOf(c.env,user,c.req.param('id')),d=z.object({branch:branchName}).parse(await jsonBody(c));
 const {secret}=await credentialsFor(c.env,r.connection_id,user,'read');
 try{await jsonRequest('github',secret,'/repos/'+r.full_name+'/branches/'+encodeURIComponent(d.branch));}catch(e){fail(400,githubError(e,'branche « '+d.branch+' »'));}
 // Le cache reste, mais il est marqué périmé tant qu'une synchronisation n'a pas eu lieu sur la nouvelle branche.
 await run(c.env,"UPDATE memory_repos SET branch=?,status='never',synced_at=NULL,last_error=? WHERE id=? AND user_id=?",d.branch,'Branche changée : synchronisez pour mettre l’index à jour.',r.id,user);
 return c.json(repoView(await repoOf(c.env,user,r.id)));
});
memoryRepo.delete('/:id',async c=>{
 const user=userId(c),r=await repoOf(c.env,user,c.req.param('id'));
 await run(c.env,'DELETE FROM memory_repos WHERE id=? AND user_id=?',r.id,user);
 await event(c.env,user,'memory_repo_unlinked','Référentiel mémoire retiré d’Atelier (le dépôt GitHub est inchangé) : '+r.full_name);
 return c.json({ok:true});
});
/** Synchronisation manuelle : commit épinglé, arbre complet, index des métadonnées. Le contenu n'est lu qu'à la demande. */
memoryRepo.post('/:id/sync',async c=>{
 const user=userId(c),r=await repoOf(c.env,user,c.req.param('id')),at=now();
 if(r.last_attempt_at&&Date.now()-Date.parse(r.last_attempt_at)<20000)fail(429,'Une synchronisation vient d’être lancée : patientez quelques secondes.');
 await run(c.env,'UPDATE memory_repos SET last_attempt_at=? WHERE id=? AND user_id=?',at,r.id,user);
 const failSync=async(message:string):Promise<never>=>{await run(c.env,"UPDATE memory_repos SET status='error',last_error=? WHERE id=? AND user_id=?",message,r.id,user);fail(502,message+' L’index précédent est conservé et reste marqué à sa date.');};
 let secret:string;try{secret=(await credentialsFor(c.env,r.connection_id,user,'read')).secret;}catch(e:any){return failSync('Connexion GitHub indisponible : '+(e?.message||'accès refusé')+'.');}
 let head:any,tree:any;
 try{head=(await jsonRequest('github',secret,'/repos/'+r.full_name+'/branches/'+encodeURIComponent(r.branch))).data;}catch(e){return failSync(githubError(e,'branche « '+r.branch+' »'));}
 const commit=String(head?.commit?.sha||''),treeSha=String(head?.commit?.commit?.tree?.sha||'');
 if(!/^[0-9a-f]{40}$/.test(commit)||!/^[0-9a-f]{40}$/.test(treeSha))return failSync('GitHub n’a pas renvoyé le commit ou l’arbre de la branche.');
 try{tree=(await jsonRequest('github',secret,'/repos/'+r.full_name+'/git/trees/'+treeSha+'?recursive=1')).data;}catch(e){return failSync(githubError(e,'arbre des fichiers'));}
 const docs=treeToDocs(Array.isArray(tree?.tree)?tree.tree:[]),truncated=tree?.truncated===true;
 if(docs.length>5000)return failSync('Ce dépôt dépasse 5 000 fichiers : il n’est pas indexé par Atelier.');
 const statements=[c.env.DB.prepare('UPDATE memory_docs SET present=0 WHERE user_id=? AND repo_id=?').bind(user,r.id)];
 for(const d of docs)statements.push(c.env.DB.prepare('INSERT INTO memory_docs(id,user_id,repo_id,path,blob_sha,size,doc_type,project_key,title,doc_date,doc_ref,indexed_commit,present) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(repo_id,path) DO UPDATE SET blob_sha=excluded.blob_sha,size=excluded.size,doc_type=excluded.doc_type,project_key=excluded.project_key,title=excluded.title,doc_date=excluded.doc_date,doc_ref=excluded.doc_ref,indexed_commit=excluded.indexed_commit,present=1').bind(uid(),user,r.id,d.path,d.blob_sha,d.size,d.doc_type,d.project_key,d.title,d.doc_date,d.doc_ref,commit));
 // Arbre tronqué par GitHub : l'index est partiel, les fichiers absents de la réponse ne sont pas déclarés supprimés.
 if(truncated)statements[0]=c.env.DB.prepare('SELECT 1');
 for(let i=0;i<statements.length;i+=60)await c.env.DB.batch(statements.slice(i,i+60));
 await run(c.env,'UPDATE memory_repos SET commit_sha=?,tree_sha=?,commit_date=?,synced_at=?,status=?,last_error=?,file_count=?,truncated=? WHERE id=? AND user_id=?',commit,treeSha,head?.commit?.commit?.committer?.date||null,at,truncated?'partial':'ok',truncated?'GitHub a tronqué la liste des fichiers : l’index est partiel.':null,docs.length,Number(truncated),r.id,user);
 await event(c.env,user,'memory_repo_synced','Référentiel '+r.full_name+' synchronisé au commit '+commit.slice(0,8)+' ('+docs.length+' fichiers'+(truncated?', index partiel':'')+')');
 return c.json(repoView(await repoOf(c.env,user,r.id)));
});
memoryRepo.get('/:id/docs',async c=>{
 const user=userId(c),r=await repoOf(c.env,user,c.req.param('id')),{limit,offset}=page(c);
 const q=(c.req.query('q')||'').trim(),project=c.req.query('project')||'',type=c.req.query('type')||'',inContent=c.req.query('content')==='1';
 const rows=await many<Row>(c.env,"SELECT id,path,blob_sha,size,doc_type,project_key,title,doc_date,doc_ref,indexed_commit,CASE WHEN content IS NULL THEN 'none' WHEN content_blob_sha=blob_sha THEN 'fresh' ELSE 'stale' END AS content_state,CASE WHEN ?<>'' AND content IS NOT NULL AND content LIKE ? ESCAPE '\\' THEN substr(content,max(1,instr(lower(content),lower(?))-80),240) ELSE NULL END AS excerpt FROM memory_docs WHERE user_id=? AND repo_id=? AND present=1 AND (?='' OR project_key=?) AND (?='' OR doc_type=?) AND (?='' OR path LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR COALESCE(doc_ref,'') LIKE ? ESCAPE '\\' OR COALESCE(doc_date,'') LIKE ? ESCAPE '\\' OR (?=1 AND content IS NOT NULL AND content LIKE ? ESCAPE '\\')) ORDER BY project_key,doc_type,path LIMIT ? OFFSET ?",
  q,like(q),q,user,r.id,project,project,type,type,q,like(q),like(q),like(q),like(q),Number(inContent),like(q),limit+1,offset);
 return c.json({items:rows.slice(0,limit),next:rows.length>limit?offset+limit:null,repo:repoView(r)});
});
async function cacheBytes(env:Env,user:string){return (await one<Row>(env,'SELECT COALESCE(SUM(length(content)),0) AS n FROM memory_docs WHERE user_id=? AND content IS NOT NULL',user))?.n||0;}
/** Contenu d'un document : cache par blob SHA, sinon lecture à la demande chez GitHub. Renvoie toujours la provenance exacte. */
export async function memoryDocContent(env:Env,user:string,docId:string){
 const d=await one<Row>(env,'SELECT d.*,r.full_name,r.connection_id,r.synced_at,r.branch,r.commit_sha AS repo_commit FROM memory_docs d JOIN memory_repos r ON r.id=d.repo_id WHERE d.id=? AND d.user_id=? AND r.user_id=?',docId,user,user);
 if(!d)fail(404,'Ce document est introuvable ou ne vous appartient pas.');
 const provenance={id:d.id,repository:d.full_name,branch:d.branch,path:d.path,blob_sha:d.blob_sha,commit:d.indexed_commit,synced_at:d.synced_at,present:Boolean(d.present),size:d.size,doc_type:d.doc_type,project_key:d.project_key,title:d.title,doc_date:d.doc_date,doc_ref:d.doc_ref,
  url:'https://github.com/'+d.full_name+'/blob/'+d.indexed_commit+'/'+String(d.path).split('/').map(encodeURIComponent).join('/')};
 if(d.content!==null&&d.content_blob_sha===d.blob_sha)return {...provenance,content:d.content as string,content_state:'fresh',cached_at:d.content_cached_at,notice:null};
 if(!isTextDoc(d.path))return {...provenance,content:null,content_state:'none',cached_at:null,notice:'Ce fichier n’est pas un texte : ouvrez-le sur GitHub.'};
 if(d.size>MAX_DOC_BYTES)return {...provenance,content:null,content_state:'none',cached_at:null,notice:'Ce fichier dépasse '+Math.round(MAX_DOC_BYTES/1000)+' Ko : ouvrez-le sur GitHub.'};
 let text:string;
 try{
  const {secret}=await credentialsFor(env,d.connection_id,user,'read');
  const blob=await readBlobText(secret,d.full_name,d.blob_sha);
  if(blob.binary)return {...provenance,content:null,content_state:'none',cached_at:null,notice:'Ce fichier n’est pas un texte : ouvrez-le sur GitHub.'};
  text=blob.text;
 }catch(e){
  // GitHub injoignable : on montre l'ancien contenu s'il existe, clairement marqué périmé.
  if(d.content!==null)return {...provenance,content:d.content as string,content_state:'stale',cached_at:d.content_cached_at,notice:'Contenu périmé : il correspond à une ancienne version du fichier ('+githubError(e,'contenu')+')'};
  fail(502,githubError(e,'contenu du document'));
 }
 const at=now();
 if(await cacheBytes(env,user)+text.length<=MAX_CACHE_BYTES)await run(env,'UPDATE memory_docs SET content=?,content_blob_sha=?,content_cached_at=? WHERE id=? AND user_id=?',text,d.blob_sha,at,d.id,user);
 return {...provenance,content:text,content_state:'fresh',cached_at:at,notice:null};
}
memoryRepo.get('/docs/:doc',async c=>c.json(await memoryDocContent(c.env,userId(c),c.req.param('doc'))));
/** Met en cache le contenu de quelques documents texte (reprise possible) pour permettre la recherche dans le texte. */
memoryRepo.post('/:id/index-content',async c=>{
 const user=userId(c),r=await repoOf(c.env,user,c.req.param('id'));
 const todo=await many<Row>(c.env,'SELECT id,path FROM memory_docs WHERE user_id=? AND repo_id=? AND present=1 AND size<=? AND (content IS NULL OR content_blob_sha<>blob_sha) ORDER BY size LIMIT 40',user,r.id,MAX_DOC_BYTES);
 let done=0;const errors:string[]=[];
 for(const d of todo.filter(x=>isTextDoc(x.path)).slice(0,8)){try{const x=await memoryDocContent(c.env,user,d.id);if(x.content_state==='fresh')done++;}catch(e:any){errors.push(d.path+' : '+(e?.message||'échec'));if(errors.length>=2)break;}}
 const remaining=(await many<Row>(c.env,'SELECT path FROM memory_docs WHERE user_id=? AND repo_id=? AND present=1 AND size<=? AND (content IS NULL OR content_blob_sha<>blob_sha)',user,r.id,MAX_DOC_BYTES)).filter(x=>isTextDoc(x.path)).length;
 return c.json({indexed:done,remaining,errors,cache_bytes:await cacheBytes(c.env,user),cache_limit:MAX_CACHE_BYTES});
});
