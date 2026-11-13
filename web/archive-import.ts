/* Inventaire d'une archive d'export (ZIP ou JSON) sur l'appareil, segment par segment.
   - L'archive n'est jamais chargée en entier : table des matières, puis une entrée à la fois.
   - Tout est reprenable : le serveur sait quels segments et quels fichiers sont déjà faits (empreintes à l'appui).
   - Une opération peut être annulée entre deux étapes ; rien de ce qui est déjà enregistré n'est perdu.
   - Les messages ne sont envoyés au serveur que par l'import explicite de conversations choisies. */
import {openZip,readEntry,streamEntry,ZipError,DEFAULT_LIMITS,type ZipEntry} from './zip-reader.ts';
import {Sha256,sha256Blob} from './sha256-stream.ts';
import {inventoryExport,attachmentRefs} from '../server/export-inventory.ts';
import {classifyEntry,entryNameProblem,isConversationFile,maxJsonDepth,validateConversationJson,indexConversation,conversationId} from '../server/archive-entries.ts';
import {sniffBytes} from '../server/file-sniff.ts';
export interface Api{post:(path:string,body:unknown)=>Promise<any>;get:(path:string)=>Promise<any>}
export interface Progress{phase:string;label:string;done:number;total:number}
export interface Ctl{signal?:{aborted:boolean};onProgress?:(p:Progress)=>void}
export class Cancelled extends Error{constructor(){super('Opération annulée : ce qui est déjà enregistré est conservé et sera repris.');}}
const check=(c:Ctl)=>{if(c.signal?.aborted)throw new Cancelled();};
const hexOf=async(u:Uint8Array)=>sha256Blob(new Blob([u as BlobPart]));
const MAX_SEGMENT_BYTES=DEFAULT_LIMITS.maxEntryBytes;
export interface SegmentReport{name:string;status:string;conversations:number;note:string;skipped?:boolean;reason_code?:string}
export interface AnnexReport{name:string;kind:string;status:string;note:string}
export interface InventoryResult{batch:any;segments:SegmentReport[];annexes:AnnexReport[];totals:{conversations:number;messages:number;branches:number;attachment_refs:number;nodes:number};zip_entries:number;other_entries:number;unrecognized:number;invalid_conversations:number;cancelled:boolean}
const extOf=(n:string)=>(/\.([a-z0-9]{1,8})$/i.exec(n)?.[1]||'sans').toLowerCase();
const MAX_ANNEX_BYTES=1_000_000,MAX_JSON_DEPTH=100,NODE_BATCH=500;
type Seg={name:string;read:()=>Promise<Uint8Array>;size:number};
type Annex={name:string;entry:ZipEntry};
async function openSource(file:File):Promise<{segments:Seg[];annexes:Annex[];others:ZipEntry[];entries:number;byExt:Record<string,number>;byGroup:Record<string,number>;isZip:boolean}>{
 if(!/\.zip$/i.test(file.name)){return {segments:[{name:file.name.slice(0,200),size:file.size,read:async()=>{if(file.size>MAX_SEGMENT_BYTES)throw new ZipError('Ce fichier JSON fait '+Math.round(file.size/1048576)+' Mo : trop grand pour être lu ici.','zip_limit');return new Uint8Array(await file.arrayBuffer());}}],annexes:[],others:[],entries:1,byExt:{json:1},byGroup:{autre:1},isZip:false};}
 const {entries}=await openZip(file);const byExt:Record<string,number>={},byGroup:Record<string,number>={};
 const segments:Seg[]=[],annexes:Annex[]=[],others:ZipEntry[]=[];
 for(const e of entries){
  if(e.isDir)continue;
  byExt[extOf(e.name)]=(byExt[extOf(e.name)]||0)+1;const cls=classifyEntry(e.name);byGroup[cls.group]=(byGroup[cls.group]||0)+1;
  if(cls.kind==='conversations')segments.push({name:e.name.slice(0,200),size:e.size,read:()=>readEntry(file,e)});
  else{others.push(e);if(['correspondance','inventaire','verification','exclusions','lisez_moi'].includes(cls.kind))annexes.push({name:e.name,entry:e});}
 }
 segments.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
 return {segments,annexes,others,entries:entries.length,byExt,byGroup,isZip:true};
}
interface Parsed{value?:any;validation?:ReturnType<typeof validateConversationJson>;bytes?:Uint8Array;fail?:{status:string;reason_code:string;note:string;sha?:string}}
/** Lecture d'un segment : taille, profondeur, JSON, STRUCTURE. Un fichier au bon nom mais à la mauvaise structure est refusé avec son motif. */
async function readSegment(seg:Seg):Promise<Parsed>{
 let bytes:Uint8Array;
 try{bytes=await seg.read();}catch(e){const code=e instanceof ZipError?e.code:'';return {fail:{status:code==='zip_limit'?'too_large':'unreadable',reason_code:code==='zip_limit'?'too_large':'unreadable',note:(e as Error).message.slice(0,400)}};}
 const sha=await hexOf(bytes);let text=new TextDecoder().decode(bytes);
 if(maxJsonDepth(text,MAX_JSON_DEPTH)>MAX_JSON_DEPTH)return {fail:{status:'unreadable',reason_code:'depth',note:'Imbrication JSON de plus de '+MAX_JSON_DEPTH+' niveaux : fichier refusé par prudence.',sha}};
 let value:any;try{value=JSON.parse(text);}catch{return {fail:{status:'invalid_json',reason_code:'invalid_json',note:'JSON illisible : segment incomplet ou corrompu',sha}};}
 text='';const validation=validateConversationJson(value);
 if(!validation.ok)return {fail:{status:'unreadable',reason_code:'invalid_structure',note:validation.reason||'Structure non reconnue.',sha}};
 return {value,validation,bytes};
}
/** Passe 1 : l'inventaire des conversations. Reprenable : un segment déjà inventorié (même empreinte) est sauté. Aucun segment n'est déclaré terminé avant que le serveur ait recompté ce qu'il a enregistré. */
export async function inventoryArchive(file:File,api:Api,ctl:Ctl={}):Promise<InventoryResult>{
 const label='Calcul de l’empreinte SHA-256 de l’archive (sur cet appareil)';
 ctl.onProgress?.({phase:'hash',label,done:0,total:file.size});
 let digest:string;
 try{digest=await sha256Blob(file,{signal:ctl.signal,onProgress:n=>ctl.onProgress?.({phase:'hash',label,done:n,total:file.size})});}
 catch(e){if(ctl.signal?.aborted)throw new Cancelled();throw e;}
 check(ctl);
 const src=await openSource(file);
 if(!src.segments.length)throw new Error(src.isZip?'Cette archive ne contient aucun fichier de conversations reconnu (conversations.json, conversations_1.json, conversations-000.json, conversations_filtrees.json…). Rien n’a été enregistré.':'Fichier non reconnu.');
 // Le fournisseur se lit dans le premier segment valide ; les segments invalides sont enregistrés avec leur motif, jamais ignorés en silence.
 const early=new Map<string,SegmentReport>(),parsedFirst=new Map<string,Parsed>();let first:{seg:Seg;parsed:Parsed;provider:string}|null=null;
 for(const seg of src.segments){
  check(ctl);const p=await readSegment(seg);
  if(p.fail){early.set(seg.name,{name:seg.name,status:p.fail.status,conversations:0,note:p.fail.note,reason_code:p.fail.reason_code});parsedFirst.set(seg.name,p);continue;}
  first={seg,parsed:p,provider:p.validation!.provider};break;
 }
 if(!first){
  const why=[...early.values()].slice(0,3).map(r=>r.name+' : '+r.note).join(' ; ');
  throw new Error('Aucune conversation valide dans les '+src.segments.length+' fichier(s) de conversations de cette archive ('+why+'). Rien n’a été enregistré.');
 }
 const stats={unrecognized:0,duplicates:0,zip_entries:src.entries,zip_by_extension:Object.fromEntries(Object.entries(src.byExt).slice(0,40)),inner_file:src.isZip?src.segments.map(s=>s.name).join(', ').slice(0,200):'',inner_sha256:'',segments_detected:src.segments.length,annexes_detected:src.annexes.length,entries_by_group:src.byGroup};
 const batch=await api.post('/exports',{provider:first.provider==='inconnu'?'inconnu':first.provider,filename:file.name.slice(0,200),size:file.size,sha256:digest,declared_total:0,stats});
 const done=new Map<string,string>((await api.get(`/exports/${batch.id}/segments`)).items.filter((s:any)=>s.status==='inventoried').map((s:any)=>[s.name,s.sha256]));
 const reports:SegmentReport[]=[];const totals={conversations:0,messages:0,branches:0,attachment_refs:0,nodes:0};let unrec=0,invalidTotal=0,idx=0,cancelled=false;
 for(const seg of src.segments){
  idx++;
  try{
   check(ctl);
   ctl.onProgress?.({phase:'segments',label:'Segment « '+seg.name+' » ('+idx+'/'+src.segments.length+')',done:idx-1,total:src.segments.length});
   const pre=early.get(seg.name);
   if(pre){
    const sha=parsedFirst.get(seg.name)?.fail?.sha||'0'.repeat(64);
    await api.post(`/exports/${batch.id}/segments`,{name:seg.name,size:seg.size,sha256:sha,conversation_count:0,duplicates:0,status:pre.status==='too_large'?'too_large':pre.status==='invalid_json'?'invalid_json':'unreadable',note:pre.note,reason_code:pre.reason_code||''});
    reports.push(pre);continue;
   }
   const p=first.seg===seg?first.parsed:await readSegment(seg);
   if(p.fail){await api.post(`/exports/${batch.id}/segments`,{name:seg.name,size:seg.size,sha256:p.fail.sha||'0'.repeat(64),conversation_count:0,duplicates:0,status:p.fail.status==='invalid_json'?'invalid_json':p.fail.status==='too_large'?'too_large':'unreadable',note:p.fail.note,reason_code:p.fail.reason_code});
    reports.push({name:seg.name,status:p.fail.status,conversations:0,note:p.fail.note,reason_code:p.fail.reason_code});continue;}
   const val=p.validation!,segSha=await hexOf(p.bytes!);
   if(val.provider!==first.provider&&val.provider!=='inconnu'){await api.post(`/exports/${batch.id}/segments`,{name:seg.name,size:seg.size,sha256:segSha,conversation_count:0,duplicates:0,status:'unreadable',note:'Format '+val.provider+' différent du premier segment ('+first.provider+') : segment non inventorié',reason_code:'mixed_format'});
    reports.push({name:seg.name,status:'unreadable',conversations:0,note:'format différent du premier segment',reason_code:'mixed_format'});continue;}
   const inv=inventoryExport(val.items);
   if(done.get(seg.name)===segSha){reports.push({name:seg.name,status:'inventoried',conversations:inv.rows.length,note:'déjà inventorié (empreinte identique) : repris sans rien refaire',skipped:true});continue;}
   // Index des conversations de ce segment : structure, métadonnées, nœuds. Construit conversation par conversation pour limiter la mémoire.
   const byId=new Map<string,{item:any;pos:number}>();val.items.forEach((c:any,i:number)=>{const id=conversationId(c)||'sans-id-'+i;if(!byId.has(id))byId.set(id,{item:c,pos:i});});
   const dropped:Record<string,number>={};const rowPayload=inv.rows.map(x=>{const src2=byId.get(x.source_id);const ix=src2?indexConversation(src2.item):null;
    if(ix)for(const [k,v] of Object.entries(ix.dropped))dropped[k]=(dropped[k]||0)+v;
    return {...x,segment:seg.name,source_index:src2?.pos??null,meta:ix?{scalars:ix.meta.scalars,unstored_keys:ix.meta.unstored_keys,structure:ix.structure}:{scalars:{},unstored_keys:[],structure:{}}};});
   const ignored=new Set<string>();
   for(let i=0;i<rowPayload.length;i+=200){check(ctl);const r=await api.post(`/exports/${batch.id}/conversations`,{rows:rowPayload.slice(i,i+200)});for(const id of r.ignored||[])ignored.add(String(id));
    ctl.onProgress?.({phase:'rows',label:'Enregistrement du manifeste — '+seg.name,done:Math.min(i+200,rowPayload.length),total:rowPayload.length});}
   const kept=inv.rows.filter(x=>!ignored.has(x.source_id));
   // Références de pièces jointes (identifiants seulement).
   const items=kept.map(x=>({source_id:x.source_id,refs:attachmentRefs(byId.get(x.source_id)?.item)})).filter(x=>x.refs.length);
   for(let i=0;i<items.length;i+=40){check(ctl);await api.post(`/exports/${batch.id}/attachments`,{items:items.slice(i,i+40)});}
   // Nœuds : lots de 500 au plus, idempotents ; le segment n'est déclaré terminé qu'après recomptage par le serveur.
   let nodesExpected=0,pending:{source_id:string;nodes:any[]}[]=[],pendingCount=0,sent=0;
   const flush=async()=>{if(!pending.length)return;await api.post(`/exports/${batch.id}/nodes`,{items:pending});pending=[];pendingCount=0;};
   for(const x of kept){
    const ix=indexConversation(byId.get(x.source_id)!.item);nodesExpected+=ix.nodes.length;
    for(let i=0;i<ix.nodes.length;i+=NODE_BATCH){check(ctl);const part=ix.nodes.slice(i,i+NODE_BATCH);
     if(pendingCount+part.length>600)await flush();pending.push({source_id:x.source_id,nodes:part});pendingCount+=part.length;sent+=part.length;}
    if(pendingCount>=500){await flush();ctl.onProgress?.({phase:'nodes',label:'Enregistrement de la structure — '+seg.name,done:sent,total:Math.max(sent,1)});}
   }
   await flush();
   await api.post(`/exports/${batch.id}/segments`,{name:seg.name,size:seg.size,sha256:segSha,conversation_count:inv.rows.length+inv.duplicates.length,duplicates:inv.duplicates.length+ignored.size,status:'inventoried',note:(val.wrapper_unverified?'Les conversations étaient sous la clé « '+val.wrapper+' » (non vérifiée). ':'')+(inv.unrecognized?inv.unrecognized+' entrée(s) non reconnue(s)':''),
    rows_expected:kept.length,nodes_expected:nodesExpected,dropped_fields:Object.fromEntries(Object.entries(dropped).sort((a2,b2)=>b2[1]-a2[1]).slice(0,40)),issues:val.issues,wrapper:val.wrapper||''});
   reports.push({name:seg.name,status:'inventoried',conversations:kept.length,note:(ignored.size?ignored.size+' déjà présente(s) dans un autre segment. ':'')+(val.invalid?val.invalid+' conversation(s) invalide(s). ':'')+(inv.unrecognized?inv.unrecognized+' entrée(s) non reconnue(s)':'')});
   totals.conversations+=kept.length;totals.messages+=kept.reduce((n,x)=>n+x.message_count,0);totals.branches+=kept.reduce((n,x)=>n+x.branch_count,0);totals.attachment_refs+=kept.reduce((n,x)=>n+x.attachment_refs,0);totals.nodes+=nodesExpected;unrec+=inv.unrecognized;invalidTotal+=val.invalid;
   // Libération explicite : plus rien de ce segment ne reste référencé après son inventaire.
   (p as any).value=null;(p as any).bytes=null;(p.validation as any).items=[];
   if(first.seg===seg)first={...first,parsed:{}};
  }catch(e){if(e instanceof Cancelled){cancelled=true;break;}throw e;}
 }
 const annexes=cancelled||!src.isZip?[]:await importAnnexes(file,batch.id,src.annexes,api,ctl);
 return {batch,segments:[...reports],annexes,totals,zip_entries:src.entries,other_entries:src.others.length,unrecognized:unrec,invalid_conversations:invalidTotal,cancelled};
}
/** Annexes (correspondance, vérification, inventaire, exclusions, LISEZMOI) : texte conservé tel quel jusqu'à 1 Mo, sinon empreinte seule. */
async function importAnnexes(file:File,batchId:string,annexes:Annex[],api:Api,ctl:Ctl):Promise<AnnexReport[]>{
 const out:AnnexReport[]=[];
 for(const a of annexes.slice(0,12)){
  check(ctl);
  ctl.onProgress?.({phase:'annexes',label:'Annexe « '+a.name.slice(-60)+' »',done:out.length,total:Math.min(annexes.length,12)});
  try{
   let content:string|null=null,sha:string,note='';
   if(a.entry.size<=MAX_ANNEX_BYTES&&!a.entry.encrypted){
    const bytes=await readEntry(file,a.entry,DEFAULT_LIMITS,MAX_ANNEX_BYTES);sha=await hexOf(bytes);
    try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{content=null;note='Texte non UTF-8 : seuls le nom, la taille et l’empreinte sont conservés.';}
   }else{const h=new Sha256();await streamEntry(file,a.entry,c=>h.update(c),{signal:ctl.signal});sha=h.digestHex();}
   const r=await api.post(`/exports/${batchId}/annexes`,{name:a.name,size:a.entry.size,sha256:sha,content,note});
   out.push({name:a.name,kind:r.kind,status:r.status,note:r.note||''});
  }catch(e){if(e instanceof Cancelled||ctl.signal?.aborted)throw e;out.push({name:a.name,kind:'?',status:'erreur',note:(e as Error).message.slice(0,200)});}
 }
 return out;
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
  // Même règle que l'inventaire (validateConversationJson) : un format accepté à l'inventaire reste lisible ici, une enveloppe ambiguë n'est jamais devinée.
  const val=validateConversationJson(JSON.parse(new TextDecoder().decode(bytes)));
  if(!val.ok)throw new Error('Le fichier « '+name+' » n’a plus une structure de conversations lisible ('+(val.reason||'structure inconnue')+') : aucun message n’a été importé.');
  const found=new Set<string>();
  for(const c of val.items){const id=conversationId(c);if(id&&ids.has(id)&&!found.has(id)){found.add(id);out.push(c);}}
  const missing=[...ids].filter(id=>!found.has(id));
  if(missing.length)throw new Error('Conversation(s) demandée(s) introuvable(s) dans « '+name+' » : '+missing.slice(0,5).join(', ')+(missing.length>5?'…':'')+'. Aucun message n’a été importé : choisissez la même archive que lors de l’inventaire.');
 }
 return out;
}
