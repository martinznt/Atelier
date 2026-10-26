import {useEffect,useState} from 'react';
import {api,post,date} from './api';
import {Button,ErrorBox,Empty,Field} from './ui';
import {CheckCircle2,RefreshCw,ShieldAlert,Copy} from 'lucide-react';
import {recommendedReviewTeam} from '../server/review-team.mjs';

type Choice={connection_id:string;model:string};
const statuses:Record<string,string>={queued:'En attente',running:'Analyse en cours',completed:'Analysée',partial:'Relecture partielle',interrupted:'Interrompue',stale:'Ancienne version'};
export function ReviewPanel({project}:{project:string}){
 const [repos,setRepos]=useState<any[]>([]),[connections,setConnections]=useState<any[]>([]);
 const [githubConnections,setGithubConnections]=useState<any[]>([]),[apiKey,setApiKey]=useState(''),[apiAgree,setApiAgree]=useState(false);
 const [configs,setConfigs]=useState<any[]>([]),[runs,setRuns]=useState<any[]>([]);
 const [repo,setRepo]=useState(''),[primary,setPrimary]=useState(''),[pModel,setPModel]=useState('');
 const [secondary,setSecondary]=useState(''),[sModel,setSModel]=useState('');
 const [enabled,setEnabled]=useState(false),[consent,setConsent]=useState(false),[dailyLimit,setDailyLimit]=useState(2);
 const [pulls,setPulls]=useState<any[]>([]),[selectedPR,setSelectedPR]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState('');
 const load=async()=>{
  const [r,c,cfg,history]=await Promise.all([
   api('/github/links?project='+encodeURIComponent(project)),
   api('/connections'),
   api('/reviews/configs?project='+encodeURIComponent(project)),
   api('/reviews/runs?project='+encodeURIComponent(project))
  ]);
  setRepos(r.items);setConnections(c.items.filter((v:any)=>v.provider!=='github'&&v.status==='connected'&&v.api_consent&&v.scopes.includes('chat')));
  setGithubConnections(c.items.filter((v:any)=>v.provider==='github'&&v.status==='connected'&&v.scopes.includes('read')));
  setConfigs(cfg.items);setRuns(history.items);
  setRepo(prev=>prev||r.items[0]?.id||'');
 };
 useEffect(()=>{void load().catch(setError);const timer=setInterval(()=>{if(!document.hidden&&navigator.onLine)void api('/reviews/runs?project='+encodeURIComponent(project)).then(r=>setRuns(r.items)).catch(()=>{});},15000);return()=>clearInterval(timer);},[project]);
 useEffect(()=>{if(!repo){setPulls([]);return;}void api('/reviews/pulls?repository_id='+encodeURIComponent(repo)).then(r=>{setPulls(r.items);setSelectedPR(p=>p||String(r.items[0]?.number||''));}).catch(setError);const cfg=configs.find(c=>c.repository_id===repo);if(cfg){setPrimary(cfg.primary_connection_id);setPModel(cfg.primary_model);setSecondary(cfg.secondary_connection_id||'');setSModel(cfg.secondary_model||'');setEnabled(Boolean(cfg.enabled));setConsent(Boolean(cfg.consent));setDailyLimit(cfg.daily_limit||2);}},[repo,configs]);
 useEffect(()=>{
  if(!connections.length||configs.some(c=>c.repository_id===repo))return;
  const suggestions=recommendedReviewTeam(connections);
  if(!primary&&suggestions.primary){setPrimary(suggestions.primary.connection_id);setPModel(suggestions.primary.model);}
  if(!secondary&&suggestions.secondary){setSecondary(suggestions.secondary.connection_id);setSModel(suggestions.secondary.model);}
 },[connections,configs,repo]);
 const suggestion=recommendedReviewTeam(connections);
 const pConn=connections.find(c=>c.id===primary),sConn=connections.find(c=>c.id===secondary);
 function choose(setId:(v:string)=>void,setModel:(v:string)=>void,id:string){setId(id);setModel(connections.find(c=>c.id===id)?.models?.[0]||'');}
 async function act(fn:()=>Promise<any>,success:string){setBusy(true);setError(null);setNotice('');try{await fn();setNotice(success);await load();}catch(e){setError(e);}finally{setBusy(false);}}
 async function connectMistral(){
  setBusy(true);setError(null);setNotice('');
  try{
   if(!apiAgree)throw Error('Confirmez que vous disposez d’une clé API autorisée et sans coût supplémentaire.');
   const created=await post('/connections',{provider:'mistral',label:'Mistral · vérification',secret:apiKey.trim(),scopes:['chat'],api_consent:true});
   setApiKey('');
   await post('/connections/'+encodeURIComponent(created.id)+'/test',{});
   await load();setNotice('Connexion Mistral testée. Atelier peut maintenant proposer une équipe de revue.');
  }catch(e){setError(e);}finally{setApiKey('');setBusy(false);}
 }
 async function linkRecipeRepo(){
  setBusy(true);setError(null);setNotice('');
  try{
   let found:any=null,connection='';
   for(const g of githubConnections){
    const list=await api('/github/repositories?connection='+encodeURIComponent(g.id));
    const candidate=list.items?.find((p:any)=>/\/Livre-de-recettes$/i.test(p.full_name));
    if(candidate){found=candidate;connection=g.id;break;}
   }
   if(!found)throw Error('Dépôt Livre-de-recettes introuvable parmi les 30 premiers dépôts autorisés. Utilisez « Dépôts GitHub » pour le relier.');
   await post('/github/links',{project_id:project,connection_id:connection,full_name:found.full_name,branch:found.default_branch||'main'});
   await load();setNotice('Livre de recettes relié au projet, sans modification du dépôt.');
  }catch(e){setError(e);}finally{setBusy(false);}
 }
 async function copyHandoff(text:string){
  try{await navigator.clipboard.writeText(text);setNotice('Plan de correction copié. Tu peux le transmettre directement à Codex.');}catch{setError(Error('Copie automatique indisponible sur cet appareil.'));}
 }
 return <section className="panel">
  <div className="panel-heading"><div><h2>Chaîne de vérification des PR</h2><p>Atelier lit les changements et les tests GitHub, puis demande des analyses indépendantes aux API autorisées.</p></div><Button kind="secondary" onClick={()=>void load().catch(setError)}><RefreshCw size={16}/>Actualiser</Button></div>
  <p className="notice">Lecture seule : aucun fichier, commentaire, PR ou déploiement n'est modifié. Les conclusions IA ne remplacent pas les tests.</p>
  <ErrorBox error={error}/>{notice&&<p role="status" className="notice">{notice}</p>}
  <div className="panel">
   <h3>Installation simplifiée</h3>
   <p>Atelier détecte les connexions déjà autorisées et prépare les IA automatiquement. Tu n'as pas à choisir les modèles un par un. Aucun appel IA n'est déclenché avant ton consentement.</p>
   <p><strong>1. GitHub :</strong> {repos.length?'Dépôt déjà associé.':githubConnections.length?'Connexion GitHub disponible.':'Connexion GitHub manquante dans Atelier.'}</p>
   {!repos.length&&githubConnections.length>0&&<Button kind="secondary" disabled={busy} onClick={()=>void linkRecipeRepo()}>Relier mon Livre de recettes automatiquement</Button>}
   {!repos.length&&!githubConnections.length&&<p className="muted">Une seule opération nécessaire : ajouter un jeton GitHub limité au dépôt dans Réglages → Connexions. L'accès GitHub de ChatGPT n'est pas transférable à Atelier.</p>}
   <p><strong>2. IA :</strong> {connections.length?connections.length+' connexion(s) déjà autorisée(s).':'Aucune API IA disponible.'}</p>
   {suggestion.primary&&<p className="muted">Sélection proposée : {connections.find(c=>c.id===suggestion.primary.connection_id)?.label} · {suggestion.primary.model}{suggestion.secondary?' + '+connections.find(c=>c.id===suggestion.secondary.connection_id)?.label+' · '+suggestion.secondary.model:''}. Cette suggestion n'est pas une garantie de gratuité.</p>}
   {!connections.length&&<div className="stack">
    <Field label="Clé Mistral Studio déjà autorisée"><input type="password" autoComplete="off" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="Coller la clé directement dans Atelier"/></Field>
    <label className="check"><input type="checkbox" checked={apiAgree} onChange={e=>setApiAgree(e.target.checked)}/>J'ai vérifié mon éligibilité aux conditions d'accès et confirmé que cette clé est utilisable sans paiement.</label>
    <Button kind="secondary" disabled={busy||!apiAgree||apiKey.trim().length<10} onClick={()=>void connectMistral()}>Enregistrer et tester cette connexion</Button>
    <p className="muted">La clé sera stockée chiffrée par Atelier. Ne la partage jamais dans une conversation ni dans GitHub. Les autres fournisseurs peuvent être configurés dans Réglages → Connexions selon les conditions de ton compte.</p>
   </div>}
   <p><strong>3. Vérifications :</strong> {configs.length?'Une configuration de revue existe déjà.':'Choisis une fois tes plafonds, puis enregistre la chaîne.'}</p>
  </div>
  {!repos.length?<Empty title="Aucun dépôt associé">La connexion GitHub pourra être reliée ci-dessus, ou via « Dépôts GitHub ».</Empty>:<>
   <div className="stack">
    <Field label="Dépôt à surveiller"><select value={repo} onChange={e=>{setRepo(e.target.value);setSelectedPR('');setConsent(false);}}>{repos.map(r=><option key={r.id} value={r.id}>{r.full_name}</option>)}</select></Field>
    <Button kind="text" disabled={busy||!suggestion.primary} onClick={()=>{
     if(suggestion.primary){setPrimary(suggestion.primary.connection_id);setPModel(suggestion.primary.model);setSecondary(suggestion.secondary?.connection_id||'');setSModel(suggestion.secondary?.model||'');}
    }}>Proposer automatiquement les IA et modèles disponibles</Button>
    <Field label="Première IA — recherche des erreurs">
     <select value={primary} onChange={e=>choose(setPrimary,setPModel,e.target.value)}><option value="">Choisir une API connectée</option>{connections.map(c=><option key={c.id} value={c.id}>{c.label} · {c.provider}</option>)}</select>
    </Field>
    {pConn&&<Field label="Modèle principal"><select value={pModel} onChange={e=>setPModel(e.target.value)}>{pConn.models.map((m:string)=><option key={m} value={m}>{m}</option>)}</select></Field>}
    <Field label="Deuxième IA — vérification indépendante (facultative)">
     <select value={secondary} onChange={e=>choose(setSecondary,setSModel,e.target.value)}><option value="">Aucune, économiser le quota</option>{connections.filter(c=>c.id!==primary).map(c=><option key={c.id} value={c.id}>{c.label} · {c.provider}</option>)}</select>
    </Field>
    {sConn&&<Field label="Modèle de relecture"><select value={sModel} onChange={e=>setSModel(e.target.value)}>{sConn.models.map((m:string)=><option key={m} value={m}>{m}</option>)}</select></Field>}
    <Field label="Maximum d'analyses par jour pour ce dépôt"><select value={dailyLimit} onChange={e=>setDailyLimit(Number(e.target.value))}><option value={1}>1 par jour · économie maximale</option><option value={2}>2 par jour · recommandé</option><option value={4}>4 par jour · vérifications fréquentes</option></select></Field>
    <label className="check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Analyser automatiquement les nouveaux commits des PR, dans le plafond journalier (8 maximum par compte).</label>
    <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>J'autorise l'envoi des extraits de code sélectionnés aux API choisies et j'ai vérifié leurs conditions et leur absence de coût supplémentaire.</label>
    <p className="muted">Les secrets, fichiers sensibles et lignes suspectes sont écartés autant que possible, mais cette protection n'est pas infaillible : n'activez pas l'envoi de dépôts contenant des secrets. Atelier ne peut pas vérifier votre facturation fournisseur. Aucun essai payant n'est activé automatiquement.</p>
    <Button disabled={busy||!repo||!primary||!pModel||!consent||Boolean(secondary&&!sModel)} onClick={()=>void act(()=>post('/reviews/configs',{repository_id:repo,primary:{connection_id:primary,model:pModel},secondary:secondary?{connection_id:secondary,model:sModel}:null,enabled,daily_limit:dailyLimit,share_consent:true}),'Configuration enregistrée.')}>Enregistrer la chaîne</Button>
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
    {r.report.handoff&&<div className="stack"><h4>Plan de correction préparé pour Codex</h4><p className="muted">Synthèse générée à partir des tests et rapports des IA, sans appel IA supplémentaire. Chaque anomalie reste à reproduire.</p><pre className="prewrap" style={{maxHeight:280,overflow:'auto'}}>{r.report.handoff}</pre><Button kind="secondary" onClick={()=>void copyHandoff(r.report.handoff)}><Copy size={16}/>Copier le rapport pour Codex</Button></div>}
    {(r.report.reviewers||[]).map((entry:any,i:number)=><section key={i}><h4>{entry.provider||'Vérificateur'} · {entry.model||entry.role}</h4>
     {entry.error?<p>{entry.error}</p>:<><p>{entry.review?.summary}</p>{entry.review?.unstructured&&<details><summary>Réponse à relire</summary><pre className="prewrap">{entry.review.unstructured}</pre></details>}{entry.review?.findings?.length?entry.review.findings.map((f:any,k:number)=><div className="notice" key={k}><strong>{f.severity} · {f.file}</strong><p>{f.reason}</p><p>À reproduire : {f.reproduction}</p></div>):<p className="muted">Aucune anomalie étayée dans l'extrait analysé. Ce n'est pas une certification.</p>}</>}
    </section>)}
    <small className="muted">{r.report.warning}</small>
   </div>}
  </article>)}</div>}
 </section>;
}
