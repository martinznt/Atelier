/* Recherche unifiée : types de résultats, étiquettes, extrait centré sur le mot trouvé. Module pur. */
export const FIND_KINDS=['project','memory','chat','imported','decision','task','prompt','document','file','attachment','question','action'] as const;
export type FindKind=typeof FIND_KINDS[number];
export const FIND_LABEL:Record<FindKind,string>={project:'Projets',memory:'Notes de mémoire du projet',chat:'Messages du chat',imported:'Historique importé',decision:'Décisions',task:'Tâches',prompt:'Prompts',document:'Documents de référence',file:'Fichiers',attachment:'Pièces jointes citées',question:'Questions d’Atelier',action:'À faire par Martin'};
/** Types qui portent un statut : si un filtre de statut est demandé, les autres sont exclus plutôt que présentés hors filtre. */
export const HAS_STATUS=new Set<FindKind>(['decision','task','prompt','question','action']);
export const HAS_PROVIDER=new Set<FindKind>(['chat','imported','prompt','attachment']);
export const HAS_ROLE=new Set<FindKind>(['chat','imported']);
export const escapeLike=(q:string)=>'%'+q.slice(0,120).replace(/[\\%_]/g,m=>'\\'+m)+'%';
export function parseKinds(v:string|undefined):FindKind[]{
 const asked=String(v||'').split(',').map(x=>x.trim()).filter(Boolean);
 const ok=asked.filter((k):k is FindKind=>(FIND_KINDS as readonly string[]).includes(k));
 return ok.length?[...new Set(ok)]:[...FIND_KINDS];
}
/** Extrait d'environ 160 caractères autour de la première occurrence ; sans occurrence, début du texte. */
export function excerptAround(text:string,q:string,radius=80):string{
 const t=String(text||'').replace(/\s+/g,' ').trim(),i=t.toLowerCase().indexOf(q.toLowerCase());
 if(i<0)return t.slice(0,radius*2)+(t.length>radius*2?'…':'');
 const start=Math.max(0,i-radius),end=Math.min(t.length,i+q.length+radius);
 return (start>0?'…':'')+t.slice(start,end)+(end<t.length?'…':'');
}
export interface Hit{kind:FindKind;id:string;title:string;excerpt:string;project_id:string|null;project_name:string|null;date:string|null;provider:string|null;status:string|null;role:string|null;open:Record<string,unknown>}
