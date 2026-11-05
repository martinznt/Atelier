/* Disponibilité et quotas des connexions IA. Module pur : aucun réseau, aucune génération.
   Règle d'or : on ne fabrique jamais un quota restant ni une date de réinitialisation.
   Une date n'est « fournisseur » que si le fournisseur l'a renvoyée (Retry-After, en-têtes de réinitialisation).
   Sinon, une pause de prudence d'Atelier peut exister : elle est étiquetée « interne » et jamais présentée comme officielle. */
import {parseRetryAfter} from './collaboration.ts';

/** Ordre de préférence par défaut, identique à review-team.mjs (coût présumé, sans garantie de gratuité). */
export const AI_PROVIDERS=['mistral','gemini','groq','openai','anthropic'] as const;

export type FailureKind=
 'rate_limit_requests'|'rate_limit_tokens'|'rate_limit_unknown'|'quota_daily'|'quota_monthly'|'billing'|
 'model_unavailable'|'auth'|'permission'|'temporary'|'interrupted'|'request_rejected'|'unknown';

export const failureLabel:Record<FailureKind,string>={
 rate_limit_requests:'Limite de requêtes par minute atteinte',
 rate_limit_tokens:'Limite de jetons par minute atteinte',
 rate_limit_unknown:'Limite signalée (fenêtre non précisée par le fournisseur)',
 quota_daily:'Quota journalier atteint',
 quota_monthly:'Quota mensuel épuisé',
 billing:'Crédit ou facturation à vérifier chez le fournisseur',
 model_unavailable:'Modèle temporairement indisponible',
 auth:'Clé refusée par le fournisseur (authentification)',
 permission:'Permission refusée par le fournisseur',
 temporary:'Erreur technique temporaire du fournisseur',
 interrupted:'Résultat interrompu ou incomplet',
 request_rejected:'Demande refusée (contenu ou taille)',
 unknown:'Erreur non identifiée'
};

/** Pauses de prudence d'Atelier quand le fournisseur ne donne aucune date. Elles évitent de marteler un service, rien de plus. */
export const INTERNAL_HOLD_MS:Partial<Record<FailureKind,number>>={
 rate_limit_requests:90_000,rate_limit_tokens:90_000,rate_limit_unknown:300_000,
 quota_daily:3_600_000,quota_monthly:3_600_000,model_unavailable:300_000,temporary:60_000
};
/** Ces échecs exigent une action de l'utilisateur : aucune nouvelle tentative automatique avant « Tester l'accès ». */
export const NEEDS_USER=new Set<FailureKind>(['auth','permission','billing']);
/** Ces échecs concernent toute la connexion, pas un modèle seulement. */
const CONNECTION_WIDE=new Set<FailureKind>(['auth','permission','billing','quota_monthly','temporary']);

export interface Classification{
 kind:FailureKind;label:string;scope:'model'|'connection';
 retry_at:string|null;retry_source:'provider'|null;
 /** Le fournisseur a explicitement refusé avant tout flux : aucune génération n'a eu lieu. */
 certain_before_generation:boolean;
 /** Un autre fournisseur peut être sollicité sans risque de double consommation maîtrisable. */
 relay_ok:boolean;
 basis:'status'|'message'|'headers'|'none';detail:string;
}
export interface ClassifyContext{now:string;/** une réponse HTTP 200 (flux) a été reçue */accepted:boolean}

const rx={
 tokens:/(tokens?[^a-z0-9]{0,3}per[^a-z0-9]{0,3}min|\bTPM\b|TokensPerModelPerMinute)/i,
 requests:/(requests?[^a-z0-9]{0,3}per[^a-z0-9]{0,3}min|\bRPM\b|RequestsPerMinute)/i,
 day:/(per[^a-z0-9]{0,3}day|daily|\bRPD\b|\bTPD\b|PerDay)/i,
 month:/(monthly|per[^a-z0-9]{0,3}month|PerMonth)/i,
 credit:/(insufficient[_ ]quota|exceeded your current quota|billing|credit|balance|payment)/i,
 model:/model/i,
 modelGone:/(not found|does not exist|not supported|deprecated|decommission|unavailable|no longer)/i
};
const headerOf=(h:Record<string,string>,names:string[])=>{for(const n of names){const v=h[n];if(typeof v==='string'&&v)return v;}return null;};
const REMAINING_REQ=['x-ratelimit-remaining-requests','anthropic-ratelimit-requests-remaining','ratelimit-remaining'];
const REMAINING_TOK=['x-ratelimit-remaining-tokens','anthropic-ratelimit-tokens-remaining'];
const RESET_REQ=['x-ratelimit-reset-requests','anthropic-ratelimit-requests-reset'];
const RESET_TOK=['x-ratelimit-reset-tokens','anthropic-ratelimit-tokens-reset'];

/** Durée « 1m30.5s », « 250ms », « 2s » ou date RFC 3339, telle que renvoyée par le fournisseur. null si illisible. */
export function parseResetHeader(value:string|null,now:string):string|null{
 if(!value||value.length>64)return null;
 const text=value.trim(),start=Date.parse(now);
 if(/^\d{4}-\d{2}-\d{2}T/.test(text)){const t=Date.parse(text);return Number.isFinite(t)?new Date(t).toISOString():null;}
 if(/^\d+(\.\d+)?$/.test(text))return new Date(start+Number(text)*1000).toISOString();
 const m=/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/.exec(text);
 if(!m||(!m[1]&&!m[2]&&!m[3]&&!m[4]))return null;
 const ms=Number(m[1]||0)*3_600_000+Number(m[2]||0)*60_000+Number(m[3]||0)*1000+Number(m[4]||0);
 return Number.isFinite(ms)?new Date(start+ms).toISOString():null;
}

const result=(kind:FailureKind,ctx:ClassifyContext,x:{retryAt?:string|null;certain:boolean;relay:boolean;basis:Classification['basis'];detail:string}):Classification=>({
 kind,label:failureLabel[kind],scope:CONNECTION_WIDE.has(kind)?'connection':'model',
 retry_at:x.retryAt||null,retry_source:x.retryAt?'provider':null,
 certain_before_generation:x.certain,relay_ok:x.relay&&!ctx.accepted,basis:x.basis,detail:x.detail
});

/** Classe un échec à partir des seuls faits renvoyés : statut HTTP, en-têtes, extrait du message. */
export function classifyFailure(error:unknown,ctx:ClassifyContext):Classification{
 const e=error as {status?:number;code?:string;retryAfter?:string|null;headers?:Record<string,string>;detail?:string;name?:string}|null;
 const detail=typeof e?.detail==='string'?e.detail:'',headers=(e&&typeof e.headers==='object'&&e.headers)?e.headers:{};
 if(ctx.accepted&&e&&typeof e.code==='string'&&e.code!=='http')
  return result('interrupted',ctx,{certain:false,relay:false,basis:'none',detail});
 if(!e||typeof e.status!=='number'||typeof e.code!=='string'){
  const aborted=e?.name==='AbortError'||e?.name==='TimeoutError';
  return result(aborted?'interrupted':'unknown',ctx,{certain:false,relay:false,basis:'none',detail});
 }
 const {status,code}=e;
 if(code==='timeout')return result('interrupted',ctx,{certain:false,relay:false,basis:'none',detail});
 if(code==='network')return result('temporary',ctx,{certain:false,relay:true,basis:'none',detail});
 if(['stream_error','interrupted_stream','output_limit','stream_too_large','empty','response_too_large'].includes(code))
  return result('interrupted',ctx,{certain:false,relay:false,basis:'none',detail});
 if(code==='redirect')return result('unknown',ctx,{certain:true,relay:false,basis:'status',detail});
 if(code!=='http')return result('unknown',ctx,{certain:false,relay:false,basis:'none',detail});
 // À partir d'ici : refus HTTP explicite avant tout flux.
 const refused=(kind:FailureKind,basis:Classification['basis'],retryAt?:string|null,relay=true)=>result(kind,ctx,{retryAt,certain:true,relay,basis,detail});
 if(status===401)return refused('auth','status');
 if(status===402)return refused('billing','status');
 if(status===403)return rx.credit.test(detail)?refused('billing','message'):refused('permission','status');
 if(status===404)return refused('model_unavailable','status');
 if(status===400){
  if(rx.model.test(detail)&&rx.modelGone.test(detail))return refused('model_unavailable','message');
  return refused('request_rejected','status',null,false);
 }
 if(status===413||status===422)return refused('request_rejected','status',null,false);
 if(status===429){
  const provided=parseRetryAfter(e.retryAfter,ctx.now)?.retry_at||null;
  const text=detail;
  if(rx.day.test(text))return refused('quota_daily','message',provided||parseResetHeader(headerOf(headers,RESET_REQ),ctx.now));
  if(rx.month.test(text))return refused('quota_monthly','message',provided);
  if(rx.tokens.test(text))return refused('rate_limit_tokens','message',provided||parseResetHeader(headerOf(headers,RESET_TOK),ctx.now));
  if(rx.requests.test(text))return refused('rate_limit_requests','message',provided||parseResetHeader(headerOf(headers,RESET_REQ),ctx.now));
  if(rx.credit.test(text))return refused('billing','message',provided);
  if(headerOf(headers,REMAINING_REQ)==='0')return refused('rate_limit_requests','headers',provided||parseResetHeader(headerOf(headers,RESET_REQ),ctx.now));
  if(headerOf(headers,REMAINING_TOK)==='0')return refused('rate_limit_tokens','headers',provided||parseResetHeader(headerOf(headers,RESET_TOK),ctx.now));
  return refused('rate_limit_unknown','status',provided);
 }
 if(status===408||status>=500)return refused('temporary','status',parseRetryAfter(e.retryAfter,ctx.now)?.retry_at||null);
 return refused('unknown','status',null,false);
}

/* ---------- État persistant par connexion (colonne connections.quota) ---------- */
export interface StoredFailure{
 kind:FailureKind;label:string;scope:'model'|'connection';model:string|null;observed_at:string;
 retry_at:string|null;retry_source:'provider'|null;hold_until:string|null;hold_source:'provider'|'internal'|null;
 basis:Classification['basis'];detail:string;
}
export function storedFailure(c:Classification,model:string|null,now:string):StoredFailure{
 let holdUntil:string|null=null,source:'provider'|'internal'|null=null;
 if(c.retry_at){holdUntil=c.retry_at;source='provider';}
 else if(!NEEDS_USER.has(c.kind)&&INTERNAL_HOLD_MS[c.kind]){holdUntil=new Date(Date.parse(now)+INTERNAL_HOLD_MS[c.kind]!).toISOString();source='internal';}
 return {kind:c.kind,label:c.label,scope:c.scope,model:c.scope==='model'?model:null,observed_at:now,retry_at:c.retry_at,retry_source:c.retry_source,
  hold_until:holdUntil,hold_source:source,basis:c.basis,detail:c.detail.slice(0,240)};
}
const RATE_KINDS=new Set<FailureKind>(['rate_limit_requests','rate_limit_tokens','rate_limit_unknown','quota_daily']);
type Quota=Record<string,any>;
const asQuota=(value:unknown):Quota=>{try{const v=typeof value==='string'?JSON.parse(value):value;return v&&typeof v==='object'&&!Array.isArray(v)?{...v}:{};}catch{return {};}};

/** Statut « limité » hérité (planning.ts, review-team.mjs) recalculé d'après les pauses encore actives. */
function applyLegacyFlags(q:Quota,holds:Record<string,StoredFailure>,now:string){
 delete q.status;delete q.retry_at;delete q.message;
 const t=Date.parse(now);
 const active=Object.values(holds).filter(f=>f&&RATE_KINDS.has(f.kind)&&(!f.hold_until||Date.parse(f.hold_until)>t));
 if(!active.length)return;
 const latest=[...active].sort((x,y)=>Date.parse(y.observed_at)-Date.parse(x.observed_at))[0];
 q.status='rate_limited';q.observed_at=latest.observed_at;q.updated_at=q.updated_at||latest.observed_at;
 q.message=latest.label+'. Le quota restant n’est pas fourni par cette observation.';
 const provided=active.filter(f=>f.retry_at).map(f=>Date.parse(f.retry_at!)).filter(Number.isFinite);
 if(provided.length===active.length)q.retry_at=new Date(Math.max(...provided)).toISOString();
}
/** Fusionne une observation dans le JSON de quota d'une connexion sans perdre l'état des autres modèles. */
export function mergeObservation(existing:unknown,obs:{type:'failure';failure:StoredFailure}|{type:'success';model:string;headers?:Quota|null},now:string):Quota{
 const q=asQuota(existing);
 const holds:Record<string,StoredFailure>=q.holds&&typeof q.holds==='object'?{...q.holds}:{};
 const cutoff=Date.parse(now)-86_400_000;
 for(const [m,f] of Object.entries(holds))if(!f||Date.parse((f as StoredFailure).observed_at)<cutoff)delete holds[m];
 if(obs.type==='success'){
  const headers=obs.headers&&typeof obs.headers==='object'?obs.headers:null;
  const next:Quota=headers?{...headers}:{kind:q.kind,scope:q.scope,values:q.values,updated_at:q.updated_at};
  delete holds[obs.model];
  next.holds=holds;next.account_failure=null; // un succès prouve que la clé fonctionne
  applyLegacyFlags(next,holds,now);
  return next;
 }
 const f=obs.failure;
 if(f.scope==='connection')q.account_failure=f;
 else holds[f.model||'']=f;
 q.holds=holds;
 applyLegacyFlags(q,holds,now);
 return q;
}

export interface ConnectionLike{
 provider:string;status:string;api_consent:number|boolean;scopes:string[]|string;models:string[]|string;
 expires_at?:string|null;quota?:unknown;
}
export interface Availability{
 usable:boolean;state:'ok'|'held'|'blocked'|'ineligible';kind:FailureKind|null;label:string;
 until:string|null;until_source:'provider'|'internal'|null;probe:boolean;
 quota_known:boolean;known:{remaining_requests?:number;remaining_tokens?:number;limit_requests?:number;limit_tokens?:number};
 reason:string;
}
const list=(v:unknown):string[]=>{try{const a=typeof v==='string'?JSON.parse(v):v;return Array.isArray(a)?a.map(String):[];}catch{return [];}};
const num=(v:unknown)=>{const n=typeof v==='string'?Number(v):typeof v==='number'?v:NaN;return Number.isFinite(n)?n:undefined;};
const FRESH_MS=60_000;

export function availabilityOf(conn:ConnectionLike,opts:{model?:string;now:string;estimateTokens?:number}):Availability{
 const now=Date.parse(opts.now),q=asQuota(conn.quota);
 const values=(q.values&&typeof q.values==='object'?q.values:{}) as Record<string,string>;
 const known:Availability['known']={
  remaining_requests:num(headerOf(values,REMAINING_REQ)),remaining_tokens:num(headerOf(values,REMAINING_TOK)),
  limit_requests:num(headerOf(values,['x-ratelimit-limit-requests','anthropic-ratelimit-requests-limit'])),
  limit_tokens:num(headerOf(values,['x-ratelimit-limit-tokens','anthropic-ratelimit-tokens-limit']))
 };
 for(const k of Object.keys(known) as (keyof typeof known)[])if(known[k]===undefined)delete known[k];
 const base={quota_known:q.kind==='official',known,probe:false,until:null as string|null,until_source:null as Availability['until_source']};
 const out=(state:Availability['state'],kind:FailureKind|null,reason:string,extra:Partial<Availability>={}):Availability=>
  ({...base,usable:state==='ok',state,kind,label:kind?failureLabel[kind]:state==='ok'?'Disponible':'Indisponible',reason,...extra});
 if(!(AI_PROVIDERS as readonly string[]).includes(conn.provider))return out('ineligible',null,'Ce service n’est pas une IA utilisable par Atelier.');
 if(conn.status!=='connected')return out('ineligible',null,'Connexion non testée ou en erreur : testez-la dans Réglages.');
 if(!conn.api_consent)return out('ineligible',null,'Utilisation de cette API non autorisée.');
 if(!list(conn.scopes).includes('chat'))return out('ineligible',null,'Accès « discussion » non autorisé pour cette connexion.');
 if(conn.expires_at&&(!Number.isFinite(Date.parse(conn.expires_at))||Date.parse(conn.expires_at)<=now))return out('ineligible',null,'Accès expiré : remplacez-le dans Réglages.');
 const models=list(conn.models);
 if(opts.model&&!models.includes(opts.model))return out('ineligible',null,'Modèle absent de la liste confirmée par le fournisseur.');
 const judge=(f:StoredFailure):Availability|null=>{
  if(NEEDS_USER.has(f.kind))return out('blocked',f.kind,f.label+' : action requise de votre part, puis « Tester l’accès ».');
  if(f.hold_until&&Date.parse(f.hold_until)>now)
   return out('held',f.kind,f.label+(f.hold_source==='provider'?' — nouvel essai possible à la date indiquée par le fournisseur.':' — pause de prudence d’Atelier (aucune date fournie par le fournisseur).'),{until:f.hold_until,until_source:f.hold_source});
  return null; // pause écoulée : un seul essai (« sonde ») est permis
 };
 let probe=false;
 if(q.account_failure){const r=judge(q.account_failure as StoredFailure);if(r)return r;probe=true;}
 const modelHold=opts.model&&q.holds?.[opts.model] as StoredFailure|undefined;
 if(modelHold){const r=judge(modelHold);if(r)return r;probe=true;}
 // Ancienne observation (avant ce module) : statut « limité » sans modèle ni fenêtre.
 if(!q.account_failure&&!q.holds?.[opts.model||'']&&q.status==='rate_limited'&&!q.holds){
  const provided=q.retry_at&&Number.isFinite(Date.parse(q.retry_at))?Date.parse(q.retry_at):null;
  const observed=Date.parse(q.observed_at||q.updated_at||'');
  const until=provided??(Number.isFinite(observed)?observed+INTERNAL_HOLD_MS.rate_limit_unknown!:null);
  if(until!==null&&until>now)return out('held','rate_limit_unknown',failureLabel.rate_limit_unknown,{until:new Date(until).toISOString(),until_source:provided!==null?'provider':'internal'});
  probe=true;
 }
 // Compteurs renvoyés par le fournisseur lui-même, seulement s'ils sont frais.
 const updated=Date.parse(q.updated_at||'');
 if(q.kind==='official'&&Number.isFinite(updated)&&now-updated<=FRESH_MS){
  if(known.remaining_requests===0)return out('held','rate_limit_requests','Le fournisseur indique 0 requête restante dans sa dernière réponse.',{until:new Date(updated+FRESH_MS).toISOString(),until_source:'internal'});
  if(opts.estimateTokens!==undefined&&known.remaining_tokens!==undefined&&known.remaining_tokens<opts.estimateTokens)
   return out('held','rate_limit_tokens','Jetons restants indiqués par le fournisseur insuffisants pour cette demande.',{until:new Date(updated+FRESH_MS).toISOString(),until_source:'internal'});
 }
 return out('ok',null,probe?'Pause écoulée : un essai sera tenté.':q.kind==='official'?'Disponible (limites connues du fournisseur).':'Disponible (quota inconnu : aucune information fiable du fournisseur).',{probe});
}

/** Estimation prudente des jetons d'une demande : environ 3 caractères par jeton + budget de sortie. Jamais présentée comme une mesure. */
export const estimateTokens=(promptChars:number,maxOutput:number)=>Math.ceil(promptChars/3)+maxOutput;
