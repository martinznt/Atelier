import {useEffect,useState} from 'react';
import {api,post,date} from './api';
import {Button,ErrorBox,Empty,Field} from './ui';
import {CheckCircle2,RefreshCw,ShieldAlert,Copy} from 'lucide-react';
import {recommendedReviewTeam} from '../server/review-team.mjs';
import {availabilityOf} from '../server/ai-availability';

type Choice={connection_id:string;model:string};
const statuses:Record<string,string>={queued:'En attente',running:'Analyse en cours',completed:'Analysée',partial:'Relecture partielle',interrupted:'Interrompue',stale:'Ancienne version'};
export function ReviewPanel({project}:{project:string}){
 const [repos,setRepos]=useState<any[]>([]),[connections,setConnections]=useState<any[]>([]);
 const [githubConnections,setGithubConnections]=useState<any[]>([]),[apiKey,setApiKey]=useState(''),[apiAgree,setApiAgree]=useState(false);
 const [configs,setConfigs]=useState<any[]>([]),[runs,setRuns]=useState<any[]>([]);
 const [repo,setRepo]=useState(''),[primary,setPrimary]=useState(''),[pModel,setPModel]=useState('');
 const [secondary,setSecondary]=useState(''),[sModel,setSModel]=useState('');
 const [relay,setRelay]=useState(true),[relayMax,setRelayMax]=useState(3),[usage,setUsage]=useState<any>(null),[notifyState,setNotifyState]=useState<string>(typeof Notification==='undefined'?'indisponible':Notification.permission),[mode,setMode]=useState('equilibre'),[postComment,setPostComment]=useState(false),[enabled,setEnabled]=useState(false),[consent,setConsent]=useState(false),[dailyLimit,setDailyLimit]=useState(2);
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
  void api('/reviews/usage?project='+encodeURIComponent(project)).then(setUsage).catch(()=>setUsage(null));
  setRepo(prev=>prev||r.items[0]?.id||'');
 };
 useEffect(()=>{void load().catch(setError);const timer=setInterval(()=>{if(!document.hidden&&navigator.onLine)void api('/reviews/runs?project='+encodeURIComponent(project)).then(r=>setRuns(r.items)).catch(()=>{});},15000);return()=>clearInterval(timer);},[project]);
 // Notification du navigateur : seulement quand Atelier est ouvert (ce n'est pas une notification poussée sur téléphone).
 useEffect(()=>{
  if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
  let seen:string[]=[];try{seen=JSON.parse(localStorage.getItem('atelier-notified')||'[]');}catch{/* stockage indisponible */}
  const fresh:string[]=[];
  for(const r of runs){
   const todo=r.report?.needs_user?.length?'needs':r.report?.waiting?'wait:'+r.report.waiting.resumes:null;
   if(!todo)continue;const key=r.id+':'+todo;if(seen.includes(key))continue;fresh.push(key);
   try{new Notification(todo==='needs'?'Atelier attend votre réponse':'Analyse en pause : limite atteinte',{body:'PR #'+r.pr_number+' · '+(todo==='needs'?r.report.needs_user[0].what:'reprise automatique prévue après réinitialisation'),tag:key});}catch{/* notification refusée par le navigateur */}
  }
  if(fresh.length){try{localStorage.setItem('atelier-notified',JSON.stringify([...seen,...fresh].slice(-100)));}catch{/* stockage indisponible */}}
 },[runs]);
 useEffect(()=>{if(!repo){setPulls([]);return;}void api('/reviews/pulls?repository_id='+encodeURIComponent(repo)).then(r=>{setPulls(r.items);setSelectedPR(p=>p||String(r.items[0]?.number||''));}).catch(setError);const cfg=configs.find(c=>c.repository_id===repo);if(cfg){setPrimary(cfg.primary_connection_id);setPModel(cfg.primary_model);setSecondary(cfg.secondary_connection_id||'');setSModel(cfg.secondary_model||'');setEnabled(Boolean(cfg.enabled));setPostComment(Boolean(cfg.post_comment));setMode(cfg.review_mode||'equilibre');setRelay(cfg.relay!==0);setRelayMax(cfg.relay_max_attempts||3);setConsent(Boolean(cfg.consent));setDailyLimit(cfg.daily_limit||2);}},[repo,configs]);
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
  try{await navigator.clipboard.writeText(text);setNotice('Dossier copié. Collez-le vous-même dans ChatGPT ou Claude Code : Atelier ne leur envoie rien automatiquement.');}catch{setError(Error('Copie automatique indisponible sur cet appareil.'));}
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
   {suggestion.primary&&<p className="muted">Sélection proposée : {connections.find(c=>c.id===suggestion.primary?.connection_id)?.label} · {suggestion.primary.model}{suggestion.secondary?' + '+connections.find(c=>c.id===suggestion.secondary?.connection_id)?.label+' · '+suggestion.secondary.model:''}. Cette suggestion n'est pas une garantie de gratuité.</p>}
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
     if(suggestion.primary){setPrimary(suggestion.primary?.connection_id);setPModel(suggestion.primary.model);setSecondary(suggestion.secondary?.connection_id||'');setSModel(suggestion.secondary?.model||'');}
    }}>Proposer automatiquement les IA et modèles disponibles</Button>
    <Field label="Première IA — recherche des erreurs">
     <select value={primary} onChange={e=>choose(setPrimary,setPModel,e.target.value)}><option value="">Choisir une API connectée</option>{connections.map(c=><option key={c.id} value={c.id}>{c.label} · {c.provider}</option>)}</select>
    </Field>
    {pConn&&<Field label="Modèle principal"><select value={pModel} onChange={e=>setPModel(e.target.value)}>{pConn.models.map((m:string)=><option key={m} value={m}>{m}</option>)}</select></Field>}
    <Field label="Deuxième IA — vérification indépendante (facultative)">
     <select value={secondary} onChange={e=>choose(setSecondary,setSModel,e.target.value)}><option value="">Aucune, économiser le quota</option>{connections.filter(c=>c.id!==primary).map(c=><option key={c.id} value={c.id}>{c.label} · {c.provider}</option>)}</select>
    </Field>
    {sConn&&<Field label="Modèle de relecture"><select value={sModel} onChange={e=>setSModel(e.target.value)}>{sConn.models.map((m:string)=><option key={m} value={m}>{m}</option>)}</select></Field>}
    <Field label="Mode de revue">
     <select value={mode} onChange={e=>setMode(e.target.value)}>
      <option value="economique">Économique · aucune IA si le changement est simple et les tests GitHub ont réussi, sinon une seule IA</option>
      <option value="equilibre">Équilibré · une IA, plus une relecture indépendante si le changement est fonctionnel ou sensible</option>
      <option value="approfondi">Approfondi · vérifications spécialisées (logique, sécurité, tests) seulement quand elles ajoutent une couverture</option>
     </select>
    </Field>
    <label className="check"><input type="checkbox" checked={relay} onChange={e=>setRelay(e.target.checked)}/>Relais automatique : si une IA atteint une limite, passer à une autre connexion IA que vous avez déjà autorisée et testée, sans intervention de votre part. Aucun achat ni changement de facturation n'est effectué ; vos extraits de code peuvent alors être envoyés à ces autres fournisseurs autorisés.</label>
    {relay&&<Field label="Appels IA maximum par vérification (protection contre les boucles)"><select value={relayMax} onChange={e=>setRelayMax(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}{n===3?' · recommandé':''}</option>)}</select></Field>}
    <p className="muted">Atelier n'utilise que vos connexions autorisées. Une IA qui signale une limite n'est pas rappelée pendant sa pause ; sans relais, aucune autre IA n'est sollicitée. Les raisons de chaque choix sont affichées dans le rapport.</p>
    <Field label="Maximum d'analyses par jour pour ce dépôt"><select value={dailyLimit} onChange={e=>setDailyLimit(Number(e.target.value))}><option value={1}>1 par jour · économie maximale</option><option value={2}>2 par jour · recommandé</option><option value={4}>4 par jour · vérifications fréquentes</option></select></Field>
    <label className="check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Analyser automatiquement les nouveaux commits des PR, dans le plafond journalier (8 maximum par compte).</label>
    <label className="check"><input type="checkbox" checked={postComment} onChange={e=>setPostComment(e.target.checked)}/>Publier le dossier de revue en commentaire de la PR. Nécessite un accès GitHub autorisé en « écriture » dans Atelier, limité aux commentaires côté GitHub. Le commentaire est visible par toutes les personnes ayant accès au dépôt. Aucun agent (Claude Code, ChatGPT) n'est lancé automatiquement.</label>
    <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>J'autorise l'envoi des extraits de code sélectionnés aux API choisies et j'ai vérifié leurs conditions et leur absence de coût supplémentaire.</label>
    <p className="muted">Les secrets, fichiers sensibles et lignes suspectes sont écartés autant que possible, mais cette protection n'est pas infaillible : n'activez pas l'envoi de dépôts contenant des secrets. Atelier ne peut pas vérifier votre facturation fournisseur. Aucun essai payant n'est activé automatiquement.</p>
    <Button disabled={busy||!repo||!primary||!pModel||!consent||Boolean(secondary&&!sModel)} onClick={()=>void act(()=>post('/reviews/configs',{repository_id:repo,primary:{connection_id:primary,model:pModel},secondary:secondary?{connection_id:secondary,model:sModel}:null,enabled,post_comment:postComment,mode,relay,relay_max_attempts:relayMax,daily_limit:dailyLimit,share_consent:true}),'Configuration enregistrée.')}>Enregistrer la chaîne</Button>
   </div>
   <hr/>
   <h3>Lancer une analyse maintenant</h3>
   <Field label="Pull request ouverte"><select value={selectedPR} onChange={e=>setSelectedPR(e.target.value)}><option value="">Choisir la PR</option>{pulls.map(p=><option key={p.number} value={p.number}>#{p.number} · {p.title}</option>)}</select></Field>
   {!pulls.length&&<p className="muted">Aucune PR ouverte provenant de ce dépôt.</p>}
   <Button kind="secondary" disabled={busy||!selectedPR||!configs.some(c=>c.repository_id===repo)} onClick={()=>void(async()=>{setBusy(true);setError(null);setNotice('');try{const res=await post('/reviews/start',{repository_id:repo,pr_number:Number(selectedPR)});setNotice(res.queued?'Analyse demandée. Les résultats apparaîtront ci-dessous.':'Aucune nouvelle analyse créée : ce commit a déjà une analyse (voir « Rapports récents » : utilisez « Relancer cette analyse » si elle est interrompue) ou un plafond journalier est atteint.');await load();}catch(e){setError(e);}finally{setBusy(false);}})()}>Analyser cette PR</Button>
  </>}
  <hr/>
  <h3>Disponibilité de vos IA</h3>
  {!connections.length?<p className="muted">Aucune IA connectée.</p>:<div className="stack">{connections.map(c=>{
   const nowIso=new Date().toISOString(),holds=Object.entries((()=>{try{const q=typeof c.quota==='string'?JSON.parse(c.quota):c.quota;return q?.holds||{};}catch{return {};}})()) as [string,any][];
   const a=availabilityOf(c,{model:c.models?.[0],now:nowIso});
   return <article className="panel" key={c.id}>
    <strong>{c.label} · {c.provider}</strong>
    <p>{a.usable?'Disponible':a.state==='blocked'?'Action requise de votre part':a.state==='held'?'Temporairement limitée':'Indisponible'} · {a.reason}</p>
    {a.until&&<p className="muted">Nouvel essai possible après {date(a.until)} · {a.until_source==='provider'?'date indiquée par le fournisseur':'pause de prudence d’Atelier (aucune date fournie par le fournisseur)'}.</p>}
    {holds.filter(([,h])=>h.hold_until&&Date.parse(h.hold_until)>Date.now()).map(([model,h])=><p className="muted" key={model}>Modèle {model} : {h.label}.</p>)}
    <p className="muted">{a.quota_known?'Limites connues du fournisseur : '+(a.known.remaining_requests!==undefined?a.known.remaining_requests+' requête(s) restante(s) ':'')+(a.known.remaining_tokens!==undefined?a.known.remaining_tokens+' jeton(s) restant(s)':'')+(Object.keys(a.known).length?'':'aucun compteur renvoyé.'):'Quota restant : inconnu (aucune information fiable du fournisseur).'}</p>
   </article>;})}</div>}
  {usage&&<><h3>Consommation observée par Atelier (30 jours)</h3><p className="muted">{usage.note}</p>
   {!usage.items.length?<p className="muted">Aucun appel IA enregistré.</p>:<div className="stack">{usage.items.map((u:any,i:number)=><p key={i}>{u.provider} · {u.model} · {u.task_kind==='review'?'revue':u.task_kind} : {u.calls} appel(s), {u.completed||0} terminé(s), {u.refused||0} refusé(s), {u.interrupted||0} interrompu(s) · jetons : {u.input_tokens===null?'inconnus':(u.input_tokens||0)+' entrée / '+(u.output_tokens||0)+' sortie'}{u.unknown_token_calls?' (+ '+u.unknown_token_calls+' appel(s) sans compteur)':''}</p>)}</div>}</>}
  {notifyState==='default'&&<Button kind="secondary" onClick={()=>void Notification.requestPermission().then(p=>setNotifyState(p))}>Activer les notifications du navigateur</Button>}
  {notifyState==='granted'&&<p className="muted">Notifications du navigateur actives tant qu'Atelier est ouvert. Elles ne remplacent pas une notification poussée sur téléphone, non disponible pour l'instant ; l'écran Activité conserve toutes les alertes.</p>}
  <hr/>
  <h3>Rapports récents</h3>
  {!runs.length?<p className="muted">Aucune analyse réalisée pour ce projet.</p>:<div className="stack">{runs.map(r=><article className="panel" key={r.id}>
   <div className="panel-heading"><div><strong>{r.full_name} · PR #{r.pr_number}</strong><p>{r.status==='queued'&&r.report?.waiting?'En pause : reprise automatique prévue':(statuses[r.status]||r.status)} · {date(r.created_at)} · commit {r.head_sha.slice(0,8)}</p></div>{r.status==='completed'?<CheckCircle2 size={20}/>:<ShieldAlert size={20}/>}</div>
   {r.error&&<p className="muted">{r.error}</p>}
   {r.diagnostic&&<details open><summary>Diagnostic de l’interruption</summary><ul>
    <li>PR #{r.pr_number} · commit {r.head_sha}</li>
    <li>Dernière étape réussie : {r.diagnostic.last_ok_stage||'aucune'} · Étape en échec : {r.diagnostic.stage}</li>
    <li>Catégorie : {r.diagnostic.category} · code {r.diagnostic.code}{r.diagnostic.provider?' · '+r.diagnostic.provider:''}</li>
    <li>Appel IA : {r.diagnostic.ai_result==='unknown'?'commencé, résultat inconnu':r.diagnostic.ai_started?'commencé, aucune génération reçue':'non effectué'}</li>
    <li>Nouvelle tentative : {r.diagnostic.retry_allowed?'possible (manuelle)':'non autorisée sans intervention'}</li>
   </ul></details>}
   {r.status==='interrupted'&&<div className="stack">
    {(!r.diagnostic||!r.diagnostic.retry_allowed)&&<p className="notice">{r.diagnostic?'La reprise n’est pas jugée sûre (résultat IA incertain ou accès à corriger). ':'Cette analyse est antérieure au diagnostic détaillé : un appel IA a pu avoir lieu. '}Relancer peut consommer du quota du fournisseur.</p>}
    <Button kind="secondary" disabled={busy} onClick={()=>void act(()=>post('/reviews/runs/'+r.id+'/retry',{acknowledge_uncertain:!r.diagnostic||!r.diagnostic.retry_allowed}),'Reprise demandée. Actualisez dans quelques instants.')}>Relancer cette analyse{(!r.diagnostic||!r.diagnostic.retry_allowed)?' (je confirme)':''}</Button>
   </div>}
   {r.report?.comment&&(r.report.comment.posted?<p className="notice">Dossier publié en commentaire de la PR{r.report.comment.url?<> : <a href={r.report.comment.url} target="_blank" rel="noreferrer">ouvrir sur GitHub</a></>:null}.</p>:<p className="notice">{r.report.comment.message}</p>)}
   {r.report?.plan&&<details open><summary>Plan de vérification · {r.report.plan.summary}</summary>{(r.report.plan.skipped||[]).length>0&&<ul>{r.report.plan.skipped.map((x:any,i:number)=><li key={i}>Non sollicité : {x.reason}</li>)}</ul>}</details>}
   {r.report?.waiting&&<p className="notice" role="status">Limite d'utilisation atteinte. Reprise automatique prévue vers {date(r.report.waiting.until)} ({r.report.waiting.source==='provider'?'date indiquée par le fournisseur':'pause de prudence d’Atelier : aucune date fournie par le fournisseur'}) · reprise {r.report.waiting.resumes}/{r.report.waiting.max_resumes}. Seules les vérifications non terminées seront refaites.</p>}
   {r.report?.needs_user?.length>0&&<div className="notice" role="status"><strong>À faire de votre part (Atelier continue les autres travaux en attendant)</strong><ul>{r.report.needs_user.map((t:any,i:number)=><li key={i}>{t.what} — {t.action}</li>)}</ul>{r.status==='partial'&&<Button kind="secondary" disabled={busy} onClick={()=>void act(()=>post('/reviews/runs/'+r.id+'/resume',{}),'Reprise demandée : seules les vérifications non terminées seront refaites.')}>J'ai validé, reprendre</Button>}</div>}
   {r.report?.checks_unavailable&&<p className="notice">Tests GitHub non lus : {r.report.checks_unavailable}</p>}
   {r.report&&<div className="stack">
    <p>Risque : <strong>{r.report.risk}</strong> · Tests GitHub consultés : {r.report.checks?.length||0} {r.report.checks_partial?'(liste incomplète)':''}</p>
    {r.report.handoff&&<div className="stack"><h4>Dossier de transmission (ChatGPT ou Claude Code)</h4><p className="muted">Synthèse générée à partir des tests et rapports des IA, sans appel IA supplémentaire. Chaque anomalie reste à reproduire.</p><pre className="prewrap" style={{maxHeight:280,overflow:'auto'}}>{r.report.handoff}</pre><Button kind="secondary" onClick={()=>void copyHandoff('Je te transmets un dossier de revue de PR généré par Atelier. Tu n’as pas accès à mon dépôt : donne un avis indépendant sur l’architecture, l’ergonomie et les risques, et réponds aux questions finales. Ne suppose pas que les anomalies sont prouvées.\n\n'+r.report.handoff)}><Copy size={16}/>Copier pour ChatGPT</Button><Button kind="secondary" onClick={()=>void copyHandoff('Reprends ce dossier de revue de PR généré par Atelier. Reproduis chaque anomalie par un test avant de corriger, puis lance les tests ciblés et la CI.\n\n'+r.report.handoff)}><Copy size={16}/>Copier pour Claude Code</Button></div>}
    {(r.report.reviewers||[]).map((entry:any,i:number)=><section key={i}><h4>{entry.provider||'Vérificateur'} · {entry.model||entry.role}</h4>{entry.reason&&<p className="muted">Pourquoi : {entry.reason}</p>}{(entry.attempts||[]).length>0&&(entry.relayed||entry.attempts.length>1||entry.error)&&<details open={Boolean(entry.relayed)}><summary>{entry.relayed?'Changement de fournisseur pendant cette vérification':'Tentatives IA'}</summary><ul>{entry.attempts.map((t:any,k:number)=><li key={k}>{t.provider} · {t.model} → {t.outcome==='completed'?'a répondu':t.outcome==='skipped'?'non sollicitée':t.outcome==='interrupted'?'réponse interrompue':'refus'}{t.kind_label?' : '+t.kind_label:''}{t.until?' · nouvel essai possible après '+date(t.until)+(t.until_source==='provider'?' (date du fournisseur)':' (pause d’Atelier)'):''}{t.outcome==='skipped'||t.outcome==='refused'?' — '+t.reason:''}</li>)}</ul></details>}
     {entry.partial&&<details><summary>Texte partiel conservé (incomplet, à ne pas lire comme un résultat)</summary><pre className="prewrap">{entry.partial.text}</pre></details>}{entry.reasoning&&<p className="muted">Réflexion : {entry.reasoning.effort?({low:'légère',medium:'moyenne',high:'élevée'} as any)[entry.reasoning.effort]:'par défaut du fournisseur'} · {entry.reasoning.reason}</p>}
     {entry.error?<p>{entry.error}</p>:<><p>{entry.review?.summary}</p>{entry.review?.unstructured&&<details><summary>Réponse à relire</summary><pre className="prewrap">{entry.review.unstructured}</pre></details>}{entry.review?.findings?.length?entry.review.findings.map((f:any,k:number)=><div className="notice" key={k}><strong>{f.severity} · {f.file}</strong><p>{f.reason}</p><p>À reproduire : {f.reproduction}</p></div>):<p className="muted">Aucune anomalie étayée dans l'extrait analysé. Ce n'est pas une certification.</p>}</>}
    </section>)}
    <small className="muted">{r.report.warning}</small>
   </div>}
  </article>)}</div>}
 </section>;
}
