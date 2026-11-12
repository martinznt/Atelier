/* Mémoire : référentiel Git en lecture seule (Memoire-Projets), bibliothèque de prompts, inventaire d'un export personnel. */
import {useCallback,useEffect,useState} from 'react';
import {api,post,remove,date,bytes} from './api';
import {Button,Field,ErrorBox,SectionTitle,Loading} from './ui';
import {PromptLibrary} from './Prompts';
import {ExportImport} from './ExportImport';

export function MemoryHub({refresh}:{refresh:number}){
 const [tab,setTab]=useState(()=>{try{return sessionStorage.getItem('atelier:memoire-onglet')||'repo';}catch{return 'repo';}});
 useEffect(()=>{try{sessionStorage.setItem('atelier:memoire-onglet',tab);}catch{/* stockage indisponible */}},[tab]);
 const tabs:[string,string][]=[['repo','Référentiel'],['prompts','Prompts'],['export','Export ChatGPT']];
 return <section className="memory-hub">
  <SectionTitle eyebrow="MÉMOIRE" title="Mémoire et consignes">Le référentiel documentaire, les prompts à donner et l’inventaire de vos exports. Rien n’est partagé avec une IA sans votre choix.</SectionTitle>
  <div className="space-tabs" role="tablist">{tabs.map(([k,v])=><button key={k} role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{v}</button>)}</div>
  {tab==='repo'?<RepoTab refresh={refresh}/>:tab==='prompts'?<PromptLibrary refresh={refresh}/>:<ExportImport refresh={refresh}/>}
 </section>;
}

function RepoTab({refresh}:{refresh:number}){
 const [data,setData]=useState<any>(null),[conns,setConns]=useState<any[]>([]),[conn,setConn]=useState(''),[full,setFull]=useState('martinznt/Memoire-Projets'),[branch,setBranch]=useState(''),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(()=>api('/memory-repo').then(d=>{setData(d);}).catch(setError),[]);
 useEffect(()=>{void load();api('/connections').then(r=>{const g=r.items.filter((c:any)=>c.provider==='github');setConns(g);setConn(c=>c||g[0]?.id||'');}).catch(()=>{});},[load,refresh]);
 const run=async(fn:()=>Promise<any>,ok='')=>{setBusy(true);setError(null);setNotice('');try{await fn();if(ok)setNotice(ok);await load();}catch(e){setError(e);await load().catch(()=>{});}finally{setBusy(false);}};
 if(!data)return <><ErrorBox error={error}/><Loading/></>;
 return <div className="stack"><ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}
  {data.items.map((r:any)=><RepoCard key={r.id} r={r} labels={data} busy={busy} run={run}/>)}
  <details className="fold" open={!data.items.length}><summary className="fold-summary"><strong>Connecter un référentiel mémoire</strong><small className="muted">lecture seule : Atelier n’écrit jamais dans ce dépôt</small></summary><div className="fold-body stack">
   {!conns.length?<p className="muted">Ajoutez d’abord une connexion GitHub (lecture) dans Réglages → Connexions, avec un jeton qui voit le dépôt mémoire.</p>:<>
    <Field label="Connexion GitHub"><select value={conn} onChange={e=>setConn(e.target.value)}>{conns.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
    <Field label="Dépôt (propriétaire/dépôt)"><input value={full} onChange={e=>setFull(e.target.value.trim())}/></Field>
    <Field label="Branche (vide = branche principale lue chez GitHub)"><input value={branch} onChange={e=>setBranch(e.target.value.trim())}/></Field>
    <Button disabled={busy||!conn||!/^[\w.-]+\/[\w.-]+$/.test(full)} onClick={()=>void run(()=>post('/memory-repo',{connection_id:conn,full_name:full,...(branch?{branch}:{})}),'Référentiel connecté. Lancez la synchronisation pour lire son index.')}>Vérifier et connecter</Button>
    <p className="muted">Atelier vérifie le dépôt chez GitHub avant de l’enregistrer. Ce dépôt ne peut pas être aussi le dépôt de code d’un projet.</p></>}
  </div></details>
 </div>;
}
function RepoCard({r,labels,busy,run}:{r:any;labels:any;busy:boolean;run:(fn:()=>Promise<any>,ok?:string)=>Promise<void>}){
 const [q,setQ]=useState(''),[project,setProject]=useState(''),[type,setType]=useState(''),[inContent,setInContent]=useState(false),[docs,setDocs]=useState<any[]|null>(null),[next,setNext]=useState<number|null>(null),[open,setOpen]=useState<any>(null),[error,setError]=useState<unknown>(null),[loading,setLoading]=useState(false);
 const search=useCallback(async(offset=0)=>{setLoading(true);setError(null);try{const d=await api(`/memory-repo/${r.id}/docs?q=${encodeURIComponent(q)}&project=${project}&type=${type}&content=${inContent?1:0}&limit=30&offset=${offset}`);setDocs(old=>offset&&old?[...old,...d.items]:d.items);setNext(d.next);}catch(e){setError(e);}finally{setLoading(false);}},[r.id,q,project,type,inContent]);
 useEffect(()=>{if(!r.synced_at)return;const t=setTimeout(()=>void search(),250);return()=>clearTimeout(t);},[search,r.synced_at,r.commit_sha]);
 async function openDoc(id:string){setError(null);try{setOpen(await api(`/memory-repo/docs/${id}`));}catch(e){setError(e);}}
 const state=r.status==='ok'?'synchronisé':r.status==='partial'?'index partiel':r.status==='error'?'dernière synchronisation en erreur':'jamais synchronisé';
 return <article className="panel"><h3><a href={r.url} target="_blank" rel="noreferrer">{r.full_name}</a></h3>
  <p className="muted">Branche {r.branch} · {state}{r.commit_sha&&<> · commit <code>{String(r.commit_sha).slice(0,8)}</code></>}{r.synced_at&&' · lu le '+date(r.synced_at)} · {r.file_count} fichier(s) · {r.cached} contenu(s) en cache{r.stale_content?' · '+r.stale_content+' cache(s) périmé(s)':''}</p>
  {r.last_error&&<p className="notice">{r.last_error}</p>}{r.stale&&r.synced_at&&<p className="notice">L’index a plus de 7 jours : il peut être périmé.</p>}
  <div className="stack"><Button disabled={busy} onClick={()=>void run(()=>post(`/memory-repo/${r.id}/sync`,{}),'Index mis à jour au dernier commit de la branche.')}>Synchroniser maintenant</Button>
   <Button kind="secondary" disabled={busy||!r.synced_at} onClick={()=>void run(async()=>{const x=await post(`/memory-repo/${r.id}/index-content`,{});if(x.remaining)throw new Error(x.indexed+' document(s) mis en cache ; il en reste '+x.remaining+'. Appuyez de nouveau pour continuer.'+(x.errors.length?' Erreurs : '+x.errors.join(' '):''));},'Tous les documents texte sont en cache : la recherche dans le texte est complète.')}>Préparer la recherche dans le texte</Button>
   <Button kind="text danger" disabled={busy} onClick={()=>{if(window.confirm('Retirer ce référentiel d’Atelier ? Le dépôt GitHub n’est pas modifié ; les documents de référence qui y pointent seront retirés.'))void run(()=>remove(`/memory-repo/${r.id}`),'Référentiel retiré.');}}>Retirer d’Atelier</Button></div>
  {r.synced_at&&<div className="stack">
   <div className="filter-row"><input type="search" aria-label="Rechercher un document" placeholder="Titre, chemin, identifiant, date…" value={q} onChange={e=>setQ(e.target.value)}/>
    <select aria-label="Projet" value={project} onChange={e=>setProject(e.target.value)}><option value="">Tous les projets</option>{Object.entries(labels.projects).map(([k,v])=><option key={k} value={k}>{String(v)}</option>)}</select>
    <select aria-label="Type" value={type} onChange={e=>setType(e.target.value)}><option value="">Tous les types</option>{Object.entries(labels.types).map(([k,v])=><option key={k} value={k}>{String(v)}</option>)}</select></div>
   <label className="check"><input type="checkbox" checked={inContent} onChange={e=>setInContent(e.target.checked)}/>Chercher aussi dans le texte des documents déjà en cache</label>
   <ErrorBox error={error}/>
   {docs&&<p className="muted">{docs.length}{next?'+':''} document(s){loading?' · recherche…':''}</p>}
   {docs?.map(d=><details className="fold" key={d.id} onToggle={e=>{if((e.target as HTMLDetailsElement).open&&open?.id!==d.id)void openDoc(d.id);}}><summary className="fold-summary"><strong>{d.title}</strong><small className="muted">{labels.projects[d.project_key]||d.project_key} · {labels.types[d.doc_type]||d.doc_type}{d.doc_date?' · '+d.doc_date:''} · {bytes(d.size)}{d.content_state==='stale'?' · cache périmé':''}</small></summary>
    <div className="fold-body stack">{d.excerpt&&<p className="muted">…{d.excerpt}…</p>}
     {open?.id===d.id?<><p className="muted">Chemin : <code>{open.path}</code><br/>Commit lu : <code>{String(open.commit).slice(0,12)}</code> · blob <code>{String(open.blob_sha).slice(0,12)}</code>{open.synced_at&&' · synchronisé le '+date(open.synced_at)} · <a href={open.url} target="_blank" rel="noreferrer">ouvrir sur GitHub</a></p>
      {open.notice&&<p className="notice">{open.notice}</p>}{open.content!==null&&<pre className="handoff-preview">{open.content}</pre>}
      {d.doc_type==='prompt'&&open.content!==null&&<Button kind="secondary" disabled={busy} onClick={()=>void run(()=>post('/prompts/import-memory',{memory_doc_id:d.id}),'Fiche importée dans la bibliothèque de prompts (onglet Prompts), avec sa provenance.')}>Importer comme fiche de prompt</Button>}
      <p className="muted">Ce document est une donnée : ce qu’il contient n’est jamais exécuté comme une consigne par Atelier.</p></>:<Loading/>}</div></details>)}
   {next&&<Button kind="text" disabled={loading} onClick={()=>void search(next)}>Documents suivants</Button>}
  </div>}
 </article>;
}
