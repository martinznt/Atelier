/* Bibliothèque de prompts : statuts, versions verrouillées, lecture d'une fiche Markdown avec en-tête, exports MD/TXT. */
export const PROMPT_STATUSES=['to_prepare','to_give','given','awaiting','response_received','processed','obsolete'] as const;
export type PromptStatus=typeof PROMPT_STATUSES[number];
/** Libellé d'affichage : « Copié » et « Remplacé » sont dérivés, ils ne changent jamais l'état réel du prompt. */
export function displayLabel(r:{status:string;copied_at?:string|null;superseded_by?:string|null}):string{
 if(r.status==='obsolete')return r.superseded_by?'Remplacé':'Abandonné';
 if(r.status==='processed')return 'Terminé';
 if(r.status==='to_give')return r.copied_at?'Copié — transmission non confirmée':'À donner — prêt à copier';
 if(r.status==='given')return 'Transmis';
 return PROMPT_LABEL[r.status as PromptStatus]||r.status;
}
export const PROMPT_LABEL:Record<PromptStatus,string>={to_prepare:'À préparer',to_give:'À donner',given:'Déjà donné',awaiting:'En attente de retour',response_received:'Réponse reçue',processed:'Traité',obsolete:'Obsolète / abandonné'};
/** « Déjà donné » n'est atteint que par la confirmation de transmission ; « Réponse reçue » que par l'ajout d'une réponse. */
const manual:Record<PromptStatus,PromptStatus[]>={
 to_prepare:['to_give','obsolete'],to_give:['to_prepare','obsolete'],given:['awaiting','obsolete'],awaiting:['given','obsolete'],
 response_received:['processed','awaiting','obsolete'],processed:['response_received','obsolete'],obsolete:['to_prepare']
};
export const canSetStatus=(from:PromptStatus,to:PromptStatus)=>manual[from]?.includes(to)||false;
export interface PromptCommand{label:string;command:string;where_when:string}
export function cleanCommands(raw:unknown):PromptCommand[]{
 if(!Array.isArray(raw))return [];
 return raw.slice(0,10).map((c:any)=>({label:String(c?.label||'').slice(0,120),command:String(c?.command||'').slice(0,500),where_when:String(c?.where_when||'').slice(0,300)})).filter(c=>c.command.trim());
}
/** En-tête `--- clé: valeur ---` en début de fiche, ou après un premier titre. Les valeurs vides restent vides : rien n'est inventé. */
export function parsePromptDocument(md:string):{meta:Record<string,string>;body:string;title:string|null}{
 const text=String(md||'').replace(/\r\n/g,'\n');
 const m=/(^|\n)---\n([\s\S]*?)\n---\n?/.exec(text);
 const title=/^#\s+(.+)$/m.exec(text)?.[1]?.trim()||null;
 if(!m)return {meta:{},body:text.trim(),title};
 const meta:Record<string,string>={};
 for(const line of m[2].split('\n')){const i=line.indexOf(':');if(i<1)continue;const k=line.slice(0,i).trim().toLowerCase();if(/^[a-z_]{2,40}$/.test(k))meta[k]=line.slice(i+1).trim();}
 const body=[text.slice(0,m.index).trim(),text.slice(m.index+m[0].length).trim()].filter(Boolean).join('\n\n');
 return {meta,body,title};
}
const STATUS_HINTS:[RegExp,PromptStatus][]=[[/obsol|abandon/i,'obsolete'],[/trait/i,'processed'],[/r[ée]ponse re[cç]ue/i,'response_received'],[/attente/i,'awaiting'],[/d[ée]j[aà] (donn|envoy|transmis)/i,'given'],[/[àa] donner/i,'to_give'],[/pr[ée]parer/i,'to_prepare']];
/** Statut lu dans une fiche : « Déjà donné » n'est retenu que si une date d'envoi est écrite dans la fiche. */
export function statusFromMeta(meta:Record<string,string>):PromptStatus{
 const raw=meta.status||'';
 for(const [re,s] of STATUS_HINTS)if(re.test(raw)){if((s==='given'||s==='awaiting'||s==='response_received'||s==='processed')&&!/\d{4}-\d{2}-\d{2}/.test(meta.sent_at||''))return 'to_give';return s;}
 return 'to_prepare';
}
export interface PromptExport{code:string;title:string;project:string;recipient:string;provider:string;product:string;model:string;effort:string;version:number;status:PromptStatus;created_at:string;planned_send:string|null;sent_at:string|null;objective:string;body:string;commands:PromptCommand[];content_hash:string}
export function promptMarkdown(p:PromptExport):string{
 const head=['---','id: '+p.code,'title: '+p.title,'project: '+p.project,'recipient: '+p.recipient,'provider: '+p.provider,'product: '+p.product,'model: '+(p.model||'inconnu'),'reasoning_effort: '+(p.effort||'inconnu'),
  'created_at: '+p.created_at,'planned_send: '+(p.planned_send||''),'sent_at: '+(p.sent_at||''),'status: '+PROMPT_LABEL[p.status],'version: '+p.version,'content_sha256: '+p.content_hash,'---',''];
 const cmds=p.commands.length?['','## Commandes à exécuter séparément (ne font pas partie du texte à coller)',...p.commands.map(c=>'- `'+c.command+'`'+(c.label?' — '+c.label:'')+(c.where_when?' ('+c.where_when+')':''))]:[];
 return head.join('\n')+p.body+'\n'+cmds.join('\n')+(cmds.length?'\n':'');
}
export const promptText=(p:PromptExport)=>p.body+'\n';
export function nextCode(existing:string[],prefix:string):string{
 const clean=prefix.toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,40)||'PROMPT';
 let max=0;for(const c of existing){const m=new RegExp('^'+clean+'-(\\d{4})$').exec(c);if(m)max=Math.max(max,Number(m[1]));}
 return clean+'-'+String(max+1).padStart(4,'0');
}
