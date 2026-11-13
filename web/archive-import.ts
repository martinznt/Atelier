/* Inventaire d'une archive d'export (ZIP ou JSON) sur l'appareil, segment par segment.
   - L'archive n'est jamais chargée en entier : table des matières, puis une entrée à la fois.
   - Tout est reprenable : le serveur sait quels segments et quels fichiers sont déjà faits (empreintes à l'appui).
   - Une opération peut être annulée entre deux étapes ; rien de ce qui est déjà enregistré n'est perdu.
   - Les messages ne sont envoyés au serveur que par l'import explicite de conversations choisies. */
import {openZip,readEntry,streamEntry,ZipError,DEFAULT_LIMITS,type ZipEntry} from './zip-reader.ts';
import {Sha256,sha256Blob} from './sha256-stream.ts';
import {inventoryExport,isConversationFile,entryNameProblem,attachmentRefs} from '../server/export-inventory.ts';
import {sniffBytes} from '../server/file-sniff.ts';
export interface Api{post:(path:string,body:unknown)=>Promise<any>;get:(path:string)=>Promise<any>}
export interface Progress{phase:string;label:string;done:number;total:number}
export interface Ctl{signal?:{aborted:boolean};onProgress?:(p:Progress)=>void}
export class Cancelled extends Error{constructor(){super('Opération annulée : ce qui est déjà enregistré est conservé et sera repris.');}}
const check=(c:Ctl)=>{if(c.signal?.aborted)throw new Cancelled();};
const hexOf=async(u:Uint8Array)=>sha256Blob(new Blob([u as BlobPart]));
const MAX_SEGMENT_BYTES=DEFAULT_LIMITS.maxEntryBytes;
export interface SegmentReport{name:string;status:string;conversations:number;note:string;skipped?:boolean}
export interface InventoryResult{batch:any;segments:SegmentReport[];totals:{conversations:number;messages:number;branches:number;attachment_refs:number};zip_entries:number;other_entries:number;unrecognized:number;cancelled:boolean}
const extOf=(n:string)=>(/\.([a-z0-9]{1,8})$/i.exec(n)?.[1]||'sans').toLowerCase();
type Seg={name:string;read:()=>Promise<Uint8Array>;size:number};

async function openSource(file:File):Promise<{segments:Seg[];others:ZipEntry[];entries:number;byExt:Record<string,number>;isZip:boolean}>{
 if(!/\.zip$/i.test(file.name)){return {segments:[{name:file.name.slice(0,200),size:file.size,read:async()=>{if(file.size>MAX_SEGMENT_BYTES)throw new ZipError('Ce fichier JSON fait '+Math.round(file.size/1048576)+' Mo : trop grand pour être lu ici.','zip_limit');return new Uint8Array(await file.arrayBuffer());}}],others:[],entries:1,byExt:{json:1},isZip:false};}
 const {entries}=await openZip(file);const byExt:Record<string,number>={};
 for(const e of entries)if(!e.isDir)byExt[extOf(e.name)]=(byExt[extOf(e.name)]||0)+1;
 const segments=entries.filter(e=>!e.isDir&&isConversationFile(e.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})).map(e=>({name:e.name.slice(0,200),size:e.size,read:()=>readEntry(file,e)}));
 return {segments,others:entries.filter(e=>!e.isDir&&!isConversationFile(e.name)),entries:entries.length,byExt,isZip:true};
}
/** Passe 1 : l'inventaire des conversations. Reprenable : un segment déjà inventorié (même empreinte) est sauté. */
export async function inventoryArchive(file:File,api:Api,ctl:Ctl={}):Promise<InventoryResult>{
 ctl.onProgress?.({phase:'hash',label:'Calcul de l’empreinte SHA-256 de l’archive (sur cet appareil)',done:0,total:file.size});
 let digest:string;
 try{digest=await sha256Blob(file,{signal:ctl.signal,onProgress:n=>ctl.onProgress?.({phase:'hash',label:'Calcul de l’empreinte SHA-256 de l’archive (sur cet appareil)',done:n,total:file.size})});}
 catch(e){if(ctl.signal?.aborted)throw new Cancelled();throw e;}
 check(ctl);
 const src=await openSource(file);
 if(!src.segments.length)throw new Error(src.isZip?'Cette archive ne contient aucun fichier conversations.json ni conversations-000.json… Rien n’a été enregistré.':'Fichier non reconnu.');
 // Le fournisseur se lit dans le premier segment exploitable ; il fixe le type de l'export.
 let first:{seg:Seg;bytes:Uint8Array;value:any;inv:ReturnType<typeof inventoryExport>}|null=null;const early:SegmentReport[]=[];
 for(const seg of src.segments){
  check(ctl);
  try{const bytes=await seg.read(),value=JSON.parse(new TextDecoder().decode(bytes)),inv=inventoryExport(value);if(inv.rows.length){first={seg,bytes,value,inv};break;}early.push({name:seg.name,status:'inventoried',conversations:0,note:'aucune conversation reconnue ('+inv.unrecognized+' entrée(s) non reconnue(s))'});}
  catch(e){early.push({name:seg.name,status:e instanceof SyntaxError?'invalid_json':(e instanceof ZipError&&e.code==='zip_limit'?'too_large':'unreadable'),conversations:0,note:(e as Error).message.slice(0,300)});}
 }
 if(!first)throw new Error('Aucune conversation reconnue dans les '+src.segments.length+' fichier(s) de conversations de cette archive. Rien n’a été enregistré.');
 const stats={unrecognized:0,duplicates:0,zip_entries:src.entries,zip_by_extension:Object.fromEntries(Object.entries(src.byExt).slice(0,40)),inner_file:src.isZip?src.segments.map(s=>s.name).join(', ').slice(0,200):'',inner_sha256:''};
 const batch=await api.post('/exports',{provider:first.inv.provider,filename:file.name.slice(0,200),size:file.size,sha256:digest,declared_total:0,stats});
 const done=new Map<string,string>((await api.get(`/exports/${batch.id}/segments`)).items.filter((s:any)=>s.status==='inventoried').map((s:any)=>[s.name,s.sha256]));
 const reports:SegmentReport[]=[];let totals={conversations:0,messages:0,branches:0,attachment_refs:0},unrec=0,idx=0,cancelled=false;
 for(const seg of src.segments){
  idx++;
  try{
   check(ctl);
   ctl.onProgress?.({phase:'segments',label:'Segment « '+seg.name+' » ('+idx+'/'+src.segments.length+')',done:idx-1,total:src.segments.length});
   let bytes:Uint8Array,value:any,inv:ReturnType<typeof inventoryExport>;
   const pre=early.find(e=>e.name===seg.name);
   if(pre){const bad=pre.status!=='inventoried';
    await api.post(`/exports/${batch.id}/segments`,{name:seg.name,size:seg.size,sha256:'0'.repeat(64),conversation_count:0,duplicates:0,status:bad?pre.status:'inventoried',note:pre.note});
    reports.push(pre);continue;}
   if(first.seg===seg){bytes=first.bytes;value=first.value;inv=first.inv;}
   else{
    try{bytes=await seg.read();}catch(e){const code=e instanceof ZipError?e.code:'';const status=code==='zip_limit'?'too_large':'unreadable';
     await api.post(`/exports/${batch.id}/segments`,{name:seg.name,size:seg.size,sha256:'0'.repeat(64),conversation_count:0,duplicates:0,status,note:(e as Error).message.slice(0,400)});
     reports.push({name:seg.name,status,conversations:0,note:(e as Error).message});continue;}
    try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{await api.post(`/exports/${batch.id}/segments`,{name:seg.name,size:seg.size,sha256:await hexOf(bytes),conversation_count:0,duplicates:0,status:'invalid_json',note:'JSON illisible : segment incomplet ou corrompu'});
     reports.push({name:seg.name,status:'invalid_json',conversations:0,note:'JSON illisible'});continue;}
    inv=inventoryExport(value);
   }
   const segSha=await hexOf(bytes);
   if(done.get(seg.name)===segSha){reports.push({name:seg.name,status:'inventoried',conversations:inv.rows.length,note:'déjà inventorié (empreinte identique) : repris sans rien refaire',skipped:true});continue;}
   if(inv.provider!==first.inv.provider&&inv.provider!=='inconnu'&&inv.rows.length){await api.post(`/exports/${batch.id}/segments`,{name:seg.name,size:seg.size,sha256:segSha,conversation_count:0,duplicates:0,status:'unreadable',note:'Format '+inv.provider+' différent du premier segment ('+first.inv.provider+') : segment non inventorié'});
    reports.push({name:seg.name,status:'unreadable',conversations:0,note:'format différent du premier segment'});continue;}
   let alreadyPresent=0;const ignoredIds=new Set<string>();
   for(let i=0;i<inv.rows.length;i+=200){check(ctl);const r=await api.post(`/exports/${batch.id}/conversations`,{rows:inv.rows.slice(i,i+200).map(x=>({...x,segment:seg.name}))});alreadyPresent+=Number(r.already_present||0);for(const id of r.ignored||[])ignoredIds.add(String(id));
    ctl.onProgress?.({phase:'rows',label:'Enregistrement du manifeste — '+seg.name,done:Math.min(i+200,inv.rows.length),total:inv.rows.length});}
   // Références de pièces jointes (identifiants seulement), pour rapprochement ultérieur avec les fichiers de l'archive.
   const items=(Array.isArray(value)?value:Array.isArray(value?.conversations)?value.conversations:[value]).map((c:any)=>{const id=String(c?.id||c?.conversation_id||c?.uuid||'');return {source_id:id,refs:attachmentRefs(c)};}).filter((x:any)=>x.source_id&&x.refs.length);
   for(let i=0;i<items.length;i+=40){check(ctl);await api.post(`/exports/${batch.id}/attachments`,{items:items.slice(i,i+40)});}
   await api.post(`/exports/${batch.id}/segments`,{name:seg.name,size:seg.size,sha256:segSha,conversation_count:inv.rows.length+inv.duplicates.length,duplicates:inv.duplicates.length+alreadyPresent,status:'inventoried',note:inv.unrecognized?inv.unrecognized+' entrée(s) non reconnue(s)':''});
   reports.push({name:seg.name,status:'inventoried',conversations:inv.rows.length-alreadyPresent,note:(alreadyPresent?alreadyPresent+' déjà présente(s) dans un autre segment. ':'')+(inv.unrecognized?inv.unrecognized+' entrée(s) non reconnue(s)':'')});
   const kept=inv.rows.filter(x=>!ignoredIds.has(x.source_id));totals.conversations+=kept.length;totals.messages+=kept.reduce((n,x)=>n+x.message_count,0);totals.branches+=kept.reduce((n,x)=>n+x.branch_count,0);totals.attachment_refs+=kept.reduce((n,x)=>n+x.attachment_refs,0);unrec+=inv.unrecognized;
   // Libération explicite : aucune donnée du segment ne reste en mémoire après son inventaire.
   value=null;
   if(first.seg===seg){first={...first,bytes:new Uint8Array(0),value:null as any};}
  }catch(e){if(e instanceof Cancelled){cancelled=true;break;}throw e;}
 }
 return {batch,segments:[...reports],totals,zip_entries:src.entries,other_entries:src.others.length,unrecognized:unrec,cancelled};
}
export interface IndexResult{total:number;hashed:number;skipped:number;problems:number;cancelled:boolean}
/** Passe 2 (facultative, plus longue) : empreinte et type réel de chaque fichier de l'archive, un par un, mémoire bornée. Reprenable. */
export async function indexArchiveFiles(file:File,batch:{id:string;sha256:string},api:Api,ctl:Ctl={}):Promise<IndexResult>{
 const {entries}=await openZip(file);
 const others=entries.filter(e=>!e.isDir&&!isConversationFile(e.name));
 const done=new Set<string>();
 for(let off=0;;off+=500){const r=await api.get(`/exports/${batch.id}/files?status=hashed&limit=500&offset=${off}`);for(const f of r.items)done.add(f.entry_name);if(!r.next)break;}
 let hashed=0,skipped=0,problems=0,pending:any[]=[];
 const flush=async()=>{if(pending.length){await api.post(`/exports/${batch.id}/files`,{rows:pending});pending=[];}};
 for(let i=0;i<others.length;i++){
  const e=others[i];
  if(ctl.signal?.aborted){await flush();return {total:others.length,hashed,skipped,problems,cancelled:true};}
  if(done.has(e.name)){skipped++;continue;}
  ctl.onProgress?.({phase:'files',label:'Fichier '+(i+1)+'/'+others.length+' — '+e.name.slice(-60),done:i,total:others.length});
  const base={entry_name:e.name,size:e.size,compressed_size:e.compressedSize};
  const bad=entryNameProblem(e.name);
  if(bad){pending.push({...base,sniff_kind:'',sniff_mime:'',sha256:null,status:'unsafe_name',note:'Nom inhabituel : '+bad});problems++;}
  else if(e.encrypted){pending.push({...base,sniff_kind:'',sniff_mime:'',sha256:null,status:'encrypted',note:'Entrée chiffrée : non lisible'});problems++;}
  else if(e.method!==0&&e.method!==8){pending.push({...base,sniff_kind:'',sniff_mime:'',sha256:null,status:'unsupported',note:'Méthode de compression '+e.method+' non prise en charge'});problems++;}
  else{
   try{
    const h=new Sha256();let head=new Uint8Array(0);
    await streamEntry(file,e,c=>{if(head.length<64){const m=new Uint8Array(Math.min(64,head.length+c.length));m.set(head);m.set(c.subarray(0,m.length-head.length),head.length);head=m;}h.update(c);},{signal:ctl.signal});
    const t=sniffBytes(head);pending.push({...base,sniff_kind:t.kind,sniff_mime:t.mime,sha256:h.digestHex(),status:'hashed',note:''});hashed++;
   }catch(err){
    if(ctl.signal?.aborted){await flush();return {total:others.length,hashed,skipped,problems,cancelled:true};}
    const code=err instanceof ZipError?err.code:'';problems++;
    pending.push({...base,sniff_kind:'',sniff_mime:'',sha256:null,status:code==='zip_bomb'?'suspicious':'failed',note:String((err as Error).message).slice(0,280)});
   }
  }
  if(pending.length>=100)await flush();
 }
 await flush();
 await api.post(`/exports/${batch.id}/link-attachments`,{});
 return {total:others.length,hashed,skipped,problems,cancelled:false};
}
/** Relit uniquement les conversations demandées dans leur segment d'origine (même empreinte exigée), sans charger le reste de l'archive. */
export async function readConversations(file:File,batchId:string,api:Api,wanted:{source_id:string;segment:string}[],ctl:Ctl={}):Promise<any[]>{
 const src=await openSource(file),shas=new Map<string,string>((await api.get(`/exports/${batchId}/segments`)).items.map((s:any)=>[s.name,s.sha256]));
 const bySeg=new Map<string,Set<string>>();for(const w of wanted){const n=w.segment||src.segments[0]?.name||'';(bySeg.get(n)||bySeg.set(n,new Set()).get(n)!).add(w.source_id);}
 const out:any[]=[];
 for(const [name,ids] of bySeg){
  check(ctl);const seg=src.segments.find(s=>s.name===name);
  if(!seg)throw new Error('Le fichier « '+name+' » est introuvable dans l’archive choisie : choisissez la même archive que lors de l’inventaire.');
  const bytes=await seg.read(),sha=await hexOf(bytes),expected=shas.get(name);
  if(expected&&expected!==sha&&expected!=='0'.repeat(64))throw new Error('Le fichier « '+name+' » n’a pas la même empreinte que lors de l’inventaire : ce n’est pas la même archive. Aucun message n’a été importé.');
  const value=JSON.parse(new TextDecoder().decode(bytes));
  for(const c of (Array.isArray(value)?value:Array.isArray(value?.conversations)?value.conversations:[value])){const id=String(c?.id||c?.conversation_id||c?.uuid||'');if(ids.has(id))out.push(c);}
 }
 return out;
}
