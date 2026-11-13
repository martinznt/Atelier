/* Bibliothèque de prompts : fiches versionnées, copie exacte, téléchargement MD/TXT, commandes séparées, transmission confirmée
   par Martin avec la date réelle, réponses rattachées. Atelier ne dit jamais qu'il a envoyé un prompt. */
import {useCallback,useEffect,useState} from 'react';
import {api,post,patch,date,download} from './api';
import {Button,Field,ErrorBox,Loading} from './ui';
const KIND:Record<string,string>={framing:'Question de cadrage',analysis:'Analyse ou revue',development:'Mission de développement',other:'Autre'};

export function PromptLibrary({refresh,projectId}:{refresh:number;projectId?:string}){
 const [data,setData]=useState<any>(null),[projects,setProjects]=useState<any[]>([]),[status,setStatus]=useState(''),[q,setQ]=useState(''),[open,setOpen]=useState<any>(null),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({title:'',prefix:'PROMPT-CLAUDECODE',recipient:'Claude Code',provider:'Anthropic',product:'Claude Code',model:'',effort:'',kind:'development',project_id:projectId||'',objective:'',body:''});
 const load=useCallback(()=>api(`/prompts?status=${status}&q=${encodeURIComponent(q)}${projectId?`&project=${projectId}`:''}`).then(setData).catch(setError),[status,q,projectId]);
 useEffect(()=>{const t=setTimeout(()=>void load(),200);return()=>clearTimeout(t);},[load,refresh]);
 useEffect(()=>{api('/projects').then(d=>setProjects(d.items)).catch(()=>{});},[]);
 const openDetail=async(id:string)=>{try{setOpen(await api(`/prompts/${id}`));}catch(e){setError(e);}};
 const run=async(fn:()=>Promise<any>,ok='')=>{setBusy(true);setError(null);setNotice('');try{await fn();if(ok)setNotice(ok);await load();if(open)await openDetail(open.id);}catch(e){setError(e);}finally{setBusy(false);}};
 if(!data)return <><ErrorBox error={error}/><Loading/></>;
 return <div className="stack"><ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}
  <div className="filter-row"><input type="search" aria-label="Rechercher un prompt" placeholder="Identifiant, titre, destinataire, texte…" value={q} onChange={e=>setQ(e.target.value)}/>
   <select aria-label="Statut" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(data.labels).map(([k,v])=><option key={k} value={k}>{String(v)}</option>)}</select></div>
  {!data.items.length&&<p className="muted">Aucun prompt. Créez-en un ci-dessous, ou importez une fiche depuis le référentiel mémoire (onglet Référentiel, type « Prompt »).</p>}
  {data.items.map((p:any)=><details className="fold" key={p.id} onToggle={e=>{if((e.target as HTMLDetailsElement).open&&open?.id!==p.id)void openDetail(p.id);}}><summary className="fold-summary"><strong>{p.code} — {p.title}</strong><small className="muted">{p.status_label} · {p.recipient||'destinataire non précisé'} · v{p.current_version}{p.sent_at?' · donné le '+p.sent_at:''}{p.project_name?' · '+p.project_name:''}{p.responses?' · '+p.responses+' réponse(s)':''}</small></summary>
   <div className="fold-body stack">{open?.id===p.id?<PromptDetail p={open} busy={busy} run={run} setError={setError} setNotice={setNotice}/>:<Loading/>}</div></details>)}
  <details className="fold"><summary className="fold-summary"><strong>Nouveau prompt</strong><small className="muted">fiche versionnée, à copier vous-même vers l’IA</small></summary><div className="fold-body stack">
   <Field label="Titre"><input value={form.title} maxLength={200} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
   <Field label="Préfixe d’identifiant (le numéro est ajouté)"><input value={form.prefix} maxLength={40} onChange={e=>setForm({...form,prefix:e.target.value.toUpperCase()})}/></Field>
   <Field label="Type"><select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}>{Object.entries(KIND).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Projet"><select value={form.project_id} onChange={e=>setForm({...form,project_id:e.target.value})}><option value="">Général</option>{projects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
   <Field label="Destinataire exact"><input value={form.recipient} maxLength={120} onChange={e=>setForm({...form,recipient:e.target.value})}/></Field>
   <Field label="Fournisseur"><input value={form.provider} maxLength={80} onChange={e=>setForm({...form,provider:e.target.value})}/></Field>
   <Field label="Produit"><input value={form.product} maxLength={80} onChange={e=>setForm({...form,product:e.target.value})}/></Field>
   <Field label="Modèle (laisser vide si inconnu)"><input value={form.model} maxLength={120} onChange={e=>setForm({...form,model:e.target.value})}/></Field>
   <Field label="Effort (laisser vide si inconnu)"><input value={form.effort} maxLength={80} onChange={e=>setForm({...form,effort:e.target.value})}/></Field>
   <Field label="Objectif"><textarea rows={2} value={form.objective} maxLength={2000} onChange={e=>setForm({...form,objective:e.target.value})}/></Field>
   <Field label="Texte intégral du prompt"><textarea rows={8} value={form.body} maxLength={120000} onChange={e=>setForm({...form,body:e.target.value})}/></Field>
   <Button disabled={busy||!form.title.trim()||!form.body.trim()} onClick={()=>void run(async()=>{await post('/prompts',{...form,title:form.title.trim(),project_id:form.project_id||null});setForm({...form,title:'',objective:'',body:''});},'Prompt créé en « À préparer ».')}>Créer la fiche</Button>
  </div></details>
 </div>;
}

function PromptDetail({p,busy,run,setError,setNotice}:{p:any;busy:boolean;run:(fn:()=>Promise<any>,ok?:string)=>Promise<void>;setError:(e:unknown)=>void;setNotice:(s:string)=>void}){
 const cur=p.versions.find((v:any)=>v.version===p.current_version)||p.versions[0];
 const [body,setBody]=useState(cur.body),[commands,setCommands]=useState(cur.commands.map((c:any)=>c.command+' | '+c.label+' | '+c.where_when).join('\n')),[editing,setEditing]=useState(false);
 const [sentAt,setSentAt]=useState(()=>new Date().toISOString().slice(0,10)),[recipient,setRecipient]=useState(p.recipient),[confirm,setConfirm]=useState(false);
 const [others,setOthers]=useState<any[]>([]),[succ,setSucc]=useState('');
 const [resp,setResp]=useState(''),[url,setUrl]=useState(''),[analysis,setAnalysis]=useState(''),[result,setResult]=useState('');
 const parseCommands=()=>commands.split('\n').map((l:string)=>l.trim()).filter(Boolean).slice(0,10).map((l:string)=>{const [command,label='',where_when='']=l.split('|');return {command:command.trim(),label:label.trim(),where_when:where_when.trim()};});
 async function copy(text:string,what:string,mark=false){try{await navigator.clipboard.writeText(text);if(mark)await run(()=>post(`/prompts/${p.id}/copied`,{}),what+' copié (noté « Copié »). Atelier ne sait pas si vous l’avez collé ailleurs : confirmez la transmission quand c’est fait.');else setNotice(what+' copié. Atelier ne sait pas si vous l’avez collé ailleurs : confirmez la transmission quand c’est fait.');}catch{setError(new Error('La copie a échoué sur cet appareil. Utilisez le téléchargement.'));}}
 const meta=[['Destinataire',p.recipient],['Fournisseur',p.provider],['Produit',p.product],['Modèle',p.model||'inconnu'],['Effort',p.effort||'inconnu'],['Envoi prévu',p.planned_send||'non précisé'],['Projet',p.project_name||'Général'],['Type',KIND[p.kind]||p.kind]];
 return <>
  <p className="muted">{meta.map(([k,v])=>k+' : '+v).join(' · ')}</p>
  {p.objective&&<p><strong>Objectif :</strong> {p.objective}</p>}{p.justification&&<p><strong>Raison :</strong> {p.justification}</p>}{p.prerequisites&&<p><strong>Prérequis :</strong> {p.prerequisites}</p>}{p.dependencies&&<p><strong>Dépendances :</strong> {p.dependencies}</p>}
  {p.source_note&&<p className="muted">{p.source_note}</p>}
  <details open><summary>Texte de la version {cur.version} {cur.locked?'(transmise le '+cur.sent_at+', non modifiable)':'(non transmise)'}</summary><pre className="handoff-preview">{cur.body}</pre><small className="muted">Empreinte SHA-256 : {String(cur.content_hash).slice(0,16)}…</small></details>
  {cur.commands.length>0&&<div className="notice"><strong>Commandes à lancer séparément (elles ne font pas partie du texte à coller)</strong>{cur.commands.map((c:any,i:number)=><p key={i}><code>{c.command}</code>{c.label&&' — '+c.label}{c.where_when&&<span className="muted"> ({c.where_when})</span>} <button className="link-button" onClick={()=>void copy(c.command,'Commande')}>Copier la commande</button></p>)}</div>}
  <div className="stack"><Button disabled={busy} onClick={()=>void copy(cur.body,'Texte exact du prompt',true)}>Copier le texte exact</Button>
   <Button kind="secondary" onClick={()=>void download(`/prompts/${p.id}/export?format=md&version=${cur.version}`,`${p.code}-v${cur.version}.md`).catch(setError)}>Télécharger en Markdown</Button>
   <Button kind="secondary" onClick={()=>void download(`/prompts/${p.id}/export?format=txt&version=${cur.version}`,`${p.code}-v${cur.version}.txt`).catch(setError)}>Télécharger en texte</Button>
   <Button kind="text" onClick={()=>setEditing(e=>!e)}>{cur.locked?'Corriger (crée une nouvelle version)':'Modifier le texte'}</Button></div>
  {editing&&<div className="stack">
   <Field label="Texte intégral" hint={cur.locked?'La version transmise reste intacte : votre correction devient la version '+(cur.version+1)+'.':'Version non transmise : modifiée sur place.'}><textarea rows={10} value={body} maxLength={120000} onChange={e=>setBody(e.target.value)}/></Field>
   <Field label="Commandes séparées (une par ligne : commande | libellé | où et quand)"><textarea rows={2} value={commands} onChange={e=>setCommands(e.target.value)}/></Field>
   <Button disabled={busy||!body.trim()} onClick={()=>void run(async()=>{await api(`/prompts/${p.id}/body`,{method:'PUT',body:JSON.stringify({body,commands:parseCommands()})});setEditing(false);},cur.locked?'Nouvelle version créée, à donner.':'Texte enregistré.')}>Enregistrer</Button></div>}
  {['to_prepare','to_give'].includes(p.status)&&<div className="panel stack"><strong>Confirmer la transmission</strong>
   {p.status==='to_prepare'&&<Button kind="secondary" disabled={busy} onClick={()=>void run(()=>patch(`/prompts/${p.id}`,{status:'to_give',revision:p.revision}),'Prompt prêt : « À donner ».')}>Marquer « À donner »</Button>}
   <Field label="Date réelle de transmission"><input type="date" value={sentAt} max={new Date().toISOString().slice(0,10)} onChange={e=>setSentAt(e.target.value)}/></Field>
   <Field label="Destinataire réel"><input value={recipient} maxLength={120} onChange={e=>setRecipient(e.target.value)}/></Field>
   <label className="check"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>Je confirme avoir moi-même donné ce texte exact à ce destinataire, à cette date.</label>
   <Button disabled={busy||!confirm||!sentAt} onClick={()=>void run(async()=>{await post(`/prompts/${p.id}/sent`,{confirm:true,sent_at:sentAt,recipient});setConfirm(false);},'Transmission enregistrée : cette version ne peut plus être modifiée.')}>Enregistrer « Déjà donné »</Button></div>}
  {cur.locked&&p.status!=='obsolete'&&<div className="panel stack"><strong>Ajouter la réponse</strong>
   {p.status==='given'&&<Button kind="text" disabled={busy} onClick={()=>void run(()=>patch(`/prompts/${p.id}`,{status:'awaiting',revision:p.revision}))}>Marquer « En attente de retour »</Button>}
   <Field label="Réponse reçue"><textarea rows={3} value={resp} maxLength={60000} onChange={e=>setResp(e.target.value)}/></Field>
   <Field label="Lien (PR, document) — https://"><input value={url} maxLength={400} onChange={e=>setUrl(e.target.value.trim())}/></Field>
   <Field label="Votre analyse (facultatif)"><textarea rows={2} value={analysis} maxLength={8000} onChange={e=>setAnalysis(e.target.value)}/></Field>
   <Field label="Résultat retenu (facultatif)"><input value={result} maxLength={4000} onChange={e=>setResult(e.target.value)}/></Field>
   <Button kind="secondary" disabled={busy||(!resp.trim()&&!url)} onClick={()=>void run(async()=>{await post(`/prompts/${p.id}/responses`,{response:resp,url:url||null,analysis,result});setResp('');setUrl('');setAnalysis('');setResult('');},'Réponse rattachée au prompt.')}>Enregistrer la réponse</Button>
   {p.status==='response_received'&&<Button kind="text" disabled={busy} onClick={()=>void run(()=>patch(`/prompts/${p.id}`,{status:'processed',revision:p.revision}),'Prompt traité.')}>Marquer « Traité »</Button>}</div>}
  {p.responses.length>0&&<details><summary>Réponses ({p.responses.length})</summary>{p.responses.map((r:any)=><div key={r.id} className="panel"><small className="muted">Version {r.version} · reçue le {date(r.received_at)}</small>{r.url&&<p><a href={r.url} target="_blank" rel="noreferrer">{r.url}</a></p>}{r.response&&<pre className="handoff-preview">{r.response}</pre>}{r.analysis&&<p><strong>Analyse :</strong> {r.analysis}</p>}{r.result&&<p><strong>Résultat :</strong> {r.result}</p>}</div>)}</details>}
  {p.versions.length>1&&<details><summary>Versions précédentes ({p.versions.length-1})</summary>{p.versions.filter((v:any)=>v.version!==cur.version).map((v:any)=><details key={v.id}><summary>Version {v.version}{v.sent_at?' · donnée le '+v.sent_at+(v.sent_recipient?' à '+v.sent_recipient:''):' · jamais transmise'}</summary>{v.sent_note&&<p className="muted">{v.sent_note}</p>}<pre className="handoff-preview">{v.body}</pre></details>)}</details>}
  {p.copied_at&&p.status!=='given'&&<p className="muted">Copié {p.copied_count} fois, dernière copie le {date(p.copied_at)}. Copier n’est pas transmettre : confirmez la transmission une fois le texte réellement donné.</p>}
  {p.status!=='obsolete'&&<details onToggle={e=>{if((e.target as HTMLDetailsElement).open&&!others.length)api('/prompts?limit=100').then(r=>setOthers(r.items.filter((x:any)=>x.id!==p.id&&x.status!=='obsolete'))).catch(setError);}}><summary>Remplacer par un autre prompt</summary><div className="stack"><Field label="Prompt successeur"><select value={succ} onChange={e=>setSucc(e.target.value)}><option value="">Choisir</option>{others.map((x:any)=><option key={x.id} value={x.id}>{x.code} — {x.title}</option>)}</select></Field><Button kind="secondary" disabled={busy||!succ} onClick={()=>void run(()=>post(`/prompts/${p.id}/supersede`,{by:succ}),'Prompt marqué « Remplacé » ; son historique est conservé.')}>Marquer comme remplacé</Button></div></details>}
  {p.status!=='obsolete'&&<Button kind="text danger" disabled={busy} onClick={()=>void run(()=>patch(`/prompts/${p.id}`,{status:'obsolete',revision:p.revision}),'Prompt marqué obsolète (il reste dans l’historique).')}>Marquer obsolète ou abandonné</Button>}
 </>;
}
