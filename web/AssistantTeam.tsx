import {ArrowUp,ArrowDown,RefreshCw,X} from 'lucide-react';
import {Button,Field} from './ui';
import {recommendedReviewTeam} from '../server/review-team.mjs';
import {date} from './api';
import {applyTeamMethod,connectionIssue,connectionQuota,methodFor,providerName,reflectionStarters,suggestedRole,teamMethods,type TeamConnection,type TeamSelection} from './team-guide';

function QuotaInfo({connection}:{connection:TeamConnection}){
 const quota=connectionQuota(connection),observed=quota.observed_at||quota.updated_at;
 const stale=observed&&Number.isFinite(Date.parse(observed))&&Date.now()-Date.parse(observed)>15*60000;
 return <div className="team-quota">
  {quota.status==='rate_limited'?<><strong>Limite API atteinte lors du dernier refus</strong>{quota.observed_at&&<span>Observée le {date(quota.observed_at)}.</span>}{quota.retry_at&&Number.isFinite(Date.parse(quota.retry_at))&&<span>Nouvel essai conseillé par le fournisseur à partir du {date(quota.retry_at)}. Ce n’est pas une garantie de disponibilité.</span>}<span>Le quota restant et la réinitialisation de l’abonnement ne sont pas connus.</span></>:<span>{quota.kind==='official'?'Limites API communiquées par le fournisseur.':'Quota API non communiqué.'}</span>}
  {stale&&<span>Information ancienne : elle peut avoir changé.</span>}
  {quota.kind==='official'&&quota.updated_at&&<span>Donnée fournisseur du {date(quota.updated_at)}.</span>}
  {quota.kind==='official'&&quota.values&&typeof quota.values==='object'&&Object.keys(quota.values).length>0&&<details><summary>Voir les valeurs reçues</summary><dl>{Object.entries(quota.values).map(([name,value])=><div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>)}</dl></details>}
 </div>;
}

type Props={
 selection:TeamSelection;connections:TeamConnection[];onChange:(selection:TeamSelection)=>void;
 onConnections:()=>void;onRefresh:()=>void;refreshing:boolean;refreshedAt:string|null;
 onReflection:(id:string)=>void;issue:string|null;
};
export function AssistantTeam({selection,connections,onChange,onConnections,onRefresh,refreshing,refreshedAt,onReflection,issue}:Props){
 const {selected,models,roles,mode,consent}=selection,method=methodFor(mode),maximum=mode==='individual'?1:3;
 const suggested=recommendedReviewTeam(connections);
 function add(id:string){
  const connection=connections.find(c=>c.id===id);if(!connection||selected.includes(id)||selected.length>=maximum||connectionIssue(connection))return;
  onChange({...selection,selected:[...selected,id],models:{...models,[id]:models[id]&&connection.models.includes(models[id])?models[id]:connection.models.length===1?connection.models[0]:''},roles:{...roles,[id]:roles[id]||suggestedRole(mode,selected.length)},consent:false});
 }
 function proposeTeam(){
  const candidates=[suggested.primary,suggested.secondary].filter((c):c is {connection_id:string;model:string}=>!!c);
  if(!candidates.length)return;
  const mode=candidates.length>1?'review':'individual';
  onChange({...selection,mode,rounds:1,
   selected:candidates.map(c=>c.connection_id),
   models:Object.fromEntries(candidates.map(c=>[c.connection_id,c.model])),
   roles:Object.fromEntries(candidates.map((c,index)=>[c.connection_id,suggestedRole(mode,index)])),
   consent:false
  });
 }
 function move(index:number,direction:number){const ordered=[...selected];[ordered[index],ordered[index+direction]]=[ordered[index+direction],ordered[index]];onChange({...selection,selected:ordered});}
 return <section className="assistant-team" aria-label="Choisir la méthode et les assistants">
  <div className="team-heading"><h3>Comment avancer ?</h3><button type="button" onClick={onConnections}>Gérer mes connexions</button></div>
  <div className="team-methods" role="group" aria-label="Méthode de travail">{teamMethods.map(item=><button type="button" aria-pressed={mode===item.id} key={item.id} onClick={()=>onChange(applyTeamMethod(selection,item.id))}>{item.label}</button>)}</div>
  <p className="team-method-description">{method.description}</p>
  <div className="notice">
   <strong>Parcours de réflexion conseillé</strong>
   <p>Atelier choisit les connexions testées : la première IA propose, une seconde issue d'un autre fournisseur relit si disponible. Un seul tour ; aucun appel lancé sans ton accord.</p>
   <Button kind="secondary" disabled={!suggested.primary} onClick={proposeTeam}>{suggested.primary?'Composer automatiquement mon équipe':'Connecter d’abord une API disponible'}</Button>
   <small>Économie de quota estimée d'après le nom des modèles, pas une garantie de coût nul. Vérifie les limites de tes comptes avant l'envoi.</small>
  </div>
  <p className="fine-print">Choisir une méthode propose des rôles modifiables. Rien n’est envoyé avant « Envoyer ».</p>
  <ol className="team-members">{selected.map((id,index)=>{
   const connection=connections.find(c=>c.id===id),label=connection?.label||'Connexion retirée',problem=connectionIssue(connection,models[id]||'');
   return <li className="team-member" key={id}>
    <div className="team-member-heading"><span className="team-position">{index+1}</span><div><strong>{label}</strong><small>{connection?providerName(connection.provider):'Choisissez une autre connexion'}{connection?.account_label?` · ${connection.account_label}`:''}</small></div><div className="team-order">
     <button type="button" className="icon-button" disabled={index===0} aria-label={`Faire intervenir ${label} plus tôt`} onClick={()=>move(index,-1)}><ArrowUp size={16}/></button>
     <button type="button" className="icon-button" disabled={index===selected.length-1} aria-label={`Faire intervenir ${label} plus tard`} onClick={()=>move(index,1)}><ArrowDown size={16}/></button>
     <button type="button" className="icon-button" aria-label={`Retirer ${label} de cette équipe`} onClick={()=>onChange({...selection,selected:selected.filter(value=>value!==id)})}><X size={16}/></button>
    </div></div>
    {problem&&<p className="team-unavailable">{problem}</p>}
    <Field label={`Modèle de ${label}`}><select value={models[id]||''} onChange={e=>onChange({...selection,models:{...models,[id]:e.target.value}})}>
     <option value="">Choisir un modèle</option>{models[id]&&!connection?.models.includes(models[id])&&<option value={models[id]} disabled>{models[id]} — indisponible</option>}
     {(connection?.models||[]).map(model=><option key={model} value={model}>{model}</option>)}
    </select></Field>
    <Field label={`Rôle de ${label}`} hint="Consigne visible envoyée à cet assistant. Elle ne lui donne pas de permissions supplémentaires."><textarea rows={2} maxLength={500} value={roles[id]||''} onChange={e=>onChange({...selection,roles:{...roles,[id]:e.target.value}})}/></Field>
    {connection&&<QuotaInfo connection={connection}/>}
   </li>;
  })}</ol>
  {selected.length<maximum&&<Field label={selected.length?'Ajouter un autre assistant':'Choisir un assistant'}><select value="" onChange={e=>add(e.target.value)}><option value="">Choisir une connexion nommée…</option>{connections.filter(c=>!selected.includes(c.id)).map(connection=><option key={connection.id} value={connection.id} disabled={!!connectionIssue(connection)}>{connection.label} · {providerName(connection.provider)}{connectionIssue(connection)?' · indisponible':''}</option>)}</select></Field>}
  <div className="team-refresh"><Button kind="text" disabled={refreshing||!navigator.onLine} onClick={onRefresh}><RefreshCw size={14}/>{refreshing?'Actualisation…':'Actualiser les états'}</Button>{refreshedAt&&<small>Lecture des états le {date(refreshedAt)}</small>}</div>
  <p className="fine-print">Plusieurs connexions au même service sont possibles. L’ordre ci-dessus est l’ordre d’intervention. Les états enregistrés sont relus automatiquement. Dans Réglages, vous pouvez tester le catalogue ou autoriser son actualisation quotidienne.</p>
  <label className="check team-consent"><input type="checkbox" checked={consent} onChange={e=>onChange({...selection,consent:e.target.checked})}/><span>J’autorise l’envoi du contexte choisi et des réponses utiles aux connexions sélectionnées : {selected.map(id=>connections.find(c=>c.id===id)?.label||'connexion retirée').join(', ')||'aucune pour le moment'}.</span></label>
  {issue&&<p className="team-hint" role="status">{issue}</p>}
  <details className="reflection-tools"><summary>Aides pour formuler ma demande</summary><p>Ces boutons ajoutent une consigne modifiable au brouillon. Ils n’activent aucun outil externe et ne donnent pas accès aux raisonnements internes privés.</p><div className="inline wrap">{reflectionStarters.map(starter=><Button key={starter.id} kind="secondary" onClick={()=>onReflection(starter.id)}>{starter.label}</Button>)}</div></details>
 </section>;
}
