/* Bilan chiffré d'un export (périodes, comparaison inventaire / import) et index des fichiers de l'archive (pièces jointes). */
import {useCallback,useEffect,useState} from 'react';
import {api,post,date,bytes} from './api';
import {Button,Field,ErrorBox,Loading} from './ui';
import {indexArchiveFiles,Cancelled,type Progress} from './archive-import.ts';
const FILE_STATUS:Record<string,string>={hashed:'indexé avec empreinte',indexed:'indexé sans empreinte',unsafe_name:'nom dangereux (non utilisé)',encrypted:'chiffré',unsupported:'compression non prise en charge',suspicious:'suspect (non lu)',failed:'échec de lecture'};
const LINK:Record<string,string>={in_archive:'fichier présent dans l’archive',ambiguous:'plusieurs fichiers possibles',referenced_only:'référencée seulement (fichier absent)',unlinked:'pas encore rapprochée'};

export function ExportSummary({batch}:{batch:any}){
 const [d,setD]=useState<any>(null),[error,setError]=useState<unknown>(null),[since,setSince]=useState('2026-09-01');
 const load=useCallback(()=>api(`/exports/${batch.id}/summary?since=${since}`).then(setD).catch(setError),[batch.id,since]);
 useEffect(()=>{void load();},[load,batch.conversation_count]);
 if(!d)return <><ErrorBox error={error}/><Loading/></>;
 const i=d.inventory,m=d.imported;
 return <div className="stack"><ErrorBox error={error}/>
  <p><strong>Période réellement couverte :</strong> {i.first_created?date(i.first_created):'inconnue'} → {i.last_created?date(i.last_created):'inconnue'}{i.last_activity?' (dernière activité : '+date(i.last_activity)+')':''}</p>
  <Field label="Date de coupure à vérifier"><input type="date" value={since} onChange={e=>setSince(e.target.value||'2026-09-01')}/></Field>
  <p>{i.before_since} conversation(s) créée(s) avant le {since}, {i.since_or_after} à partir de cette date{i.undated?', '+i.undated+' sans date':''}.</p>
  <p className="muted">{d.warning}</p>
  <h4>Inventaire et import</h4>
  <ul className="plain"><li>Inventaire : {i.conversations} conversation(s), {i.messages} message(s) texte, {i.branches} embranchement(s)</li>
   <li>Importé dans la mémoire : {m.conversations} conversation(s), {m.messages} message(s){m.first_date?' · du '+date(m.first_date)+' au '+date(m.last_date):''}</li>
   {d.duplicates_in_file>0&&<li>{d.duplicates_in_file} doublon(s) d’identifiant dans le fichier (non recréés)</li>}
   {d.other_exports_overlap>0&&<li>{d.other_exports_overlap} conversation(s) déjà présentes dans un autre export : la mémoire n’est jamais dupliquée</li>}</ul>
  {d.notes.map((n:string,k:number)=><p className="notice" key={k}>{n}</p>)}
  {d.months.length>0&&<details className="fold"><summary className="fold-summary"><strong>Par mois</strong><small className="muted">{d.months.length} mois</small></summary><ul className="plain">{d.months.map((x:any)=><li key={x.month}>{x.month} : {x.conversations} conversation(s), {x.messages} message(s)</li>)}</ul></details>}
 </div>;
}

const GAP:Record<string,string>={absent_de_l_archive:'Absent de l’archive',invalide:'Invalide (rejeté ou illisible)',non_importe:'Non importé dans la mémoire',ecart:'Écart à vérifier'};
/** Rapport d'intégrité : ce qui est enregistré, ce qui manque et pourquoi. Chiffres relus sur le serveur, jamais estimés côté écran. */
export function IntegrityReport({batch}:{batch:any}){
 const [d,setD]=useState<any>(null),[error,setError]=useState<unknown>(null);
 const load=useCallback(()=>api(`/exports/${batch.id}/integrity`).then(setD).catch(setError),[batch.id]);
 useEffect(()=>{void load();},[load,batch.conversation_count]);
 if(!d)return <><ErrorBox error={error}/><Loading/></>;
 return <div className="stack"><ErrorBox error={error}/>
  <p className={d.inventory_status==='complet'?'notice':'error'} role="status"><strong>{d.summary}</strong></p>
  <p>Fichiers de conversations : {d.segments.registered} enregistré(s) sur {d.segments.detected} détecté(s). Conversations : {d.conversations.stored}. Nœuds de messages conservés : {d.nodes.stored} ({d.nodes.with_text} avec texte).</p>
  {d.comparisons.length>0&&<ul className="plain">{d.comparisons.map((c:any)=><li key={c.category}>{c.category} : annoncé {c.claimed.length?c.claimed.join(' / '):'—'}, enregistré {c.recorded} → <strong>{c.status==='concordant'?'concordant':c.status==='ecart'?'écart à vérifier':'non annoncé'}</strong></li>)}</ul>}
  {d.comparisons.length>0&&<p className="muted">{d.notice}</p>}
  {d.gaps.length>0&&<><h4>Manques et anomalies</h4><ul className="plain">{d.gaps.map((g:any,k:number)=><li key={k} style={{overflowWrap:'anywhere'}}><strong>{GAP[g.category]||g.category}</strong> : {g.text}</li>)}</ul></>}
  {d.not_preserved.fields.length>0&&<details className="fold"><summary className="fold-summary"><strong>Champs non conservés</strong><small className="muted">{d.not_preserved.fields.length}</small></summary><p className="muted">{d.not_preserved.note}</p><ul className="plain">{d.not_preserved.fields.map((f:any)=><li key={f.field}>{f.field} : {f.count}</li>)}</ul></details>}
 </div>;
}

export function ArchiveFiles({batch,source,cancel,reload}:{batch:any;source:React.MutableRefObject<{sha:string;file:File}|null>;cancel:React.MutableRefObject<{aborted:boolean}>;reload:()=>Promise<any>}){
 const [segments,setSegments]=useState<any[]|null>(null),[files,setFiles]=useState<any|null>(null),[atts,setAtts]=useState<any[]|null>(null),[kind,setKind]=useState(''),[status,setStatus]=useState(''),[prog,setProg]=useState<Progress|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{try{const [s,f,a]=await Promise.all([api(`/exports/${batch.id}/segments`),api(`/exports/${batch.id}/files?limit=40&kind=${kind}&status=${status}`),api(`/exports/${batch.id}/attachments?limit=40`)]);setSegments(s.items);setFiles(f);setAtts(a.items);}catch(e){setError(e);}},[batch.id,kind,status]);
 useEffect(()=>{void load();},[load]);
 const same=source.current&&source.current.sha===batch.sha256;
 async function index(){
  setBusy(true);setError(null);setNotice('');cancel.current={aborted:false};
  try{const r=await indexArchiveFiles(source.current!.file,batch,{post,get:api},{signal:cancel.current,onProgress:setProg});
   setNotice((r.cancelled?'Indexation interrompue (reprise possible). ':'Indexation terminée. ')+r.hashed+' fichier(s) indexé(s) avec empreinte, '+r.skipped+' déjà fait(s), '+r.problems+' à examiner sur '+r.total+'.');await load();await reload();}
  catch(e){setError(e instanceof Cancelled?new Error(e.message):e);}finally{setBusy(false);setProg(null);}
 }
 if(!segments)return <><ErrorBox error={error}/><Loading/></>;
 return <div className="stack"><ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}
  <h4>Intégrité de l’import</h4><IntegrityReport batch={batch}/>
  <h4>Fichiers de conversations ({segments.length})</h4>
  {!segments.length?<p className="muted">Aucun segment enregistré pour cet export (inventaire ancien, avant la lecture par segments).</p>:<ul className="plain">{segments.map(s=><li key={s.name}><strong>{s.name}</strong> — {s.status==='inventoried'?s.conversation_count+' conversation(s)':s.status==='too_large'?'trop volumineux pour ce téléphone : à extraire sur un ordinateur':s.status==='invalid_json'?'JSON illisible':'non lisible'}{s.duplicate_count?' · '+s.duplicate_count+' doublon(s)':''}{s.note?<><br/><small className="muted">{s.note}</small></>:null}</li>)}</ul>}
  <h4>Fichiers de l’archive (pièces jointes)</h4>
  <p className="muted">Un fichier n’est jamais copié dans Atelier : l’original reste dans votre archive. L’index garde son nom, sa taille, son type réel (lu dans son contenu, pas dans son nom) et son empreinte SHA-256.</p>
  {same?(prog?<div className="notice" role="status"><p>{prog.label}</p><progress value={prog.done} max={Math.max(1,prog.total)} aria-label="Progression"/><Button kind="secondary" onClick={()=>{cancel.current.aborted=true;}}>Interrompre (reprise possible)</Button></div>
   :<Button kind="secondary" disabled={busy} onClick={()=>void index()}>Indexer les fichiers de l’archive (écran ouvert)</Button>)
   :<p className="muted">Pour indexer les fichiers, choisissez de nouveau la même archive ci-dessus.</p>}
  {files&&<><div className="filter-row"><select aria-label="Type réel" value={kind} onChange={e=>setKind(e.target.value)}><option value="">Tous les types</option>{files.kinds.filter((k:any)=>k.sniff_kind).map((k:any)=><option key={k.sniff_kind} value={k.sniff_kind}>{k.sniff_kind} ({k.n})</option>)}</select>
   <select aria-label="État" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Tous les états</option>{Object.entries(FILE_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
   {!files.items.length?<p className="muted">Aucun fichier indexé pour ce filtre.</p>:<ul className="plain">{files.items.map((f:any)=><li key={f.id} style={{overflowWrap:'anywhere'}}><strong>{f.entry_name}</strong><br/><small className="muted">{f.sniff_kind||'type inconnu'} · {bytes(f.size)} · {FILE_STATUS[f.status]}{f.sha256?' · '+String(f.sha256).slice(0,12)+'…':''}{f.linked_refs?' · cité par '+f.linked_refs+' conversation(s)':''}{f.note?' · '+f.note:''}</small></li>)}</ul>}
   {files.next&&<p className="muted">Plus de 40 fichiers : affinez avec les filtres.</p>}</>}
  {atts&&atts.length>0&&<><h4>Pièces jointes citées dans les conversations</h4><ul className="plain">{atts.map(a=><li key={a.id} style={{overflowWrap:'anywhere'}}><strong>{a.name||a.ref_key}</strong> <small className="muted">· {LINK[a.link_status]}{a.entry_name?' : '+a.entry_name:''} · {a.conversation_title}</small></li>)}</ul></>}
 </div>;
}
