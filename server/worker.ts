import {purgeDeletedAccounts} from './deletion.ts';
import {credentialsFor} from './routes/connections.ts';import {generate} from './connectors/ai.ts';import {ProviderError} from './connectors/http.ts';
import {event,many,now,one,run,uid} from './core.ts';import {newFile,writeVersion} from './storage.ts';import type {Env,Task} from './types.ts';
export async function executeTask(env:Env,id:string) {
 const task=await one<Task>(env,"UPDATE tasks SET status='running',started_at=?,updated_at=? WHERE id=? AND status='queued' AND cancel_requested=0 RETURNING *",now(),now(),id);
 if(!task)return;
 if(task.kind!=='chat'){await run(env,"UPDATE tasks SET status='interrupted',error=?,updated_at=? WHERE id=?",'Cette action externe doit être vérifiée avant toute reprise.',now(),id);return;}
 const d=JSON.parse(task.payload),context=JSON.parse(task.context),start=Date.now();let totalInput=0,totalOutput=0,hasUsage=false;const responses:string[]=[];
 let turnInput=0,turnOutput=0;
 let activeMessage:string|undefined,activeFile:string|undefined,fileVersion=0,text='',actualModel='',provider='';
 const cancelled=async()=>{const row=await one(env,'SELECT cancel_requested FROM tasks WHERE id=? AND user_id=?',id,task.user_id);return !row||row.cancel_requested;};
 const save=async(state:'draft'|'final'|'incomplete')=>{
 if(!activeMessage)return;
 await run(env,'UPDATE messages SET content=?,model=?,status=? WHERE id=? AND user_id=?',text,actualModel||null,state,activeMessage,task.user_id);
 if(text){if(!activeFile){const f=await newFile(env,task.user_id,task.project_id,`reponse-${id.slice(0,8)}-${activeMessage.slice(0,8)}.md`,'text/markdown',new TextEncoder().encode(text),{author:provider,task_id:id,conversation_id:task.conversation_id,state});activeFile=f.file_id;fileVersion=f.version;}
 else{const v=await writeVersion(env,task.user_id,activeFile,new TextEncoder().encode(text),fileVersion,state);fileVersion=v.version;}}
 await run(env,'UPDATE tasks SET updated_at=?,input_tokens=?,output_tokens=? WHERE id=?',now(),hasUsage?totalInput+turnInput:null,hasUsage?totalOutput+turnOutput:null,id);
 };
 try{
 for(let round=0;round<d.rounds;round++)for(let index=0;index<d.assistants.length;index++){
 if(await cancelled())throw new ProviderError(499,'cancelled');if(Date.now()-start>150000)throw new ProviderError(408,'time_limit');
 const assistant=d.assistants[index],{conn,secret}=await credentialsFor(env,assistant.connection_id,task.user_id,'chat');provider=conn.provider;actualModel='';text='';turnInput=0;turnOutput=0;activeFile=undefined;fileVersion=0;activeMessage=uid();
 await run(env,'INSERT INTO messages(id,user_id,conversation_id,role,content,provider,task_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)',activeMessage,task.user_id,task.conversation_id,'assistant','',provider,id,'draft',now());
 const notes=await many(env,"SELECT detail FROM events WHERE task_id=? AND user_id=? AND kind='task_note' ORDER BY seq",id,task.user_id);
 const relay=d.mode==='compare'?'':responses.join('\n\n');
 const message=`${context.notice}\n${context.text}\nDemande : ${d.message}\n${notes.map(n=>n.detail).join('\n')}\n${relay?`Réponses antérieures (sources visibles ; gardez les désaccords explicites) :\n${relay}`:''}\nMode : ${d.mode}. ${d.mode==='review'&&index>0?'Vérifiez la proposition précédente.':''} Vous ne disposez d’aucun outil d’exécution ici : ne dites pas avoir exécuté des tests ou modifié un dépôt. Fournissez les fichiers de code dans des blocs avec le nom du fichier sur la première ligne (exemple : // fichier: src/app.ts).`;
 if(message.length>60000)throw new ProviderError(413,'context_limit');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(90000,Math.max(1000,180000-(Date.now()-start))));let lastSaved=0,lastCheck=0;
 try{for await(const delta of generate(provider,secret,assistant.model,[{role:'user',content:message}],d.max_tokens,controller.signal)){
 if(delta.text)text+=delta.text;if(text.length>100000){controller.abort();throw new ProviderError(413,'output_limit');}
 if(delta.model)actualModel=delta.model;if(delta.input!==undefined){turnInput=delta.input;hasUsage=true;}if(delta.output!==undefined){turnOutput=delta.output;hasUsage=true;}
 if(delta.quota)await run(env,'UPDATE connections SET quota=? WHERE id=? AND user_id=?',JSON.stringify(delta.quota),conn.id,task.user_id);
 if(Date.now()-lastCheck>1000){lastCheck=Date.now();if(await cancelled()){controller.abort();throw new ProviderError(499,'cancelled');}}
 if(text.length&&Date.now()-lastSaved>5000){await save('draft');lastSaved=Date.now();}
 }}finally{clearTimeout(timer);}
 if(!actualModel)actualModel=`${assistant.model} (demandé ; identifiant effectif absent)`;
 await save('final');totalInput+=turnInput;totalOutput+=turnOutput;turnInput=0;turnOutput=0;responses.push(`${provider} / ${actualModel} :\n${text}`);
 // Every fenced code block is captured; no generated file is executed.
 const blocks=[...text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)];
 for(let b=0;b<blocks.length;b++){
 const match=blocks[b],first=match[2].split('\n')[0];const filename=first.match(/^(?:\/\/|#|<!--)?\s*(?:fichier|file):\s*(.+?)(?:\s*-->)?$/i)?.[1];
 await newFile(env,task.user_id,task.project_id,filename||`extrait-${id.slice(0,8)}-${index+1}-${round+1}-${b+1}.${/^[a-z0-9]+$/i.test(match[1])?match[1]:'txt'}`,'text/plain',new TextEncoder().encode(filename?match[2].split('\n').slice(1).join('\n'):match[2]),{author:provider,task_id:id,conversation_id:task.conversation_id});
 }
 activeMessage=undefined;
 }
 await run(env,"UPDATE tasks SET status='completed',completed_at=?,updated_at=?,input_tokens=?,output_tokens=? WHERE id=?",now(),now(),hasUsage?totalInput:null,hasUsage?totalOutput:null,id);
 await run(env,'UPDATE conversations SET updated_at=? WHERE id=? AND user_id=?',now(),task.conversation_id,task.user_id);
 await event(env,task.user_id,'completed','Réponses et fichiers enregistrés. Aucun test de code n’a été exécuté par ce connecteur.',task.project_id,id);
 }catch(error){
 try{await save('incomplete');}catch{/* Previous versions remain immutable when storage is full. */}
 const stop=error instanceof ProviderError&&error.status===499;const quota=error instanceof ProviderError&&error.status===429;
 const message=stop?'Tâche arrêtée. Les fichiers déjà enregistrés restent disponibles.':error instanceof ProviderError?error.message:'Tâche interrompue. Consultez les fichiers conservés et vérifiez les accès ou l’espace de stockage avant de reprendre.';
 await run(env,'UPDATE tasks SET status=?,error=?,completed_at=?,updated_at=? WHERE id=?',stop?'cancelled':quota?'quota':'interrupted',message,now(),now(),id);
 await event(env,task.user_id,'interrupted',message,task.project_id,id);
 }
}
export async function maintenance(env:Env){
 const stale=new Date(Date.now()-15*60000).toISOString();
 await run(env,"UPDATE tasks SET status='interrupted',error='Le traitement a été interrompu. Vérifiez les résultats avant une reprise explicite.',updated_at=? WHERE status='running' AND updated_at<?",now(),stale);
 const queued=await many(env,"SELECT id FROM tasks WHERE status='queued' AND cancel_requested=0 ORDER BY created_at LIMIT 50");
 for(const task of queued)await env.TASKS.send({id:task.id});
 await purgeDeletedAccounts(env);
 await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),env.DB.prepare('DELETE FROM auth_limits WHERE expires_at<?').bind(Math.floor(Date.now()/1000))]);
}
