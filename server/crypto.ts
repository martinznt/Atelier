const enc=new TextEncoder();
export const b64=(b:Uint8Array)=>btoa(String.fromCharCode(...b));
export const unb64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export const randomToken=()=>b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
export async function digest(value:string|Uint8Array) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?enc.encode(value):value as BufferSource))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function masterKey(secret:string){const bytes=unb64(secret||'');if(bytes.length!==32)throw new Error('MASTER_KEY manquante ou invalide');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
export async function seal(secret:string,value:string,aad:string) {const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(aad)},await masterKey(secret),enc.encode(value));return `${b64(iv)}.${b64(new Uint8Array(data))}`;}
export async function unseal(secret:string,value:string,aad:string) {const [iv,data]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:enc.encode(aad)},await masterKey(secret),unb64(data)));}
