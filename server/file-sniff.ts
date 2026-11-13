/* Identification du type réel d'un fichier par sa signature binaire (jamais par son nom ni son extension).
   Module pur. Un résultat « unknown » est une réponse honnête : on ne renomme ni ne devine rien. */
export interface Sniffed{kind:string;mime:string;ext:string}
const at=(b:Uint8Array,i:number,s:string)=>{for(let k=0;k<s.length;k++)if(b[i+k]!==s.charCodeAt(k))return false;return b.length>=i+s.length;};
const hex=(b:Uint8Array,i:number,...v:number[])=>b.length>=i+v.length&&v.every((x,k)=>b[i+k]===x);
export function sniffBytes(b:Uint8Array):Sniffed{
 if(hex(b,0,0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))return {kind:'png',mime:'image/png',ext:'png'};
 if(hex(b,0,0xff,0xd8,0xff))return {kind:'jpeg',mime:'image/jpeg',ext:'jpg'};
 if(at(b,0,'GIF87a')||at(b,0,'GIF89a'))return {kind:'gif',mime:'image/gif',ext:'gif'};
 if(at(b,0,'RIFF')&&at(b,8,'WEBP'))return {kind:'webp',mime:'image/webp',ext:'webp'};
 if(at(b,0,'RIFF')&&at(b,8,'WAVE'))return {kind:'wav',mime:'audio/wav',ext:'wav'};
 if(at(b,0,'%PDF-'))return {kind:'pdf',mime:'application/pdf',ext:'pdf'};
 if(hex(b,0,0x50,0x4b,0x03,0x04)||hex(b,0,0x50,0x4b,0x05,0x06))return {kind:'zip',mime:'application/zip',ext:'zip'};   // aussi docx, xlsx, pptx : on ne tranche pas
 if(hex(b,0,0x1f,0x8b))return {kind:'gzip',mime:'application/gzip',ext:'gz'};
 if(at(b,0,'OggS'))return {kind:'ogg',mime:'audio/ogg',ext:'ogg'};
 if(at(b,0,'fLaC'))return {kind:'flac',mime:'audio/flac',ext:'flac'};
 if(at(b,0,'ID3')||(b.length>1&&b[0]===0xff&&(b[1]&0xe0)===0xe0&&(b[1]&0x06)!==0))return {kind:'mp3',mime:'audio/mpeg',ext:'mp3'};
 if(at(b,4,'ftyp'))return {kind:'mp4',mime:'video/mp4',ext:'mp4'};                                                       // mp4, m4a, mov : même conteneur
 if(hex(b,0,0x1a,0x45,0xdf,0xa3))return {kind:'webm',mime:'video/webm',ext:'webm'};
 if(at(b,0,'BM')&&b.length>14)return {kind:'bmp',mime:'image/bmp',ext:'bmp'};
 if(hex(b,0,0x49,0x49,0x2a,0x00)||hex(b,0,0x4d,0x4d,0x00,0x2a))return {kind:'tiff',mime:'image/tiff',ext:'tif'};
 if(at(b,0,'SQLite format 3'))return {kind:'sqlite',mime:'application/vnd.sqlite3',ext:'sqlite'};
 if(hex(b,0,0x37,0x7a,0xbc,0xaf,0x27,0x1c))return {kind:'7z',mime:'application/x-7z-compressed',ext:'7z'};
 if(at(b,0,'Rar!'))return {kind:'rar',mime:'application/vnd.rar',ext:'rar'};
 if(hex(b,0,0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1))return {kind:'ole',mime:'application/x-ole-storage',ext:'doc'};
 if(b.length&&b.length<=4096||b.length>=1){
  const head=b.subarray(0,Math.min(b.length,1024));let text=head.length>0;
  for(const c of head){if(c===0||(c<7)||(c>13&&c<32&&c!==27)){text=false;break;}}
  if(text){const s=new TextDecoder('utf-8').decode(head).trimStart();
   if(/^<(!doctype html|html)/i.test(s))return {kind:'html',mime:'text/html',ext:'html'};
   if(/^<svg[\s>]|^<\?xml[\s\S]{0,200}<svg/i.test(s))return {kind:'svg',mime:'image/svg+xml',ext:'svg'};
   if(/^[{[]/.test(s))return {kind:'json_or_text',mime:'application/json',ext:'json'};
   return {kind:'text',mime:'text/plain',ext:'txt'};}
 }
 return {kind:'unknown',mime:'application/octet-stream',ext:''};
}
