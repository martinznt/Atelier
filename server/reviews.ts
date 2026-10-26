import {Hono} from 'hono';
import {z} from 'zod';
import {credentialsFor} from './routes/connections.ts';
import {jsonRequest} from './connectors/http.ts';
import {generate} from './connectors/ai.ts';
import {fail,jsonBody,many,now,one,owned,run,uid,userId} from './core.ts';
import {reviewPrompt,parseReviewResult,reviewRisk,type ReviewFile,type ReviewCheck} from './review-core.ts';
import type {AppEnv,Env} from './types.ts';

/* Seules les connexions autorisées et testées par l’utilisateur sont acceptées. */
const aiChoice=z.object({connection_id:z.string().uuid(),model:z.string().min(1).max(160)});
const configuration=z.object({
 repository_id:z.string().uuid(),primary:aiChoice,secondary:aiChoice.nullable().default(null),
 enabled:z.boolean().default(false),share_consent:z.literal(true)
});
const prInput=z.object({repository_id:z.string().uuid(),pr_number:z.number().int().positive().max(10000000)});
export const reviews=new Hono<AppEnv>();

type Conf={id:string;user_id:string;project_id:string;repository_id:string;primary_connection_id:string;primary_model:string;secondary_connection_id:string|null;secondary_model:string|null;enabled:number;consent:number};
type Repo={id:string;user_id:string;project_id:string;connection_id:string;full_name:string};
type ReviewRun={id:string;user_id:string;project_id:string;repository_id:string;pr_number:number;head_sha:string;status:string};
async function getRepo(env:Env,id:string,user:string){
 return owned<Repo>(env,'repositories',id,user);
}
async function checkChoice(env:Env,user:string,input:{connection_id:string;model:string}){
 const {conn}=await credentialsFor(env,input.connection_id,user,'chat');
 if(!['openai','anthropic','gemini','mistral'].includes(conn.provider)||!conn.api_consent||conn.status!=='connected')
  fail(403,'Cette API n’est pas disponible ou autorisée dans Atelier.');
 if(!JSON.parse(conn.models).includes(input.model))fail(400,'Modèle non confirmé : testez la connexion.');
}
async function githubToken(env:Env,repo:Repo){
 const {conn,secret}=await credentialsFor(env,repo.connection_id,repo.user_id,'read');
 if(conn.provider!=='github')fail(403,'Connexion GitHub requise.');
 return secret;
}
async function queueReview(env:Env,config:Conf,repo:Repo,number:number,sha:string){
 if(!/^[0-9a-f]{40}$/i.test(sha))return false;
 const id=uid(),at=now();
 const result=await run(env,"INSERT OR IGNORE INTO review_runs(id,user_id,project_id,repository_id,pr_number,head_sha,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'queued',?,?)",id,repo.user_id,repo.project_id,repo.id,number,sha,at,at);
 if(!result.meta.changes)return false;
 try{await env.TASKS.send({id,kind:'review'});}catch{/* Reprise par le cron ; aucun appel fournisseur n’a été fait. */}
 return true;
}
async function queueFromGithub(env:Env,config:Conf,repo:Repo,pr:number){
 const token=await githubToken(env,repo);
 const result=await jsonRequest('github',token,'/repos/'+repo.full_name+'/pulls/'+pr);
 const data=result.data;
 if(data.state!=='open'||data.head?.repo?.full_name!==repo.full_name)fail(400,'Cette PR est fermée ou provient d’un dépôt externe.');
 return {queued:await queueReview(env,config,repo,data.number,data.head.sha),sha:data.head.sha};
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
 return c.json({items:rows.map(r=>({...r,report:r.report?JSON.parse(r.report):null}))});
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
 await run(c.env,"INSERT INTO review_configs(id,user_id,project_id,repository_id,primary_connection_id,primary_model,secondary_connection_id,secondary_model,enabled,consent,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(user_id,repository_id) DO UPDATE SET primary_connection_id=excluded.primary_connection_id,primary_model=excluded.primary_model,secondary_connection_id=excluded.secondary_connection_id,secondary_model=excluded.secondary_model,enabled=excluded.enabled,consent=1,updated_at=excluded.updated_at",uid(),user,repo.project_id,repo.id,input.primary.connection_id,input.primary.model,input.secondary?.connection_id||null,input.secondary?.model||null,Number(input.enabled),at,at);
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

/* Les queues transportent uniquement l’identifiant. Le contexte est récupéré
   depuis D1, de sorte qu’un redémarrage ne perd pas les résultats. */
export async function executeReview(env:Env,id:string){
 const date=now();
 const row=await env.DB.prepare("UPDATE review_runs SET status='running',updated_at=? WHERE id=? AND status='queued' AND EXISTS(SELECT 1 FROM users u WHERE u.id=review_runs.user_id AND u.deleted_at IS NULL) RETURNING *").bind(date,id).first<ReviewRun>();
 if(!row)return;
 try{
  const cfg=await one<Conf>(env,'SELECT * FROM review_configs WHERE repository_id=? AND user_id=?',row.repository_id,row.user_id);
  const repo=await getRepo(env,row.repository_id,row.user_id);
  if(!cfg||!cfg.consent)throw Error('Configuration ou consentement indisponible.');
  const token=await githubToken(env,repo),base='/repos/'+repo.full_name;
  const p=(await jsonRequest('github',token,base+'/pulls/'+row.pr_number)).data;
  if(p.head?.sha!==row.head_sha||p.state!=='open'||p.head?.repo?.full_name!==repo.full_name){
   await run(env,"UPDATE review_runs SET status='stale',error=?,updated_at=?,completed_at=? WHERE id=?",'La PR a changé avant l’analyse : nouveau commit requis.',now(),now(),id);return;
  }
  const [fileRes,checkRes]=await Promise.all([
   jsonRequest('github',token,base+'/pulls/'+row.pr_number+'/files?per_page=60'),
   jsonRequest('github',token,base+'/commits/'+row.head_sha+'/check-runs?per_page=30')
  ]);
  const files=fileRes.data as ReviewFile[],checks:ReviewCheck[]=(checkRes.data.check_runs||[]).map((x:any)=>({name:x.name,status:x.status,conclusion:x.conclusion}));
  const risk=reviewRisk(files),reports:any[]=[];
  const assigned=[
   {id:cfg.primary_connection_id,model:cfg.primary_model,role:'correctness' as const},
   ...(cfg.secondary_connection_id&&cfg.secondary_model&&risk!=='simple'?[{id:cfg.secondary_connection_id,model:cfg.secondary_model,role:'security' as const}]:[])
  ];
  for(const reviewer of assigned){
   try{
    const {conn,secret}=await credentialsFor(env,reviewer.id,row.user_id,'chat');
    if(!conn.api_consent||conn.status!=='connected'||!JSON.parse(conn.models).includes(reviewer.model))throw Error('Connexion indisponible.');
    const prompt=reviewPrompt({repo:repo.full_name,pr:row.pr_number,sha:row.head_sha,title:String(p.title||'').slice(0,200),files,checks,role:reviewer.role});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    let output='',model=reviewer.model,tokens=0;
    try{
     for await(const delta of generate(conn.provider,secret,reviewer.model,[{role:'user',content:prompt.system+'\n\n'+prompt.user}],2800,controller.signal)){
      output+=delta.text||'';if(delta.model)model=delta.model;tokens=delta.input||tokens;
      if(output.length>14000){controller.abort();throw Error('Réponse trop volumineuse.');}
     }
    }finally{clearTimeout(timer);}
    reports.push({provider:conn.provider,model,role:reviewer.role,coverage:prompt.coverage,review:parseReviewResult(output),input_tokens:tokens});
   }catch(error){reports.push({role:reviewer.role,error:'Analyse indisponible, quota ou fournisseur à vérifier. Aucun résultat inventé.'});}
  }
  const result={repo:repo.full_name,pr_number:row.pr_number,head_sha:row.head_sha,risk,checks,checks_partial:checkRes.hasNext,files_partial:fileRes.hasNext,reviewers:reports,reviewed_at:now(),warning:'Revue IA seulement : les alertes exigent une reproduction ; aucun test n’a été exécuté par Atelier.'};
  const success=reports.every(r=>r.review),state=success?'completed':'partial';
  await run(env,'UPDATE review_runs SET status=?,report=?,updated_at=?,completed_at=? WHERE id=?',state,JSON.stringify(result),now(),now(),id);
 }catch(error){
  await run(env,"UPDATE review_runs SET status='interrupted',error=?,updated_at=?,completed_at=? WHERE id=?",'La revue n’a pas pu aboutir. Aucun nouvel appel automatique ne sera effectué sans intervention.',now(),now(),id);
 }
}
/* Activé uniquement après consentement explicite. Maximum deux PR nouvelles à
   chaque passage, pour ne pas monopoliser Cloudflare ni les quotas des API. */
export async function maintenanceReviews(env:Env){
 await run(env,"UPDATE review_runs SET status='interrupted',error=?,updated_at=? WHERE status='running' AND updated_at<?",'Traitement interrompu : vérification manuelle requise.',now(),new Date(Date.now()-12*60000).toISOString());
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
