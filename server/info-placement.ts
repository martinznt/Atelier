/* D5 — « quelle information vit où ». Table de référence (le texte lisible est docs/OU_VIT_QUOI.md).
   Règle d'or : un fait = une seule source de vérité. Toute copie est marquée « copie » avec sa date et son commit.
   Atelier lit Git (Memoire-Projets) en lecture seule : l'écriture dans Git est interdite jusqu'à une validation écrite de Martin. */
export type Home='git'|'atelier';
export interface Placement{key:string;label:string;home:Home;why:string;copy_in_atelier:boolean;find_kind:string|null}
export const PLACEMENT:Placement[]=[
 {key:'specs',label:'Cahiers des charges',home:'git',why:'rédigé, durable, relu sans Atelier',copy_in_atelier:true,find_kind:'gitdoc'},
 {key:'validated_decisions',label:'Décisions validées (registre)',home:'git',why:'durable, source de la méthode',copy_in_atelier:true,find_kind:'gitdoc'},
 {key:'prompts_text',label:'Prompts (texte transmis)',home:'git',why:'rédigé, versionné',copy_in_atelier:true,find_kind:'gitdoc'},
 {key:'export_summaries',label:'Synthèses d’exports',home:'git',why:'rédigé, durable',copy_in_atelier:true,find_kind:'gitdoc'},
 {key:'method',label:'Méthode de travail',home:'git',why:'rédigé, durable',copy_in_atelier:true,find_kind:'gitdoc'},
 {key:'sources',label:'Sources originales',home:'git',why:'preuve durable',copy_in_atelier:true,find_kind:'gitdoc'},
 {key:'tasks',label:'Tâches et états',home:'atelier',why:'vivant : change tous les jours',copy_in_atelier:false,find_kind:'task'},
 {key:'features',label:'Fonctionnalités et leur état',home:'atelier',why:'vivant',copy_in_atelier:false,find_kind:'feature'},
 {key:'decision_drafts',label:'Brouillons de décisions (proposées, hypothèses)',home:'atelier',why:'vivant : en attente de votre validation',copy_in_atelier:false,find_kind:'decision'},
 {key:'imported_conversations',label:'Conversations importées',home:'atelier',why:'volumineux, consultés par la recherche',copy_in_atelier:false,find_kind:'imported'},
 {key:'readings',label:'Relevés (quotas, suivi GitHub)',home:'atelier',why:'vivant, daté',copy_in_atelier:false,find_kind:null},
 {key:'links',label:'Liens entre objets',home:'atelier',why:'vivant',copy_in_atelier:false,find_kind:null},
 {key:'lifecycle',label:'États, fiabilité et historique des changements',home:'atelier',why:'vivant, propre à Atelier',copy_in_atelier:false,find_kind:null}
];
/** Une seule étiquette de copie pour tous les écrans : où, quel commit, quelle date. */
export function copyNote(i:{repo:string;commit:string|null;syncedAt:string|null;textCopied:boolean}):string{
 return 'Copie du dépôt '+i.repo+' · commit '+String(i.commit||'?').slice(0,7)+' · lue le '+String(i.syncedAt||'?').slice(0,10)+(i.textCopied?'':' · titre et chemin seulement (texte non copié)')+' · le statut écrit dans le document n’est pas interprété';
}
export const GIT_WRITE_ALLOWED=false;
