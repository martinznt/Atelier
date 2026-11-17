/* Lot 5B (5B-5) — discussion liée à la maquette. On choisit un bloc (ou toute la page) et on pose sa question.
   Atelier répond d'abord SANS IA avec ce qui existe déjà (sources et niveaux). Une IA peut compléter avec VOTRE clé : réponse « Hypothèse ».
   Une conclusion n'est « Confirmé par vous » que si vous l'écrivez et la confirmez. */
import {useCallback,useEffect,useState} from 'react';
import {api,post} from './api';
import {Button,ErrorBox,Field} from './ui';

const WHO:Record<string,string>={martin:'Vous',atelier:'Atelier (sans IA)',ai:'IA'};
export function MockupChat({m}:{m:any}){
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState('');
 const [block,setBlock]=useState(''),[question,setQuestion]=useState(''),[conn,setConn]=useState(''),[model,setModel]=useState(''),[draft,setDraft]=useState<{id:string;text:string}|null>(null);
 const load=useCallback(async()=>{try{setData(await api(`/mockups/${m.id}/discussion`));}catch(e){setError(e);}},[m.id]);
 useEffect(()=>{void load();},[load]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError(null);setNotice('');try{await fn();await load();}catch(e){setError(e);}finally{setBusy(false);}};
 const conns:any[]=data?.ai_connections||[],c=conns.find(x=>x.id===(conn||conns[0]?.id)),models:string[]=c?.models||[];
 const items:any[]=data?.items||[],answered=new Set(items.filter(x=>x.author==='ai').map(x=>x.reply_to));
 return <div className="stack mq-chat">
  <p className="muted">Posez une question sur un bloc ou sur la page (« si je mets ça ici, est-ce bien ? »). Atelier répond d’abord <strong>sans IA</strong>, avec ce qui existe déjà : la maquette, les conseils, les décisions, les fonctionnalités et l’historique importé, chaque élément avec sa source.</p>
  <ErrorBox error={error}/>{notice&&<p role="status" className="notice">{notice}</p>}
  {items.length>0&&<ol className="mq-msgs">{items.map(x=><li key={x.id} className={'mq-msg '+x.author+(x.kind==='conclusion'?' concl':'')}>
   <small className="muted">{WHO[x.author]}{x.block_label?` · bloc « ${x.block_label} »`:' · toute la page'}{x.level_word?` · ${x.level==='confirmed'?'✔':x.level==='hypothesis'?'?':'◐'} ${x.level_word}`:''}{x.ai_model?` · ${x.ai_provider} ${x.ai_model}`:''}</small>
   <div className="mq-body">{x.body}</div>
   {x.kind==='answer'&&<div className="mq-row">
    {x.author==='atelier'&&!answered.has(x.id)&&conns.length>0&&<Button kind="secondary" disabled={busy} onClick={()=>void run(async()=>{await post(`/mockups/${m.id}/discussion/${x.id}/ai`,{connection_id:c.id,model:model||models[0]});setNotice('L’IA a répondu : c’est une hypothèse, à relire.');})}>Demander l’avis d’une IA</Button>}
    <Button kind="secondary" disabled={busy} onClick={()=>setDraft({id:x.id,text:''})}>Confirmer une conclusion</Button></div>}
   {draft?.id===x.id&&<div className="stack"><Field label="Votre conclusion (avec vos mots)" hint="Elle sera marquée « Confirmé par vous » et ajoutée à la fiche et à la mission."><textarea rows={2} maxLength={1000} value={draft?.text||""} onChange={e=>setDraft({id:x.id,text:e.target.value})}/></Field>
    <div className="mq-row"><Button disabled={busy||!draft?.text.trim()} onClick={()=>void run(async()=>{await post(`/mockups/${m.id}/discussion/conclusion`,{reply_to:x.id,text:draft?.text||""});setDraft(null);setNotice('Conclusion confirmée : elle entre dans la fiche et la mission.');})}>Confirmer</Button><Button kind="text" onClick={()=>setDraft(null)}>Annuler</Button></div></div>}
  </li>)}</ol>}
  <Field label="Question sur…"><select value={block} onChange={e=>setBlock(e.target.value)}><option value="">Toute la page</option>{m.blocks.map((b:any,i:number)=><option key={b.id} value={b.id}>{i+1}. {b.label}</option>)}</select></Field>
  <Field label="Votre question"><textarea rows={2} maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ex. Si je mets la recherche sous le titre, est-ce bien ?"/></Field>
  <Button disabled={busy||!question.trim()} onClick={()=>void run(async()=>{await post(`/mockups/${m.id}/discussion`,{block_id:block||null,question});setQuestion('');})}>Demander à Atelier</Button>
  {conns.length>0?<div className="stack"><p className="muted">Avis d’une IA (facultatif) : votre propre clé, une seule demande par question, jamais rejouée ; seul du texte est envoyé, jamais la capture.</p>
   <div className="two-fields"><Field label="Connexion IA"><select value={c?.id||''} onChange={e=>{setConn(e.target.value);setModel('');}}>{conns.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
    <Field label="Modèle"><select value={model||models[0]||''} onChange={e=>setModel(e.target.value)}>{models.map(x=><option key={x} value={x}>{x}</option>)}</select></Field></div></div>
   :<p className="muted">Aucune connexion IA gratuite (Mistral, Groq ou Gemini) n’est prête : Atelier répond seulement sans IA. Vous pouvez en ajouter une dans « Réglages » avec votre propre clé.</p>}
 </div>;
}
