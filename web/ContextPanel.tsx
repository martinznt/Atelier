/* Contexte utile pour réfléchir : sélection locale (sans IA, sans quota) de ce que le projet sait déjà sur un sujet.
   Chaque ligne dit ce qu'elle est (décision confirmée, proposition, citation…), pourquoi elle a été retenue et d'où elle vient. */
import {useState} from 'react';
import {api,date} from './api';
import {Button,Field,ErrorBox,Loading} from './ui';
import {contextText} from '../server/context-core.ts';
const KIND:Record<string,string>={decision:'Décision',task:'Tâche',document:'Document',memory:'Note',chat:'Message du chat',imported:'Message importé'};
const TONE:Record<string,string>={confirmed:'✔ ',verified:'✔ ',obsolete:'⛔ ',rejected:'⛔ ',proposed:'? ',unverified:'? ',source:'« '};
export function ContextPanel({project,onOpen}:{project:any;onOpen?:(o:any)=>void}){
 const [topic,setTopic]=useState(''),[res,setRes]=useState<any>(null),[picked,setPicked]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState('');
 async function search(){
  setBusy(true);setError(null);setNotice('');
  try{const d=await api(`/workbench/context?project=${project.id}&q=${encodeURIComponent(topic)}`);setRes(d);setPicked(d.hits.filter((h:any)=>h.reliability.usable===true).map((h:any)=>h.kind+':'+h.id));}
  catch(e){setError(e);}finally{setBusy(false);}
 }
 const toggle=(k:string)=>setPicked(p=>p.includes(k)?p.filter(x=>x!==k):[...p,k]);
 async function copy(){
  const chosen=res.hits.filter((h:any)=>picked.includes(h.kind+':'+h.id));
  try{await navigator.clipboard.writeText(contextText(topic,project.name,chosen));setNotice(chosen.length+' élément(s) copié(s) avec leur nature et leur source. Collez-les dans la conversation de votre choix.');}
  catch{setError(new Error('La copie a échoué sur cet appareil.'));}
 }
 return <details className="fold"><summary className="fold-summary"><strong>Contexte utile pour réfléchir</strong><small className="muted">ce que ce projet sait déjà sur un sujet, avec ses sources</small></summary><div className="fold-body stack">
  <Field label="Sujet ou question" hint="Quelques phrases suffisent. Aucune IA n’est utilisée : Atelier cherche les mots dans ce projet."><textarea rows={2} value={topic} maxLength={800} onChange={e=>setTopic(e.target.value)} placeholder="Ex. : faut-il ajouter un minuteur dans les recettes ?"/></Field>
  <Button disabled={busy||topic.trim().length<3} onClick={()=>void search()}>Chercher le contexte</Button>
  <ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}{busy&&<Loading/>}
  {res&&<>
   <p className="muted">Mots retenus : {res.terms.join(', ')||'aucun'}.</p>
   {res.warnings.map((w:string,i:number)=><p className="notice" key={i}>{w}</p>)}
   {res.hits.map((h:any)=>{const k=h.kind+':'+h.id;return <div className="panel stack" key={k}>
    <label className="check"><input type="checkbox" checked={picked.includes(k)} onChange={()=>toggle(k)}/><span><strong>{TONE[h.reliability.level]}{h.title}</strong><br/><small className="muted">{KIND[h.kind]} · {h.reliability.label}{h.date?' · '+date(h.date):''}</small></span></label>
    <p className="muted" style={{overflowWrap:'anywhere'}}>{h.excerpt}</p><small className="muted">Retenu parce qu’il contient : {h.matched.join(', ')}.</small>
    {onOpen&&<Button kind="text" onClick={()=>onOpen(h.open)}>Ouvrir la source</Button>}</div>;})}
   {res.hits.length>0&&<Button kind="secondary" disabled={!picked.length} onClick={()=>void copy()}>Copier la sélection ({picked.length}) avec ses sources</Button>}
   <p className="muted">{res.notice}</p></>}
 </div></details>;
}
