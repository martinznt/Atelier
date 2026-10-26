export type TeamMode='individual'|'compare'|'review'|'collaborate';
export type TeamSelection={selected:string[];models:Record<string,string>;roles:Record<string,string>;mode:TeamMode;rounds:number;consent:boolean};
export type TeamConnection={id:string;label:string;provider:string;status:string;models:string[];scopes?:string[];api_consent?:number|boolean;expires_at?:string|null;quota?:unknown;tested_at?:string|null;account_label?:string|null;models_checked_at?:string|null;models_revision?:number};
export const providerName=(provider:string)=>(({openai:'OpenAI API',anthropic:'Claude API',gemini:'Gemini API',mistral:'Mistral API'} as Record<string,string>)[provider]||provider);
export const teamMethods=[
 {id:'individual',label:'Une réponse',description:'Un assistant répond à votre demande. Un seul appel est prévu.',roles:['Répondre clairement à la demande et signaler les informations manquantes.']},
 {id:'compare',label:'Comparer des idées',description:'Chaque assistant reçoit les mêmes sources et propose sa réponse sans lire celles des autres. Comparez ensuite leurs désaccords.',roles:['Proposer une première solution, avec ses avantages, limites et hypothèses.','Explorer une autre approche et expliquer ses compromis.','Présenter une troisième proposition indépendante et ses limites.']},
 {id:'review',label:'Réaliser puis vérifier',description:'Le premier propose une solution. Les suivants lisent les réponses précédentes et les vérifient. Une relecture ne remplace pas des tests exécutés.',roles:['Réaliser une proposition concrète et préciser les vérifications restant à exécuter.','Relire la proposition : erreurs, risques, omissions et corrections. Distinguer tests exécutés et tests proposés.','Vérifier les corrections et conserver les désaccords non résolus.']},
 {id:'collaborate',label:'Construire ensemble',description:'Les assistants interviennent dans l’ordre choisi et voient les réponses précédentes. Vous limitez le nombre de tours.',roles:['Proposer une structure et une première réalisation à partir de l’objectif.','Améliorer la proposition, relever les contraintes et les décisions à prendre.','Vérifier le résultat, résumer les points ouverts et les prochaines vérifications.']}
] as const;
export const methodFor=(mode:string)=>teamMethods.find(method=>method.id===mode)||teamMethods[0];
export const suggestedRole=(mode:string,index:number)=>{const roles=methodFor(mode).roles;return roles[Math.min(index,roles.length-1)];};
/** Consent and round count do not change the assignments approved in a plan. */
export function sameAssignments(previous:TeamSelection,next:TeamSelection):boolean {
 const identity=(selection:TeamSelection)=>JSON.stringify({mode:selection.mode,assistants:selection.selected.map(id=>({id,model:selection.models[id]||'',role:(selection.roles[id]||'').trim()}))});
 return identity(previous)===identity(next);
}
export function applyTeamMethod(selection:TeamSelection,mode:TeamMode):TeamSelection {
 const selected=mode==='individual'?selection.selected.slice(0,1):[...selection.selected];
 return {...selection,mode,rounds:1,selected,roles:{...selection.roles,...Object.fromEntries(selected.map((id,index)=>[id,selection.roles[id]||suggestedRole(mode,index)]))}};
}
export function connectionQuota(connection:Pick<TeamConnection,'quota'>):Record<string,any>{
 try{const data=typeof connection.quota==='string'?JSON.parse(connection.quota):connection.quota;return data&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,any>:{};}catch{return {};}
}
export function connectionIssue(connection:TeamConnection|undefined,model?:string,time=Date.now()):string|null {
 if(!connection)return 'Cette connexion a été retirée. Choisissez un autre assistant.';
 if(!['openai','anthropic','gemini','mistral'].includes(connection.provider))return 'Ce service ne propose pas de discussion dans Atelier.';
 if(connection.expires_at&&(!Number.isFinite(Date.parse(connection.expires_at))||Date.parse(connection.expires_at)<=time))return 'Accès expiré : renouvelez puis testez la connexion.';
 if(connection.status!=='connected')return connection.status==='expired'?'Accès révoqué ou expiré : renouvelez la connexion.':'Testez cette connexion dans Réglages avant de l’utiliser.';
 if(!connection.scopes?.includes('chat')||!(connection.api_consent===1||connection.api_consent===true))return 'Cette connexion n’autorise pas une discussion API.';
 if(!Array.isArray(connection.models)||!connection.models.length)return 'Aucun modèle disponible dans le dernier catalogue du service.';
 if(model!==undefined&&(!model||!connection.models.includes(model)))return model?'Ce modèle n’est plus proposé dans le dernier catalogue. Choisissez-en un autre.':'Choisissez un modèle pour cet assistant.';
 const quota=connectionQuota(connection),retry=Date.parse(quota.retry_at);
 if(quota.status==='rate_limited'&&Number.isFinite(retry)&&retry>time)return 'Le fournisseur demande d’attendre avant un nouvel essai. Consultez l’état ci-dessous.';
 return null;
}
export function teamIssue(selection:TeamSelection,connections:TeamConnection[],previousProvider?:string|null,time=Date.now()):string|null {
 const {selected,models,roles,mode,rounds,consent}=selection;
 if(!selected.length)return 'Choisissez un assistant pour préparer votre équipe.';
 if(selected.length>3||new Set(selected).size!==selected.length)return 'Choisissez au maximum trois connexions distinctes.';
 if(mode==='individual'&&(selected.length!==1||rounds!==1))return 'Une réponse utilise un assistant et un tour.';
 if(mode!=='individual'&&selected.length<2)return 'Ajoutez au moins deux assistants pour cette méthode.';
 if(!Number.isInteger(rounds)||rounds<1||rounds>3)return 'Choisissez entre un et trois tours.';
 for(const id of selected){
  const connection=connections.find(c=>c.id===id),issue=connectionIssue(connection,models[id]||'',time);
  if(issue)return `${connection?.label||'Assistant retiré'} : ${issue}`;
  if((roles[id]||'').trim().length>500)return 'Chaque rôle est limité à 500 caractères.';
 }
 const providers=selected.map(id=>connections.find(c=>c.id===id)!.provider);
 if(!consent&&(selected.length>1||(previousProvider&&!providers.includes(previousProvider))))return 'Autorisez le partage du contexte avec les assistants choisis avant d’envoyer.';
 return null;
}
export const reflectionStarters=[
 {id:'clarify',label:'Clarifier la demande',text:'Reformule mon objectif, relève les contraintes et les informations manquantes, puis propose une prochaine étape concrète. Distingue les faits des hypothèses.'},
 {id:'options',label:'Comparer les options',text:'Compare deux ou trois options selon des critères explicites : simplicité, effort, coût et limites. Explique brièvement ta recommandation et ce qui pourrait la faire changer.'},
 {id:'verify',label:'Chercher les erreurs',text:'Relis la proposition en cherchant les erreurs, cas limites et éléments non vérifiés. Pour le code, distingue les tests réellement exécutés des tests restant à lancer et propose les commandes utiles.'}
] as const;
export function appendReflection(message:string,id:string):string {
 const starter=reflectionStarters.find(s=>s.id===id);if(!starter)throw new Error('Cette aide à la rédaction est inconnue.');
 const result=[message.trim(),starter.text].filter(Boolean).join('\n\n');
 if(result.length>12000)throw new Error('Le brouillon est trop long pour ajouter cette consigne. Raccourcissez-le d’abord.');
 return result;
}
export function relayMessage(message:string,currentDraft=''):string {
 const text=[currentDraft.trim(),`Reprends le travail après une limite de service. Objectif initial :\n${message.trim()}`, 'Utilise les sources sélectionnées et les résultats déjà présents dans cette conversation. Précise ce qui manque avant de poursuivre ; ne présente pas un résultat incomplet comme validé.'].filter(Boolean).join('\n\n');
 if(text.length>12000)throw new Error('Le relais dépasse la taille d’un message. Raccourcissez le brouillon avant de le préparer.');
 return text;
}
