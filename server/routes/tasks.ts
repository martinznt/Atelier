import {Hono} from 'hono';import {z} from 'zod';import {contextFor} from '../context.ts';import {credentialsFor} from './connections.ts';import {connector} from '../connectors/catalog.ts';import {digest} from '../crypto.ts';
import {event,fail,jsonBody,many,now,one,owned,page,run,uid,userId} from '../core.ts';import type {AppEnv} from '../types.ts';
import {persistChatTask} from '../task-persistence.ts';
export const tasks=new Hono<AppEnv>();
const taskInput=z.object({conversation_id:z.string().uuid(),message:z.string().trim().min(1).max(12000),assistants:z.array(z.object({connection_id:z.string().uuid(),model:z.string().min(1).max(160)})).min(1).max(3),mode:z.enum(['individual','compare','review','collaborate']).default('individual'),rounds:z.number().int().min(1).max(3).default(1),max_tokens:z.number().int().min(128).max(4096).default(1024),memory_ids:z.array(z.string().uuid()).max(12).default([]),file_ids:z.array(z.string().uuid()).max(5).default([]),share_consent:z.boolean().default(false),idempotency_key:z.string().uuid()});
tasks.get('/',async c=>{
 const {limit,offset}=page(c),conversation=c.req.query('conversation')||null;
 if(conversation)await owned(c.env,'conversations',conversation,userId(c));
 return c.json({items:await many(c.env,'SELECT id,project_id,conversation_id,status,error,kind,input_tokens,output_tokens,created_at,updated_at,cancel_requested FROM tasks WHERE user_id=? AND (? IS NULL OR conversation_id=?) ORDER BY updated_at DESC,id LIMIT ? OFFSET ?',userId(c),conversation,conversation,limit,offset),limit,offset});
});
tasks.get('/:id',async c=>{const t=await owned(c.env,'tasks',c.req.param('id'),userId(c));return c.json({...t,payload:JSON.parse(t.payload),context:JSON.parse(t.context)});});
tasks.post('/context',async c=>{const d=taskInput.pick({conversation_id:true,memory_ids:true,file_ids:true}).parse(await jsonBody(c));const convo=await owned(c.env,'conversations',d.conversation_id,userId(c));return c.json(await contextFor(c.env,userId(c),convo.project_id,convo.id,d.memory_ids,d.file_ids));});
tasks.post('/',async c=>{
 const d=taskInput.parse(await jsonBody(c));const requestHash=await digest(JSON.stringify(d));const previous=await one(c.env,'SELECT * FROM tasks WHERE user_id=? AND idempotency_key=?',userId(c),d.idempotency_key);
 if(previous){if(previous.request_hash!==requestHash)fail(409,'Cette opération a déjà été utilisée avec un autre contenu.');return c.json({id:previous.id,status:previous.status,duplicate:true});}
 if(d.mode==='individual'&&(d.assistants.length!==1||d.rounds!==1))fail(400,'La réponse individuelle utilise un assistant et un tour.');
 if(d.assistants.length>1&&!d.share_consent)fail(400,'Autorisez explicitement le partage du contexte avec les assistants sélectionnés.');
 const providers=new Set<string>();
 for(const a of d.assistants){const {conn}=await credentialsFor(c.env,a.connection_id,userId(c),'chat');if(!connector(conn.provider)?.capabilities.chat||!conn.api_consent)fail(403,'Cette connexion ne permet pas une conversation API autorisée.');if(conn.status!=='connected')fail(403,'Testez la connexion avant de lancer une tâche.');if(!JSON.parse(conn.models).includes(a.model))fail(400,'Modèle absent de la liste fournie par le service. Actualisez la connexion.');providers.add(conn.provider);}
 const conversation=await owned(c.env,'conversations',d.conversation_id,userId(c));
 const previousProvider=await one(c.env,"SELECT provider FROM messages WHERE user_id=? AND conversation_id=? AND role='assistant' ORDER BY seq DESC LIMIT 1",userId(c),conversation.id);
 if(previousProvider?.provider&&!providers.has(previousProvider.provider)&&!d.share_consent)fail(400,'Le passage à un autre fournisseur nécessite votre autorisation de partage.');
 const context=await contextFor(c.env,userId(c),conversation.project_id,conversation.id,d.memory_ids,d.file_ids);
 const reserve=(new TextEncoder().encode(context.text+d.message).length+d.max_tokens*d.assistants.length*d.rounds*4)*d.assistants.length*d.rounds;
 const id=uid(),date=now();
 const result=await persistChatTask(c.env,{id,userId:userId(c),projectId:conversation.project_id,conversationId:conversation.id,idempotencyKey:d.idempotency_key,requestHash,payload:JSON.stringify({...d,reservation:reserve}),context:JSON.stringify(context),createdAt:date,reservation:reserve,messageId:uid(),message:d.message});
 if(result.kind==='conflict')fail(409,'Cette opération a déjà été utilisée avec un autre contenu.');
 if(result.kind==='duplicate')return c.json({id:result.id,status:result.status,duplicate:true});
 if(result.kind==='unavailable')fail(404,'Cette conversation n’est plus disponible pour ce compte.');
 if(result.kind==='budget')fail(429,'Le plafond local de consommation du mois ne permet pas cette tâche. Réduisez le contexte ou ajustez votre limite dans Réglages.');
 try{await c.env.TASKS.send({id});}catch{
  // The committed task is the durable outbox. Even if this diagnostic fails,
  // acknowledge its creation; maintenance will submit it without the browser.
  try{await event(c.env,userId(c),'queue','Envoi en attente ; le planificateur reprendra la tâche.',conversation.project_id,id);}catch{}
 }
 return c.json({id,status:'queued'},202);
});
tasks.post('/:id/cancel',async c=>{const t=await owned(c.env,'tasks',c.req.param('id'),userId(c));await run(c.env,"UPDATE tasks SET cancel_requested=1,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,updated_at=? WHERE id=? AND user_id=?",now(),t.id,userId(c));return c.json({ok:true,message:'Arrêt demandé. Une requête déjà reçue par le fournisseur peut rester facturée.'});});
tasks.post('/:id/note',async c=>{const t=await owned(c.env,'tasks',c.req.param('id'),userId(c));const d=z.object({content:z.string().min(1).max(2000)}).parse(await jsonBody(c));await event(c.env,userId(c),'task_note',d.content,t.project_id,t.id);return c.json({ok:true,message:'Précision enregistrée ; elle sera incluse au prochain tour si la tâche en comporte un.'});});
