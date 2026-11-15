/* Lot 1 — cycle de vie et fiabilité des informations (module pur, sans base de données).
   Deux axes séparés :
   - l'ÉTAT (proposée → actuelle → remplacée / abandonnée, plus rejetée et hypothèse) dit si l'information s'applique ;
   - la FIABILITÉ (Vérifié, Confirmé par vous, Rapporté, Hypothèse, Obsolète ou rejeté) dit ce qu'on sait de sa vérité.
   « Obsolète ou rejeté » n'est jamais saisi : il se déduit d'un état remplacé, abandonné ou rejeté.
   Aucune information n'est supprimée : on change d'état, avec date, raison, source et auteur. */
export const LIFE=['proposed','current','replaced','abandoned','rejected','hypothesis'] as const;
export type Life=typeof LIFE[number];
export const STORED_RELIABILITY=['verified','confirmed','reported','hypothesis'] as const;
export type StoredReliability=typeof STORED_RELIABILITY[number];
export type Reliability=StoredReliability|'obsolete';
export type Kind='decision'|'document'|'memory'|'feature';
export const KINDS:Kind[]=['decision','document','memory','feature'];
export type Author='martin'|'ai';

export const LIFE_LABEL:Record<Life,string>={proposed:'Proposée',current:'Actuelle',replaced:'Remplacée',abandoned:'Abandonnée',rejected:'Rejetée',hypothesis:'Hypothèse à vérifier'};
/** Une seule échelle d'affichage : pastille + mot (jamais la couleur seule). */
export const RELIABILITY_VIEW:Record<Reliability,{symbol:string;word:string;help:string}>={
 verified:{symbol:'✔',word:'Vérifié',help:'Une source précise a été consultée et elle répond bien à la demande (ou un test a réussi, pour du code).'},
 confirmed:{symbol:'✔',word:'Confirmé par vous',help:'Vous l’avez décidé ou constaté vous-même.'},
 reported:{symbol:'◐',word:'Rapporté',help:'Dit par une source tierce, non reproduit par vous.'},
 hypothesis:{symbol:'?',word:'Hypothèse',help:'Déduit, ou proposé par une IA : à relire avant de s’en servir.'},
 obsolete:{symbol:'⛔',word:'Obsolète ou rejeté',help:'Remplacé, abandonné ou rejeté : ne plus l’appliquer.'}
};
export const effectiveReliability=(life:Life,rel:StoredReliability):Reliability=>life==='replaced'||life==='abandoned'||life==='rejected'?'obsolete':rel;

/** Transitions d'état permises. Les états remplacée, abandonnée et rejetée ne mènent jamais à « actuelle ». */
export const TRANSITIONS:Record<Life,Life[]>={
 proposed:['current','rejected','hypothesis','abandoned'],
 hypothesis:['current','rejected','proposed','abandoned'],
 current:['replaced','abandoned','hypothesis'],
 replaced:[],
 abandoned:['proposed'],
 rejected:['proposed']
};
export const canMove=(from:Life,to:Life)=>TRANSITIONS[from].includes(to);

export interface ItemState{status:Life;reliability:StoredReliability;source_ref:string;proof_kind:''|'fit'|'test';fit_confirmed_at:string|null;replaced_by_id:string|null;author_kind:Author;derived:boolean}
/* ───────── État déduit des anciennes colonnes (aucune ligne item_lifecycle) ───────── */
export function legacyDecision(status:string):Pick<ItemState,'status'|'reliability'>{
 if(status==='validated')return {status:'current',reliability:'confirmed'};
 if(status==='superseded')return {status:'replaced',reliability:'reported'};
 if(status==='rejected')return {status:'rejected',reliability:'hypothesis'};
 return {status:'proposed',reliability:'hypothesis'};
}
/** Ancienne fiabilité des documents. « verified » devient « reported » : l'ancienne case ne gardait ni source précise ni contrôle « adapté à ma demande ». */
export function legacyDocument(reliability:string):Pick<ItemState,'status'|'reliability'>{
 switch(reliability){
  case 'user_confirmed':return {status:'current',reliability:'confirmed'};
  case 'superseded':return {status:'replaced',reliability:'reported'};
  case 'ai_proposed':return {status:'proposed',reliability:'hypothesis'};
  case 'to_confirm':case 'deduced':return {status:'hypothesis',reliability:'hypothesis'};
  default:return {status:'current',reliability:'reported'}; // verified, reported, unverified
 }
}
/** Une note saisie par Martin (source « Saisie… ») est confirmée ; toute autre origine est une proposition à relire. */
export function legacyMemory(source:string):Pick<ItemState,'status'|'reliability'>{
 return /^saisie/i.test(String(source||'').trim())?{status:'current',reliability:'confirmed'}:{status:'proposed',reliability:'hypothesis'};
}
/** Mêmes règles en SQL, pour filtrer sans charger les lignes. Testé contre les fonctions ci-dessus. */
export const LEGACY_LIFE_SQL={
 decision:"CASE d.status WHEN 'validated' THEN 'current' WHEN 'superseded' THEN 'replaced' WHEN 'rejected' THEN 'rejected' ELSE 'proposed' END",
 document:"CASE d.reliability WHEN 'superseded' THEN 'replaced' WHEN 'ai_proposed' THEN 'proposed' WHEN 'to_confirm' THEN 'hypothesis' WHEN 'deduced' THEN 'hypothesis' ELSE 'current' END",
 memory:"CASE WHEN lower(trim(m.source)) LIKE 'saisie%' THEN 'current' ELSE 'proposed' END"
};
/** Correspondance des statuts de Memoire-Projets (docs/CORRESPONDANCE_STATUTS.md). Une valeur inconnue renvoie null : jamais de devinette. */
export function fromMemoireProjets(label:string):Pick<ItemState,'status'|'reliability'>|null{
 const k=String(label||'').normalize('NFC').trim().toUpperCase().replace(/\s+/g,' ');
 const table:Record<string,Pick<ItemState,'status'|'reliability'>>={
  'CONFIRMÉE':{status:'current',reliability:'confirmed'},'ACTUELLE':{status:'current',reliability:'confirmed'},
  'PROVISOIRE':{status:'hypothesis',reliability:'hypothesis'},'À CONFIRMER':{status:'hypothesis',reliability:'hypothesis'},
  'PROPOSÉE':{status:'proposed',reliability:'hypothesis'},'HYPOTHÈSE':{status:'hypothesis',reliability:'hypothesis'},
  'REMPLACÉE':{status:'replaced',reliability:'reported'},'REJETÉE':{status:'rejected',reliability:'hypothesis'},'ABANDONNÉE':{status:'abandoned',reliability:'hypothesis'},
  'FAIT VÉRIFIÉ':{status:'current',reliability:'reported'}
 };
 return table[k]||null;
}
/** Valeur à écrire dans l'ancienne colonne `project_decisions.status` pour que les anciens écrans et prompts restent justes. */
export function legacyDecisionMirror(life:Life):'proposed'|'validated'|'rejected'|'superseded'{
 return life==='current'?'validated':life==='replaced'||life==='abandoned'?'superseded':life==='rejected'?'rejected':'proposed';
}

/* ───────── Règles de changement ───────── */
export interface Change{
 kind:Kind;cur:ItemState;itemId:string;author:Author;reason:string;
 to_status?:Life;to_reliability?:StoredReliability;
 source_ref?:string;fit_confirmed?:boolean;test_passed?:boolean;validated_by_martin?:boolean;replaced_by_id?:string|null;
 /** Renseigné par l'appelant après lecture de la base : la remplaçante existe-t-elle, dans ce projet, pour ce type ? */
 replacement?:{exists:boolean;status?:Life}|null;
}
export type Outcome={ok:true;next:Omit<ItemState,'derived'>;changed:{status:boolean;reliability:boolean}}|{ok:false;message:string};
export const VERIFY_MESSAGE='Pour passer à « Vérifié », indiquez une source précise (lien, fichier, test ou commit) ET cochez « adapté à ma demande » (ou indiquez qu’un test a réussi pour du code). Sinon l’élément reste « Rapporté ».';
const no=(message:string):Outcome=>({ok:false,message});
export function applyChange(ch:Change,at:string):Outcome{
 const {cur}=ch;
 if(String(ch.reason||'').trim().length<3)return no('Dites pourquoi vous changez cet état : la raison est gardée dans l’historique.');
 if(!ch.to_status&&!ch.to_reliability)return no('Aucun changement demandé.');
 const status=ch.to_status??cur.status;
 let rel=ch.to_reliability??cur.reliability,proof=cur.proof_kind,fitAt=cur.fit_confirmed_at,replacedBy=cur.replaced_by_id;
 const source=ch.source_ref!==undefined?String(ch.source_ref).trim():cur.source_ref;
 const statusChanged=status!==cur.status;
 if(statusChanged){
  if(!(LIFE as readonly string[]).includes(status))return no('État inconnu.');
  if(!canMove(cur.status,status))return no('Ce changement n’est pas permis : une information « '+LIFE_LABEL[cur.status].toLowerCase()+' » ne peut pas devenir « '+LIFE_LABEL[status].toLowerCase()+' »'+(cur.status==='replaced'?' (une information remplacée est définitive : créez-en une nouvelle).':'.'));
  if(status==='current'){
   if(ch.author==='ai')return no('Une proposition d’IA n’est jamais une décision : seul Martin peut la passer à « Actuelle ».');
   if(ch.validated_by_martin!==true)return no('Passer à « Actuelle » demande votre validation : cochez « Je valide ».');
   if(ch.kind==='decision'&&!ch.to_reliability)rel='confirmed'; // Martin l'a décidée
  }
  if(status==='replaced'){
   const by=ch.replaced_by_id;
   if(!by)return no('Pour marquer une information « Remplacée », indiquez celle qui la remplace.');
   if(by===ch.itemId)return no('Une information ne peut pas se remplacer elle-même.');
   if(!ch.replacement?.exists)return no('L’information qui remplace n’existe pas dans ce projet.');
   if(ch.replacement.status&&['replaced','abandoned','rejected'].includes(ch.replacement.status))return no('L’information qui remplace est elle-même remplacée, abandonnée ou rejetée.');
   replacedBy=by;
  }else{
   if(status==='abandoned'&&ch.replaced_by_id)return no('Une information « Abandonnée » n’a pas de remplaçante : choisissez « Remplacée » si une autre la remplace.');
   replacedBy=null;
  }
  if(status==='hypothesis'||(status==='proposed'&&ch.author==='ai'))rel=ch.to_reliability&&ch.to_reliability!=='hypothesis'?rel:'hypothesis';
  if(status==='hypothesis'&&rel!=='hypothesis')return no('Une hypothèse reste « Hypothèse » tant qu’elle n’est pas vérifiée : passez-la d’abord à « Actuelle ».');
 }else if(ch.replaced_by_id&&ch.replaced_by_id!==cur.replaced_by_id)return no('Une remplaçante ne s’indique qu’en passant l’état à « Remplacée ».');
 const relChanged=rel!==cur.reliability;
 if(ch.to_reliability&&!(STORED_RELIABILITY as readonly string[]).includes(ch.to_reliability))return no('Niveau de fiabilité inconnu (« Obsolète » se déduit de l’état).');
 if(relChanged||ch.to_reliability){
  if(['replaced','abandoned','rejected'].includes(status)&&!statusChanged)return no('Cette information est obsolète ou rejetée : sa fiabilité ne peut plus être modifiée.');
  if(ch.author==='ai'&&rel!=='hypothesis')return no('Le contenu écrit par une IA reste « Hypothèse » jusqu’à votre relecture.');
  if(rel==='verified'){
   const hasSource=source.length>=3,fit=ch.fit_confirmed===true,test=ch.test_passed===true&&(ch.kind==='feature');
   if(!hasSource||!(fit||test))return no(VERIFY_MESSAGE);
   if(status!=='current')return no('Seule une information « Actuelle » peut être « Vérifiée ».');
   proof=test&&!fit?'test':'fit';fitAt=at;
  }else if(rel==='confirmed'){
   if(ch.validated_by_martin!==true)return no('« Confirmé par vous » demande votre validation : cochez « Je confirme ».');
   if(status!=='current'&&status!=='proposed')return no('Seule une information actuelle peut être « Confirmée par vous ».');
   if(cur.reliability==='verified'||cur.reliability==='confirmed'){/* simple changement de niveau */}
   proof='';fitAt=null;
  }else{proof='';fitAt=null;}
 }
 if(!statusChanged&&!relChanged&&source===cur.source_ref)return no('Rien à changer : l’information a déjà cet état et ce niveau.');
 return {ok:true,next:{status,reliability:rel,source_ref:source,proof_kind:proof,fit_confirmed_at:fitAt,replaced_by_id:replacedBy,author_kind:ch.author},changed:{status:statusChanged,reliability:relChanged}};
}
/** État de départ d'une information créée par l'application : Martin → actuelle/confirmée ; une IA → proposée/hypothèse (jamais une décision). */
export function initialState(kind:Kind,author:Author,source=''):Omit<ItemState,'derived'>{
 return author==='ai'
  ?{status:'proposed',reliability:'hypothesis',source_ref:source,proof_kind:'',fit_confirmed_at:null,replaced_by_id:null,author_kind:'ai'}
  :{status:kind==='decision'?'proposed':'current',reliability:kind==='decision'?'hypothesis':'confirmed',source_ref:source,proof_kind:'',fit_confirmed_at:null,replaced_by_id:null,author_kind:'martin'};
}
export const visibleByDefault=(status:Life)=>status==='current';

/* ───────── Modèle de projet : noyau, modules, gabarits ───────── */
export const CORE_PARTS=['Nom','Objectif','État','Décisions','Mémoire','Tâches','Sources','Historique'] as const;
export const MODULES={
 code_deploy:{label:'Code et déploiement',help:'Dépôt, branches, contrôles et mise en ligne du projet.',skeleton:false},
 features:{label:'Suivi des fonctionnalités',help:'La liste de ce que le projet doit faire, avec l’état et la fiabilité de chaque fonction.',skeleton:false},
 learning_path:{label:'Parcours pédagogique',help:'Emplacement réservé : aucune fonction pour l’instant.',skeleton:true}
} as const;
export type ModuleKey=keyof typeof MODULES;
export const MODULE_KEYS=Object.keys(MODULES) as ModuleKey[];
/** Un gabarit n'est qu'un point de départ : il active des modules d'office, que l'on peut ensuite changer. */
export const PROJECT_TEMPLATES:Record<string,{label:string;modules:ModuleKey[]}>={
 livre_recettes:{label:'Livre de recettes',modules:['code_deploy','features']},
 sport:{label:'Sport / Mes séances',modules:['code_deploy','features']},
 atelier:{label:'Atelier lui-même',modules:['code_deploy','features']},
 vide:{label:'Projet libre',modules:[]}
};
export const templateOf=(setup:string|null|undefined,spaceKey:string|null|undefined)=>setup&&PROJECT_TEMPLATES[setup]?setup:spaceKey&&PROJECT_TEMPLATES[spaceKey]?spaceKey:'vide';
/** Modules réellement actifs : les choix enregistrés l'emportent, sinon ceux du gabarit. */
export function effectiveModules(template:string,saved:{module_key:string;enabled:number|boolean}[]):Record<ModuleKey,boolean>{
 const base=new Set(PROJECT_TEMPLATES[template]?.modules||[]);
 const out={} as Record<ModuleKey,boolean>;
 for(const k of MODULE_KEYS){const s=saved.find(x=>x.module_key===k);out[k]=s?Boolean(s.enabled):base.has(k);}
 return out;
}
/* ───────── Fonctionnalités ───────── */
export const FEATURE_STATES=['to_design','in_progress','done','phone_verified','blocked'] as const;
export type FeatureState=typeof FEATURE_STATES[number];
export const FEATURE_STATE_LABEL:Record<FeatureState,string>={to_design:'À concevoir',in_progress:'En cours',done:'Fait',phone_verified:'Vérifié sur téléphone',blocked:'Bloqué'};
export const FEATURE_SOURCES={conversation:'Conversation',request:'Demande',repo_file:'Fichier du dépôt',other:'Autre'} as const;
export const featureCode=(n:number)=>'F-'+String(n).padStart(4,'0');
