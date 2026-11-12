/* Inventaire d'un export personnel (ChatGPT : conversations.json avec `mapping` ; Claude : `chat_messages`).
   Fonction pure : ne lit que la structure, n'exécute rien, n'invente ni identifiant ni date. */
export interface InventoryRow{
 source_id:string;title:string;created_time:string|null;updated_time:string|null;
 message_count:number;node_count:number;branch_count:number;attachment_refs:number;non_text_parts:number;
 parse_status:'complete'|'partial'|'error';parse_note:string;
}
export interface Inventory{provider:'ChatGPT'|'Claude'|'inconnu';rows:InventoryRow[];unrecognized:number;duplicates:string[];totals:{conversations:number;messages:number;branches:number;attachment_refs:number;partial:number;error:number}}
const iso=(v:unknown):string|null=>{if(v===null||v===undefined||v==='')return null;const d=new Date(typeof v==='number'?v*1000:String(v));return Number.isNaN(d.valueOf())?null:d.toISOString();};
function chatgpt(c:any,index:number):InventoryRow{
 const notes:string[]=[];let messages=0,nodes=0,branches=0,attach=0,nonText=0;
 const id=c.id||c.conversation_id;if(!id)notes.push('identifiant de conversation absent');
 for(const node of Object.values<any>(c.mapping||{})){
  nodes++;
  if(Array.isArray(node?.children)&&node.children.length>1)branches++;
  const m=node?.message;if(!m)continue;
  const parts=m.content?.parts;let hasText=typeof m.content?.text==='string'&&m.content.text.trim().length>0;
  if(Array.isArray(parts))for(const p of parts){if(typeof p==='string'){if(p.trim())hasText=true;}else if(p&&typeof p==='object'){if(typeof p.text==='string'&&p.text.trim())hasText=true;else nonText++;if(p.asset_pointer||p.content_type==='image_asset_pointer')attach++;}}
  if(Array.isArray(m.metadata?.attachments))attach+=m.metadata.attachments.length;
  if(hasText)messages++;
  if(m.create_time===null||m.create_time===undefined)void 0;
 }
 if(!nodes)notes.push('aucun message');
 if(nonText)notes.push(nonText+' partie(s) non textuelle(s) non reprise(s)');
 if(attach)notes.push(attach+' pièce(s) jointe(s) référencée(s), contenu absent de conversations.json');
 return {source_id:String(id||'sans-id-'+index),title:String(c.title||'Sans titre').slice(0,200),created_time:iso(c.create_time),updated_time:iso(c.update_time),
  message_count:messages,node_count:nodes,branch_count:branches,attachment_refs:attach,non_text_parts:nonText,
  parse_status:!id||!nodes?'error':(nonText||attach)?'partial':'complete',parse_note:notes.join(' ; ')};
}
function claude(c:any,index:number):InventoryRow{
 const notes:string[]=[];let messages=0,attach=0,nonText=0;const parents=new Map<string,number>();
 const list:any[]=Array.isArray(c.chat_messages)?c.chat_messages:[];
 for(const m of list){
  const text=typeof m.text==='string'&&m.text.trim()?true:Array.isArray(m.content)&&m.content.some((p:any)=>typeof p?.text==='string'&&p.text.trim());
  if(Array.isArray(m.content))nonText+=m.content.filter((p:any)=>p&&p.type&&p.type!=='text').length;
  attach+=(Array.isArray(m.attachments)?m.attachments.length:0)+(Array.isArray(m.files)?m.files.length:0);
  if(text)messages++;
  if(m.parent_message_uuid)parents.set(m.parent_message_uuid,(parents.get(m.parent_message_uuid)||0)+1);
 }
 const branches=[...parents.values()].filter(n=>n>1).length;
 if(!c.uuid)notes.push('identifiant de conversation absent');
 if(nonText)notes.push(nonText+' partie(s) non textuelle(s) non reprise(s)');
 if(attach)notes.push(attach+' pièce(s) jointe(s) référencée(s)');
 return {source_id:String(c.uuid||'sans-id-'+index),title:String(c.name||'Sans titre').slice(0,200),created_time:iso(c.created_at),updated_time:iso(c.updated_at),
  message_count:messages,node_count:list.length,branch_count:branches,attachment_refs:attach,non_text_parts:nonText,
  parse_status:!c.uuid||!list.length?'error':(nonText||attach)?'partial':'complete',parse_note:notes.join(' ; ')};
}
export function inventoryExport(value:unknown):Inventory{
 const items:any[]=Array.isArray(value)?value:Array.isArray((value as any)?.conversations)?(value as any).conversations:value&&typeof value==='object'?[value]:[];
 const rows:InventoryRow[]=[];let unrecognized=0,provider:Inventory['provider']='inconnu';const seen=new Set<string>(),duplicates:string[]=[];
 items.forEach((c,i)=>{
  let row:InventoryRow|null=null;
  if(c&&typeof c==='object'&&c.mapping&&typeof c.mapping==='object'){row=chatgpt(c,i);provider=provider==='inconnu'?'ChatGPT':provider;}
  else if(c&&typeof c==='object'&&Array.isArray(c.chat_messages)){row=claude(c,i);provider=provider==='inconnu'?'Claude':provider;}
  if(!row){unrecognized++;return;}
  if(seen.has(row.source_id)){duplicates.push(row.source_id);return;}
  seen.add(row.source_id);rows.push(row);
 });
 return {provider,rows,unrecognized,duplicates,totals:{conversations:rows.length,messages:rows.reduce((s,r)=>s+r.message_count,0),branches:rows.reduce((s,r)=>s+r.branch_count,0),attachment_refs:rows.reduce((s,r)=>s+r.attachment_refs,0),partial:rows.filter(r=>r.parse_status==='partial').length,error:rows.filter(r=>r.parse_status==='error').length}};
}
/** Lots reproductibles : conversations entières, triées par date puis identifiant, coupées par nombre de messages. */
export function makeLots(rows:{source_id:string;created_time:string|null;message_count:number}[],maxMessages=400,prefix='LOT'):Record<string,string>{
 const sorted=[...rows].sort((a,b)=>String(a.created_time||'').localeCompare(String(b.created_time||''))||a.source_id.localeCompare(b.source_id));
 const out:Record<string,string>={};let n=1,count=0;
 for(const r of sorted){if(count&&count+r.message_count>maxMessages){n++;count=0;}out[r.source_id]=prefix+'-'+String(n).padStart(3,'0');count+=r.message_count;}
 return out;
}
export interface CoverageRow{parse_status:string;import_status:string;project_id:string|null;project_confirmed:number;lot:string;message_count:number;imported_messages:number;attachment_refs:number}
export function coverageOf(rows:CoverageRow[],analyses:{lot:string;kind:string}[],declaredTotal:number){
 const lots=[...new Set(rows.map(r=>r.lot).filter(Boolean))];
 const lotState=lots.map(l=>({lot:l,independent:analyses.filter(a=>a.lot===l&&a.kind==='independent').length,cross:analyses.filter(a=>a.lot===l&&a.kind!=='independent').length}));
 return {
  conversations:{declared:declaredTotal,inventoried:rows.length,missing_from_inventory:Math.max(0,declaredTotal-rows.length),complete:rows.filter(r=>r.parse_status==='complete').length,partial:rows.filter(r=>r.parse_status==='partial').length,error:rows.filter(r=>r.parse_status==='error').length,ignored:rows.filter(r=>r.parse_status==='ignored').length},
  messages:{inventoried:rows.reduce((s,r)=>s+r.message_count,0),imported:rows.reduce((s,r)=>s+r.imported_messages,0)},
  attachments:{referenced:rows.reduce((s,r)=>s+r.attachment_refs,0),accessible:0,note:'Les pièces jointes ne sont pas dans conversations.json : elles sont comptées comme référencées, jamais reconstituées.'},
  projects:{assigned:rows.filter(r=>r.project_id).length,confirmed:rows.filter(r=>r.project_id&&r.project_confirmed).length,unassigned:rows.filter(r=>!r.project_id).length},
  imports:{imported:rows.filter(r=>r.import_status==='imported').length,partial:rows.filter(r=>r.import_status==='partial').length,not_imported:rows.filter(r=>r.import_status==='not_imported').length},
  lots:{total:lots.length,without_lot:rows.filter(r=>!r.lot).length,with_two_independent:lotState.filter(l=>l.independent>=2).length,with_cross:lotState.filter(l=>l.cross>=1).length,detail:lotState},
  complete:declaredTotal>0&&rows.length>=declaredTotal&&rows.every(r=>r.parse_status==='complete'||r.parse_status==='ignored'),
  warning:'Un export peut ne pas contenir toutes les conversations du compte : cette couverture ne porte que sur le fichier inventorié.'
 };
}
