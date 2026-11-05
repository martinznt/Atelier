/* Relais automatique entre les IA. Modules purs : l'accès aux connexions, au réseau et à D1 est injecté.
   Garanties :
   - seules les connexions testées, autorisées (api_consent) et avec l'accès « discussion » sont candidates ;
   - une connexion, un modèle ou un fournisseur qui vient de signaler une limite n'est pas rappelé pendant sa pause ;
   - aucun relais après le début d'un flux : le résultat partiel n'est jamais présenté comme complet ;
   - un plafond d'appels réels par tâche protège contre les boucles. */
import {availabilityOf,classifyFailure,AI_PROVIDERS,type Availability,type Classification,type ConnectionLike,type FailureKind} from './ai-availability.ts';
import {pickReviewModel} from './review-team.mjs';

export interface RelayConnection extends ConnectionLike{id:string;label:string}
export interface Candidate{
 connection_id:string;label:string;provider:string;model:string;
 origin:'preferred'|'relay'|'same_connection';reason:string;probe:boolean;
}
export interface Exclusion{
 connection_id:string;label:string;provider:string;model:string|null;
 reason:string;kind:FailureKind|null;until:string|null;until_source:'provider'|'internal'|null;
}
const providerRank=(p:string)=>{const i=(AI_PROVIDERS as readonly string[]).indexOf(p);return i<0?99:i;};

export function selectCandidates(input:{
 connections:RelayConnection[];preferred:{connection_id:string;model:string}[];allowRelay:boolean;now:string;
 estimateTokens?:number;avoidProviders?:string[];/** appels IA des dernières 24 h par connexion : départage seulement */usage?:Record<string,number>;
}):{candidates:Candidate[];excluded:Exclusion[]}{
 const byId=new Map(input.connections.map(c=>[c.id,c]));
 const wanted:Omit<Candidate,'probe'>[]=[];
 const seen=new Set<string>();
 const add=(c:RelayConnection,model:string|undefined,origin:Candidate['origin'],reason:string)=>{
  if(!model)return;const key=c.id+'\n'+model;if(seen.has(key))return;seen.add(key);
  wanted.push({connection_id:c.id,label:c.label,provider:c.provider,model,origin,reason});
 };
 input.preferred.forEach((p,i)=>{const c=byId.get(p.connection_id);if(c)add(c,p.model,'preferred','Choix n°'+(i+1)+' de votre configuration.');});
 if(input.allowRelay){
  const preferredIds=new Set(input.preferred.map(p=>p.connection_id));
  const avoid=new Set(input.avoidProviders||[]);
  const others=input.connections.filter(c=>!preferredIds.has(c.id)).sort((a,b)=>
   Number(avoid.has(a.provider))-Number(avoid.has(b.provider))
   ||providerRank(a.provider)-providerRank(b.provider)
   ||(input.usage?.[a.id]||0)-(input.usage?.[b.id]||0)
   ||String(a.label).localeCompare(String(b.label)));
  for(const c of others)add(c,pickReviewModel({models:typeof c.models==='string'?safeList(c.models):c.models}),'relay','Relais automatique : connexion autorisée et disponible, modèle économique pour le texte.');
  for(const p of input.preferred){const c=byId.get(p.connection_id);if(c)add(c,pickReviewModel({models:typeof c.models==='string'?safeList(c.models):c.models}),'same_connection','Dernier recours : autre modèle de la même connexion.');}
 }
 const candidates:Candidate[]=[],excluded:Exclusion[]=[];
 for(const w of wanted){
  const conn=byId.get(w.connection_id)!;
  const a=availabilityOf(conn,{model:w.model,now:input.now,estimateTokens:input.estimateTokens});
  if(a.usable)candidates.push({...w,probe:a.probe});
  else excluded.push({connection_id:w.connection_id,label:w.label,provider:w.provider,model:w.model,reason:a.reason,kind:a.kind,until:a.until,until_source:a.until_source});
 }
 // Connexions non retenues du tout (hors liste préférée sans relais) : aucune entrée, rien n'est sollicité.
 return {candidates,excluded};
}
function safeList(v:string):string[]{try{const a=JSON.parse(v);return Array.isArray(a)?a.map(String):[];}catch{return [];}}

/** Erreur lancée par `attempt` : `accepted` = une réponse HTTP 200 (flux) a été reçue ; `partial` = texte déjà émis. */
export class AttemptError extends Error{
 readonly original:unknown;readonly accepted:boolean;readonly partial:string;
 constructor(original:unknown,accepted:boolean,partial=''){super('Tentative IA échouée');this.original=original;this.accepted=accepted;this.partial=partial;}
}
export interface AttemptLog{
 connection_id:string;label:string;provider:string;model:string;origin:Candidate['origin'];
 outcome:'completed'|'skipped'|'refused'|'interrupted';
 kind:FailureKind|null;kind_label:string|null;until:string|null;until_source:'provider'|'internal'|null;
 reason:string;started_at:string;ended_at:string;
}
export interface RelayResult<T>{
 status:'completed'|'interrupted'|'stopped'|'exhausted'|'no_candidate';
 value?:T;used?:Candidate;partial?:string;attempts:AttemptLog[];excluded:Exclusion[];
}

export async function runWithRelay<T>(o:{
 candidates:Candidate[];excluded?:Exclusion[];maxAttempts:number;now:()=>string;
 attempt:(c:Candidate)=>Promise<T>;
 /** Disponibilité relue juste avant l'appel (état à jour, autre tâche simultanée) ; null = pas d'objection. */
 recheck?:(c:Candidate)=>Promise<Availability|null>;
 onFailure?:(c:Candidate,cl:Classification,accepted:boolean)=>Promise<void>;
}):Promise<RelayResult<T>>{
 const attempts:AttemptLog[]=[],excluded=[...(o.excluded||[])];
 if(!o.candidates.length)return {status:'no_candidate',attempts,excluded};
 const cap=Math.max(1,Math.min(5,Math.floor(o.maxAttempts)||1));
 let calls=0;const connectionDown=new Map<string,FailureKind>();
 for(const c of o.candidates){
  const base={connection_id:c.connection_id,label:c.label,provider:c.provider,model:c.model,origin:c.origin};
  const skip=(reason:string,extra:Partial<AttemptLog>={})=>{const t=o.now();attempts.push({...base,outcome:'skipped',kind:null,kind_label:null,until:null,until_source:null,reason,started_at:t,ended_at:t,...extra});};
  if(calls>=cap){skip('Plafond de '+cap+' appel(s) IA par tâche atteint.');continue;}
  const down=connectionDown.get(c.connection_id);
  if(down){skip('Connexion déjà refusée pendant cette tâche ('+down+') : aucun autre modèle essayé.',{kind:down});continue;}
  const fresh=o.recheck?await o.recheck(c):null;
  if(fresh&&!fresh.usable){skip(fresh.reason,{kind:fresh.kind,until:fresh.until,until_source:fresh.until_source});continue;}
  const started=o.now();calls++;
  try{
   const value=await o.attempt(c);
   attempts.push({...base,outcome:'completed',kind:null,kind_label:null,until:null,until_source:null,reason:c.reason,started_at:started,ended_at:o.now()});
   return {status:'completed',value,used:c,attempts,excluded};
  }catch(error){
   const accepted=error instanceof AttemptError?error.accepted:true;
   const original=error instanceof AttemptError?error.original:error;
   const partial=error instanceof AttemptError?error.partial:'';
   const cl=classifyFailure(original,{now:o.now(),accepted,provider:c.provider});
   if(o.onFailure){try{await o.onFailure(c,cl,accepted);}catch{/* l'échec d'écriture ne doit pas masquer le résultat */}}
   const ended=o.now();
   const stop=!cl.relay_ok;
   attempts.push({...base,outcome:accepted?'interrupted':'refused',kind:cl.kind,kind_label:cl.label,
    until:cl.retry_at,until_source:cl.retry_source,reason:accepted?'Réponse interrompue après le début du flux : aucun relais automatique (risque de double consommation).':cl.label+(stop?'. Un autre fournisseur ne résoudrait pas ce refus : arrêt.':'. Relais vers une autre IA.'),started_at:started,ended_at:ended});
   if(accepted)return {status:'interrupted',used:c,partial,attempts,excluded};
   if(stop)return {status:'stopped',attempts,excluded};
   if(cl.scope==='connection')connectionDown.set(c.connection_id,cl.kind);
  }
 }
 return {status:'exhausted',attempts,excluded};
}
