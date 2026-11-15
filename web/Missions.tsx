/* Lot 3 — Missions pour Claude Code et registre des travaux.
   Atelier prépare le texte ; c'est vous qui le copiez et le donnez à Claude Code. Rien n'est envoyé, aucun test n'est lancé ici. */
import {useCallback,useEffect,useState} from 'react';
import {api,post,patch,remove,date,download} from './api';
import {Button,Field,ErrorBox,Loading} from './ui';

const FAMILY:Record<string,string>={'':'Pas encore indiqué',haiku:'Haiku',sonnet:'Sonnet',opus:'Opus',fable:'Fable',other:'Autre'};
const EFFORT:Record<string,string>={'':'Non indiqué',low:'Faible',medium:'Moyen',high:'Élevé',xhigh:'Très élevé',max:'Maximal'};
const RULES:Record<string,string>={unread:'Règles pas encore lues',read:'Règles lues dans le dépôt',no_rule_files:'Le dépôt n’a ni CLAUDE.md ni AGENTS.md',not_read:'Règles NON lues (GitHub n’a pas répondu)'};
const FIELDS:[string,string,number][]=[['objective','Objectif',3],['perimeter','Périmètre (ce qu’il faut faire)',3],['forbidden','Interdits propres à cette tâche',2],['files','Fichiers concernés',2],['tests','Tests à lancer (en plus de ceux du dépôt)',2],['proofs','Preuves attendues (en plus des preuves de base)',2],['done','Critère « terminé »',2]];
const CHECKS:Record<string,string>={green:'✔ Tests verts',red:'✖ Tests en échec',pending:'… Tests en cours',none:'? Aucun test lu',unread:'? Tests non lus'};

export function MissionsSection({id,plan,decisions,repos}:{id:string;plan:any;decisions:any[];repos:any[]}){
 const [list,setList]=useState<any[]>([]),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false),[open,setOpen]=useState<any>(null),[notice,setNotice]=useState('');
 const [features,setFeatures]=useState<any[]>([]),[form,setForm]=useState<any>({task_id:'',repository_id:'',level:'short',title:'',feature_ids:[],decision_ids:[]});
 const load=useCallback(async()=>{try{setList((await api(`/missions?project=${id}`)).items);}catch(e){setError(e);}},[id]);
 useEffect(()=>{void load();api(`/model/${id}/features`).then(r=>setFeatures(r.items||[])).catch(()=>setFeatures([]));},[load,id]);
 const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError(null);setNotice('');try{await fn();await load();}catch(e){setError(e);}finally{setBusy(false);}};
 const openDetail=async(m:any)=>{setBusy(true);setError(null);try{setOpen(await api(`/missions/${m.id}`));}catch(e){setError(e);}finally{setBusy(false);}};
 const current=decisions.filter(d=>d.status==='validated'),toggle=(k:string,v:string)=>setForm((f:any)=>({...f,[k]:f[k].includes(v)?f[k].filter((x:string)=>x!==v):[...f[k],v]}));
 const repoId=form.repository_id||repos[0]?.id||'';
 const pending=list.filter(m=>m.status!=='draft'&&!m.verdict).length;
 return <details className="fold"><summary className="fold-summary"><strong>Missions pour Claude Code</strong><small className="muted">{list.length?list.length+' mission(s) · '+pending+' à juger':'aucune mission'}</small></summary>
  <div className="fold-body stack">
   <p className="muted">Une mission est un texte court et complet à donner à Claude Code, pour éviter les questions et les allers-retours. Atelier le prépare à partir de ce qui est enregistré ; <strong>c’est vous qui le copiez et le donnez</strong>. Atelier ne lance rien et ne lit les dépôts qu’en lecture seule.</p>
   <ErrorBox error={error}/>{notice&&<p role="status" className="notice">{notice}</p>}
   {list.map(m=><details className="fold" key={m.id} onToggle={e=>{if((e.target as HTMLDetailsElement).open&&open?.id!==m.id)void openDetail(m);}}>
    <summary className="fold-summary"><strong>{m.title}</strong><small className="muted">{m.status_label} · {m.repo_full_name} · {m.verdict_label}{m.pr_number?' · PR #'+m.pr_number:''}</small></summary>
    <div className="fold-body stack">{open?.id===m.id?<MissionDetail m={open} busy={busy} run={run} reload={()=>openDetail(m)} setNotice={setNotice}/>:<Loading/>}</div></details>)}
   <details className="fold"><summary className="fold-summary"><strong>Nouvelle mission</strong><small className="muted">brouillon sans IA, puis règles du dépôt, puis copie</small></summary><div className="fold-body stack">
    {!repos.length&&<p className="notice">Associez d’abord un dépôt GitHub à ce projet (section « Dépôts »).</p>}
    <Field label="Tâche du plan"><select value={form.task_id} onChange={e=>{const t=plan.tasks.find((x:any)=>x.id===e.target.value);setForm({...form,task_id:e.target.value,title:form.title||t?.title||''});}}><option value="">Aucune (je remplirai moi-même)</option>{plan.tasks.map((t:any)=><option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
    <Field label="Dépôt visé"><select value={repoId} onChange={e=>setForm({...form,repository_id:e.target.value})}>{repos.map((r:any)=><option key={r.id} value={r.id}>{r.full_name}</option>)}</select></Field>
    <Field label="Titre"><input value={form.title} maxLength={160} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
    <fieldset><legend>Niveau</legend>
     <label className="check"><input type="radio" name="mission-level" checked={form.level==='short'} onChange={()=>setForm({...form,level:'short'})}/>Court (par défaut) : le nécessaire pour une tâche ordinaire</label>
     <label className="check"><input type="radio" name="mission-level" checked={form.level==='full'} onChange={()=>setForm({...form,level:'full'})}/>Complet : ajoute le contexte (gros chantier ou contexte nouveau)</label></fieldset>
    {features.length>0&&<fieldset><legend>Fonctionnalités concernées</legend>{features.filter((f:any)=>f.life?.status==='current').map((f:any)=><label className="check" key={f.id}><input type="checkbox" checked={form.feature_ids.includes(f.id)} onChange={()=>toggle('feature_ids',f.id)}/>{f.code} — {f.name}</label>)}</fieldset>}
    {current.length>0&&<fieldset><legend>Décisions actuelles à citer</legend>{current.map((d:any)=><label className="check" key={d.id}><input type="checkbox" checked={form.decision_ids.includes(d.id)} onChange={()=>toggle('decision_ids',d.id)}/>{d.title}</label>)}</fieldset>}
    <Button disabled={busy||!repoId||(!form.task_id&&!form.title.trim())} onClick={()=>void run(async()=>{const m=await post('/missions',{project_id:id,task_id:form.task_id||null,repository_id:repoId,level:form.level,title:form.title.trim()||undefined,feature_ids:form.feature_ids,decision_ids:form.decision_ids});setForm({task_id:'',repository_id:'',level:'short',title:'',feature_ids:[],decision_ids:[]});setNotice('Brouillon créé : ouvrez-le dans la liste, complétez-le, lisez les règles du dépôt, puis préparez-le.');return m;})}>Créer le brouillon</Button>
   </div></details>
  </div></details>;
}

function MissionDetail({m,busy,run,reload,setNotice}:{m:any;busy:boolean;run:(fn:()=>Promise<any>)=>Promise<void>;reload:()=>Promise<void>;setNotice:(s:string)=>void}){
 const draft=m.status==='draft',[fields,setFields]=useState<any>(m.fields),[allow,setAllow]=useState(false),[conns,setConns]=useState<any[]>([]),[conn,setConn]=useState(''),[ret,setRet]=useState<any>(null),[note,setNote]=useState('');
 const [reg,setReg]=useState<any>({executor_family:m.executor_family,executor_model:m.executor_model,executor_effort:m.executor_effort,executor_why:m.executor_why,pr_number:m.pr_number?String(m.pr_number):'',report_text:m.report_text||'',input_tokens:m.input_tokens??'',output_tokens:m.output_tokens??'',cost_usd:m.cost_usd??''});
 useEffect(()=>{if(draft)api('/connections').then(r=>{const ok=(r.items||[]).filter((c:any)=>['mistral','gemini','groq'].includes(c.provider)&&c.status==='connected'&&c.api_consent);setConns(ok);setConn(ok[0]?.id||'');}).catch(()=>{});},[draft]);
 const changed=JSON.stringify(fields)!==JSON.stringify(m.fields);
 const model=conns.find(c=>c.id===conn);let models:string[]=[];try{models=JSON.parse(model?.models||'[]');}catch{/* modèles illisibles */}
 const [aiModel,setAiModel]=useState('');
 async function copy(){
  try{await navigator.clipboard.writeText(m.rendered);}catch{run(async()=>{throw new Error('La copie a échoué sur cet appareil. Utilisez « Télécharger ».');});return;}
  await run(async()=>{await post(`/missions/${m.id}/transfer`,{mode:'clipboard'});setNotice('Texte copié. Le statut est « Copiée » : Atelier ne sait pas si vous l’avez collé ailleurs.');await reload();});
 }
 async function exportFile(){
  try{await download(`/missions/${m.id}/export`,'mission.md');}catch(e){await run(async()=>{throw e;});return;}
  await run(async()=>{await post(`/missions/${m.id}/transfer`,{mode:'download'});setNotice('Texte téléchargé. Le statut est « Exportée ».');await reload();});
 }
 const num=(v:string)=>v===''||v===null?null:Number(v);
 return <>
  {m.preview_error&&<p className="notice">{m.preview_error}</p>}
  <p className="muted"><strong>{m.status_label}</strong> · dépôt {m.repo_full_name} · {RULES[m.rules.state]}{m.rules.commit?' (commit '+m.rules.commit.slice(0,12)+')':''}{m.draft_source==='ai'&&!m.reviewed_at?' · ⚠ Hypothèse : reformulé par une IA, pas encore relu':''}</p>
  {m.advice_line&&<p className="muted">Conseil de modèle (règles d’Atelier, pas une mesure) : {m.advice_line}</p>}
  {draft&&<div className="stack">
   {FIELDS.map(([k,label,rows])=><Field key={k} label={label}><textarea rows={rows} value={fields[k]} maxLength={3000} onChange={e=>setFields({...fields,[k]:e.target.value})}/></Field>)}
   {m.gaps?.length>0&&<p className="notice">Il manque encore : {m.gaps.join(', ')}. Sans cela, Claude Code poserait des questions.</p>}
   <Button kind="secondary" disabled={busy||!changed} onClick={()=>void run(async()=>{await patch(`/missions/${m.id}`,{revision:m.revision,fields});setNotice('Brouillon enregistré.');await reload();})}>Enregistrer le brouillon</Button>
   {changed&&<p className="muted">Enregistrez avant de lire les règles ou de préparer la mission.</p>}
   <Button disabled={busy||changed} onClick={()=>void run(async()=>{const r=await post(`/missions/${m.id}/read-rules`,{});setNotice(r.read_error?'Règles non lues : '+r.read_error:r.rules.state==='no_rule_files'?'Lecture faite : ce dépôt n’a ni CLAUDE.md ni AGENTS.md. La mission le dit.':'Règles lues : '+r.rules.kept+' retenue(s), '+r.rules.ignored+' ignorée(s) (partage Codex/Claude).');await reload();})}>Lire les règles du dépôt (lecture seule)</Button>
   {conns.length>0&&<div className="stack"><h4>Reformuler avec une IA gratuite (facultatif)</h4><p className="muted">Votre propre clé est utilisée ; une seule demande, jamais rejouée. Le résultat reste une hypothèse tant que vous ne l’avez pas relu.</p>
    <Field label="Connexion"><select value={conn} onChange={e=>{setConn(e.target.value);setAiModel('');}}>{conns.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
    <Field label="Modèle"><select value={aiModel||models[0]||''} onChange={e=>setAiModel(e.target.value)}>{models.map(x=><option key={x} value={x}>{x}</option>)}</select></Field>
    <Button kind="secondary" disabled={busy||changed||!models.length} onClick={()=>void run(async()=>{await post(`/missions/${m.id}/rephrase`,{connection_id:conn,model:aiModel||models[0]});setNotice('Texte reformulé : relisez-le attentivement.');await reload();})}>Reformuler l’objectif, le périmètre et le critère</Button></div>}
   {m.draft_source==='ai'&&<div className="stack"><Button kind="secondary" disabled={busy} onClick={()=>void run(async()=>{await post(`/missions/${m.id}/reviewed`,{});await reload();})}>J’ai relu ce texte</Button><Button kind="text" disabled={busy} onClick={()=>void run(async()=>{await post(`/missions/${m.id}/restore-draft`,{});await reload();})}>Revenir au brouillon sans IA</Button></div>}
   {!['read','no_rule_files'].includes(m.rules.state)&&<label className="check"><input type="checkbox" checked={allow} onChange={e=>setAllow(e.target.checked)}/>Préparer quand même sans les règles du dépôt (la mission le dira en toutes lettres)</label>}
   <Button disabled={busy||changed||Boolean(m.preview_error)} onClick={()=>void run(async()=>{await post(`/missions/${m.id}/ready`,{allow_without_rules:allow});setNotice('Mission figée : « Prête à copier ».');await reload();})}>Préparer la mission (figer le texte)</Button>
   <Button kind="text danger" disabled={busy} onClick={()=>void run(()=>remove(`/missions/${m.id}`))}>Supprimer le brouillon</Button>
  </div>}
  {m.rendered&&<details open={!draft}><summary>{draft?'Aperçu exact du texte':'Texte figé (identique à ce qui est copié)'}</summary><pre className="handoff-preview">{m.rendered}</pre>{m.content_hash&&<small className="muted">Empreinte SHA-256 : {m.content_hash.slice(0,16)}…</small>}</details>}
  {!draft&&<div className="stack"><Button disabled={busy} onClick={()=>void copy()}>Copier le texte exact</Button><Button kind="secondary" disabled={busy} onClick={()=>void exportFile()}>Télécharger</Button></div>}
  {!draft&&<div className="stack"><h4>Registre : qui a fait le travail ?</h4>
   <p className="muted">À remplir par vous, d’après ce que vous avez réellement utilisé. Atelier n’invente rien : sans valeur saisie, le coût reste « inconnu ».</p>
   <Field label="IA utilisée"><select value={reg.executor_family} onChange={e=>setReg({...reg,executor_family:e.target.value})}>{Object.entries(FAMILY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Modèle exact (facultatif)"><input value={reg.executor_model} maxLength={120} onChange={e=>setReg({...reg,executor_model:e.target.value})}/></Field>
   <Field label="Effort"><select value={reg.executor_effort} onChange={e=>setReg({...reg,executor_effort:e.target.value})}>{Object.entries(EFFORT).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Pourquoi ce choix ?"><textarea rows={2} value={reg.executor_why} maxLength={1000} onChange={e=>setReg({...reg,executor_why:e.target.value})}/></Field>
   <Field label="Numéro de la PR (quand elle existe)"><input inputMode="numeric" value={reg.pr_number} onChange={e=>setReg({...reg,pr_number:e.target.value.replace(/\D/g,'')})}/></Field>
   <Field label="Rapport rendu par Claude Code (collé tel quel, facultatif)"><textarea rows={4} value={reg.report_text} maxLength={20000} onChange={e=>setReg({...reg,report_text:e.target.value})}/></Field>
   <Field label="Jetons envoyés (si connus)"><input inputMode="numeric" value={reg.input_tokens} onChange={e=>setReg({...reg,input_tokens:e.target.value.replace(/\D/g,'')})}/></Field>
   <Field label="Jetons reçus (si connus)"><input inputMode="numeric" value={reg.output_tokens} onChange={e=>setReg({...reg,output_tokens:e.target.value.replace(/\D/g,'')})}/></Field>
   <p className="muted">Consommation : {m.usage_source==='none'?'inconnue':'déclarée par vous'}{m.cost_usd!==null?' · '+m.cost_usd+' $':''}</p>
   <Button kind="secondary" disabled={busy} onClick={()=>void run(async()=>{await patch(`/missions/${m.id}/registry`,{executor_family:reg.executor_family,executor_model:reg.executor_model,executor_effort:reg.executor_effort,executor_why:reg.executor_why,pr_number:num(reg.pr_number),report_text:reg.report_text,input_tokens:num(reg.input_tokens),output_tokens:num(reg.output_tokens)});setNotice('Registre enregistré.');await reload();})}>Enregistrer dans le registre</Button>
  </div>}
  {!draft&&<div className="stack"><h4>Retour du dépôt</h4>
   <Button kind="secondary" disabled={busy||!m.pr_number} onClick={()=>void run(async()=>{setRet(await api(`/missions/${m.id}/return`));})}>{m.pr_number?'Lire la PR #'+m.pr_number+' sur GitHub':'Indiquez d’abord le numéro de la PR'}</Button>
   {ret&&ret.linked&&<ul className="plain">
    {ret.pr&&<li>PR : <a href={ret.pr.url} target="_blank" rel="noreferrer">#{m.pr_number} — {ret.pr.title}</a> ({ret.pr.state}{ret.pr.draft?', brouillon':''})</li>}
    <li><strong>{CHECKS[ret.checks_state]}</strong> — {ret.checks_label}</li>
    {ret.checks.map((c:any)=><li key={c.name} className="muted">{c.name} : {c.conclusion||c.status}</li>)}
    {ret.review&&<li>{ret.review.label}</li>}{ret.error&&<li className="muted">{ret.error}</li>}</ul>}
   {ret&&!ret.linked&&<p className="muted">{ret.checks_label}</p>}
   <p className="muted">Verdict actuel : <strong>{m.verdict_label}</strong>{m.verdict_at?' · '+date(m.verdict_at):''}{m.evidence?' · preuve gardée : '+(CHECKS[m.evidence.checks_state]||'')+(m.evidence.review?' · '+m.evidence.review.label:''):''}</p>
   <Field label="Pourquoi ce verdict ? (obligatoire pour accepter sans tests verts)"><textarea rows={2} value={note} maxLength={1000} onChange={e=>setNote(e.target.value)}/></Field>
   <div className="stack"><Button disabled={busy} onClick={()=>void run(async()=>{await post(`/missions/${m.id}/verdict`,{verdict:'accepted',note});await reload();})}>Acceptée</Button>
    <Button kind="secondary" disabled={busy} onClick={()=>void run(async()=>{await post(`/missions/${m.id}/verdict`,{verdict:'redo',note});await reload();})}>À refaire</Button>
    <Button kind="text" disabled={busy} onClick={()=>void run(async()=>{await post(`/missions/${m.id}/verdict`,{verdict:'abandoned',note});await reload();})}>Abandonnée</Button></div>
  </div>}
 </>;
}
