/* Recherche unifiée : un seul endroit pour retrouver une conversation, un message précis (chat ou historique importé), une décision,
   une tâche, un prompt, un document, un fichier, une pièce jointe, une question ou une action. Les filtres se combinent. */
import {useEffect,useRef,useState} from 'react';
import {api,date} from './api';
import {Button,Field,ErrorBox,Loading,Modal} from './ui';
import {vault} from './vault';
const LABEL:Record<string,string>={project:'Projets',memory:'Notes de mémoire du projet',chat:'Messages du chat',imported:'Historique importé',decision:'Décisions',task:'Tâches',prompt:'Prompts',document:'Documents de référence',file:'Fichiers',attachment:'Pièces jointes citées',question:'Questions d’Atelier',action:'À faire par Martin'};
const STATUS:Record<string,string>={proposed:'proposée',validated:'validée',rejected:'rejetée',superseded:'remplacée',todo:'à faire',ready:'prête',in_progress:'en cours',waiting:'en attente',blocked:'bloquée',to_verify:'à vérifier',done:'terminée',abandoned:'abandonnée',open:'ouverte',answered:'répondue',withdrawn:'retirée',dismissed:'écartée',to_prepare:'à préparer',to_give:'à donner',given:'déjà donné',awaiting:'en attente de retour',response_received:'réponse reçue',processed:'traité',obsolete:'obsolète'};
const ROLE:Record<string,string>={user:'Vous',assistant:'Assistant',note:'Note',system:'Système',tool:'Outil'};
const PROVIDERS=['ChatGPT','Claude','gemini','groq','mistral','anthropic','openai'];

export function FindModal({onClose,onOpen}:{onClose:()=>void;onOpen:(open:any)=>void}){
 const [q,setQ]=useState(''),[filters,setFilters]=useState({project:'',provider:'',status:'',role:'',from:'',to:'',kinds:[] as string[]}),[showFilters,setShowFilters]=useState(false),[projects,setProjects]=useState<any[]>([]);
 const [res,setRes]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState<unknown>(null),[reader,setReader]=useState<any>(null),[local,setLocal]=useState<any[]>([]),[moreBusy,setMoreBusy]=useState('');
 const online=navigator.onLine,tick=useRef(0);
 useEffect(()=>{api('/projects').then(r=>setProjects(r.items||[])).catch(()=>{});},[]);
 const qs=(extra:Record<string,string|number>={})=>{const p=new URLSearchParams({q});for(const [k,v] of Object.entries({project:filters.project,provider:filters.provider,status:filters.status,role:filters.role,from:filters.from,to:filters.to,kinds:filters.kinds.join(','),per:8,...extra}))if(v!==''&&v!==undefined)p.set(k,String(v));return p.toString();};
 useEffect(()=>{
  setRes(null);setLocal([]);setError(null);if(q.trim().length<2)return;
  let alive=true;const controller=new AbortController(),mine=++tick.current;
  const timer=setTimeout(async()=>{
   setLoading(true);
   try{if(online){const d=await api('/workbench/find?'+qs(),{signal:controller.signal});if(alive&&mine===tick.current)setRes(d);}else{const d=await vault.search(q);if(alive)setLocal(d);}}
   catch(e){if(alive)setError(e);}finally{if(alive)setLoading(false);}
  },350);
  return()=>{alive=false;controller.abort();clearTimeout(timer);};
 },[q,filters.project,filters.provider,filters.status,filters.role,filters.from,filters.to,filters.kinds.join(','),online]);
 async function more(kind:string){
  setMoreBusy(kind);
  try{const group=res.groups.find((g:any)=>g.kind===kind),d=await api('/workbench/find?'+qs({kinds:kind,offset:group.items.length,per:20}));
   setRes((old:any)=>({...old,groups:old.groups.map((g:any)=>g.kind===kind?{...g,items:[...g.items,...(d.groups[0]?.items||[])],more:Boolean(d.next)}:g)}));}
  catch(e){setError(e);}finally{setMoreBusy('');}
 }
 async function openHit(h:any){
  if(h.kind==='imported'){try{const seq=Number(h.open.seq),d=await api(`/bridge/conversations/${h.open.bridge_conversation_id}?after=${Math.max(0,seq-6)}`);setReader({hit:h,conversation:d.conversation,items:d.items,next:d.next});}catch(e){setError(e);}return;}
  onOpen(h.open);onClose();
 }
 async function readerMore(){
  try{const last=reader.items[reader.items.length-1],d=await api(`/bridge/conversations/${reader.hit.open.bridge_conversation_id}?after=${last.seq}`);setReader({...reader,items:[...reader.items,...d.items].slice(-60),next:d.next});}catch(e){setError(e);}
 }
 const toggleKind=(k:string)=>setFilters(f=>({...f,kinds:f.kinds.includes(k)?f.kinds.filter(x=>x!==k):[...f.kinds,k]}));
 const active=[filters.project&&'projet',filters.provider&&'fournisseur',filters.status&&'statut',filters.role&&'rôle',(filters.from||filters.to)&&'dates',filters.kinds.length&&'types'].filter(Boolean) as string[];
 if(reader){
  const h=reader.hit;
  return <Modal title="Message dans son contexte" onClose={onClose}>
   <Button kind="text" onClick={()=>setReader(null)}>← Retour aux résultats</Button>
   <p className="muted"><strong>{reader.conversation?.title||h.title}</strong> · {h.provider} · conversation d’origine <code>{h.open.source_conversation}</code>{h.project_name?' · projet '+h.project_name:''}</p>
   <ErrorBox error={error}/>
   <div className="stack">{reader.items.map((m:any)=><div key={m.id} id={'hit-'+m.id} className={'panel'+(m.id===h.id?' message-focus':'')} ref={el=>{if(el&&m.id===h.id)el.scrollIntoView({block:'center'});}}>
    <small className="muted">{ROLE[m.role]||m.role}{m.original_date?' · '+date(m.original_date):' · date inconnue'}{m.id===h.id?' · message trouvé':''}</small>
    <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.content}</p></div>)}</div>
   {reader.next&&<Button kind="secondary" onClick={()=>void readerMore()}>Messages suivants</Button>}
   <p className="muted">Texte d’origine, non modifié. Identifiant du message : <code>{h.open.source_message}</code></p>
  </Modal>;
 }
 return <Modal title="Retrouver dans votre atelier" onClose={onClose}>
  <input type="search" autoFocus aria-label="Recherche globale" placeholder="Un mot, une phrase, un identifiant…" value={q} onChange={e=>setQ(e.target.value)}/>
  <details className="fold" open={showFilters} onToggle={e=>setShowFilters((e.target as HTMLDetailsElement).open)}><summary className="fold-summary"><strong>Filtres</strong><small className="muted">{active.length?active.join(', ')+' actif(s)':'aucun filtre'}</small></summary><div className="fold-body stack">
   <Field label="Projet"><select value={filters.project} onChange={e=>setFilters({...filters,project:e.target.value})}><option value="">Tous les projets</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
   <Field label="IA ou fournisseur d’origine"><select value={filters.provider} onChange={e=>setFilters({...filters,provider:e.target.value})}><option value="">Tous</option>{PROVIDERS.map(p=><option key={p} value={p}>{p}</option>)}</select></Field>
   <Field label="Statut"><select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">Tous</option>{['validated','proposed','superseded','rejected','open','answered','todo','in_progress','blocked','to_verify','done','to_give','given','response_received'].map(s=><option key={s} value={s}>{STATUS[s]}</option>)}</select></Field>
   <Field label="Auteur du message"><select value={filters.role} onChange={e=>setFilters({...filters,role:e.target.value})}><option value="">Tous</option><option value="user">Vous</option><option value="assistant">Assistant</option></select></Field>
   <div className="two-fields"><Field label="Du"><input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/></Field><Field label="Au"><input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/></Field></div>
   <fieldset><legend>Chercher dans</legend>{Object.entries(LABEL).map(([k,v])=><label className="check" key={k}><input type="checkbox" checked={filters.kinds.includes(k)} onChange={()=>toggleKind(k)}/>{v}</label>)}<small className="muted">Aucune case cochée = tous les types.</small></fieldset>
   {active.length>0&&<Button kind="text" onClick={()=>setFilters({project:'',provider:'',status:'',role:'',from:'',to:'',kinds:[]})}>Effacer les filtres</Button>}
  </div></details>
  <ErrorBox error={error}/>
  {loading&&<Loading/>}
  {q.trim().length>0&&q.trim().length<2&&<p className="muted">Saisissez au moins 2 caractères.</p>}
  {res&&!res.groups.length&&!loading&&<p className="muted">Aucun résultat pour « {q} » avec ces filtres. La recherche porte sur le texte exact (sans accent ni synonyme).</p>}
  {res&&res.skipped?.length>0&&<p className="muted">Non interrogé avec ces filtres : {res.skipped.map((s:any)=>LABEL[s.kind]+' ('+s.reason+')').join(' ; ')}.</p>}
  {res?.groups.map((g:any)=><section key={g.kind} className="search-group"><h4>{g.label} <small className="muted">({g.items.length}{g.more?'+':''})</small></h4>
   <div className="search-results">{g.items.map((h:any)=><button key={h.kind+h.id} onClick={()=>void openHit(h)}><strong>{h.title}</strong><small>{[h.project_name,h.provider,h.role&&ROLE[h.role],h.status&&(STATUS[h.status]||h.status),h.date&&date(h.date)].filter(Boolean).join(' · ')}</small><span>{h.excerpt}</span></button>)}</div>
   {g.more&&<Button kind="text" disabled={moreBusy===g.kind} onClick={()=>void more(g.kind)}>Voir plus de résultats</Button>}</section>)}
  {res&&<p className="muted">{res.notice}</p>}
  {!online&&<><p className="notice">Hors connexion : recherche limitée aux contenus déjà synchronisés sur cet appareil.</p>{local.map((r,i)=><details key={i}><summary>{r.source}</summary><pre>{JSON.stringify(r.value,null,2).slice(0,3000)}</pre></details>)}</>}
 </Modal>;
}
