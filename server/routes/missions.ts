/* Lot 3 — Missions pour Claude Code et registre des travaux.
   Atelier assemble, fige et fait copier un texte ; il n'envoie rien, n'exécute aucun test et n'écrit jamais dans un dépôt.
   Les dépôts visés ne sont lus qu'en lecture seule, à un commit figé (AGENTS.md, CLAUDE.md, package.json à la racine). */
import {Hono} from 'hono';import {z} from 'zod';
import {credentialsFor} from './connections.ts';
import {jsonRequest} from '../connectors/http.ts';
import {generate} from '../connectors/ai.ts';
import {event,fail,jsonBody,many,now,one,owned,run,uid,userId} from '../core.ts';
import {readBlobText} from '../github-blob.ts';
import {loadChecks} from '../github-checks.ts';
import {legacyDecision} from '../lifecycle-core.ts';
import {adviceLine,recommend} from '../claude-advisor.ts';
import {secretFindings} from '../handoff-core.ts';
import {taskAdviceInput} from './claude.ts';
import {CHECKS_LABEL,FIELD_KEYS,MAX_RULE_FILE,RULE_FILES,STATUS_LABEL,VERDICTS,VERDICT_LABEL,assembleFields,checksState,cleanFields,extractUnits,missionGaps,parseRephrase,profileOf,rephrasePrompt,renderMission,reviewForSha,sha256Hex,testScripts,verdictProblem,type Extras,type MissionFields,type MissionInput,type RepoFile,type RuleUnit} from '../mission-core.ts';
import type {AppEnv,Env,Row} from '../types.ts';
export const missions=new Hono<AppEnv>();
const FREE_AI=['mistral','gemini','groq'];
const t=(n:number)=>z.string().max(n);
const parse=<T>(raw:unknown,fallback:T):T=>{try{const v=JSON.parse(String(raw));return v??fallback;}catch{return fallback;}};
const noSecret=(...texts:string[])=>{for(const x of texts)if(x&&secretFindings(x).length)fail(400,'Ce texte semble contenir une clé ou un mot de passe : retirez-le avant d’enregistrer.');};

interface Snapshot{repo:string;commit:string;files:{path:string;sha:string}[];units:RuleUnit[];package_found:boolean;scripts:{names:string[];readable:boolean}|null}
const snapshotOf=(m:Row):Snapshot|null=>{const s=parse<Snapshot|null>(m.rules_snapshot,null);return s&&Array.isArray(s.units)?s:null;};
const view=(m:Row)=>{
 const snap=snapshotOf(m),ai=parse<any>(m.ai_rewrite,null),ev=parse<any>(m.verdict_evidence,null);
 const {rendered:_r,rules_snapshot:_s,ai_rewrite:_a,verdict_evidence:_e,fields,...rest}=m;
 return {...rest,fields:cleanFields(parse(fields,{})),feature_ids:parse(m.feature_ids,[]),decision_ids:parse(m.decision_ids,[]),
  status_label:STATUS_LABEL[m.status]||m.status,verdict_label:VERDICT_LABEL[m.verdict as ''|'accepted']||m.verdict,
  rules:{state:m.rules_state,commit:m.rules_commit,files:snap?.files||[],kept:snap?.units.filter(u=>u.status==='kept').length||0,ignored:snap?.units.filter(u=>u.status==='ignored').length||0,scripts:snap?.scripts||null},
  ai:ai?{provider:ai.provider,model:ai.model,at:ai.at,restorable:Boolean(ai.fields_before)}:null,evidence:ev,profile:profileOf(m.repo_full_name)};
};
async function mine(env:Env,user:string,id:string){const r=await one<Row>(env,'SELECT * FROM missions WHERE id=? AND user_id=?',id,user);if(!r)fail(404,'Cette mission est introuvable ou ne vous appartient pas.');return r;}

/* ───────── Lecture seule du dépôt visé, à un commit figé ───────── */
async function readRepoRules(env:Env,user:string,repo:Row,branch:string):Promise<{ok:true;snap:Snapshot}|{ok:false;message:string}>{
 try{
  const {conn,secret}=await credentialsFor(env,repo.connection_id,user,'read');
  if(conn.provider!=='github')return {ok:false,message:'La connexion du dépôt n’est pas une connexion GitHub.'};
  const head=(await jsonRequest('github',secret,'/repos/'+repo.full_name+'/branches/'+encodeURIComponent(branch))).data;
  const commit=String(head?.commit?.sha||''),treeSha=String(head?.commit?.commit?.tree?.sha||'');
  if(!/^[0-9a-f]{40}$/.test(commit)||!/^[0-9a-f]{40}$/.test(treeSha))return {ok:false,message:'GitHub n’a pas renvoyé le commit de la branche « '+branch+' ».'};
  const tree=(await jsonRequest('github',secret,'/repos/'+repo.full_name+'/git/trees/'+treeSha)).data;
  const entries:any[]=Array.isArray(tree?.tree)?tree.tree:[];
  const wanted=[...RULE_FILES,'package.json'] as string[],files:RepoFile[]=[];
  for(const e of entries){
   if(e?.type!=='blob'||!wanted.includes(e.path)||!/^[0-9a-f]{40}$/.test(String(e.sha)))continue;
   if(Number(e.size)>MAX_RULE_FILE)return {ok:false,message:'« '+e.path+' » dépasse '+MAX_RULE_FILE+' octets : trop long pour être cité sans en perdre une partie.'};
   const b=await readBlobText(secret,repo.full_name,e.sha);
   if(b.binary)return {ok:false,message:'« '+e.path+' » n’est pas un fichier texte.'};
   files.push({repo:repo.full_name,path:e.path,sha:e.sha,text:b.text});
  }
  const ruleFiles=files.filter(f=>(RULE_FILES as readonly string[]).includes(f.path)),pkg=files.find(f=>f.path==='package.json');
  const units=ruleFiles.flatMap(f=>extractUnits(f));
  return {ok:true,snap:{repo:repo.full_name,commit,files:ruleFiles.map(f=>({path:f.path,sha:f.sha})),units,package_found:Boolean(pkg),scripts:pkg?testScripts(pkg.text):null}};
 }catch(e:any){return {ok:false,message:(e?.message&&String(e.message).slice(0,240))||'GitHub n’a pas répondu.'};}
}

/* ───────── Assemblage ───────── */
async function buildInput(env:Env,user:string,m:Row,preparedAt:string):Promise<MissionInput>{
 const project=await owned(env,'projects',m.project_id,user);
 const task=m.task_id?await one<Row>(env,'SELECT * FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',m.task_id,user,m.project_id):null;
 const features:{code:string;name:string;state:string}[]=[];
 for(const id of parse<string[]>(m.feature_ids,[])){const f=await one<Row>(env,'SELECT code,name,state FROM project_features WHERE id=? AND user_id=? AND project_id=?',id,user,m.project_id);if(f)features.push({code:f.code,name:f.name,state:f.state});}
 const decisions:MissionInput['decisions']=[];
 for(const id of parse<string[]>(m.decision_ids,[])){const d=await one<Row>(env,'SELECT id,title,reason,source_ref FROM project_decisions WHERE id=? AND user_id=? AND project_id=?',id,user,m.project_id);if(d)decisions.push({id:d.id,title:d.title,reason:d.reason,source_ref:d.source_ref});}
 const snap=snapshotOf(m);
 let extras:Extras|null=null,advice='';
 if(task){
  const a=recommend(taskAdviceInput(task));advice=adviceLine(a);
  if(m.level==='full'){
   const deps:{title:string;status:string}[]=[];for(const id of parse<string[]>(task.depends_on,[])){const r=await one<Row>(env,'SELECT title,status FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',id,user,m.project_id);if(r)deps.push({title:r.title,status:r.status});}
   const previous=await one<Row>(env,'SELECT worked_at,outcome,results,unresolved,tests_run FROM work_sessions WHERE user_id=? AND task_id=? ORDER BY worked_at DESC LIMIT 1',user,task.id);
   const checkpoint=await one<Row>(env,'SELECT title,next_action,remaining FROM checkpoints WHERE user_id=? AND task_id=? ORDER BY updated_at DESC LIMIT 1',user,task.id);
   extras={dependencies:deps,previous:previous as any,checkpoint:checkpoint as any,task_context:String(task.context||'').slice(0,1500),already_verified:String(task.already_verified||'').slice(0,1000),difficulties:String(task.difficulties||'').slice(0,1000),advice_reasons:a.reasons||[]};
  }
 }
 const ai=parse<any>(m.ai_rewrite,null);
 return {projectName:project.name,preparedAt,level:m.level,title:m.title,repo:{full_name:m.repo_full_name,branch:m.branch},fields:cleanFields(parse(m.fields,{})),features,decisions,
  draft:{source:m.draft_source,reviewed_at:m.reviewed_at,ai_label:ai?ai.provider+' · '+ai.model:undefined},
  rules:{state:m.rules_state,repo:snap?.repo||null,commit:m.rules_commit,files:snap?.files||[],units:snap?.units||[],scripts:snap?.scripts||null,package_found:snap?.package_found||false},advice,extras};
}
async function ownedRepo(env:Env,user:string,project:string,id:string){const r=await one<Row>(env,'SELECT * FROM repositories WHERE id=? AND user_id=? AND project_id=?',id,user,project);if(!r)fail(400,'Ce dépôt n’est pas associé à ce projet.');return r;}
async function currentDecisions(env:Env,user:string,project:string,ids:string[]){
 for(const id of ids){
  const d=await one<Row>(env,'SELECT id,title,status FROM project_decisions WHERE id=? AND user_id=? AND project_id=?',id,user,project);
  if(!d)fail(400,'Une décision choisie n’appartient pas à ce projet.');
  const lc=await one<Row>(env,"SELECT status FROM item_lifecycle WHERE user_id=? AND kind='decision' AND item_id=?",user,id);
  if((lc?.status||legacyDecision(d.status).status)!=='current')fail(400,'Seules les décisions « actuelles » peuvent être citées : « '+d.title+' » ne l’est pas.');
 }
}
async function ownedFeatures(env:Env,user:string,project:string,ids:string[]){
 for(const id of ids)if(!await one(env,'SELECT id FROM project_features WHERE id=? AND user_id=? AND project_id=?',id,user,project))fail(400,'Une fonctionnalité choisie n’appartient pas à ce projet.');
}

/* ───────── Routes ───────── */
const create=z.object({project_id:z.string().uuid(),task_id:z.string().uuid().nullable().default(null),repository_id:z.string().uuid(),level:z.enum(['short','full']).default('short'),
 title:t(160).optional(),feature_ids:z.array(z.string().uuid()).max(10).default([]),decision_ids:z.array(z.string().uuid()).max(15).default([]),fields:z.record(z.string(),z.string()).optional()});
missions.get('/',async c=>{
 const user=userId(c),project=c.req.query('project')||'';await owned(c.env,'projects',project,user);
 return c.json({items:(await many<Row>(c.env,'SELECT * FROM missions WHERE user_id=? AND project_id=? ORDER BY updated_at DESC LIMIT 100',user,project)).map(view)});
});
missions.post('/',async c=>{
 const user=userId(c),d=create.parse(await jsonBody(c)),project=await owned(c.env,'projects',d.project_id,user);
 const repo=await ownedRepo(c.env,user,project.id,d.repository_id);
 const task=d.task_id?await one<Row>(c.env,'SELECT * FROM plan_tasks WHERE id=? AND user_id=? AND project_id=?',d.task_id,user,project.id):null;
 if(d.task_id&&!task)fail(400,'Cette tâche n’appartient pas à ce projet.');
 await currentDecisions(c.env,user,project.id,d.decision_ids);await ownedFeatures(c.env,user,project.id,d.feature_ids);
 const title=(d.title||task?.title||'').trim();if(!title)fail(400,'Donnez un titre à la mission ou choisissez une tâche.');
 const fields=assembleFields(task as any);
 if(d.fields)for(const k of FIELD_KEYS)if(typeof d.fields[k]==='string')fields[k]=d.fields[k].slice(0,3000);
 noSecret(...Object.values(fields));
 const id=uid(),at=now(),a=task?adviceLine(recommend(taskAdviceInput(task))):'';
 await run(c.env,'INSERT INTO missions(id,user_id,project_id,task_id,repository_id,repo_full_name,branch,level,title,fields,feature_ids,decision_ids,advice_line,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  id,user,project.id,task?.id??null,repo.id,repo.full_name,repo.default_branch||repo.branch,d.level,title,JSON.stringify(fields),JSON.stringify(d.feature_ids),JSON.stringify(d.decision_ids),a,at,at);
 await event(c.env,user,'mission_created','Mission préparée : '+title,project.id,task?.id??null);
 return c.json(view(await mine(c.env,user,id)),201);
});
missions.get('/:id',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 let rendered=m.rendered,gaps:string[]=[],previewError:string|null=null;
 gaps=missionGaps(cleanFields(parse(m.fields,{})));
 if(m.status==='draft'){try{rendered=renderMission(await buildInput(c.env,user,m,now()));}catch(e:any){rendered=null;previewError=e?.message||'Aperçu impossible.';}}
 return c.json({...view(m),rendered,gaps,preview_error:previewError});
});
missions.patch('/:id',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 if(m.status!=='draft')fail(409,'Cette mission est figée : créez-en une nouvelle pour la modifier.');
 const d=z.object({revision:z.number().int(),title:t(160).optional(),level:z.enum(['short','full']).optional(),fields:z.record(z.string(),z.string()).optional(),
  feature_ids:z.array(z.string().uuid()).max(10).optional(),decision_ids:z.array(z.string().uuid()).max(15).optional(),repository_id:z.string().uuid().optional()}).parse(await jsonBody(c));
 const fields=cleanFields(parse(m.fields,{}));
 if(d.fields)for(const k of FIELD_KEYS)if(typeof d.fields[k]==='string')fields[k]=d.fields[k].slice(0,3000);
 noSecret(...Object.values(fields));
 if(d.decision_ids)await currentDecisions(c.env,user,m.project_id,d.decision_ids);if(d.feature_ids)await ownedFeatures(c.env,user,m.project_id,d.feature_ids);
 let repo:Row|null=null;if(d.repository_id&&d.repository_id!==m.repository_id)repo=await ownedRepo(c.env,user,m.project_id,d.repository_id);
 // Changer de dépôt invalide les règles lues : elles appartenaient à l'ancien dépôt et ne doivent jamais être mélangées.
 const x=await run(c.env,"UPDATE missions SET title=?,level=?,fields=?,feature_ids=?,decision_ids=?,repository_id=?,repo_full_name=?,branch=?,rules_state=?,rules_commit=?,rules_snapshot=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND status='draft' AND revision=?",
  (d.title??m.title).trim()||m.title,d.level??m.level,JSON.stringify(fields),JSON.stringify(d.feature_ids??parse(m.feature_ids,[])),JSON.stringify(d.decision_ids??parse(m.decision_ids,[])),
  repo?repo.id:m.repository_id,repo?repo.full_name:m.repo_full_name,repo?(repo.default_branch||repo.branch):m.branch,repo?'unread':m.rules_state,repo?null:m.rules_commit,repo?null:m.rules_snapshot,now(),m.id,user,d.revision);
 if(!x.meta.changes)fail(409,'Cette mission a changé sur un autre appareil. Rechargez-la avant de réappliquer vos changements.');
 return c.json(view(await mine(c.env,user,m.id)));
});
missions.delete('/:id',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 if(m.status!=='draft')fail(409,'Seul un brouillon peut être supprimé : une mission préparée reste dans le registre.');
 await run(c.env,"DELETE FROM missions WHERE id=? AND user_id=? AND status='draft'",m.id,user);return c.json({ok:true});
});
/** Lecture seule des règles du dépôt visé à un commit figé. Un échec n'efface rien : l'état devient « non lues » avec la raison. */
missions.post('/:id/read-rules',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 if(m.status!=='draft')fail(409,'Cette mission est figée : les règles lues sont celles du texte figé.');
 if(!m.repository_id)fail(409,'Aucun dépôt n’est relié à cette mission.');
 const repo=await ownedRepo(c.env,user,m.project_id,m.repository_id),r=await readRepoRules(c.env,user,repo,m.branch||repo.default_branch||repo.branch);
 if(!r.ok){await run(c.env,"UPDATE missions SET rules_state='not_read',updated_at=? WHERE id=? AND user_id=? AND status='draft'",now(),m.id,user);return c.json({...view(await mine(c.env,user,m.id)),read_error:r.message});}
 const state=r.snap.files.length?'read':'no_rule_files';
 await run(c.env,"UPDATE missions SET rules_state=?,rules_commit=?,rules_snapshot=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND status='draft'",state,r.snap.commit,JSON.stringify(r.snap),now(),m.id,user);
 return c.json({...view(await mine(c.env,user,m.id)),read_error:null});
});
/** Reformulation facultative par une IA gratuite avec la clé de l'utilisateur. Une seule tentative (jamais rejouée) ; le résultat reste une hypothèse jusqu'à relecture. */
missions.post('/:id/rephrase',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 if(m.status!=='draft')fail(409,'Cette mission est figée.');
 const d=z.object({connection_id:z.string().uuid(),model:t(160).min(1)}).parse(await jsonBody(c));
 const {conn,secret}=await credentialsFor(c.env,d.connection_id,user,'chat');
 if(!FREE_AI.includes(conn.provider)||!conn.api_consent||conn.status!=='connected')fail(403,'Seules vos connexions Gemini, Groq ou Mistral autorisées et testées peuvent reformuler une mission.');
 if(!parse<string[]>(conn.models,[]).includes(d.model))fail(400,'Modèle non confirmé : testez la connexion.');
 const before=cleanFields(parse(m.fields,{}));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);let out='';
 try{for await(const x of generate(conn.provider,secret,d.model,[{role:'user',content:rephrasePrompt(before)}],1500,controller.signal)){out+=x.text||'';if(out.length>12000)break;}}
 catch{fail(502,'L’IA n’a pas répondu correctement. Rien n’a été changé et la demande n’est pas rejouée automatiquement.');}finally{clearTimeout(timer);}
 const p=parseRephrase(out);if(!p)fail(422,'La réponse de l’IA n’est pas utilisable. Rien n’a été changé.');
 const next:MissionFields={...before};
 for(const k of ['objective','perimeter','done'] as const)if(before[k].trim())next[k]=p[k]||before[k];
 if(secretFindings(Object.values(next).join('\n')).length)fail(422,'La réponse de l’IA contient ce qui ressemble à un secret. Rien n’a été changé.');
 const prior=parse<any>(m.ai_rewrite,null);
 const rewrite={provider:conn.provider,model:d.model,at:now(),fields_before:prior?.fields_before||before};
 await run(c.env,"UPDATE missions SET fields=?,draft_source='ai',ai_rewrite=?,reviewed_at=NULL,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND status='draft'",JSON.stringify(next),JSON.stringify(rewrite),now(),m.id,user);
 return c.json(view(await mine(c.env,user,m.id)));
});
missions.post('/:id/restore-draft',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),ai=parse<any>(m.ai_rewrite,null);
 if(m.status!=='draft'||!ai?.fields_before)fail(409,'Il n’y a pas de brouillon d’origine à restaurer.');
 await run(c.env,"UPDATE missions SET fields=?,draft_source='assembled',ai_rewrite=NULL,reviewed_at=NULL,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND status='draft'",JSON.stringify(cleanFields(ai.fields_before)),now(),m.id,user);
 return c.json(view(await mine(c.env,user,m.id)));
});
/** « J'ai relu » : seul Martin peut lever l'étiquette Hypothèse d'un texte reformulé par une IA. */
missions.post('/:id/reviewed',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 if(m.status!=='draft')fail(409,'Cette mission est figée.');
 await run(c.env,'UPDATE missions SET reviewed_at=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND status=\'draft\'',now().slice(0,10),now(),m.id,user);
 return c.json(view(await mine(c.env,user,m.id)));
});
const readyBody=z.object({allow_without_rules:z.boolean().default(false)});
/** Brouillon → « Prête à copier » : le texte est figé avec son empreinte. Manques essentiels, règles non lues et reformulation IA non relue bloquent. */
missions.post('/:id/ready',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=readyBody.parse(await jsonBody(c).catch(()=>({})));
 if(m.status!=='draft')fail(409,'Cette mission est déjà figée.');
 const gaps=missionGaps(cleanFields(parse(m.fields,{})));if(gaps.length)fail(409,'Il manque '+gaps.join(', ')+' : sans cela, Claude Code poserait des questions. Complétez la mission.');
 if(m.draft_source==='ai'&&!m.reviewed_at)fail(409,'Ce texte a été reformulé par une IA : c’est une hypothèse tant que vous ne l’avez pas relu (« J’ai relu »).');
 if(!['read','no_rule_files'].includes(m.rules_state)&&!d.allow_without_rules)fail(409,'Les règles du dépôt visé n’ont pas été lues. Lisez-les, ou confirmez que la mission part sans elles (elle le dira en toutes lettres).');
 const at=now(),rendered=renderMission(await buildInput(c.env,user,m,at)),hash=await sha256Hex(rendered);
 const x=await run(c.env,"UPDATE missions SET status='ready',rendered=?,content_hash=?,frozen_at=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND status='draft'",rendered,hash,at,at,m.id,user);
 if(!x.meta.changes)fail(409,'Cette mission vient d’être figée sur un autre appareil.');
 await event(c.env,user,'mission_ready','Mission prête : '+m.title,m.project_id,m.task_id);
 return c.json({...view(await mine(c.env,user,m.id)),rendered});
});
missions.get('/:id/export',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 if(m.status==='draft'||!m.rendered)fail(409,'Figez d’abord la mission (« Prête à copier ») : l’export est le texte figé.');
 const name='mission-'+String(m.title).normalize('NFD').replace(/[^\w]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)+'.md';
 return new Response(m.rendered,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`,'X-Content-Hash':m.content_hash||'','Cache-Control':'no-store'}});
});
/** « Copiée » ou « Exportée » : une action locale réellement faite. « Envoyée » n'existe pas. */
missions.post('/:id/transfer',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=z.object({mode:z.enum(['clipboard','download'])}).parse(await jsonBody(c));
 if(m.status==='draft')fail(409,'Figez d’abord la mission (« Prête à copier »).');
 await run(c.env,'UPDATE missions SET status=?,transfer_mode=?,transferred_at=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=?',d.mode==='clipboard'?'copied':'exported',d.mode,now(),now(),m.id,user);
 return c.json(view(await mine(c.env,user,m.id)));
});
/** Registre : IA et modèle réellement utilisés, pourquoi, PR, consommation SI elle est connue. Rien n'est inventé ni calculé. */
missions.patch('/:id/registry',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 const d=z.object({executor_family:z.enum(['','haiku','sonnet','opus','fable','other']).optional(),executor_model:t(120).optional(),executor_effort:z.enum(['','low','medium','high','xhigh','max']).optional(),executor_why:t(1000).optional(),
  pr_number:z.number().int().min(1).max(999999).nullable().optional(),report_text:t(20000).optional(),usage_source:z.enum(['none','usage_screen','declared']).optional(),
  input_tokens:z.number().int().min(0).nullable().optional(),output_tokens:z.number().int().min(0).nullable().optional(),cost_usd:z.number().min(0).nullable().optional()}).parse(await jsonBody(c));
 noSecret(d.executor_why||'',d.report_text||'');
 const v=<K extends keyof typeof d>(k:K):any=>d[k]===undefined?m[k as string]:d[k];
 const hasUsage=[v('input_tokens'),v('output_tokens'),v('cost_usd')].some(x=>x!==null&&x!==undefined);
 const source=hasUsage?(v('usage_source')==='none'?'declared':v('usage_source')):'none';
 await run(c.env,'UPDATE missions SET executor_family=?,executor_model=?,executor_effort=?,executor_why=?,pr_number=?,report_text=?,usage_source=?,input_tokens=?,output_tokens=?,cost_usd=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=?',
  v('executor_family'),v('executor_model'),v('executor_effort'),v('executor_why'),v('pr_number')??null,v('report_text'),source,v('input_tokens')??null,v('output_tokens')??null,v('cost_usd')??null,now(),m.id,user);
 return c.json(view(await mine(c.env,user,m.id)));
});

/* ───────── Retour du dépôt vers la fiche ───────── */
async function readReturn(env:Env,user:string,m:Row){
 const base:any={pr_number:m.pr_number,linked:Boolean(m.pr_number&&m.repository_id),pr:null,checks:[],checks_state:'unread',checks_label:CHECKS_LABEL.unread,checks_source:null,review:null,error:null};
 if(!base.linked)return {...base,checks_label:'Aucune PR indiquée pour cette mission.',review:{current:null,older:0,label:'Aucune PR indiquée.'}};
 const repo=await one<Row>(env,'SELECT * FROM repositories WHERE id=? AND user_id=? AND project_id=?',m.repository_id,user,m.project_id);
 if(!repo)return {...base,error:'Le dépôt de cette mission n’existe plus dans le projet.'};
 let head:string|null=null;
 try{
  const {secret}=await credentialsFor(env,repo.connection_id,user,'read');
  const pr=(await jsonRequest('github',secret,'/repos/'+repo.full_name+'/pulls/'+m.pr_number)).data;
  head=/^[0-9a-f]{40}$/.test(String(pr?.head?.sha))?String(pr.head.sha):null;
  base.pr={title:String(pr?.title||'').slice(0,200),state:pr?.merged_at||pr?.merged?'merged':String(pr?.state||''),draft:Boolean(pr?.draft),url:'https://github.com/'+repo.full_name+'/pull/'+m.pr_number,head_sha:head};
  if(head){
   const loaded=await loadChecks(p=>jsonRequest('github',secret,p),'/repos/'+repo.full_name,head);
   base.checks=loaded.checks.slice(0,30);base.checks_source=loaded.source;
   base.checks_state=loaded.error?'unread':checksState(loaded.checks,loaded.partial);
  }
 }catch(e:any){base.error='GitHub n’a pas répondu : '+(String(e?.message||'erreur').slice(0,160));}
 base.checks_label=CHECKS_LABEL[base.checks_state as keyof typeof CHECKS_LABEL];
 const runs=await many<Row>(env,'SELECT pr_number,head_sha,status,created_at,completed_at FROM review_runs WHERE user_id=? AND repository_id=? AND pr_number=? ORDER BY created_at DESC LIMIT 20',user,repo.id,m.pr_number);
 base.review=reviewForSha(runs as any,m.pr_number,head);
 return base;
}
missions.get('/:id/return',async c=>{const user=userId(c),m=await mine(c.env,user,c.req.param('id'));return c.json(await readReturn(c.env,user,m));});
/** Verdict de Martin en un clic. La preuve (état des tests et revue au moment du verdict) est figée avec lui. */
missions.post('/:id/verdict',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=z.object({verdict:z.enum(VERDICTS),note:t(1000).default('')}).parse(await jsonBody(c));
 if(m.status==='draft')fail(409,'Une mission jamais préparée ne peut pas être jugée.');
 noSecret(d.note);
 const ret=await readReturn(c.env,user,m);
 const problem=verdictProblem(d.verdict,ret.checks_state,d.note,m.draft_source==='ai'&&!m.reviewed_at);if(problem)fail(409,problem);
 const evidence={at:now(),pr_number:m.pr_number,pr:ret.pr,checks_state:ret.checks_state,checks:ret.checks,review:ret.review?{label:ret.review.label,current:Boolean(ret.review.current)}:null,error:ret.error};
 await run(c.env,'UPDATE missions SET verdict=?,verdict_note=?,verdict_evidence=?,verdict_at=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=?',d.verdict,d.note,JSON.stringify(evidence),evidence.at,now(),m.id,user);
 await event(c.env,user,'mission_verdict','Verdict « '+VERDICT_LABEL[d.verdict]+' » : '+m.title,m.project_id,m.task_id);
 return c.json(view(await mine(c.env,user,m.id)));
});
