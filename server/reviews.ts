import {Hono} from 'hono';
import {z} from 'zod';
import {credentialsFor} from './routes/connections.ts';
import {jsonRequest} from './connectors/http.ts';
import {generate} from './connectors/ai.ts';
import {ProviderError} from './connectors/http.ts';
import {recordConnectionQuota,rateLimitObservation} from './collaboration.ts';
import {readableQuota,reviewHandoff} from './review-team.mjs';
import {fail,jsonBody,many,now,one,owned,run,uid,userId} from './core.ts';
import {reviewPrompt,parseReviewResult,reviewRisk,type ReviewFile,type ReviewCheck} from './review-core.ts';
import {buildDiagnostic,type Stage} from './review-diagnostics.ts';
import {postReviewComment,commentFailureMessage} from './review-comment.ts';
import type {AppEnv,Env} from './types.ts';

/* Seules les connexions autorisées et testées par l’utilisateur sont acceptées. */
const aiChoice=z.object({connection_id:z.string().uuid(),model:z.string().min(1).max(160)});
const configuration=z.object({
 repository_id:z.string().uuid(),primary:aiChoice,secondary:aiChoice.nullable().default(null),
 enabled:z.boolean().default(false),post_comment:z.boolean().default(false),daily_limit:z.number().int().min(1).max(4).default(2),share_consent:z.literal(true)
});
const prInput=z.object({repository_id:z.string().uuid(),pr_number:z.number().int().positive().max(10000000)});
export const reviews=new Hono<AppEnv>();

type Conf={id:string;user_id:string;project_id:string;repository_id:string;primary_connection_id:string;primary_model:string;secondary_connection_id:string|null;secondary_model:string|null;enabled:number;consent:number;daily_limit:number;post_comment?:number};
type Repo={id:string;user_id:string;project_id:string;connection_id:string;full_name:string};
type ReviewRun={id:string;user_id:string;project_id:string;repository_id:string;pr_number:number;head_sha:string;status:string;diagnostic?:string|null};
async function getRepo(env:Env,id:string,user:string){
 return owned<Repo>(env,'repositories',id,user);
}
async function checkChoice(env:Env,user:string,input:{connection_id:string;model:string}){
 const {conn}=await credentialsFor(env,input.connection_id,user,'chat');
 if(!['openai','anthropic','gemini','mistral','groq'].includes(conn.provider)||!conn.api_consent||conn.status!=='connected')
  fail(403,'Cette API n’est pas disponible ou autorisée dans Atelier.');
 if(!JSON.parse(conn.models).includes(input.model))fail(400,'Modèle non confirmé : testez la connexion.');
 if(readableQuota(conn.quota).status==='rate_limited')fail(429,'Cette connexion a signalé une limite : réactivez-la seulement après vérification chez le fournisseur.');
}
async function githubToken(env:Env,repo:Repo){
 const {conn,secret}=await credentialsFor(env,repo.connection_id,repo.user_id,'read');
 if(conn.provider!=='github')fail(403,'Connexion GitHub requise.');
 return secret;
}
export async function queueReview(env:Env,config:Conf,repo:Repo,number:number,sha:string){
 if(!/^[0-9a-f]{40}$/i.test(sha))return false;
 const status=await one(env,'SELECT quota,status FROM connections WHERE id=? AND user_id=?',config.primary_connection_id,repo.user_id);
 if(!status||status.status!=='connected'||readableQuota(status.quota).status==='rate_limited')return false;
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
 return {queued:await queueReview(env,config,repo,data.number,data.head.sha),sha:data.head.sha,message:'Si aucun traitement n’est créé, le commit est déjà analysé ou un plafond journalier a été atteint.'};
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
 const baseArgs=[uid(),user,repo.project_id,repo.id,input.primary.connection_id,input.primary.model,input.secondary?.connection_id||null,input.secondary?.model||null,Number(input.enabled),at,at,input.daily_limit] as const;
 if(input.post_comment){
  // La publication de commentaires exige un accès GitHub explicitement autorisé en écriture dans Atelier.
  await credentialsFor(c.env,repo.connection_id,user,'write');
 }
 try{await run(c.env,"INSERT INTO review_configs(id,user_id,project_id,repository_id,primary_connection_id,primary_model,secondary_connection_id,secondary_model,enabled,consent,created_at,updated_at,daily_limit,post_comment) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?) ON CONFLICT(user_id,repository_id) DO UPDATE SET primary_connection_id=excluded.primary_connection_id,primary_model=excluded.primary_model,secondary_connection_id=excluded.secondary_connection_id,secondary_model=excluded.secondary_model,enabled=excluded.enabled,consent=1,updated_at=excluded.updated_at,daily_limit=excluded.daily_limit,post_comment=excluded.post_comment",...baseArgs,Number(input.post_comment));}
 catch(error){
  if(input.post_comment)fail(409,'La migration 0011_review_comment.sql manque : elle est additive, à appliquer avant d’activer les commentaires.');
  await run(c.env,"INSERT INTO review_configs(id,user_id,project_id,repository_id,primary_connection_id,primary_model,secondary_connection_id,secondary_model,enabled,consent,created_at,updated_at,daily_limit) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?) ON CONFLICT(user_id,repository_id) DO UPDATE SET primary_connection_id=excluded.primary_connection_id,primary_model=excluded.primary_model,secondary_connection_id=excluded.secondary_connection_id,secondary_model=excluded.secondary_model,enabled=excluded.enabled,consent=1,updated_at=excluded.updated_at,daily_limit=excluded.daily_limit",...baseArgs);
 }
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
/* Les queues transportent uniquement l’identifiant. Le contexte est récupéré
   depuis D1, de sorte qu’un redémarrage ne perd pas les résultats. */
export async function executeReview(env:Env,id:string){
 const date=now();
 const row=await env.DB.prepare("UPDATE review_runs SET status='running',updated_at=? WHERE id=? AND status='queued' AND EXISTS(SELECT 1 FROM users u WHERE u.id=review_runs.user_id AND u.deleted_at IS NULL) RETURNING *").bind(date,id).first<ReviewRun>();
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
  const assigned=[
   {id:cfg.primary_connection_id,model:cfg.primary_model,role:'correctness' as const},
   ...(cfg.secondary_connection_id&&cfg.secondary_model&&risk!=='simple'?[{id:cfg.secondary_connection_id,model:cfg.secondary_model,role:'security' as const}]:[])
  ];
  for(const reviewer of assigned){
   let activeSecretSnapshot:string|null=null,aiStarted=false,providerName:string|null=null;
   try{
    const {conn,secret}=await credentialsFor(env,reviewer.id,row.user_id,'chat');
    if(!conn.api_consent||conn.status!=='connected'||!JSON.parse(conn.models).includes(reviewer.model)||readableQuota(conn.quota).status==='rate_limited')throw Error('Connexion indisponible ou limite fournisseur atteinte.');
    activeSecretSnapshot=conn.secret;providerName=conn.provider;
    const prompt=reviewPrompt({repo:repo.full_name,pr:row.pr_number,sha:row.head_sha,title:String(p.title||'').slice(0,200),files,checks,role:reviewer.role});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    let output='',model=reviewer.model,tokens=0;
    try{
     aiStarted=true;
     for await(const delta of generate(conn.provider,secret,reviewer.model,[{role:'user',content:prompt.system+'\n\n'+prompt.user}],2800,controller.signal)){
      output+=delta.text||'';if(delta.model)model=delta.model;tokens=delta.input||tokens;
      if(output.length>14000){controller.abort();throw Error('Réponse trop volumineuse.');}
     }
    }finally{clearTimeout(timer);}
    reports.push({provider:conn.provider,model,role:reviewer.role,coverage:prompt.coverage,review:parseReviewResult(output),input_tokens:tokens});
   }catch(error){
    if(error instanceof ProviderError&&error.status===429&&activeSecretSnapshot){
     try{await recordConnectionQuota(env.DB,reviewer.id,row.user_id,activeSecretSnapshot,rateLimitObservation(error.retryAfter,now()));}catch{/* conserver le rapport partiel */}
    }
    const d=buildDiagnostic({stage:'ai_call',lastOk:'github_checks',error,provider:providerName,aiStarted,attempts});
    reports.push({role:reviewer.role,provider:providerName||undefined,model:reviewer.model,error:d.message,diagnostic:d});
   }
  }
  const result:{[key:string]:any}={repo:repo.full_name,pr_number:row.pr_number,head_sha:row.head_sha,risk,checks,checks_partial:checkRes.hasNext,files_partial:fileRes.hasNext,reviewers:reports,reviewed_at:now(),checks_unavailable:checksDiagnostic?checksDiagnostic.message:null,warning:'Revue IA seulement : les alertes exigent une reproduction ; aucun test n’a été exécuté par Atelier.'};
  result.handoff=reviewHandoff(result);
  await mark('save');
  const success=reports.every(r=>r.review),state=success?'completed':'partial';
  // Tolérance : si la migration 0010 n'est pas encore appliquée, le rapport est tout de même enregistré.
  try{await run(env,'UPDATE review_runs SET status=?,report=?,stage=NULL,diagnostic=NULL,updated_at=?,completed_at=? WHERE id=?',state,JSON.stringify(result),now(),now(),id);}
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
 const pending=await many(env,"SELECT id FROM review_runs WHERE status='queued' ORDER BY created_at LIMIT 5");
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
