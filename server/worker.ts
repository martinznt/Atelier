import {claimQueuedTask} from './task-persistence.ts';
import {captureArtifact} from './artifact-save.ts';
import {plannedStartIssue} from './planning.ts';
import {refreshModelCatalogues} from './model-catalog.ts';
import {purgeDeletedAccounts} from './deletion.ts';
import {credentialsFor} from './routes/connections.ts';import {generate} from './connectors/ai.ts';import {ProviderError} from './connectors/http.ts';
import {event,many,now,one,run,uid} from './core.ts';import {newFile,writeVersion} from './storage.ts';import type {Env,Task} from './types.ts';
import {collaborationPrompt,rateLimitObservation,recordConnectionQuota,type SharedAnswer} from './collaboration.ts';
import {selectCandidates,runWithRelay,AttemptError} from './ai-relay.ts';
import {availabilityOf,estimateTokens,storedFailure} from './ai-availability.ts';
import {recordObservation,loadAiConnections,recordUsage} from './ai-persist.ts';
export async function executeTask(env:Env,id:string) {
 const task=await claimQueuedTask<Task>(env.DB,id,now());
 if(!task)return;
 if(task.kind!=='chat'){await run(env,"UPDATE tasks SET status='interrupted',error=?,updated_at=? WHERE id=?",'Cette action externe doit être vérifiée avant toute reprise.',now(),id);return;}
 const d=JSON.parse(task.payload),context=JSON.parse(task.context),start=Date.now();let totalInput=0,totalOutput=0,hasUsage=false;const responses:SharedAnswer[]=[];
 const startIssue=plannedStartIssue(d.planning,start);
 if(startIssue){await run(env,"UPDATE tasks SET status='interrupted',error=?,completed_at=?,updated_at=? WHERE id=? AND user_id=?",startIssue,now(),now(),id,task.user_id);await event(env,task.user_id,'interrupted',startIssue,task.project_id,id);return;}
 let turnInput=0,turnOutput=0;
 let activeMessage:string|undefined,activeFile:string|undefined,activeConnection:string|undefined,activeCredentialSnapshot:string|undefined,fileVersion=0,text='',actualModel='',provider='',activeLabel='',activeRole='';
 let artifactWarning=false,lastArtifactAt=0,quotaHandled=false;
 const warnArtifact=async()=>{if(artifactWarning)return;artifactWarning=true;await event(env,task.user_id,'file_warning','La réponse est conservée dans la conversation. Un fichier n’a pas pu être enregistré : vérifiez la limite de 256 Kio et l’espace texte disponible. Vous pouvez copier ou exporter la réponse avant de reprendre.',task.project_id,id);};
 const cancelled=async()=>{const row=await one(env,'SELECT cancel_requested FROM tasks WHERE id=? AND user_id=?',id,task.user_id);return !row||row.cancel_requested;};
 const save=async(state:'draft'|'final'|'incomplete')=>{
 if(!activeMessage)return;
 await run(env,'UPDATE messages SET content=?,model=?,status=? WHERE id=? AND user_id=?',text,actualModel||null,state,activeMessage,task.user_id);
 if(text&&(state!=='draft'||Date.now()-lastArtifactAt>30000)){
  lastArtifactAt=Date.now();
  await captureArtifact(async()=>{
   if(!activeFile){const f=await newFile(env,task.user_id,task.project_id,`reponse-${id.slice(0,8)}-${activeMessage!.slice(0,8)}.md`,'text/markdown',new TextEncoder().encode(text),{author:`${activeLabel} · ${provider}`,task_id:id,conversation_id:task.conversation_id,state});activeFile=f.file_id;fileVersion=f.version;}
   else{const v=await writeVersion(env,task.user_id,activeFile,new TextEncoder().encode(text),fileVersion,state);fileVersion=v.version;}
  },warnArtifact);
 }
 await run(env,'UPDATE tasks SET updated_at=?,input_tokens=?,output_tokens=? WHERE id=?',now(),hasUsage?totalInput+turnInput:null,hasUsage?totalOutput+turnOutput:null,id);
 };
 try{
 for(let round=0;round<d.rounds;round++)for(let index=0;index<d.assistants.length;index++){
 if(await cancelled())throw new ProviderError(499,'cancelled');if(Date.now()-start>150000)throw new ProviderError(408,'time_limit');
 const assistant=d.assistants[index];activeConnection=assistant.connection_id;activeCredentialSnapshot=undefined;
 let {conn,secret}=await credentialsFor(env,assistant.connection_id,task.user_id,'chat');activeCredentialSnapshot=conn.secret;if(conn.status!=='connected'||!JSON.parse(conn.models).includes(assistant.model))throw new ProviderError(403,'connection_changed');provider=conn.provider;activeLabel=assistant.assistant_label||conn.label;activeRole=assistant.role?.trim()||'';actualModel='';text='';turnInput=0;turnOutput=0;activeFile=undefined;fileVersion=0;activeMessage=uid();
 await run(env,'INSERT INTO messages(id,user_id,conversation_id,role,content,provider,assistant_label,assistant_role,task_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',activeMessage,task.user_id,task.conversation_id,'assistant','',provider,activeLabel,activeRole||null,id,'draft',now());
 const notes=await many(env,"SELECT detail FROM events WHERE task_id=? AND user_id=? AND kind='task_note' ORDER BY seq",id,task.user_id);
 const message=collaborationPrompt({mode:d.mode,index,round,assistant:{...assistant,assistant_label:activeLabel,provider},context,message:d.message,notes:notes.map(n=>n.detail),responses});
 if(message.length>60000)throw new ProviderError(413,'context_limit');
 // Relais : avant tout flux seulement (refus HTTP explicite), vers une connexion autorisée et testée, jamais déjà utilisée par un autre assistant de la tâche.
 // Il exige le consentement de partage de la tâche, car le contexte peut alors partir vers un autre fournisseur.
 const relayAllowed=d.share_consent===true;
 const usedByOthers=new Set<string>(d.assistants.map((a:any)=>a.connection_id).filter((x:string)=>x!==assistant.connection_id));
 const fresh=new Map<string,{conn:any;secret:string}>();
 let usedModel=assistant.model,lastError:unknown=null;
 const estimate=estimateTokens(message.length,d.max_tokens);
 const choice=relayAllowed
  ?selectCandidates({connections:(await loadAiConnections(env.DB,task.user_id)).filter(c=>!usedByOthers.has(c.id)),preferred:[{connection_id:assistant.connection_id,model:assistant.model}],allowRelay:true,now:now(),estimateTokens:estimate})
  :{candidates:[{connection_id:assistant.connection_id,label:conn.label,provider:conn.provider,model:assistant.model,origin:'preferred' as const,reason:'Assistant choisi.',probe:false}],excluded:[]};
 const relay=await runWithRelay<void>({
  candidates:choice.candidates,excluded:choice.excluded,maxAttempts:relayAllowed?3:1,now,
  recheck:async c=>{
   if(c.connection_id===assistant.connection_id){fresh.set(c.connection_id,{conn,secret});return null;}
   try{const cs=await credentialsFor(env,c.connection_id,task.user_id,'chat');fresh.set(c.connection_id,cs);return availabilityOf(cs.conn,{model:c.model,now:now(),estimateTokens:estimate});}
   catch{return {usable:false,state:'ineligible',kind:null,label:'Indisponible',until:null,until_source:null,probe:false,quota_known:false,known:{},reason:'Connexion indisponible.'};}
  },
  onFailure:async(c,cl)=>{
   quotaHandled=true; // l'état de la connexion est écrit ici, une seule fois, sans écraser les pauses des autres modèles
   if(['request_rejected','unknown','interrupted'].includes(cl.kind))return;
   const snap=fresh.get(c.connection_id)?.conn.secret;
   if(snap)await recordObservation(env.DB,c.connection_id,task.user_id,snap,{type:'failure',failure:storedFailure(cl,c.model,now())},now());
  },
  attempt:async c=>{
   const cs=fresh.get(c.connection_id)!;
   if(c.connection_id!==activeConnection||c.model!==usedModel){
    conn=cs.conn;secret=cs.secret;provider=conn.provider;activeConnection=c.connection_id;activeCredentialSnapshot=conn.secret;activeLabel=conn.label;usedModel=c.model;
    await run(env,'UPDATE messages SET provider=?,assistant_label=? WHERE id=? AND user_id=?',provider,activeLabel,activeMessage,task.user_id);
    await event(env,task.user_id,'relay','Relais automatique : '+c.label+' ('+c.provider+') prend la suite, car la connexion précédente ne pouvait pas répondre avant le début de la réponse.',task.project_id,id);
   }
   const prompt=collaborationPrompt({mode:d.mode,index,round,assistant:{...assistant,model:c.model,assistant_label:activeLabel,provider},context,message:d.message,notes:notes.map(n=>n.detail),responses});
   if(prompt.length>60000)throw new AttemptError(new ProviderError(413,'context_limit'),false);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(90000,Math.max(1000,180000-(Date.now()-start))));let lastSaved=0,lastCheck=0,accepted=false;
   try{for await(const delta of generate(provider,secret,c.model,[{role:'user',content:prompt}],d.max_tokens,controller.signal)){
    if(delta.text)text+=delta.text;if(text.length>100000){controller.abort();throw new ProviderError(413,'output_limit');}
    if(delta.model)actualModel=delta.model;if(delta.input!==undefined){turnInput=delta.input;hasUsage=true;}if(delta.output!==undefined){turnOutput=delta.output;hasUsage=true;}
    if(delta.quota){accepted=true;await recordObservation(env.DB,conn.id,task.user_id,conn.secret,{type:'success',model:c.model,headers:delta.quota as any},now());}
    if(Date.now()-lastCheck>1000){lastCheck=Date.now();if(await cancelled()){controller.abort();throw new ProviderError(499,'cancelled');}}
    if(text.length&&Date.now()-lastSaved>5000){await save('draft');lastSaved=Date.now();}
   }}catch(error){lastError=error;throw new AttemptError(error,accepted||text.length>0,text);}
   finally{clearTimeout(timer);}
  }
 });
 await recordUsage(env.DB,task.user_id,{task_kind:'chat',task_id:id,role:activeRole||null,attempts:relay.attempts,tokens:{[activeConnection+'\n'+usedModel]:{input:hasUsage?turnInput:undefined,output:hasUsage?turnOutput:undefined}}});
 if(relay.status!=='completed'){
  // Aucun résultat inventé : la tâche s'arrête au statut habituel (« limite atteinte » si les connexions étaient limitées), texte partiel conservé.
  if(relay.status==='exhausted'||relay.status==='no_candidate')throw new ProviderError(429,'http');
  throw lastError??new ProviderError(502,'interrupted_stream');
 }
 if(!actualModel)actualModel=`${usedModel} (demandé ; identifiant effectif absent)`;
 await save('final');totalInput+=turnInput;totalOutput+=turnOutput;turnInput=0;turnOutput=0;responses.push({label:activeLabel,role:activeRole,provider,model:actualModel,content:text});
 // Every fenced code block is captured; no generated file is executed.
 const blocks=[...text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)];
 for(let b=0;b<blocks.length;b++){
 const match=blocks[b],first=match[2].split('\n')[0];const filename=first.match(/^(?:\/\/|#|<!--)?\s*(?:fichier|file):\s*(.+?)(?:\s*-->)?$/i)?.[1];
 await captureArtifact(()=>newFile(env,task.user_id,task.project_id,filename||`extrait-${id.slice(0,8)}-${index+1}-${round+1}-${b+1}.${/^[a-z0-9]+$/i.test(match[1])?match[1]:'txt'}`,'text/plain',new TextEncoder().encode(filename?match[2].split('\n').slice(1).join('\n'):match[2]),{author:`${activeLabel} · ${provider}`,task_id:id,conversation_id:task.conversation_id}),warnArtifact);
 }
 activeMessage=undefined;
 }
 await run(env,"UPDATE tasks SET status='completed',completed_at=?,updated_at=?,input_tokens=?,output_tokens=? WHERE id=?",now(),now(),hasUsage?totalInput:null,hasUsage?totalOutput:null,id);
 await run(env,'UPDATE conversations SET updated_at=? WHERE id=? AND user_id=?',now(),task.conversation_id,task.user_id);
 await event(env,task.user_id,'completed',artifactWarning?'Réponses enregistrées ; certains fichiers nécessitent une sauvegarde manuelle. Consultez l’avertissement de stockage.':'Réponses et fichiers enregistrés. Aucun test de code n’a été exécuté par ce connecteur.',task.project_id,id);
 }catch(error){
 try{await save('incomplete');}catch{/* Previous versions remain immutable when storage is full. */}
 const stop=error instanceof ProviderError&&error.status===499;const quota=error instanceof ProviderError&&error.status===429;
 if(quota&&!quotaHandled&&activeConnection&&activeCredentialSnapshot){
  // A result for the old credential must not mark a token replaced during the task.
  try{await recordConnectionQuota(env.DB,activeConnection,task.user_id,activeCredentialSnapshot,rateLimitObservation(error.retryAfter,now()));}catch{/* Do not hide the persisted task outcome if a diagnostic write fails. */}
 }
 const message=stop?'Tâche arrêtée. Les fichiers déjà enregistrés restent disponibles.':error instanceof ProviderError?error.message:'Tâche interrompue. Consultez les fichiers conservés et vérifiez les accès ou l’espace de stockage avant de reprendre.';
 await run(env,'UPDATE tasks SET status=?,error=?,completed_at=?,updated_at=? WHERE id=?',stop?'cancelled':quota?'quota':'interrupted',message,now(),now(),id);
 await event(env,task.user_id,'interrupted',message,task.project_id,id);
 }
}
export async function maintenance(env:Env){
 const stale=new Date(Date.now()-15*60000).toISOString();
 await run(env,"UPDATE tasks SET status='interrupted',error='Le traitement a été interrompu. Vérifiez les résultats avant une reprise explicite.',updated_at=? WHERE status='running' AND updated_at<?",now(),stale);
 const queued=await many(env,"SELECT id FROM tasks WHERE status='queued' AND cancel_requested=0 AND (not_before IS NULL OR not_before<=?) ORDER BY created_at LIMIT 50",now());
 for(const task of queued)await env.TASKS.send({id:task.id});
 await purgeDeletedAccounts(env);
 await refreshModelCatalogues(env);
 await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),env.DB.prepare('DELETE FROM auth_limits WHERE expires_at<?').bind(Math.floor(Date.now()/1000))]);
}
