/* Lecture d'un blob Git (texte) par son SHA, via le connecteur GitHub existant. Lecture seule. */
import {jsonRequest} from './connectors/http.ts';
export async function readBlobText(secret:string,fullName:string,sha:string):Promise<{text:string;binary:boolean;size:number}>{
 const blob=(await jsonRequest('github',secret,'/repos/'+fullName+'/git/blobs/'+sha)).data;
 if(blob?.encoding!=='base64'||typeof blob.content!=='string')throw Object.assign(new Error('Format de blob inattendu.'),{status:502});
 const bin=atob(blob.content.replace(/\s+/g,''));const bytes=new Uint8Array(bin.length);let zero=false;
 for(let i=0;i<bin.length;i++){const ch=bin.charCodeAt(i);bytes[i]=ch;if(ch===0)zero=true;}
 return {text:zero?'':new TextDecoder('utf-8',{fatal:false}).decode(bytes),binary:zero,size:bytes.length};
}
