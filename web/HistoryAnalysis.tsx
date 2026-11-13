/* Analyse de l'historique importé par les IA déjà connectées (Gemini, Groq, Mistral). Une unité par appel :
   l'écran avance pas à pas, s'arrête sur une limite et reprend sans rien refaire. */
import {useCallback,useEffect,useRef,useState} from 'react';
import {api,post,patch,date} from './api';
import {Button,Field,ErrorBox,Loading} from './ui';
const KINDS:Record<string,string>={demand:'Demande ferme',conditional_demand:'Demande conditionnelle',question:'Question',preference:'Préférence',refusal:'Refus',decision:'Décision',assistant_proposal:'Proposition d’un assistant',hypothesis:'Hypothèse',correction:'Correction',reported_result:'Résultat rapporté',other:'Autre'};
const AGREE:Record<string,string>={unchecked:'Une seule lecture',single:'Relevé par une seule IA',agree:'Deux IA concordent',differ:'Deux IA divergent'};
const PROVIDER:Record<string,string>={gemini:'Gemini',groq:'Groq',mistral:'Mistral'};

export function HistoryAnalysis({batchId,lots}:{batchId:string;lots:string[]}){
 const [ov,setOv]=useState<any>(null),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState(''),[running,setRunning]=useState(false),[busy,setBusy]=useState(false),[lot,setLot]=useState(''),[log,setLog]=useState<string[]>([]);
 const stop=useRef(false);
 const load=useCallback(()=>api(`/exports/${batchId}/analysis`).then(setOv).catch(setError),[batchId]);
 useEffect(()=>{void load();return()=>{stop.current=true;};},[load]);
 const say=(s:string)=>setLog(l=>[new Date().toLocaleTimeString('fr-FR')+' — '+s,...l].slice(0,12));
 async function prepare(){setBusy(true);setError(null);try{let after='',created=0,without=0;for(let i=0;i<200;i++){const r=await post(`/exports/${batchId}/analysis/prepare`,{lot,after});created+=r.created;without+=r.without_messages;if(!r.next)break;after=r.next;}
  setNotice(created+' unité(s) nouvelle(s) préparée(s) sur cet appareil et le serveur, sans IA.'+(without?' '+without+' conversation(s) sans message importé : importez-les d’abord.':''));await load();}catch(e){setError(e);}finally{setBusy(false);}}
 async function runLoop(){
  stop.current=false;setRunning(true);setError(null);setNotice('');
  try{for(let i=0;i<500&&!stop.current;i++){
   const r=await post(`/exports/${batchId}/analysis/step`,{lot});setOv(r.overview);say(r.step.message);
   if(r.step.status==='done'){setNotice('Plus aucune unité en attente.');break;}
   if(r.step.status==='paused'){setNotice(r.step.until?'Pause : toutes les IA disponibles sont en limite. Reprise possible vers '+date(r.step.until)+'. Rien n’est perdu ; relancez à ce moment-là.':'Pause : aucune IA disponible pour l’instant. Rien n’est perdu.');break;}
   if(r.step.status==='no_provider'){setNotice(r.step.message);break;}
  }}catch(e){setError(e);}finally{setRunning(false);}
 }
 if(!ov)return <><ErrorBox error={error}/><Loading/></>;
 const u=ov.units,total=u.pending+u.analysed+u.failed,todo=u.pending+u.second_wanted;
 return <div className="stack">
  <ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}
  <p><strong>{ov.statement}</strong></p>
  {total>0&&<div className="progress-line" aria-hidden="true"><span style={{width:Math.round(100*u.analysed/total)+'%'}}/></div>}
  <p className="muted">Le découpage et les contrôles sont faits sans IA. L’analyse utilise seulement vos connexions Gemini, Groq et Mistral ; Claude n’est jamais sollicité ici. {ov.notice}</p>
  {!ov.consent_at?<div className="panel stack"><strong>Votre accord est nécessaire</strong>
    <p className="muted">L’analyse envoie le texte des conversations importées à Gemini, Groq ou Mistral. Selon l’offre de chaque fournisseur, ces textes peuvent être conservés ou réutilisés par lui : vérifiez leurs conditions avant d’accepter. N’envoyez pas de conversation contenant un mot de passe ou une clé.</p>
    <Button disabled={busy} onClick={async()=>{try{setOv(await post(`/exports/${batchId}/analysis/consent`,{confirm:true}));}catch(e){setError(e);}}}>J’accepte l’envoi à ces IA pour cet export</Button></div>
   :<p className="muted">Accord donné le {date(ov.consent_at)}. <button className="link-button" onClick={async()=>{try{setOv(await post(`/exports/${batchId}/analysis/consent`,{confirm:false}));}catch(e){setError(e);}}}>Retirer mon accord</button></p>}
  {lots.length>0&&<Field label="Lot à traiter"><select value={lot} onChange={e=>setLot(e.target.value)}><option value="">Tous les lots</option>{lots.map(l=><option key={l} value={l}>{l}</option>)}</select></Field>}
  <Button kind="secondary" disabled={busy||running} onClick={()=>void prepare()}>1. Préparer les unités (sans IA)</Button>
  {!running?<Button disabled={busy||!ov.consent_at||!todo} onClick={()=>void runLoop()}>2. Lancer l’analyse ({todo} à traiter)</Button>:<Button kind="secondary" onClick={()=>{stop.current=true;}}>Mettre en pause après l’unité en cours</Button>}
  {u.failed+u.second_failed>0&&<Button kind="secondary" disabled={busy||running} onClick={async()=>{try{const r=await post(`/exports/${batchId}/analysis/retry-failed`,{});setNotice(r.retried+' unité(s) remise(s) en attente. Les réponses précédentes sont conservées.');await load();}catch(e){setError(e);}}}>Reprendre les {u.failed+u.second_failed} unité(s) en échec</Button>}
  {log.length>0&&<ul className="plain" aria-live="polite">{log.map((l,i)=><li key={i}><small className="muted">{l}</small></li>)}</ul>}
  <details className="fold"><summary className="fold-summary"><strong>Vos IA et leur consommation</strong><small className="muted">{ov.providers.length} connexion(s) · limites remontées par les fournisseurs</small></summary><div className="fold-body stack">
   {!ov.providers.length&&<p className="muted">Aucune connexion Gemini, Groq ou Mistral. Ajoutez-en dans Réglages → Connexions.</p>}
   {ov.providers.map((p:any,i:number)=><p key={i}><strong>{PROVIDER[p.provider]||p.provider}</strong> · {p.label}{p.model?' · '+p.model:' · aucun modèle de texte listé'} — {p.usable?'disponible':'en pause'}<br/><small className="muted">{p.reason}{p.until?' · jusqu’à '+date(p.until)+(p.until_source==='provider'?' (heure donnée par le fournisseur)':' (pause de prudence d’Atelier)'):''}</small></p>)}
   {ov.usage.length>0&&<><h4>Appels pour cet export</h4><ul className="plain">{ov.usage.map((x:any,i:number)=><li key={i}>{PROVIDER[x.provider]||x.provider} · {x.model} : {x.calls} appel(s), {x.completed} réussi(s), {x.refused} refusé(s), {x.interrupted} interrompu(s){x.input_tokens!==null?' · '+x.input_tokens+' jetons lus, '+(x.output_tokens??'?')+' écrits':' · jetons non communiqués'}</li>)}</ul></>}
   <p className="muted">Les quotas restants ne sont connus que lorsqu’un fournisseur les renvoie ; sinon Atelier n’affiche rien.</p></div></details>
  <ItemList batchId={batchId} stamp={u.analysed+u.second_done}/>
 </div>;
}

function ItemList({batchId,stamp}:{batchId:string;stamp:number}){
 const [items,setItems]=useState<any[]|null>(null),[next,setNext]=useState<number|null>(null),[kind,setKind]=useState(''),[agreement,setAgreement]=useState(''),[status,setStatus]=useState('candidate'),[open,setOpen]=useState(false),[error,setError]=useState<unknown>(null);
 const load=useCallback(async(offset=0)=>{try{const d=await api(`/exports/${batchId}/analysis/items?limit=20&offset=${offset}&kind=${kind}&agreement=${agreement}&status=${status}`);setItems(old=>offset&&old?[...old,...d.items]:d.items);setNext(d.next);}catch(e){setError(e);}},[batchId,kind,agreement,status]);
 useEffect(()=>{if(open)void load();},[open,load,stamp]);
 return <details className="fold" onToggle={e=>setOpen((e.target as HTMLDetailsElement).open)}><summary className="fold-summary"><strong>Éléments relevés</strong><small className="muted">candidats à valider, chacun avec ses messages d’origine</small></summary><div className="fold-body stack">
  <ErrorBox error={error}/>
  <div className="filter-row"><select aria-label="Type" value={kind} onChange={e=>setKind(e.target.value)}><option value="">Tous les types</option>{Object.entries(KINDS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
   <select aria-label="Concordance" value={agreement} onChange={e=>setAgreement(e.target.value)}><option value="">Toute concordance</option>{Object.entries(AGREE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
   <select aria-label="État" value={status} onChange={e=>setStatus(e.target.value)}><option value="candidate">À examiner</option><option value="accepted">Retenus</option><option value="rejected">Écartés</option><option value="">Tous</option></select></div>
  {!items?<Loading/>:!items.length?<p className="muted">Aucun élément pour ce filtre.</p>:items.map(i=><ItemCard key={i.id} item={i} onChanged={()=>void load()}/>)}
  {next&&<Button kind="text" onClick={()=>void load(next)}>Éléments suivants</Button>}
 </div></details>;
}
function ItemCard({item,onChanged}:{item:any;onChanged:()=>void}){
 const [detail,setDetail]=useState<any>(null),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 const set=async(review_status:string)=>{setBusy(true);try{await patch(`/exports/analysis/items/${item.id}`,{review_status,review_note:''});onChanged();}catch(e){setError(e);}finally{setBusy(false);}};
 return <details className="fold" onToggle={e=>{if((e.target as HTMLDetailsElement).open&&!detail)api(`/exports/analysis/items/${item.id}`).then(setDetail).catch(setError);}}>
  <summary className="fold-summary"><strong>{item.kind_label} — {item.text}</strong><small className="muted">{item.conversation_title} · {PROVIDER[item.provider]||item.provider} · {item.agreement_label}{item.quote_verified?'':' · citation non retrouvée'}{item.reclassified?' · reclassé':''}</small></summary>
  <div className="fold-body stack"><ErrorBox error={error}/>
   {item.reclassified&&<p className="notice">L’IA l’avait attribué à l’utilisateur, mais ne cite que des messages de l’assistant : classé « proposition d’un assistant ».</p>}
   {!item.quote_verified&&<p className="notice">La citation donnée par l’IA n’a pas été retrouvée mot pour mot dans le message : lisez la source avant de retenir cet élément.</p>}
   {item.agreement==='differ'&&<p className="notice">Les deux IA ne classent pas ce passage de la même façon : c’est le message d’origine qui tranche.</p>}
   {!detail?<Loading/>:<>
    <h4>Messages d’origine</h4>
    {detail.sources.map((s:any)=><div className="panel" key={s.key}><small className="muted">{s.role==='user'?'Vous':s.role==='assistant'?'Assistant':s.role}{s.date?' · '+date(s.date):''}</small><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{s.content}</p></div>)}
    {detail.sources_missing>0&&<p className="notice">{detail.sources_missing} message(s) source introuvable(s).</p>}
    {detail.other_reading.length>0&&<><h4>Ce que l’autre lecture a relevé dans la même unité</h4><ul className="plain">{detail.other_reading.map((o:any)=><li key={o.id}>{PROVIDER[o.provider]||o.provider} : {o.kind_label} — {o.text}</li>)}</ul></>}</>}
   <div className="stack">{item.review_status!=='accepted'&&<Button disabled={busy} onClick={()=>void set('accepted')}>Je retiens cet élément</Button>}
    {item.review_status!=='rejected'&&<Button kind="secondary" disabled={busy} onClick={()=>void set('rejected')}>Je l’écarte</Button>}
    {item.review_status!=='candidate'&&<Button kind="text" disabled={busy} onClick={()=>void set('candidate')}>Remettre à examiner</Button>}</div>
   <p className="muted">Retenir un élément ne crée pas de décision : il reste à l’inscrire vous-même dans le Pilotage du projet.</p>
  </div></details>;
}
