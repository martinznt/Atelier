/* Accueil : ce qui est actif, la prochaine action de chaque projet, ce qui bloque, ce que Martin doit faire, les questions,
   les retours d'IA attendus et l'état du référentiel mémoire. Aucune donnée n'est inventée : tout vient de /workbench/home. */
import {useEffect,useState} from 'react';
import {api,date} from './api';
import {Button,ErrorBox,Empty,SectionTitle,Loading} from './ui';

export function Home({onOpen,refresh}:{onOpen:(tab:string,projectId?:string)=>void;refresh:number}){
 const [data,setData]=useState<any>(null),[error,setError]=useState<unknown>(null);
 useEffect(()=>{let alive=true;api('/workbench/home').then(d=>{if(alive){setData(d);setError(null);}}).catch(e=>{if(alive)setError(e);});return()=>{alive=false;};},[refresh]);
 if(!data)return <section><SectionTitle eyebrow="ACCUEIL" title="Atelier"/><ErrorBox error={error}/>{!error&&<Loading/>}</section>;
 return <section className="home">
  <SectionTitle eyebrow="ACCUEIL" title="Où en sont vos projets">Une prochaine action par projet. Le détail est dans Pilotage.</SectionTitle>
  <ErrorBox error={error}/>
  <div className="home-counters">
   <button onClick={()=>onOpen('inbox')}><strong>{data.inbox.actions}</strong><span>à faire par vous</span></button>
   <button onClick={()=>onOpen('inbox')}><strong>{data.inbox.questions}</strong><span>question(s) d’Atelier</span></button>
   <button onClick={()=>onOpen('memory')}><strong>{data.prompts.to_give}</strong><span>prompt(s) à donner</span></button>
   <button onClick={()=>onOpen('memory')}><strong>{data.prompts.awaiting}</strong><span>retour(s) attendu(s)</span></button>
  </div>
  {data.alerts.length>0&&<div className="notice" role="status"><strong>À surveiller</strong><ul>{data.alerts.map((a:string,i:number)=><li key={i}>{a}</li>)}</ul></div>}
  {!data.projects.length&&<Empty title="Aucun projet" action="Ouvrir le pilotage" onAction={()=>onOpen('pilotage')}>Créez l’espace « Livre de recettes » ou « Sport / Mes séances » dans Pilotage.</Empty>}
  <div className="stack">{data.projects.map((p:any)=><article className="panel home-card" key={p.id}>
   <header><h3>{p.name}</h3><span className={'badge '+(p.state==='blocked'?'interrupted':'connected')}>{p.state_label}</span></header>
   {p.objective&&<p className="muted">{p.objective}</p>}
   <div className="progress-line" title={p.progress.formula}>
    <div><progress max={100} value={p.progress.percent_done} aria-label="Tâches terminées"/><small>{p.progress.done}/{p.progress.total} terminées</small></div>
    <div><progress max={100} value={p.progress.percent_proved} aria-label="Tâches vérifiées"/><small>{p.progress.proved} vérifiées (preuve)</small></div>
    <div><progress max={100} value={p.progress.percent_validated} aria-label="Tâches validées par vous"/><small>{p.progress.validated} validées par vous</small></div>
   </div>
   <details><summary className="muted">Comment ces chiffres sont calculés</summary><p className="muted">{p.progress.formula}</p></details>
   <div className="next-step"><span className="eyebrow">PROCHAINE ACTION</span><strong>{p.next_action.title}</strong><span>{p.next_action.do}</span><small className="muted">{p.next_action.where}</small></div>
   {p.blockers.length>0&&<p className="notice"><strong>Bloqué :</strong> {p.blockers.map((b:any)=>b.title+(b.question?' — '+b.question:'')).join(' · ')}</p>}
   <p className="muted">{[p.counts.actions&&p.counts.actions+' action(s) pour vous'+(p.counts.blocking_actions?' dont '+p.counts.blocking_actions+' bloquante(s)':''),p.counts.questions&&p.counts.questions+' question(s)',p.counts.awaiting_responses&&p.counts.awaiting_responses+' retour(s) d’IA attendu(s)',p.counts.responses_to_process&&p.counts.responses_to_process+' réponse(s) à traiter',p.counts.ready_for_ai&&p.counts.ready_for_ai+' tâche(s) prête(s) à transmettre'].filter(Boolean).join(' · ')||'Rien en attente.'}</p>
   <p className="muted">{p.repositories.length?p.repositories.map((r:any)=>r.full_name+(r.verified?'':' (non vérifié)')).join(', '):'Aucun dépôt associé'}{p.last_activity&&' · dernière activité : '+date(p.last_activity.at)}</p>
   <div className="stack"><Button onClick={()=>onOpen('pilotage',p.id)}>Ouvrir le pilotage</Button><Button kind="secondary" onClick={()=>onOpen('chat',p.id)}>Discussions</Button></div>
  </article>)}</div>
  <article className="panel"><h3>Référentiel mémoire</h3>
   {data.memory.length?data.memory.map((m:any)=><p key={m.id}><strong>{m.full_name}</strong> · {m.status==='ok'?'synchronisé':m.status==='partial'?'synchronisation partielle':m.status==='error'?'en erreur':'jamais synchronisé'}{m.commit_sha&&' · commit '+String(m.commit_sha).slice(0,8)}{m.synced_at&&' · '+date(m.synced_at)}{m.stale&&' · à resynchroniser'}</p>):<p className="muted">Aucun référentiel connecté. Connectez Memoire-Projets en lecture seule dans Mémoire.</p>}
   <Button kind="secondary" onClick={()=>onOpen('memory')}>Ouvrir la mémoire</Button></article>
 </section>;
}
