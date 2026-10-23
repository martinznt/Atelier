import {digest} from './crypto.ts';import {fail,now,one,owned,run,safeFilename,uid} from './core.ts';
import type {Env,Row} from './types.ts';
import {persistTextVersion,readTextVersion,storedText,StorageError,DEFAULT_STORAGE_BYTES,MAX_TEXT_BYTES} from './storage-store.ts';
export {MAX_TEXT_BYTES};
function storageFailure(error:unknown):never {if(error instanceof StorageError)fail(error.status,error.message);throw error;}
export async function writeVersion(env:Env,user:string,file:string,bytes:Uint8Array,expected:number,state:'draft'|'final'|'incomplete'='final') {
 const f=await owned(env,'files',file,user);
 if(!isTextFile(f.name,f.mime))fail(422,'Conservez ce fichier binaire dans GitHub ou sur votre appareil. Le stockage intégré est réservé aux petits textes, JSON et SVG.');
 try {
 const content=storedText(bytes),id=uid(),sha=await digest(bytes),date=now();
 const configured=Number(env.STORAGE_LIMIT_MB)*1048576;
 const quota=Number.isFinite(configured)&&configured>0?Math.min(configured,20*1048576):DEFAULT_STORAGE_BYTES;
 await persistTextVersion(env.DB,{user,file,expected,id,content,size:bytes.byteLength,sha,state,date,quota});
 return {id,version:expected+1,size:bytes.byteLength,sha256:sha,state,created_at:date};
 }catch(error){storageFailure(error);}
}
export function isTextFile(name:string,mime:string){return mime.startsWith('text/')||/^(application\/(json|[^;]+\+json|xml|javascript|x-yaml)|image\/svg\+xml)(;|$)/i.test(mime)||/\.(md|txt|json|js|ts|tsx|jsx|css|html|csv|xml|yml|yaml|py|sql|sh|svg|toml|rs|go|c|h|cpp|vue|svelte)$/i.test(name);}
/** Provider boundary. Callers never access a bucket or an external token. */
export async function readVersion(env:Env,user:string,version:Row) {
  if (
  typeof version.id !== 'string' ||
  typeof version.sha256 !== 'string' ||
  !Number.isSafeInteger(version.size) ||
  version.size < 0
 ) fail(500, 'Métadonnées de version invalides.');
 try {
  const text=await readTextVersion(env.DB,user,version.id);
  const bytes=new TextEncoder().encode(text);
  if(bytes.byteLength!==version.size||await digest(bytes)!==version.sha256)fail(409,'L’intégrité de cette version est incorrecte. Le téléchargement a été arrêté.');
  return new Response(bytes as BodyInit);
 }catch(error){storageFailure(error);}
}
export async function newFile(env:Env,user:string,project:string,name:string,mime:string,bytes:Uint8Array,metadata:Partial<Row>={}) {
 await owned(env,'projects',project,user);const id=uid(),date=now();
 await run(env,'INSERT INTO files(id,user_id,project_id,name,mime,author,conversation_id,task_id,collection,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,user,project,safeFilename(name),mime.slice(0,120),metadata.author||'Vous',metadata.conversation_id||null,metadata.task_id||null,metadata.collection||'',date,date);
 try{
  const {id:version_id,...version}=await writeVersion(env,user,id,bytes,0,metadata.state||'final');
  return {id,file_id:id,version_id,name:safeFilename(name),...version};
 }catch(e){await run(env,'DELETE FROM files WHERE id=? AND user_id=?',id,user);throw e;}
}
export async function getVersion(env:Env,user:string,file:string,version?:number) {
 const f=await owned(env,'files',file,user);
 const v=await one(env,'SELECT * FROM file_versions WHERE file_id=? AND user_id=? AND version=?',file,user,version||f.current_version);
 if(!v)fail(404,'Version introuvable.');return {file:f,version:v};
}
