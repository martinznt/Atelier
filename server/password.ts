import {scryptAsync} from '@noble/hashes/scrypt.js';
import {b64,unb64} from './crypto.ts';
// OWASP scrypt configuration: 16 MiB, r=8, p=5. Pure JS avoids Workers'
// production-only PBKDF2 iteration ceiling. Requires an adequate CPU allowance.
let active=0;
async function derive(password:string,salt:Uint8Array){
 if(active>=3)throw new Error('Password capacity exceeded');active++;
 try{return await scryptAsync(password,salt,{N:16384,r:8,p:5,dkLen:32,maxmem:32*1024*1024});}
 finally{active--;}
}
export async function hashPassword(password:string){const salt=crypto.getRandomValues(new Uint8Array(16));return `scrypt$16384$8$5$${b64(salt)}$${b64(await derive(password,salt))}`;}
export async function verifyPassword(password:string,stored:string){
 const [method,n,r,p,salt,hash]=stored.split('$');if(method!=='scrypt'||n!=='16384'||r!=='8'||p!=='5')return false;
 const expected=unb64(hash);if(expected.length!==32)return false;const actual=await derive(password,unb64(salt));let different=0;for(let i=0;i<32;i++)different|=actual[i]^expected[i];return different===0;
}
