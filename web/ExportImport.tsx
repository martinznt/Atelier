/* Inventaire d'un export personnel ChatGPT ou Claude. Le fichier est lu sur cet appareil : Atelier ne reçoit que l'empreinte,
   le manifeste et, si vous le demandez, les messages texte des conversations choisies (via la mémoire du projet). */
import {HistoryAnalysis} from './HistoryAnalysis';
import {ExportSummary,ArchiveFiles} from './ArchiveInfo';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api,post,patch,remove,date,bytes} from './api';
import {Button,Field,ErrorBox,Loading} from './ui';
import {inventoryArchive,indexArchiveFiles,readConversations,Cancelled,type Progress} from './archive-import.ts';
import {parseImport,batches} from '../passerelle/public/importers.mjs';

const PARSE:Record<string,string>={complete:'complète',partial:'partielle',error:'erreur',ignored:'écartée'};
const IMPORT:Record<string,string>={not_imported:'non importée',imported:'importée',partial:'import partiel'};

export function ExportImport({refresh}:{refresh:number}){
 const [batches_,setBatches]=useState<any[]|null>(null),[projects,setProjects]=useState<any[]>([]),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const source=useRef<{sha:string;file:File}|null>(null),cancel=useRef({aborted:false}),[prog,setProg]=useState<Progress|null>(null);
 const load=useCallback(()=>api('/exports').then(d=>setBatches(d.items)).catch(setError),[]);
 useEffect(()=>{void load();api('/projects').then(d=>setProjects(d.items)).catch(()=>{});},[load,refresh]);
 async function receive(file:File){
  setBusy(true);setError(null);setNotice('');cancel.current={aborted:false};
  try{
   const r=await inventoryArchive(file,{post,get:api},{signal:cancel.current,onProgress:setProg});
   source.current={sha:r.batch.sha256,file};
   const bad=r.segments.filter(x=>x.status!=='inventoried'),skipped=r.segments.filter(x=>x.skipped).length;
   setNotice((r.cancelled?'Inventaire interrompu : ce qui est enregistré est conservé, choisissez le même fichier pour reprendre. ':'')+(r.batch.resumed?'Même archive que l’inventaire existant (empreinte identique) : reprise'+(skipped?', '+skipped+' segment(s) déjà inventorié(s) non refaits':'')+'. ':'Inventaire créé. ')+r.segments.length+' fichier(s) de conversations, '+r.totals.conversations+' conversation(s) nouvelle(s), '+r.totals.messages+' message(s) texte, '+r.totals.branches+' embranchement(s), '+r.totals.attachment_refs+' pièce(s) jointe(s) référencée(s)'+(r.unrecognized?', '+r.unrecognized+' entrée(s) non reconnue(s)':'')+'.'+(bad.length?' À examiner : '+bad.map(x=>x.name+' ('+x.status+')').join(', ')+'.':'')+' L’archive d’origine reste sur votre appareil.');
   await load();
  }catch(e){setError(e instanceof Cancelled?new Error(e.message):e);}finally{setBusy(false);setProg(null);}
 }
 if(!batches_)return <><ErrorBox error={error}/><Loading/></>;
 return <div className="stack"><ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}{prog&&<div className="notice" role="status"><p>{prog.label}</p><progress value={prog.done} max={Math.max(1,prog.total)} aria-label="Progression"/><p className="muted">{prog.phase==='hash'?Math.round(prog.done/1048576)+' / '+Math.round(prog.total/1048576)+' Mo':prog.done+' / '+prog.total}</p><Button kind="secondary" onClick={()=>{cancel.current.aborted=true;}}>Annuler (la reprise reste possible)</Button></div>}
  <div className="panel stack"><strong>Recevoir un export</strong>
   <p className="muted">Choisissez l’archive ZIP de votre export ChatGPT (ou un fichier conversations.json), ou un export Claude. Les exports découpés (conversations-000.json, conversations-001.json…) sont reconnus. L’archive est lue ici, par morceaux, sur votre appareil : elle n’est ni envoyée ni conservée par Atelier. Gardez cet écran ouvert pendant l’opération : elle ne continue pas en arrière-plan.</p>
   <label className={'button'+(busy?' disabled':'')}>Choisir le fichier d’export<input type="file" accept=".zip,.json,application/zip,application/json" hidden disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void receive(f);e.target.value='';}}/></label>
   <p className="muted">Un export peut ne pas contenir toutes les conversations de votre compte. Les pièces jointes ne sont jamais reconstituées : elles sont comptées comme « référencées ».</p></div>
  {!batches_.length&&<p className="muted">Aucun export inventorié pour l’instant.</p>}
  {batches_.map(b=><BatchCard key={b.id} b={b} projects={projects} source={source} cancel={cancel} reload={load} setError={setError} setNotice={setNotice}/>)}
 </div>;
}

function BatchCard({b,projects,source,cancel,reload,setError,setNotice}:{b:any;projects:any[];source:React.MutableRefObject<{sha:string;file:File}|null>;cancel:React.MutableRefObject<{aborted:boolean}>;reload:()=>Promise<any>;setError:(e:unknown)=>void;setNotice:(s:string)=>void}){
 const [rows,setRows]=useState<any[]|null>(null),[next,setNext]=useState<number|null>(null),[q,setQ]=useState(''),[lot,setLot]=useState(''),[sel,setSel]=useState<string[]>([]),[project,setProject]=useState(''),[analyses,setAnalyses]=useState<any[]>([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[prev,setPrev]=useState<any>(null),[prog,setProg]=useState<Progress|null>(null);
 const [form,setForm]=useState({lot:'',kind:'independent',assistant:'',prompt_ref:'',report:''}),[reason,setReason]=useState('');
 const c=b.coverage;
 const load=useCallback(async(offset=0)=>{try{const d=await api(`/exports/${b.id}/conversations?q=${encodeURIComponent(q)}&lot=${lot}&limit=50&offset=${offset}`);setRows(old=>offset&&old?[...old,...d.items]:d.items);setNext(d.next);}catch(e){setError(e);}},[b.id,q,lot]);
 const [ai,setAi]=useState(false);
 const loadAnalyses=useCallback(()=>api(`/exports/${b.id}/analyses`).then(d=>setAnalyses(d.items)).catch(setError),[b.id]);
 const run=async(fn:()=>Promise<any>,ok='')=>{setBusy(true);setError(null);try{await fn();if(ok)setNotice(ok);await load();await reload();}catch(e){setError(e);}finally{setBusy(false);setProgress('');}};
 const toggle=(id:string)=>setSel(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
 /** Aperçu obligatoire : chiffres et dates de ce qui va être importé, calculés sur l'inventaire, avant tout envoi de message. */
 function previewSelected(){
  const chosen=(rows||[]).filter(r=>sel.includes(r.id));
  if(chosen.some(r=>!r.project_id||!r.project_confirmed))throw new Error('Confirmez d’abord le projet de chaque conversation cochée : un message n’est jamais importé dans un projet deviné.');
  const dates=chosen.map(r=>r.created_time).filter(Boolean).sort();
  setPrev({count:chosen.length,messages:chosen.reduce((n,r)=>n+r.message_count,0),already:chosen.filter(r=>r.import_status==='imported').length,branches:chosen.reduce((n,r)=>n+r.branch_count,0),refs:chosen.reduce((n,r)=>n+r.attachment_refs,0),first:dates[0]||null,last:dates[dates.length-1]||null,projects:[...new Set(chosen.map(r=>r.project_name||r.project_id))]});
 }
 /** Importe les messages texte des conversations cochées dans la mémoire de leur projet confirmé (import existant, sans doublon). */
 async function importSelected(){
  const src=source.current;
  if(!src||src.sha!==b.sha256)throw new Error('Pour importer des messages, choisissez de nouveau le même fichier d’export ci-dessus (même empreinte) : Atelier ne conserve pas l’archive.');
  const chosen=(rows||[]).filter(r=>sel.includes(r.id));
  if(chosen.some(r=>!r.project_id||!r.project_confirmed))throw new Error('Confirmez d’abord le projet de chaque conversation cochée : un message n’est jamais importé dans un projet deviné.');
  cancel.current={aborted:false};
  const raw=await readConversations(src.file,b.id,{post,get:api},chosen.map(r=>({source_id:r.source_id,segment:r.segment})),{signal:cancel.current});
  const parsed=parseImport(JSON.stringify(raw),'conversations.json');
  let done=0,missing=0;
  for(const r of chosen){
   if(cancel.current.aborted)throw new Cancelled();
   const conv=parsed.conversations.find((x:any)=>x.source_key===(b.provider+':'+r.source_id).slice(0,200));
   if(!conv){missing++;continue;}
   const space=await post(`/bridge/project/${r.project_id}`,{});
   for(const batch of batches(conv)){await post(`/bridge/spaces/${space.id}/import`,batch);}
   done++;setProgress(done+' / '+chosen.length+' conversation(s) importée(s)…');
  }
  await post(`/exports/${b.id}/refresh-imports`,{});setSel([]);setPrev(null);
  if(missing)throw new Error(done+' conversation(s) importée(s) ; '+missing+' sans message texte à importer.');
 }
 const lots=[...new Set(c.lots.detail.map((l:any)=>l.lot))] as string[];
 return <article className="panel"><h3>{b.filename}</h3>
  <p className="muted">{b.provider} · reçu le {date(b.received_at)} · {bytes(b.size)} · SHA-256 <code>{String(b.sha256).slice(0,16)}…</code>{b.stats?.zip_entries?' · '+b.stats.zip_entries+' entrée(s) dans l’archive':''}</p>
  <details className="fold" open><summary className="fold-summary"><strong>Bilan de couverture</strong><small className="muted">{c.complete?'inventaire complet du fichier':'inventaire ou lecture partiels'} · {c.conversations.inventoried}/{c.conversations.declared} conversations</small></summary><div className="fold-body">
   <ul className="plain">
    <li>Conversations : {c.conversations.complete} complètes, {c.conversations.partial} partielles, {c.conversations.error} en erreur, {c.conversations.ignored} écartées{c.conversations.missing_from_inventory?' ; '+c.conversations.missing_from_inventory+' non inventoriées':''}</li>
    <li>Messages texte : {c.messages.inventoried} inventoriés, {c.messages.imported} importés dans la mémoire</li>
    <li>Pièces jointes : {c.attachments.referenced} référencées{c.attachments.files_indexed?', '+c.attachments.in_archive+' retrouvées dans l’archive, '+c.attachments.referenced_only+' référencées seulement, '+c.attachments.ambiguous+' ambiguë(s) ; '+c.attachments.files_indexed+' fichier(s) indexé(s)':''}. {c.attachments.note}</li>
    <li>Projets : {c.projects.confirmed} confirmés, {c.projects.assigned-c.projects.confirmed} proposés, {c.projects.unassigned} sans projet</li>
    <li>Lots : {c.lots.total} ({c.lots.with_two_independent} avec deux analyses indépendantes, {c.lots.with_cross} croisés), {c.lots.without_lot} conversation(s) sans lot</li>
    <li>Imports : {c.imports.imported} importées, {c.imports.partial} partielles, {c.imports.not_imported} non importées</li></ul>
   <p className="notice">{c.warning}</p>
   {b.stats?.unrecognized>0&&<p className="muted">{b.stats.unrecognized} entrée(s) du fichier n’ont pas été reconnues comme des conversations.</p>}</div></details>
  <details className="fold"><summary className="fold-summary"><strong>Bilan chiffré et périodes</strong><small className="muted">dates réelles, comparaison inventaire / import</small></summary><div className="fold-body"><ExportSummary batch={b}/></div></details>
  <details className="fold"><summary className="fold-summary"><strong>Archive : segments et pièces jointes</strong><small className="muted">fichiers, types réels, empreintes</small></summary><div className="fold-body"><ArchiveFiles batch={b} source={source} cancel={cancel} reload={reload}/></div></details>
  <details className="fold" onToggle={e=>{if((e.target as HTMLDetailsElement).open&&!rows)void load();}}><summary className="fold-summary"><strong>Conversations et lots</strong><small className="muted">classer par projet, former les lots, importer les messages</small></summary><div className="fold-body stack">
   <div className="filter-row"><input type="search" aria-label="Rechercher une conversation" placeholder="Titre ou identifiant…" value={q} onChange={e=>setQ(e.target.value)}/>
    <select aria-label="Lot" value={lot} onChange={e=>setLot(e.target.value)}><option value="">Tous les lots</option>{lots.map(l=><option key={l} value={l}>{l}</option>)}</select></div>
   <div className="stack"><Button kind="secondary" disabled={busy} onClick={()=>void run(()=>post(`/exports/${b.id}/lots`,{max_messages:400}),'Lots formés : conversations entières, triées par date, 400 messages au plus par lot.')}>Former les lots (reproductibles)</Button>
    <Button kind="text" disabled={busy} onClick={()=>void run(()=>post(`/exports/${b.id}/refresh-imports`,{}),'Imports recomptés dans la mémoire.')}>Recompter les messages importés</Button></div>
   {progress&&<p className="notice" role="status">{progress}</p>}
   {rows?.map(r=><label className="check export-row" key={r.id}><input type="checkbox" checked={sel.includes(r.id)} onChange={()=>toggle(r.id)}/><span><strong>{r.title}</strong><br/><small className="muted">{r.created_time?date(r.created_time):'date inconnue'} · {r.message_count} message(s){r.branch_count?' · '+r.branch_count+' embranchement(s)':''}{r.attachment_refs?' · '+r.attachment_refs+' pièce(s) jointe(s) absente(s)':''} · lecture {PARSE[r.parse_status]} · {IMPORT[r.import_status]}{r.lot?' · '+r.lot:''} · {r.project_name?(r.project_name+(r.project_confirmed?'':' (proposé, à confirmer)')):'sans projet'}{r.parse_note?' — '+r.parse_note:''}</small></span></label>)}
   {next&&<Button kind="text" onClick={()=>void load(next)}>Conversations suivantes</Button>}
   {sel.length>0&&<div className="panel stack"><strong>{sel.length} conversation(s) cochée(s)</strong>
    <Field label="Projet"><select value={project} onChange={e=>setProject(e.target.value)}><option value="">Aucun</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    <Button kind="secondary" disabled={busy} onClick={()=>void run(()=>patch(`/exports/${b.id}/conversations`,{ids:sel,project_id:project||null,project_confirmed:Boolean(project)}),'Projet confirmé pour ces conversations.')}>Confirmer ce projet pour la sélection</Button>
    {!prev?<Button disabled={busy} onClick={()=>{try{previewSelected();}catch(e){setError(e);}}}>Aperçu de l’import…</Button>:<div className="panel stack"><strong>Aperçu avant import</strong><p>{prev.count} conversation(s) · {prev.messages} message(s) texte · {prev.branches} embranchement(s) conservé(s) · {prev.refs} pièce(s) jointe(s) référencée(s), non importée(s){prev.already?' · '+prev.already+' déjà importée(s) (aucun doublon créé)':''}</p><p className="muted">Période : {prev.first?date(prev.first):'inconnue'} → {prev.last?date(prev.last):'inconnue'} · Projet(s) : {prev.projects.join(', ')}</p><p className="muted">Les messages gardent leur identifiant, leur date et leur auteur d’origine. Rien n’est supprimé ; l’original reste dans votre archive.</p><div className="stack"><Button disabled={busy} onClick={()=>void run(importSelected,'Messages texte importés dans la mémoire des projets confirmés. Comparez les nombres dans le bilan chiffré.')}>Confirmer et importer</Button><Button kind="text" onClick={()=>setPrev(null)}>Annuler</Button></div></div>}
    <Field label="Raison d’écarter (obligatoire pour écarter)"><input value={reason} maxLength={300} onChange={e=>setReason(e.target.value)}/></Field>
    <Button kind="text" disabled={busy||!reason.trim()} onClick={()=>void run(async()=>{await patch(`/exports/${b.id}/conversations`,{ids:sel,ignore:true,reason});setReason('');setSel([]);},'Conversations écartées, avec leur raison.')}>Écarter la sélection</Button></div>}
  </div></details>
  <details className="fold" onToggle={e=>{if((e.target as HTMLDetailsElement).open)setAi(true);}}><summary className="fold-summary"><strong>Analyse par vos IA (Gemini, Groq, Mistral)</strong><small className="muted">pas à pas, avec relais, pause sur limite et reprise</small></summary><div className="fold-body">{ai&&<HistoryAnalysis batchId={b.id} lots={(c.lots?.detail||[]).map((l:any)=>l.lot).filter(Boolean)}/>}</div></details>
  <details className="fold" onToggle={e=>{if((e.target as HTMLDetailsElement).open)void loadAnalyses();}}><summary className="fold-summary"><strong>Analyses par assistant</strong><small className="muted">rapports séparés, collés par vous ; croisement après deux analyses indépendantes</small></summary><div className="fold-body stack">
   <p className="muted">Atelier n’envoie rien à ChatGPT, Claude, Gemini ou Mistral : vous donnez le lot à l’assistant, puis vous collez son rapport ici. Ne montrez pas à un assistant le rapport de l’autre avant sa première analyse.</p>
   {analyses.map(a=><details key={a.id}><summary>{a.lot} · {a.kind==='independent'?'analyse indépendante':a.kind==='cross'?'croisement':'troisième regard'} · {a.assistant} · {date(a.created_at)}</summary><pre className="handoff-preview">{a.report}</pre><Button kind="text danger" onClick={()=>void remove(`/exports/analyses/${a.id}`).then(loadAnalyses).then(reload).catch(setError)}>Supprimer ce rapport</Button></details>)}
   <Field label="Lot"><select value={form.lot} onChange={e=>setForm({...form,lot:e.target.value})}><option value="">Choisir</option>{lots.map(l=><option key={l} value={l}>{l}</option>)}</select></Field>
   <Field label="Nature"><select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="independent">Analyse indépendante</option><option value="cross">Croisement contradictoire</option><option value="third">Troisième regard</option></select></Field>
   <Field label="Assistant"><input value={form.assistant} maxLength={80} onChange={e=>setForm({...form,assistant:e.target.value})}/></Field>
   <Field label="Prompt utilisé (identifiant et version)"><input value={form.prompt_ref} maxLength={120} onChange={e=>setForm({...form,prompt_ref:e.target.value})}/></Field>
   <Field label="Rapport"><textarea rows={5} value={form.report} maxLength={100000} onChange={e=>setForm({...form,report:e.target.value})}/></Field>
   <Button kind="secondary" disabled={busy||!form.lot||!form.assistant.trim()||!form.report.trim()} onClick={()=>void run(async()=>{await post(`/exports/${b.id}/analyses`,form);setForm({...form,assistant:'',report:''});await loadAnalyses();},'Rapport enregistré.')}>Enregistrer le rapport</Button>
  </div></details>
  <Button kind="text danger" disabled={busy} onClick={()=>{if(window.confirm('Retirer cet inventaire ? Les messages déjà importés dans la mémoire restent en place.'))void run(()=>remove(`/exports/${b.id}`),'Inventaire retiré.');}}>Retirer cet inventaire</Button>
 </article>;
}
