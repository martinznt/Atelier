import {Hono} from 'hono';
import {z} from 'zod';
import {credentialsFor} from './routes/connections.ts';
import {jsonRequest} from './connectors/http.ts';
import {generate} from './connectors/ai.ts';
import {ProviderError} from './connectors/http.ts';
import {recordConnectionQuota,rateLimitObservation} from './collaboration.ts';
import {readableQuota,reviewHandoff} from './review-team.mjs';
import {event,fail,jsonBody,many,now,one,owned,run,uid,userId} from './core.ts';
import {reviewPrompt,parseReviewResult,reviewRisk,type ReviewFile,type ReviewCheck} from './review-core.ts';
import {buildDiagnostic,type Stage} from './review-diagnostics.ts';
import {postReviewComment,commentFailureMessage} from './review-comment.ts';
import {planReview,REVIEW_MODES,type ReviewMode} from './review-plan.ts';
import {reviewEffort} from './review-effort.ts';
import {notVerified,disagreements} from './review-team.mjs';
import {availabilityOf,estimateTokens,storedFailure,failureLabel,type Availability,type FailureKind} from './ai-availability.ts';
import {selectCandidates,runWithRelay,AttemptError,type RelayResult} from './ai-relay.ts';
import {recordObservation,loadAiConnections,recentCalls,recordUsage,unavailable} from './ai-persist.ts';
import type {AppEnv,Env} from './types.ts';

/* Seules les connexions autorisées et testées par l’utilisateur sont acceptées. */
const aiChoice=z.object({connection_id:z.string().uuid(),model:z.string().min(1).max(160)});
const configuration=z.object({
 repository_id:z.string().uuid(),primary:aiChoice,secondary:aiChoice.nullable().default(null),
 enabled:z.boolean().default(false),post_comment:z.boolean().default(false),mode:z.enum(['economique','equilibre','approfondi']).default('equilibre'),relay:z.boolean().default(true),relay_max_attempts:z.number().int().min(1).max(5).default(3),daily_limit:z.number().int().min(1).max(4).default(2),share_consent:z.literal(true)
});
const prInput=z.object({repository_id:z.string().uuid(),pr_number:z.number().int().positive().max(10000000)});
export const reviews=new Hono<AppEnv>();
/* Protection contre les boucles : au plus 6 reprises automatiques par analyse, pendant 24 h au plus. */
const MAX_RESUMES=6,MAX_RESUME_AGE_MS=24*3600*1000;
/* Budget de lecture du diff par mode : plus de contexte seulement quand le mode le justifie (jetons = quota). */
const READ_BUDGET:Record<string,number>={economique:12000,equilibre:16000,approfondi:28000};

type Conf={id:string;user_id:string;project_id:string;repository_id:string;primary_connection_id:string;primary_model:string;secondary_connection_id:string|null;secondary_model:string|null;enabled:number;consent:number;daily_limit:number;post_comment?:number;review_mode?:string;relay?:number;relay_max_attempts?:number};
type Repo={id:string;user_id:string;project_id:string;connection_id:string;full_name:string};
type ReviewRun={id:string;user_id:string;project_id:string;repository_id:string;pr_number:number;head_sha:string;status:string;diagnostic?:string|null;resume_state?:string|null;created_at?:string};
async function getRepo(env:Env,id:string,user:string){
 return owned<Repo>(env,'repositories',id,user);
}
async function checkChoice(env:Env,user:string,input:{connection_id:string;model:string}){
 const {conn}=await credentialsFor(env,input.connection_id,user,'chat');
 if(!['openai','anthropic','gemini','mistral','groq'].includes(conn.provider)||!conn.api_consent||conn.status!=='connected')
  fail(403,'Cette API n’est pas disponible ou autorisée dans Atelier.');
 if(!JSON.parse(conn.models).includes(input.model))fail(400,'Modèle non confirmé : testez la connexion.');
}
async function githubToken(env:Env,repo:Repo){
 const {conn,secret}=await credentialsFor(env,repo.connection_id,repo.user_id,'read');
 if(conn.provider!=='github')fail(403,'Connexion GitHub requise.');
 return secret;
}
export async function queueReview(env:Env,config:Conf,repo:Repo,number:number,sha:string){
 if(!/^[0-9a-f]{40}$/i.test(sha))return false;
 const nowIso=now();
 if(config.relay!==0){
  // Relais actif : une analyse n'est créée que si au moins une IA autorisée est utilisable maintenant (aucun appel ni plafond gaspillé sinon).
  const connections=await loadAiConnections(env.DB,repo.user_id);
  if(!connections.some(c=>availabilityOf(c,{now:nowIso}).usable))return false;
 }else{
  const status=await one(env,'SELECT quota,status FROM connections WHERE id=? AND user_id=?',config.primary_connection_id,repo.user_id);
  if(!status||status.status!=='connected'||readableQuota(status.quota).status==='rate_limited')return false;
 }
 const id=uid(),at=now(),today=at.slice(0,10)+'T00:00:00.000Z';
 // Atomic D1 quota check; duplicate and concurrent events cannot overrun the
 // per-repository daily allowance nor the hard ceiling of eight per user.
 const result=await run(env,"INSERT OR IGNORE INTO review_runs(id,user_id,project_id,repository_id,pr_number,head_sha,status,created_at,updated_at) SELECT ?,?,?,?,?,?,'queued',?,? WHERE (SELECT COUNT(*) FROM review_runs WHERE user_id=? AND repository_id=? AND created_at>=?)<? AND (SELECT COUNT(*) FROM review_runs WHERE user_id=? AND created_at>=?)<8",id,repo.user_id,repo.project_id,repo.id,number,sha,at,at,repo.user_id,repo.id,today,config.daily_limit||2,repo.user_id,today);
 if(!result.meta.changes)return false;
 try{await env.TASKS.send({id,kind:'review'});}catch{/* Reprise par le cron ; aucun appel fournisseur n’a été fait. */}
 return true;
}
async function queueFromGithub(env:Env,config:Conf,repo:Repo,pr:number){
 const token=await githubToken(env,repo);
 const result=await jsonRequest('github',token,'/repos/'+repo.full_name+'/pulls/'+pr);
 const data=result.data;
 if(data.state!=='open'||data.head?.repo?.full_name!==repo.full_name)fail(400,'Cette PR est fermée ou provient d’un dépôt externe.');
 return {queued:await queueReview(env,config,repo,data.number,data.head.sha),sha:data.head.sha,message:'Si aucun traitement n’est créé, le commit est déjà analysé, un plafond journalier a été atteint ou aucune IA autorisée n’est disponible pour le moment.'};
}
reviews.get('/configs',async c=>{
 const project=z.string().uuid().parse(c.req.query('project'));
 await owned(c.env,'projects',project,userId(c));
 return c.json({items:await many(c.env,'SELECT rc.*,r.full_name FROM review_configs rc JOIN repositories r ON r.id=rc.repository_id WHERE rc.project_id=? AND rc.user_id=? ORDER BY rc.updated_at DESC',project,userId(c))});
});
reviews.get('/runs',async c=>{
 const project=z.string().uuid().parse(c.req.query('project'));
 await owned(c.env,'projects',project,userId(c));
 const rows=await many(c.env,'SELECT rr.*,r.full_name FROM review_runs rr JOIN repositories r ON r.id=rr.repository_id WHERE rr.project_id=? AND rr.user_id=? ORDER BY rr.created_at DESC LIMIT 30',project,userId(c));
 return c.json({items:rows.map(r=>({...r,report:r.report?JSON.parse(r.report):null,diagnostic:r.diagnostic?JSON.parse(r.diagnostic):null}))});
});
/* Consommation observée par Atelier (30 jours) : appels réels par fournisseur, modèle et tâche. Ce n'est pas le quota du fournisseur. */
reviews.get('/usage',async c=>{
 const since=new Date(Date.now()-30*86400000).toISOString();
 try{
  const rows=await many(c.env,"SELECT provider,model,task_kind,COUNT(*) AS calls,SUM(outcome='completed') AS completed,SUM(outcome='refused') AS refused,SUM(outcome='interrupted') AS interrupted,SUM(input_tokens) AS input_tokens,SUM(output_tokens) AS output_tokens,SUM(outcome='completed' AND input_tokens IS NULL) AS unknown_token_calls FROM ai_usage WHERE user_id=? AND started_at>=? GROUP BY provider,model,task_kind ORDER BY calls DESC LIMIT 60",userId(c),since);
  return c.json({items:rows,since,note:'Consommation observée par Atelier uniquement ; les quotas officiels restent chez le fournisseur.'});
 }catch{return c.json({items:[],since,note:'Historique indisponible (migration 0013 non appliquée).'});}
});
reviews.get('/pulls',async c=>{
 const id=z.string().uuid().parse(c.req.query('repository_id'));
 const repo=await getRepo(c.env,id,userId(c)),token=await githubToken(c.env,repo);
 const result=await jsonRequest('github',token,'/repos/'+repo.full_name+'/pulls?state=open&per_page=30');
 return c.json({items:result.data.filter((p:any)=>p.head?.repo?.full_name===repo.full_name).map((p:any)=>({number:p.number,title:p.title,sha:p.head.sha,draft:p.draft,updated_at:p.updated_at}))});
});
reviews.post('/configs',async c=>{
 const input=configuration.parse(await jsonBody(c));
 const user=userId(c),repo=await getRepo(c.env,input.repository_id,user);
 await checkChoice(c.env,user,input.primary);
 if(input.secondary){if(input.secondary.connection_id===input.primary.connection_id)fail(400,'Choisissez deux connexions indépendantes.');await checkChoice(c.env,user,input.secondary);}
 const at=now();
 const baseArgs=[uid(),user,repo.project_id,repo.id,input.primary.connection_id,input.primary.model,input.secondary?.connection_id||null,input.secondary?.model||null,Number(input.enabled),at,at,input.daily_limit];
 if(input.post_comment){
  // La publication de commentaires exige un accès GitHub explicitement autorisé en écriture dans Atelier.
  await credentialsFor(c.env,repo.connection_id,user,'write');
 }
 // Variantes de l'enregistrement : chaque colonne optionnelle vient d'une migration additive récente.
 const optional=[{col:'post_comment',value:Number(input.post_comment),needed:input.post_comment},{col:'review_mode',value:input.mode,needed:input.mode!=='equilibre'},{col:'relay',value:Number(input.relay),needed:!input.relay},{col:'relay_max_attempts',value:input.relay_max_attempts,needed:input.relay_max_attempts!==3}];
 // Plus récentes d'abord : on retire les colonnes absentes une par une, sans jamais perdre un réglage non défaut.
 const variants=[optional,optional.filter(o=>o.col!=='relay'&&o.col!=='relay_max_attempts'),optional.filter(o=>o.col==='post_comment'),[]].filter(v=>optional.every(o=>!o.needed||v.some(x=>x.col===o.col)));
 let saved=false;
 for(const variant of variants){
  const cols=variant.map(o=>','+o.col).join(''),marks=variant.map(()=>',?').join(''),updates=variant.map(o=>','+o.col+'=excluded.'+o.col).join('');
  try{
   await run(c.env,"INSERT INTO review_configs(id,user_id,project_id,repository_id,primary_connection_id,primary_model,secondary_connection_id,secondary_model,enabled,consent,created_at,updated_at,daily_limit"+cols+") VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?"+marks+") ON CONFLICT(user_id,repository_id) DO UPDATE SET primary_connection_id=excluded.primary_connection_id,primary_model=excluded.primary_model,secondary_connection_id=excluded.secondary_connection_id,secondary_model=excluded.secondary_model,enabled=excluded.enabled,consent=1,updated_at=excluded.updated_at,daily_limit=excluded.daily_limit"+updates,...baseArgs,...variant.map(o=>o.value));
   saved=true;break;
  }catch{/* colonne absente : variante suivante */}
 }
 if(!saved)fail(409,'Une migration récente manque (0011 commentaires, 0012 modes, 0013 relais) : elle est additive, à appliquer avant d’activer cette option.');
 return c.json({ok:true,message:input.enabled?'Relecture périodique activée pour les nouvelles versions de PR.':'Configuration enregistrée ; aucun lancement automatique.'});
});
reviews.post('/start',async c=>{
 const input=prInput.parse(await jsonBody(c)),user=userId(c);
 const repo=await getRepo(c.env,input.repository_id,user);
 const cfg=await one<Conf>(c.env,'SELECT * FROM review_configs WHERE repository_id=? AND user_id=?',repo.id,user);
 if(!cfg||!cfg.consent)fail(409,'Configurez d’abord les assistants et le consentement explicite.');
 await checkChoice(c.env,user,{connection_id:cfg.primary_connection_id,model:cfg.primary_model});
 if(cfg.secondary_connection_id&&cfg.secondary_model)await checkChoice(c.env,user,{connection_id:cfg.secondary_connection_id,model:cfg.secondary_model});
 return c.json(await queueFromGithub(c.env,cfg,repo,input.pr_number),202);
});

reviews.post('/runs/:id/retry',async c=>{
 const user=userId(c),id=z.string().uuid().parse(c.req.param('id'));
 const row=await one<ReviewRun>(c.env,'SELECT * FROM review_runs WHERE id=? AND user_id=?',id,user);
 if(!row)fail(404,'Cette analyse est introuvable ou ne vous appartient pas.');
 const d=row.diagnostic?JSON.parse(row.diagnostic):null;
 const body=z.object({acknowledge_uncertain:z.boolean().default(false)}).parse(await c.req.json().catch(()=>({})));
 if(row.status!=='interrupted')fail(409,'Seules les analyses interrompues peuvent être relancées.');
 if((d?.attempts||0)>=5)fail(409,'Nombre maximal de reprises atteint : corrigez la cause avant de lancer une nouvelle PR.');
 // Sans diagnostic (analyse antérieure) ou si la reprise n'est pas jugée sûre, l'utilisateur doit confirmer
 // qu'un appel IA a pu consommer du quota ; la reprise n'est jamais automatique.
 if((!d||!d.retry_allowed)&&!body.acknowledge_uncertain)fail(409,'Reprise à confirmer : un appel IA a pu être effectué ou la cause (jeton, quota) est à corriger. Confirmez explicitement pour relancer.');
 const changed=await run(c.env,"UPDATE review_runs SET status='queued',error=NULL,completed_at=NULL,updated_at=? WHERE id=? AND user_id=? AND status='interrupted'",now(),id,user);
 if(!changed.meta.changes)fail(409,'Cette analyse a déjà été relancée.');
 try{await c.env.TASKS.send({id,kind:'review'});}catch{/* repris par le cron */}
 return c.json({ok:true},202);
});
/* « J'ai validé, reprendre » : relance uniquement les vérifications non terminées d'une analyse partielle qui attendait une action de l'utilisateur. */
reviews.post('/runs/:id/resume',async c=>{
 const user=userId(c),id=z.string().uuid().parse(c.req.param('id'));
 const row=await one<ReviewRun&{report:string|null}>(c.env,'SELECT * FROM review_runs WHERE id=? AND user_id=?',id,user);
 if(!row)fail(404,'Cette analyse est introuvable ou ne vous appartient pas.');
 const report=row.report?JSON.parse(row.report):null;
 const pending=(report?.reviewers||[]).filter((r:any)=>!r.review);
 if(row.status!=='partial'||!pending.length)fail(409,'Aucune vérification en attente de reprise pour cette analyse.');
 const prior=Number((row.resume_state?JSON.parse(row.resume_state):{}).resumes)||0;
 if(prior>=MAX_RESUMES)fail(409,'Nombre maximal de reprises atteint pour cette analyse.');
 const changed=await run(c.env,"UPDATE review_runs SET status='queued',error=NULL,completed_at=NULL,resume_at=NULL,resume_state=?,updated_at=? WHERE id=? AND user_id=? AND status='partial'",JSON.stringify({done:(report.reviewers||[]).filter((r:any)=>r.review),resumes:prior+1}),now(),id,user).catch(()=>null);
 if(!changed||!changed.meta.changes)fail(409,'Cette analyse a déjà été relancée ou la reprise n’est pas disponible (migration 0013).');
 try{await c.env.TASKS.send({id,kind:'review'});}catch{/* repris par le planificateur */}
 return c.json({ok:true},202);
});
/* Les queues transportent uniquement l’identifiant. Le contexte est récupéré
   depuis D1, de sorte qu’un redémarrage ne perd pas les résultats. */
export async function executeReview(env:Env,id:string){
 const date=now();
 const claimSql=(withResume:boolean)=>"UPDATE review_runs SET status='running',updated_at=? WHERE id=? AND status='queued'"+(withResume?" AND (resume_at IS NULL OR resume_at<=?)":"")+" AND EXISTS(SELECT 1 FROM users u WHERE u.id=review_runs.user_id AND u.deleted_at IS NULL) RETURNING *";
 let row:ReviewRun|null;
 // Une analyse en attente de réinitialisation d'une limite n'est pas lancée avant sa date de reprise (colonne ajoutée par la migration 0013).
 try{row=await env.DB.prepare(claimSql(true)).bind(date,id,date).first<ReviewRun>();}
 catch{row=await env.DB.prepare(claimSql(false)).bind(date,id).first<ReviewRun>();}
 if(!row)return;
 let stage:Stage='config',lastOk:Stage|null=null,previous:{attempts?:number}|null=null;
 try{previous=row.diagnostic?JSON.parse(row.diagnostic):null;}catch{/* diagnostic antérieur illisible : ignoré */}
 const attempts=(previous?.attempts||0)+1;
 const mark=async(next:Stage)=>{lastOk=stage;stage=next;try{await run(env,'UPDATE review_runs SET stage=?,updated_at=? WHERE id=?',next,now(),id);}catch{/* le suivi ne doit pas bloquer l’analyse */}};
 try{
  const cfg=await one<Conf>(env,'SELECT * FROM review_configs WHERE repository_id=? AND user_id=?',row.repository_id,row.user_id);
  const repo=await getRepo(env,row.repository_id,row.user_id);
  if(!cfg||!cfg.consent)throw Error('Configuration ou consentement indisponible.');
  const token=await githubToken(env,repo),base='/repos/'+repo.full_name;
  await mark('github_pr');
  const p=(await jsonRequest('github',token,base+'/pulls/'+row.pr_number)).data;
  if(p.head?.sha!==row.head_sha||p.state!=='open'||p.head?.repo?.full_name!==repo.full_name){
   await run(env,"UPDATE review_runs SET status='stale',error=?,updated_at=?,completed_at=? WHERE id=?",'La PR a changé avant l’analyse : nouveau commit requis.',now(),now(),id);return;
  }
  await mark('github_files');
  const fileRes=await jsonRequest('github',token,base+'/pulls/'+row.pr_number+'/files?per_page=60');
  // Les tests GitHub sont utiles mais non indispensables : un refus (jeton sans droit Checks)
  // ne doit pas perdre toute l'analyse. L'absence est signalée au rapport, jamais déguisée en succès.
  await mark('github_checks');
  let checkRes:{data:any;hasNext:boolean},checksDiagnostic:ReturnType<typeof buildDiagnostic>|null=null;
  try{checkRes=await jsonRequest('github',token,base+'/commits/'+row.head_sha+'/check-runs?per_page=30');}
  catch(error){checkRes={data:{check_runs:[]},hasNext:false};checksDiagnostic=buildDiagnostic({stage:'github_checks',lastOk:'github_files',error,provider:'github'});}
  const files=fileRes.data as ReviewFile[],checks:ReviewCheck[]=(checkRes.data.check_runs||[]).map((x:any)=>({name:x.name,status:x.status,conclusion:x.conclusion}));
  await mark('ai_call');
  const risk=reviewRisk(files),reports:any[]=[];
  const mode=(REVIEW_MODES as string[]).includes(String(cfg.review_mode))?cfg.review_mode as ReviewMode:'equilibre';
  const relayOn=cfg.relay!==0,maxAttempts=Math.min(5,Math.max(1,Number(cfg.relay_max_attempts)||3));
  const limited=async(id:string|null)=>{if(!id)return false;const q=await one(env,'SELECT quota FROM connections WHERE id=? AND user_id=?',id,row.user_id);return readableQuota(q?.quota).status==='rate_limited';};
  const hasSecondary=Boolean(cfg.secondary_connection_id&&cfg.secondary_model);
  // Relais actif : une IA limitée est remplacée au moment de l'appel plutôt que retirée du plan.
  const plan=planReview({mode,risk,files,checks,checksKnown:!checksDiagnostic,hasSecondary,primaryLimited:relayOn?false:await limited(cfg.primary_connection_id),secondaryLimited:relayOn||!hasSecondary?false:await limited(cfg.secondary_connection_id)});
  const MAX_CALLS_PER_REVIEW=6;
  let totalCalls=0;const usedProviders:string[]=[];
  const aiConnections=await loadAiConnections(env.DB,row.user_id),usage24=await recentCalls(env.DB,row.user_id,now());
  // Reprise après réinitialisation d'une limite : les vérifications déjà terminées sont conservées et ne sont pas refaites.
  let resumeState:{done?:any[];resumes?:number}|null=null;
  try{resumeState=row.resume_state?JSON.parse(row.resume_state):null;}catch{/* état illisible : analyse complète */}
  const doneReports:any[]=Array.isArray(resumeState?.done)?resumeState!.done!:[];
  const resumes=Number(resumeState?.resumes)||0;
  reports.push(...doneReports);
  const doneRoles=new Set(doneReports.map(r=>r.role));
  for(const planned of plan.assigned){
   if(doneRoles.has(planned.role))continue;
   const configured=[{connection_id:cfg.primary_connection_id,model:cfg.primary_model},...(hasSecondary?[{connection_id:cfg.secondary_connection_id as string,model:cfg.secondary_model as string}]:[])];
   const preferred=planned.use==='secondary'&&hasSecondary?[configured[1],configured[0]]:configured;
   const prompt=reviewPrompt({repo:repo.full_name,pr:row.pr_number,sha:row.head_sha,title:String(p.title||'').slice(0,200),files,checks,role:planned.role,maxChars:READ_BUDGET[mode]});
   const estimate=estimateTokens(prompt.system.length+prompt.user.length,2800);
   const budget=Math.min(maxAttempts,MAX_CALLS_PER_REVIEW-totalCalls);
   const selection=selectCandidates({connections:aiConnections,preferred,allowRelay:relayOn,now:now(),estimateTokens:estimate,avoidProviders:planned.role==='correctness'?[]:usedProviders,usage:usage24});
   const fresh=new Map<string,{conn:any;secret:string}>();
   const tokens:Record<string,{input?:number;output?:number}>={};
   const relay:RelayResult<{provider:string;model:string;output:string;think:ReturnType<typeof reviewEffort>}>=budget<=0
    ?{status:'exhausted',attempts:[],excluded:selection.excluded}
    :await runWithRelay({
     candidates:selection.candidates,excluded:selection.excluded,maxAttempts:budget,now,
     // État relu juste avant chaque appel : une autre tâche a pu signaler une limite entre-temps.
     recheck:async c=>{
      try{const cs=await credentialsFor(env,c.connection_id,row.user_id,'chat');fresh.set(c.connection_id,cs);return availabilityOf(cs.conn,{model:c.model,now:now(),estimateTokens:estimate}) as Availability;}
      catch{return unavailable('Connexion indisponible (accès refusé, expiré ou compte désactivé).');}
     },
     onFailure:async(c,cl)=>{
      // Seuls les refus qui renseignent sur la capacité du fournisseur sont mémorisés.
      if(['request_rejected','unknown','interrupted'].includes(cl.kind))return;
      const snapshot=fresh.get(c.connection_id)?.conn.secret;
      if(snapshot)await recordObservation(env.DB,c.connection_id,row.user_id,snapshot,{type:'failure',failure:storedFailure(cl,c.model,now())},now());
     },
     attempt:async c=>{
      totalCalls++;
      const cs=fresh.get(c.connection_id);if(!cs)throw new AttemptError(new Error('Connexion non préparée'),true);
      const think=reviewEffort({mode,role:planned.role,risk,provider:cs.conn.provider,model:c.model});
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),think.effort==='high'?70000:45000);
      let output='',model=c.model,input:number|undefined,out:number|undefined,accepted=false;
      try{
       for await(const delta of generate(cs.conn.provider,cs.secret,c.model,[{role:'user',content:prompt.system+'\n\n'+prompt.user}],think.maxTokens,controller.signal,think.effort?{reasoningEffort:think.effort}:{})){
        if(delta.quota){accepted=true;try{await recordObservation(env.DB,c.connection_id,row.user_id,cs.conn.secret,{type:'success',model:c.model,headers:delta.quota as any},now());}catch{/* diagnostic seulement */}}
        output+=delta.text||'';if(delta.model)model=delta.model;if(delta.input!==undefined)input=delta.input;if(delta.output!==undefined)out=delta.output;
        if(output.length>14000){controller.abort();throw Error('Réponse trop volumineuse.');}
       }
      }catch(error){throw new AttemptError(error,accepted,output);}
      finally{clearTimeout(timer);}
      tokens[c.connection_id+'\n'+c.model]={input,output:out};
      return {provider:cs.conn.provider,model,output,think,input};
     }
    });
   await recordUsage(env.DB,row.user_id,{task_kind:'review',task_id:id,role:planned.role,attempts:relay.attempts,tokens});
   const relayed=relay.attempts.some(a=>a.outcome==='refused'||a.outcome==='skipped');
   const base={role:planned.role,reason:planned.reason,attempts:relay.attempts,excluded:relay.excluded,relayed:relayed&&relay.status==='completed'};
   if(relay.status==='completed'&&relay.value&&relay.used){
    const v=relay.value as any;usedProviders.push(v.provider);
    reports.push({...base,provider:v.provider,model:v.model,reasoning:{effort:v.think.effort,reason:v.think.reason},coverage:prompt.coverage,review:parseReviewResult(v.output),input_tokens:v.input??tokens[relay.used.connection_id+'\n'+relay.used.model]?.input??0});
   }else if(relay.status==='interrupted'){
    const d=buildDiagnostic({stage:'ai_call',lastOk:'github_checks',error:new ProviderError(504,'timeout'),provider:relay.used?.provider||null,aiStarted:true,attempts});
    reports.push({...base,provider:relay.used?.provider,model:relay.used?.model,error:'Analyse incomplète : la réponse a été interrompue après son début. Aucun autre fournisseur n’a été sollicité automatiquement (risque de double consommation). Le texte partiel est conservé et n’est pas un résultat complet.',partial:{text:String(relay.partial||'').slice(0,6000),complete:false},diagnostic:d});
   }else{
    const last=[...relay.attempts].reverse().find(a=>a.outcome==='refused');
    const reasons=relay.excluded.map(e=>e.label+' : '+e.reason).slice(0,6);
    const message=relay.status==='no_candidate'
     ?'Aucune IA autorisée n’est disponible pour cette vérification.'+(reasons.length?' '+reasons.join(' · '):'')
     :relay.status==='stopped'?'Le refus du fournisseur concerne la demande elle-même : un autre fournisseur ne la résoudrait pas, aucun relais n’a été tenté.'
     :'Toutes les IA essayées étaient limitées ou indisponibles. Aucun résultat inventé.';
    // Reprise automatique possible seulement si rien n'a été généré et si au moins une date de fin de pause est connue (fournisseur, ou pause de prudence d'Atelier).
    const times=relay.status==='exhausted'||relay.status==='no_candidate'
     ?[...relay.attempts.filter(a=>a.outcome==='refused'&&a.until).map(a=>({at:a.until as string,source:a.until_source})),...relay.excluded.filter(e=>e.until).map(e=>({at:e.until as string,source:e.until_source}))]
     :[];
    const earliest=times.sort((x,y)=>Date.parse(x.at)-Date.parse(y.at))[0];
    // Refus qui exigent une action de l'utilisateur (clé, permission, crédit) : pas de date de reprise, l'analyse attend sa réponse pendant que le reste continue.
    const blockers=[...relay.attempts.filter(a=>a.outcome==='refused'&&a.kind&&['auth','permission','billing'].includes(a.kind)).map(a=>({label:a.label,kind:a.kind as string})),...relay.excluded.filter(e=>e.kind&&['auth','permission','billing'].includes(e.kind)).map(e=>({label:e.label,kind:e.kind as string}))];
    const needsUser=!earliest&&blockers.length>0&&(relay.status==='exhausted'||relay.status==='no_candidate');
    reports.push({...base,...(earliest?{waiting:{until:earliest.at,source:earliest.source}}:{}),...(needsUser?{needs_user:blockers.slice(0,4).map(b=>({connection:b.label,kind:b.kind,failure:failureLabel[b.kind as FailureKind],action:'Vérifiez ou remplacez l’accès « '+b.label+' » dans Réglages → Connexions, puis cliquez sur « Tester l’accès ».'}))}:{}),provider:last?.provider,model:last?.model,error:message,diagnostic:{stage:'ai_call',last_ok_stage:'github_checks',category:last?.kind&&/rate|quota/.test(last.kind)?'rate_limit':last?.kind==='auth'||last?.kind==='billing'?'auth':last?.kind==='permission'?'permission':'unknown',code:last?.kind||relay.status,provider:last?.provider||null,http_status:null,ai_started:false,ai_result:'none',retry_allowed:true,message,attempts}});
   }
  }
  const result:{[key:string]:any}={repo:repo.full_name,pr_number:row.pr_number,head_sha:row.head_sha,risk,checks,checks_partial:checkRes.hasNext,files_partial:fileRes.hasNext,reviewers:reports,plan:{mode:plan.mode,summary:plan.summary,skipped:plan.skipped},relay:{enabled:relayOn,max_attempts_per_role:maxAttempts,calls:totalCalls},reviewed_at:now(),checks_unavailable:checksDiagnostic?checksDiagnostic.message:null,warning:'Revue IA seulement : les alertes exigent une reproduction ; aucun test n’a été exécuté par Atelier.'};
  result.coverage=reports.map((r:any)=>r.coverage).find(Boolean)||null;
  result.not_verified=notVerified(result);result.disagreements=disagreements(result);
  if(resumes>0)result.resumed={count:resumes};
  // « À faire de votre part » : ce qui attend une validation ou une autorisation, sans bloquer les autres analyses.
  const todo:{what:string;action:string}[]=[];
  if(checksDiagnostic&&['permission','auth'].includes(checksDiagnostic.category))todo.push({what:'Lecture des tests GitHub refusée',action:'Ajoutez la lecture de « Checks » au jeton GitHub (ce dépôt seulement). Les prochaines analyses liront les tests.'});
  for(const r of reports)for(const n of (r.needs_user||[]))todo.push({what:n.failure+' : '+n.connection,action:n.action});
  if(todo.length){
   result.needs_user=todo;
   // Notification persistante (écran Activité) : l'analyse attend une action de l'utilisateur, les autres travaux continuent.
   try{await event(env,row.user_id,'needs_user','Atelier attend votre réponse pour la PR #'+row.pr_number+' : '+todo.map(t=>t.what).join(' ; ')+'. Les autres analyses continuent.',row.project_id);}catch{/* le journal ne bloque pas */}
  }
  const waiting=reports.filter(r=>r.waiting);
  const ageMs=Date.now()-Date.parse(row.created_at||date);
  if(waiting.length&&resumes<MAX_RESUMES&&ageMs<MAX_RESUME_AGE_MS){
   // Les limites atteintes se réinitialisent : on reprend plus tard, uniquement ce qui n'est pas terminé.
   const at=waiting.map(r=>Date.parse(r.waiting.until)).sort((x,y)=>x-y)[0];
   const resumeAt=new Date(Math.max(at,Date.now()+1000)).toISOString();
   const source=waiting.find(r=>Date.parse(r.waiting.until)===at)?.waiting.source||null;
   result.waiting={until:resumeAt,source,roles:waiting.map(r=>r.role),resumes:resumes+1,max_resumes:MAX_RESUMES};
   try{
    await run(env,"UPDATE review_runs SET status='queued',report=?,resume_at=?,resume_state=?,stage=NULL,diagnostic=NULL,error=NULL,completed_at=NULL,updated_at=? WHERE id=?",JSON.stringify(result),resumeAt,JSON.stringify({done:reports.filter(r=>!r.waiting),resumes:resumes+1}),now(),id);
    try{await env.TASKS.send({id,kind:'review'},{delaySeconds:Math.min(43200,Math.max(1,Math.ceil((Date.parse(resumeAt)-Date.now())/1000)))});}catch{/* repris par la passe du planificateur */}
    try{await event(env,row.user_id,'review_waiting','Analyse de la PR #'+row.pr_number+' en pause : limite d’utilisation atteinte. Reprise automatique prévue après '+resumeAt+(source==='provider'?' (date indiquée par le fournisseur).':' (pause de prudence d’Atelier ; aucune date fournie par le fournisseur).')+' Seules les vérifications non terminées seront refaites.',row.project_id);}catch{/* le journal ne bloque pas */}
    return;
   }catch{/* colonnes de reprise absentes (migration 0013) : enregistrement normal ci-dessous */}
  }
  result.handoff=reviewHandoff(result);
  await mark('save');
  const success=reports.every(r=>r.review),state=success?'completed':'partial';
  // Tolérance : si la migration 0010 n'est pas encore appliquée, le rapport est tout de même enregistré.
  try{await run(env,'UPDATE review_runs SET status=?,report=?,stage=NULL,diagnostic=NULL,resume_at=NULL,resume_state=NULL,updated_at=?,completed_at=? WHERE id=?',state,JSON.stringify(result),now(),now(),id);}
  catch{await run(env,'UPDATE review_runs SET status=?,report=?,updated_at=?,completed_at=? WHERE id=?',state,JSON.stringify(result),now(),now(),id);}
  if(cfg.post_comment===1&&result.handoff){
   // Le rapport est déjà enregistré : un échec de publication ne peut ni l'effacer ni interrompre la revue.
   try{
    const writer=await credentialsFor(env,repo.connection_id,row.user_id,'write'); // droit d'écriture revérifié au moment de publier
    const posted=await postReviewComment(writer.secret,repo.full_name,row.pr_number,{sha:row.head_sha,handoff:result.handoff});
    result.comment={posted:true,url:posted.url};
   }catch(error){result.comment={posted:false,message:commentFailureMessage(error)};}
   try{await run(env,'UPDATE review_runs SET report=?,updated_at=? WHERE id=?',JSON.stringify(result),now(),id);}catch{/* conserver le rapport déjà enregistré */}
  }
 }catch(error){
  // Étape et catégorie conservées ; aucun détail brut (URL, en-têtes, secrets) n'est enregistré.
  const d=buildDiagnostic({stage,lastOk,error,provider:stage.startsWith('github')?'github':null,attempts});
  try{await run(env,"UPDATE review_runs SET status='interrupted',error=?,stage=?,diagnostic=?,updated_at=?,completed_at=? WHERE id=?",d.message,stage,JSON.stringify(d),now(),now(),id);}
  catch{await run(env,"UPDATE review_runs SET status='interrupted',error=?,updated_at=?,completed_at=? WHERE id=?",d.message,now(),now(),id);}
 }
}
/* Activé uniquement après consentement explicite. Maximum deux PR nouvelles à
   chaque passage, pour ne pas monopoliser Cloudflare ni les quotas des API. */
export async function maintenanceReviews(env:Env){
 const stuck=await many<{id:string;stage:string|null}>(env,"SELECT * FROM review_runs WHERE status='running' AND updated_at<?",new Date(Date.now()-12*60000).toISOString());
 for(const r of stuck){
  // Délai d'exécution Worker dépassé : à l'étape IA le résultat est inconnu, donc aucune reprise.
  const stage=(r.stage as Stage)||'config',d=buildDiagnostic({stage,lastOk:null,error:{status:504,code:'timeout'},aiStarted:stage==='ai_call'});
  try{await run(env,"UPDATE review_runs SET status='interrupted',error=?,diagnostic=?,updated_at=? WHERE id=? AND status='running'",d.message,JSON.stringify(d),now(),r.id);}
  catch{await run(env,"UPDATE review_runs SET status='interrupted',error=?,updated_at=? WHERE id=? AND status='running'",d.message,now(),r.id);}
 }
 let pending:{id:string}[];
 try{pending=await many(env,"SELECT id FROM review_runs WHERE status='queued' AND (resume_at IS NULL OR resume_at<=?) ORDER BY created_at LIMIT 5",now());}
 catch{pending=await many(env,"SELECT id FROM review_runs WHERE status='queued' ORDER BY created_at LIMIT 5");}
 for(const job of pending)try{await env.TASKS.send({id:job.id,kind:'review'});}catch{}
 const configs=await many<Conf>(env,"SELECT rc.* FROM review_configs rc JOIN users u ON u.id=rc.user_id WHERE rc.enabled=1 AND rc.consent=1 AND u.deleted_at IS NULL ORDER BY rc.updated_at DESC LIMIT 2");
 let scheduled=0;
 for(const cfg of configs){
  try{
   const repo=await getRepo(env,cfg.repository_id,cfg.user_id),token=await githubToken(env,repo);
   const prs=(await jsonRequest('github',token,'/repos/'+repo.full_name+'/pulls?state=open&sort=updated&per_page=5')).data;
   for(const p of prs){
    if(scheduled>=2)break;
    if(p.head?.repo?.full_name!==repo.full_name)continue;
    if(await queueReview(env,cfg,repo,p.number,p.head.sha))scheduled++;
   }
  }catch{/* Une connexion expirée ne doit pas bloquer les autres tâches Atelier. */}
 }
}
