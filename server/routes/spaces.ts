/* Espaces projet (Livre de recettes, Sport / Mes séances ou tout autre projet) : profil, dépôt GitHub vérifié, plan métier,
   décisions, vue d'ensemble et suivi GitHub. Chaque requête est filtrée par utilisateur ET par projet côté serveur. */
import {Hono} from 'hono';import {z} from 'zod';
import {credentialsFor} from './connections.ts';
import {jsonRequest} from '../connectors/http.ts';
import {event,fail,jsonBody,many,now,one,owned,run,uid,userId} from '../core.ts';
import {OWNERS,TASK_STATUSES,effectiveStatus,parseIds,pickNextTask,progressOf,statusAllowed,wouldCycle,isVerifiedDone,type PlanTask,type TaskStatus} from '../plan-core.ts';
import {nextAction} from '../project-guide.ts';
import {ciSummary,prNextAction,trackRepository,type Tracked} from '../github-tracking.ts';
import type {AppEnv,Env,Row} from '../types.ts';
export const spaces=new Hono<AppEnv>();

const TEMPLATES:Record<string,{name:string;description:string}>={
 livre_recettes:{name:'Livre de recettes',description:'Projet autonome : application de recettes, avec son propre dépôt et ses propres données.'},
 sport:{name:'Sport / Mes séances',description:'Projet autonome : suivi des séances de sport, avec son propre dépôt et ses propres données.'}
};
const repoName=z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
const sha40=z.string().regex(/^[0-9a-f]{40}$/);

/* ───────── Profil / initialisation ───────── */
async function profileOf(env:Env,user:string,project:string){return one<Row>(env,'SELECT * FROM project_profiles WHERE project_id=? AND user_id=?',project,user);}
async function repositoriesOf(env:Env,user:string,project:string){
 return many<Row>(env,'SELECT id,connection_id,full_name,branch,head_sha,default_branch,can_push,verified_at,shared_ack,shared_ack_at,created_at FROM repositories WHERE user_id=? AND project_id=? ORDER BY created_at',user,project);
}
const repoView=(r:Row)=>({id:r.id,full_name:r.full_name,branch:r.default_branch||r.branch,head_sha:r.head_sha,can_push:r.can_push===null||r.can_push===undefined?null:Boolean(r.can_push),verified:Boolean(r.verified_at),verified_at:r.verified_at||null,shared_ack:Boolean(r.shared_ack),url:'https://github.com/'+r.full_name});
spaces.get('/',async c=>{
 const user=userId(c);
 const rows=await many<Row>(c.env,'SELECT p.id,p.name,pr.space_key,pr.state,pr.objective,pr.site_url FROM project_profiles pr JOIN projects p ON p.id=pr.project_id WHERE pr.user_id=? AND p.user_id=? AND p.archived=0 ORDER BY p.created_at',user,user);
 const items=[];for(const r of rows){const repos=await repositoriesOf(c.env,user,r.id);items.push({project_id:r.id,name:r.name,space_key:r.space_key,state:r.state,objective:r.objective,site_url:r.site_url,repositories:repos.map(repoView)});}
 const have=new Set(rows.map(r=>r.space_key));
 return c.json({items,templates:Object.entries(TEMPLATES).map(([key,t])=>({key,label:t.name,exists:have.has(key)}))});
});
spaces.post('/init',async c=>{
 const d=z.object({template:z.enum(['livre_recettes','sport'])}).parse(await jsonBody(c)),user=userId(c);
 const existing=await one<Row>(c.env,'SELECT project_id FROM project_profiles WHERE user_id=? AND space_key=?',user,d.template);
 if(existing)return c.json({project_id:existing.project_id,created:false});
 const t=TEMPLATES[d.template],id=uid(),at=now();
 // Aucun dépôt n'est associé ici : l'association exige une sélection explicite, vérifiée avec le connecteur GitHub.
 await c.env.DB.batch([
  c.env.DB.prepare('INSERT INTO projects(id,user_id,name,description,instructions,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,user,t.name,t.description,'','sage',at,at),
  c.env.DB.prepare('INSERT INTO project_profiles(project_id,user_id,space_key,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,user,d.template,at,at)
 ]);
 await event(c.env,user,'space_init','Espace « '+t.name+' » initialisé (aucun dépôt associé).',id);
 return c.json({project_id:id,created:true},201);
});
const profileInput=z.object({objective:z.string().max(2000).optional(),state:z.enum(['active','paused','blocked','done']).optional(),site_url:z.string().url().max(300).nullable().optional(),current_phase_id:z.string().uuid().nullable().optional(),revision:z.number().int()});
spaces.patch('/:project',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user),d=profileInput.parse(await jsonBody(c));
 if(d.site_url&&!/^https:\/\//.test(d.site_url))fail(400,'L’adresse du site doit commencer par https://.');
 if(d.current_phase_id)if(!await one(c.env,'SELECT id FROM plan_phases WHERE id=? AND user_id=? AND project_id=?',d.current_phase_id,user,p.id))fail(400,'Cette phase n’appartient pas à ce projet.');
 const at=now(),cur=await profileOf(c.env,user,p.id);
 if(!cur){await run(c.env,'INSERT INTO project_profiles(project_id,user_id,objective,state,site_url,current_phase_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',p.id,user,d.objective??'',d.state??'active',d.site_url??null,d.current_phase_id??null,at,at);}
 else{
  const r=await run(c.env,'UPDATE project_profiles SET objective=?,state=?,site_url=?,current_phase_id=?,revision=revision+1,updated_at=? WHERE project_id=? AND user_id=? AND revision=?',d.objective??cur.objective,d.state??cur.state,d.site_url===undefined?cur.site_url:d.site_url,d.current_phase_id===undefined?cur.current_phase_id:d.current_phase_id,at,p.id,user,d.revision);
  if(!r.meta.changes)fail(409,'Ce projet a changé sur un autre appareil. Rechargez-le avant de réappliquer vos changements.');
 }
 return c.json(await profileOf(c.env,user,p.id));
});

/* ───────── Dépôt GitHub : sélection explicite + vérification par le connecteur ───────── */
spaces.post('/:project/repository',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 const d=z.object({connection_id:z.string().uuid(),full_name:repoName,confirm_shared:z.boolean().default(false)}).parse(await jsonBody(c));
 const {conn,secret}=await credentialsFor(c.env,d.connection_id,user,'read');
 if(conn.provider!=='github')fail(400,'Connexion GitHub requise.');
 let info:any,head:any;
 try{info=(await jsonRequest('github',secret,'/repos/'+d.full_name)).data;}
 catch(e:any){const s=Number(e?.status);fail(s===404||s===403||s===401?403:502,s===404?'Dépôt introuvable avec cet accès : il n’est pas associé.':s===401||s===403?'GitHub refuse l’accès à ce dépôt : il n’est pas associé.':'GitHub n’a pas répondu : le dépôt n’est pas associé.');}
 if(String(info?.full_name||'').toLowerCase()!==d.full_name.toLowerCase())fail(400,'Le dépôt renvoyé par GitHub ne correspond pas au nom choisi : rien n’est associé.');
 if(info?.permissions&&info.permissions.pull===false)fail(403,'Votre jeton ne donne pas accès en lecture à ce dépôt : il n’est pas associé.');
 const branch=String(info?.default_branch||'');if(!branch)fail(502,'GitHub n’a pas indiqué la branche principale : rien n’est associé.');
 try{head=(await jsonRequest('github',secret,'/repos/'+d.full_name+'/branches/'+encodeURIComponent(branch))).data;}
 catch{fail(502,'La branche principale n’a pas pu être lue : rien n’est associé.');}
 const sha=String(head?.commit?.sha||'');if(!/^[0-9a-f]{40}$/.test(sha))fail(502,'Le dernier commit n’a pas pu être lu : rien n’est associé.');
 // Le même dépôt n'est pas associé à deux projets sans confirmation explicite, dont la trace est conservée.
 const other=await one<Row>(c.env,'SELECT r.id,pr.name FROM repositories r JOIN projects pr ON pr.id=r.project_id WHERE r.user_id=? AND lower(r.full_name)=lower(?) AND r.project_id<>? LIMIT 1',user,d.full_name,p.id);
 if(other&&!d.confirm_shared)fail(409,'Ce dépôt est déjà associé au projet « '+other.name+' ». Confirmez explicitement pour l’associer aussi à celui-ci.');
 const at=now(),canPush=info?.permissions&&typeof info.permissions.push==='boolean'?Number(info.permissions.push):null;
 const same=await one<Row>(c.env,'SELECT id FROM repositories WHERE user_id=? AND project_id=? AND lower(full_name)=lower(?) AND connection_id=? ORDER BY created_at LIMIT 1',user,p.id,d.full_name,d.connection_id);
 const ack=other?1:0;
 if(same){await run(c.env,'UPDATE repositories SET branch=?,head_sha=?,default_branch=?,can_push=?,verified_at=?,shared_ack=MAX(shared_ack,?),shared_ack_at=COALESCE(shared_ack_at,?) WHERE id=? AND user_id=?',branch,sha,branch,canPush,at,ack,ack?at:null,same.id,user);}
 else{await run(c.env,'INSERT INTO repositories(id,user_id,project_id,connection_id,full_name,branch,head_sha,created_at,default_branch,can_push,verified_at,shared_ack,shared_ack_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',uid(),user,p.id,d.connection_id,String(info.full_name),branch,sha,at,branch,canPush,at,ack,ack?at:null);}
 if(other)await event(c.env,user,'repository_shared','Dépôt '+d.full_name+' associé à un second projet après confirmation explicite.',p.id);
 return c.json({repositories:(await repositoriesOf(c.env,user,p.id)).map(repoView)},same?200:201);
});
spaces.post('/:project/repository/:id/refresh',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 const r=await one<Row>(c.env,'SELECT * FROM repositories WHERE id=? AND user_id=? AND project_id=?',c.req.param('id'),user,p.id);
 if(!r)fail(404,'Ce dépôt n’est pas associé à ce projet.');
 const {secret}=await credentialsFor(c.env,r.connection_id,user,'read');
 let info:any,head:any;
 try{info=(await jsonRequest('github',secret,'/repos/'+r.full_name)).data;const branch=String(info?.default_branch||r.branch);head=(await jsonRequest('github',secret,'/repos/'+r.full_name+'/branches/'+encodeURIComponent(branch))).data;}
 catch{fail(502,'GitHub n’a pas répondu : la vérification précédente est conservée, sans être renouvelée.');}
 const sha=String(head?.commit?.sha||'');if(!/^[0-9a-f]{40}$/.test(sha))fail(502,'Le dernier commit n’a pas pu être lu.');
 const branch=String(info?.default_branch||r.branch);
 await run(c.env,'UPDATE repositories SET branch=?,default_branch=?,head_sha=?,verified_at=? WHERE id=? AND user_id=?',branch,branch,sha,now(),r.id,user);
 return c.json({repositories:(await repositoriesOf(c.env,user,p.id)).map(repoView)});
});
spaces.delete('/:project/repository/:id',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 const r=await one<Row>(c.env,'SELECT id FROM repositories WHERE id=? AND user_id=? AND project_id=?',c.req.param('id'),user,p.id);
 if(!r)fail(404,'Ce dépôt n’est pas associé à ce projet.');
 if(await one(c.env,'SELECT id FROM review_configs WHERE repository_id=? AND user_id=?',r.id,user))fail(409,'Ce dépôt sert à la vérification des PR : retirez d’abord ce réglage dans Vérifications IA.');
 await run(c.env,'DELETE FROM repositories WHERE id=? AND user_id=? AND project_id=?',r.id,user,p.id);
 return c.json({repositories:(await repositoriesOf(c.env,user,p.id)).map(repoView)});
});

/* ───────── Plan : phases et tâches métier ───────── */
const toTask=(r:Row):PlanTask=>({id:r.id,title:r.title,status:r.status,depends_on:parseIds(r.depends_on),priority:r.priority,position:r.position,phase_id:r.phase_id,parent_id:r.parent_id,owner:r.owner,proof:r.proof,blocking_question:r.blocking_question,next_action:r.next_action,pr_number:r.pr_number});
async function taskRows(env:Env,user:string,project:string){return many<Row>(env,'SELECT * FROM plan_tasks WHERE user_id=? AND project_id=? ORDER BY priority,position,created_at',user,project);}
const text=(n:number)=>z.string().max(n);
const taskInput=z.object({
 title:z.string().trim().min(1).max(200),phase_id:z.string().uuid().nullable(),parent_id:z.string().uuid().nullable(),objective:text(2000),acceptance:text(2000),
 priority:z.number().int().min(1).max(3),owner:z.enum(OWNERS),status:z.enum(TASK_STATUSES),depends_on:z.array(z.string().uuid()).max(10),
 conversation_id:z.string().uuid().nullable(),file_ids:z.array(z.string().uuid()).max(10),branch:z.string().max(160).nullable(),commit_sha:sha40.nullable(),pr_number:z.number().int().min(1).max(999999).nullable(),
 proof:text(4000),next_action:text(500),blocking_question:text(1000),position:z.number().int().min(0).max(100000)
});
/** Toute référence d'une tâche doit appartenir au même utilisateur ET au même projet. */
async function checkRefs(env:Env,user:string,project:string,d:Partial<z.infer<typeof taskInput>>,selfId?:string){
 if(d.phase_id&&!await one(env,'SELECT id FROM plan_phases WHERE id=? AND user_id=? AND project_id=?',d.phase_id,user,project))fail(400,'Cette phase n’appartient pas à ce projet.');
 if(d.parent_id){if(d.parent_id===selfId)fail(400,'Une tâche ne peut pas être son propre parent.');if(!await one(env,'SELECT id FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',d.parent_id,user,project))fail(400,'Cette tâche parente n’appartient pas à ce projet.');}
 for(const id of d.depends_on||[])if(!await one(env,'SELECT id FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',id,user,project))fail(400,'Une dépendance n’appartient pas à ce projet.');
 if(d.conversation_id&&!await one(env,'SELECT id FROM conversations WHERE id=? AND user_id=? AND project_id=?',d.conversation_id,user,project))fail(400,'Cette conversation n’appartient pas à ce projet.');
 for(const id of d.file_ids||[])if(!await one(env,'SELECT id FROM files WHERE id=? AND user_id=? AND project_id=?',id,user,project))fail(400,'Un fichier n’appartient pas à ce projet.');
}
spaces.get('/:project/plan',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 const phases=await many<Row>(c.env,'SELECT id,title,position FROM plan_phases WHERE user_id=? AND project_id=? ORDER BY position,created_at',user,p.id);
 const rows=await taskRows(c.env,user,p.id),all=rows.map(toTask);
 return c.json({phases,tasks:rows.map(r=>({...r,depends_on:parseIds(r.depends_on),file_ids:parseIds(r.file_ids),effective_status:effectiveStatus(toTask(r),all),unmet:all.length?all.filter(t=>t.id!==r.id).length&&parseIds(r.depends_on).filter(id=>all.find(t=>t.id===id)?.status!=='done').length:0}))});
});
spaces.post('/:project/phases',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user),d=z.object({title:z.string().trim().min(1).max(160),position:z.number().int().min(0).max(1000).optional()}).parse(await jsonBody(c));
 const id=uid(),at=now(),pos=d.position??((await one<Row>(c.env,'SELECT COALESCE(MAX(position),-1)+1 AS n FROM plan_phases WHERE user_id=? AND project_id=?',user,p.id))?.n??0);
 await run(c.env,'INSERT INTO plan_phases(id,user_id,project_id,title,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,user,p.id,d.title,pos,at,at);
 return c.json(await one(c.env,'SELECT id,title,position FROM plan_phases WHERE id=?',id),201);
});
spaces.patch('/:project/phases/:id',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user),d=z.object({title:z.string().trim().min(1).max(160).optional(),position:z.number().int().min(0).max(1000).optional()}).parse(await jsonBody(c));
 const r=await run(c.env,'UPDATE plan_phases SET title=COALESCE(?,title),position=COALESCE(?,position),updated_at=? WHERE id=? AND user_id=? AND project_id=?',d.title??null,d.position??null,now(),c.req.param('id'),user,p.id);
 if(!r.meta.changes)fail(404,'Cette phase est introuvable dans ce projet.');
 return c.json(await one(c.env,'SELECT id,title,position FROM plan_phases WHERE id=?',c.req.param('id')));
});
spaces.delete('/:project/phases/:id',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 const r=await run(c.env,'DELETE FROM plan_phases WHERE id=? AND user_id=? AND project_id=?',c.req.param('id'),user,p.id);
 if(!r.meta.changes)fail(404,'Cette phase est introuvable dans ce projet.');
 return c.json({ok:true});
});
spaces.post('/:project/tasks',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 const d=taskInput.partial().required({title:true}).parse(await jsonBody(c));
 await checkRefs(c.env,user,p.id,d);
 const rows=await taskRows(c.env,user,p.id),all=rows.map(toTask),id=uid();
 const cand:PlanTask={id,title:d.title,status:(d.status||'todo') as TaskStatus,depends_on:d.depends_on||[],priority:d.priority||2,position:d.position??0,phase_id:d.phase_id??null,blocking_question:d.blocking_question||'',proof:d.proof||''};
 const ok=statusAllowed(cand,cand.status,[...all,cand]);if(!ok.ok)fail(409,ok.reason);
 const at=now();
 await run(c.env,'INSERT INTO plan_tasks(id,user_id,project_id,phase_id,parent_id,title,objective,acceptance,priority,owner,status,depends_on,conversation_id,file_ids,branch,commit_sha,pr_number,proof,next_action,blocking_question,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  id,user,p.id,d.phase_id??null,d.parent_id??null,d.title,d.objective||'',d.acceptance||'',cand.priority,d.owner||'user',cand.status,JSON.stringify(cand.depends_on),d.conversation_id??null,JSON.stringify(d.file_ids||[]),d.branch??null,d.commit_sha??null,d.pr_number??null,cand.proof||'',d.next_action||'',cand.blocking_question||'',cand.position,at,at);
 return c.json(await one(c.env,'SELECT * FROM plan_tasks WHERE id=? AND user_id=?',id,user),201);
});
spaces.patch('/:project/tasks/:id',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 const d=taskInput.partial().extend({revision:z.number().int()}).parse(await jsonBody(c));
 const cur=await one<Row>(c.env,'SELECT * FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',c.req.param('id'),user,p.id);
 if(!cur)fail(404,'Cette tâche est introuvable dans ce projet.');
 await checkRefs(c.env,user,p.id,d,cur.id);
 const rows=await taskRows(c.env,user,p.id),all=rows.map(toTask);
 const deps=d.depends_on??parseIds(cur.depends_on);
 if(d.depends_on&&wouldCycle(cur.id,deps,all))fail(409,'Cette dépendance créerait un cycle entre tâches.');
 const cand:PlanTask={...toTask(cur),depends_on:deps,status:(d.status??cur.status) as TaskStatus,blocking_question:d.blocking_question??cur.blocking_question,proof:d.proof??cur.proof};
 if(d.status!==undefined||d.depends_on!==undefined){const ok=statusAllowed(cand,cand.status,all.map(t=>t.id===cand.id?cand:t));if(!ok.ok)fail(409,ok.reason);}
 const r=await run(c.env,'UPDATE plan_tasks SET phase_id=?,parent_id=?,title=?,objective=?,acceptance=?,priority=?,owner=?,status=?,depends_on=?,conversation_id=?,file_ids=?,branch=?,commit_sha=?,pr_number=?,proof=?,next_action=?,blocking_question=?,position=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND project_id=? AND revision=?',
  d.phase_id===undefined?cur.phase_id:d.phase_id,d.parent_id===undefined?cur.parent_id:d.parent_id,d.title??cur.title,d.objective??cur.objective,d.acceptance??cur.acceptance,d.priority??cur.priority,d.owner??cur.owner,cand.status,JSON.stringify(deps),
  d.conversation_id===undefined?cur.conversation_id:d.conversation_id,JSON.stringify(d.file_ids??parseIds(cur.file_ids)),d.branch===undefined?cur.branch:d.branch,d.commit_sha===undefined?cur.commit_sha:d.commit_sha,d.pr_number===undefined?cur.pr_number:d.pr_number,
  cand.proof,d.next_action??cur.next_action,cand.blocking_question,d.position??cur.position,now(),cur.id,user,p.id,d.revision);
 if(!r.meta.changes)fail(409,'Cette tâche a changé sur un autre appareil. Rechargez-la avant de réappliquer vos changements.');
 return c.json(await one(c.env,'SELECT * FROM plan_tasks WHERE id=? AND user_id=?',cur.id,user));
});
spaces.delete('/:project/tasks/:id',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 const r=await run(c.env,'DELETE FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',c.req.param('id'),user,p.id);
 if(!r.meta.changes)fail(404,'Cette tâche est introuvable dans ce projet.');
 return c.json({ok:true});
});

/* ───────── Décisions ───────── */
const decisionInput=z.object({title:z.string().trim().min(1).max(200),reason:text(2000),status:z.enum(['proposed','validated','rejected','superseded']),source_kind:z.enum(['conversation','message','report','pr','other']),source_ref:text(300),supersedes_id:z.string().uuid().nullable()});
async function checkDecision(env:Env,user:string,project:string,d:Partial<z.infer<typeof decisionInput>>,selfId?:string){
 if(d.supersedes_id){if(d.supersedes_id===selfId)fail(400,'Une décision ne peut pas se remplacer elle-même.');if(!await one(env,'SELECT id FROM project_decisions WHERE id=? AND user_id=? AND project_id=?',d.supersedes_id,user,project))fail(400,'Cette décision n’appartient pas à ce projet.');}
 if(d.source_kind==='conversation'&&d.source_ref&&/^[0-9a-f-]{36}$/.test(d.source_ref)&&!await one(env,'SELECT id FROM conversations WHERE id=? AND user_id=? AND project_id=?',d.source_ref,user,project))fail(400,'Cette conversation n’appartient pas à ce projet : la source n’est pas rattachée.');
}
spaces.get('/:project/decisions',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 return c.json({items:await many<Row>(c.env,'SELECT id,title,reason,status,source_kind,source_ref,supersedes_id,decided_at,revision,created_at,updated_at FROM project_decisions WHERE user_id=? AND project_id=? ORDER BY updated_at DESC,id',user,p.id)});
});
spaces.post('/:project/decisions',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user),d=decisionInput.partial().required({title:true}).parse(await jsonBody(c));
 await checkDecision(c.env,user,p.id,d);
 const id=uid(),at=now(),status=d.status||'proposed';
 await run(c.env,'INSERT INTO project_decisions(id,user_id,project_id,title,reason,status,source_kind,source_ref,supersedes_id,decided_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,user,p.id,d.title,d.reason||'',status,d.source_kind||'other',d.source_ref||'',d.supersedes_id??null,status==='validated'?at:null,at,at);
 if(d.supersedes_id)await run(c.env,"UPDATE project_decisions SET status='superseded',updated_at=? WHERE id=? AND user_id=? AND project_id=?",at,d.supersedes_id,user,p.id);
 return c.json(await one(c.env,'SELECT * FROM project_decisions WHERE id=? AND user_id=?',id,user),201);
});
spaces.patch('/:project/decisions/:id',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user),d=decisionInput.partial().extend({revision:z.number().int()}).parse(await jsonBody(c));
 const cur=await one<Row>(c.env,'SELECT * FROM project_decisions WHERE id=? AND user_id=? AND project_id=?',c.req.param('id'),user,p.id);
 if(!cur)fail(404,'Cette décision est introuvable dans ce projet.');
 await checkDecision(c.env,user,p.id,d,cur.id);
 const status=d.status??cur.status,at=now();
 const r=await run(c.env,'UPDATE project_decisions SET title=?,reason=?,status=?,source_kind=?,source_ref=?,supersedes_id=?,decided_at=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND project_id=? AND revision=?',d.title??cur.title,d.reason??cur.reason,status,d.source_kind??cur.source_kind,d.source_ref??cur.source_ref,d.supersedes_id===undefined?cur.supersedes_id:d.supersedes_id,status==='validated'&&cur.status!=='validated'?at:cur.decided_at,at,cur.id,user,p.id,d.revision);
 if(!r.meta.changes)fail(409,'Cette décision a changé sur un autre appareil. Rechargez-la avant de réappliquer vos changements.');
 if(d.supersedes_id)await run(c.env,"UPDATE project_decisions SET status='superseded',updated_at=? WHERE id=? AND user_id=? AND project_id=?",at,d.supersedes_id,user,p.id);
 return c.json(await one(c.env,'SELECT * FROM project_decisions WHERE id=? AND user_id=?',cur.id,user));
});

/* ───────── Vue d'ensemble, suivi GitHub et guide ───────── */
async function guideInputs(env:Env,user:string,project:string,github:{available:boolean;prs:{number:number;title:string;ci:string;review:string|null}[]}|null){
 const repos=await repositoriesOf(env,user,project),rows=await taskRows(env,user,project),tasks=rows.map(toTask);
 const phases=await many<Row>(env,'SELECT id,position FROM plan_phases WHERE user_id=? AND project_id=?',user,project);
 const phaseOrder:Record<string,number>={};for(const ph of phases)phaseOrder[ph.id]=ph.position;
 const conn=await one<Row>(env,"SELECT id FROM connections WHERE user_id=? AND provider='github' LIMIT 1",user);
 const proposed=await many<Row>(env,"SELECT id,title FROM project_decisions WHERE user_id=? AND project_id=? AND status='proposed' ORDER BY updated_at DESC",user,project);
 const packages=await many<Row>(env,"SELECT id,title,status,destination FROM handoff_packages WHERE user_id=? AND project_id=? AND status IN ('draft','ready','copied','exported') ORDER BY updated_at DESC",user,project);
 return {repos,rows,tasks,phaseOrder,input:{hasGithubConnection:Boolean(conn),repositories:repos.map(r=>({id:r.id,full_name:r.full_name,verified:Boolean(r.verified_at)})),tasks,phaseOrder,proposedDecisions:proposed.map(d=>({id:d.id,title:d.title})),packages:packages.map(p=>({id:p.id,title:p.title,status:p.status,destination:p.destination})),github}};
}
spaces.get('/:project/overview',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 const g=await guideInputs(c.env,user,p.id,null),profile=await profileOf(c.env,user,p.id);
 const phases=await many<Row>(c.env,'SELECT id,title,position FROM plan_phases WHERE user_id=? AND project_id=? ORDER BY position,created_at',user,p.id);
 const progress=progressOf(g.tasks),all=g.tasks;
 const currentPhase=phases.find(ph=>ph.id===profile?.current_phase_id)||phases.find(ph=>all.some(t=>t.phase_id===ph.id&&!['done','abandoned'].includes(t.status)))||null;
 const blockers=all.filter(t=>t.status==='blocked').map(t=>({id:t.id,title:t.title,question:t.blocking_question}));
 const waiting=all.filter(t=>effectiveStatus(t,all)==='waiting'&&['todo','ready'].includes(t.status)).map(t=>({id:t.id,title:t.title}));
 const verified=all.filter(isVerifiedDone).map(t=>({id:t.id,title:t.title})),unverified=all.filter(t=>t.status==='done'&&!isVerifiedDone(t)).map(t=>({id:t.id,title:t.title}));
 const next=pickNextTask(all,g.phaseOrder);
 return c.json({
  project:{id:p.id,name:p.name,description:p.description},profile:profile?{space_key:profile.space_key,objective:profile.objective,state:profile.state,site_url:profile.site_url,current_phase_id:profile.current_phase_id,revision:profile.revision}:{space_key:null,objective:'',state:'active',site_url:null,current_phase_id:null,revision:0},
  repositories:g.repos.map(repoView),current_phase:currentPhase,progress,
  answers:{where:currentPhase?'Phase en cours : '+currentPhase.title+' · '+progress.done+' tâche(s) terminée(s) sur '+progress.total:'Aucune phase en cours · '+progress.done+' tâche(s) terminée(s) sur '+progress.total,verified,unverified_done:unverified,blockers,waiting,next_task:next?{id:next.id,title:next.title}:null},
  next_action:nextAction(g.input)
 });
});
spaces.get('/:project/github',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 const repos=await repositoriesOf(c.env,user,p.id),at=now(),out:any[]=[];
 const prsForGuide:{number:number;title:string;ci:string;review:string|null}[]=[];let anyAvailable=false;
 for(const r of repos.slice(0,3)){
  let tracked:Tracked;
  try{const {secret}=await credentialsFor(c.env,r.connection_id,user,'read');tracked=await trackRepository((path)=>jsonRequest('github',secret,path),{full_name:r.full_name,branch:r.default_branch||r.branch},at);}
  catch(e:any){tracked={available:false,reason:'Connexion GitHub indisponible : '+(e?.message||'accès refusé'),checked_at:at};}
  const reviews=await many<Row>(c.env,'SELECT pr_number,head_sha,status FROM review_runs WHERE user_id=? AND repository_id=? ORDER BY created_at DESC LIMIT 100',user,r.id);
  const tasks=await many<Row>(c.env,'SELECT id,title,pr_number FROM plan_tasks WHERE user_id=? AND project_id=? AND pr_number IS NOT NULL',user,p.id);
  const handoffs=await many<Row>(c.env,'SELECT id,title,result_pr,pr_number FROM handoff_packages WHERE user_id=? AND project_id=? AND (result_pr IS NOT NULL OR pr_number IS NOT NULL)',user,p.id);
  const prs=(tracked.prs||[]).map(pr=>{
   const review=reviews.find(x=>x.pr_number===pr.number&&x.head_sha===pr.head_sha)?.status||null;
   prsForGuide.push({number:pr.number,title:pr.title,ci:pr.ci.state,review});
   return {...pr,review,next_action:prNextAction({draft:pr.draft,ci:pr.ci.state,review}),tasks:tasks.filter(t=>t.pr_number===pr.number).map(t=>({id:t.id,title:t.title})),handoffs:handoffs.filter(h=>h.result_pr===pr.number||h.pr_number===pr.number).map(h=>({id:h.id,title:h.title}))};
  });
  if(tracked.available)anyAvailable=true;
  out.push({repository:repoView(r),...tracked,prs:tracked.available?prs:undefined});
 }
 const g=await guideInputs(c.env,user,p.id,repos.length?{available:anyAvailable,prs:prsForGuide}:null);
 return c.json({repositories:out,next_action:nextAction(g.input)});
});
