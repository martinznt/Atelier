export type PlanningPriority='speed'|'quality'|'balanced';
export type Candidate={connection_id:string;model:string};
export type Mission={role:string;candidates:Candidate[]};
export type PlanningRequest={priority:PlanningPriority;max_wait_minutes:number;start_before?:string|null;missions:Mission[]};
export type PlanningConnection={id:string;label:string;provider:string;status:string;models:string[];scopes:string[];api_consent:number|boolean;expires_at?:string|null;quota?:unknown;models_checked_at?:string|null;models_revision?:number};
export type PlannedAssistant=Candidate&{role:string;assistant_label:string;provider:string;reason:string;catalog_revision:number;available_at:string|null};
export type TeamPlan={assistants:PlannedAssistant[];not_before:string|null;warnings:string[];blocked:string[];basis:'user_preferences';evaluated_at:string};
const MAX_WAIT=30*86400000;
const quotaOf=(value:unknown):Record<string,any>=>{try{const data=typeof value==='string'?JSON.parse(value):value;return data&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,any>:{};}catch{return {};}};

/** Candidate order is the user's assessment for this mission, never an invented model score. */
export function planTeam(request:PlanningRequest,connections:PlanningConnection[],time:number):TeamPlan {
 const plan:TeamPlan={assistants:[],not_before:null,warnings:[],blocked:[],basis:'user_preferences',evaluated_at:new Date(time).toISOString()};
 if(!['speed','quality','balanced'].includes(request.priority)||!Number.isInteger(request.max_wait_minutes)||request.max_wait_minutes<0||request.max_wait_minutes>43200||request.missions.length<1||request.missions.length>3){plan.blocked.push('Choisissez une priorité, un délai entre 0 et 30 jours et une à trois missions.');return plan;}
 let latest=time+MAX_WAIT;
 if(request.start_before){const deadline=Date.parse(request.start_before);if(!Number.isFinite(deadline)||deadline<time){plan.blocked.push('La date limite de démarrage doit être dans le futur.');return plan;}latest=Math.min(latest,deadline);}
 if(request.priority==='speed')latest=time;
 if(request.priority==='balanced')latest=Math.min(latest,time+request.max_wait_minutes*60000);
 const warnings=new Set<string>();
 const choices=request.missions.map((mission,slot)=>{
  const offers:{assignment:PlannedAssistant;rank:number;time:number}[]=[];
  if(!mission.role.trim()||mission.role.trim().length>500||mission.candidates.length<1||mission.candidates.length>5){plan.blocked.push(`Mission ${slot+1} : indiquez un rôle et un à cinq candidats classés.`);return offers;}
  const seen=new Set<string>();
  for(let rank=0;rank<mission.candidates.length;rank++){
   const candidate=mission.candidates[rank],identity=`${candidate.connection_id}\n${candidate.model}`;
   if(seen.has(identity))continue;seen.add(identity);
   const connection=connections.find(c=>c.id===candidate.connection_id);
   if(!connection||!['openai','anthropic','gemini','mistral'].includes(connection.provider)||connection.status!=='connected'||!connection.api_consent||!connection.scopes.includes('chat')||!connection.models.includes(candidate.model))continue;
   const expiry=connection.expires_at?Date.parse(connection.expires_at):Infinity;
   if(Number.isNaN(expiry)||expiry<=time)continue;
   const quota=quotaOf(connection.quota),observed=Date.parse(quota.observed_at||quota.updated_at),retry=Date.parse(quota.retry_at);
   let available=time;
   if(quota.status==='rate_limited'){
    if(Number.isFinite(retry))available=Math.max(time,retry);
    else{
     warnings.add(`${connection.label} : refus API observé, aucune date de nouvel essai fournie.`);
     // No date is fabricated, even when the observation has become old.
     if(rank===0&&request.priority==='quality')break;
     continue;
    }
   }
   if(available>latest||expiry<=available){if(rank===0&&request.priority==='quality')break;continue;}
   if(!Number.isFinite(observed)||time-observed>15*60000)warnings.add(`${connection.label} : disponibilité non confirmée ou information ancienne.`);
   if(quota.kind!=='official')warnings.add(`${connection.label} : quota global et coût restant indisponibles.`);
   const checkedAt=Date.parse(connection.models_checked_at||'');
   if(!Number.isFinite(checkedAt)||time-checkedAt>86400000)warnings.add(`${connection.label} : actualisez le catalogue avant de réévaluer vos préférences.`);
   offers.push({rank,time:available,assignment:{...candidate,role:mission.role.trim(),assistant_label:connection.label,provider:connection.provider,catalog_revision:connection.models_revision||0,available_at:available>time?new Date(available).toISOString():null,
    reason:`Choix ${rank+1} de vos préférences pour cette mission. ${available>time?'Attente indiquée par le fournisseur, sans garantie de disponibilité à cette date.':rank?'Les choix précédents ne conviennent pas à la disponibilité ou au délai connus.':'Aucune attente connue incompatible avec votre priorité.'}`}});
  }
  if(!offers.length&&!plan.blocked.some(message=>message.startsWith(`Mission ${slot+1} :`)))plan.blocked.push(`Mission ${slot+1} : aucun candidat ne convient aux accès et au délai connus. Modifiez vos préférences ou actualisez les informations.`);
  return offers;
 });
 plan.warnings=[...warnings];if(plan.blocked.length)return plan;
 // At most 5^3 combinations. Matching avoids giving the same account two roles.
 let best:{items:PlannedAssistant[];score:number;time:number}|null=null;
 function visit(slot:number,ids:Set<string>,items:PlannedAssistant[],score:number,start:number):void {
  if(slot===choices.length){if(!best||score<best.score||(score===best.score&&start<best.time))best={items,score,time:start};return;}
  for(const offer of choices[slot])if(!ids.has(offer.assignment.connection_id))visit(slot+1,new Set([...ids,offer.assignment.connection_id]),[...items,offer.assignment],score+offer.rank,Math.max(start,offer.time));
 }
 visit(0,new Set(),[],0,time);
 const result=best as {items:PlannedAssistant[];score:number;time:number}|null;
 if(!result){plan.blocked.push('Ces préférences ne permettent pas une connexion distincte pour chaque mission. Ajoutez un autre candidat ou compte.');return plan;}
 plan.assistants=result.items;plan.not_before=result.time>time?new Date(result.time).toISOString():null;
 return plan;
}

/** Excludes evaluation time so an unchanged immediate plan has a stable identity. */
export function planIdentity(plan:TeamPlan):string {
 return JSON.stringify({assistants:plan.assistants.map(({connection_id,model,role,catalog_revision,available_at})=>({connection_id,model,role,catalog_revision,available_at})),not_before:plan.not_before,blocked:plan.blocked});
}

/** A queue delay must never silently overrule the user's absolute start deadline. */
export function plannedStartIssue(planning:PlanningRequest|undefined,time:number):string|null {
 if(!planning?.start_before)return null;
 const deadline=Date.parse(planning.start_before);
 return !Number.isFinite(deadline)||time>deadline
  ? 'La date limite de démarrage est dépassée. Aucun appel IA n’a été lancé ; choisissez une nouvelle date ou préparez une autre équipe.'
  : null;
}
