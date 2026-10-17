import type {IDBPDatabase} from 'idb';

const encoder=new TextEncoder(),decoder=new TextDecoder();
const b64=(bytes:Uint8Array)=>{let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);};
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function derive(pass:string,salt:Uint8Array){
 const material=await crypto.subtle.importKey('raw',encoder.encode(pass),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt as BufferSource,iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encrypt(key:CryptoKey,data:Uint8Array,aad:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 return {iv:b64(iv),data:await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(aad)},key,data as BufferSource)};
}
async function decrypt(key:CryptoKey,value:any,aad:string){
 return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(value.iv),additionalData:encoder.encode(aad)},key,value.data));
}

type Snapshot={owner:string;key:CryptoKey;epoch:number};
const cancelled=()=>new Error('Le coffre a été verrouillé ou le compte a changé. Réessayez dans le compte souhaité.');

/** The storage adapter is injected so asynchronous account changes can be tested
 * with real WebCrypto without replacing the production encryption code. */
export function createVault(db:Promise<IDBPDatabase>){
 let key:CryptoKey|null=null,owner:string|null=null,epoch=0;
 let erasing:Promise<void>=Promise.resolve();
 const lock=()=>{epoch++;key=null;owner=null;};
 const snapshot=():Snapshot|null=>key&&owner?{key,owner,epoch}:null;
 const current=(s:Snapshot)=>s.epoch===epoch&&s.owner===owner&&s.key===key;
 const assertAttempt=(attempt:number)=>{if(epoch!==attempt)throw cancelled();};
 const activate=(attempt:number,user:string,unlockedKey:CryptoKey)=>{
  assertAttempt(attempt);key=unlockedKey;owner=user;epoch++;
 };
 async function read(s:Snapshot,id:string){
  const database=await db;if(!current(s))return null;
  const item=await database.get('records',`${s.owner}:${id}`);
  if(!item||!current(s))return null;
  try{
   const content=await decrypt(s.key,item,`${s.owner}:${id}`);
   return current(s)?content:null;
  }catch(error){if(!current(s))return null;throw error;}
 }
 async function write(s:Snapshot,id:string,content:Uint8Array){
  const encrypted=await encrypt(s.key,content,`${s.owner}:${id}`);
  const database=await db;if(!current(s))return false;
  // There is no await between the final guard and creating the IDB transaction.
  // A later clear() transaction therefore runs after this write and removes it.
  await database.put('records',{id:`${s.owner}:${id}`,user:s.owner,...encrypted,date:new Date().toISOString()});
  return current(s);
 }
 return {
  get user(){return owner;},get unlocked(){return !!key;},get epoch(){return epoch;},
  async list(){return (await db).getAll('vaults');},
  async create(user:{id:string;username:string},password:string){
   if(password.length<10)throw new Error('Le mot de passe local doit contenir au moins 10 caractères.');
   lock();const attempt=epoch;await erasing;assertAttempt(attempt);
   const salt=crypto.getRandomValues(new Uint8Array(16)),unlockedKey=await derive(password,salt);
   assertAttempt(attempt);
   const check=await encrypt(unlockedKey,encoder.encode('atelier-vault-v1'),user.id);
   const database=await db;assertAttempt(attempt);
   try{
    // add() fails atomically if another tab already created this vault. Replacing
    // its salt/key would silently make every previously saved record unreadable.
    await database.add('vaults',{user:user.id,username:user.username,salt:b64(salt),check,created_at:new Date().toISOString()});
   }catch(error){
    if(error instanceof Error&&error.name==='ConstraintError')throw new Error('Une copie locale existe déjà. Déverrouillez-la, ou effacez-la explicitement avant de la remplacer.');
    throw error;
   }
   activate(attempt,user.id,unlockedKey);
  },
  async unlock(user:string,password:string){
   lock();const attempt=epoch;await erasing;assertAttempt(attempt);
   const item=await (await db).get('vaults',user);assertAttempt(attempt);
   if(!item)throw new Error('Aucune copie locale pour ce compte.');
   let unlockedKey:CryptoKey;
   try{
    unlockedKey=await derive(password,bytes(item.salt));assertAttempt(attempt);
    if(decoder.decode(await decrypt(unlockedKey,item.check,user))!=='atelier-vault-v1')throw new Error();
   }catch{
    assertAttempt(attempt);throw new Error('Mot de passe local incorrect.');
   }
   activate(attempt,user,unlockedKey);return {id:user,username:item.username};
  },
  lock,
  async put(id:string,value:unknown){
   const s=snapshot();if(!s)return;
   await write(s,id,encoder.encode(JSON.stringify(value)));
  },
  async get<T=any>(id:string):Promise<T|null>{
   const s=snapshot();if(!s)return null;
   const content=await read(s,id);
   return content&&current(s)?JSON.parse(decoder.decode(content)):null;
  },
  async putFile(id:string,blob:Blob){
   const s=snapshot();if(!s)throw new Error('Déverrouillez votre appareil de confiance.');
   const content=new Uint8Array(await blob.arrayBuffer());
   if(!current(s)||!await write(s,`blob:${id}`,content))throw cancelled();
  },
  async getFile(id:string){
   const s=snapshot();if(!s)return null;
   const content=await read(s,`blob:${id}`);
   return content&&current(s)?new Blob([content as BlobPart]):null;
  },
  clear(user?:string){
   const target=user??owner;lock();
   // A locked vault has no implicit owner. Never erase other saved accounts by
   // accident when a caller has already discarded its current user identifier.
   if(!target)return erasing;
   const previous=erasing;
   const operation=(async()=>{
    await previous;
    const database=await db,tx=database.transaction(['records','vaults'],'readwrite');
    // Observe transaction errors immediately, including cursor/delete failures.
    void tx.done.catch(()=>{});
    let cursor=await tx.objectStore('records').openCursor();
    while(cursor){if(cursor.value.user===target)await cursor.delete();cursor=await cursor.continue();}
    await tx.objectStore('vaults').delete(target);await tx.done;
   })();
   erasing=operation.catch(()=>{});return operation;
  },
  async search(query:string){
   const s=snapshot();if(!s)return [];
   const needle=query.toLocaleLowerCase(),matches:{source:string;value:unknown}[]=[];
   const keys=await (await db).getAllKeys('records');if(!current(s))return [];
   for(const recordKey of keys){
    if(!current(s))return [];
    const recordId=String(recordKey),prefix=`${s.owner}:`;
    if(!recordId.startsWith(prefix))continue;
    const id=recordId.slice(prefix.length);if(id.startsWith('blob:'))continue;
    const content=await read(s,id);if(!current(s))return [];
    if(!content)continue;
    const value=JSON.parse(decoder.decode(content));
    if(JSON.stringify(value).toLocaleLowerCase().includes(needle))matches.push({source:id,value});
    if(matches.length>=30)break;
   }
   return current(s)?matches:[];
  }
 };
}
