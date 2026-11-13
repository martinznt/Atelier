/* Classement des entrées d'une archive d'export, validation de la structure des conversations, index des nœuds, lecture des annexes.
   Modules purs : aucun réseau, aucune écriture. Une archive est une donnée non fiable : on valide la structure, jamais seulement le nom.
   Les formats des annexes de l'archive filtrée (correspondance_fichiers.json, verification.json…) n'ont pas pu être vérifiés sur l'archive
   réelle : leur lecture est tolérante, signale ce qu'elle ne comprend pas et ne crée un lien que si le fichier visé existe dans l'archive. */
export const ARCHIVE_GROUPS=['sites','pieces_jointes','bibliotheque_non_rattachee'] as const;
export type ArchiveGroup=typeof ARCHIVE_GROUPS[number]|'autre';
export type EntryKind='conversations'|'correspondance'|'inventaire'|'verification'|'exclusions'|'lisez_moi'|'fichier'|'dangereux';
export const GROUP_LABEL:Record<ArchiveGroup,string>={sites:'Sites',pieces_jointes:'Pièces jointes',bibliotheque_non_rattachee:'Bibliothèque non rattachée',autre:'Autres fichiers'};
/** Nom d'un fichier de conversations : conversations.json, conversations-000.json, conversations_1.json, conversations_filtrees.json. */
export const CONVERSATION_NAME=/^conversations(?:[-_](?:\d{1,6}|filtrees?|filtered))?\.json$/i;
const ANNEX:[RegExp,EntryKind][]=[[/^correspondance_fichiers\.json$/i,'correspondance'],[/^inventaire_complet\.json$/i,'inventaire'],[/^verification\.json$/i,'verification'],[/^exclusions_images\.json$/i,'exclusions'],[/^lisez-?moi[\w.\-]*\.(txt|md)$/i,'lisez_moi']];
export function entryNameProblem(name:string):string|null{
 if(!name||name.length>500)return 'nom vide ou trop long';
 if(/[\u0000-\u001f]/.test(name))return 'caractère de contrôle';
 if(name.startsWith('/')||/^[A-Za-z]:[\\/]/.test(name)||name.includes('\\'))return 'chemin absolu ou séparateur inhabituel';
 if(name.split('/').some(p=>p==='..'))return 'remontée de dossier (..)';
 return null;
}
export interface Classified{kind:EntryKind;group:ArchiveGroup;base:string;depth:number}
/** Une archive peut avoir un dossier racine (« export/… ») : au plus un niveau est toléré pour les fichiers de tête. Un fichier placé dans sites/, pieces_jointes/ ou bibliotheque_non_rattachee/ est TOUJOURS une ressource, même s'il s'appelle conversations.json. */
export function classifyEntry(name:string):Classified{
 const bad=entryNameProblem(name);const parts=name.replace(/^\.\//,'').split('/').filter(Boolean),base=parts[parts.length-1]||'';
 if(bad)return {kind:'dangereux',group:'autre',base,depth:parts.length};
 if(name.endsWith('/'))return {kind:'fichier',group:'autre',base,depth:parts.length};                     // un dossier n'est jamais un segment
 const folders=parts.slice(0,-1),g=folders.find(p=>(ARCHIVE_GROUPS as readonly string[]).includes(p.toLowerCase()));
 if(g)return {kind:'fichier',group:g.toLowerCase() as ArchiveGroup,base,depth:parts.length};
 if(parts.length<=2){
  if(CONVERSATION_NAME.test(base))return {kind:'conversations',group:'autre',base,depth:parts.length};
  for(const [re,k] of ANNEX)if(re.test(base))return {kind:k,group:'autre',base,depth:parts.length};
 }
 return {kind:'fichier',group:'autre',base,depth:parts.length};
}
export const isConversationFile=(name:string)=>classifyEntry(name).kind==='conversations';

/* ---------- Profondeur et validation ---------- */
/** Profondeur maximale d'imbrication d'un texte JSON, sans l'analyser entièrement (les chaînes sont ignorées). S'arrête dès la limite dépassée. */
export function maxJsonDepth(text:string,limit=100):number{
 let depth=0,max=0,inStr=false,esc=false;
 for(let i=0;i<text.length;i++){
  const c=text.charCodeAt(i);
  if(inStr){if(esc)esc=false;else if(c===92)esc=true;else if(c===34)inStr=false;continue;}
  if(c===34)inStr=true;else if(c===91||c===123){depth++;if(depth>max){max=depth;if(max>limit)return max;}}else if(c===93||c===125)depth--;
 }
 return max;
}
export interface SegmentIssue{index:number;reason:string}
export interface SegmentValidation{ok:boolean;items:any[];wrapper:string|null;wrapper_unverified:boolean;provider:'ChatGPT'|'Claude'|'inconnu';valid:number;invalid:number;issues:SegmentIssue[];reason:string|null}
const isObj=(v:unknown):v is Record<string,any>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
export const conversationId=(c:any)=>String(c?.id||c?.conversation_id||c?.uuid||'');
function kindOf(c:any):'ChatGPT'|'Claude'|null{return isObj(c)&&isObj(c.mapping)?'ChatGPT':isObj(c)&&Array.isArray(c.chat_messages)?'Claude':null;}
/** Valide la structure d'un fichier de conversations déjà analysé. Le nom du fichier ne suffit jamais. */
export function validateConversationJson(value:unknown,limits={maxConversations:200_000,maxNodes:100_000}):SegmentValidation{
 const out:SegmentValidation={ok:false,items:[],wrapper:null,wrapper_unverified:false,provider:'inconnu',valid:0,invalid:0,issues:[],reason:null};
 let items:any[]|null=null;
 if(Array.isArray(value))items=value;
 else if(isObj(value)){
  if(Array.isArray(value.conversations)){items=value.conversations;out.wrapper='conversations';}
  else if(kindOf(value)){items=[value];}
  else{const arrays=Object.entries(value).filter(([,v])=>Array.isArray(v)&&(v as any[]).some(x=>kindOf(x)));
   if(arrays.length===1){items=arrays[0][1] as any[];out.wrapper=arrays[0][0];out.wrapper_unverified=true;}
   else{out.reason=arrays.length>1?'Plusieurs listes de conversations dans le même fichier : structure ambiguë, rien n’est choisi.':'Aucune liste de conversations reconnue (ni tableau, ni « conversations »).';return out;}}
 }else{out.reason='Le fichier ne contient ni liste ni objet de conversations.';return out;}
 if(!items.length){out.reason='Liste de conversations vide.';return out;}
 if(items.length>limits.maxConversations){out.reason='Plus de '+limits.maxConversations+' conversations dans un seul fichier : refusé par prudence.';return out;}
 items.forEach((c,i)=>{
  const k=kindOf(c);
  if(!k){out.invalid++;if(out.issues.length<50)out.issues.push({index:i,reason:isObj(c)?'structure non reconnue (ni « mapping » ni « chat_messages »)':'entrée qui n’est pas un objet'});return;}
  if(!conversationId(c)){out.invalid++;if(out.issues.length<50)out.issues.push({index:i,reason:'identifiant de conversation absent'});return;}
  const n=k==='ChatGPT'?Object.keys(c.mapping).length:c.chat_messages.length;
  if(n>limits.maxNodes){out.invalid++;if(out.issues.length<50)out.issues.push({index:i,reason:'plus de '+limits.maxNodes+' nœuds dans une conversation : refusée par prudence'});return;}
  if(out.provider==='inconnu')out.provider=k;else if(out.provider!==k){out.invalid++;if(out.issues.length<50)out.issues.push({index:i,reason:'format '+k+' mêlé à '+out.provider+' dans le même fichier'});return;}
  out.valid++;
 });
 out.items=items;out.ok=out.valid>0;
 if(!out.ok)out.reason='Aucune conversation valide : '+(out.issues[0]?.reason||'structure inconnue')+'.';
 return out;
}

/* ---------- Index des nœuds ---------- */
export interface NodeRow{node_id:string;parent_id:string|null;children:string[];role:string;content_type:string;create_time:string|null;has_text:boolean;text_chars:number;attachment_refs:number;meta:Record<string,string|number|boolean|null>}
const iso=(v:unknown):string|null=>{if(v===null||v===undefined||v==='')return null;const d=new Date(typeof v==='number'?v*1000:String(v));return Number.isNaN(d.valueOf())?null:d.toISOString();};
const NODE_META=['model_slug','status','end_turn','recipient','weight','is_visually_hidden_from_conversation','channel','parent_id'];
const NIL_PARENT=/^0{8}-0{4}-[0-9a-f]{4}-[89ab]?[0-9a-f]{3}-0{12}$|^0{8}-0{4}-0{4}-0{4}-0{12}$/i;
export interface ConversationIndex{nodes:NodeRow[];meta:{scalars:Record<string,string|number|boolean|null>;unstored_keys:string[]};dropped:Record<string,number>;structure:Structure}
export interface Structure{roots:number;dangling:number;cycles:number;branch_points:number;leaves:number;current_node:string|null;current_node_ok:boolean|null}
const scalar=(v:unknown)=>v===null||['string','number','boolean'].includes(typeof v);
/** Conserve la forme du déroulement : un enregistrement par nœud (parent, enfants dans l'ordre), les métadonnées scalaires utiles, et la LISTE de ce qui n'est pas conservé. */
export function indexConversation(c:any):ConversationIndex{
 const dropped:Record<string,number>={},nodes:NodeRow[]=[];
 const scalars:Record<string,string|number|boolean|null>={},unstored:string[]=[];
 const skipTop=new Set(['mapping','chat_messages','title','name','create_time','update_time','created_at','updated_at','id','conversation_id','uuid']);
 for(const [k,v] of Object.entries(c||{})){if(skipTop.has(k))continue;if(scalar(v)){if(Object.keys(scalars).length<40)scalars[k]=typeof v==='string'?v.slice(0,200):v as any;}else unstored.push(k);}
 if(isObj(c?.mapping)){
  for(const [key,node] of Object.entries<any>(c.mapping)){
   const m=node?.message,parts=m?.content?.parts;let text=0,hasText=typeof m?.content?.text==='string'&&m.content.text.trim().length>0,refs=0;
   if(hasText)text=m.content.text.length;
   if(Array.isArray(parts))for(const p of parts){if(typeof p==='string'){if(p.trim()){hasText=true;text+=p.length;}}else if(isObj(p)){if(typeof p.text==='string'&&p.text.trim()){hasText=true;text+=p.text.length;}if(p.asset_pointer||p.content_type==='image_asset_pointer')refs++;}}
   if(Array.isArray(m?.metadata?.attachments))refs+=m.metadata.attachments.length;
   const meta:NodeRow['meta']={};
   for(const [k,v] of Object.entries<any>(m?.metadata||{})){if(NODE_META.includes(k)&&scalar(v))meta[k]=typeof v==='string'?v.slice(0,120):v;else dropped['metadata.'+k]=(dropped['metadata.'+k]||0)+1;}
   if(m){for(const k of Object.keys(m))if(!['id','author','create_time','update_time','content','status','end_turn','weight','metadata','recipient','channel'].includes(k))dropped['message.'+k]=(dropped['message.'+k]||0)+1;}
   for(const k of Object.keys(node||{}))if(!['id','message','parent','children'].includes(k))dropped['node.'+k]=(dropped['node.'+k]||0)+1;
   nodes.push({node_id:String(node?.id||key),parent_id:node?.parent===null||node?.parent===undefined?null:String(node.parent),children:Array.isArray(node?.children)?node.children.map(String):[],role:String(m?.author?.role||''),content_type:String(m?.content?.content_type||''),create_time:iso(m?.create_time),has_text:hasText,text_chars:text,attachment_refs:refs,meta});
  }
 }else if(Array.isArray(c?.chat_messages)){
  const kids=new Map<string,string[]>();
  for(const m of c.chat_messages){const p=m?.parent_message_uuid;if(p){(kids.get(String(p))||kids.set(String(p),[]).get(String(p))!).push(String(m.uuid||''));}}
  c.chat_messages.forEach((m:any,i:number)=>{
   const id=String(m?.uuid||'sans-id-'+i),textBlocks=Array.isArray(m?.content)?m.content.filter((p:any)=>typeof p?.text==='string'&&p.text.trim()):[],direct=typeof m?.text==='string'&&m.text.trim()?m.text:'';
   const text=direct.length+textBlocks.reduce((n:number,p:any)=>n+p.text.length,0);
   for(const k of Object.keys(m||{}))if(!['uuid','text','content','sender','created_at','updated_at','parent_message_uuid','attachments','files'].includes(k))dropped['message.'+k]=(dropped['message.'+k]||0)+1;
   nodes.push({node_id:id,parent_id:m?.parent_message_uuid?String(m.parent_message_uuid):null,children:kids.get(id)||[],role:String(m?.sender||''),content_type:'text',create_time:iso(m?.created_at),has_text:text>0,text_chars:text,attachment_refs:(Array.isArray(m?.attachments)?m.attachments.length:0)+(Array.isArray(m?.files)?m.files.length:0),meta:{}});
  });
 }
 return {nodes,meta:{scalars,unstored_keys:unstored.slice(0,30)},dropped,structure:structureOf(nodes,typeof c?.current_node==='string'?c.current_node:null)};
}
/** Contrôle de cohérence de l'arbre : racines, parents introuvables, cycles, points de branchement, feuilles, nœud actif présent. */
export function structureOf(nodes:{node_id:string;parent_id:string|null;children:string[]}[],currentNode:string|null=null):Structure{
 const ids=new Set(nodes.map(n=>n.node_id));let roots=0,dangling=0,branch=0,leaves=0;
 for(const n of nodes){
  if(n.parent_id===null||NIL_PARENT.test(n.parent_id))roots++;else if(!ids.has(n.parent_id))dangling++;
  if(n.children.length>1)branch++;if(!n.children.length)leaves++;
 }
 // Cycles : on remonte la chaîne des parents de chaque nœud ; un nœud revu dans la même remontée est un cycle.
 const parent=new Map(nodes.map(n=>[n.node_id,n.parent_id])),state=new Map<string,number>();let cycles=0;
 for(const n of nodes){
  if(state.get(n.node_id)===2)continue;const path:string[]=[];let cur:string|null=n.node_id;
  while(cur&&parent.has(cur)&&state.get(cur)!==2){if(state.get(cur)===1){cycles++;break;}state.set(cur,1);path.push(cur);cur=parent.get(cur)??null;}
  for(const p of path)state.set(p,2);
 }
 return {roots,dangling,cycles,branch_points:branch,leaves,current_node:currentNode,current_node_ok:currentNode===null?null:ids.has(currentNode)};
}

/* ---------- Annexes ---------- */
export interface Shape{type:string;length:number|null;keys:string[]}
export function jsonShape(v:unknown):Shape{return Array.isArray(v)?{type:'array',length:v.length,keys:isObj(v[0])?Object.keys(v[0]).slice(0,30):[]}:isObj(v)?{type:'object',length:Object.keys(v).length,keys:Object.keys(v).slice(0,30)}:{type:v===null?'null':typeof v,length:null,keys:[]};}
const ID_FIELDS=['id','file_id','fichier_id','id_fichier','reference','ref','asset_pointer','file-id'],PATH_FIELDS=['chemin','path','fichier','file','nom_archive','archive_path','chemin_archive','destination'];
const stripScheme=(s:string)=>s.replace(/^[a-z-]+:\/\//i,'').trim();
const pathLike=(s:string)=>/[\/.]/.test(s)&&s.length<=500&&!/\s{2,}/.test(s);
export interface Correspondance{shape:'map'|'records'|'inconnue';pairs:{ref:string;path:string}[];skipped:number;reason:string|null}
/** Lecture tolérante de correspondance_fichiers.json : {id: chemin} ou [{id…, chemin…}], éventuellement sous une clé unique. Toute autre forme est signalée, jamais devinée. */
export function readCorrespondance(value:unknown):Correspondance{
 let v:any=value;
 if(isObj(v)&&Object.keys(v).length===1&&(Array.isArray(Object.values(v)[0])||isObj(Object.values(v)[0])))v=Object.values(v)[0];
 const pairs:{ref:string;path:string}[]=[];let skipped=0;
 if(isObj(v)){
  const entries=Object.entries(v);
  if(entries.length&&entries.every(([,x])=>typeof x==='string')){
   for(const [k,x] of entries){const ref=stripScheme(k),path=String(x).replace(/^\.\//,'');if(ref&&pathLike(path))pairs.push({ref,path});else skipped++;}
   return {shape:'map',pairs,skipped,reason:pairs.length?null:'Aucun couple identifiant → chemin exploitable.'};
  }
 }else if(Array.isArray(v)&&v.every(isObj)){
  for(const r of v){
   const idKey=ID_FIELDS.find(k=>typeof r[k]==='string'&&r[k]),pathKey=PATH_FIELDS.find(k=>typeof r[k]==='string'&&r[k]&&pathLike(r[k]));
   if(idKey&&pathKey)pairs.push({ref:stripScheme(r[idKey]),path:String(r[pathKey]).replace(/^\.\//,'')});else skipped++;
  }
  return {shape:'records',pairs,skipped,reason:pairs.length?null:'Aucun enregistrement avec un identifiant et un chemin reconnus.'};
 }
 return {shape:'inconnue',pairs:[],skipped:0,reason:'Forme non reconnue : ni {identifiant: chemin} ni liste d’enregistrements. Aucun lien créé.'};
}
const fold=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
export interface Claim{key:string;value:number;category:'conversations'|'messages'|'nodes'}
const NOT_RETAINED=/exclu|exclud|ignor|rejet|supprim|manqu|absent|introuv|error|erreur|echec|avant|origin|initial/;
/** Chiffres annoncés par une annexe (verification.json, inventaire_complet.json) : heuristique sur les NOMS de clés, à vérifier avec l'archive réelle. */
export function claimedCounts(value:unknown):Claim[]{
 const out:Claim[]=[];let leaves=0;
 const walk=(v:any,path:string,depth:number)=>{
  if(leaves>600||depth>6)return;
  if(typeof v==='number'&&Number.isInteger(v)&&v>=0){leaves++;const k=fold(path);if(NOT_RETAINED.test(k))return;
   const cat=/noeud|node/.test(k)?'nodes':/message/.test(k)?'messages':/conversation/.test(k)?'conversations':null;if(cat)out.push({key:path,value:v,category:cat});return;}
  if(Array.isArray(v)){return;}
  if(isObj(v))for(const [k,x] of Object.entries(v))walk(x,path?path+'.'+k:k,depth+1);
 };
 walk(value,'',0);return out;
}
export type Comparison={category:string;recorded:number;claimed:number[];status:'concordant'|'ecart'|'non_annonce'};
export function compareClaims(claims:Claim[],recorded:Record<'conversations'|'messages'|'nodes',number>):Comparison[]{
 return (['conversations','messages','nodes'] as const).map(category=>{const claimed=[...new Set(claims.filter(c=>c.category===category).map(c=>c.value))];
  return {category,recorded:recorded[category],claimed,status:!claimed.length?'non_annonce':claimed.includes(recorded[category])?'concordant':'ecart'} as Comparison;});
}
