/* Lot 1 — « Modèle du projet » (noyau commun + modules activables) et module « Suivi des fonctionnalités ». */
import {useCallback,useEffect,useState} from 'react';
import {api,post,patch,put,date} from './api';
import {Button,Field,ErrorBox,Loading} from './ui';
import {LifeBadge,LifecycleEditor,ReliabilityBadge} from './Lifecycle';
import {CORE_PARTS,FEATURE_SOURCES,FEATURE_STATE_LABEL} from '../server/lifecycle-core';
function Fold({title,summary,open,children}:{title:string;summary?:string;open?:boolean;children:React.ReactNode}){
 return <details className="fold" open={open}><summary className="fold-summary"><strong>{title}</strong>{summary&&<small className="muted">{summary}</small>}</summary><div className="fold-body">{children}</div></details>;
}
export function ModelSection({id,onChanged}:{id:string;onChanged:()=>void}){
 const [m,setM]=useState<any>(null),[tpl,setTpl]=useState<any[]>([]),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{const [a,b]=await Promise.all([api('/model/'+id),api('/model/templates')]);setM(a);setTpl(b.templates);}catch(e){setError(e);}},[id]);
 useEffect(()=>{void load();},[load]);
 async function save(body:any){setBusy(true);setError(null);try{setM(await put('/model/'+id+'/modules',body));onChanged();}catch(e){setError(e);}finally{setBusy(false);}}
 if(!m)return <Fold title="Modèle du projet" summary="chargement…"><ErrorBox error={error}/><Loading/></Fold>;
 const on=m.modules.filter((x:any)=>x.enabled).map((x:any)=>x.label);
 return <Fold title="Modèle du projet" summary={m.template_label+' · '+(on.length?on.join(', '):'aucun module')}>
  <ErrorBox error={error}/>
  <p className="muted">Tout projet a le même noyau : {CORE_PARTS.join(', ').toLowerCase()}. Les modules ci-dessous s’ajoutent selon vos besoins.</p>
  <Field label="Gabarit de départ" hint="Un gabarit ne fait que proposer des modules ; vous pouvez ensuite tout changer."><select value={m.template} disabled={busy} onChange={e=>void save({template:e.target.value})}>{tpl.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
  <div className="stack">{m.modules.map((x:any)=><label className="check" key={x.key}><input type="checkbox" checked={x.enabled} disabled={busy} onChange={e=>void save({modules:{[x.key]:e.target.checked}})}/><span><strong>{x.label}</strong>{x.skeleton&&<em> (emplacement vide pour l’instant)</em>}<br/><small className="muted">{x.help}</small></span></label>)}</div>
  {!m.explicit&&<p className="muted">Ce projet n’a pas encore de choix enregistré : les modules affichés viennent du gabarit « {m.template_label} ».</p>}
 </Fold>;
}
export function FeaturesSection({id,reloadKey}:{id:string;reloadKey:number}){
 const [list,setList]=useState<any>(null),[plan,setPlan]=useState<any>(null),[error,setError]=useState<unknown>(null),[all,setAll]=useState(false),[busy,setBusy]=useState(false),[open,setOpen]=useState('');
 const [f,setF]=useState({name:'',description:'',group_name:'',source_kind:'request',source_ref:''});
 const load=useCallback(async()=>{try{setList(await api(`/model/${id}/features${all?'?all=1':''}`));setError(null);}catch(e:any){if(e?.status===403)setList({disabled:true});else setError(e);}},[id,all]);
 useEffect(()=>{void load();},[load,reloadKey]);
 const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError(null);try{await fn();await load();}catch(e){setError(e);}finally{setBusy(false);}};
 if(!list)return <Fold title="Suivi des fonctionnalités" summary="chargement…"><ErrorBox error={error}/><Loading/></Fold>;
 if(list.disabled)return null;
 const groups=[...new Set(list.items.map((i:any)=>i.group_name||''))] as string[];
 return <Fold title="Suivi des fonctionnalités" summary={list.items.length+' fonctionnalité(s)'+(list.hidden?' · '+list.hidden+' masquée(s)':'')}>
  <ErrorBox error={error}/>
  <p className="muted">Une fonctionnalité est une chose que le projet doit savoir faire. Elle a un numéro stable (F-0001…) qui ne change jamais. Ce n’est pas une tâche : les tâches se trouvent dans le Plan.</p>
  <label className="check"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>Tout afficher (aussi ce qui est proposé, remplacé ou abandonné)</label>
  {list.items.length===0&&<p className="muted">Aucune fonctionnalité{all?'':' actuelle'} pour l’instant.</p>}
  {groups.map(g=><div key={g||'_'} className="stack">{g&&<h4>{g}</h4>}
   {list.items.filter((i:any)=>(i.group_name||'')===g).map((it:any)=><details className="fold" key={it.id} open={open===it.id} onToggle={e=>{if((e.target as HTMLDetailsElement).open)setOpen(it.id);}}>
    <summary className="fold-summary"><strong>{it.code} — {it.name}</strong><small className="muted">{it.state_label} · <ReliabilityBadge level={it.life.reliability}/> · <LifeBadge status={it.life.status}/></small></summary>
    <div className="fold-body stack">
     {it.description&&<p>{it.description}</p>}
     <p className="muted">Source : {FEATURE_SOURCES[it.source_kind as keyof typeof FEATURE_SOURCES]||it.source_kind}{it.source_ref?' — '+it.source_ref:''} · modifiée le {date(it.updated_at)}</p>
     {!['replaced','abandoned','rejected'].includes(it.life.status)&&<Field label="État"><select value={it.state} disabled={busy} onChange={e=>void run(()=>patch(`/model/${id}/features/${it.id}`,{state:e.target.value,revision:it.revision}))}>{Object.entries(FEATURE_STATE_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>}
     <LifecycleEditor project={id} kind="feature" item={{...it.life,id:it.id}} candidates={list.items.map((x:any)=>({id:x.id,code:x.code,title:x.name,status:x.life.status}))} onChanged={()=>void load()}/>
     {it.links.length>0&&<p className="muted">{it.links.length} lien(s) vers des tâches ou décisions.</p>}
     <LinkForm project={id} feature={it} onChanged={load} plan={plan} setPlan={setPlan}/>
    </div></details>)}
  </div>)}
  <div className="stack"><h4>Nouvelle fonctionnalité</h4>
   <Field label="Nom simple"><input value={f.name} maxLength={140} onChange={e=>setF({...f,name:e.target.value})}/></Field>
   <Field label="Description"><textarea rows={2} value={f.description} maxLength={3000} onChange={e=>setF({...f,description:e.target.value})}/></Field>
   <Field label="Groupe (facultatif)"><input value={f.group_name} maxLength={80} onChange={e=>setF({...f,group_name:e.target.value})}/></Field>
   <Field label="D’où vient cette idée ?"><select value={f.source_kind} onChange={e=>setF({...f,source_kind:e.target.value})}>{Object.entries(FEATURE_SOURCES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Précision de la source (conversation, fichier…)"><input value={f.source_ref} maxLength={300} onChange={e=>setF({...f,source_ref:e.target.value})}/></Field>
   <Button disabled={busy||!f.name.trim()} onClick={()=>void run(async()=>{await post(`/model/${id}/features`,{...f,name:f.name.trim()});setF({name:'',description:'',group_name:'',source_kind:'request',source_ref:''});})}>Ajouter la fonctionnalité</Button></div>
 </Fold>;
}
function LinkForm({project,feature,onChanged,plan,setPlan}:{project:string;feature:any;onChanged:()=>void;plan:any;setPlan:(p:any)=>void}){
 const [target,setTarget]=useState(''),[error,setError]=useState<unknown>(null);
 useEffect(()=>{if(!plan)Promise.all([api(`/spaces/${project}/plan`),api(`/spaces/${project}/decisions`)]).then(([p,d])=>setPlan({tasks:p.tasks,decisions:d.items})).catch(()=>{});},[plan,project,setPlan]);
 if(!plan)return null;
 const options=[...plan.tasks.map((t:any)=>({k:'task:'+t.id,label:'Tâche : '+t.title})),...plan.decisions.map((d:any)=>({k:'decision:'+d.id,label:'Décision : '+d.title}))].filter(o=>!feature.links.some((l:any)=>o.k===l.target_kind+':'+l.target_id));
 if(!options.length)return null;
 return <div className="stack"><ErrorBox error={error}/><Field label="Relier à une tâche ou une décision"><select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choisir…</option>{options.map(o=><option key={o.k} value={o.k}>{o.label}</option>)}</select></Field>
  <Button kind="secondary" disabled={!target} onClick={()=>{const [k,i]=target.split(':');post(`/model/${project}/features/${feature.id}/links`,{target_kind:k,target_id:i}).then(()=>{setTarget('');onChanged();}).catch(setError);}}>Relier</Button></div>;
}

/* Lot 4 — importer un fichier de départ : aperçu d'abord, puis ajout. Ne modifie ni ne supprime jamais rien. */
export function SeedImportSection({id,onImported}:{id:string;onImported:()=>void}){
 const [seed,setSeed]=useState<any>(null),[name,setName]=useState(''),[preview,setPreview]=useState<any>(null),[done,setDone]=useState<string>(''),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 async function choose(file:File|undefined){
  setSeed(null);setPreview(null);setDone('');setError(null);setName('');if(!file)return;
  if(file.size>300000){setError(new Error('Ce fichier est trop gros (plus de 300 Ko) : ce n’est pas un fichier de départ d’Atelier.'));return;}
  try{
   const data=JSON.parse(await file.text());setBusy(true);
   const r=await post(`/model/${id}/import?dry_run=1`,data);setSeed(data);setName(file.name);setPreview(r);
  }catch(e:any){setError(e instanceof SyntaxError?new Error('Ce fichier n’est pas lisible : choisissez le fichier « atelier-depart.json ».'):e);}
  finally{setBusy(false);}
 }
 async function go(){
  setBusy(true);setError(null);
  try{const r=await post(`/model/${id}/import`,seed);setDone(r.message);setPreview(null);setSeed(null);onImported();}catch(e){setError(e);}finally{setBusy(false);}
 }
 const sum=preview?.summary;
 return <Fold title="Importer un fichier de départ" summary="ajoute des fonctionnalités et des décisions, sans rien modifier">
  <p className="muted">Ce fichier ne fait qu’<strong>ajouter</strong> : il ne change et ne supprime rien de ce qui existe déjà. Si vous l’importez deux fois, la deuxième fois n’ajoute rien. Les décisions arrivent « Proposées » : c’est vous qui les validez, une par une.</p>
  <ErrorBox error={error}/>
  <Field label="Fichier de départ (.json)" hint="Par exemple atelier-depart.json. Un aperçu s’affiche avant tout ajout."><input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';void choose(f);}}/></Field>
  {busy&&<Loading/>}
  {done&&<div className="notice" role="status"><strong>{done}</strong></div>}
  {sum&&<div className="stack" role="status">
   <p><strong>Aperçu de « {name} » (rien n’est encore écrit) :</strong></p>
   <ul className="plain"><li>Fonctionnalités à ajouter : <strong>{sum.features.new}</strong> · déjà présentes : {sum.features.already_present}</li><li>Décisions à ajouter : <strong>{sum.decisions.new}</strong> · déjà présentes : {sum.decisions.already_present}</li></ul>
   {sum.features.new+sum.decisions.new===0?<p className="muted">Tout est déjà présent : il n’y a rien à ajouter.</p>:<Button disabled={busy} onClick={()=>void go()}>Ajouter {sum.features.new} fonctionnalité(s) et {sum.decisions.new} décision(s)</Button>}
  </div>}
 </Fold>;
}
