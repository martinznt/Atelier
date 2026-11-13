/* Travail avec Claude : quel modèle utiliser, relevés de quota saisis, points de reprise, retours de travail.
   Rien n'est mesuré automatiquement : l'écran le dit, et chaque valeur porte sa source. */
import {useCallback,useEffect,useState} from 'react';
import {api,post,patch,remove,date} from './api';
import {Button,Field,ErrorBox,SectionTitle,Loading} from './ui';
import {Fold} from './ProjectExtras';
export const KIND:Record<string,string>={mechanical_check:'Vérification mécanique',classification:'Classement ou extraction simple',documentation:'Documentation',development:'Développement courant',fix:'Correction',analysis:'Analyse ordinaire',review:'Relecture indépendante',audit:'Audit approfondi',architecture:'Architecture',blocker:'Blocage non résolu'};
export const COMPLEXITY:Record<string,string>={simple:'Simple',ordinary:'Ordinaire',complex:'Complexe',hard:'Très difficile'};
export const IMPORTANCE:Record<string,string>={low:'Faible',normal:'Normale',high:'Élevée',critical:'Critique'};
const FAMILY:Record<string,string>={all:'Tous modèles',haiku:'Haiku',sonnet:'Sonnet 5.5',opus:'Opus',fable:'Fable 5.2',other:'Autre'};
const SCOPE:Record<string,string>={session_5h:'Fenêtre de 5 heures',weekly:'Semaine (tous modèles)',weekly_model:'Semaine (un modèle)',spend:'Crédits d’usage',other:'Autre limite'};
const SOURCE:Record<string,string>={usage_screen:'relevé par vous sur /usage',statusline_json:'collé depuis la ligne d’état',screenshot:'relevé sur une capture',declared:'déclaré par vous'};
const COST:Record<string,string>={low:'faible',medium:'moyen',high:'élevé'};
const OUTCOME:Record<string,string>={done:'terminé',partial:'partiel',failed:'échec'};
const localIso=(v:string)=>v?new Date(v).toISOString():null;
const copy=async(text:string,ok:(s:string)=>void,ko:(e:unknown)=>void)=>{try{await navigator.clipboard.writeText(text);ok('Copié.');}catch{ko(new Error('La copie a échoué sur cet appareil.'));}};

export function AdviceCard({advice}:{advice:any}){
 if(!advice)return null;
 return <div className="next-step advice"><span className="eyebrow">MODÈLE CONSEILLÉ</span><strong>{advice.line}</strong>
  <span>Vérification : {advice.verification_label} · risque de coût {COST[advice.cost_risk]}</span>
  <ul className="plain">{advice.reasons.map((r:string,i:number)=><li key={'r'+i}>{r}</li>)}{advice.warnings.map((r:string,i:number)=><li key={'w'+i}><strong>Attention :</strong> {r}</li>)}</ul>
  {advice.savings.length>0&&<details><summary>Comment économiser ({advice.savings.length})</summary><ul className="plain">{advice.savings.map((r:string,i:number)=><li key={i}>{r}</li>)}</ul></details>}
  {advice.assumed.length>0&&<small className="muted">{advice.assumed.join(' ')}</small>}<small className="muted">{advice.basis}</small></div>;
}

export function ClaudePilot({refresh}:{refresh:number}){
 const [tab,setTab]=useState(()=>{try{return sessionStorage.getItem('atelier:claude-onglet')||'advice';}catch{return 'advice';}});
 useEffect(()=>{try{sessionStorage.setItem('atelier:claude-onglet',tab);}catch{/* stockage indisponible */}},[tab]);
 const tabs:[string,string][]=[['advice','Quel modèle'],['quotas','Quotas'],['resume','Reprise'],['sessions','Retours']];
 return <section className="memory-hub">
  <SectionTitle eyebrow="CLAUDE" title="Travailler sans gaspiller">Le bon modèle pour chaque tâche, vos limites relevées, et ce qu’il faut garder pour la prochaine session.</SectionTitle>
  <div className="space-tabs" role="tablist">{tabs.map(([k,v])=><button key={k} role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{v}</button>)}</div>
  {tab==='advice'?<AdviceTab/>:tab==='quotas'?<QuotaTab refresh={refresh}/>:tab==='resume'?<CheckpointTab refresh={refresh}/>:<SessionTab refresh={refresh}/>}
 </section>;
}

function AdviceTab(){
 const [f,setF]=useState({kind:'development',complexity:'ordinary',importance:'normal',failed_attempts:0,failure_analysed:false,whole_repo:false,has_tests:true,has_files:true}),[advice,setAdvice]=useState<any>(null),[error,setError]=useState<unknown>(null);
 useEffect(()=>{let alive=true;post('/claude/advise',f).then(a=>{if(alive){setAdvice(a);setError(null);}}).catch(e=>{if(alive)setError(e);});return()=>{alive=false;};},[f]);
 const sel=(label:string,key:'kind'|'complexity'|'importance',opts:Record<string,string>)=><Field label={label}><select value={f[key]} onChange={e=>setF({...f,[key]:e.target.value})}>{Object.entries(opts).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>;
 return <div className="stack">
  <ErrorBox error={error}/><AdviceCard advice={advice}/>
  <div className="panel stack">{sel('Type de travail','kind',KIND)}{sel('Complexité','complexity',COMPLEXITY)}{sel('Importance','importance',IMPORTANCE)}
   <Field label="Tentatives déjà échouées"><input type="number" min={0} max={99} value={f.failed_attempts} onChange={e=>setF({...f,failed_attempts:Math.max(0,Math.min(99,Number(e.target.value)||0))})}/></Field>
   {f.failed_attempts>0&&<label className="check"><input type="checkbox" checked={f.failure_analysed} onChange={e=>setF({...f,failure_analysed:e.target.checked})}/>L’échec précédent a été analysé</label>}
   <label className="check"><input type="checkbox" checked={f.has_files} onChange={e=>setF({...f,has_files:e.target.checked})}/>Je connais les fichiers concernés</label>
   <label className="check"><input type="checkbox" checked={f.has_tests} onChange={e=>setF({...f,has_tests:e.target.checked})}/>Il existe un test pour vérifier</label>
   <label className="check"><input type="checkbox" checked={f.whole_repo} onChange={e=>setF({...f,whole_repo:e.target.checked})}/>Je comptais faire relire tout le dépôt</label></div>
  <Fold title="La règle appliquée" summary="votre stratégie, pas une mesure"><ul className="plain">
   <li><strong>Aucun modèle</strong> : vérification mécanique → test automatisé.</li><li><strong>Haiku</strong> : classement et extraction simples, à faible enjeu.</li>
   <li><strong>Sonnet 5.5</strong> : tout le travail courant ; effort moyen, élevé seulement si c’est complexe.</li><li><strong>Opus</strong> : vérification indépendante d’un travail important, audit, architecture complexe.</li>
   <li><strong>Fable 5.2</strong> : blocage réel, après analyse de l’échec, ou architecture très difficile.</li></ul>
   <p className="muted">Dans une tâche du Pilotage, le conseil est calculé à partir du dossier de la tâche et inscrit dans la consigne.</p></Fold>
 </div>;
}

function QuotaTab({refresh}:{refresh:number}){
 const [data,setData]=useState<any>(null),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[shot,setShot]=useState<{name:string;sha:string;url:string}|null>(null);
 const [f,setF]=useState({scope:'session_5h',model_family:'all',used_percent:'',resets_at:'',source:'usage_screen',note:''}),[json,setJson]=useState(''),[rules,setRules]=useState<any[]>([]);
 const load=useCallback(()=>api('/claude/quotas').then(d=>{setData(d);setRules(d.alerts);}).catch(setError),[]);
 useEffect(()=>{void load();},[load,refresh]);
 const run=async(fn:()=>Promise<any>,ok:string)=>{setBusy(true);setError(null);setNotice('');try{await fn();setNotice(ok);await load();}catch(e){setError(e);}finally{setBusy(false);}};
 if(!data)return <><ErrorBox error={error}/><Loading/></>;
 return <div className="stack">
  <ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}
  {data.triggered.map((a:any,i:number)=><p className="notice" role="alert" key={i}><strong>Seuil atteint.</strong> {a.text} Passez aux tâches légères ou attendez la réinitialisation.</p>)}
  <div className="panel"><strong>Ce qui est réellement connu</strong><p className="muted">{data.truth.measured} {data.truth.entered}</p></div>
  {!data.latest.length?<p className="muted">Aucun relevé. Dans Claude Code, tapez <code>/usage</code>, puis recopiez ici les pourcentages et l’heure de réinitialisation.</p>:
   data.latest.map((r:any)=><div className="panel" key={r.id}><strong>{SCOPE[r.scope]}{r.model_family!=='all'?' · '+FAMILY[r.model_family]:''}</strong>
    {r.used_percent!==null&&<><div className="progress-line" aria-hidden="true"><span style={{width:r.used_percent+'%',opacity:r.state==='expired'?.35:1}}/></div><p>{r.used_percent} % utilisés{r.state==='expired'?' (au moment du relevé)':''}</p></>}
    <p className="muted">{r.resets_at?'Réinitialisation relevée : '+date(r.resets_at)+' · ':''}Relevé le {date(r.observed_at)} · {SOURCE[r.source]}{r.evidence_name?' · capture « '+r.evidence_name+' » (empreinte '+String(r.evidence_sha256).slice(0,10)+'…, restée sur votre appareil)':''}</p>
    <p className={r.state==='current'?'muted':'notice'}>{r.label}</p>{r.note&&<p className="muted">{r.note}</p>}
    <Button kind="text danger" disabled={busy} onClick={()=>void run(()=>remove(`/claude/quotas/${r.id}`),'Relevé supprimé.')}>Supprimer ce relevé</Button></div>)}
  <Fold title="Ajouter un relevé" summary="depuis /usage, une capture ou une déclaration" open={!data.latest.length}>
   <Field label="Limite"><select value={f.scope} onChange={e=>setF({...f,scope:e.target.value})}>{Object.entries(SCOPE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Modèle"><select value={f.model_family} onChange={e=>setF({...f,model_family:e.target.value})}>{Object.entries(FAMILY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Pourcentage utilisé (0 à 100)"><input type="number" inputMode="decimal" min={0} max={100} step="0.1" value={f.used_percent} onChange={e=>setF({...f,used_percent:e.target.value})}/></Field>
   <Field label="Prochaine réinitialisation affichée" hint="Laissez vide si l’écran ne la donne pas."><input type="datetime-local" value={f.resets_at} onChange={e=>setF({...f,resets_at:e.target.value})}/></Field>
   <Field label="D’où vient cette valeur"><select value={f.source} onChange={e=>setF({...f,source:e.target.value})}><option value="usage_screen">Je la lis sur l’écran /usage</option><option value="screenshot">Je la lis sur une capture d’écran</option><option value="declared">Je la déclare de mémoire</option></select></Field>
   {f.source==='screenshot'&&<><Field label="Capture d’écran" hint="L’image reste sur cet appareil. Atelier ne la lit pas : vous recopiez les valeurs ; son nom et son empreinte sont gardés comme preuve."><input type="file" accept="image/*" onChange={async e=>{const file=e.target.files?.[0];if(!file){setShot(null);return;}try{const h=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());if(shot)URL.revokeObjectURL(shot.url);setShot({name:file.name.slice(0,200),sha:[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join(''),url:URL.createObjectURL(file)});}catch(err){setError(err);}}}/></Field>
    {shot&&<img className="quota-shot" src={shot.url} alt="Capture d’écran choisie, affichée pour recopier les valeurs"/>}</>}
   <Field label="Note"><input value={f.note} maxLength={500} onChange={e=>setF({...f,note:e.target.value})}/></Field>
   <Button disabled={busy||(f.used_percent===''&&!f.resets_at)||(f.source==='screenshot'&&!shot)} onClick={()=>void run(async()=>{await post('/claude/quotas',{scope:f.scope,model_family:f.model_family,used_percent:f.used_percent===''?null:Number(f.used_percent),resets_at:localIso(f.resets_at),source:f.source,evidence_name:f.source==='screenshot'?shot?.name:null,evidence_sha256:f.source==='screenshot'?shot?.sha:null,note:f.note});setF({...f,used_percent:'',resets_at:'',note:''});},'Relevé enregistré.')}>Enregistrer le relevé</Button>
  </Fold>
  <Fold title="Coller la ligne d’état de Claude Code" summary="le seul format officiel lisible par un script">
   <p className="muted">Claude Code transmet à la « ligne d’état » un JSON contenant <code>rate_limits</code> (5 heures et 7 jours) pour un abonnement. Si vous l’avez enregistré dans un fichier, collez-le ici : Atelier ne lit que les champs présents.</p>
   <Field label="JSON de la ligne d’état"><textarea rows={4} value={json} onChange={e=>setJson(e.target.value)}/></Field>
   <Button disabled={busy||json.trim().length<2} onClick={()=>void run(async()=>{const r=await post('/claude/quotas/import-statusline',{json});setJson('');setNotice(r.imported+' relevé(s) importé(s).');},'Import terminé.')}>Importer</Button>
  </Fold>
  <Fold title="Alertes" summary={rules.length?rules.filter(r=>r.enabled).length+' active(s)':'aucune'}>
   {rules.map((r,i)=><div className="panel stack" key={i}>
    <Field label="Limite"><select value={r.scope} onChange={e=>setRules(rules.map((x,j)=>j===i?{...x,scope:e.target.value}:x))}>{Object.entries(SCOPE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
    <Field label="Modèle"><select value={r.model_family} onChange={e=>setRules(rules.map((x,j)=>j===i?{...x,model_family:e.target.value}:x))}>{Object.entries(FAMILY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
    <Field label="Prévenir à partir de (%)"><input type="number" min={1} max={100} value={r.threshold} onChange={e=>setRules(rules.map((x,j)=>j===i?{...x,threshold:Math.max(1,Math.min(100,Number(e.target.value)||1))}:x))}/></Field>
    <label className="check"><input type="checkbox" checked={r.enabled} onChange={e=>setRules(rules.map((x,j)=>j===i?{...x,enabled:e.target.checked}:x))}/>Active</label>
    <Button kind="text danger" onClick={()=>setRules(rules.filter((_,j)=>j!==i))}>Retirer</Button></div>)}
   <Button kind="secondary" onClick={()=>setRules([...rules,{scope:'session_5h',model_family:'all',threshold:80,enabled:true}])}>Ajouter une alerte</Button>
   <Button disabled={busy} onClick={()=>void run(()=>api('/claude/alerts',{method:'PUT',body:JSON.stringify({alerts:rules})}),'Alertes enregistrées.')}>Enregistrer les alertes</Button>
   <p className="muted">Une alerte ne se déclenche que sur un relevé encore valable : Atelier ne devine pas votre consommation entre deux relevés.</p>
  </Fold>
  <Fold title="Répartition et travaux coûteux" summary="30 derniers jours, d’après vos retours de travail">
   {!data.by_model.length?<p className="muted">Aucun retour de travail enregistré.</p>:<ul className="plain">{data.by_model.map((m:any)=><li key={m.model_family}><strong>{FAMILY[m.model_family]}</strong> : {m.sessions} travail(aux){m.with_usage?' · '+m.with_usage+' avec consommation relevée'+(m.cost_usd!==null?' · '+Number(m.cost_usd).toFixed(2)+' $ estimés':''):' · consommation non relevée'}</li>)}</ul>}
   {data.top.length>0&&<><h4>Travaux ayant le plus consommé (relevés seulement)</h4><ul className="plain">{data.top.map((w:any)=><li key={w.id}>{w.title} — {FAMILY[w.model_family]}{w.cost_usd!==null?' · '+Number(w.cost_usd).toFixed(2)+' $':''}{w.output_tokens!==null?' · '+w.output_tokens+' jetons de sortie':''} · {date(w.worked_at)}</li>)}</ul></>}
   <p className="muted">{data.truth.cost}</p>
  </Fold>
  <Fold title="Historique des relevés" summary={data.history.length+' relevé(s)'}><ul className="plain">{data.history.map((h:any)=><li key={h.id}>{date(h.observed_at)} — {SCOPE[h.scope]}{h.model_family!=='all'?' · '+FAMILY[h.model_family]:''} : {h.used_percent===null?'sans pourcentage':h.used_percent+' %'} <span className="muted">({SOURCE[h.source]})</span></li>)}</ul></Fold>
 </div>;
}

const CP_FIELDS:[string,string,number][]=[['objective','Objectif du travail',2],['done','Ce qui est terminé',3],['remaining','Ce qui reste à faire',3],['decisions','Décisions importantes',2],['files_modified','Fichiers modifiés',2],['errors','Erreurs rencontrées',2],['tests','Tests effectués',2],['next_action','Prochaine action exacte',2]];
function CheckpointTab({refresh}:{refresh:number}){
 const [items,setItems]=useState<any[]|null>(null),[projects,setProjects]=useState<any[]>([]),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const blank={title:'',project_id:'',task_id:'',objective:'',done:'',remaining:'',decisions:'',files_modified:'',errors:'',tests:'',next_action:''};
 const [f,setF]=useState<any>(blank),[basis,setBasis]=useState('');
 const load=useCallback(()=>api('/claude/checkpoints').then(d=>setItems(d.items)).catch(setError),[]);
 useEffect(()=>{void load();api('/projects').then(r=>setProjects(r.items||[])).catch(()=>{});},[load,refresh]);
 const run=async(fn:()=>Promise<any>,ok:string)=>{setBusy(true);setError(null);setNotice('');try{await fn();setNotice(ok);await load();}catch(e){setError(e);}finally{setBusy(false);}};
 return <div className="stack">
  <ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}
  <p className="muted">Quand une session devient longue, chaque message renvoie tout l’historique. Écrivez un point de reprise, ouvrez une session neuve et collez-le : c’est le geste qui économise le plus.</p>
  <Fold title="Nouveau point de reprise" summary="pré-rempli depuis ce qui est enregistré" open={items!==null&&!items.length}>
   <Field label="Projet"><select value={f.project_id} onChange={e=>setF({...f,project_id:e.target.value})}><option value="">Sans projet</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
   {f.project_id&&<Button kind="secondary" disabled={busy} onClick={async()=>{try{const d=await api(`/claude/checkpoints/draft?project=${f.project_id}`);setF({...f,...Object.fromEntries(Object.entries(d).filter(([k])=>k in blank&&k!=='project_id'&&k!=='task_id')),title:f.title||d.title});setBasis(d.basis);}catch(e){setError(e);}}}>Pré-remplir depuis le projet</Button>}
   {basis&&<p className="muted">{basis}</p>}
   <Field label="Titre"><input value={f.title} maxLength={200} onChange={e=>setF({...f,title:e.target.value})}/></Field>
   {CP_FIELDS.map(([k,label,rows])=><Field label={label} key={k}><textarea rows={rows} value={f[k]} maxLength={k==='next_action'?2000:k==='objective'?4000:6000} onChange={e=>setF({...f,[k]:e.target.value})}/></Field>)}
   <Button disabled={busy||!f.title.trim()} onClick={()=>void run(async()=>{await post('/claude/checkpoints',{...f,project_id:f.project_id||null,task_id:null,title:f.title.trim()});setF(blank);setBasis('');},'Point de reprise enregistré.')}>Enregistrer le point de reprise</Button>
  </Fold>
  {!items?<Loading/>:items.map(c=><Fold key={c.id} title={c.title} summary={(c.project_name||'sans projet')+' · '+date(c.updated_at)+(c.gaps.length?' · incomplet':'')}>
   {c.gaps.length>0&&<p className="notice">Il manque : {c.gaps.join(', ')}. Sans cela, la reprise obligera Claude à tout redécouvrir.</p>}
   <pre className="handoff-preview">{c.text}</pre>
   <Button onClick={()=>void copy(c.text,setNotice,setError)}>Copier pour une session neuve</Button>
   <details><summary>Modifier</summary><CheckpointEdit c={c} busy={busy} save={d=>void run(()=>patch(`/claude/checkpoints/${c.id}`,{...d,revision:c.revision}),'Point de reprise mis à jour.')}/></details>
   <Button kind="text danger" disabled={busy} onClick={()=>{if(window.confirm('Supprimer ce point de reprise ?'))void run(()=>remove(`/claude/checkpoints/${c.id}`),'Point de reprise supprimé.');}}>Supprimer</Button>
  </Fold>)}
 </div>;
}
function CheckpointEdit({c,busy,save}:{c:any;busy:boolean;save:(d:any)=>void}){
 const [f,setF]=useState<any>(Object.fromEntries(CP_FIELDS.map(([k])=>[k,c[k]||''])));
 return <div className="stack">{CP_FIELDS.map(([k,label,rows])=><Field label={label} key={k}><textarea rows={rows} value={f[k]} onChange={e=>setF({...f,[k]:e.target.value})}/></Field>)}<Button disabled={busy} onClick={()=>save(f)}>Enregistrer</Button></div>;
}

const REPORT:[string,string][]=[['changes','Modifications effectuées'],['files_modified','Fichiers modifiés'],['tests_run','Tests réellement exécutés'],['results','Résultats'],['unresolved','Problèmes non résolus'],['decisions','Décisions prises'],['next_steps','Prochaines étapes']];
function SessionTab({refresh}:{refresh:number}){
 const [items,setItems]=useState<any[]|null>(null),[projects,setProjects]=useState<any[]>([]),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[raw,setRaw]=useState(''),[rest,setRest]=useState('');
 const blank={title:'',project_id:'',model_family:'sonnet',effort:'medium',outcome:'done',changes:'',files_modified:'',tests_run:'',results:'',unresolved:'',decisions:'',next_steps:'',usage_source:'none',cost_usd:'',output_tokens:''};
 const [f,setF]=useState<any>(blank);
 const load=useCallback(()=>api('/claude/sessions').then(d=>setItems(d.items)).catch(setError),[]);
 useEffect(()=>{void load();api('/projects').then(r=>setProjects(r.items||[])).catch(()=>{});},[load,refresh]);
 const run=async(fn:()=>Promise<any>,ok:string)=>{setBusy(true);setError(null);setNotice('');try{await fn();setNotice(ok);await load();}catch(e){setError(e);}finally{setBusy(false);}};
 const num=(v:string)=>v===''?null:Number(v);
 return <div className="stack">
  <ErrorBox error={error}/>{notice&&<p className="notice" role="status">{notice}</p>}
  <p className="muted">Après un travail de Claude Code, gardez ici ce qui a été fait et testé. La prochaine consigne sur la même tâche le reprendra, pour ne pas refaire l’analyse.</p>
  <Fold title="Enregistrer un retour" summary="collez la réponse, Atelier la classe" open={items!==null&&!items.length}>
   <Field label="Réponse de Claude Code" hint="Les titres demandés dans la consigne (« Modifications effectuées », « Tests réellement exécutés »…) sont reconnus."><textarea rows={5} value={raw} onChange={e=>setRaw(e.target.value)}/></Field>
   <Button kind="secondary" disabled={busy||!raw.trim()} onClick={async()=>{try{const p=await post('/claude/sessions/parse',{text:raw});setF({...f,...p.fields});setRest(p.unmatched);setNotice(p.found?p.found+' rubrique(s) reconnue(s). Relisez avant d’enregistrer.':'Aucun titre reconnu : remplissez les rubriques à la main.');}catch(e){setError(e);}}}>Classer la réponse</Button>
   {rest&&<details><summary>Texte non classé (conservé pour relecture, non enregistré)</summary><pre className="handoff-preview">{rest}</pre></details>}
   <Field label="Titre du travail"><input value={f.title} maxLength={200} onChange={e=>setF({...f,title:e.target.value})}/></Field>
   <Field label="Projet"><select value={f.project_id} onChange={e=>setF({...f,project_id:e.target.value})}><option value="">Sans projet</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
   <Field label="Modèle utilisé"><select value={f.model_family} onChange={e=>setF({...f,model_family:e.target.value})}>{['haiku','sonnet','opus','fable','other'].map(k=><option key={k} value={k}>{FAMILY[k]}</option>)}</select></Field>
   <Field label="Effort"><select value={f.effort} onChange={e=>setF({...f,effort:e.target.value})}><option value="">Inconnu</option><option value="low">Faible</option><option value="medium">Moyen</option><option value="high">Élevé</option><option value="xhigh">Très élevé</option><option value="max">Maximal</option></select></Field>
   <Field label="Issue"><select value={f.outcome} onChange={e=>setF({...f,outcome:e.target.value})}><option value="done">Terminé</option><option value="partial">Partiel</option><option value="failed">Échec</option></select></Field>
   {REPORT.map(([k,label])=><Field label={label} key={k}><textarea rows={2} value={f[k]} maxLength={6000} onChange={e=>setF({...f,[k]:e.target.value})}/></Field>)}
   <Field label="Consommation"><select value={f.usage_source} onChange={e=>setF({...f,usage_source:e.target.value})}><option value="none">Non relevée</option><option value="usage_screen">Lue sur l’écran /usage de la session</option><option value="declared">Déclarée de mémoire</option></select></Field>
   {f.usage_source!=='none'&&<><Field label="Coût estimé affiché ($)"><input type="number" inputMode="decimal" min={0} step="0.01" value={f.cost_usd} onChange={e=>setF({...f,cost_usd:e.target.value})}/></Field>
    <Field label="Jetons de sortie"><input type="number" inputMode="numeric" min={0} value={f.output_tokens} onChange={e=>setF({...f,output_tokens:e.target.value})}/></Field></>}
   <Button disabled={busy||!f.title.trim()||(f.usage_source!=='none'&&f.cost_usd===''&&f.output_tokens==='')} onClick={()=>void run(async()=>{await post('/claude/sessions',{...f,title:f.title.trim(),project_id:f.project_id||null,cost_usd:f.usage_source==='none'?null:num(f.cost_usd),output_tokens:f.usage_source==='none'?null:num(f.output_tokens)});setF(blank);setRaw('');setRest('');},'Retour enregistré.')}>Enregistrer le retour</Button>
  </Fold>
  {!items?<Loading/>:items.map(w=><Fold key={w.id} title={w.title} summary={FAMILY[w.model_family]+' · '+OUTCOME[w.outcome]+' · '+date(w.worked_at)+(w.project_name?' · '+w.project_name:'')}>
   {w.task_title&&<p className="muted">Tâche : {w.task_title}</p>}
   {REPORT.filter(([k])=>w[k]).map(([k,label])=><div key={k}><h4>{label}</h4><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{w[k]}</p></div>)}
   <p className="muted">{w.usage_source==='none'?'Consommation non relevée.':'Consommation '+(w.usage_source==='usage_screen'?'lue sur /usage':'déclarée')+(w.cost_usd!==null?' : '+Number(w.cost_usd).toFixed(2)+' $ estimés':'')+(w.output_tokens!==null?' · '+w.output_tokens+' jetons de sortie':'')+'.'}</p>
   <Button kind="text danger" disabled={busy} onClick={()=>{if(window.confirm('Supprimer ce retour ?'))void run(()=>remove(`/claude/sessions/${w.id}`),'Retour supprimé.');}}>Supprimer</Button>
  </Fold>)}
 </div>;
}
