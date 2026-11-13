/* Lecture d'une archive ZIP à accès aléatoire : seule la table des matières est lue d'abord, puis chaque entrée à la demande,
   par tranches de Blob. L'archive entière n'est jamais chargée en mémoire (indispensable sur un téléphone).
   Une archive est une donnée non fiable : limites de taille et de ratio, noms jamais utilisés comme chemins, aucune exécution. */
import {Inflate} from 'fflate';
export interface ZipEntry{name:string;size:number;compressedSize:number;method:number;offset:number;encrypted:boolean;isDir:boolean}
export interface ZipLimits{maxEntries:number;maxCentralDirBytes:number;maxEntryBytes:number;maxRatio:number}
export const DEFAULT_LIMITS:ZipLimits={maxEntries:200_000,maxCentralDirBytes:96*1048576,maxEntryBytes:160*1048576,maxRatio:250};
export class ZipError extends Error{code:string;constructor(message:string,code:string){super(message);this.code=code;}}
const u16=(d:DataView,o:number)=>d.getUint16(o,true),u32=(d:DataView,o:number)=>d.getUint32(o,true);
const u64=(d:DataView,o:number)=>{const lo=d.getUint32(o,true),hi=d.getUint32(o+4,true);const v=hi*4294967296+lo;if(!Number.isSafeInteger(v))throw new ZipError('Valeur 64 bits hors limite.','zip_range');return v;};
const read=async(blob:Blob,from:number,to:number)=>{if(from<0||to>blob.size||to<from)throw new ZipError('Lecture hors de l’archive.','zip_range');return new Uint8Array(await blob.slice(from,to).arrayBuffer());};
const view=(b:Uint8Array)=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function decodeName(raw:Uint8Array,utf8:boolean):string{
 if(utf8)return new TextDecoder('utf-8').decode(raw);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{return new TextDecoder('latin1').decode(raw);}
}
export async function openZip(blob:Blob,limits:ZipLimits=DEFAULT_LIMITS):Promise<{entries:ZipEntry[];zip64:boolean}>{
 if(blob.size<22)throw new ZipError('Ce fichier n’est pas une archive ZIP (trop court).','zip_invalid');
 const tailLen=Math.min(blob.size,65557+22),tail=await read(blob,blob.size-tailLen,blob.size),td=view(tail);
 let e=-1;for(let i=tail.length-22;i>=0;i--){if(td.getUint32(i,true)===0x06054b50){e=i;break;}}
 if(e<0)throw new ZipError('Table des matières introuvable : archive incomplète ou ce n’est pas un ZIP.','zip_invalid');
 let total=u16(td,e+10),cdSize=u32(td,e+12),cdOff=u32(td,e+16),zip64=false;
 if(total===0xffff||cdSize===0xffffffff||cdOff===0xffffffff){
  const locAt=e-20;if(locAt<0||td.getUint32(locAt,true)!==0x07064b50)throw new ZipError('Archive ZIP64 incohérente.','zip_invalid');
  const eocd64=u64(td,locAt+8),h=await read(blob,eocd64,eocd64+56),hd=view(h);
  if(hd.getUint32(0,true)!==0x06064b50)throw new ZipError('Archive ZIP64 incohérente.','zip_invalid');
  total=u64(hd,32);cdSize=u64(hd,40);cdOff=u64(hd,48);zip64=true;
 }
 if(total>limits.maxEntries)throw new ZipError('L’archive contient '+total+' entrées : au-delà de la limite de '+limits.maxEntries+' (protection du téléphone).','zip_limit');
 if(cdSize>limits.maxCentralDirBytes)throw new ZipError('Table des matières anormalement grande : archive refusée.','zip_limit');
 const cd=await read(blob,cdOff,cdOff+cdSize),d=view(cd),entries:ZipEntry[]=[];let p=0;
 while(p+46<=cd.length&&entries.length<total){
  if(d.getUint32(p,true)!==0x02014b50)throw new ZipError('Table des matières corrompue.','zip_invalid');
  const flags=u16(d,p+8),method=u16(d,p+10);let comp=u32(d,p+20),size=u32(d,p+24),off=u32(d,p+42);
  const nl=u16(d,p+28),el=u16(d,p+30),cl=u16(d,p+32);
  if(p+46+nl+el+cl>cd.length)throw new ZipError('Table des matières corrompue.','zip_invalid');
  const name=decodeName(cd.subarray(p+46,p+46+nl),(flags&0x800)!==0);
  const extra=cd.subarray(p+46+nl,p+46+nl+el),xd=view(extra);let q=0;
  while(q+4<=extra.length){const id=u16(xd,q),len=u16(xd,q+2);
   if(id===0x0001){let r=q+4;if(size===0xffffffff){size=u64(xd,r);r+=8;}if(comp===0xffffffff){comp=u64(xd,r);r+=8;}if(off===0xffffffff){off=u64(xd,r);}}
   q+=4+len;}
  entries.push({name,size,compressedSize:comp,method,offset:off,encrypted:(flags&1)!==0,isDir:name.endsWith('/')});
  p+=46+nl+el+cl;
 }
 return {entries,zip64};
}
async function dataStart(blob:Blob,e:ZipEntry){
 const h=await read(blob,e.offset,e.offset+30),d=view(h);
 if(d.getUint32(0,true)!==0x04034b50)throw new ZipError('En-tête d’entrée invalide : « '+e.name.slice(0,80)+' ».','zip_invalid');
 return e.offset+30+u16(d,26)+u16(d,28);
}
function check(e:ZipEntry,l:ZipLimits,maxBytes:number){
 if(e.encrypted)throw new ZipError('Entrée chiffrée : non lisible.','zip_encrypted');
 if(e.method!==0&&e.method!==8)throw new ZipError('Méthode de compression non prise en charge ('+e.method+').','zip_method');
 if(e.size>maxBytes)throw new ZipError('Entrée trop volumineuse pour être lue ici ('+Math.round(e.size/1048576)+' Mo, limite '+Math.round(maxBytes/1048576)+' Mo).','zip_limit');
 if(e.method===8&&e.compressedSize>0&&e.size/e.compressedSize>l.maxRatio&&e.size>8*1048576)throw new ZipError('Taux de compression suspect (risque de bombe de décompression) : entrée refusée.','zip_bomb');
}
/** Décompresse en flux, par tranches de 64 Ko : un bloc compressé ne peut jamais produire plus de ~67 Mo d'un coup, et rien ne dépasse la taille annoncée. */
const INFLATE_STEP=65536;
function inflateInto(raw:Uint8Array,e:ZipEntry):Uint8Array{
 const out=new Uint8Array(e.size);let n=0,failure:ZipError|null=null;
 const fail=()=>new ZipError('La taille réelle ne correspond pas à la taille annoncée pour « '+e.name.slice(0,80)+' » : entrée refusée.','zip_invalid');
 if(!raw.length){if(e.size===0)return out;throw fail();}
 const inf=new Inflate(c=>{if(failure)return;if(n+c.length>e.size){failure=fail();return;}out.set(c,n);n+=c.length;});
 try{for(let o=0;o<raw.length;o+=INFLATE_STEP){inf.push(raw.subarray(o,o+INFLATE_STEP),o+INFLATE_STEP>=raw.length);if(failure)throw failure;}}
 catch(err){if(err instanceof ZipError)throw err;throw new ZipError('Décompression impossible pour « '+e.name.slice(0,80)+' » (données corrompues).','zip_invalid');}
 if(n!==e.size)throw fail();
 return out;
}
/** Lit une entrée en mémoire, avec contrôle strict de la taille réellement obtenue. */
export async function readEntry(blob:Blob,e:ZipEntry,limits:ZipLimits=DEFAULT_LIMITS,maxBytes=limits.maxEntryBytes):Promise<Uint8Array>{
 check(e,limits,maxBytes);
 const start=await dataStart(blob,e),raw=await read(blob,start,start+e.compressedSize);
 if(e.method===0){if(raw.length!==e.size)throw new ZipError('Taille incohérente pour « '+e.name.slice(0,80)+' ».','zip_invalid');return raw;}
 return inflateInto(raw,e);
}
/** Lit une entrée par morceaux (mémoire bornée) : sert au calcul d'empreinte des grosses pièces jointes. Renvoie le nombre d'octets lus. */
export async function streamEntry(blob:Blob,e:ZipEntry,onChunk:(c:Uint8Array)=>void,o:{limits?:ZipLimits;signal?:{aborted:boolean};stopAfter?:number}={}):Promise<number>{
 const limits=o.limits||DEFAULT_LIMITS;check(e,limits,Number.MAX_SAFE_INTEGER);
 const start=await dataStart(blob,e);let got=0,stop=false;
 const emit=(c:Uint8Array)=>{if(stop)return;got+=c.length;if(got>e.size)throw new ZipError('Flux plus grand que la taille annoncée : entrée refusée.','zip_bomb');onChunk(c);if(o.stopAfter&&got>=o.stopAfter)stop=true;};
 const step=e.method===0?1<<20:INFLATE_STEP;
 if(e.method===0){for(let off=0;off<e.compressedSize&&!stop;off+=step){if(o.signal?.aborted)throw new Error('Opération annulée.');emit(await read(blob,start+off,start+Math.min(off+step,e.compressedSize)));}return got;}
 let failure:unknown=null;const inf=new Inflate((c)=>{try{emit(c);}catch(err){failure=err;stop=true;}});
 for(let off=0;off<e.compressedSize&&!stop;off+=step){
  if(o.signal?.aborted)throw new Error('Opération annulée.');
  const last=off+step>=e.compressedSize;
  try{inf.push(await read(blob,start+off,start+Math.min(off+step,e.compressedSize)),last);}catch(err){if(!failure)throw new ZipError('Décompression impossible pour « '+e.name.slice(0,80)+' ».','zip_invalid');}
  if(failure)throw failure;
 }
 return got;
}
