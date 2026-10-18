import {useEffect,useRef,useState} from 'react';
import {post,date} from './api';
import {Button,Field,Modal,ErrorBox} from './ui';
import type {PlanningRequest,TeamPlan} from '../server/planning';
import {providerName,type TeamConnection,type TeamSelection,suggestedRole} from './team-guide';
export type ApprovedPlan={planning:PlanningRequest;fingerprint:string;not_before:string|null;allow_scheduled:boolean};
export function AssistantPlanner({conversation,connections,selection,onApply,onClose}:{conversation:string;connections:TeamConnection[];selection:TeamSelection;onApply:(plan:ApprovedPlan,result:TeamPlan)=>void;onClose:()=>void}){
 const [request,setRequest]=useState<PlanningRequest>(()=>({priority:'balanced',max_wait_minutes:10,missions:(selection.selected.length?selection.selected:Array.from({length:selection.mode==='individual'?1:2},()=>'')) .map((id,index)=>({role:selection.roles[id]||suggestedRole(selection.mode,index),candidates:id?[{connection_id:id,model:selection.models[id]||''}]:[]}))}));
 const [result,setResult]=useState<(TeamPlan&{fingerprint:string})|null>(null),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false),[scheduled,setScheduled]=useState(false);
 const alive=useRef(true),revision=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;revision.current++;};},[]);
 function edit(next:PlanningRequest){revision.current++;setRequest(next);setResult(null);setScheduled(false);setBusy(false);}
 function updateMission(index:number,update:Partial<PlanningRequest['missions'][number]>){edit({...request,missions:request.missions.map((mission,i)=>i===index?{...mission,...update}:mission)});}
 async function preview(){const version=++revision.current;setBusy(true);setError(null);try{const value=await post('/tasks/plan',{conversation_id:conversation,planning:request});if(alive.current&&version===revision.current)setResult(value);}catch(e){if(alive.current&&version===revision.current)setError(e);}finally{if(alive.current&&version===revision.current)setBusy(false);}}
 return <Modal title="Adapter l’équipe à mon objectif" onClose={onClose}>
  <p>Décrivez chaque mission et classez vos candidats. Le choix est recalculé avec leurs accès, modèles et limites connus. Cet écran ne lance aucune IA.</p>
  <Field label="Ma priorité"><select value={request.priority} onChange={e=>edit({...request,priority:e.target.value as PlanningRequest['priority']})}><option value="speed">Démarrer au plus vite</option><option value="quality">Privilégier mes meilleurs choix, quitte à attendre</option><option value="balanced">Mes meilleurs choix dans un délai limité</option></select></Field>
  {request.priority==='balanced'&&<Field label="Attente maximale avant de démarrer (minutes)"><input type="number" min={0} max={43200} value={request.max_wait_minutes} onChange={e=>edit({...request,max_wait_minutes:Number(e.target.value)})}/></Field>}
  <Field label="Date limite de démarrage (facultative)"><input type="datetime-local" onChange={e=>{const time=e.target.value?new Date(e.target.value).getTime():NaN;edit({...request,start_before:Number.isFinite(time)?new Date(time).toISOString():null});}}/></Field>
  <p className="fine-print">Ce délai concerne le démarrage, pas une garantie de durée totale. L’attente planifiée est limitée à 30 jours. Les classements ci-dessous sont vos préférences pour cette mission ; aucune supériorité universelle n’est présumée.</p>
  {request.missions.map((mission,index)=><fieldset className="planner-mission" key={index}><legend>Mission {index+1}</legend>
   <Field label="Résultat attendu de cet assistant"><textarea rows={2} maxLength={500} value={mission.role} onChange={e=>updateMission(index,{role:e.target.value})}/></Field>
   <ol>{mission.candidates.map((candidate,rank)=>{const connection=connections.find(c=>c.id===candidate.connection_id);return <li key={`${candidate.connection_id}:${rank}`}>
    <strong>{rank+1}. {connection?.label||'Connexion retirée'}</strong><small>{providerName(connection?.provider||'')} · catalogue révision {connection?.models_revision||0}{connection?.models_checked_at?` du ${date(connection.models_checked_at)}`:''}</small>
    <Field label={`Modèle du choix ${rank+1}`}><select value={candidate.model} onChange={e=>updateMission(index,{candidates:mission.candidates.map((c,i)=>i===rank?{...c,model:e.target.value}:c)})}><option value="">Choisir un modèle</option>{connection?.models.map(model=><option key={model}>{model}</option>)}</select></Field>
    <div className="inline wrap"><Button kind="text" disabled={rank===0} onClick={()=>{const next=[...mission.candidates];[next[rank-1],next[rank]]=[next[rank],next[rank-1]];updateMission(index,{candidates:next});}}>Préférer ce choix</Button><Button kind="text" onClick={()=>updateMission(index,{candidates:mission.candidates.filter((_,i)=>i!==rank)})}>Retirer</Button></div>
   </li>;})}</ol>
   {mission.candidates.length<5&&<Field label="Ajouter un candidat ou un remplaçant"><select value="" onChange={e=>{const connection=connections.find(c=>c.id===e.target.value);if(connection)updateMission(index,{candidates:[...mission.candidates,{connection_id:connection.id,model:connection.models.length===1?connection.models[0]:''}]});}}><option value="">Choisir un compte connecté…</option>{connections.filter(c=>!mission.candidates.some(candidate=>candidate.connection_id===c.id)).map(c=><option key={c.id} value={c.id}>{c.label} · {providerName(c.provider)}</option>)}</select></Field>}
  </fieldset>)}
  <ErrorBox error={error}/><Button disabled={busy||!navigator.onLine} onClick={preview}>{busy?'Préparation…':'Proposer une équipe'}</Button>
  {result&&<section className="plan-result" aria-live="polite"><h3>Proposition du {date(result.evaluated_at)}</h3>
   {result.blocked.map(message=><p key={message} className="notice">{message}</p>)}
   {result.assistants.map(assistant=><article key={assistant.connection_id}><strong>{assistant.assistant_label} · {assistant.model}</strong><p>{assistant.role}</p><small>{assistant.reason}</small></article>)}
   {result.warnings.length>0&&<details><summary>Informations à vérifier ({result.warnings.length})</summary><ul>{result.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></details>}
   {result.not_before&&<label className="check"><input type="checkbox" checked={scheduled} onChange={e=>setScheduled(e.target.checked)}/>J’autorise le lancement côté serveur à partir du {date(result.not_before)}, même si je ferme l’application. Je pourrai annuler la tâche avant son lancement.</label>}
   {!result.blocked.length&&<Button disabled={!!result.not_before&&!scheduled} onClick={()=>onApply({planning:request,fingerprint:result.fingerprint,not_before:result.not_before,allow_scheduled:scheduled},result)}>Préparer cette équipe sans envoyer</Button>}
   <p className="fine-print">Une mise à jour du catalogue invalide la proposition avant l’envoi. Le choix accepté reste figé pendant la tâche ; une limite imprévue arrête le travail avec ses fichiers conservés, sans appel automatique à un autre compte.</p>
  </section>}
 </Modal>;
}
