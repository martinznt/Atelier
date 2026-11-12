/* Référentiel mémoire (dépôt Git en lecture seule) : classement d'un chemin en projet, type, titre, date et identifiant. */
export interface TreeEntry{path:string;type:string;sha:string;size?:number}
export interface MemoryDocMeta{path:string;blob_sha:string;size:number;project_key:string;doc_type:string;title:string;doc_date:string|null;doc_ref:string|null}
export const MEMORY_PROJECTS:Record<string,string>={general:'Général',atelier:'Atelier',sport:'Sport / Mes séances',livre_recettes:'Livre de recettes',autres:'Autres projets'};
export const MEMORY_TYPES:Record<string,string>={pilotage:'Pilotage',source:'Source',analyse:'Analyse',cahier:'Cahier des charges',decision:'Décision',audit:'Audit',prompt:'Prompt',questionnaire:'Questionnaire',conversation:'Conversation',chronologie:'Chronologie',fondation:'Fichier de fondation',tache:'Tâches et journal',methode:'Méthode',manifest:'Manifeste',autre:'Autre'};
const TEXT=/\.(md|txt|json|html|csv|ya?ml)$/i;
export const isTextDoc=(path:string)=>TEXT.test(path);
function projectOf(p:string):string{
 const u=p.toUpperCase();
 if(/(^|\/)(01_SPORT|SPORT)(\/|$)/.test(u)||/SPORT|SEANCES/.test(u.split('/').pop()||''))return 'sport';
 if(/LIVRE_DE_RECETTES|LIVRE_RECETTES|RECETTES/.test(u))return 'livre_recettes';
 if(/(^|\/)02_ATELIER(\/|$)|INTEGRATION_ATELIER|(^|[-_/])ATELIER[-_.]/.test(u))return 'atelier';
 if(/AUTRES_PROJETS|CINEMATHEQUE|OUTFIT/.test(u))return 'autres';
 return 'general';
}
function typeOf(p:string):string{
 const u=p.toUpperCase(),name=u.split('/').pop()||'';
 if(/MANIFESTS\//.test(u))return 'manifest';
 if(/04_PROMPTS\//.test(u)||/^PROMPT-/.test(name))return 'prompt';
 if(/QUESTIONNAIRE|REPONSES-/.test(u))return 'questionnaire';
 if(/\/AUDITS\//.test(u)||/AUDIT/.test(name))return 'audit';
 if(/CAHIER_DES_CHARGES|CAHIER-/.test(name))return 'cahier';
 if(/DECISION/.test(name))return 'decision';
 if(/CHRONOLOGIE/.test(name)||/08_DECISIONS_ET_EVOLUTION\//.test(u))return 'chronologie';
 if(/08_FICHIERS_FONDATION\//.test(u))return 'fondation';
 if(/07_CONVERSATIONS/.test(u))return 'conversation';
 if(/01_SOURCES_ORIGINALES\/|SOURCES_HISTORIQUES\//.test(u))return 'source';
 if(/02_ANALYSES_EXTRACTIONS\//.test(u))return 'analyse';
 if(/09_TACHES_ET_JOURNAL\/|JOURNAL|REGISTRE_TACHES/.test(u))return 'tache';
 if(/05_METHODE|PROTOCOLE|PROCESSUS|REGLES_DE_TRAVAIL/.test(u))return 'methode';
 if(/00_PILOTAGE\//.test(u))return 'pilotage';
 return 'autre';
}
export function classifyMemoryPath(path:string):Omit<MemoryDocMeta,'blob_sha'|'size'|'path'>{
 const name=path.split('/').pop()||path;
 const date=/(\d{4}-\d{2}-\d{2})/.exec(name)?.[1]||null;
 const ref=/((?:PROMPT|FONDATION|QUESTIONNAIRE|RAPPORT|REPONSES)-[A-Z0-9-]+?)(?:-\d{4}-\d{2}-\d{2})?\.[a-z]+$/i.exec(name)?.[1]?.toUpperCase()||null;
 const title=name.replace(/\.[a-z0-9]+$/i,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
 return {project_key:projectOf(path),doc_type:typeOf(path),title:title.slice(0,200)||path,doc_date:date,doc_ref:ref};
}
/** Seuls les fichiers (blobs) sont indexés ; les chemins dangereux sont écartés. */
export function treeToDocs(tree:TreeEntry[]):MemoryDocMeta[]{
 const out:MemoryDocMeta[]=[];
 for(const e of tree){
  if(e.type!=='blob'||typeof e.path!=='string'||!/^[0-9a-f]{40}$/.test(String(e.sha)))continue;
  if(e.path.length>400||e.path.startsWith('/')||e.path.split('/').some(s=>s==='..'||s==='.'))continue;
  out.push({path:e.path,blob_sha:e.sha,size:Number(e.size)||0,...classifyMemoryPath(e.path)});
 }
 return out;
}
