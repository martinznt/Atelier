import {digest} from './crypto.ts';import {fail,now,one,owned,run,safeFilename,uid} from './core.ts';
import type {Env,Row} from './types.ts';
export async function writeVersion(env:Env,user:string,file:string,bytes:Uint8Array,expected:number,state:'draft'|'final'|'incomplete'='final') {
 await owned(env,'files',file,user);
 if(bytes.byteLength>Number(env.MAX_FILE_MB||20)*1048576)fail(413,`Fichier trop volumineux (maximum ${env.MAX_FILE_MB||20} Mo).`);
 const quota=Number(env.STORAGE_LIMIT_MB||512)*1048576;
 const reserved=await run(env,'UPDATE users SET storage_used=storage_used+? WHERE id=? AND storage_used+?<=? AND deleted_at IS NULL',bytes.byteLength,user,bytes.byteLength,quota);
 if(!reserved.meta.changes)fail(413,'Le stockage est plein. Exportez ou supprimez explicitement des fichiers, ou augmentez le quota. Aucune version n’a été effacée.');
 const id=uid(),key=`${user}/${file}/${id}`,sha=await digest(bytes),date=now();
 try {
 await env.FILES.put(key,bytes,{customMetadata:{sha256:sha,user,file},httpMetadata:{contentType:'application/octet-stream'}});
 const results=await env.DB.batch([
 env.DB.prepare('INSERT INTO file_versions(id,file_id,user_id,version,size,sha256,object_key,state,created_at) SELECT ?,id,user_id,?,?,?, ?,?,? FROM files WHERE id=? AND user_id=? AND current_version=?').bind(id,expected+1,bytes.byteLength,sha,key,state,date,file,user,expected),
 env.DB.prepare('UPDATE files SET current_version=current_version+1,updated_at=? WHERE id=? AND user_id=? AND current_version=? AND EXISTS (SELECT 1 FROM file_versions WHERE id=?)').bind(date,file,user,expected,id)]);
 if(!results[0].meta.changes)fail(409,'Une autre version a été enregistrée. Rechargez le fichier ; votre contenu n’a pas remplacé cette version.');
 return {id,version:expected+1,size:bytes.byteLength,sha256:sha,state,created_at:date};
 }catch(error){await env.FILES.delete(key);await run(env,'UPDATE users SET storage_used=MAX(0,storage_used-?) WHERE id=?',bytes.byteLength,user);throw error;}
}
export async function newFile(env:Env,user:string,project:string,name:string,mime:string,bytes:Uint8Array,metadata:Partial<Row>={}) {
 await owned(env,'projects',project,user);const id=uid(),date=now();
 await run(env,'INSERT INTO files(id,user_id,project_id,name,mime,author,conversation_id,task_id,collection,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,user,project,safeFilename(name),mime.slice(0,120),metadata.author||'Vous',metadata.conversation_id||null,metadata.task_id||null,metadata.collection||'',date,date);
 try{const version=await writeVersion(env,user,id,bytes,0,metadata.state||'final');return {id,name:safeFilename(name),...version,file_id:id};}catch(e){await run(env,'DELETE FROM files WHERE id=? AND user_id=?',id,user);throw e;}
}
export async function getVersion(env:Env,user:string,file:string,version?:number) {
 const f=await owned(env,'files',file,user);
 const v=await one(env,'SELECT * FROM file_versions WHERE file_id=? AND user_id=? AND version=?',file,user,version||f.current_version);
 if(!v)fail(404,'Version introuvable.');return {file:f,version:v};
}
