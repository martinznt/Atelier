/* Compléments de l'espace projet : documents de référence, synthèse de reprise, journal, audit de référence, consignes. */
import {useCallback,useEffect,useState} from 'react';
import {api,post,patch,remove,date,download} from './api';
import {Button,Field,ErrorBox,Loading} from './ui';
export function Fold({title,summary,open,children,onOpen}:{title:string;summary?:string;open?:boolean;children:React.ReactNode;onOpen?:()=>void}){
 return <details className="fold" open={open} onToggle={e=>{if((e.target as HTMLDetailsElement).open)onOpen?.();}}><summary className="fold-summary"><strong>{title}</strong>{summary&&<small className="muted">{summary}</small>}</summary><div className="fold-body">{children}</div></details>;
}
const DOC_TYPE:Record<string,string>={vision:'Vision',cahier:'Cahier des charges',exigences:'Exigences',architecture:'Architecture',decisions:'Décisions',problemes:'Problèmes connus',questions:'Questions ouvertes',reference:'Fichier de référence',audit:'Audit',rapport:'Rapport',consigne:'Consigne',test:'Rapport de tests',autre:'Autre'};
const RELIABILITY:Record<string,string>={user_confirmed:'Confirmé par vous',verified:'Vérifié directement',reported:'Rapporté, non reproduit',deduced:'Déduit',ai_proposed:'Proposé par une IA',to_confirm:'À confirmer',superseded:'Remplacé ou obsolète',unverified:'Non vérifié'};
const READ:Record<string,string>={full:'Lu intégralement',segments:'Lu par segments',metadata:'Métadonnées seulement',tool:'Analysé par outil',excluded:'Exclu (motif)',failed:'Échec de lecture',not_started:'Non commencé'};
const CI:Record<string,string>={success:'réussi',failure:'échec',pending:'en attente',unknown:'inconnu'};

export function DocumentsSection({id}:{id:string}){
 const [docs,setDocs]=useState<any[]|null>(null),[files,setFiles]=useState<any[]>([]),[mem,setMem]=useState<any[]>([]),[repos,setRepos]=useState<any[]>([]),[mq,setMq]=useState(''),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({title:'',doc_type:'reference',source_kind:'file',file_id:'',memory_doc_id:'',url:'',version_label:'',reliability:'unverified',origin:''});
 const load=useCallback(()=>api(`/workbench/documents?project=${id}`).then(d=>setDocs(d.items)).catch(setError),[id]);
 const start=()=>{void load();api(`/files?project=${id}`).then(r=>setFiles(r.items||[])).catch(()=>{});api('/memory-repo').then(r=>setRepos(r.items)).catch(()=>{});};
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(form.source_kind!=='memory_doc'||!repos[0])return;const t=setTimeout(()=>api(`/memory-repo/${repos[0].id}/docs?q=${encodeURIComponent(mq)}&limit=30`).then(r=>setMem(r.items)).catch(()=>{}),250);return()=>clearTimeout(t);},[mq,form.source_kind,repos]);
 const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError(null);try{await fn();await load();}catch(e){setError(e);}finally{setBusy(false);}};
 const groups=new Map<string,any[]>();for(const d of docs||[])groups.set(d.doc_type,[...(groups.get(d.doc_type)||[]),d]);
 return <Fold title="Dossier documentaire" summary={docs?docs.length+' document(s) de référence':'…'} onOpen={start}>
  <ErrorBox error={error}/>
  {!docs?<Loading/>:!docs.length&&<p className="muted">Aucun document de référence. Reliez ici le cahier des charges, l’architecture, les audits ou les rapports du projet.</p>}
  {[...groups.entries()].map(([type,list])=><div key={type}><h4>{DOC_TYPE[type]||type}</h4>{list.map(d=><details className="fold" key={d.id}><summary className="fold-summary"><strong>{d.title}</strong><small className="muted">{RELIABILITY[d.reliability]}{d.version_label?' · '+d.version_label:''} · {d.source_kind==='file'?'bibliothèque':d.source_kind==='memory_doc'?'référentiel mémoire':'lien'}</small></summary><div className="fold-body stack">
    {d.source_kind==='file'&&<p className="muted">Fichier « {d.file_name} » · version {d.file_version} · modifié le {d.file_updated_at?date(d.file_updated_at):'?'}{d.file_sha256&&<> · sha256 <code>{String(d.file_sha256).slice(0,12)}…</code></>} · à ouvrir dans Fichiers</p>}
    {d.source_kind==='memory_doc'&&<p className="muted">{d.memory_repo} · <code>{d.memory_path}</code> · commit <code>{String(d.memory_commit||'').slice(0,8)}</code> · blob <code>{String(d.memory_blob_sha||'').slice(0,8)}</code>{d.memory_synced_at&&' · synchronisé le '+date(d.memory_synced_at)}{!d.memory_present&&' · ce fichier n’est plus dans le dépôt'} · à lire dans Mémoire</p>}
    {d.source_kind==='url'&&<p><a href={d.url} target="_blank" rel="noreferrer">{d.url}</a> <span className="muted">(référence externe : contenu non conservé par Atelier)</span></p>}
    {d.origin&&<p className="muted">Origine : {d.origin}</p>}{d.note&&<p>{d.note}</p>}
    <Field label="Fiabilité"><select value={d.reliability} onChange={e=>void run(()=>patch(`/workbench/documents/${d.id}`,{reliability:e.target.value}))}>{Object.entries(RELIABILITY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
    <Button kind="text danger" disabled={busy} onClick={()=>void run(()=>remove(`/workbench/documents/${d.id}`))}>Retirer du dossier (le fichier n’est pas supprimé)</Button></div></details>)}</div>)}
  <details className="fold"><summary className="fold-summary"><strong>Ajouter un document de référence</strong><small className="muted">depuis la bibliothèque, le référentiel mémoire ou un lien</small></summary><div className="fold-body stack">
   <Field label="Titre"><input value={form.title} maxLength={200} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
   <Field label="Type"><select value={form.doc_type} onChange={e=>setForm({...form,doc_type:e.target.value})}>{Object.entries(DOC_TYPE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Source"><select value={form.source_kind} onChange={e=>setForm({...form,source_kind:e.target.value})}><option value="file">Fichier de la bibliothèque du projet</option><option value="memory_doc">Document du référentiel mémoire</option><option value="url">Lien externe (https)</option></select></Field>
   {form.source_kind==='file'&&<Field label="Fichier" hint={files.length?undefined:'Aucun fichier dans la bibliothèque de ce projet : ajoutez-le d’abord dans Fichiers.'}><select value={form.file_id} onChange={e=>setForm({...form,file_id:e.target.value,title:form.title||files.find(f=>f.id===e.target.value)?.name||''})}><option value="">Choisir</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
   {form.source_kind==='memory_doc'&&(!repos.length?<p className="muted">Connectez et synchronisez d’abord le référentiel dans Mémoire.</p>:<><Field label="Chercher dans le référentiel"><input type="search" value={mq} onChange={e=>setMq(e.target.value)} placeholder="Titre ou chemin…"/></Field>
    <Field label="Document"><select value={form.memory_doc_id} onChange={e=>setForm({...form,memory_doc_id:e.target.value,title:form.title||mem.find(m=>m.id===e.target.value)?.title||''})}><option value="">Choisir</option>{mem.map(m=><option key={m.id} value={m.id}>{m.path}</option>)}</select></Field></>)}
   {form.source_kind==='url'&&<Field label="Adresse https://"><input value={form.url} maxLength={400} onChange={e=>setForm({...form,url:e.target.value.trim()})}/></Field>}
   <Field label="Version ou SHA (si connu)"><input value={form.version_label} maxLength={80} onChange={e=>setForm({...form,version_label:e.target.value})}/></Field>
   <Field label="Fiabilité"><select value={form.reliability} onChange={e=>setForm({...form,reliability:e.target.value})}>{Object.entries(RELIABILITY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Origine (auteur, date, assistant)"><input value={form.origin} maxLength={300} onChange={e=>setForm({...form,origin:e.target.value})}/></Field>
   <Button disabled={busy||!form.title.trim()||(form.source_kind==='file'&&!form.file_id)||(form.source_kind==='memory_doc'&&!form.memory_doc_id)||(form.source_kind==='url'&&!/^https:\/\//.test(form.url))} onClick={()=>void run(async()=>{await post('/workbench/documents',{project_id:id,title:form.title.trim(),doc_type:form.doc_type,source_kind:form.source_kind,file_id:form.file_id||null,memory_doc_id:form.memory_doc_id||null,url:form.url||null,version_label:form.version_label,reliability:form.reliability,origin:form.origin});setForm({...form,title:'',file_id:'',memory_doc_id:'',url:'',version_label:'',origin:''});})}>Ajouter au dossier</Button>
  </div></details>
 </Fold>;
}

export function ResumeSection({id}:{id:string}){
 const [text,setText]=useState<string|null>(null),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState('');
 const load=()=>api(`/workbench/resume?project=${id}`).then(d=>{setText(d.text);setError(null);}).catch(setError);
 return <Fold title="Synthèse de reprise" summary="état, décisions, questions, prochaine action — sans résumé IA" onOpen={()=>{if(text===null)void load();}}>
  <ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}
  {text===null?<Loading/>:<><pre className="handoff-preview">{text}</pre>
   <div className="stack"><Button onClick={async()=>{try{await navigator.clipboard.writeText(text);setNotice('Synthèse copiée.');}catch{setError(new Error('La copie a échoué sur cet appareil.'));}}}>Copier la synthèse</Button><Button kind="secondary" onClick={()=>void load()}>Régénérer</Button></div>
   <p className="muted">Assemblée à partir des objets enregistrés dans Atelier. Les propositions non validées y sont séparées des décisions.</p></>}
 </Fold>;
}

export function JournalSection({id}:{id:string}){
 const [items,setItems]=useState<any[]|null>(null),[next,setNext]=useState<number|null>(null),[error,setError]=useState<unknown>(null);
 const load=async(before?:number)=>{try{const d=await api(`/workbench/journal?project=${id}&limit=30${before?`&before=${before}`:''}`);setItems(old=>before&&old?[...old,...d.items]:d.items);setNext(d.next);}catch(e){setError(e);}};
 return <Fold title="Journal du projet" summary="décisions, tâches, questions, prompts, synchronisations" onOpen={()=>{if(!items)void load();}}>
  <ErrorBox error={error}/>{!items?<Loading/>:!items.length?<p className="muted">Aucun événement enregistré pour ce projet.</p>:<ul className="plain">{items.map(e=><li key={e.seq}><small className="muted">{date(e.created_at)}</small><br/>{e.detail}</li>)}</ul>}
  {next&&<Button kind="text" onClick={()=>void load(next)}>Événements plus anciens</Button>}
 </Fold>;
}

export function RefAuditSection({id,repos}:{id:string;repos:any[]}){
 const [audits,setAudits]=useState<any[]|null>(null),[open,setOpen]=useState<any>(null),[ctx,setCtx]=useState<any>(null),[filter,setFilter]=useState(''),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [finding,setFinding]=useState({title:'',severity:'P2',confidence:'medium',path:'',detail:'',reproduction:''});
 const load=useCallback(()=>api(`/ref-audits?project=${id}`).then(d=>setAudits(d.items)).catch(setError),[id]);
 const openAudit=useCallback(async(aid:string,status=filter)=>{try{setOpen(await api(`/ref-audits/${aid}?limit=50&status=${status}`));}catch(e){setError(e);}},[filter]);
 const run=async(fn:()=>Promise<any>,ok='')=>{setBusy(true);setError(null);setNotice('');try{await fn();if(ok)setNotice(ok);await load();if(open)await openAudit(open.id);}catch(e){setError(e);}finally{setBusy(false);}};
 return <Fold title="Audit de référence" summary={audits?(audits.length?audits.length+' audit(s) · dernier : '+(audits[0].coverage.integral&&!audits[0].truncated?'intégral':'partiel')+' au commit '+String(audits[0].commit_sha).slice(0,8):'aucun audit'):'dépôt entier sur un commit figé'} onOpen={()=>{if(!audits)void load();}}>
  <ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}
  <p className="muted">Différent de la revue de PR : ici, tout le dépôt est listé à un commit précis et chaque fichier a un statut de lecture. « Intégral » n’est affiché que si tout le code est lu intégralement.</p>
  {!repos.length?<p className="muted">Associez d’abord un dépôt au projet.</p>:repos.map(r=><Button key={r.id} kind="secondary" disabled={busy} onClick={()=>void run(async()=>{const a=await post('/ref-audits',{project_id:id,repository_id:r.id});setNotice(a.resumed?'Un audit existe déjà pour ce commit : il est repris.':'Manifeste créé : '+a.file_count+' fichiers'+(a.reused?', '+a.reused+' statut(s) repris de l’audit précédent (fichiers inchangés)':'')+'.');})}>Créer l’audit de {r.full_name} au commit actuel</Button>)}
  {audits?.map(a=><details className="fold" key={a.id} onToggle={e=>{if((e.target as HTMLDetailsElement).open&&open?.id!==a.id){setCtx(null);void openAudit(a.id);}}}><summary className="fold-summary"><strong>{a.full_name} @ {String(a.commit_sha).slice(0,8)}</strong><small className="muted">{a.coverage.integral&&!a.truncated?'intégral':'partiel'} · code lu {a.coverage.code.full}/{a.coverage.code.total} · {a.coverage.not_covered} sans lecture · {date(a.created_at)}{a.status==='closed'?' · clos':''}</small></summary>
   <div className="fold-body stack">{open?.id===a.id?<>
    {open.warning&&<p className="notice">{open.warning}</p>}
    <p>{open.coverage.statement}</p>
    <ul className="plain">{Object.entries(READ).map(([k,v])=><li key={k}>{v} : {open.coverage.by_status[k]||0}</li>)}</ul>
    <p className="muted">Commit <a href={open.links.commit} target="_blank" rel="noreferrer"><code>{open.commit_sha}</code></a> · branche {open.branch} · arbre {open.truncated?'tronqué':'complet'} · {open.file_count} fichiers</p>
    <div className="stack">
     <Button disabled={busy||open.status==='closed'||!open.coverage.by_status.not_started} onClick={()=>void run(async()=>{const x=await post(`/ref-audits/${a.id}/analyse`,{});setNotice(x.analysed+' fichier(s) analysé(s) par outil'+(x.failed?', '+x.failed+' en échec':'')+' ; il en reste '+x.remaining+'.');})}>Analyser 10 fichiers par outil (sans IA)</Button>
     <Button kind="secondary" disabled={busy} onClick={async()=>{try{setCtx(await api(`/ref-audits/${a.id}/context`));}catch(e){setError(e);}}}>Lire les contrôles et les PR ouvertes</Button>
     <Button kind="secondary" onClick={()=>void download(`/ref-audits/${a.id}/report`,`audit-reference-${String(a.commit_sha).slice(0,8)}.md`).catch(setError)}>Télécharger le rapport (Markdown)</Button>
     {open.status!=='closed'&&<Button kind="text" disabled={busy} onClick={()=>void run(()=>post(`/ref-audits/${a.id}/close`,{}),'Audit clos.')}>Clore cet audit</Button>}</div>
    {ctx&&<div className="panel"><p>Contrôles du commit audité : <strong>{CI[ctx.ci.state]}</strong>{ctx.ci.total?' ('+ctx.ci.total+' lus)':' (aucun contrôle reçu)'} · {ctx.behind===null?'tête de branche inconnue':ctx.behind?'la branche a avancé depuis cet audit':'la branche est encore à ce commit'}</p>
     {ctx.pulls===null?<p className="muted">PR ouvertes : inconnu (GitHub n’a pas répondu).</p>:!ctx.pulls.length?<p className="muted">Aucune PR ouverte.</p>:<ul className="plain">{ctx.pulls.map((p:any)=><li key={p.number}>#{p.number} {p.title}{p.draft?' (brouillon)':''} — {p.note}</li>)}</ul>}
     <p className="muted">{ctx.notice}</p></div>}
    <Field label="Fichiers à afficher"><select value={filter} onChange={e=>{setFilter(e.target.value);void openAudit(a.id,e.target.value);}}><option value="">Tous (50 premiers)</option>{Object.entries(READ).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
    {open.files.map((f:any)=><details className="fold" key={f.path}><summary className="fold-summary"><strong>{f.path}</strong><small className="muted">{READ[f.read_status]} · {f.kind}{f.lines?' · '+f.lines+' lignes':''}{f.flags?' · '+f.flags:''}{f.reused_from?' · repris (fichier inchangé)':''}</small></summary><div className="fold-body stack">
     {f.note&&<p className="muted">{f.note}</p>}
     {open.status!=='closed'&&<div className="stack">{[['full','Je l’ai lu intégralement'],['segments','Lu par segments'],['not_started','Remettre à « non commencé »']].map(([k,v])=><Button key={k} kind="secondary" disabled={busy} onClick={()=>void run(()=>patch(`/ref-audits/${a.id}/files`,{paths:[f.path],read_status:k,note:k==='full'?'Déclaré lu intégralement par Martin.':''}))}>{v}</Button>)}
      <Button kind="text" disabled={busy} onClick={()=>{const note=window.prompt('Motif de l’exclusion (obligatoire) :')||'';if(note.trim())void run(()=>patch(`/ref-audits/${a.id}/files`,{paths:[f.path],read_status:'excluded',note}));}}>Exclure avec un motif</Button></div>}</div></details>)}
    {open.next&&<p className="muted">Plus de 50 fichiers : utilisez le filtre ou le rapport pour voir la suite.</p>}
    <h4>Constats</h4>
    {!open.findings.length&&<p className="muted">Aucun constat enregistré.</p>}
    {open.findings.map((f:any)=><div className="panel" key={f.id}><strong>[{f.severity}] {f.title}</strong><p className="muted">Confiance {f.confidence} · origine {f.origin} · {f.status}{f.path?' · '+f.path:''}</p>{f.detail&&<p>{f.detail}</p>}{f.reproduction&&<p className="muted">Reproduction : {f.reproduction}</p>}</div>)}
    <details className="fold"><summary className="fold-summary"><strong>Ajouter un constat</strong><small className="muted">avec gravité, confiance et reproduction</small></summary><div className="fold-body stack">
     <Field label="Constat"><input value={finding.title} maxLength={200} onChange={e=>setFinding({...finding,title:e.target.value})}/></Field>
     <Field label="Gravité"><select value={finding.severity} onChange={e=>setFinding({...finding,severity:e.target.value})}>{['P0','P1','P2','P3','info'].map(x=><option key={x}>{x}</option>)}</select></Field>
     <Field label="Confiance"><select value={finding.confidence} onChange={e=>setFinding({...finding,confidence:e.target.value})}><option value="high">élevée</option><option value="medium">moyenne</option><option value="low">faible</option></select></Field>
     <Field label="Fichier (chemin exact du manifeste, facultatif)"><input value={finding.path} maxLength={400} onChange={e=>setFinding({...finding,path:e.target.value.trim()})}/></Field>
     <Field label="Détail"><textarea rows={2} value={finding.detail} maxLength={4000} onChange={e=>setFinding({...finding,detail:e.target.value})}/></Field>
     <Field label="Comment le reproduire"><input value={finding.reproduction} maxLength={2000} onChange={e=>setFinding({...finding,reproduction:e.target.value})}/></Field>
     <Button disabled={busy||finding.title.trim().length<3} onClick={()=>void run(async()=>{await post(`/ref-audits/${a.id}/findings`,{...finding,title:finding.title.trim()});setFinding({...finding,title:'',path:'',detail:'',reproduction:''});})}>Enregistrer le constat</Button></div></details>
   </>:<Loading/>}</div></details>)}
 </Fold>;
}

/** Détails de développement d'une tâche, validation réelle par Martin et préparation d'une consigne. */
export function TaskExtras({task,decisions,onChanged,setNotice,setError}:{task:any;decisions:any[];onChanged:()=>void;setNotice:(s:string)=>void;setError:(e:unknown)=>void}){
 const [context,setContext]=useState(task.context||''),[files,setFiles]=useState(task.files_hint||''),[tests,setTests]=useState(task.tests||''),[risks,setRisks]=useState(task.risks||''),[picked,setPicked]=useState<string[]>([]),[busy,setBusy]=useState(false);
 const run=async(fn:()=>Promise<any>,ok:string)=>{setBusy(true);setError(null);try{await fn();setNotice(ok);onChanged();}catch(e){setError(e);}finally{setBusy(false);}};
 const valid=decisions.filter(d=>d.status==='validated');
 return <details><summary>Consigne de développement et validation</summary><div className="stack">
  <Field label="Contexte utile"><textarea rows={2} value={context} maxLength={4000} onChange={e=>setContext(e.target.value)}/></Field>
  <Field label="Fichiers et fonctions concernés"><textarea rows={2} value={files} maxLength={2000} onChange={e=>setFiles(e.target.value)}/></Field>
  <Field label="Tests demandés"><input value={tests} maxLength={2000} onChange={e=>setTests(e.target.value)}/></Field>
  <Field label="Risques"><input value={risks} maxLength={2000} onChange={e=>setRisks(e.target.value)}/></Field>
  <Button kind="secondary" disabled={busy} onClick={()=>void run(()=>patch(`/workbench/tasks/${task.id}/details`,{context,files_hint:files,tests,risks}),'Détails enregistrés.')}>Enregistrer ces détails</Button>
  {valid.length>0&&<fieldset><legend>Décisions validées à citer dans la consigne</legend>{valid.map(d=><label className="check" key={d.id}><input type="checkbox" checked={picked.includes(d.id)} onChange={e=>setPicked(p=>e.target.checked?[...p,d.id]:p.filter(x=>x!==d.id))}/>{d.title}</label>)}</fieldset>}
  <Button disabled={busy} onClick={()=>void run(async()=>{await patch(`/workbench/tasks/${task.id}/details`,{context,files_hint:files,tests,risks});await post('/prompts/from-task',{task_id:task.id,decision_ids:picked});},'Consigne préparée dans Mémoire → Prompts, en « À préparer ». Relisez-la avant de la donner.')}>Préparer une consigne pour Claude Code</Button>
  {task.status==='done'&&String(task.proof||'').trim()&&<Button kind="secondary" disabled={busy} onClick={()=>void run(()=>post(`/workbench/tasks/${task.id}/validate`,{validated:!task.validated_at}),task.validated_at?'Validation retirée.':'Tâche validée par vous.')}>{task.validated_at?'Retirer ma validation':'Je valide ce résultat (constaté réellement)'}</Button>}
  {task.validated_at&&<p className="muted">Validée par vous le {date(task.validated_at)}.</p>}
 </div></details>;
}
