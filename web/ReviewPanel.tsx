import {useEffect,useState} from 'react';
import {api,post,date} from './api';
import {Button,ErrorBox,Empty,Field} from './ui';
import {CheckCircle2,RefreshCw,ShieldAlert} from 'lucide-react';

type Choice={connection_id:string;model:string};
const statuses:Record<string,string>={queued:'En attente',running:'Analyse en cours',completed:'Analysée',partial:'Relecture partielle',interrupted:'Interrompue',stale:'Ancienne version'};
export function ReviewPanel({project}:{project:string}){
 const [repos,setRepos]=useState<any[]>([]),[connections,setConnections]=useState<any[]>([]);
 const [configs,setConfigs]=useState<any[]>([]),[runs,setRuns]=useState<any[]>([]);
 const [repo,setRepo]=useState(''),[primary,setPrimary]=useState(''),[pModel,setPModel]=useState('');
 const [secondary,setSecondary]=useState(''),[sModel,setSModel]=useState('');
 const [enabled,setEnabled]=useState(false),[consent,setConsent]=useState(false);
 const [pulls,setPulls]=useState<any[]>([]),[selectedPR,setSelectedPR]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState('');
 const load=async()=>{
  const [r,c,cfg,history]=await Promise.all([
   api('/github/links?project='+encodeURIComponent(project)),
   api('/connections'),
   api('/reviews/configs?project='+encodeURIComponent(project)),
   api('/reviews/runs?project='+encodeURIComponent(project))
  ]);
  setRepos(r.items);setConnections(c.items.filter((v:any)=>v.status==='connected'&&v.api_consent&&v.scopes.includes('chat')));
  setConfigs(cfg.items);setRuns(history.items);
  setRepo(prev=>prev||r.items[0]?.id||'');
 };
 useEffect(()=>{void load().catch(setError);const timer=setInterval(()=>{if(!document.hidden&&navigator.onLine)void api('/reviews/runs?project='+encodeURIComponent(project)).then(r=>setRuns(r.items)).catch(()=>{});},15000);return()=>clearInterval(timer);},[project]);
 useEffect(()=>{if(!repo){setPulls([]);return;}void api('/reviews/pulls?repository_id='+encodeURIComponent(repo)).then(r=>{setPulls(r.items);setSelectedPR(p=>p||String(r.items[0]?.number||''));}).catch(setError);const cfg=configs.find(c=>c.repository_id===repo);if(cfg){setPrimary(cfg.primary_connection_id);setPModel(cfg.primary_model);setSecondary(cfg.secondary_connection_id||'');setSModel(cfg.secondary_model||'');setEnabled(Boolean(cfg.enabled));setConsent(Boolean(cfg.consent));}},[repo,configs]);
 const pConn=connections.find(c=>c.id===primary),sConn=connections.find(c=>c.id===secondary);
 function choose(setId:(v:string)=>void,setModel:(v:string)=>void,id:string){setId(id);setModel(connections.find(c=>c.id===id)?.models?.[0]||'');}
 async function act(fn:()=>Promise<any>,success:string){setBusy(true);setError(null);setNotice('');try{await fn();setNotice(success);await load();}catch(e){setError(e);}finally{setBusy(false);}}
 return <section className="panel">
  <div className="panel-heading"><div><h2>Chaîne de vérification des PR</h2><p>Atelier lit les changements et les tests GitHub, puis demande des analyses indépendantes aux API autorisées.</p></div><Button kind="secondary" onClick={()=>void load().catch(setError)}><RefreshCw size={16}/>Actualiser</Button></div>
  <p className="notice">Lecture seule : aucun fichier, commentaire, PR ou déploiement n'est modifié. Les conclusions IA ne remplacent pas les tests.</p>
  <ErrorBox error={error}/>{notice&&<p role="status" className="notice">{notice}</p>}
  {!repos.length?<Empty title="Aucun dépôt associé">Associez d'abord Livre-de-recettes ou un autre dépôt dans la rubrique « Dépôts GitHub ».</Empty>:<>
   <div className="stack">
    <Field label="Dépôt à surveiller"><select value={repo} onChange={e=>{setRepo(e.target.value);setSelectedPR('');setConsent(false);}}>{repos.map(r=><option key={r.id} value={r.id}>{r.full_name}</option>)}</select></Field>
    <Field label="Première IA — recherche des erreurs">
     <select value={primary} onChange={e=>choose(setPrimary,setPModel,e.target.value)}><option value="">Choisir une API connectée</option>{connections.map(c=><option key={c.id} value={c.id}>{c.label} · {c.provider}</option>)}</select>
    </Field>
    {pConn&&<Field label="Modèle principal"><select value={pModel} onChange={e=>setPModel(e.target.value)}>{pConn.models.map((m:string)=><option key={m} value={m}>{m}</option>)}</select></Field>}
    <Field label="Deuxième IA — vérification indépendante (facultative)">
     <select value={secondary} onChange={e=>choose(setSecondary,setSModel,e.target.value)}><option value="">Aucune, économiser le quota</option>{connections.filter(c=>c.id!==primary).map(c=><option key={c.id} value={c.id}>{c.label} · {c.provider}</option>)}</select>
    </Field>
    {sConn&&<Field label="Modèle de relecture"><select value={sModel} onChange={e=>setSModel(e.target.value)}>{sConn.models.map((m:string)=><option key={m} value={m}>{m}</option>)}</select></Field>}
    <label className="check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Analyser automatiquement les nouveaux commits des PR (au plus deux nouvelles analyses par passage du planificateur)</label>
    <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>J'autorise l'envoi des extraits de code sélectionnés aux API choisies et j'ai vérifié leurs conditions et leur absence de coût supplémentaire.</label>
    <p className="muted">Les secrets, fichiers sensibles et lignes suspectes sont écartés autant que possible, mais cette protection n'est pas infaillible : n'activez pas l'envoi de dépôts contenant des secrets. Atelier ne peut pas vérifier votre facturation fournisseur. Aucun essai payant n'est activé automatiquement.</p>
    <Button disabled={busy||!repo||!primary||!pModel||!consent||Boolean(secondary&&!sModel)} onClick={()=>void act(()=>post('/reviews/configs',{repository_id:repo,primary:{connection_id:primary,model:pModel},secondary:secondary?{connection_id:secondary,model:sModel}:null,enabled,share_consent:true}),'Configuration enregistrée.')}>Enregistrer la chaîne</Button>
   </div>
   <hr/>
   <h3>Lancer une analyse maintenant</h3>
   <Field label="Pull request ouverte"><select value={selectedPR} onChange={e=>setSelectedPR(e.target.value)}><option value="">Choisir la PR</option>{pulls.map(p=><option key={p.number} value={p.number}>#{p.number} · {p.title}</option>)}</select></Field>
   {!pulls.length&&<p className="muted">Aucune PR ouverte provenant de ce dépôt.</p>}
   <Button kind="secondary" disabled={busy||!selectedPR||!configs.some(c=>c.repository_id===repo)} onClick={()=>void act(()=>post('/reviews/start',{repository_id:repo,pr_number:Number(selectedPR)}),'Analyse demandée. Les résultats apparaîtront ci-dessous.')}>Analyser cette PR</Button>
  </>}
  <hr/>
  <h3>Rapports récents</h3>
  {!runs.length?<p className="muted">Aucune analyse réalisée pour ce projet.</p>:<div className="stack">{runs.map(r=><article className="panel" key={r.id}>
   <div className="panel-heading"><div><strong>{r.full_name} · PR #{r.pr_number}</strong><p>{statuses[r.status]||r.status} · {date(r.created_at)} · commit {r.head_sha.slice(0,8)}</p></div>{r.status==='completed'?<CheckCircle2 size={20}/>:<ShieldAlert size={20}/>}</div>
   {r.error&&<p className="muted">{r.error}</p>}
   {r.report&&<div className="stack">
    <p>Risque : <strong>{r.report.risk}</strong> · Tests GitHub consultés : {r.report.checks?.length||0} {r.report.checks_partial?'(liste incomplète)':''}</p>
    {(r.report.reviewers||[]).map((entry:any,i:number)=><section key={i}><h4>{entry.provider||'Vérificateur'} · {entry.model||entry.role}</h4>
     {entry.error?<p>{entry.error}</p>:<><p>{entry.review?.summary}</p>{entry.review?.unstructured&&<details><summary>Réponse à relire</summary><pre className="prewrap">{entry.review.unstructured}</pre></details>}{entry.review?.findings?.length?entry.review.findings.map((f:any,k:number)=><div className="notice" key={k}><strong>{f.severity} · {f.file}</strong><p>{f.reason}</p><p>À reproduire : {f.reproduction}</p></div>):<p className="muted">Aucune anomalie étayée dans l'extrait analysé. Ce n'est pas une certification.</p>}</>}
    </section>)}
    <small className="muted">{r.report.warning}</small>
   </div>}
  </article>)}</div>}
 </section>;
}
