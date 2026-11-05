/* Niveau de réflexion automatique selon le besoin. Fonction pure.
   Seuls les modèles dont la documentation officielle prévoit `reasoning_effort` reçoivent ce réglage :
   Groq GPT-OSS 20B/120B (console.groq.com/docs/reasoning, low|medium|high). Ailleurs : valeur par défaut du fournisseur. */
import type {ReviewMode,ReviewRole} from './review-plan.ts';
export type Effort='low'|'medium'|'high';
const order:Effort[]=['low','medium','high'];
/** Les jetons de réflexion font partie des jetons de sortie : le budget grandit avec le niveau. */
export const outputBudget:Record<Effort,number>={low:2800,medium:4000,high:6000};
export const supportsReasoningEffort=(provider:string,model:string)=>provider==='groq'&&/^openai\/gpt-oss-(20b|120b)$/.test(model);
export interface EffortInput{mode:ReviewMode;role:ReviewRole;risk:'simple'|'functional'|'critical';provider:string;model:string}
export interface EffortChoice{effort:Effort|null;maxTokens:number;reason:string}
export function reviewEffort(input:EffortInput):EffortChoice{
 if(!supportsReasoningEffort(input.provider,input.model))
  return {effort:null,maxTokens:outputBudget.low,reason:'Réglage de réflexion non documenté pour ce modèle : valeur par défaut du fournisseur.'};
 const level=input.risk==='critical'?2:input.risk==='functional'?1:0;
 let index:number,why:string;
 if(input.mode==='economique'){index=0;why='Mode économique : réflexion minimale pour préserver le quota.';}
 else if(input.mode==='equilibre'){
  index=Math.min(level,input.role==='security'?2:1);
  why=index===0?'Changement simple : réflexion légère.':index===1?'Changement non trivial : réflexion moyenne.':'Changement sensible, angle sécurité : réflexion élevée.';
 }else{
  index=Math.min(level+1,2);
  why=index===2?'Mode approfondi sur un changement non trivial : réflexion élevée.':'Mode approfondi sur un changement simple : réflexion moyenne.';
 }
 const effort=order[index];
 return {effort,maxTokens:outputBudget[effort],reason:why};
}
