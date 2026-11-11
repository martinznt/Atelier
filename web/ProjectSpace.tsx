/* Pilotage : un espace par projet (Livre de recettes, Sport / Mes séances). Chaque section est repliée avec un résumé d'une ligne. */
import {useCallback,useEffect,useState} from 'react';
import {api,post,patch,remove,date,download} from './api';
import {Button,Field,ErrorBox,Empty,SectionTitle,Loading} from './ui';

const STATUS:Record<string,string>={todo:'À faire',ready:'Prêt',in_progress:'En cours',waiting:'En attente',blocked:'Bloqué',to_verify:'À vérifier',done:'Terminé',abandoned:'Abandonné'};
const OWNER:Record<string,string>={user:'Vous',chatgpt:'ChatGPT',claude_code:'Claude Code',codex:'Codex',gemini:'Gemini',mistral:'Mistral',other_ai:'Autre IA',automation:'Automatisation'};
const DEST:Record<string,string>={claude_code:'Claude Code',chatgpt:'ChatGPT',codex:'Codex',gemini:'Gemini',mistral:'Mistral',other:'Autre IA'};
const PROJECT_STATE:Record<string,string>={active:'Actif',paused:'En pause',blocked:'Bloqué',done:'Terminé'};
const DECISION:Record<string,string>={proposed:'Proposée',validated:'Validée',rejected:'Rejetée',superseded:'Remplacée'};
const CI:Record<string,string>={success:'réussi',failure:'échec',pending:'en attente',unknown:'inconnu'};
const PRIORITY:Record<number,string>={1:'Haute',2:'Normale',3:'Basse'};

function Fold({title,summary,open,children}:{title:string;summary?:string;open?:boolean;children:React.ReactNode}){
 return <details className="fold" open={open}><summary className="fold-summary"><strong>{title}</strong>{summary&&<small className="muted">{summary}</small>}</summary><div className="fold-body">{children}</div></details>;
}

export function ProjectSpace({onProject,refresh}:{onProject:(p:any)=>void;refresh:number}){
 const [spaces,setSpaces]=useState<any>(null),[selected,setSelected]=useState(()=>{try{return sessionStorage.getItem('atelier:pilotage')||'';}catch{return '';}}),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 const loadSpaces=useCallback(async()=>{try{const d=await api('/spaces');setSpaces(d);setSelected(s=>s&&d.items.some((i:any)=>i.project_id===s)?s:d.items[0]?.project_id||'');}catch(e){setError(e);}},[]);
 useEffect(()=>{void loadSpaces();},[loadSpaces,refresh]);
 useEffect(()=>{try{if(selected)sessionStorage.setItem('atelier:pilotage',selected);}catch{/* stockage indisponible */}},[selected]);
 async function init(template:string){setBusy(true);setError(null);try{const r=await post('/spaces/init',{template});await loadSpaces();setSelected(r.project_id);}catch(e){setError(e);}finally{setBusy(false);}}
 if(!spaces)return <section><SectionTitle eyebrow="PILOTAGE" title="Pilotage des projets"><ErrorBox error={error}/></SectionTitle><Loading/></section>;
 const missing=spaces.templates.filter((t:any)=>!t.exists);
 return <section className="pilotage">
  <SectionTitle eyebrow="PILOTAGE" title="Pilotage des projets">Deux projets indépendants : rien d’un projet n’est transmis à l’autre sans votre sélection.</SectionTitle>
  <ErrorBox error={error}/>
  {spaces.items.length>0&&<div className="space-tabs" role="tablist">{spaces.items.map((s:any)=><button key={s.project_id} role="tab" aria-selected={selected===s.project_id} className={selected===s.project_id?'active':''} onClick={()=>setSelected(s.project_id)}>{s.name}</button>)}</div>}
  {missing.length>0&&<div className="stack">{missing.map((t:any)=><Button key={t.key} kind="secondary" disabled={busy} onClick={()=>void init(t.key)}>Créer l’espace « {t.label} »</Button>)}<p className="muted">La création ne relie aucun dépôt : vous choisirez et vérifierez le dépôt ensuite.</p></div>}
  {!spaces.items.length&&<Empty title="Aucun espace de projet">Créez l’espace du projet à piloter avec les boutons ci-dessus.</Empty>}
  {selected&&<Space key={selected} id={selected} onOpenProject={onProject}/>}
 </section>;
}

function Space({id}:{id:string;onOpenProject:(p:any)=>void}){
 const [ov,setOv]=useState<any>(null),[gh,setGh]=useState<any>(null),[plan,setPlan]=useState<any>(null),[decisions,setDecisions]=useState<any[]>([]),[error,setError]=useState<unknown>(null);
 const reload=useCallback(async()=>{
  setError(null);
  try{
   const [o,p,d]=await Promise.all([api(`/spaces/${id}/overview`),api(`/spaces/${id}/plan`),api(`/spaces/${id}/decisions`)]);
   setOv(o);setPlan(p);setDecisions(d.items);
  }catch(e){setError(e);}
  // Le suivi GitHub est lu à part : son absence ne bloque ni le plan ni les transmissions.
  api(`/spaces/${id}/github`).then(setGh).catch(()=>setGh({repositories:[],error:true}));
 },[id]);
 useEffect(()=>{setOv(null);setGh(null);void reload();},[reload]);
 if(!ov||!plan)return <><ErrorBox error={error}/><Loading/></>;
 const guide=gh?.next_action||ov.next_action;
 const a=ov.answers;
 return <div className="stack space-body">
  <ErrorBox error={error}/>
  <div className="guide-card" role="status"><span className="eyebrow">VOTRE PROCHAINE ACTION</span><h3>{guide.title}</h3>
   <dl><dt>Où aller</dt><dd>{guide.where}</dd><dt>Quoi ouvrir</dt><dd>{guide.open}</dd><dt>Quoi faire</dt><dd>{guide.do}</dd><dt>Résultat attendu</dt><dd>{guide.expected}</dd><dt>Comment vérifier</dt><dd>{guide.verify}</dd><dt>Si rien n’apparaît</dt><dd>{guide.if_missing}</dd></dl></div>
  <Fold title="Où en est le projet ?" summary={PROJECT_STATE[ov.profile.state]+' · '+ov.progress.done+'/'+ov.progress.total+' terminées'} open>
   <ProfileForm id={id} ov={ov} phases={plan.phases} onSaved={reload}/>
   <ul className="plain"><li><strong>Où en est-on :</strong> {a.where}</li>
    <li><strong>Terminé et vérifié :</strong> {a.verified.length?a.verified.map((t:any)=>t.title).join(' · '):'rien encore'}{a.unverified_done.length>0&&<span className="muted"> ({a.unverified_done.length} terminée(s) sans preuve : non comptées comme vérifiées)</span>}</li>
    <li><strong>Bloque ou reste :</strong> {a.blockers.length?a.blockers.map((t:any)=>t.title+' — '+t.question).join(' · '):'aucun blocage'}{a.waiting.length>0&&<span className="muted"> · en attente de prérequis : {a.waiting.map((t:any)=>t.title).join(', ')}</span>}</li></ul>
  </Fold>
  <RepoSection id={id} repos={ov.repositories} onChanged={reload}/>
  <GithubSection gh={gh}/>
  <PlanSection id={id} plan={plan} onChanged={reload}/>
  <HandoffSection id={id} plan={plan} decisions={decisions} repos={ov.repositories} gh={gh} onChanged={reload}/>
  <DecisionSection id={id} decisions={decisions} plan={plan} onChanged={reload}/>
 </div>;
}

function ProfileForm({id,ov,phases,onSaved}:{id:string;ov:any;phases:any[];onSaved:()=>void}){
 const [objective,setObjective]=useState(ov.profile.objective),[state,setState]=useState(ov.profile.state),[site,setSite]=useState(ov.profile.site_url||''),[phase,setPhase]=useState(ov.profile.current_phase_id||''),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 async function save(){setBusy(true);setError(null);try{await patch(`/spaces/${id}`,{objective,state,site_url:site.trim()||null,current_phase_id:phase||null,revision:ov.profile.revision});onSaved();}catch(e){setError(e);}finally{setBusy(false);}}
 return <div className="stack"><ErrorBox error={error}/>
  <Field label="Objectif du projet"><textarea rows={2} value={objective} maxLength={2000} onChange={e=>setObjective(e.target.value)}/></Field>
  <Field label="État global"><select value={state} onChange={e=>setState(e.target.value)}>{Object.entries(PROJECT_STATE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
  <Field label="Phase actuelle"><select value={phase} onChange={e=>setPhase(e.target.value)}><option value="">Automatique (première phase non terminée)</option>{phases.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
  <Field label="Adresse du site (https://…)"><input value={site} maxLength={300} onChange={e=>setSite(e.target.value)} placeholder="Facultatif"/></Field>
  <Button kind="secondary" disabled={busy} onClick={()=>void save()}>Enregistrer</Button></div>;
}

function RepoSection({id,repos,onChanged}:{id:string;repos:any[];onChanged:()=>void}){
 const [conns,setConns]=useState<any[]>([]),[conn,setConn]=useState(''),[list,setList]=useState<any[]>([]),[full,setFull]=useState(''),[shared,setShared]=useState(false),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{api('/connections').then(r=>{const g=r.items.filter((c:any)=>c.provider==='github');setConns(g);setConn(c=>c||g[0]?.id||'');}).catch(()=>{});},[]);
 async function loadRepos(){if(!conn)return;setBusy(true);setError(null);try{const r=await api(`/github/repositories?connection=${conn}`);setList(r.items);}catch(e){setError(e);}finally{setBusy(false);}}
 async function link(){setBusy(true);setError(null);setNotice('');try{await post(`/spaces/${id}/repository`,{connection_id:conn,full_name:full,confirm_shared:shared});setNotice('Dépôt vérifié et associé.');setFull('');setShared(false);onChanged();}catch(e){setError(e);}finally{setBusy(false);}}
 async function refresh(rid:string){setBusy(true);setError(null);try{await post(`/spaces/${id}/repository/${rid}/refresh`,{});onChanged();}catch(e){setError(e);}finally{setBusy(false);}}
 async function unlink(rid:string){setBusy(true);setError(null);try{await remove(`/spaces/${id}/repository/${rid}`);onChanged();}catch(e){setError(e);}finally{setBusy(false);}}
 return <Fold title="Dépôt GitHub" summary={repos.length?repos.map(r=>r.full_name+' · '+r.branch+(r.verified?' · vérifié':'')).join(' ; '):'aucun dépôt associé'} open={!repos.length}>
  <ErrorBox error={error}/>{notice&&<p role="status" className="notice">{notice}</p>}
  {repos.map(r=><article className="panel" key={r.id}><strong><a href={r.url} target="_blank" rel="noreferrer">{r.full_name}</a></strong>
   <p className="muted">Branche principale : {r.branch} · dernier commit lu : {String(r.head_sha).slice(0,8)} · {r.verified?'vérifié le '+date(r.verified_at):'non vérifié'} · écriture : {r.can_push===null?'inconnue':r.can_push?'autorisée':'non (lecture seule)'}{r.shared_ack?' · partagé avec un autre projet (confirmé)':''}</p>
   <div className="stack"><Button kind="secondary" disabled={busy} onClick={()=>void refresh(r.id)}>Actualiser la vérification</Button><Button kind="text" disabled={busy} onClick={()=>void unlink(r.id)}>Dissocier</Button></div></article>)}
  {!conns.length?<p className="muted">Aucune connexion GitHub : ajoutez-en une dans Réglages → Connexions. Le reste du projet fonctionne sans elle.</p>:<div className="stack">
   <Field label="Connexion GitHub"><select value={conn} onChange={e=>setConn(e.target.value)}>{conns.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
   <Button kind="secondary" disabled={busy||!conn} onClick={()=>void loadRepos()}>Lister mes dépôts accessibles</Button>
   {list.length>0&&<Field label="Dépôt du projet"><select value={full} onChange={e=>setFull(e.target.value)}><option value="">Choisir</option>{list.map(r=><option key={r.id} value={r.full_name}>{r.full_name}</option>)}</select></Field>}
   <Field label="…ou saisir le nom exact (propriétaire/dépôt)"><input value={full} onChange={e=>setFull(e.target.value.trim())} placeholder="martinznt/nom-du-depot"/></Field>
   <label className="check"><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/>Je confirme que ce dépôt peut aussi être associé à un autre projet (seulement si c’est voulu).</label>
   <Button disabled={busy||!conn||!/^[\w.-]+\/[\w.-]+$/.test(full)} onClick={()=>void link()}>Vérifier et associer</Button>
   <p className="muted">Atelier lit le dépôt chez GitHub, y prend la branche principale et vos droits, puis seulement associe. Rien n’est deviné.</p></div>}
 </Fold>;
}

function GithubSection({gh}:{gh:any}){
 if(!gh)return <Fold title="Suivi GitHub" summary="lecture en cours…"><Loading/></Fold>;
 const repos=gh.repositories||[];
 const summary=!repos.length?'aucun dépôt associé':repos.map((r:any)=>r.available?(r.prs?.length||0)+' PR ouverte(s)':'indisponible').join(' ; ');
 return <Fold title="Suivi GitHub" summary={summary}>
  {gh.error&&<p className="notice">Le suivi GitHub n’a pas pu être lu. Les autres sections restent utilisables.</p>}
  {repos.map((r:any)=><article className="panel" key={r.repository.id}><strong>{r.repository.full_name}</strong>
   {!r.available?<p className="notice">État inconnu : {r.reason}</p>:<>
    <p className="muted">Branche principale : <a href={'https://github.com/'+r.repository.full_name+'/tree/'+encodeURIComponent(r.default_branch)} target="_blank" rel="noreferrer">{r.default_branch}</a>{r.head&&<> · dernier commit : <a href={r.head.url} target="_blank" rel="noreferrer">{r.head.sha.slice(0,8)}</a> « {r.head.message} »{r.head.date&&' · '+date(r.head.date)}</>} · contrôles : {CI[r.head_ci?.state||'unknown']}</p>
    {r.prs&&!r.prs.length&&<p className="muted">Aucune PR ouverte.</p>}
    {(r.prs||[]).map((p:any)=><details className="fold" key={p.number}><summary className="fold-summary"><strong>#{p.number} · {p.title}</strong><small className="muted">contrôles : {CI[p.ci.state]} · {p.next_action.label}</small></summary><div className="fold-body"><ul className="plain">
     <li>Branche : <a href={'https://github.com/'+r.repository.full_name+'/tree/'+encodeURIComponent(p.branch)} target="_blank" rel="noreferrer">{p.branch}</a> · commit <a href={'https://github.com/'+r.repository.full_name+'/commit/'+p.head_sha} target="_blank" rel="noreferrer">{p.head_sha.slice(0,8)}</a>{p.draft?' · brouillon':''}</li>
     <li>Contrôles : {CI[p.ci.state]}{p.ci.total?' ('+p.ci.total+' lus'+(p.ci.failed?', '+p.ci.failed+' en échec':'')+(p.ci.source==='actions'?', GitHub Actions seulement':'')+')':' (aucun contrôle reçu)'}</li>
     <li>Rapport Atelier : {p.review?'oui ('+p.review+')':'aucun pour ce commit'}</li>
     {p.tasks.length>0&&<li>Tâches liées : {p.tasks.map((t:any)=>t.title).join(', ')}</li>}{p.handoffs.length>0&&<li>Transmissions liées : {p.handoffs.map((t:any)=>t.title).join(', ')}</li>}
     <li>Prochaine action : {p.next_action.label}</li><li><a href={p.url} target="_blank" rel="noreferrer">Ouvrir la PR sur GitHub</a></li></ul></div></details>)}</>}
  </article>)}
  <p className="muted">« Inconnu » veut dire qu’aucune information n’a été reçue : ce n’est jamais présenté comme un succès. Lecture seule, 8 PR ouvertes au plus.</p>
 </Fold>;
}

function PlanSection({id,plan,onChanged}:{id:string;plan:any;onChanged:()=>void}){
 const [phaseTitle,setPhaseTitle]=useState(''),[title,setTitle]=useState(''),[phase,setPhase]=useState(''),[owner,setOwner]=useState('user'),[priority,setPriority]=useState(2),[deps,setDeps]=useState<string[]>([]),[acceptance,setAcceptance]=useState(''),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError(null);try{await fn();onChanged();}catch(e){setError(e);}finally{setBusy(false);}};
 const tasks:any[]=plan.tasks;
 return <Fold title="Plan" summary={plan.phases.length+' phase(s) · '+tasks.length+' tâche(s)'}>
  <ErrorBox error={error}/>
  {plan.phases.map((ph:any)=><div key={ph.id}><h4>{ph.title}</h4>{tasks.filter(t=>t.phase_id===ph.id).map(t=><TaskCard key={t.id} id={id} task={t} all={tasks} run={run} busy={busy}/>)}</div>)}
  {tasks.some(t=>!t.phase_id)&&<div><h4>Sans phase</h4>{tasks.filter(t=>!t.phase_id).map(t=><TaskCard key={t.id} id={id} task={t} all={tasks} run={run} busy={busy}/>)}</div>}
  <div className="stack"><Field label="Nouvelle phase"><input value={phaseTitle} maxLength={160} onChange={e=>setPhaseTitle(e.target.value)}/></Field>
   <Button kind="secondary" disabled={busy||!phaseTitle.trim()} onClick={()=>void run(async()=>{await post(`/spaces/${id}/phases`,{title:phaseTitle.trim()});setPhaseTitle('');})}>Ajouter la phase</Button></div>
  <div className="stack"><h4>Nouvelle tâche du plan</h4>
   <Field label="Titre"><input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/></Field>
   <Field label="Phase"><select value={phase} onChange={e=>setPhase(e.target.value)}><option value="">Sans phase</option>{plan.phases.map((p:any)=><option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
   <Field label="Responsable"><select value={owner} onChange={e=>setOwner(e.target.value)}>{Object.entries(OWNER).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Priorité"><select value={priority} onChange={e=>setPriority(Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{PRIORITY[n]}</option>)}</select></Field>
   <Field label="Critère d’acceptation"><textarea rows={2} value={acceptance} maxLength={2000} onChange={e=>setAcceptance(e.target.value)}/></Field>
   {tasks.length>0&&<fieldset><legend>Dépend de (doit être terminée avant)</legend>{tasks.map(t=><label className="check" key={t.id}><input type="checkbox" checked={deps.includes(t.id)} onChange={e=>setDeps(d=>e.target.checked?[...d,t.id]:d.filter(x=>x!==t.id))}/>{t.title}</label>)}</fieldset>}
   <Button disabled={busy||!title.trim()} onClick={()=>void run(async()=>{await post(`/spaces/${id}/tasks`,{title:title.trim(),phase_id:phase||null,owner,priority,acceptance,depends_on:deps});setTitle('');setAcceptance('');setDeps([]);})}>Ajouter la tâche</Button></div>
  <p className="muted">Ce plan est celui de votre projet. Il est distinct des tâches techniques d’Atelier (traitements en arrière-plan).</p>
 </Fold>;
}
function TaskCard({id,task,all,run,busy}:{id:string;task:any;all:any[];run:(fn:()=>Promise<any>)=>Promise<void>;busy:boolean}){
 const [proof,setProof]=useState(task.proof||''),[question,setQuestion]=useState(task.blocking_question||''),[next,setNext]=useState(task.next_action||'');
 const deps=task.depends_on.map((d:string)=>all.find(t=>t.id===d)?.title||'introuvable');
 const set=(status:string)=>run(async()=>{await patch(`/spaces/${id}/tasks/${task.id}`,{status,proof,blocking_question:question,next_action:next,revision:task.revision});});
 return <details className="fold"><summary className="fold-summary"><strong>{task.title}</strong><small className="muted">{STATUS[task.effective_status]||task.status} · {OWNER[task.owner]} · priorité {PRIORITY[task.priority].toLowerCase()}{task.status==='done'&&!String(task.proof||'').trim()?' · sans preuve':''}</small></summary>
  <div className="fold-body stack">
   {task.acceptance&&<p><strong>Critère d’acceptation :</strong> {task.acceptance}</p>}
   {deps.length>0&&<p className="muted">Dépend de : {deps.join(', ')}{task.effective_status==='waiting'?' — prérequis non terminés : la tâche ne peut pas démarrer.':''}</p>}
   {(task.pr_number||task.branch||task.commit_sha)&&<p className="muted">Liens : {task.branch&&'branche '+task.branch+' '}{task.commit_sha&&'commit '+task.commit_sha.slice(0,8)+' '}{task.pr_number&&'PR #'+task.pr_number}</p>}
   <Field label="Preuve (test, lien, capture)"><textarea rows={2} value={proof} maxLength={4000} onChange={e=>setProof(e.target.value)}/></Field>
   <Field label="Question qui bloque (obligatoire pour « Bloqué »)"><input value={question} maxLength={1000} onChange={e=>setQuestion(e.target.value)}/></Field>
   <Field label="Prochaine action"><input value={next} maxLength={500} onChange={e=>setNext(e.target.value)}/></Field>
   <div className="stack">{Object.entries(STATUS).filter(([k])=>k!==task.status&&k!=='waiting').map(([k,v])=><Button key={k} kind="secondary" disabled={busy} onClick={()=>void set(k)}>{v}</Button>)}
    <Button kind="text" disabled={busy} onClick={()=>void run(()=>patch(`/spaces/${id}/tasks/${task.id}`,{proof,blocking_question:question,next_action:next,revision:task.revision}))}>Enregistrer les notes</Button>
    <Button kind="text danger" disabled={busy} onClick={()=>void run(()=>remove(`/spaces/${id}/tasks/${task.id}`))}>Supprimer</Button></div>
  </div></details>;
}

function HandoffSection({id,plan,decisions,repos,gh,onChanged}:{id:string;plan:any;decisions:any[];repos:any[];gh:any;onChanged:()=>void}){
 const [list,setList]=useState<any[]>([]),[files,setFiles]=useState<any[]>([]),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false),[open,setOpen]=useState<any>(null),[notice,setNotice]=useState('');
 const blank={title:'',destination:'claude_code',task_id:'',objective:'',instruction:'',constraints:'',success_criteria:'',repository_id:repos[0]?.id||'',branch:'',base_sha:'',pr_number:'',items:[] as any[]};
 const [form,setForm]=useState<any>(blank);
 const load=useCallback(async()=>{try{const r=await api(`/handoffs?project=${id}`);setList(r.items);}catch(e){setError(e);}},[id]);
 useEffect(()=>{void load();api(`/files?project=${id}`).then(r=>setFiles(r.items||[])).catch(()=>{});},[load,id]);
 const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError(null);setNotice('');try{await fn();await load();onChanged();}catch(e){setError(e);}finally{setBusy(false);}};
 const head=gh?.repositories?.find((r:any)=>r.repository.id===form.repository_id)?.head;
 const has=(kind:string,ref:string)=>form.items.some((i:any)=>i.kind===kind&&i.ref===ref);
 const toggle=(kind:string,ref:string)=>setForm((f:any)=>({...f,items:has(kind,ref)?f.items.filter((i:any)=>!(i.kind===kind&&i.ref===ref)):[...f.items,{kind,ref,...(kind==='file'?{include_content:false}:{})}]}));
 const content=(ref:string,v:boolean)=>setForm((f:any)=>({...f,items:f.items.map((i:any)=>i.kind==='file'&&i.ref===ref?{...i,include_content:v}:i)}));
 const body=()=>({title:form.title.trim(),destination:form.destination,task_id:form.task_id||null,objective:form.objective,instruction:form.instruction,constraints:form.constraints,success_criteria:form.success_criteria,repository_id:form.repository_id||null,branch:form.branch||null,base_sha:form.base_sha||null,pr_number:form.pr_number?Number(form.pr_number):null,items:form.items});
 async function openDetail(h:any){setBusy(true);setError(null);try{setOpen(await api(`/handoffs/${h.id}`));}catch(e){setError(e);}finally{setBusy(false);}}
 async function copy(h:any){
  try{await navigator.clipboard.writeText(h.rendered);}catch{setError(new Error('La copie a échoué sur cet appareil. Utilisez « Télécharger le paquet ».'));return;}
  await run(async()=>{await post(`/handoffs/${h.id}/transfer`,{mode:'clipboard'});setNotice('Texte copié. Le statut est « Copié » : Atelier ne sait pas si vous l’avez collé ailleurs.');setOpen(await api(`/handoffs/${h.id}`));});
 }
 async function exportFile(h:any){
  try{await download(`/handoffs/${h.id}/export`,`transmission-${h.version}.md`);}catch(e){setError(e);return;}
  await run(async()=>{await post(`/handoffs/${h.id}/transfer`,{mode:'download'});setNotice('Paquet téléchargé. Le statut est « Exporté ».');setOpen(await api(`/handoffs/${h.id}`));});
 }
 return <Fold title="Transmissions aux IA" summary={list.length?list.length+' dossier(s) · '+list.filter(h=>['draft','ready'].includes(h.status)).length+' à finaliser ou copier':'aucun dossier'}>
  <ErrorBox error={error}/>{notice&&<p role="status" className="notice">{notice}</p>}
  {list.map(h=><details className="fold" key={h.id} onToggle={e=>{if((e.target as HTMLDetailsElement).open&&open?.id!==h.id)void openDetail(h);}}><summary className="fold-summary"><strong>{h.title}</strong><small className="muted">{h.status_label} · {h.destination_label} · version {h.version} · {date(h.updated_at)}</small></summary>
   <div className="fold-body stack">{open?.id===h.id?<HandoffDetail h={open} busy={busy} run={run} copy={copy} exportFile={exportFile} reload={()=>openDetail(h)} setNotice={setNotice}/>:<Loading/>}</div></details>)}
  <details className="fold"><summary className="fold-summary"><strong>Nouveau dossier de transmission</strong><small className="muted">brouillon, aperçu exact, puis copie ou export</small></summary><div className="fold-body stack">
   <Field label="Titre"><input value={form.title} maxLength={160} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
   <Field label="Destination"><select value={form.destination} onChange={e=>setForm({...form,destination:e.target.value})}>{Object.entries(DEST).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Tâche du plan (facultatif)"><select value={form.task_id} onChange={e=>setForm({...form,task_id:e.target.value})}><option value="">Aucune</option>{plan.tasks.map((t:any)=><option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
   <Field label="Objectif"><textarea rows={2} value={form.objective} maxLength={2000} onChange={e=>setForm({...form,objective:e.target.value})}/></Field>
   <Field label="Consigne exacte"><textarea rows={4} value={form.instruction} maxLength={8000} onChange={e=>setForm({...form,instruction:e.target.value})}/></Field>
   <Field label="Contraintes"><textarea rows={2} value={form.constraints} maxLength={3000} onChange={e=>setForm({...form,constraints:e.target.value})}/></Field>
   <Field label="Critères de réussite"><textarea rows={2} value={form.success_criteria} maxLength={3000} onChange={e=>setForm({...form,success_criteria:e.target.value})}/></Field>
   {repos.length>0&&<><Field label="Dépôt"><select value={form.repository_id} onChange={e=>setForm({...form,repository_id:e.target.value})}><option value="">Aucun</option>{repos.map(r=><option key={r.id} value={r.id}>{r.full_name}</option>)}</select></Field>
    <Field label="Branche (facultatif)"><input value={form.branch} maxLength={160} onChange={e=>setForm({...form,branch:e.target.value})}/></Field>
    <Field label="SHA du commit (40 caractères)"><input value={form.base_sha} maxLength={40} onChange={e=>setForm({...form,base_sha:e.target.value.trim()})}/></Field>
    {head&&<Button kind="text" onClick={()=>setForm({...form,branch:form.branch||gh.repositories.find((r:any)=>r.repository.id===form.repository_id).default_branch,base_sha:head.sha})}>Utiliser le dernier commit lu ({head.sha.slice(0,8)})</Button>}
    <Field label="PR concernée (numéro, facultatif)"><input inputMode="numeric" value={form.pr_number} onChange={e=>setForm({...form,pr_number:e.target.value.replace(/\D/g,'')})}/></Field></>}
   <fieldset><legend>Contexte à inclure (rien n’est ajouté sans votre choix)</legend>
    {decisions.filter(d=>d.status!=='rejected').map(d=><label className="check" key={d.id}><input type="checkbox" checked={has('decision',d.id)} onChange={()=>toggle('decision',d.id)}/>Décision : {d.title} ({DECISION[d.status]})</label>)}
    {plan.tasks.map((t:any)=><label className="check" key={t.id}><input type="checkbox" checked={has('task',t.id)} onChange={()=>toggle('task',t.id)}/>Tâche : {t.title}</label>)}
    {files.map((f:any)=><div key={f.id}><label className="check"><input type="checkbox" checked={has('file',f.id)} onChange={()=>toggle('file',f.id)}/>Fichier : {f.name}</label>{has('file',f.id)&&<label className="check muted"><input type="checkbox" checked={Boolean(form.items.find((i:any)=>i.ref===f.id)?.include_content)} onChange={e=>content(f.id,e.target.checked)}/>Inclure son contenu (texte, 20 000 caractères au plus) ; sinon référence seulement</label>}</div>)}
    {!decisions.length&&!plan.tasks.length&&!files.length&&<p className="muted">Aucune décision, tâche ou fichier dans ce projet.</p>}
    <p className="muted">La mémoire générale du compte et les autres projets ne sont jamais inclus.</p></fieldset>
   <Button disabled={busy||!form.title.trim()} onClick={()=>void run(async()=>{await post('/handoffs',{project_id:id,...body()});setForm(blank);setNotice('Brouillon créé : ouvrez-le dans la liste pour voir l’aperçu exact.');})}>Créer le brouillon</Button>
  </div></details>
 </Fold>;
}
function HandoffDetail({h,busy,run,copy,exportFile,reload,setNotice}:{h:any;busy:boolean;run:(fn:()=>Promise<any>)=>Promise<void>;copy:(h:any)=>Promise<void>;exportFile:(h:any)=>Promise<void>;reload:()=>Promise<void>;setNotice:(s:string)=>void}){
 const [resp,setResp]=useState(''),[pr,setPr]=useState(''),[commit,setCommit]=useState(''),[branch,setBranch]=useState('');
 const frozen=h.status!=='draft';
 return <>
  {h.preview_error&&<p className="notice">{h.preview_error}</p>}
  {h.rendered&&<details open><summary>{frozen?'Texte figé (identique à ce qui est copié ou exporté)':'Aperçu exact du texte'}</summary><pre className="handoff-preview">{h.rendered}</pre>{h.content_hash&&<small className="muted">Empreinte SHA-256 : {h.content_hash.slice(0,16)}…</small>}</details>}
  {h.provenance.length>0&&<details><summary>Pièces incluses ({h.provenance.length})</summary><ul>{h.provenance.map((p:any)=><li key={p.id}>{p.label} — {p.provenance}</li>)}</ul></details>}
  <p className="muted">Statut : {h.status_label}{h.transferred_at?' · '+date(h.transferred_at):''}{h.result_pr?' · PR #'+h.result_pr+(h.result_verified?' (vérifiée)':' (non vérifiée)'):''}</p>
  {h.response_text&&<details><summary>Réponse enregistrée</summary><pre className="handoff-preview">{h.response_text}</pre></details>}
  <div className="stack">
   {h.status==='draft'&&<Button disabled={busy||Boolean(h.preview_error)} onClick={()=>void run(async()=>{await post(`/handoffs/${h.id}/ready`,{});await reload();setNotice('Dossier figé : « Prêt à copier ».');})}>Marquer prêt à copier</Button>}
   {h.status==='draft'&&<Button kind="text danger" disabled={busy} onClick={()=>void run(()=>remove(`/handoffs/${h.id}`))}>Supprimer le brouillon</Button>}
   {['ready','copied','exported'].includes(h.status)&&<><Button disabled={busy} onClick={()=>void copy(h)}>Copier le texte</Button><Button kind="secondary" disabled={busy} onClick={()=>void exportFile(h)}>Télécharger le paquet</Button></>}
   {frozen&&h.status!=='done'&&<Button kind="text" disabled={busy} onClick={()=>void run(async()=>{await post(`/handoffs/${h.id}/new-version`,{});setNotice('Nouvelle version créée en brouillon.');})}>Nouvelle version</Button>}
  </div>
  {['ready','copied','exported'].includes(h.status)&&<div className="stack"><h4>Ajouter la réponse ou le résultat</h4>
   <Field label="Réponse de l’IA"><textarea rows={3} value={resp} maxLength={20000} onChange={e=>setResp(e.target.value)}/></Field>
   <Field label="Numéro de PR"><input inputMode="numeric" value={pr} onChange={e=>setPr(e.target.value.replace(/\D/g,''))}/></Field>
   <Field label="Commit (40 caractères)"><input value={commit} maxLength={40} onChange={e=>setCommit(e.target.value.trim())}/></Field>
   <Field label="Branche"><input value={branch} maxLength={160} onChange={e=>setBranch(e.target.value)}/></Field>
   <Button kind="secondary" disabled={busy||(!resp.trim()&&!pr&&!commit&&!branch)} onClick={()=>void run(async()=>{await post(`/handoffs/${h.id}/response`,{text:resp,pr_number:pr?Number(pr):null,commit:commit||null,branch:branch||null});setResp('');setPr('');setCommit('');setBranch('');await reload();})}>Enregistrer la réponse</Button></div>}
  {['response_received','ready','copied','exported'].includes(h.status)&&<Button kind="text" disabled={busy} onClick={()=>void run(async()=>{await post(`/handoffs/${h.id}/close`,{});await reload();})}>Terminer ce dossier</Button>}
 </>;
}

function DecisionSection({id,decisions,plan,onChanged}:{id:string;decisions:any[];plan:any;onChanged:()=>void}){
 const [title,setTitle]=useState(''),[reason,setReason]=useState(''),[source,setSource]=useState(''),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError(null);try{await fn();onChanged();}catch(e){setError(e);}finally{setBusy(false);}};
 const toSettle=[...plan.tasks.filter((t:any)=>t.status==='blocked'&&t.blocking_question).map((t:any)=>({key:'t'+t.id,text:'« '+t.title+' » : '+t.blocking_question})),...decisions.filter(d=>d.status==='proposed').map(d=>({key:'d'+d.id,text:'Décision proposée : '+d.title}))];
 return <Fold title="Décisions et À trancher" summary={decisions.length+' décision(s) · '+toSettle.length+' à trancher'} open={toSettle.length>0}>
  <ErrorBox error={error}/>
  {toSettle.length>0&&<div className="notice"><strong>À trancher</strong><ul>{toSettle.map(x=><li key={x.key}>{x.text}</li>)}</ul></div>}
  {decisions.map(d=><details className="fold" key={d.id}><summary className="fold-summary"><strong>{d.title}</strong><small className="muted">{DECISION[d.status]} · {date(d.updated_at)}{d.source_ref?' · source : '+d.source_ref:''}</small></summary><div className="fold-body stack">
   {d.reason&&<p>{d.reason}</p>}{d.supersedes_id&&<p className="muted">Remplace une décision précédente.</p>}
   <div className="stack">{Object.entries(DECISION).filter(([k])=>k!==d.status&&k!=='superseded').map(([k,v])=><Button key={k} kind="secondary" disabled={busy} onClick={()=>void run(()=>patch(`/spaces/${id}/decisions/${d.id}`,{status:k,revision:d.revision}))}>{v}</Button>)}</div></div></details>)}
  <div className="stack"><h4>Nouvelle décision</h4>
   <Field label="Décision"><input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/></Field>
   <Field label="Raison"><textarea rows={2} value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)}/></Field>
   <Field label="Source (PR, rapport, conversation…)"><input value={source} maxLength={300} onChange={e=>setSource(e.target.value)}/></Field>
   <Button disabled={busy||!title.trim()} onClick={()=>void run(async()=>{await post(`/spaces/${id}/decisions`,{title:title.trim(),reason,source_ref:source,status:'proposed'});setTitle('');setReason('');setSource('');})}>Proposer la décision</Button></div>
  <p className="muted">Une décision n’est « validée » que par vous. Elle reste rattachée à ce projet et n’apparaît pas dans l’autre.</p>
 </Fold>;
}
