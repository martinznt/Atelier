/* Lot 5B (5B-1) — Compression de la capture dans le navigateur, avant tout envoi.
   Limite du serveur : 180 000 octets (donc moins de 256 Kio de texte une fois codé en base64). Aucune image n'est envoyée ailleurs. */
export const MAX_CAPTURE_BYTES=180000;
/** Échelle d'essais : largeur de travail 720 px (écran 360 px en double densité), puis plus petit si c'est encore trop lourd. */
export const WIDTH_STEPS=[720,540,360] as const;
export const QUALITY_STEPS=[0.82,0.7,0.55,0.4,0.3] as const;
export const FORMATS=['image/webp','image/jpeg'] as const;

export interface Compressed{blob:Blob;mime:string;width:number;height:number;bytes:number;attempts:number;original_bytes:number}
export class CaptureError extends Error{}

const toBlob=(canvas:HTMLCanvasElement,type:string,q:number)=>new Promise<Blob|null>(res=>canvas.toBlob(res,type,q));
/** Essaie WebP (puis JPEG si le navigateur ne sait pas encoder en WebP), de la meilleure qualité à la plus basse, de la plus grande largeur à la plus petite. */
export async function compressCapture(file:File):Promise<Compressed>{
 if(!file.type.startsWith('image/'))throw new CaptureError('Ce fichier n’est pas une image. Choisissez une capture d’écran.');
 let bmp:ImageBitmap;
 try{bmp=await createImageBitmap(file);}catch{throw new CaptureError('Cette image n’a pas pu être ouverte. Essayez une capture au format PNG ou JPEG.');}
 if(bmp.width<100||bmp.height<100){bmp.close();throw new CaptureError('Cette capture est trop petite pour servir de fond.');}
 let attempts=0;
 try{
  for(const w of WIDTH_STEPS){
   const width=Math.min(w,bmp.width),height=Math.max(1,Math.round(bmp.height*width/bmp.width));
   if(height>16000)continue;
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext('2d');if(!ctx)throw new CaptureError('Ce navigateur ne sait pas préparer l’image.');
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);ctx.drawImage(bmp,0,0,width,height);
   for(const type of FORMATS){
    // Pire cas d'abord : si même la qualité la plus basse est trop lourde à cette largeur, inutile d'essayer les autres qualités.
    attempts++;
    const lowest=await toBlob(canvas,type,QUALITY_STEPS[QUALITY_STEPS.length-1]);
    if(!lowest||lowest.type!==type)continue; // pas d'encodeur pour ce format dans ce navigateur : format suivant
    if(lowest.size>MAX_CAPTURE_BYTES)break;
    for(const q of QUALITY_STEPS){ // de la meilleure qualité à la plus basse : on garde la première qui tient
     attempts++;
     const blob=await toBlob(canvas,type,q);
     if(blob&&blob.type===type&&blob.size<=MAX_CAPTURE_BYTES)return {blob,mime:type,width,height,bytes:blob.size,attempts,original_bytes:file.size};
    }
    return {blob:lowest,mime:type,width,height,bytes:lowest.size,attempts,original_bytes:file.size};
   }
  }
 }finally{bmp.close();}
 throw new CaptureError('Même très compressée, cette capture dépasse 180 Ko. Prenez une capture d’un seul écran (pas une page entière).');
}
export function blobToBase64(blob:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{
  const r=new FileReader();
  r.onload=()=>{const s=String(r.result||'');const i=s.indexOf(',');i<0?reject(new CaptureError('Lecture de l’image impossible.')):resolve(s.slice(i+1));};
  r.onerror=()=>reject(new CaptureError('Lecture de l’image impossible.'));
  r.readAsDataURL(blob);
 });
}

/** 5B-3 — image de la maquette : la capture en fond, chaque bloc avec sa couleur, son contour et son numéro (ordre de la liste). Rien n'est envoyé. */
export async function renderMockupPng(src:string,m:{screen_width:number;screen_height:number;blocks:{x:number;y:number;w:number;h:number;fill:string;label:string}[]}):Promise<Blob>{
 const k=2,W=m.screen_width*k,H=m.screen_height*k,c=document.createElement('canvas');c.width=W;c.height=H;
 const ctx=c.getContext('2d');if(!ctx)throw new CaptureError('Ce navigateur ne sait pas dessiner l’image.');
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
 if(src){const img=new Image();img.src=src;await img.decode();ctx.drawImage(img,0,0,W,H);}
 m.blocks.forEach((b,i)=>{
  const x=b.x*k,y=b.y*k,w=b.w*k,h=b.h*k;
  if(b.fill){ctx.globalAlpha=.6;ctx.fillStyle=b.fill;ctx.fillRect(x,y,w,h);ctx.globalAlpha=1;}
  ctx.lineWidth=6;ctx.strokeStyle='#ffffff';ctx.strokeRect(x,y,w,h);ctx.lineWidth=3;ctx.strokeStyle='#0b0b0c';ctx.strokeRect(x,y,w,h);
  const t=String(i+1);ctx.font='bold 24px sans-serif';const tw=ctx.measureText(t).width+12;
  ctx.fillStyle='#0b0b0c';ctx.fillRect(x,y,tw,30);ctx.fillStyle='#ffffff';ctx.fillText(t,x+6,y+23);
 });
 return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new CaptureError('Image impossible à fabriquer.')),'image/png'));
}
