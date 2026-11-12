/* Bibliothèque de prompts versionnés. Une version transmise est verrouillée ; « Déjà donné » exige la confirmation de Martin
   avec la date réelle. Atelier ne prétend jamais avoir envoyé un prompt lui-même. */
import {Hono} from 'hono';import {z} from 'zod';
import {event,fail,jsonBody,many,now,one,owned,run,uid,userId} from '../core.ts';
import {PROMPT_LABEL,canSetStatus,cleanCommands,nextCode,parsePromptDocument,promptMarkdown,promptText,statusFromMeta,type PromptStatus} from '../prompt-core.ts';
import {secretFindings,sha256Hex} from '../handoff-core.ts';
import {devPrompt} from '../workbench-core.ts';
import {VERIFICATION_LABEL,adviceLine,recommend} from '../claude-advisor.ts';
import {taskAdviceInput} from './claude.ts';
import {memoryDocContent} from './memory-repo.ts';
import type {AppEnv,Env,Row} from '../types.ts';
export const prompts=new Hono<AppEnv>();
const t=(n:number)=>z.string().max(n);
const metaInput=z.object({project_id:z.string().uuid().nullable(),title:z.string().trim().min(1).max(200),subject:t(200),kind:z.enum(['framing','analysis','development','other']),recipient:t(120),provider:t(80),product:t(80),model:t(120),effort:t(80),
 objective:t(2000),justification:t(2000),prerequisites:t(2000),dependencies:t(2000),planned_send:t(60).nullable(),task_id:z.string().uuid().nullable(),conversation_id:z.string().uuid().nullable()});
const bodyInput=z.object({body:z.string().min(1).max(120000),commands:z.array(z.object({label:t(120).default(''),command:t(500),where_when:t(300).default('')})).max(10).default([])});
const like=(q:string)=>'%'+q.slice(0,120).replace(/[\\%_]/g,m=>'\\'+m)+'%';
async function mine(env:Env,user:string,id:string){const r=await one<Row>(env,'SELECT p.*,pr.name AS project_name FROM prompts p LEFT JOIN projects pr ON pr.id=p.project_id AND pr.user_id=p.user_id WHERE p.id=? AND p.user_id=?',id,user);if(!r)fail(404,'Ce prompt est introuvable ou ne vous appartient pas.');return r;}
const view=(r:Row)=>({...r,status_label:PROMPT_LABEL[r.status as PromptStatus]||r.status});
const versionView=(v:Row)=>{let commands:any[]=[];try{commands=JSON.parse(v.commands);}catch{/* commandes illisibles */}return {id:v.id,version:v.version,body:v.body,commands,content_hash:v.content_hash,locked:Boolean(v.locked),sent_at:v.sent_at,sent_recipient:v.sent_recipient,sent_note:v.sent_note,created_at:v.created_at};};
function noSecret(text:string){const f=secretFindings(text);if(f.length)fail(400,'Le texte contient ce qui ressemble à un secret ('+f.join(', ')+') : retirez-le avant de l’enregistrer.');}
async function checkRefs(env:Env,user:string,d:Partial<z.infer<typeof metaInput>>,project:string|null){
 if(d.project_id)await owned(env,'projects',d.project_id,user);
 if(d.task_id){if(!project||!await one(env,'SELECT id FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',d.task_id,user,project))fail(400,'Cette tâche n’appartient pas au projet du prompt.');}
 if(d.conversation_id){if(!project||!await one(env,'SELECT id FROM conversations WHERE id=? AND user_id=? AND project_id=?',d.conversation_id,user,project))fail(400,'Cette discussion n’appartient pas au projet du prompt.');}
}
async function createPrompt(env:Env,user:string,d:Partial<z.infer<typeof metaInput>>&{title:string},code:string,body:string,commands:unknown,extra:{status?:PromptStatus;memory_doc_id?:string|null;source_note?:string;sent_at?:string|null;sent_recipient?:string|null}={}){
 noSecret(body);
 if(await one(env,'SELECT id FROM prompts WHERE user_id=? AND code=?',user,code))fail(409,'Un prompt porte déjà l’identifiant '+code+'.');
 const id=uid(),at=now(),status=extra.status||'to_prepare',sent=extra.sent_at||null;
 await env.DB.batch([
  env.DB.prepare('INSERT INTO prompts(id,user_id,project_id,code,title,subject,kind,recipient,provider,product,model,effort,objective,justification,prerequisites,dependencies,status,planned_send,task_id,conversation_id,memory_doc_id,source_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(id,user,d.project_id??null,code,d.title,d.subject||'',d.kind||'development',d.recipient||'',d.provider||'',d.product||'',d.model||'',d.effort||'',d.objective||'',d.justification||'',d.prerequisites||'',d.dependencies||'',status,d.planned_send??null,d.task_id??null,d.conversation_id??null,extra.memory_doc_id??null,extra.source_note||'',at,at),
  env.DB.prepare('INSERT INTO prompt_versions(id,prompt_id,user_id,version,body,commands,content_hash,locked,sent_at,sent_recipient,sent_note,created_at) VALUES(?,?,?,1,?,?,?,?,?,?,?,?)')
   .bind(uid(),id,user,body,JSON.stringify(cleanCommands(commands)),await sha256Hex(body),Number(Boolean(sent)),sent,sent?(extra.sent_recipient||d.recipient||''):null,sent?'Date d’envoi lue dans la fiche source, non constatée par Atelier.':null,at)
 ]);
 await event(env,user,'prompt_created','Prompt '+code+' : '+d.title,d.project_id??null);
 return id;
}
prompts.get('/',async c=>{
 const user=userId(c),project=c.req.query('project')||'',status=c.req.query('status')||'',q=(c.req.query('q')||'').trim();
 if(project)await owned(c.env,'projects',project,user);
 const rows=await many<Row>(c.env,"SELECT p.id,p.code,p.title,p.subject,p.kind,p.recipient,p.provider,p.product,p.model,p.effort,p.status,p.planned_send,p.current_version,p.project_id,p.task_id,p.memory_doc_id,p.updated_at,p.created_at,pr.name AS project_name,v.sent_at,v.locked,v.content_hash,length(v.body) AS body_length,(SELECT COUNT(*) FROM prompt_responses r WHERE r.prompt_id=p.id AND r.user_id=p.user_id) AS responses FROM prompts p JOIN prompt_versions v ON v.prompt_id=p.id AND v.version=p.current_version LEFT JOIN projects pr ON pr.id=p.project_id AND pr.user_id=p.user_id WHERE p.user_id=? AND (?='' OR p.project_id=?) AND (?='' OR p.status=?) AND (?='' OR p.code LIKE ? ESCAPE '\\' OR p.title LIKE ? ESCAPE '\\' OR p.recipient LIKE ? ESCAPE '\\' OR v.body LIKE ? ESCAPE '\\') ORDER BY p.status IN ('to_give','to_prepare') DESC,p.updated_at DESC LIMIT 200",
  user,project,project,status,status,q,like(q),like(q),like(q),like(q));
 return c.json({items:rows.map(view),labels:PROMPT_LABEL});
});
prompts.post('/',async c=>{
 const user=userId(c),raw=await jsonBody(c),d=metaInput.partial().required({title:true}).parse(raw),b=bodyInput.parse(raw),o=z.object({code:z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,60}$/).optional(),prefix:z.string().max(40).optional()}).parse(raw);
 await checkRefs(c.env,user,d,d.project_id??null);
 const code=o.code||nextCode((await many<Row>(c.env,'SELECT code FROM prompts WHERE user_id=?',user)).map(r=>r.code),o.prefix||'PROMPT');
 return c.json(view(await mine(c.env,user,await createPrompt(c.env,user,d,code,b.body,b.commands))),201);
});
prompts.get('/:id',async c=>{
 const user=userId(c),p=await mine(c.env,user,c.req.param('id'));
 const versions=await many<Row>(c.env,'SELECT * FROM prompt_versions WHERE prompt_id=? AND user_id=? ORDER BY version DESC',p.id,user);
 const responses=await many<Row>(c.env,'SELECT id,version,response,url,analysis,result,received_at,created_at FROM prompt_responses WHERE prompt_id=? AND user_id=? ORDER BY created_at DESC',p.id,user);
 const handoffs=await many<Row>(c.env,'SELECT id,title,status FROM handoff_packages WHERE prompt_id=? AND user_id=?',p.id,user);
 return c.json({...view(p),versions:versions.map(versionView),responses,handoffs});
});
prompts.patch('/:id',async c=>{
 const user=userId(c),p=await mine(c.env,user,c.req.param('id')),d=metaInput.partial().extend({status:z.enum(['to_prepare','to_give','given','awaiting','response_received','processed','obsolete']).optional(),revision:z.number().int()}).parse(await jsonBody(c));
 const project=d.project_id===undefined?p.project_id:d.project_id;await checkRefs(c.env,user,d,project);
 if(d.status&&d.status!==p.status&&!canSetStatus(p.status,d.status))fail(409,d.status==='given'?'« Déjà donné » exige la confirmation de transmission avec la date réelle.':d.status==='response_received'?'« Réponse reçue » se pose en ajoutant la réponse.':'Ce changement de statut n’est pas possible depuis « '+PROMPT_LABEL[p.status as PromptStatus]+' ».');
 const r=await run(c.env,'UPDATE prompts SET project_id=?,title=?,subject=?,kind=?,recipient=?,provider=?,product=?,model=?,effort=?,objective=?,justification=?,prerequisites=?,dependencies=?,planned_send=?,task_id=?,conversation_id=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?',
  project,d.title??p.title,d.subject??p.subject,d.kind??p.kind,d.recipient??p.recipient,d.provider??p.provider,d.product??p.product,d.model??p.model,d.effort??p.effort,d.objective??p.objective,d.justification??p.justification,d.prerequisites??p.prerequisites,d.dependencies??p.dependencies,d.planned_send===undefined?p.planned_send:d.planned_send,d.task_id===undefined?p.task_id:d.task_id,d.conversation_id===undefined?p.conversation_id:d.conversation_id,d.status??p.status,now(),p.id,user,d.revision);
 if(!r.meta.changes)fail(409,'Ce prompt a changé sur un autre appareil. Rechargez-le.');
 if(d.status&&d.status!==p.status)await event(c.env,user,'prompt_status','Prompt '+p.code+' : '+PROMPT_LABEL[d.status],project);
 return c.json(view(await mine(c.env,user,p.id)));
});
/** Modifier le texte : en place tant que la version n'a pas été transmise ; sinon nouvelle version, l'ancienne reste intacte. */
prompts.put('/:id/body',async c=>{
 const user=userId(c),p=await mine(c.env,user,c.req.param('id')),b=bodyInput.parse(await jsonBody(c));noSecret(b.body);
 const cur=await one<Row>(c.env,'SELECT * FROM prompt_versions WHERE prompt_id=? AND user_id=? AND version=?',p.id,user,p.current_version);
 const hash=await sha256Hex(b.body),commands=JSON.stringify(cleanCommands(b.commands)),at=now();
 if(cur&&!cur.locked){
  await run(c.env,'UPDATE prompt_versions SET body=?,commands=?,content_hash=? WHERE id=? AND user_id=? AND locked=0',b.body,commands,hash,cur.id,user);
  await run(c.env,'UPDATE prompts SET updated_at=? WHERE id=? AND user_id=?',at,p.id,user);
  return c.json({version:p.current_version,new_version:false,content_hash:hash});
 }
 if(cur&&cur.content_hash===hash&&cur.commands===commands)fail(409,'Le texte est identique à la version transmise : aucune nouvelle version n’est créée.');
 const version=p.current_version+1;
 await c.env.DB.batch([
  c.env.DB.prepare('INSERT INTO prompt_versions(id,prompt_id,user_id,version,body,commands,content_hash,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(uid(),p.id,user,version,b.body,commands,hash,at),
  c.env.DB.prepare("UPDATE prompts SET current_version=?,status='to_give',revision=revision+1,updated_at=? WHERE id=? AND user_id=?").bind(version,at,p.id,user)
 ]);
 await event(c.env,user,'prompt_version','Prompt '+p.code+' : version '+version+' créée (la version '+p.current_version+' transmise reste intacte)',p.project_id);
 return c.json({version,new_version:true,content_hash:hash},201);
});
/** Confirmation de transmission par Martin : date réelle obligatoire, jamais dans le futur ; la version devient immuable. */
prompts.post('/:id/sent',async c=>{
 const user=userId(c),p=await mine(c.env,user,c.req.param('id'));
 const d=z.object({confirm:z.literal(true),sent_at:z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/),recipient:t(120).default(''),note:t(500).default('')}).parse(await jsonBody(c));
 const when=Date.parse(d.sent_at.length===10?d.sent_at+'T00:00:00Z':d.sent_at);
 if(!Number.isFinite(when)||when>Date.now()+86400000)fail(400,'La date de transmission doit être une date réelle, pas une date future.');
 if(!['to_prepare','to_give'].includes(p.status))fail(409,'Cette version est déjà marquée comme transmise. Pour retransmettre un texte modifié, créez une nouvelle version.');
 const r=await run(c.env,'UPDATE prompt_versions SET locked=1,sent_at=?,sent_recipient=?,sent_note=? WHERE prompt_id=? AND user_id=? AND version=? AND locked=0',d.sent_at,d.recipient||p.recipient,d.note,p.id,user,p.current_version);
 if(!r.meta.changes)fail(409,'Cette version est déjà verrouillée.');
 await run(c.env,"UPDATE prompts SET status='given',revision=revision+1,updated_at=? WHERE id=? AND user_id=?",now(),p.id,user);
 await event(c.env,user,'prompt_sent','Prompt '+p.code+' v'+p.current_version+' : transmission confirmée par Martin ('+d.sent_at+(d.recipient?', '+d.recipient:'')+')',p.project_id);
 return c.json(view(await mine(c.env,user,p.id)));
});
prompts.post('/:id/responses',async c=>{
 const user=userId(c),p=await mine(c.env,user,c.req.param('id'));
 const d=z.object({response:z.string().max(60000).default(''),url:z.string().url().max(400).nullable().default(null),analysis:t(8000).default(''),result:t(4000).default(''),received_at:z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()}).parse(await jsonBody(c));
 if(!d.response.trim()&&!d.url)fail(400,'Ajoutez le texte de la réponse ou un lien.');
 if(d.url&&!/^https:\/\//.test(d.url))fail(400,'Le lien doit commencer par https://.');
 noSecret(d.response);
 const v=await one<Row>(c.env,'SELECT locked FROM prompt_versions WHERE prompt_id=? AND user_id=? AND version=?',p.id,user,p.current_version);
 if(!v?.locked)fail(409,'Confirmez d’abord la transmission de cette version : une réponse se rattache à un prompt réellement donné.');
 const id=uid(),at=now();
 await run(c.env,'INSERT INTO prompt_responses(id,prompt_id,user_id,version,response,url,analysis,result,received_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,p.id,user,p.current_version,d.response,d.url,d.analysis,d.result,d.received_at||at,at);
 await run(c.env,"UPDATE prompts SET status='response_received',revision=revision+1,updated_at=? WHERE id=? AND user_id=?",at,p.id,user);
 await event(c.env,user,'prompt_response','Prompt '+p.code+' : réponse enregistrée',p.project_id);
 return c.json({id},201);
});
prompts.patch('/responses/:rid',async c=>{
 const user=userId(c),d=z.object({analysis:t(8000).optional(),result:t(4000).optional()}).parse(await jsonBody(c));
 const r=await one<Row>(c.env,'SELECT * FROM prompt_responses WHERE id=? AND user_id=?',c.req.param('rid'),user);if(!r)fail(404,'Réponse introuvable.');
 await run(c.env,'UPDATE prompt_responses SET analysis=?,result=? WHERE id=? AND user_id=?',d.analysis??r.analysis,d.result??r.result,r.id,user);
 return c.json({ok:true});
});
/** Texte exact d'une version : TXT = le corps tel quel ; MD = fiche avec en-tête et commandes séparées. */
prompts.get('/:id/export',async c=>{
 const user=userId(c),p=await mine(c.env,user,c.req.param('id')),version=Number(c.req.query('version'))||p.current_version,format=c.req.query('format')==='txt'?'txt':'md';
 const v=await one<Row>(c.env,'SELECT * FROM prompt_versions WHERE prompt_id=? AND user_id=? AND version=?',p.id,user,version);if(!v)fail(404,'Version introuvable.');
 const vv=versionView(v),exp={code:p.code,title:p.title,project:p.project_name||'Général',recipient:p.recipient,provider:p.provider,product:p.product,model:p.model,effort:p.effort,version,status:p.status as PromptStatus,created_at:v.created_at,planned_send:p.planned_send,sent_at:v.sent_at,objective:p.objective,body:v.body,commands:vv.commands,content_hash:v.content_hash};
 const name=(p.code+'-v'+version+'.'+format).replace(/[^a-zA-Z0-9_.-]/g,'_');
 return new Response(format==='txt'?promptText(exp):promptMarkdown(exp),{headers:{'Content-Type':(format==='txt'?'text/plain':'text/markdown')+'; charset=utf-8','Content-Disposition':`attachment; filename="${name}"`,'X-Content-Hash':v.content_hash,'Cache-Control':'no-store'}});
});
/** Importer une fiche de prompt depuis le référentiel mémoire : champs lus dans la fiche, rien d'inventé. */
prompts.post('/import-memory',async c=>{
 const user=userId(c),d=z.object({memory_doc_id:z.string().uuid(),project_id:z.string().uuid().nullable().default(null)}).parse(await jsonBody(c));
 if(d.project_id)await owned(c.env,'projects',d.project_id,user);
 const doc=await memoryDocContent(c.env,user,d.memory_doc_id);
 if(doc.content===null)fail(400,doc.notice||'Ce document n’a pas de contenu texte lisible.');
 const parsed=parsePromptDocument(doc.content),m=parsed.meta;
 const code=(m.id||doc.doc_ref||'').toUpperCase().replace(/[^A-Z0-9-]/g,'');
 if(!/^[A-Z0-9][A-Z0-9-]{2,60}$/.test(code))fail(400,'Cette fiche n’a pas d’identifiant de prompt lisible (champ « id » ou nom PROMPT-…).');
 if(!parsed.body.trim())fail(400,'Cette fiche ne contient pas de texte de prompt.');
 const status=statusFromMeta(m),sentAt=/^\d{4}-\d{2}-\d{2}/.test(m.sent_at||'')?m.sent_at:null;
 const id=await createPrompt(c.env,user,{project_id:d.project_id,title:(m.title||parsed.title||doc.title).slice(0,200),recipient:(m.recipient||'').slice(0,120),provider:(m.provider||'').slice(0,80),product:(m.product||'').slice(0,80),model:(m.model||'').slice(0,120),effort:(m.reasoning_effort||m.effort||'').slice(0,80),planned_send:(m.planned_send||'').slice(0,60)||null,subject:(m.project||'').slice(0,200)},code,parsed.body,[],
  {status,memory_doc_id:doc.id,source_note:'Importé de '+doc.repository+' : '+doc.path+' @ '+String(doc.commit).slice(0,8)+' (blob '+String(doc.blob_sha).slice(0,8)+')',sent_at:['given','awaiting','response_received','processed'].includes(status)?sentAt:null,sent_recipient:m.recipient||null});
 return c.json(view(await mine(c.env,user,id)),201);
});
/** Consigne de développement préparée depuis une tâche du plan et des décisions validées choisies. */
prompts.post('/from-task',async c=>{
 const user=userId(c),d=z.object({task_id:z.string().uuid(),decision_ids:z.array(z.string().uuid()).max(15).default([]),recipient:t(120).default('Claude Code')}).parse(await jsonBody(c));
 const task=await owned(c.env,'plan_tasks',d.task_id,user),project=await owned(c.env,'projects',task.project_id,user);
 const decisions=[];for(const id of d.decision_ids){const r=await one<Row>(c.env,"SELECT title,source_ref,status FROM project_decisions WHERE id=? AND user_id=? AND project_id=?",id,user,project.id);if(!r)fail(400,'Une décision n’appartient pas à ce projet.');if(r.status!=='validated')fail(400,'Seules les décisions validées peuvent être citées comme règles : « '+r.title+' » ne l’est pas.');decisions.push({title:r.title,source_ref:r.source_ref});}
 let deps:string[]=[];try{deps=JSON.parse(task.depends_on);}catch{/* dépendances illisibles */}
 const dependencies=[];for(const id of deps){const r=await one<Row>(c.env,'SELECT title,status FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',id,user,project.id);if(r)dependencies.push({title:r.title,status:r.status});}
 const repo=await one<Row>(c.env,'SELECT full_name,branch,default_branch,head_sha,verified_at FROM repositories WHERE user_id=? AND project_id=? ORDER BY created_at LIMIT 1',user,project.id);
 const advice=recommend(taskAdviceInput(task));
 const previous=await one<Row>(c.env,'SELECT worked_at,outcome,results,unresolved,tests_run,files_modified FROM work_sessions WHERE user_id=? AND task_id=? ORDER BY worked_at DESC LIMIT 1',user,task.id);
 const checkpoint=await one<Row>(c.env,'SELECT title,next_action,remaining FROM checkpoints WHERE user_id=? AND task_id=? ORDER BY updated_at DESC LIMIT 1',user,task.id);
 const body=devPrompt({project:project.name,advice:{line:adviceLine(advice),verification:VERIFICATION_LABEL[advice.verification],reasons:advice.reasons,warnings:advice.warnings},
  previous:previous?{worked_at:previous.worked_at,outcome:previous.outcome,results:previous.results,unresolved:previous.unresolved,tests_run:previous.tests_run,files_modified:previous.files_modified}:null,
  checkpoint:checkpoint?{title:checkpoint.title,next_action:checkpoint.next_action,remaining:checkpoint.remaining}:null,
  task:{title:task.title,objective:task.objective,acceptance:task.acceptance,context:task.context,files_hint:task.files_hint,tests:task.tests,risks:task.risks,next_action:task.next_action,owner:task.owner,
   constraints_text:task.constraints_text,do_not_touch:task.do_not_touch,already_verified:task.already_verified,difficulties:task.difficulties},
  repository:repo?{full_name:repo.full_name,branch:repo.default_branch||repo.branch,head_sha:repo.head_sha,verified:Boolean(repo.verified_at)}:null,decisions,dependencies});
 const code=nextCode((await many<Row>(c.env,'SELECT code FROM prompts WHERE user_id=?',user)).map(r=>r.code),'PROMPT-'+d.recipient.replace(/\s+/g,''));
 const id=await createPrompt(c.env,user,{project_id:project.id,title:task.title,kind:'development',recipient:d.recipient,task_id:task.id,objective:task.objective,model:advice.model==='none'?'':({haiku:'Haiku',sonnet:'Sonnet 5.5',opus:'Opus',fable:'Fable 5.2'} as Record<string,string>)[advice.model],effort:advice.effort||''},code,body,[],{source_note:'Préparé depuis la tâche du plan « '+task.title+' ».'});
 return c.json(view(await mine(c.env,user,id)),201);
});
/** Fiche de prompt créée depuis un dossier de transmission figé : le texte figé devient la version 1. */
prompts.post('/from-handoff',async c=>{
 const user=userId(c),d=z.object({handoff_id:z.string().uuid()}).parse(await jsonBody(c));
 const h=await owned(c.env,'handoff_packages',d.handoff_id,user);
 if(!h.rendered)fail(409,'Marquez d’abord le dossier « Prêt à copier » : la fiche reprend son texte figé.');
 if(h.prompt_id)fail(409,'Ce dossier est déjà relié à une fiche de prompt.');
 const dest:Record<string,string>={claude_code:'Claude Code',chatgpt:'ChatGPT',codex:'Codex',gemini:'Gemini',mistral:'Mistral',other:'Autre IA'};
 const code=nextCode((await many<Row>(c.env,'SELECT code FROM prompts WHERE user_id=?',user)).map(r=>r.code),'PROMPT-'+(dest[h.destination]||'IA').replace(/\s+/g,''));
 const id=await createPrompt(c.env,user,{project_id:h.project_id,title:h.title,recipient:dest[h.destination]||'',task_id:h.task_id,objective:h.objective},code,h.rendered,[],{status:'to_give',source_note:'Créé depuis le dossier de transmission « '+h.title+' » (empreinte '+String(h.content_hash).slice(0,12)+').'});
 await run(c.env,'UPDATE handoff_packages SET prompt_id=? WHERE id=? AND user_id=?',id,h.id,user);
 return c.json(view(await mine(c.env,user,id)),201);
});
