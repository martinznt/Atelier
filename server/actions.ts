import {digest} from './crypto.ts';import {fail,now,one,run,uid} from './core.ts';import type {Env} from './types.ts';
export async function externalAction(env:Env,user:string,project:string,key:string,kind:string,payload:unknown,action:()=>Promise<unknown>){
 const hash=await digest(JSON.stringify(payload));const prev=await one(env,'SELECT * FROM tasks WHERE user_id=? AND idempotency_key=?',user,key);
 if(prev){if(prev.request_hash!==hash)fail(409,'Cette clé correspond à une autre action.');return {id:prev.id,status:prev.status,result:JSON.parse(prev.context),duplicate:true};}
 const id=uid(),date=now();
 try{await run(env,"INSERT INTO tasks(id,user_id,project_id,idempotency_key,request_hash,kind,status,payload,context,created_at,updated_at,started_at) VALUES(?,?,?,?,?,?,'running',?,'{}',?,?,?)",id,user,project,key,hash,kind,JSON.stringify(payload),date,date,date);}catch{fail(409,'Cette action a déjà été reçue. Actualisez son état.');}
 try{const result=await action();await run(env,"UPDATE tasks SET status='completed',context=?,updated_at=?,completed_at=? WHERE id=?",JSON.stringify(result),now(),now(),id);return {id,status:'completed',result};}
 catch(error){await run(env,"UPDATE tasks SET status='interrupted',error=?,updated_at=? WHERE id=?",'Issue à vérifier chez le fournisseur avant toute nouvelle tentative.',now(),id);throw error;}
}
