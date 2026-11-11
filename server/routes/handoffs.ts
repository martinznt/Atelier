/* Centre de transmission aux IA. Atelier prépare un paquet, l'utilisateur le copie ou le télécharge ; Atelier ne lance
   aucun agent et ne prétend jamais avoir « envoyé » quoi que ce soit : seuls les statuts d'actions réellement faites existent. */
import {Hono} from 'hono';import {z} from 'zod';
import {credentialsFor} from './connections.ts';
import {jsonRequest} from '../connectors/http.ts';
import {fail,jsonBody,many,now,one,owned,run,uid,userId} from '../core.ts';
import {getVersion,readVersion,isTextFile} from '../storage.ts';
import {HANDOFF_LABEL,DESTINATIONS,canTransition,decisionItem,fileItem,renderPackage,secretFindings,sha256Hex,taskItem,type HandoffStatus,type ResolvedItem} from '../handoff-core.ts';
import type {AppEnv,Env,Row} from '../types.ts';
export const handoffs=new Hono<AppEnv>();
const sha40=z.string().regex(/^[0-9a-f]{40}$/);
const itemRef=z.object({kind:z.enum(['decision','task','file']),ref:z.string().uuid(),include_content:z.boolean().optional()});
const MAX_ITEMS=12,MAX_FILE_CONTENT=20000;
const input=z.object({
 title:z.string().trim().min(1).max(160),destination:z.enum(['claude_code','chatgpt','codex','gemini','mistral','other']),task_id:z.string().uuid().nullable(),
 objective:z.string().max(2000),instruction:z.string().max(8000),constraints:z.string().max(3000),success_criteria:z.string().max(3000),
 repository_id:z.string().uuid().nullable(),branch:z.string().max(160).nullable(),base_sha:sha40.nullable(),pr_number:z.number().int().min(1).max(999999).nullable(),
 items:z.array(itemRef).max(MAX_ITEMS)
});
/** Colonnes autorisées en lecture : jamais SELECT * renvoyé tel quel. */
const COLS='id,project_id,task_id,parent_id,version,title,destination,objective,instruction,constraints,success_criteria,repository_id,branch,base_sha,pr_number,items,status,content_hash,frozen_at,transfer_mode,transferred_at,response_text,response_url,result_branch,result_commit,result_pr,result_verified,revision,created_at,updated_at';
const view=(r:Row)=>{let items:unknown=[];try{items=JSON.parse(r.items);}catch{items=[];}return {...r,items,status_label:HANDOFF_LABEL[r.status as HandoffStatus]||r.status,destination_label:DESTINATIONS[r.destination]||r.destination};};

async function checkOwnership(env:Env,user:string,project:string,d:Partial<z.infer<typeof input>>){
 if(d.task_id&&!await one(env,'SELECT id FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',d.task_id,user,project))fail(400,'Cette tâche n’appartient pas à ce projet.');
 if(d.repository_id&&!await one(env,'SELECT id FROM repositories WHERE id=? AND user_id=? AND project_id=?',d.repository_id,user,project))fail(400,'Ce dépôt n’est pas associé à ce projet.');
}
/** Résout les pièces choisies explicitement. Toute pièce doit appartenir au même utilisateur ET au même projet. */
async function resolveItems(env:Env,user:string,project:string,refs:z.infer<typeof itemRef>[]):Promise<ResolvedItem[]>{
 const out:ResolvedItem[]=[];
 for(const ref of refs){
  if(ref.kind==='decision'){
   const row=await one<Row>(env,'SELECT id,title,reason,status,source_kind,source_ref FROM project_decisions WHERE id=? AND user_id=? AND project_id=?',ref.ref,user,project);
   if(!row)fail(400,'Une décision choisie n’appartient pas à ce projet.');out.push(decisionItem(row as any));
  }else if(ref.kind==='task'){
   const row=await one<Row>(env,'SELECT id,title,status,objective,acceptance,proof FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',ref.ref,user,project);
   if(!row)fail(400,'Une tâche choisie n’appartient pas à ce projet.');out.push(taskItem(row as any));
  }else{
   const {file,version}=await getVersion(env,user,ref.ref);
   if(file.project_id!==project)fail(400,'Un fichier choisi n’appartient pas à ce projet.');
   let content:string|null=null;
   if(ref.include_content){
    if(!isTextFile(file.name,file.mime))fail(400,'Seuls les fichiers texte peuvent être inclus : « '+file.name+' » reste une référence.');
    if(version.size>MAX_FILE_CONTENT)fail(413,'« '+file.name+' » dépasse '+MAX_FILE_CONTENT+' caractères : joignez-le en référence seulement.');
    const res=await readVersion(env,user,version);content=await res!.text();
   }
   out.push(fileItem(file as any,version as any,content));
  }
 }
 return out;
}
async function renderFor(env:Env,user:string,pkg:Row,preparedAt:string,shaNote?:string){
 const project=await owned(env,'projects',pkg.project_id,user);
 let refs:z.infer<typeof itemRef>[]=[];try{refs=z.array(itemRef).parse(JSON.parse(pkg.items));}catch{refs=[];}
 const items=await resolveItems(env,user,pkg.project_id,refs);
 const repo=pkg.repository_id?await one<Row>(env,'SELECT full_name FROM repositories WHERE id=? AND user_id=? AND project_id=?',pkg.repository_id,user,pkg.project_id):null;
 const task=pkg.task_id?await one<Row>(env,'SELECT title FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',pkg.task_id,user,pkg.project_id):null;
 const rendered=renderPackage({projectName:project.name,preparedAt,pkg:{title:pkg.title,destination:pkg.destination,version:pkg.version,objective:pkg.objective,instruction:pkg.instruction,constraints:pkg.constraints,success_criteria:pkg.success_criteria,
  repository:repo?{full_name:repo.full_name,branch:pkg.branch,base_sha:pkg.base_sha,sha_note:shaNote,pr_number:pkg.pr_number}:null,task_title:task?.title||null},items});
 const found=secretFindings(rendered);
 if(found.length)fail(400,'Le dossier contient ce qui ressemble à un secret ('+found.join(', ')+'). Retirez-le du texte ou de la pièce concernée : rien n’est transmis.');
 return {rendered,items};
}
async function mine(env:Env,user:string,id:string){const r=await one<Row>(env,'SELECT * FROM handoff_packages WHERE id=? AND user_id=?',id,user);if(!r)fail(404,'Ce dossier est introuvable ou ne vous appartient pas.');return r;}

handoffs.get('/',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.query('project')||'',user);
 return c.json({items:(await many<Row>(c.env,`SELECT ${COLS} FROM handoff_packages WHERE user_id=? AND project_id=? ORDER BY updated_at DESC LIMIT 50`,user,p.id)).map(view)});
});
handoffs.post('/',async c=>{
 const user=userId(c),body=z.object({project_id:z.string().uuid()}).passthrough().parse(await jsonBody(c));
 const p=await owned(c.env,'projects',body.project_id,user);
 const d=input.partial().required({title:true,destination:true}).parse(body);
 await checkOwnership(c.env,user,p.id,d);
 if(d.items)await resolveItems(c.env,user,p.id,d.items);
 const id=uid(),at=now();
 await run(c.env,'INSERT INTO handoff_packages(id,user_id,project_id,task_id,title,destination,objective,instruction,constraints,success_criteria,repository_id,branch,base_sha,pr_number,items,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  id,user,p.id,d.task_id??null,d.title,d.destination,d.objective||'',d.instruction||'',d.constraints||'',d.success_criteria||'',d.repository_id??null,d.branch??null,d.base_sha??null,d.pr_number??null,JSON.stringify(d.items||[]),at,at);
 return c.json(view(await mine(c.env,user,id)),201);
});
handoffs.get('/:id',async c=>{
 const user=userId(c),r=await mine(c.env,user,c.req.param('id'));
 // Brouillon : aperçu calculé maintenant ; sinon texte figé (l'aperçu est exactement ce qui est copié ou exporté).
 let rendered=r.rendered,items:ResolvedItem[]=[],previewError:string|null=null;
 if(r.status==='draft'){try{const x=await renderFor(c.env,user,r,now());rendered=x.rendered;items=x.items;}catch(e:any){rendered=null;previewError=e?.message||'Aperçu impossible.';}}
 else{try{items=(await renderFor(c.env,user,r,r.frozen_at)).items;}catch{/* pièces supprimées depuis : le texte figé reste la référence */}}
 return c.json({...view(r),rendered,preview_error:previewError,provenance:items.map(i=>({kind:i.kind,id:i.id,label:i.label,provenance:i.provenance,content_included:i.content_included??null}))});
});
handoffs.patch('/:id',async c=>{
 const user=userId(c),r=await mine(c.env,user,c.req.param('id'));
 if(r.status!=='draft')fail(409,'Ce dossier est figé. Créez une nouvelle version pour le modifier.');
 const d=input.partial().extend({revision:z.number().int()}).parse(await jsonBody(c));
 await checkOwnership(c.env,user,r.project_id,d);if(d.items)await resolveItems(c.env,user,r.project_id,d.items);
 const x=await run(c.env,"UPDATE handoff_packages SET title=?,destination=?,task_id=?,objective=?,instruction=?,constraints=?,success_criteria=?,repository_id=?,branch=?,base_sha=?,pr_number=?,items=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND status='draft' AND revision=?",
  d.title??r.title,d.destination??r.destination,d.task_id===undefined?r.task_id:d.task_id,d.objective??r.objective,d.instruction??r.instruction,d.constraints??r.constraints,d.success_criteria??r.success_criteria,d.repository_id===undefined?r.repository_id:d.repository_id,d.branch===undefined?r.branch:d.branch,d.base_sha===undefined?r.base_sha:d.base_sha,d.pr_number===undefined?r.pr_number:d.pr_number,JSON.stringify(d.items??JSON.parse(r.items)),now(),r.id,user,d.revision);
 if(!x.meta.changes)fail(409,'Ce dossier a changé sur un autre appareil. Rechargez-le avant de réappliquer vos changements.');
 return c.json(view(await mine(c.env,user,r.id)));
});
handoffs.delete('/:id',async c=>{
 const user=userId(c),r=await mine(c.env,user,c.req.param('id'));
 if(r.status!=='draft')fail(409,'Seul un brouillon peut être supprimé : un dossier déjà préparé reste dans l’historique.');
 await run(c.env,"DELETE FROM handoff_packages WHERE id=? AND user_id=? AND status='draft'",r.id,user);return c.json({ok:true});
});
/** Brouillon → « Prêt à copier » : le texte est figé avec son empreinte. Si un dépôt et un SHA sont indiqués, le SHA est comparé à GitHub. */
handoffs.post('/:id/ready',async c=>{
 const user=userId(c),r=await mine(c.env,user,c.req.param('id'));
 if(!canTransition(r.status,'ready'))fail(409,'Ce dossier est déjà figé.');
 let shaNote:string|undefined;
 if(r.repository_id&&r.base_sha){
  const repo=await one<Row>(c.env,'SELECT * FROM repositories WHERE id=? AND user_id=? AND project_id=?',r.repository_id,user,r.project_id);
  if(repo){
   const branch=r.branch||repo.default_branch||repo.branch;
   try{
    const {secret}=await credentialsFor(c.env,repo.connection_id,user,'read');
    const live=(await jsonRequest('github',secret,'/repos/'+repo.full_name+'/branches/'+encodeURIComponent(branch))).data?.commit?.sha;
    if(live!==r.base_sha)fail(409,'La branche « '+branch+' » a avancé depuis le SHA choisi (actuellement '+String(live).slice(0,12)+'…). Mettez à jour le SHA du dossier avant de le préparer : un dossier obsolète n’est pas figé.');
    shaNote='vérifié auprès de GitHub à la préparation';
   }catch(e:any){if(e?.status===409&&e?.message)throw e;if(e?.name==='HTTPException')throw e;shaNote='non vérifié : GitHub n’a pas répondu à la préparation';}
  }
 }
 const at=now(),{rendered}=await renderFor(c.env,user,r,at,shaNote),hash=await sha256Hex(rendered);
 const x=await run(c.env,"UPDATE handoff_packages SET status='ready',rendered=?,content_hash=?,frozen_at=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND status='draft'",rendered,hash,at,at,r.id,user);
 if(!x.meta.changes)fail(409,'Ce dossier vient d’être figé sur un autre appareil.');
 return c.json({...view(await mine(c.env,user,r.id)),rendered});
});
/** Texte exact figé : identique à l'aperçu. Ne change aucun statut (la copie ou le téléchargement doit être déclaré ensuite). */
handoffs.get('/:id/export',async c=>{
 const user=userId(c),r=await mine(c.env,user,c.req.param('id'));
 if(r.status==='draft'||!r.rendered)fail(409,'Marquez d’abord le dossier « Prêt à copier » : l’export correspond à l’aperçu figé.');
 const name='transmission-'+String(r.title).normalize('NFD').replace(/[^\w]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)+'-v'+r.version+'.md';
 return new Response(r.rendered,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`,'X-Content-Hash':r.content_hash||'','Cache-Control':'no-store'}});
});
/** Déclare une action locale réellement faite : « Copié » ou « Exporté ». « Envoyé » n'est pas accepté. */
handoffs.post('/:id/transfer',async c=>{
 const user=userId(c),r=await mine(c.env,user,c.req.param('id')),d=z.object({mode:z.enum(['clipboard','download'])}).parse(await jsonBody(c));
 const next:HandoffStatus=d.mode==='clipboard'?'copied':'exported';
 if(!canTransition(r.status,next))fail(409,r.status==='draft'?'Marquez d’abord le dossier « Prêt à copier ».':'Ce dossier ne peut plus être copié ni exporté dans cet état.');
 await run(c.env,'UPDATE handoff_packages SET status=?,transfer_mode=?,transferred_at=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=?',next,d.mode,now(),now(),r.id,user);
 return c.json(view(await mine(c.env,user,r.id)));
});
/** Réponse de l'IA et liens vers ses résultats ; branche, commit et PR sont vérifiés auprès de GitHub quand c'est possible. */
handoffs.post('/:id/response',async c=>{
 const user=userId(c),r=await mine(c.env,user,c.req.param('id'));
 const d=z.object({text:z.string().max(20000).default(''),url:z.string().url().max(400).nullable().default(null),branch:z.string().max(160).nullable().default(null),commit:sha40.nullable().default(null),pr_number:z.number().int().min(1).max(999999).nullable().default(null)}).parse(await jsonBody(c));
 if(!canTransition(r.status,'response_received'))fail(409,r.status==='draft'?'Marquez d’abord le dossier « Prêt à copier ».':'La réponse ne peut pas être ajoutée dans cet état.');
 if(!d.text.trim()&&!d.url&&!d.pr_number&&!d.commit&&!d.branch)fail(400,'Ajoutez la réponse, un lien, une branche, un commit ou une PR.');
 if(d.url&&!/^https:\/\//.test(d.url))fail(400,'Le lien doit commencer par https://.');
 const found=secretFindings(d.text);if(found.length)fail(400,'La réponse contient ce qui ressemble à un secret ('+found.join(', ')+') : retirez-le avant de l’enregistrer.');
 let verified=0;
 if(r.repository_id&&(d.pr_number||d.commit||d.branch)){
  const repo=await one<Row>(c.env,'SELECT * FROM repositories WHERE id=? AND user_id=? AND project_id=?',r.repository_id,user,r.project_id);
  if(repo){
   try{
    const {secret}=await credentialsFor(c.env,repo.connection_id,user,'read');
    if(d.pr_number)await jsonRequest('github',secret,'/repos/'+repo.full_name+'/pulls/'+d.pr_number);
    if(d.commit)await jsonRequest('github',secret,'/repos/'+repo.full_name+'/commits/'+d.commit);
    if(d.branch)await jsonRequest('github',secret,'/repos/'+repo.full_name+'/branches/'+encodeURIComponent(d.branch));
    verified=1;
   }catch{verified=0;/* introuvable ou GitHub injoignable : enregistré mais marqué « non vérifié » */}
  }
 }
 await run(c.env,"UPDATE handoff_packages SET status='response_received',response_text=?,response_url=?,result_branch=?,result_commit=?,result_pr=?,result_verified=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=?",d.text,d.url,d.branch,d.commit,d.pr_number,verified,now(),r.id,user);
 // Lien avec la tâche d'origine : seulement si elle appartient au même projet.
 if(r.task_id&&(d.pr_number||d.commit||d.branch))await run(c.env,'UPDATE plan_tasks SET pr_number=COALESCE(?,pr_number),commit_sha=COALESCE(?,commit_sha),branch=COALESCE(?,branch),updated_at=? WHERE id=? AND user_id=? AND project_id=?',d.pr_number,d.commit,d.branch,now(),r.task_id,user,r.project_id);
 return c.json(view(await mine(c.env,user,r.id)));
});
handoffs.post('/:id/close',async c=>{
 const user=userId(c),r=await mine(c.env,user,c.req.param('id'));
 if(!canTransition(r.status,'done'))fail(409,r.status==='draft'?'Un brouillon se supprime ou se prépare ; il ne se clôt pas.':'Ce dossier est déjà terminé.');
 await run(c.env,"UPDATE handoff_packages SET status='done',revision=revision+1,updated_at=? WHERE id=? AND user_id=?",now(),r.id,user);
 return c.json(view(await mine(c.env,user,r.id)));
});
handoffs.post('/:id/new-version',async c=>{
 const user=userId(c),r=await mine(c.env,user,c.req.param('id'));
 if(r.status==='draft')fail(409,'Ce dossier est déjà un brouillon modifiable.');
 const id=uid(),at=now();
 await run(c.env,'INSERT INTO handoff_packages(id,user_id,project_id,task_id,parent_id,version,title,destination,objective,instruction,constraints,success_criteria,repository_id,branch,base_sha,pr_number,items,created_at,updated_at) SELECT ?,user_id,project_id,task_id,id,version+1,title,destination,objective,instruction,constraints,success_criteria,repository_id,branch,base_sha,pr_number,items,?,? FROM handoff_packages WHERE id=? AND user_id=?',id,at,at,r.id,user);
 return c.json(view(await mine(c.env,user,id)),201);
});
