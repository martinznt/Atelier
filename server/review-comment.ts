import {jsonRequest} from './connectors/http.ts';
import {categorize} from './review-diagnostics.ts';
/* Publication du dossier de revue en commentaire de PR. Aucun appel à Claude Code ni à un autre agent. */
const ZWSP='​';
/** Neutralise les mentions @ : un commentaire ne doit notifier personne ni réveiller un bot. */
export const neutralizeMentions=(text:string)=>text.replace(/@(?=[A-Za-z0-9_-])/g,'@'+ZWSP);
export const commentMarker=(sha:string)=>'<!-- atelier-review:'+sha+' -->';
export function buildReviewComment(input:{sha:string;handoff:string}){
 const body=[
  commentMarker(input.sha),
  '### Rapport de revue Atelier (automatisé, lecture seule)',
  neutralizeMentions(input.handoff),
  '',
  '---',
  '_Publié par Atelier à la demande du propriétaire du dépôt. Aucune IA n’a modifié le code et aucun agent n’a été lancé automatiquement. Les anomalies restent à reproduire par un test._'
 ].join('\n');
 return body.slice(0,60000);
}
export function commentFailureMessage(error:unknown){
 const {category,http_status}=categorize(error);
 const where=http_status?' (HTTP '+http_status+')':'';
 if(category==='permission'||category==='auth')return 'Commentaire non publié'+where+' : le jeton GitHub n’a pas le droit d’écrire des commentaires sur les Pull requests. Le rapport est conservé dans Atelier.';
 if(category==='not_found')return 'Commentaire non publié'+where+' : PR introuvable ou accès refusé. Le rapport est conservé dans Atelier.';
 if(category==='rate_limit')return 'Commentaire non publié'+where+' : limite GitHub atteinte. Aucune nouvelle tentative automatique.';
 return 'Commentaire non publié'+where+'. Le rapport est conservé dans Atelier ; aucune nouvelle tentative automatique.';
}
export async function postReviewComment(token:string,repoFullName:string,pr:number,input:{sha:string;handoff:string}){
 const result=await jsonRequest('github',token,'/repos/'+repoFullName+'/issues/'+pr+'/comments',{method:'POST',body:JSON.stringify({body:buildReviewComment(input)}),signal:AbortSignal.timeout(20000)});
 const url=typeof result.data?.html_url==='string'&&result.data.html_url.startsWith('https://github.com/')?result.data.html_url:null;
 return {url};
}
