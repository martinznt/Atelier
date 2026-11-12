/* Poste de pilotage : accueil, « À faire par Martin », « Questions d'Atelier », discussions organisées, liens de provenance,
   documents de référence, journal et synthèse de reprise. Tout est filtré par utilisateur ET par projet côté serveur. */
import {Hono} from 'hono';import {z} from 'zod';
import {event,fail,jsonBody,many,now,one,owned,page,run,uid,userId} from '../core.ts';
import {guideInputs,profileOf,repoView,repositoriesOf} from './spaces.ts';
import {nextAction,type Guide} from '../project-guide.ts';
import {CONVERSATION_CATEGORIES,answerText,progressDetail,questionKey,questionsCsv,resumeText} from '../workbench-core.ts';
import {secretFindings,sha256Hex} from '../handoff-core.ts';
import type {AppEnv,Env,Row} from '../types.ts';
export const workbench=new Hono<AppEnv>();
const like=(q:string)=>'%'+q.slice(0,120).replace(/[\\%_]/g,m=>'\\'+m)+'%';
const projectOrNull=async(env:Env,user:string,id:string|null|undefined)=>{if(!id)return null;return (await owned(env,'projects',id,user)).id as string;};
const PROJECT_STATE:Record<string,string>={active:'Actif',paused:'En pause',blocked:'Bloqué',done:'Terminé'};

/* ───────── Accueil ───────── */
/** L'action humaine bloquante et la question prioritaire passent avant le reste du guide : une seule action à la fois. */
async function firstStep(env:Env,user:string,project:string,base:Guide):Promise<Guide>{
 const act=await one<Row>(env,"SELECT id,title,expected,why FROM martin_actions WHERE user_id=? AND project_id=? AND status='open' AND blocking=1 ORDER BY updated_at LIMIT 1",user,project);
 if(act)return {code:'do_martin_action',title:act.title,where:'À traiter → À faire par Martin',open:'L’action « '+act.title+' »',do:act.expected||'Faites l’action puis notez votre réponse ou la preuve.',expected:'L’action est cochée avec sa réponse ou sa preuve.',verify:'Elle disparaît des actions ouvertes.',if_missing:act.why||'Si l’action n’a plus lieu d’être, écartez-la avec la raison.',ref:{kind:'action',id:act.id}};
 const q=await one<Row>(env,"SELECT id,question,reason FROM atelier_questions WHERE user_id=? AND project_id=? AND status='open' AND priority=1 ORDER BY updated_at LIMIT 1",user,project);
 if(q)return {code:'answer_question',title:'Répondre : '+q.question,where:'À traiter → Questions d’Atelier',open:'La question « '+q.question+' »',do:'Choisissez une option, ou écrivez votre réponse, ou « Je ne sais pas ».',expected:'La question passe à « Répondue » et reste dans l’historique.',verify:'Elle n’est plus dans les questions ouvertes.',if_missing:q.reason||'Sans réponse, les tâches liées restent en attente.',ref:{kind:'question',id:q.id}};
 return base;
}
workbench.get('/home',async c=>{
 const user=userId(c);
 const projects=await many<Row>(c.env,'SELECT id,name,description,updated_at FROM projects WHERE user_id=? AND archived=0 ORDER BY favorite DESC,updated_at DESC LIMIT 20',user);
 const cards=[];
 for(const p of projects){
  const g=await guideInputs(c.env,user,p.id,null),profile=await profileOf(c.env,user,p.id);
  const progress=progressDetail(g.rows as any[]);
  const counts=await one<Row>(c.env,"SELECT (SELECT COUNT(*) FROM martin_actions WHERE user_id=?1 AND project_id=?2 AND status='open') AS actions,(SELECT COUNT(*) FROM martin_actions WHERE user_id=?1 AND project_id=?2 AND status='open' AND blocking=1) AS blocking,(SELECT COUNT(*) FROM atelier_questions WHERE user_id=?1 AND project_id=?2 AND status='open') AS questions,(SELECT COUNT(*) FROM handoff_packages WHERE user_id=?1 AND project_id=?2 AND status IN ('copied','exported')) AS awaiting,(SELECT COUNT(*) FROM handoff_packages WHERE user_id=?1 AND project_id=?2 AND status='response_received') AS responses,(SELECT COUNT(*) FROM plan_tasks WHERE user_id=?1 AND project_id=?2 AND status='ready' AND owner<>'user') AS ready_ai",user,p.id);
  const last=await one<Row>(c.env,'SELECT created_at,detail FROM events WHERE user_id=? AND project_id=? ORDER BY seq DESC LIMIT 1',user,p.id);
  cards.push({id:p.id,name:p.name,space_key:profile?.space_key||null,state:profile?.state||'active',state_label:PROJECT_STATE[profile?.state||'active'],objective:profile?.objective||p.description||'',
   progress,next_action:await firstStep(c.env,user,p.id,nextAction(g.input)),
   blockers:g.tasks.filter(t=>t.status==='blocked').map(t=>({id:t.id,title:t.title,question:t.blocking_question})),
   repositories:g.repos.map(repoView),counts:{actions:counts?.actions||0,blocking_actions:counts?.blocking||0,questions:counts?.questions||0,awaiting_responses:counts?.awaiting||0,responses_to_process:counts?.responses||0,ready_for_ai:counts?.ready_ai||0},
   last_activity:last?{at:last.created_at,detail:last.detail}:null});
 }
 const global=await one<Row>(c.env,"SELECT (SELECT COUNT(*) FROM martin_actions WHERE user_id=?1 AND status='open') AS actions,(SELECT COUNT(*) FROM atelier_questions WHERE user_id=?1 AND status='open') AS questions,(SELECT COUNT(*) FROM prompts WHERE user_id=?1 AND status='to_give') AS prompts_to_give,(SELECT COUNT(*) FROM prompts WHERE user_id=?1 AND status IN ('given','awaiting')) AS prompts_awaiting",user);
 const memory=(await many<Row>(c.env,'SELECT id,full_name,branch,commit_sha,status,synced_at,last_error,file_count,truncated FROM memory_repos WHERE user_id=? ORDER BY created_at',user)).map((m:Row):Row=>({...m,stale:!m.synced_at||Date.now()-Date.parse(m.synced_at)>7*86400000}));
 const alerts:string[]=[];
 for(const m of memory){if(m.status==='error')alerts.push('Référentiel mémoire '+m.full_name+' : dernière synchronisation en erreur.');else if(m.status==='partial')alerts.push('Référentiel mémoire '+m.full_name+' : synchronisation partielle.');else if(m.stale)alerts.push('Référentiel mémoire '+m.full_name+' : '+(m.synced_at?'synchronisation de plus de 7 jours.':'jamais synchronisé.'));}
 return c.json({projects:cards,inbox:{actions:global?.actions||0,questions:global?.questions||0},prompts:{to_give:global?.prompts_to_give||0,awaiting:global?.prompts_awaiting||0},memory,alerts,generated_at:now()});
});

/* ───────── À faire par Martin ───────── */
const actionInput=z.object({project_id:z.string().uuid().nullable(),title:z.string().trim().min(1).max(200),why:z.string().max(1000),expected:z.string().max(1000),consequence:z.string().max(1000),
 kind:z.enum(['provide','test','answer','choose','validate','confirm','authorize','other']),blocking:z.boolean(),task_id:z.string().uuid().nullable(),source_ref:z.string().max(300),due_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),created_by:z.enum(['user','atelier'])});
async function checkTask(env:Env,user:string,project:string|null,task:string|null|undefined){
 if(!task)return;if(!project)fail(400,'Une action liée à une tâche doit appartenir au projet de cette tâche.');
 if(!await one(env,'SELECT id FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',task,user,project))fail(400,'Cette tâche n’appartient pas à ce projet.');
}
workbench.get('/actions',async c=>{
 const user=userId(c),project=await projectOrNull(c.env,user,c.req.query('project')),status=c.req.query('status')||'open';
 const rows=await many<Row>(c.env,"SELECT a.*,p.name AS project_name FROM martin_actions a LEFT JOIN projects p ON p.id=a.project_id WHERE a.user_id=? AND (? IS NULL OR a.project_id=?) AND (?='all' OR a.status=?) ORDER BY a.status='open' DESC,a.blocking DESC,COALESCE(a.due_date,'9999') ,a.updated_at DESC LIMIT 200",user,project,project,status,status);
 return c.json({items:rows});
});
workbench.post('/actions',async c=>{
 const user=userId(c),d=actionInput.partial().required({title:true}).parse(await jsonBody(c));
 const project=await projectOrNull(c.env,user,d.project_id);await checkTask(c.env,user,project,d.task_id);
 const id=uid(),at=now();
 await run(c.env,'INSERT INTO martin_actions(id,user_id,project_id,title,why,expected,consequence,kind,blocking,task_id,source_ref,due_date,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,user,project,d.title,d.why||'',d.expected||'',d.consequence||'',d.kind||'other',Number(d.blocking||false),d.task_id??null,d.source_ref||'',d.due_date??null,d.created_by||'user',at,at);
 await event(c.env,user,'action_created','Action à faire : '+d.title,project);
 return c.json(await one(c.env,'SELECT * FROM martin_actions WHERE id=? AND user_id=?',id,user),201);
});
workbench.patch('/actions/:id',async c=>{
 const user=userId(c),d=actionInput.partial().extend({status:z.enum(['open','done','dismissed']).optional(),response:z.string().max(4000).optional(),proof:z.string().max(4000).optional(),revision:z.number().int()}).parse(await jsonBody(c));
 const cur=await one<Row>(c.env,'SELECT * FROM martin_actions WHERE id=? AND user_id=?',c.req.param('id'),user);
 if(!cur)fail(404,'Cette action est introuvable ou ne vous appartient pas.');
 const status=d.status??cur.status,response=d.response??cur.response,proof=d.proof??cur.proof;
 if(status==='done'&&cur.status!=='done'&&!String(response).trim()&&!String(proof).trim())fail(400,'Notez votre réponse ou la preuve avant de cocher l’action.');
 if(status==='dismissed'&&cur.status!=='dismissed'&&!String(response).trim())fail(400,'Indiquez pourquoi l’action est écartée.');
 if(d.task_id!==undefined)await checkTask(c.env,user,cur.project_id,d.task_id);
 const at=now();
 const r=await run(c.env,'UPDATE martin_actions SET title=?,why=?,expected=?,consequence=?,kind=?,blocking=?,status=?,response=?,proof=?,task_id=?,source_ref=?,due_date=?,revision=revision+1,updated_at=?,done_at=? WHERE id=? AND user_id=? AND revision=?',
  d.title??cur.title,d.why??cur.why,d.expected??cur.expected,d.consequence??cur.consequence,d.kind??cur.kind,d.blocking===undefined?cur.blocking:Number(d.blocking),status,response,proof,d.task_id===undefined?cur.task_id:d.task_id,d.source_ref??cur.source_ref,d.due_date===undefined?cur.due_date:d.due_date,at,status==='done'?(cur.done_at||at):null,cur.id,user,d.revision);
 if(!r.meta.changes)fail(409,'Cette action a changé sur un autre appareil. Rechargez-la.');
 if(status!==cur.status)await event(c.env,user,'action_'+status,'Action « '+cur.title+' » : '+(status==='done'?'faite':status==='dismissed'?'écartée':'rouverte'),cur.project_id);
 return c.json(await one(c.env,'SELECT * FROM martin_actions WHERE id=? AND user_id=?',cur.id,user));
});

/* ───────── Questions d'Atelier ───────── */
const option=z.object({label:z.string().trim().min(1).max(200),tradeoff:z.string().max(500).default(''),recommended:z.boolean().default(false)});
const questionInput=z.object({project_id:z.string().uuid().nullable(),theme:z.string().max(80),question:z.string().trim().min(5).max(600),reason:z.string().max(1000),if_unanswered:z.string().max(1000),sources_consulted:z.string().max(2000),
 options:z.array(option).max(8),multi:z.boolean(),allow_free_text:z.boolean(),allow_unknown:z.boolean(),priority:z.number().int().min(1).max(3),blocked_task_ids:z.array(z.string().uuid()).max(10)});
const questionView=(r:Row)=>{let options:any[]=[],answer:any=null,blocked:string[]=[];try{options=JSON.parse(r.options);}catch{/* options illisibles */}try{answer=r.answer?JSON.parse(r.answer):null;}catch{/* réponse illisible */}try{blocked=JSON.parse(r.blocked_task_ids);}catch{/* liste illisible */}
 return {id:r.id,project_id:r.project_id,project_name:r.project_name||null,theme:r.theme,question:r.question,reason:r.reason,if_unanswered:r.if_unanswered,sources_consulted:r.sources_consulted,options,multi:Boolean(r.multi),allow_free_text:Boolean(r.allow_free_text),allow_unknown:Boolean(r.allow_unknown),priority:r.priority,status:r.status,answer,answer_text:answerText(answer,options),answered_at:r.answered_at,decision_id:r.decision_id,blocked_task_ids:blocked,revision:r.revision,created_at:r.created_at,updated_at:r.updated_at};};
async function questionRow(env:Env,user:string,id:string){const r=await one<Row>(env,'SELECT q.*,p.name AS project_name FROM atelier_questions q LEFT JOIN projects p ON p.id=q.project_id WHERE q.id=? AND q.user_id=?',id,user);if(!r)fail(404,'Cette question est introuvable ou ne vous appartient pas.');return r;}
workbench.get('/questions',async c=>{
 const user=userId(c),project=await projectOrNull(c.env,user,c.req.query('project')),status=c.req.query('status')||'open';
 const rows=await many<Row>(c.env,"SELECT q.*,p.name AS project_name FROM atelier_questions q LEFT JOIN projects p ON p.id=q.project_id WHERE q.user_id=? AND (? IS NULL OR q.project_id=?) AND (?='all' OR q.status=?) ORDER BY q.status='open' DESC,q.priority,COALESCE(p.name,''),q.theme,q.updated_at DESC LIMIT 300",user,project,project,status,status);
 return c.json({items:rows.map(questionView)});
});
workbench.get('/questions/export',async c=>{
 const user=userId(c),rows=(await many<Row>(c.env,'SELECT q.*,p.name AS project_name FROM atelier_questions q LEFT JOIN projects p ON p.id=q.project_id WHERE q.user_id=? ORDER BY q.created_at LIMIT 1000',user)).map(questionView);
 if(c.req.query('format')==='csv')return new Response(questionsCsv(rows.map(r=>({id:r.id,project:r.project_name||'Général',theme:r.theme,question:r.question,status:r.status,answer:r.answer_text,answered_at:r.answered_at}))),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="questions-atelier.csv"','Cache-Control':'no-store'}});
 return c.json({format:'atelier-questions-v1',exported_at:now(),questions:rows});
});
workbench.post('/questions',async c=>{
 const user=userId(c),d=questionInput.partial().required({question:true}).parse(await jsonBody(c));
 const project=await projectOrNull(c.env,user,d.project_id),scope=project||'general',key=questionKey(d.question);
 if(!key)fail(400,'La question est trop courte pour être comparée aux précédentes.');
 for(const t of d.blocked_task_ids||[]){if(!project||!await one(c.env,'SELECT id FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',t,user,project))fail(400,'Une tâche bloquée n’appartient pas à ce projet.');}
 // Ne jamais reposer une question déjà posée dans le même périmètre : on renvoie l'existante et sa réponse.
 const existing=await one<Row>(c.env,'SELECT q.*,p.name AS project_name FROM atelier_questions q LEFT JOIN projects p ON p.id=q.project_id WHERE q.user_id=? AND q.scope_key=? AND q.dedupe_key=?',user,scope,key);
 if(existing)return c.json({error:existing.status==='answered'?'Cette question a déjà reçu une réponse : elle n’est pas reposée.':'Cette question existe déjà.',existing:questionView(existing)},409);
 const id=uid(),at=now();
 await run(c.env,'INSERT INTO atelier_questions(id,user_id,project_id,scope_key,theme,question,dedupe_key,reason,if_unanswered,sources_consulted,options,multi,allow_free_text,allow_unknown,priority,blocked_task_ids,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  id,user,project,scope,d.theme||'',d.question,key,d.reason||'',d.if_unanswered||'',d.sources_consulted||'',JSON.stringify(d.options||[]),Number(d.multi||false),Number(d.allow_free_text??true),Number(d.allow_unknown??true),d.priority||2,JSON.stringify(d.blocked_task_ids||[]),at,at);
 await event(c.env,user,'question_created','Question : '+d.question.slice(0,160),project);
 return c.json(questionView(await questionRow(c.env,user,id)),201);
});
const answerInput=z.object({selected:z.array(z.number().int().min(0).max(7)).max(8).default([]),text:z.string().max(4000).default(''),unknown:z.boolean().default(false),create_decision:z.boolean().default(false)});
async function answerQuestion(env:Env,user:string,id:string,d:z.infer<typeof answerInput>){
 const q=await questionRow(env,user,id),v=questionView(q);
 if(q.status==='withdrawn')fail(409,'Cette question a été retirée.');
 if(d.selected.some(i=>i>=v.options.length))fail(400,'Option inconnue.');
 if(!v.multi&&d.selected.length>1)fail(400,'Une seule option est attendue.');
 if(d.unknown&&!v.allow_unknown)fail(400,'« Je ne sais pas » n’est pas proposé pour cette question.');
 if(d.text.trim()&&!v.allow_free_text&&!d.selected.length)fail(400,'Choisissez une des options proposées.');
 if(!d.selected.length&&!d.text.trim()&&!d.unknown)fail(400,'Choisissez une option, écrivez une réponse ou indiquez « Je ne sais pas ».');
 const found=secretFindings(d.text);if(found.length)fail(400,'La réponse contient ce qui ressemble à un secret ('+found.join(', ')+') : retirez-le.');
 const answer={selected:d.selected,text:d.text.trim(),unknown:d.unknown},at=now();
 let decisionId:string|null=q.decision_id;
 // Une réponse de Martin peut devenir une décision validée : c'est une source utilisateur explicite. Jamais pour « Je ne sais pas ».
 if(d.create_decision&&q.project_id&&!d.unknown&&!decisionId){
  decisionId=uid();
  await run(env,"INSERT INTO project_decisions(id,user_id,project_id,title,reason,status,source_kind,source_ref,decided_at,created_at,updated_at) VALUES(?,?,?,?,?,'validated','other',?,?,?,?)",decisionId,user,q.project_id,(q.question+' → '+answerText(answer,v.options)).slice(0,200),'Réponse de Martin à une question d’Atelier.','Question d’Atelier '+q.id.slice(0,8),at,at,at);
  await run(env,"INSERT INTO object_links(id,user_id,project_id,source_kind,source_id,source_label,excerpt,target_kind,target_id,relation,created_at) VALUES(?,?,?,'url',?,?,?,'decision',?,'source',?)",uid(),user,q.project_id,'question:'+q.id,'Question d’Atelier',answerText(answer,v.options).slice(0,2000),decisionId,at);
 }
 await run(env,"UPDATE atelier_questions SET status='answered',answer=?,answered_at=?,decision_id=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=?",JSON.stringify(answer),at,decisionId,at,q.id,user);
 await event(env,user,'question_answered','Réponse à : '+String(q.question).slice(0,140),q.project_id);
 return questionView(await questionRow(env,user,q.id));
}
workbench.post('/questions/answers',async c=>{
 // Réponses d'un questionnaire rempli hors ligne : chaque réponse est validée comme une réponse individuelle.
 const user=userId(c),d=z.object({answers:z.array(z.object({id:z.string().uuid()}).and(answerInput)).min(1).max(100)}).parse(await jsonBody(c));
 const done:string[]=[],errors:{id:string;error:string}[]=[];
 for(const a of d.answers){try{await answerQuestion(c.env,user,a.id,a);done.push(a.id);}catch(e:any){errors.push({id:a.id,error:e?.message||'Réponse refusée.'});}}
 return c.json({answered:done.length,errors});
});
workbench.post('/questions/:id/answer',async c=>c.json(await answerQuestion(c.env,userId(c),c.req.param('id'),answerInput.parse(await jsonBody(c)))));
workbench.patch('/questions/:id',async c=>{
 const user=userId(c),d=questionInput.omit({project_id:true,question:true}).partial().extend({status:z.enum(['open','withdrawn']).optional(),revision:z.number().int()}).parse(await jsonBody(c));
 const q=await questionRow(c.env,user,c.req.param('id'));
 if(q.status==='answered'&&d.status!=='open')fail(409,'Une question répondue ne se modifie pas : rouvrez-la d’abord (la réponse reste dans le journal).');
 const r=await run(c.env,'UPDATE atelier_questions SET theme=?,reason=?,if_unanswered=?,sources_consulted=?,options=?,multi=?,allow_free_text=?,allow_unknown=?,priority=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?',
  d.theme??q.theme,d.reason??q.reason,d.if_unanswered??q.if_unanswered,d.sources_consulted??q.sources_consulted,d.options?JSON.stringify(d.options):q.options,d.multi===undefined?q.multi:Number(d.multi),d.allow_free_text===undefined?q.allow_free_text:Number(d.allow_free_text),d.allow_unknown===undefined?q.allow_unknown:Number(d.allow_unknown),d.priority??q.priority,d.status??q.status,now(),q.id,user,d.revision);
 if(!r.meta.changes)fail(409,'Cette question a changé sur un autre appareil. Rechargez-la.');
 if(d.status&&d.status!==q.status)await event(c.env,user,'question_'+d.status,(d.status==='open'?'Question rouverte : ':'Question retirée : ')+String(q.question).slice(0,140)+(q.status==='answered'?' (ancienne réponse : '+questionView(q).answer_text.slice(0,200)+')':''),q.project_id);
 return c.json(questionView(await questionRow(c.env,user,q.id)));
});

/* ───────── Discussions organisées ───────── */
workbench.get('/categories',c=>c.json({items:CONVERSATION_CATEGORIES}));
workbench.get('/conversations',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.query('project')||'',user),{limit,offset}=page(c);
 const status=c.req.query('status')||'all',category=c.req.query('category')||'',q=c.req.query('q')||'';
 const rows=await many<Row>(c.env,"SELECT c.id,c.title,c.parent_id,c.category,c.status,c.objective,c.pinned,c.summary,c.summary_updated_at,c.created_at,c.updated_at,(SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.user_id=c.user_id) AS message_count,(SELECT GROUP_CONCAT(DISTINCT m.provider) FROM messages m WHERE m.conversation_id=c.id AND m.user_id=c.user_id AND m.provider IS NOT NULL) AS providers,(SELECT COUNT(*) FROM object_links l WHERE l.user_id=c.user_id AND l.project_id=c.project_id AND l.source_kind='message' AND l.source_id IN (SELECT id FROM messages WHERE conversation_id=c.id)) AS linked_objects FROM conversations c WHERE c.user_id=? AND c.project_id=? AND (?='all' OR c.status=?) AND (?='' OR c.category=?) AND (?='' OR c.title LIKE ? ESCAPE '\\' OR c.objective LIKE ? ESCAPE '\\') ORDER BY c.pinned DESC,c.updated_at DESC,c.id LIMIT ? OFFSET ?",
  user,p.id,status,status,category,category,q,like(q),like(q),limit,offset);
 return c.json({items:rows,limit,offset});
});
workbench.patch('/conversations/:id',async c=>{
 const user=userId(c),conv=await owned(c.env,'conversations',c.req.param('id'),user);
 const d=z.object({title:z.string().trim().min(1).max(120).optional(),category:z.string().trim().max(40).nullable().optional(),status:z.enum(['active','to_resume','waiting','archived']).optional(),objective:z.string().max(500).optional(),pinned:z.boolean().optional(),summary:z.string().max(6000).optional()}).parse(await jsonBody(c));
 // L'archivage et le classement ne touchent jamais aux messages.
 await run(c.env,'UPDATE conversations SET title=?,category=?,status=?,objective=?,pinned=?,summary=?,summary_updated_at=? WHERE id=? AND user_id=?',d.title??conv.title,d.category===undefined?conv.category:(d.category||null),d.status??conv.status,d.objective??conv.objective,d.pinned===undefined?conv.pinned:Number(d.pinned),d.summary??conv.summary,d.summary===undefined?conv.summary_updated_at:now(),conv.id,user);
 if(d.status&&d.status!==conv.status)await event(c.env,user,'conversation_status','Discussion « '+conv.title+' » : '+d.status,conv.project_id);
 return c.json(await owned(c.env,'conversations',conv.id,user));
});
workbench.get('/search',async c=>{
 // Recherche dans les messages du projet courant uniquement ; chaque résultat ouvre le message exact.
 const user=userId(c),p=await owned(c.env,'projects',c.req.query('project')||'',user),q=(c.req.query('q')||'').trim(),{limit}=page(c);
 if(q.length<2)return c.json({items:[],query:q});
 const role=c.req.query('role')||'',provider=c.req.query('provider')||'',from=c.req.query('from')||'',before=Number(c.req.query('before')||Number.MAX_SAFE_INTEGER);
 const rows=await many<Row>(c.env,"SELECT m.id,m.seq,m.role,m.provider,m.model,m.created_at,m.conversation_id,c.title AS conversation_title,c.status AS conversation_status,c.category,m.content FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.user_id=? AND c.user_id=? AND c.project_id=? AND m.content LIKE ? ESCAPE '\\' AND (?='' OR m.role=?) AND (?='' OR m.provider=?) AND (?='' OR m.created_at>=?) AND m.seq<? ORDER BY m.seq DESC LIMIT ?",
  user,user,p.id,like(q),role,role,provider,provider,from,from,before,limit+1);
 const items=rows.slice(0,limit).map(r=>{const i=String(r.content).toLowerCase().indexOf(q.toLowerCase()),start=Math.max(0,i-80);return {id:r.id,seq:r.seq,role:r.role,provider:r.provider,model:r.model,created_at:r.created_at,conversation_id:r.conversation_id,conversation_title:r.conversation_title,conversation_status:r.conversation_status,category:r.category,project_id:p.id,project_name:p.name,excerpt:(start>0?'…':'')+String(r.content).slice(start,start+240)+(String(r.content).length>start+240?'…':'')};});
 return c.json({items,next:rows.length>limit?rows[limit-1].seq:null,query:q});
});
async function messageOf(env:Env,user:string,id:string){
 const m=await one<Row>(env,'SELECT m.id,m.seq,m.role,m.provider,m.model,m.content,m.created_at,m.conversation_id,c.project_id,c.title AS conversation_title FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=? AND m.user_id=? AND c.user_id=?',id,user,user);
 if(!m)fail(404,'Ce message est introuvable ou ne vous appartient pas.');return m;
}
workbench.get('/messages/:id',async c=>{const m=await messageOf(c.env,userId(c),c.req.param('id'));return c.json(m);});
workbench.get('/conversations/:id/links',async c=>{
 const user=userId(c),conv=await owned(c.env,'conversations',c.req.param('id'),user);
 const links=await many<Row>(c.env,'SELECT l.id,l.note,l.created_at,l.from_id,l.to_id,a.title AS from_title,b.title AS to_title FROM conversation_links l JOIN conversations a ON a.id=l.from_id JOIN conversations b ON b.id=l.to_id WHERE l.user_id=? AND (l.from_id=? OR l.to_id=?) ORDER BY l.created_at DESC',user,conv.id,conv.id);
 const parent=conv.parent_id?await one<Row>(c.env,'SELECT id,title FROM conversations WHERE id=? AND user_id=?',conv.parent_id,user):null;
 const children=await many<Row>(c.env,'SELECT id,title FROM conversations WHERE parent_id=? AND user_id=? ORDER BY created_at',conv.id,user);
 const objects=await many<Row>(c.env,"SELECT l.id,l.target_kind,l.target_id,l.relation,l.excerpt,l.source_id,l.created_at FROM object_links l WHERE l.user_id=? AND l.project_id=? AND l.source_kind='message' AND l.source_id IN (SELECT id FROM messages WHERE conversation_id=? AND user_id=?) ORDER BY l.created_at DESC LIMIT 100",user,conv.project_id,conv.id,user);
 return c.json({links:links.map(l=>({id:l.id,note:l.note,created_at:l.created_at,other_id:l.from_id===conv.id?l.to_id:l.from_id,other_title:l.from_id===conv.id?l.to_title:l.from_title})),parent,children,objects});
});
workbench.post('/conversations/:id/links',async c=>{
 const user=userId(c),conv=await owned(c.env,'conversations',c.req.param('id'),user),d=z.object({to_id:z.string().uuid(),note:z.string().max(300).default('')}).parse(await jsonBody(c));
 const other=await owned(c.env,'conversations',d.to_id,user);
 if(other.project_id!==conv.project_id)fail(400,'Deux discussions liées doivent appartenir au même projet.');
 if(other.id===conv.id)fail(400,'Une discussion ne se lie pas à elle-même.');
 if(await one(c.env,'SELECT id FROM conversation_links WHERE user_id=? AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))',user,conv.id,other.id,other.id,conv.id))fail(409,'Ces deux discussions sont déjà liées.');
 await run(c.env,'INSERT INTO conversation_links(id,user_id,project_id,from_id,to_id,note,created_at) VALUES(?,?,?,?,?,?,?)',uid(),user,conv.project_id,conv.id,other.id,d.note,now());
 return c.json({ok:true},201);
});
workbench.delete('/conversation-links/:id',async c=>{const r=await run(c.env,'DELETE FROM conversation_links WHERE id=? AND user_id=?',c.req.param('id'),userId(c));if(!r.meta.changes)fail(404,'Lien introuvable.');return c.json({ok:true});});
/** Réutiliser un extrait dans une autre discussion : citation figée + lien retour ; l'original n'est jamais modifié. */
workbench.post('/messages/:id/reuse',async c=>{
 const user=userId(c),m=await messageOf(c.env,user,c.req.param('id')),d=z.object({target_conversation_id:z.string().uuid(),excerpt:z.string().trim().min(1).max(4000)}).parse(await jsonBody(c));
 const target=await owned(c.env,'conversations',d.target_conversation_id,user);
 if(target.project_id!==m.project_id)fail(400,'Un extrait ne se réutilise que dans une discussion du même projet.');
 if(target.id===m.conversation_id)fail(400,'Choisissez une autre discussion que celle du message.');
 if(!String(m.content).includes(d.excerpt))fail(400,'L’extrait doit être un passage exact du message source.');
 const at=now(),noteId=uid(),linkId=uid();
 const note='Citation de la discussion « '+m.conversation_title+' » ('+(m.role==='user'?'vous':m.provider||m.role)+', '+m.created_at+') :\n\n> '+d.excerpt.replace(/\n/g,'\n> ')+'\n\n[source : message '+m.id+']';
 await c.env.DB.batch([
  c.env.DB.prepare("INSERT INTO messages(id,user_id,conversation_id,role,content,created_at) VALUES(?,?,?,'note',?,?)").bind(noteId,user,target.id,note,at),
  c.env.DB.prepare("INSERT INTO object_links(id,user_id,project_id,source_kind,source_id,source_label,excerpt,excerpt_hash,target_kind,target_id,relation,created_at) VALUES(?,?,?,'message',?,?,?,?,'conversation',?,'reuse',?)").bind(linkId,user,m.project_id,m.id,m.conversation_title,d.excerpt,await sha256Hex(d.excerpt),target.id,at),
  c.env.DB.prepare('UPDATE conversations SET updated_at=? WHERE id=? AND user_id=?').bind(at,target.id,user)
 ]);
 return c.json({note_id:noteId,link_id:linkId},201);
});

/* ───────── Liens de provenance et extraction candidate ───────── */
const TARGET_TABLE:Record<string,string>={decision:'project_decisions',plan_task:'plan_tasks',question:'atelier_questions',action:'martin_actions',prompt:'prompts',conversation:'conversations',handoff:'handoff_packages',document:'project_documents'};
async function checkTarget(env:Env,user:string,project:string,kind:string,id:string){
 const table=TARGET_TABLE[kind];if(!table)fail(400,'Type de cible inconnu.');
 const row=await one<Row>(env,`SELECT id,project_id FROM ${table} WHERE id=? AND user_id=?`,id,user);
 if(!row||row.project_id!==project)fail(400,'La cible du lien n’appartient pas à ce projet.');
}
async function sourceOf(env:Env,user:string,project:string,kind:string,id:string):Promise<{label:string;content:string|null}>{
 if(kind==='message'){const m=await messageOf(env,user,id);if(m.project_id!==project)fail(400,'Ce message appartient à un autre projet.');return {label:m.conversation_title+' · '+m.created_at,content:m.content};}
 if(kind==='conversation'){const cv=await owned(env,'conversations',id,user);if(cv.project_id!==project)fail(400,'Cette discussion appartient à un autre projet.');return {label:cv.title,content:null};}
 if(kind==='file'){const f=await owned(env,'files',id,user);if(f.project_id!==project)fail(400,'Ce fichier appartient à un autre projet.');return {label:f.name,content:null};}
 if(kind==='memory_doc'){const d=await one<Row>(env,'SELECT path,indexed_commit FROM memory_docs WHERE id=? AND user_id=?',id,user);if(!d)fail(400,'Ce document du référentiel est introuvable.');return {label:d.path+' @ '+String(d.indexed_commit).slice(0,8),content:null};}
 if(kind==='url'){if(!/^https:\/\/[^\s]{4,400}$/.test(id))fail(400,'L’adresse doit commencer par https://.');return {label:id,content:null};}
 fail(400,'Type de source inconnu.');
}
const linkInput=z.object({project_id:z.string().uuid(),source_kind:z.enum(['message','conversation','memory_doc','file','url']),source_id:z.string().min(1).max(400),excerpt:z.string().max(4000).default(''),target_kind:z.enum(['decision','plan_task','question','action','prompt','conversation','handoff','document']),target_id:z.string().uuid(),relation:z.enum(['source','citation','reuse']).default('source')});
async function createLink(env:Env,user:string,d:z.infer<typeof linkInput>){
 const p=await owned(env,'projects',d.project_id,user);await checkTarget(env,user,p.id,d.target_kind,d.target_id);
 const src=await sourceOf(env,user,p.id,d.source_kind,d.source_id);
 if(d.excerpt&&src.content!==null&&!src.content.includes(d.excerpt))fail(400,'L’extrait doit être un passage exact de la source.');
 const id=uid();
 await run(env,'INSERT INTO object_links(id,user_id,project_id,source_kind,source_id,source_label,excerpt,excerpt_hash,target_kind,target_id,relation,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,user,p.id,d.source_kind,d.source_id,src.label.slice(0,300),d.excerpt,d.excerpt?await sha256Hex(d.excerpt):null,d.target_kind,d.target_id,d.relation,now());
 return id;
}
workbench.post('/links',async c=>c.json({id:await createLink(c.env,userId(c),linkInput.parse(await jsonBody(c)))},201));
workbench.get('/links',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.query('project')||'',user),tk=c.req.query('target_kind')||'',ti=c.req.query('target_id')||'',sk=c.req.query('source_kind')||'',si=c.req.query('source_id')||'';
 return c.json({items:await many<Row>(c.env,"SELECT id,source_kind,source_id,source_label,excerpt,target_kind,target_id,relation,created_at FROM object_links WHERE user_id=? AND project_id=? AND (?='' OR target_kind=?) AND (?='' OR target_id=?) AND (?='' OR source_kind=?) AND (?='' OR source_id=?) ORDER BY created_at DESC LIMIT 200",user,p.id,tk,tk,ti,ti,sk,sk,si,si)});
});
workbench.delete('/links/:id',async c=>{const r=await run(c.env,'DELETE FROM object_links WHERE id=? AND user_id=?',c.req.param('id'),userId(c));if(!r.meta.changes)fail(404,'Lien introuvable.');return c.json({ok:true});});
/** D'un message vers un objet candidat. Une décision créée ici est TOUJOURS « proposée » : seule une validation de Martin la rend active. */
workbench.post('/messages/:id/extract',async c=>{
 const user=userId(c),m=await messageOf(c.env,user,c.req.param('id'));
 const d=z.object({kind:z.enum(['decision','question','action','plan_task']),title:z.string().trim().min(3).max(200),excerpt:z.string().trim().min(1).max(4000),reason:z.string().max(1000).default('')}).parse(await jsonBody(c));
 if(!String(m.content).includes(d.excerpt))fail(400,'L’extrait doit être un passage exact du message source.');
 const at=now(),id=uid(),ref='Discussion « '+m.conversation_title+' », message du '+m.created_at;
 if(d.kind==='decision')await run(c.env,"INSERT INTO project_decisions(id,user_id,project_id,title,reason,status,source_kind,source_ref,created_at,updated_at) VALUES(?,?,?,?,?,'proposed','message',?,?,?)",id,user,m.project_id,d.title,d.reason,ref.slice(0,300),at,at);
 else if(d.kind==='plan_task')await run(c.env,"INSERT INTO plan_tasks(id,user_id,project_id,title,objective,context,conversation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",id,user,m.project_id,d.title,d.reason,'Source : '+ref,m.conversation_id,at,at);
 else if(d.kind==='action')await run(c.env,"INSERT INTO martin_actions(id,user_id,project_id,title,why,source_ref,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,'user',?,?)",id,user,m.project_id,d.title,d.reason,ref.slice(0,300),at,at);
 else{
  const key=questionKey(d.title);const existing=await one<Row>(c.env,'SELECT q.*,p.name AS project_name FROM atelier_questions q LEFT JOIN projects p ON p.id=q.project_id WHERE q.user_id=? AND q.scope_key=? AND q.dedupe_key=?',user,m.project_id,key);
  if(existing)return c.json({error:'Cette question existe déjà.',existing:questionView(existing)},409);
  await run(c.env,'INSERT INTO atelier_questions(id,user_id,project_id,scope_key,question,dedupe_key,reason,sources_consulted,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,user,m.project_id,m.project_id,d.title,key,d.reason,ref,at,at);
 }
 const link=await createLink(c.env,user,{project_id:m.project_id,source_kind:'message',source_id:m.id,excerpt:d.excerpt,target_kind:d.kind,target_id:id,relation:'source'});
 await event(c.env,user,'extracted',(d.kind==='decision'?'Décision proposée':d.kind==='plan_task'?'Tâche':d.kind==='action'?'Action':'Question')+' créée depuis un message : '+d.title,m.project_id);
 return c.json({id,kind:d.kind,link_id:link,status:d.kind==='decision'?'proposed':'created'},201);
});

/* ───────── Plan : détails de développement et validation réelle ───────── */
workbench.patch('/tasks/:id/details',async c=>{
 const user=userId(c),d=z.object({context:z.string().max(4000).optional(),files_hint:z.string().max(2000).optional(),tests:z.string().max(2000).optional(),risks:z.string().max(2000).optional()}).parse(await jsonBody(c));
 const t=await owned(c.env,'plan_tasks',c.req.param('id'),user);
 await run(c.env,'UPDATE plan_tasks SET context=?,files_hint=?,tests=?,risks=?,updated_at=? WHERE id=? AND user_id=?',d.context??t.context,d.files_hint??t.files_hint,d.tests??t.tests,d.risks??t.risks,now(),t.id,user);
 return c.json(await owned(c.env,'plan_tasks',t.id,user));
});
workbench.post('/tasks/:id/validate',async c=>{
 const user=userId(c),d=z.object({validated:z.boolean()}).parse(await jsonBody(c)),t=await owned(c.env,'plan_tasks',c.req.param('id'),user);
 if(d.validated&&(t.status!=='done'||!String(t.proof||'').trim()))fail(409,'Seule une tâche terminée avec une preuve peut être validée.');
 await run(c.env,'UPDATE plan_tasks SET validated_at=?,updated_at=? WHERE id=? AND user_id=?',d.validated?now():null,now(),t.id,user);
 await event(c.env,user,'task_validated',(d.validated?'Validée par Martin : ':'Validation retirée : ')+t.title,t.project_id);
 return c.json(await owned(c.env,'plan_tasks',t.id,user));
});

/* ───────── Documents de référence par projet (réutilise la bibliothèque et le référentiel mémoire) ───────── */
const docInput=z.object({title:z.string().trim().min(1).max(200),doc_type:z.enum(['vision','cahier','exigences','architecture','decisions','problemes','questions','reference','audit','rapport','consigne','test','autre']),
 source_kind:z.enum(['file','memory_doc','url']),file_id:z.string().uuid().nullable(),memory_doc_id:z.string().uuid().nullable(),url:z.string().max(400).nullable(),version_label:z.string().max(80),
 reliability:z.enum(['user_confirmed','verified','reported','deduced','ai_proposed','to_confirm','superseded','unverified']),origin:z.string().max(300),note:z.string().max(1000),task_id:z.string().uuid().nullable()});
async function checkDoc(env:Env,user:string,project:string,d:Partial<z.infer<typeof docInput>>){
 if(d.source_kind==='file'){if(!d.file_id)fail(400,'Choisissez un fichier de la bibliothèque.');const f=await owned(env,'files',d.file_id,user);if(f.project_id!==project)fail(400,'Ce fichier appartient à un autre projet.');}
 if(d.source_kind==='memory_doc'){if(!d.memory_doc_id||!await one(env,'SELECT id FROM memory_docs WHERE id=? AND user_id=?',d.memory_doc_id,user))fail(400,'Ce document du référentiel mémoire est introuvable.');}
 if(d.source_kind==='url'&&!/^https:\/\/[^\s]{4,400}$/.test(d.url||''))fail(400,'L’adresse doit commencer par https://.');
 if(d.task_id&&!await one(env,'SELECT id FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',d.task_id,user,project))fail(400,'Cette tâche n’appartient pas à ce projet.');
}
const DOC_SELECT="SELECT d.*,f.name AS file_name,f.current_version AS file_version,f.updated_at AS file_updated_at,(SELECT sha256 FROM file_versions v WHERE v.file_id=f.id AND v.version=f.current_version) AS file_sha256,m.path AS memory_path,m.blob_sha AS memory_blob_sha,m.indexed_commit AS memory_commit,m.present AS memory_present,r.full_name AS memory_repo,r.synced_at AS memory_synced_at FROM project_documents d LEFT JOIN files f ON f.id=d.file_id AND f.user_id=d.user_id LEFT JOIN memory_docs m ON m.id=d.memory_doc_id AND m.user_id=d.user_id LEFT JOIN memory_repos r ON r.id=m.repo_id";
workbench.get('/documents',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.query('project')||'',user);
 return c.json({items:await many<Row>(c.env,DOC_SELECT+' WHERE d.user_id=? AND d.project_id=? ORDER BY d.doc_type,d.updated_at DESC',user,p.id)});
});
workbench.post('/documents',async c=>{
 const user=userId(c),body=z.object({project_id:z.string().uuid()}).passthrough().parse(await jsonBody(c)),p=await owned(c.env,'projects',body.project_id,user);
 const d=docInput.partial().required({title:true,source_kind:true}).parse(body);await checkDoc(c.env,user,p.id,d);
 const id=uid(),at=now();
 await run(c.env,'INSERT INTO project_documents(id,user_id,project_id,title,doc_type,source_kind,file_id,memory_doc_id,url,version_label,reliability,origin,note,task_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,user,p.id,d.title,d.doc_type||'reference',d.source_kind,d.source_kind==='file'?d.file_id:null,d.source_kind==='memory_doc'?d.memory_doc_id:null,d.source_kind==='url'?d.url:null,d.version_label||'',d.reliability||'unverified',d.origin||'',d.note||'',d.task_id??null,at,at);
 await event(c.env,user,'document_added','Document de référence : '+d.title,p.id);
 return c.json(await one(c.env,DOC_SELECT+' WHERE d.id=? AND d.user_id=?',id,user),201);
});
workbench.patch('/documents/:id',async c=>{
 const user=userId(c),cur=await one<Row>(c.env,'SELECT * FROM project_documents WHERE id=? AND user_id=?',c.req.param('id'),user);if(!cur)fail(404,'Document introuvable.');
 const d=docInput.pick({title:true,doc_type:true,version_label:true,reliability:true,origin:true,note:true}).partial().parse(await jsonBody(c));
 await run(c.env,'UPDATE project_documents SET title=?,doc_type=?,version_label=?,reliability=?,origin=?,note=?,updated_at=? WHERE id=? AND user_id=?',d.title??cur.title,d.doc_type??cur.doc_type,d.version_label??cur.version_label,d.reliability??cur.reliability,d.origin??cur.origin,d.note??cur.note,now(),cur.id,user);
 return c.json(await one(c.env,DOC_SELECT+' WHERE d.id=? AND d.user_id=?',cur.id,user));
});
workbench.delete('/documents/:id',async c=>{const r=await run(c.env,'DELETE FROM project_documents WHERE id=? AND user_id=?',c.req.param('id'),userId(c));if(!r.meta.changes)fail(404,'Document introuvable.');return c.json({ok:true});});

/* ───────── Journal et synthèse de reprise ───────── */
workbench.get('/journal',async c=>{
 const user=userId(c),project=await projectOrNull(c.env,user,c.req.query('project')),before=Number(c.req.query('before')||Number.MAX_SAFE_INTEGER),{limit}=page(c);
 const rows=await many<Row>(c.env,'SELECT e.seq,e.kind,e.detail,e.created_at,e.project_id,p.name AS project_name FROM events e LEFT JOIN projects p ON p.id=e.project_id AND p.user_id=e.user_id WHERE e.user_id=? AND (? IS NULL OR e.project_id=?) AND e.seq<? ORDER BY e.seq DESC LIMIT ?',user,project,project,before,limit+1);
 return c.json({items:rows.slice(0,limit),next:rows.length>limit?rows[limit-1].seq:null});
});
workbench.get('/resume',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.query('project')||'',user);
 const g=await guideInputs(c.env,user,p.id,null),profile=await profileOf(c.env,user,p.id),repos=await repositoriesOf(c.env,user,p.id);
 const phase=profile?.current_phase_id?await one<Row>(c.env,'SELECT title FROM plan_phases WHERE id=? AND user_id=? AND project_id=?',profile.current_phase_id,user,p.id):null;
 const decisions=await many<Row>(c.env,"SELECT id,title,status,source_ref FROM project_decisions WHERE user_id=? AND project_id=? AND status IN ('validated','proposed') ORDER BY updated_at DESC LIMIT 60",user,p.id);
 const questions=await many<Row>(c.env,"SELECT id,question FROM atelier_questions WHERE user_id=? AND project_id=? AND status='open' ORDER BY priority,updated_at LIMIT 40",user,p.id);
 const actions=await many<Row>(c.env,"SELECT id,title,blocking FROM martin_actions WHERE user_id=? AND project_id=? AND status='open' ORDER BY blocking DESC,updated_at LIMIT 40",user,p.id);
 const documents=await many<Row>(c.env,'SELECT title,doc_type,reliability FROM project_documents WHERE user_id=? AND project_id=? ORDER BY doc_type LIMIT 40',user,p.id);
 const step=await firstStep(c.env,user,p.id,nextAction(g.input));
 const text=resumeText({project:p.name,objective:profile?.objective||'',state:PROJECT_STATE[profile?.state||'active'],phase:phase?.title||null,generatedAt:now(),
  repositories:repos.map(r=>({full_name:r.full_name,branch:r.default_branch||r.branch,head_sha:r.head_sha,verified:Boolean(r.verified_at)})),progress:progressDetail(g.rows as any[]),
  decisions:decisions as any[],questions:questions as any[],actions:actions.map(a=>({id:a.id,title:a.title,blocking:Boolean(a.blocking)})),
  tasks:g.rows.map(t=>({id:t.id,title:t.title,status:t.status,owner:t.owner,next_action:t.next_action,blocking_question:t.blocking_question})),nextAction:{title:step.title,do:step.do},documents:documents as any[]});
 return c.json({text,content_hash:await sha256Hex(text)});
});
