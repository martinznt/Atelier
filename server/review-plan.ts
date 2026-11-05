/* Plan de revue : choix des vérifications selon le mode, le risque et les tests GitHub.
   Fonction pure : aucun appel réseau, aucune génération IA, aucun classement de modèles inventé. */
import type {ReviewFile,ReviewCheck} from './review-core.ts';
export type ReviewMode='economique'|'equilibre'|'approfondi';
export type ReviewRole='correctness'|'security'|'tests';
export const REVIEW_MODES:ReviewMode[]=['economique','equilibre','approfondi'];
export const modeLabel:Record<ReviewMode,string>={economique:'Économique',equilibre:'Équilibré',approfondi:'Approfondi'};
export interface PlanInput{
 mode:ReviewMode;risk:'simple'|'functional'|'critical';files:ReviewFile[];checks:ReviewCheck[];checksKnown:boolean;
 hasSecondary:boolean;primaryLimited?:boolean;secondaryLimited?:boolean;
}
export interface PlannedReviewer{role:ReviewRole;use:'primary'|'secondary';reason:string}
export interface ReviewPlan{mode:ReviewMode;assigned:PlannedReviewer[];skipped:{role:ReviewRole|'all';reason:string}[];summary:string}
const testFile=/(^|\/)(tests?|__tests__|e2e|spec)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/i;
const sourceFile=/\.(ts|tsx|js|jsx|mjs|py|sql)$/i;
/** Tests GitHub tous terminés et réussis : seul cas où la voie déterministe suffit. */
export function checksAllGreen(checks:ReviewCheck[]){
 return checks.length>0&&checks.every(c=>c.status==='completed'&&['success','neutral','skipped'].includes(String(c.conclusion)));
}
export function planReview(input:PlanInput):ReviewPlan{
 const assigned:PlannedReviewer[]=[],skipped:ReviewPlan['skipped']=[];
 const {mode,risk}=input;
 const secondaryOk=input.hasSecondary&&!input.secondaryLimited;
 const pickSecond=():'primary'|'secondary'=>secondaryOk?'secondary':'primary';
 if(mode==='economique'){
  if(risk==='simple'&&input.checksKnown&&checksAllGreen(input.checks)){
   skipped.push({role:'all',reason:'Changement simple et tous les tests GitHub ont réussi : aucune IA sollicitée pour économiser votre quota.'});
  }else{
   assigned.push({role:'correctness',use:'primary',reason:input.checksKnown&&!checksAllGreen(input.checks)?'Tests GitHub en échec ou incomplets : une seule IA explique et cherche les causes.':!input.checksKnown?'Tests GitHub non lus : une seule IA relit le diff.':'Changement non trivial : une seule IA relit le diff.'});
  }
  if(input.hasSecondary)skipped.push({role:'security',reason:'Mode économique : la deuxième IA n’est pas sollicitée.'});
 }else if(mode==='equilibre'){
  assigned.push({role:'correctness',use:'primary',reason:'Première IA choisie par vous : recherche des bugs de logique et des tests manquants.'});
  if(input.hasSecondary&&risk!=='simple'&&!input.secondaryLimited)assigned.push({role:'security',use:'secondary',reason:'Changement '+(risk==='critical'?'sensible':'fonctionnel')+' : relecture indépendante par une deuxième IA.'});
  else if(input.hasSecondary&&risk==='simple')skipped.push({role:'security',reason:'Changement simple : relecture indépendante inutile.'});
  else if(input.hasSecondary&&input.secondaryLimited)skipped.push({role:'security',reason:'La deuxième IA a signalé une limite : elle n’est pas sollicitée et aucune autre n’est substituée sans votre accord.'});
 }else{
  assigned.push({role:'correctness',use:'primary',reason:'Vérification de logique par la première IA choisie par vous.'});
  if(risk!=='simple')assigned.push({role:'security',use:pickSecond(),reason:'Changement '+(risk==='critical'?'sensible':'fonctionnel')+' : vérification spécialisée sécurité/données'+(secondaryOk?' par une IA indépendante.':' (même IA, angle différent : aucune IA indépendante disponible).')});
  else skipped.push({role:'security',reason:'Changement simple : pas de risque sécurité à couvrir.'});
  const touchesSource=input.files.some(f=>sourceFile.test(f.filename||'')&&!testFile.test(f.filename||''));
  const touchesTests=input.files.some(f=>testFile.test(f.filename||''));
  if(touchesSource&&!touchesTests)assigned.push({role:'tests',use:pickSecond(),reason:'Du code est modifié sans test dans le diff : vérification spécialisée de la couverture de tests.'});
  else skipped.push({role:'tests',reason:touchesSource?'Le diff contient déjà des tests : pas de vérification spécialisée supplémentaire.':'Aucun code source modifié.'});
 }
 // Une IA limitée n'est jamais appelée ; la principale limitée est signalée plutôt que remplacée.
 const limited=assigned.filter(a=>a.use==='primary'&&input.primaryLimited);
 for(const a of limited){assigned.splice(assigned.indexOf(a),1);skipped.push({role:a.role,reason:'La première IA a signalé une limite : appel suspendu, aucun basculement vers une autre IA ou un modèle payant sans votre accord.'});}
 const summary='Mode '+modeLabel[mode]+' : '+(assigned.length?assigned.length+' vérification(s) IA ('+assigned.map(a=>a.role).join(', ')+').':'aucune IA sollicitée.');
 return {mode,assigned,skipped,summary};
}
