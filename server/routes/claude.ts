/* Pilotage du travail avec Claude : conseil de modèle, relevés de quota saisis par l'utilisateur, retours de travail, points de reprise.
   Atelier ne mesure aucun quota : chaque valeur affichée a été saisie ou collée par l'utilisateur, avec sa source. */
import {Hono} from 'hono';import {z} from 'zod';
import {event,fail,jsonBody,many,now,one,owned,run,uid,userId} from '../core.ts';
import {COMPLEXITIES,IMPORTANCES,QUOTA_SCOPES,REPORT_TEMPLATE,VERIFICATION_LABEL,WORK_KINDS,adviceLine,checkpointGaps,checkpointText,parseStatusline,parseWorkReport,readingState,recommend,triggeredAlerts,type Advice,type AdviceInput,type Reading} from '../claude-advisor.ts';
import {secretFindings} from '../handoff-core.ts';
import type {AppEnv,Env,Row} from '../types.ts';
export const claude=new Hono<AppEnv>();
const t=(n:number)=>z.string().max(n);
const FAMILIES=['all','haiku','sonnet','opus','fable','other'] as const,WORK_FAMILIES=['haiku','sonnet','opus','fable','other'] as const;
const iso=z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/);
const toIso=(v:string)=>{const d=new Date(v);if(Number.isNaN(d.getTime()))fail(400,'Date illisible.');return d.toISOString();};
const notFuture=(v:string,what:string)=>{const d=toIso(v);if(d>new Date(Date.now()+5*60000).toISOString())fail(400,what+' ne peut pas être dans le futur.');return d;};
const noSecret=(...texts:string[])=>{for(const x of texts)if(x&&secretFindings(x).length)fail(400,'Ce texte semble contenir une clé ou un mot de passe : retirez-le avant d’enregistrer.');};
const projectOrNull=async(env:Env,user:string,id:string|null|undefined)=>id?(await owned<Row>(env,'projects',id,user)).id as string:null;
async function taskIn(env:Env,user:string,project:string|null,task:string|null|undefined){if(!task)return null;const r=await owned<Row>(env,'plan_tasks',task,user);if(project&&r.project_id!==project)fail(400,'Cette tâche appartient à un autre projet.');return r;}

/* ---------- Conseil ---------- */
const adviceInput=z.object({kind:z.enum(WORK_KINDS).or(z.literal('')).optional(),complexity:z.enum(COMPLEXITIES).or(z.literal('')).optional(),importance:z.enum(IMPORTANCES).or(z.literal('')).optional(),
 failed_attempts:z.number().int().min(0).max(99).optional(),failure_analysed:z.boolean().optional(),files_count:z.number().int().min(0).max(5000).optional(),whole_repo:z.boolean().optional(),
 has_tests:z.boolean().optional(),has_objective:z.boolean().optional(),has_acceptance:z.boolean().optional(),has_files:z.boolean().optional(),haiku_available:z.boolean().optional()});
const adviceView=(a:Advice)=>({...a,line:adviceLine(a),verification_label:VERIFICATION_LABEL[a.verification],basis:'Règles tirées de votre stratégie du 12 novembre 2026. Ce n’est pas une mesure des modèles.'});
export const countFiles=(hint:string)=>new Set((String(hint||'').match(/[\w./-]+\.[A-Za-z0-9]{1,6}\b/g)||[])).size;
export function taskAdviceInput(task:Row):AdviceInput{return {kind:task.work_kind||'',complexity:task.complexity||'',importance:task.importance||'',failed_attempts:task.failed_attempts||0,failure_analysed:Boolean(task.failure_analysed),
 files_count:countFiles(task.files_hint),has_files:Boolean(String(task.files_hint||'').trim()),has_tests:Boolean(String(task.tests||'').trim()),has_objective:Boolean(String(task.objective||'').trim()),has_acceptance:Boolean(String(task.acceptance||'').trim())};}
claude.post('/advise',async c=>c.json(adviceView(recommend(adviceInput.parse(await jsonBody(c))))));
claude.get('/tasks/:id/advice',async c=>{const task=await owned<Row>(c.env,'plan_tasks',c.req.param('id'),userId(c));return c.json(adviceView(recommend(taskAdviceInput(task))));});
claude.patch('/tasks/:id/brief',async c=>{
 const user=userId(c),task=await owned<Row>(c.env,'plan_tasks',c.req.param('id'),user);
 const d=z.object({work_kind:z.enum(WORK_KINDS).or(z.literal('')),complexity:z.enum(COMPLEXITIES).or(z.literal('')),importance:z.enum(IMPORTANCES).or(z.literal('')),constraints_text:t(2000),do_not_touch:t(2000),already_verified:t(2000),difficulties:t(2000),
  failed_attempts:z.number().int().min(0).max(99),failure_analysed:z.boolean()}).partial().parse(await jsonBody(c));
 noSecret(d.constraints_text||'',d.do_not_touch||'',d.already_verified||'',d.difficulties||'');
 const v=<K extends keyof typeof d>(k:K)=>d[k]===undefined?task[k as string]:d[k];
 await run(c.env,'UPDATE plan_tasks SET work_kind=?,complexity=?,importance=?,constraints_text=?,do_not_touch=?,already_verified=?,difficulties=?,failed_attempts=?,failure_analysed=?,updated_at=? WHERE id=? AND user_id=?',
  v('work_kind'),v('complexity'),v('importance'),v('constraints_text'),v('do_not_touch'),v('already_verified'),v('difficulties'),v('failed_attempts'),d.failure_analysed===undefined?task.failure_analysed:d.failure_analysed?1:0,now(),task.id,user);
 const fresh=await owned<Row>(c.env,'plan_tasks',task.id,user);return c.json({task:fresh,advice:adviceView(recommend(taskAdviceInput(fresh)))});
});

/* ---------- Relevés de quota ---------- */
const readingInput=z.object({scope:z.enum(QUOTA_SCOPES),model_family:z.enum(FAMILIES).default('all'),used_percent:z.number().min(0).max(100).nullable(),resets_at:iso.nullable().default(null),
 source:z.enum(['usage_screen','screenshot','declared']),evidence_name:t(200).nullable().default(null),evidence_sha256:z.string().regex(/^[0-9a-f]{64}$/).nullable().default(null),note:t(500).default(''),observed_at:iso.optional()});
async function insertReading(env:Env,user:string,r:{scope:string;model_family:string;used_percent:number|null;resets_at:string|null;source:string;evidence_name?:string|null;evidence_sha256?:string|null;note?:string;observed_at:string}){
 const id=uid();await run(env,'INSERT INTO quota_readings(id,user_id,scope,model_family,used_percent,resets_at,source,evidence_name,evidence_sha256,note,observed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,user,r.scope,r.model_family,r.used_percent,r.resets_at,r.source,r.evidence_name||null,r.evidence_sha256||null,r.note||'',r.observed_at,now());return id;}
claude.get('/quotas',async c=>{
 const user=userId(c),at=now();
 const rows=await many<Row>(c.env,'SELECT q.* FROM quota_readings q WHERE q.user_id=? ORDER BY q.observed_at DESC,q.created_at DESC LIMIT 120',user);
 const seen=new Set<string>(),latest=[];for(const r of rows){const k=r.scope+'|'+r.model_family;if(seen.has(k))continue;seen.add(k);latest.push({id:r.id,note:r.note,evidence_name:r.evidence_name||null,evidence_sha256:r.evidence_sha256||null,...readingState(r as unknown as Reading,at)});}
 const rules=(await many<Row>(c.env,'SELECT scope,model_family,threshold,enabled FROM quota_alerts WHERE user_id=? ORDER BY scope,model_family',user)).map(r=>({scope:r.scope,model_family:r.model_family,threshold:r.threshold,enabled:Boolean(r.enabled)}));
 const since=new Date(Date.now()-30*86400000).toISOString();
 const byModel=await many<Row>(c.env,"SELECT model_family,COUNT(*) AS sessions,SUM(CASE WHEN usage_source!='none' THEN 1 ELSE 0 END) AS with_usage,SUM(cost_usd) AS cost_usd,SUM(output_tokens) AS output_tokens FROM work_sessions WHERE user_id=? AND worked_at>=? GROUP BY model_family ORDER BY sessions DESC",user,since);
 const top=await many<Row>(c.env,"SELECT w.id,w.title,w.model_family,w.effort,w.cost_usd,w.output_tokens,w.usage_source,w.worked_at,p.name AS project_name FROM work_sessions w LEFT JOIN projects p ON p.id=w.project_id AND p.user_id=w.user_id WHERE w.user_id=? AND w.usage_source!='none' AND (w.cost_usd IS NOT NULL OR w.output_tokens IS NOT NULL) ORDER BY COALESCE(w.cost_usd,0) DESC,COALESCE(w.output_tokens,0) DESC LIMIT 8",user);
 return c.json({latest,history:rows.slice(0,60).map(r=>({id:r.id,scope:r.scope,model_family:r.model_family,used_percent:r.used_percent,resets_at:r.resets_at,source:r.source,observed_at:r.observed_at,note:r.note})),
  alerts:rules,triggered:triggeredAlerts(latest,rules),by_model:byModel,top,generated_at:at,
  truth:{measured:'Rien n’est mesuré par Atelier : Anthropic ne fournit pas d’accès automatique aux limites d’un abonnement pour une application tierce.',
   entered:'Chaque pourcentage ci-dessous a été saisi ou collé par vous ; sa source est indiquée.',cost:'Les coûts en dollars viennent de l’écran /usage de Claude Code : c’est une estimation au prix catalogue, pas une facture.'}});
});
claude.post('/quotas',async c=>{
 const user=userId(c),d=readingInput.parse(await jsonBody(c));
 if(d.used_percent===null&&!d.resets_at)fail(400,'Indiquez au moins un pourcentage ou une date de réinitialisation.');
 if(d.source==='screenshot'&&!(d.evidence_name&&d.evidence_sha256))fail(400,'Choisissez la capture d’écran : son nom et son empreinte servent de preuve.');
 if(d.source!=='screenshot'&&(d.evidence_name||d.evidence_sha256))fail(400,'Une capture ne se joint qu’à un relevé fait sur capture d’écran.');
 if(d.scope==='weekly_model'&&d.model_family==='all')fail(400,'Pour une limite par modèle, choisissez le modèle.');
 const id=await insertReading(c.env,user,{...d,resets_at:d.resets_at?toIso(d.resets_at):null,observed_at:d.observed_at?notFuture(d.observed_at,'La date du relevé'):now()});
 return c.json({id},201);
});
claude.post('/quotas/import-statusline',async c=>{
 const user=userId(c),d=z.object({json:z.string().min(2).max(20000)}).parse(await jsonBody(c)),p=parseStatusline(d.json,now());
 if(p.error)fail(400,p.error);
 for(const r of p.readings)await insertReading(c.env,user,{...r,source:'statusline_json',note:p.model?'Modèle de la session : '+p.model:''});
 return c.json({imported:p.readings.length,model:p.model,cost_usd:p.cost_usd},201);
});
claude.delete('/quotas/:id',async c=>{const r=await run(c.env,'DELETE FROM quota_readings WHERE id=? AND user_id=?',c.req.param('id'),userId(c));if(!r.meta.changes)fail(404,'Relevé introuvable.');return c.json({deleted:true});});
claude.put('/alerts',async c=>{
 const user=userId(c),d=z.object({alerts:z.array(z.object({scope:z.enum(QUOTA_SCOPES),model_family:z.enum(FAMILIES),threshold:z.number().int().min(1).max(100),enabled:z.boolean()})).max(20)}).parse(await jsonBody(c));
 const keys=new Set(d.alerts.map(a=>a.scope+'|'+a.model_family));if(keys.size!==d.alerts.length)fail(400,'Deux alertes portent sur la même limite.');
 await run(c.env,'DELETE FROM quota_alerts WHERE user_id=?',user);
 for(const a of d.alerts)await run(c.env,'INSERT INTO quota_alerts(user_id,scope,model_family,threshold,enabled,updated_at) VALUES(?,?,?,?,?,?)',user,a.scope,a.model_family,a.threshold,a.enabled?1:0,now());
 return c.json({saved:d.alerts.length});
});

/* ---------- Retours de travail ---------- */
const sessionInput=z.object({project_id:z.string().uuid().nullable(),task_id:z.string().uuid().nullable(),prompt_id:z.string().uuid().nullable(),title:z.string().trim().min(1).max(200),model_family:z.enum(WORK_FAMILIES),model_label:t(80),
 effort:z.enum(['','low','medium','high','xhigh','max']),outcome:z.enum(['done','partial','failed']),changes:t(6000),files_modified:t(6000),tests_run:t(6000),results:t(6000),unresolved:t(6000),decisions:t(6000),next_steps:t(6000),
 usage_source:z.enum(['none','usage_screen','declared']),cost_usd:z.number().min(0).max(100000).nullable(),input_tokens:z.number().int().min(0).nullable(),output_tokens:z.number().int().min(0).nullable(),cache_read_tokens:z.number().int().min(0).nullable(),worked_at:iso});
const sessionView=(r:Row)=>({...r,user_id:undefined});
claude.get('/sessions/template',c=>c.json({template:REPORT_TEMPLATE}));
claude.post('/sessions/parse',async c=>c.json(parseWorkReport(z.object({text:z.string().max(60000)}).parse(await jsonBody(c)).text)));
claude.get('/sessions',async c=>{
 const user=userId(c),project=c.req.query('project'),task=c.req.query('task'),where=['w.user_id=?'],args:unknown[]=[user];
 if(project){await owned(c.env,'projects',project,user);where.push('w.project_id=?');args.push(project);}
 if(task){where.push('w.task_id=?');args.push(task);}
 return c.json({items:(await many<Row>(c.env,`SELECT w.*,p.name AS project_name,t.title AS task_title FROM work_sessions w LEFT JOIN projects p ON p.id=w.project_id AND p.user_id=w.user_id LEFT JOIN plan_tasks t ON t.id=w.task_id AND t.user_id=w.user_id WHERE ${where.join(' AND ')} ORDER BY w.worked_at DESC LIMIT 50`,...args)).map(sessionView)});
});
claude.post('/sessions',async c=>{
 const user=userId(c),d=sessionInput.partial().required({title:true,model_family:true}).parse(await jsonBody(c));
 const project=await projectOrNull(c.env,user,d.project_id),task=await taskIn(c.env,user,project,d.task_id);
 if(d.prompt_id)await owned(c.env,'prompts',d.prompt_id,user);
 const source=d.usage_source||'none',hasUsage=[d.cost_usd,d.input_tokens,d.output_tokens,d.cache_read_tokens].some(x=>x!==null&&x!==undefined);
 if(source==='none'&&hasUsage)fail(400,'Indiquez d’où vient la consommation saisie (écran /usage ou déclaration).');
 if(source!=='none'&&!hasUsage)fail(400,'Aucune consommation saisie : choisissez « non relevée ».');
 noSecret(d.changes||'',d.results||'',d.unresolved||'',d.decisions||'',d.next_steps||'',d.tests_run||'',d.files_modified||'');
 const id=uid(),at=now(),worked=d.worked_at?notFuture(d.worked_at,'La date du travail'):at,outcome=d.outcome||'done';
 await run(c.env,'INSERT INTO work_sessions(id,user_id,project_id,task_id,prompt_id,title,model_family,model_label,effort,outcome,changes,files_modified,tests_run,results,unresolved,decisions,next_steps,usage_source,cost_usd,input_tokens,output_tokens,cache_read_tokens,worked_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  id,user,project||task?.project_id||null,task?.id||null,d.prompt_id||null,d.title,d.model_family,d.model_label||'',d.effort||'',outcome,d.changes||'',d.files_modified||'',d.tests_run||'',d.results||'',d.unresolved||'',d.decisions||'',d.next_steps||'',source,d.cost_usd??null,d.input_tokens??null,d.output_tokens??null,d.cache_read_tokens??null,worked,at);
 // Un échec enregistré compte comme tentative échouée sur la tâche : l'analyse reste à faire, elle n'est jamais supposée.
 if(task&&outcome==='failed')await run(c.env,'UPDATE plan_tasks SET failed_attempts=MIN(99,failed_attempts+1),failure_analysed=0,updated_at=? WHERE id=? AND user_id=?',at,task.id,user);
 await event(c.env,user,'work_session','work.session.recorded','Retour de travail enregistré : '+d.title,id);
 return c.json(sessionView(await owned<Row>(c.env,'work_sessions',id,user)),201);
});
claude.delete('/sessions/:id',async c=>{const user=userId(c),r=await owned<Row>(c.env,'work_sessions',c.req.param('id'),user);await run(c.env,'DELETE FROM work_sessions WHERE id=? AND user_id=?',r.id,user);return c.json({deleted:true});});

/* ---------- Points de reprise ---------- */
const cpInput=z.object({project_id:z.string().uuid().nullable(),task_id:z.string().uuid().nullable(),conversation_id:z.string().uuid().nullable(),title:z.string().trim().min(1).max(200),objective:t(4000),done:t(6000),remaining:t(6000),decisions:t(6000),files_modified:t(6000),errors:t(6000),tests:t(6000),next_action:t(2000)});
const cpView=async(env:Env,user:string,r:Row)=>{const project=r.project_id?await one<Row>(env,'SELECT name FROM projects WHERE id=? AND user_id=?',r.project_id,user):null;
 const input={title:r.title,project:project?.name||null,objective:r.objective,done:r.done,remaining:r.remaining,decisions:r.decisions,files_modified:r.files_modified,errors:r.errors,tests:r.tests,next_action:r.next_action,updated_at:r.updated_at};
 return {...r,user_id:undefined,project_name:project?.name||null,text:checkpointText(input),gaps:checkpointGaps(input)};};
claude.get('/checkpoints',async c=>{
 const user=userId(c),project=c.req.query('project'),where=['user_id=?'],args:unknown[]=[user];if(project){await owned(c.env,'projects',project,user);where.push('project_id=?');args.push(project);}
 const rows=await many<Row>(c.env,`SELECT * FROM checkpoints WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT 40`,...args);const items=[];for(const r of rows)items.push(await cpView(c.env,user,r));return c.json({items});
});
/** Brouillon à partir de ce qui est déjà enregistré : tâches, décisions validées, dernier retour de travail. Rien n'est résumé par une IA. */
claude.get('/checkpoints/draft',async c=>{
 const user=userId(c),project=await owned<Row>(c.env,'projects',c.req.query('project')||'',user),taskId=c.req.query('task');
 const task=taskId?await taskIn(c.env,user,project.id,taskId):null;
 const tasks=await many<Row>(c.env,'SELECT title,status,proof,next_action FROM plan_tasks WHERE user_id=? AND project_id=? ORDER BY priority,position LIMIT 60',user,project.id);
 const decisions=await many<Row>(c.env,"SELECT title FROM project_decisions WHERE user_id=? AND project_id=? AND status='validated' ORDER BY updated_at DESC LIMIT 15",user,project.id);
 const last=await one<Row>(c.env,`SELECT * FROM work_sessions WHERE user_id=? AND project_id=? ${task?'AND task_id=?':''} ORDER BY worked_at DESC LIMIT 1`,...(task?[user,project.id,task.id]:[user,project.id]));
 const list=(rows:Row[])=>rows.map(r=>'- '+r.title+(r.proof?' (preuve : '+String(r.proof).slice(0,120)+')':'')).join('\n');
 return c.json({title:task?task.title:'Reprise de '+project.name,project_id:project.id,task_id:task?.id||null,objective:task?.objective||'',
  done:task?(last?.changes||''):list(tasks.filter(x=>x.status==='done')),remaining:task?(last?.next_steps||task.next_action||''):list(tasks.filter(x=>x.status!=='done'&&x.status!=='cancelled')),
  decisions:[decisions.map(d=>'- '+d.title).join('\n'),last?.decisions||''].filter(Boolean).join('\n'),files_modified:last?.files_modified||'',errors:last?.unresolved||'',tests:last?.tests_run||'',next_action:task?.next_action||'',
  basis:'Brouillon assemblé depuis les tâches, les décisions validées et le dernier retour de travail enregistrés. Relisez-le : Atelier ne sait pas ce qui s’est dit dans la session.'});
});
claude.post('/checkpoints',async c=>{
 const user=userId(c),d=cpInput.partial().required({title:true}).parse(await jsonBody(c));
 const project=await projectOrNull(c.env,user,d.project_id),task=await taskIn(c.env,user,project,d.task_id);
 if(d.conversation_id){const cv=await owned<Row>(c.env,'conversations',d.conversation_id,user);if(project&&cv.project_id!==project)fail(400,'Cette discussion appartient à un autre projet.');}
 noSecret(d.objective||'',d.done||'',d.remaining||'',d.decisions||'',d.files_modified||'',d.errors||'',d.tests||'',d.next_action||'');
 const id=uid(),at=now();
 await run(c.env,'INSERT INTO checkpoints(id,user_id,project_id,task_id,conversation_id,title,objective,done,remaining,decisions,files_modified,errors,tests,next_action,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)',
  id,user,project||task?.project_id||null,task?.id||null,d.conversation_id||null,d.title,d.objective||'',d.done||'',d.remaining||'',d.decisions||'',d.files_modified||'',d.errors||'',d.tests||'',d.next_action||'',at,at);
 await event(c.env,user,'checkpoint','checkpoint.created','Point de reprise créé : '+d.title,id);
 return c.json(await cpView(c.env,user,await owned<Row>(c.env,'checkpoints',id,user)),201);
});
claude.patch('/checkpoints/:id',async c=>{
 const user=userId(c),cur=await owned<Row>(c.env,'checkpoints',c.req.param('id'),user);
 const d=cpInput.omit({project_id:true,task_id:true,conversation_id:true}).partial().extend({revision:z.number().int()}).parse(await jsonBody(c));
 if(d.revision!==cur.revision)fail(409,'Ce point de reprise a été modifié ailleurs. Rechargez-le avant de l’enregistrer.');
 noSecret(d.objective||'',d.done||'',d.remaining||'',d.decisions||'',d.files_modified||'',d.errors||'',d.tests||'',d.next_action||'');
 const v=(k:string)=>(d as Record<string,unknown>)[k]===undefined?cur[k]:(d as Record<string,unknown>)[k];
 await run(c.env,'UPDATE checkpoints SET title=?,objective=?,done=?,remaining=?,decisions=?,files_modified=?,errors=?,tests=?,next_action=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?',
  v('title'),v('objective'),v('done'),v('remaining'),v('decisions'),v('files_modified'),v('errors'),v('tests'),v('next_action'),now(),cur.id,user,cur.revision);
 return c.json(await cpView(c.env,user,await owned<Row>(c.env,'checkpoints',cur.id,user)));
});
claude.delete('/checkpoints/:id',async c=>{const user=userId(c),r=await owned<Row>(c.env,'checkpoints',c.req.param('id'),user);await run(c.env,'DELETE FROM checkpoints WHERE id=? AND user_id=?',r.id,user);return c.json({deleted:true});});
