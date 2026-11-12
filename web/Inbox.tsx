/* À traiter : deux vues distinctes. « À faire par Martin » (actions humaines) et « Questions d'Atelier » (regroupées, jamais
   reposées), avec un questionnaire groupé dont le brouillon reste sur l'appareil et s'exporte en JSON ou CSV. */
import {useCallback,useEffect,useState} from 'react';
import {api,post,patch,date,download,saveBlob} from './api';
import {Button,Field,ErrorBox,SectionTitle,Loading} from './ui';
const KIND:Record<string,string>={provide:'Fournir',test:'Tester',answer:'Répondre',choose:'Choisir',validate:'Valider',confirm:'Confirmer',authorize:'Autoriser',other:'Autre'};
const DRAFT='atelier:questionnaire-brouillon';

export function Inbox({refresh}:{refresh:number}){
 const [tab,setTab]=useState('actions'),[projects,setProjects]=useState<any[]>([]),[project,setProject]=useState('');
 useEffect(()=>{api('/projects').then(d=>setProjects(d.items)).catch(()=>{});},[refresh]);
 return <section className="inbox">
  <SectionTitle eyebrow="À TRAITER" title="Ce qui attend votre réponse">Les actions que vous seul pouvez faire, et les questions dont la réponse change le projet.</SectionTitle>
  <div className="space-tabs" role="tablist"><button role="tab" aria-selected={tab==='actions'} className={tab==='actions'?'active':''} onClick={()=>setTab('actions')}>À faire par Martin</button><button role="tab" aria-selected={tab==='questions'} className={tab==='questions'?'active':''} onClick={()=>setTab('questions')}>Questions d’Atelier</button></div>
  <Field label="Projet"><select value={project} onChange={e=>setProject(e.target.value)}><option value="">Tous les projets</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
  {tab==='actions'?<Actions project={project} projects={projects} refresh={refresh}/>:<Questions project={project} projects={projects} refresh={refresh}/>}
 </section>;
}

function Actions({project,projects,refresh}:{project:string;projects:any[];refresh:number}){
 const [items,setItems]=useState<any[]|null>(null),[showAll,setShowAll]=useState(false),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({title:'',why:'',expected:'',consequence:'',kind:'other',blocking:false,project_id:''});
 const load=useCallback(()=>api(`/workbench/actions?status=${showAll?'all':'open'}${project?`&project=${project}`:''}`).then(d=>{setItems(d.items);setError(null);}).catch(setError),[project,showAll]);
 useEffect(()=>{void load();},[load,refresh]);
 const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError(null);try{await fn();await load();}catch(e){setError(e);}finally{setBusy(false);}};
 if(!items)return <><ErrorBox error={error}/><Loading/></>;
 return <div className="stack"><ErrorBox error={error}/>
  {!items.length&&<p className="muted">Aucune action {showAll?'enregistrée':'ouverte'}. Rien ne vous attend ici.</p>}
  {items.map(a=><ActionCard key={a.id+':'+a.revision} a={a} busy={busy} run={run}/>)}
  <label className="check"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/>Afficher aussi les actions faites ou écartées</label>
  <details className="fold"><summary className="fold-summary"><strong>Ajouter une action pour moi</strong><small className="muted">une chose que vous seul pouvez faire</small></summary><div className="fold-body stack">
   <Field label="Action"><input value={form.title} maxLength={200} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
   <Field label="Projet"><select value={form.project_id||project} onChange={e=>setForm({...form,project_id:e.target.value})}><option value="">Général</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
   <Field label="Type"><select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}>{Object.entries(KIND).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Pourquoi cette action existe"><textarea rows={2} value={form.why} maxLength={1000} onChange={e=>setForm({...form,why:e.target.value})}/></Field>
   <Field label="Ce qui est attendu"><textarea rows={2} value={form.expected} maxLength={1000} onChange={e=>setForm({...form,expected:e.target.value})}/></Field>
   <Field label="Conséquence si ce n’est pas fait"><input value={form.consequence} maxLength={1000} onChange={e=>setForm({...form,consequence:e.target.value})}/></Field>
   <label className="check"><input type="checkbox" checked={form.blocking} onChange={e=>setForm({...form,blocking:e.target.checked})}/>Cette action bloque le travail</label>
   <Button disabled={busy||!form.title.trim()} onClick={()=>void run(async()=>{await post('/workbench/actions',{...form,title:form.title.trim(),project_id:(form.project_id||project)||null});setForm({title:'',why:'',expected:'',consequence:'',kind:'other',blocking:false,project_id:''});})}>Ajouter</Button>
  </div></details>
 </div>;
}
function ActionCard({a,busy,run}:{a:any;busy:boolean;run:(fn:()=>Promise<any>)=>Promise<void>}){
 const [response,setResponse]=useState(a.response||''),[proof,setProof]=useState(a.proof||'');
 const set=(status:string)=>run(()=>patch(`/workbench/actions/${a.id}`,{status,response,proof,revision:a.revision}));
 return <details className="fold" open={a.status==='open'&&Boolean(a.blocking)}><summary className="fold-summary"><strong>{a.blocking?'⚠ ':''}{a.title}</strong><small className="muted">{[a.project_name||'Général',KIND[a.kind],a.status==='done'?'faite le '+date(a.done_at):a.status==='dismissed'?'écartée':a.blocking?'bloque le travail':null,a.due_date&&'pour le '+a.due_date].filter(Boolean).join(' · ')}</small></summary>
  <div className="fold-body stack">
   {a.why&&<p><strong>Pourquoi :</strong> {a.why}</p>}{a.expected&&<p><strong>Attendu :</strong> {a.expected}</p>}{a.consequence&&<p><strong>Sinon :</strong> {a.consequence}</p>}{a.source_ref&&<p className="muted">Source : {a.source_ref}</p>}
   <Field label="Votre réponse"><textarea rows={2} value={response} maxLength={4000} onChange={e=>setResponse(e.target.value)}/></Field>
   <Field label="Preuve (lien, résultat observé)"><input value={proof} maxLength={4000} onChange={e=>setProof(e.target.value)}/></Field>
   <div className="stack">{a.status==='open'?<><Button disabled={busy||(!response.trim()&&!proof.trim())} onClick={()=>void set('done')}>C’est fait</Button><Button kind="text" disabled={busy||!response.trim()} onClick={()=>void set('dismissed')}>Écarter (raison dans la réponse)</Button></>:<Button kind="secondary" disabled={busy} onClick={()=>void set('open')}>Rouvrir</Button>}</div>
  </div></details>;
}

function Questions({project,projects,refresh}:{project:string;projects:any[];refresh:number}){
 const [items,setItems]=useState<any[]|null>(null),[showAll,setShowAll]=useState(false),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [draft,setDraft]=useState<Record<string,any>>(()=>{try{return JSON.parse(localStorage.getItem(DRAFT)||'{}');}catch{return {};}});
 const [form,setForm]=useState({question:'',reason:'',if_unanswered:'',sources_consulted:'',theme:'',options:'',multi:false,priority:2,project_id:''});
 const load=useCallback(()=>api(`/workbench/questions?status=${showAll?'all':'open'}${project?`&project=${project}`:''}`).then(d=>{setItems(d.items);setError(null);}).catch(setError),[project,showAll]);
 useEffect(()=>{void load();},[load,refresh]);
 useEffect(()=>{try{localStorage.setItem(DRAFT,JSON.stringify(draft));}catch{/* stockage indisponible : le brouillon reste en mémoire */}},[draft]);
 if(!items)return <><ErrorBox error={error}/><Loading/></>;
 const open=items.filter(q=>q.status==='open');
 const filled=open.filter(q=>{const d=draft[q.id];return d&&((d.selected||[]).length||String(d.text||'').trim()||d.unknown);});
 const groups=new Map<string,any[]>();for(const q of items){const k=(q.project_name||'Général')+(q.theme?' · '+q.theme:'');groups.set(k,[...(groups.get(k)||[]),q]);}
 const put=(id:string,v:any)=>setDraft(d=>({...d,[id]:{selected:[],text:'',unknown:false,...d[id],...v}}));
 async function submitAll(){
  setBusy(true);setError(null);setNotice('');
  try{const r=await post('/workbench/questions/answers',{answers:filled.map(q=>({id:q.id,selected:draft[q.id].selected||[],text:draft[q.id].text||'',unknown:Boolean(draft[q.id].unknown),create_decision:Boolean(draft[q.id].create_decision)}))});
   setNotice(r.answered+' réponse(s) enregistrée(s)'+(r.errors.length?' ; '+r.errors.length+' refusée(s) : '+r.errors.map((e:any)=>e.error).join(' '):'.'));
   setDraft(d=>{const n={...d};for(const q of filled)if(!r.errors.some((e:any)=>e.id===q.id))delete n[q.id];return n;});await load();}catch(e){setError(e);}finally{setBusy(false);}
 }
 function exportDraft(){saveBlob(new Blob([JSON.stringify({format:'atelier-reponses-v1',exported_at:new Date().toISOString(),answers:open.map(q=>({id:q.id,question:q.question,...(draft[q.id]||{selected:[],text:'',unknown:false})}))},null,2)],{type:'application/json'}),'reponses-questions-atelier.json');}
 async function importDraft(file:File){try{const v=JSON.parse(await file.text());if(!Array.isArray(v.answers))throw new Error('Fichier de réponses non reconnu.');setDraft(d=>{const n={...d};for(const a of v.answers)if(a?.id)n[a.id]={selected:Array.isArray(a.selected)?a.selected:[],text:String(a.text||''),unknown:Boolean(a.unknown)};return n;});setNotice('Réponses chargées dans le brouillon. Relisez-les puis enregistrez.');}catch(e){setError(e);}}
 return <div className="stack"><ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}
  {open.length>0&&<div className="panel"><strong>Questionnaire : {filled.length}/{open.length} question(s) remplie(s)</strong><progress max={open.length} value={filled.length}/>
   <p className="muted">Votre brouillon reste sur cet appareil, même hors connexion. Il n’est envoyé que lorsque vous appuyez sur « Enregistrer mes réponses ».</p>
   <div className="stack"><Button disabled={busy||!filled.length||!navigator.onLine} onClick={()=>void submitAll()}>Enregistrer mes réponses ({filled.length})</Button>
    <Button kind="secondary" onClick={exportDraft}>Exporter mes réponses (JSON)</Button>
    <label className="button secondary">Charger des réponses (JSON)<input type="file" accept="application/json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void importDraft(f);e.target.value='';}}/></label>
    <Button kind="text" onClick={()=>void download('/workbench/questions/export?format=csv','questions-atelier.csv').catch(setError)}>Télécharger toutes les questions (CSV)</Button></div></div>}
  {!items.length&&<p className="muted">Aucune question {showAll?'enregistrée':'ouverte'}.</p>}
  {[...groups.entries()].map(([name,list])=><div key={name}><h3>{name}</h3>{list.map(q=><QuestionCard key={q.id+':'+q.revision} q={q} d={draft[q.id]} put={v=>put(q.id,v)} reload={load} setError={setError}/>)}</div>)}
  <label className="check"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/>Afficher aussi les questions répondues ou retirées (historique des réponses)</label>
  <details className="fold"><summary className="fold-summary"><strong>Ajouter une question</strong><small className="muted">seulement si la réponse change le projet</small></summary><div className="fold-body stack">
   <Field label="Question"><input value={form.question} maxLength={600} onChange={e=>setForm({...form,question:e.target.value})}/></Field>
   <Field label="Projet"><select value={form.project_id||project} onChange={e=>setForm({...form,project_id:e.target.value})}><option value="">Général</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
   <Field label="Thème"><input value={form.theme} maxLength={80} onChange={e=>setForm({...form,theme:e.target.value})}/></Field>
   <Field label="Pourquoi la réponse est nécessaire"><textarea rows={2} value={form.reason} maxLength={1000} onChange={e=>setForm({...form,reason:e.target.value})}/></Field>
   <Field label="Ce qui se passe sans réponse"><input value={form.if_unanswered} maxLength={1000} onChange={e=>setForm({...form,if_unanswered:e.target.value})}/></Field>
   <Field label="Sources déjà consultées"><input value={form.sources_consulted} maxLength={2000} onChange={e=>setForm({...form,sources_consulted:e.target.value})}/></Field>
   <Field label="Options (une par ligne ; « option | compromis »)"><textarea rows={3} value={form.options} onChange={e=>setForm({...form,options:e.target.value})}/></Field>
   <label className="check"><input type="checkbox" checked={form.multi} onChange={e=>setForm({...form,multi:e.target.checked})}/>Plusieurs options peuvent être choisies</label>
   <Field label="Priorité"><select value={form.priority} onChange={e=>setForm({...form,priority:Number(e.target.value)})}><option value={1}>Haute (bloque)</option><option value={2}>Normale</option><option value={3}>Basse</option></select></Field>
   <Button disabled={busy||form.question.trim().length<5} onClick={async()=>{setBusy(true);setError(null);setNotice('');try{
     await post('/workbench/questions',{question:form.question.trim(),reason:form.reason,if_unanswered:form.if_unanswered,sources_consulted:form.sources_consulted,theme:form.theme,multi:form.multi,priority:form.priority,project_id:(form.project_id||project)||null,options:form.options.split('\n').map(l=>l.trim()).filter(Boolean).slice(0,8).map(l=>{const [label,tradeoff='']=l.split('|');return {label:label.trim(),tradeoff:tradeoff.trim()};})});
     setForm({question:'',reason:'',if_unanswered:'',sources_consulted:'',theme:'',options:'',multi:false,priority:2,project_id:''});await load();
    }catch(e:any){setError(e);}finally{setBusy(false);}}}>Ajouter la question</Button>
   <p className="muted">Si la même question existe déjà, ou a déjà reçu une réponse, Atelier refuse de la reposer et vous montre l’existante.</p>
  </div></details>
 </div>;
}
function QuestionCard({q,d,put,reload,setError}:{q:any;d:any;put:(v:any)=>void;reload:()=>Promise<any>;setError:(e:unknown)=>void}){
 const sel:number[]=d?.selected||[];
 const toggle=(i:number)=>put({selected:q.multi?(sel.includes(i)?sel.filter(x=>x!==i):[...sel,i]):[i],unknown:false});
 if(q.status!=='open')return <details className="fold"><summary className="fold-summary"><strong>{q.question}</strong><small className="muted">{q.status==='answered'?'Répondue le '+date(q.answered_at)+' : '+q.answer_text:'Retirée'}</small></summary><div className="fold-body stack">
  {q.reason&&<p className="muted">Pourquoi : {q.reason}</p>}{q.decision_id&&<p className="muted">Cette réponse a créé une décision validée dans le projet.</p>}
  <Button kind="text" onClick={()=>void patch(`/workbench/questions/${q.id}`,{status:'open',revision:q.revision}).then(reload).catch(setError)}>Rouvrir la question (l’ancienne réponse reste dans le journal)</Button></div></details>;
 return <details className="fold" open={q.priority===1}><summary className="fold-summary"><strong>{q.priority===1?'⚠ ':''}{q.question}</strong><small className="muted">{sel.length||d?.text||d?.unknown?'brouillon rempli':'à répondre'}{q.blocked_task_ids.length?' · bloque '+q.blocked_task_ids.length+' tâche(s)':''}</small></summary><div className="fold-body stack">
  {q.reason&&<p><strong>Pourquoi :</strong> {q.reason}</p>}{q.if_unanswered&&<p><strong>Sans réponse :</strong> {q.if_unanswered}</p>}{q.sources_consulted&&<p className="muted">Sources déjà consultées : {q.sources_consulted}</p>}
  {q.options.length>0&&<fieldset><legend>{q.multi?'Une ou plusieurs options':'Une option'}</legend>{q.options.map((o:any,i:number)=><label className="check" key={i}><input type={q.multi?'checkbox':'radio'} name={'q-'+q.id} checked={sel.includes(i)} onChange={()=>toggle(i)}/><span>{o.label}{o.recommended&&<em> (proposition d’Atelier)</em>}{o.tradeoff&&<small className="muted"> — {o.tradeoff}</small>}</span></label>)}</fieldset>}
  {q.allow_free_text&&<Field label={q.options.length?'Autre réponse ou précision':'Votre réponse'}><textarea rows={2} value={d?.text||''} maxLength={4000} onChange={e=>put({text:e.target.value})}/></Field>}
  {q.allow_unknown&&<label className="check"><input type="checkbox" checked={Boolean(d?.unknown)} onChange={e=>put({unknown:e.target.checked,selected:e.target.checked?[]:sel})}/>Je ne sais pas</label>}
  {q.project_id&&<label className="check"><input type="checkbox" checked={Boolean(d?.create_decision)} onChange={e=>put({create_decision:e.target.checked})}/>Enregistrer ma réponse comme décision validée du projet</label>}
  <Button kind="text" onClick={()=>void patch(`/workbench/questions/${q.id}`,{status:'withdrawn',revision:q.revision}).then(reload).catch(setError)}>Retirer cette question (elle n’est plus utile)</Button>
 </div></details>;
}
