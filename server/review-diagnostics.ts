/* Diagnostic des revues : classification pure, sans secret ni contenu privé. */
export const STAGES=['config','github_pr','github_files','github_checks','ai_call','save'] as const;
export type Stage=typeof STAGES[number];
export type Category='auth'|'permission'|'not_found'|'format'|'rate_limit'|'provider_down'|'network'|'timeout'|'storage'|'config'|'oversize'|'unknown';
export interface Diagnostic{
 stage:Stage;last_ok_stage:Stage|null;category:Category;code:string;provider:string|null;
 http_status:number|null;ai_started:boolean;ai_result:'none'|'unknown'|'received';retry_allowed:boolean;
 message:string;attempts:number;
}
const stageLabel:Record<Stage,string>={config:'lecture de la configuration',github_pr:'lecture de la PR sur GitHub',github_files:'lecture des fichiers modifiés',github_checks:'lecture des tests GitHub Actions',ai_call:'appel à l’IA',save:'enregistrement du rapport'};
export const stageName=(s:Stage)=>stageLabel[s];
export function categorize(error:unknown):{category:Category;code:string;http_status:number|null}{
 const e=error as {status?:number;code?:string;message?:string}|null;
 if(e&&typeof e.status==='number'&&typeof e.code==='string'){
  const {status,code}=e;
  if(code==='timeout')return {category:'timeout',code,http_status:null};
  if(code==='network')return {category:'network',code,http_status:null};
  if(code==='response_too_large')return {category:'oversize',code,http_status:status};
  if(status===401)return {category:'auth',code:'http_401',http_status:401};
  if(status===403)return {category:'permission',code:'http_403',http_status:403};
  if(status===404)return {category:'not_found',code:'http_404',http_status:404};
  if(status===415||status===422||status===400)return {category:'format',code:'http_'+status,http_status:status};
  if(status===429)return {category:'rate_limit',code:'http_429',http_status:429};
  if(status>=500)return {category:'provider_down',code:'http_'+status,http_status:status};
  return {category:'unknown',code:'http_'+status,http_status:status};
 }
 if(e instanceof SyntaxError)return {category:'format',code:'bad_json',http_status:null};
 if(e?.message==='Réponse trop volumineuse.')return {category:'oversize',code:'ai_output_too_large',http_status:null};
 return {category:'unknown',code:'internal',http_status:null};
}
const advice:Record<Category,string>={
 auth:'Le jeton est refusé ou expiré : le renouveler dans Réglages → Connexions.',
 permission:'Droit manquant. Pour GitHub, vérifier la lecture des Pull requests, du contenu et des Checks sur ce dépôt.',
 not_found:'Ressource introuvable : dépôt, PR ou modèle supprimé ou non autorisé.',
 format:'Réponse ou requête incompatible. Le diagnostic est conservé ; ne pas relancer en boucle.',
 rate_limit:'Limite du fournisseur atteinte : attendre la fin de la fenêtre avant toute reprise.',
 provider_down:'Le service distant est en panne passagère.',
 network:'Le Worker n’a pas pu joindre le service distant.',
 timeout:'Le service distant n’a pas répondu dans le délai.',
 storage:'Erreur de stockage D1.',config:'Configuration ou consentement manquant.',
 oversize:'Réponse trop volumineuse : réduire la PR ou changer de modèle.',
 unknown:'Cause non identifiée ; voir les journaux Cloudflare (Observability) à l’heure indiquée.'
};
/** Reprise autorisée seulement si aucun résultat IA incertain n'existe. */
export function buildDiagnostic(input:{stage:Stage;lastOk:Stage|null;error:unknown;provider?:string|null;aiStarted?:boolean;attempts?:number}):Diagnostic{
 const {category,code,http_status}=categorize(input.error);
 const aiStarted=Boolean(input.aiStarted);
 // Une réponse HTTP d'erreur prouve qu'aucune génération n'a été produite ;
 // un délai ou une coupure réseau après le départ laisse le résultat inconnu.
 const uncertain=aiStarted&&(category==='timeout'||category==='network'||category==='unknown'||category==='oversize');
 const ai_result:Diagnostic['ai_result']=!aiStarted?'none':uncertain?'unknown':'none';
 const retry_allowed=!uncertain&&category!=='rate_limit'&&category!=='auth'&&category!=='permission'&&category!=='format';
 const attempts=input.attempts??1;
 return {stage:input.stage,last_ok_stage:input.lastOk,category,code,provider:input.provider??null,http_status,ai_started:aiStarted,ai_result,
  retry_allowed:retry_allowed&&attempts<3,attempts,
  message:'Échec à l’étape « '+stageLabel[input.stage]+' »'+(http_status?' (HTTP '+http_status+')':'')+'. '+advice[category]+(uncertain?' Un appel IA avait commencé : son résultat est inconnu, aucune relance automatique.':aiStarted?' Aucune génération n’a été reçue.':' Aucun appel IA n’a été effectué.')};
}
