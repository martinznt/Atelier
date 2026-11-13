/* SHA-256 incrémental (FIPS 180-4) pour hacher une archive volumineuse par morceaux, sans la charger en mémoire.
   Les petits blocs passent par WebCrypto natif (plus rapide) ; les deux voies donnent exactement la même empreinte. */
const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
export class Sha256{
 private h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
 private buf=new Uint8Array(64);private fill=0;private total=0;private w=new Uint32Array(64);
 private block(b:Uint8Array,o:number){
  const w=this.w,h=this.h;
  for(let i=0;i<16;i++)w[i]=(b[o+4*i]<<24)|(b[o+4*i+1]<<16)|(b[o+4*i+2]<<8)|b[o+4*i+3];
  for(let i=16;i<64;i++){const a=w[i-15],c=w[i-2];const s0=((a>>>7)|(a<<25))^((a>>>18)|(a<<14))^(a>>>3),s1=((c>>>17)|(c<<15))^((c>>>19)|(c<<13))^(c>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}
  let a=h[0],b2=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
  for(let i=0;i<64;i++){
   const S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)),ch=(e&f)^(~e&g),t1=(hh+S1+ch+K[i]+w[i])|0;
   const S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)),mj=(a&b2)^(a&c)^(b2&c),t2=(S0+mj)|0;
   hh=g;g=f;f=e;e=(d+t1)|0;d=c;c=b2;b2=a;a=(t1+t2)|0;
  }
  h[0]=(h[0]+a)|0;h[1]=(h[1]+b2)|0;h[2]=(h[2]+c)|0;h[3]=(h[3]+d)|0;h[4]=(h[4]+e)|0;h[5]=(h[5]+f)|0;h[6]=(h[6]+g)|0;h[7]=(h[7]+hh)|0;
 }
 update(data:Uint8Array):this{
  this.total+=data.length;let i=0;
  if(this.fill){const n=Math.min(64-this.fill,data.length);this.buf.set(data.subarray(0,n),this.fill);this.fill+=n;i=n;if(this.fill===64){this.block(this.buf,0);this.fill=0;}}
  for(;i+64<=data.length;i+=64)this.block(data,i);
  if(i<data.length){this.buf.set(data.subarray(i),0);this.fill=data.length-i;}
  return this;
 }
 digestHex():string{
  const bits=this.total*8,pad=new Uint8Array(((this.fill<56)?56:120)-this.fill+8);pad[0]=0x80;
  const hi=Math.floor(bits/0x100000000),lo=bits>>>0,n=pad.length;
  pad[n-8]=hi>>>24;pad[n-7]=hi>>>16;pad[n-6]=hi>>>8;pad[n-5]=hi;pad[n-4]=lo>>>24;pad[n-3]=lo>>>16;pad[n-2]=lo>>>8;pad[n-1]=lo;
  const total=this.total;this.update(pad);this.total=total;
  return [...this.h].map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
 }
}
const NATIVE_MAX=32*1048576,CHUNK=4*1048576;
const toHex=(buf:ArrayBuffer)=>[...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('');
/** Empreinte d'un fichier ou d'un Blob lu par morceaux de 4 Mo ; `onProgress` reçoit les octets lus ; `signal` permet d'annuler. */
export async function sha256Blob(blob:Blob,o:{onProgress?:(n:number)=>void;signal?:{aborted:boolean}}={}):Promise<string>{
 if(blob.size<=NATIVE_MAX&&globalThis.crypto?.subtle){const d=toHex(await globalThis.crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));o.onProgress?.(blob.size);return d;}
 const h=new Sha256();
 for(let off=0;off<blob.size;off+=CHUNK){
  if(o.signal?.aborted)throw new Error('Opération annulée.');
  h.update(new Uint8Array(await blob.slice(off,off+CHUNK).arrayBuffer()));o.onProgress?.(Math.min(off+CHUNK,blob.size));
 }
 return h.digestHex();
}
