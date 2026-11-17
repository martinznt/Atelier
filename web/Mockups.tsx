/* Lot 5B (5B-1) — Maquettes d'écran : une capture de votre téléphone en fond, des blocs posés dessus.
   À cette étape on crée, on pose des blocs et on relit. Déplacer, grouper et colorier viennent à l'étape suivante.
   Atelier ne produit aucun code de site. */
import {useCallback,useEffect,useState} from 'react';
import {api,post,put} from './api';
import {MockupEditor} from './MockupEditor';
import {MockupSheet} from './MockupSheet';
import {MockupGuide} from './MockupGuide';
import {MockupChat} from './MockupChat';
import type {Entry} from './mockup-edit';
import {Button,Confirm,ErrorBox,Field,Loading} from './ui';
import {CaptureError,MAX_CAPTURE_BYTES,blobToBase64,compressCapture} from './mockup-image';

/** Kilo-octets décimaux (1 Ko = 1 000 octets), comme les messages du serveur : la limite s'affiche « 180 Ko ». */
const ko=(n:number)=>(n/1000).toFixed(1).replace('.',',')+' Ko';

export function MockupsSection({id,repos=[]}:{id:string;repos?:any[]}){
 const [list,setList]=useState<any[]>([]),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false),[open,setOpen]=useState<string>(''),[form,setForm]=useState({title:'',page_name:''});
 const load=useCallback(async()=>{try{setList((await api(`/mockups?project=${id}`)).items);}catch(e){setError(e);}},[id]);
 useEffect(()=>{void load();},[load]);
 async function create(){
  setBusy(true);setError(null);
  try{const m=await post('/mockups',{project_id:id,title:form.title,page_name:form.page_name});setForm({title:'',page_name:''});await load();setOpen(m.id);}
  catch(e){setError(e);}finally{setBusy(false);}
 }
 return <details className="fold"><summary className="fold-summary"><strong>Maquettes d’écran</strong><small className="muted">{list.length?list.length+' maquette(s)':'aucune maquette'}</small></summary>
  <div className="fold-body stack">
   <p className="muted">Une maquette part <strong>d’une capture d’écran de votre téléphone</strong> : vous la déposez, puis vous posez des blocs (titre, bouton, carte…) exactement dessus. Atelier ne crée aucun code de site : plus tard, il préparera le texte à donner à Claude Code.</p>
   <ErrorBox error={error}/>
   {list.map(m=><details className="fold" key={m.id} open={open===m.id} onToggle={e=>{const o=(e.target as HTMLDetailsElement).open;if(o&&open!==m.id)setOpen(m.id);if(!o&&open===m.id)setOpen('');}}>
    <summary className="fold-summary"><strong>{m.title}</strong><small className="muted">{m.page_name?m.page_name+' · ':''}{m.has_image?'capture déposée':'sans capture'} · {m.block_count} bloc(s){m.start_fixed?' · écran de départ fixé':''}</small></summary>
    <div className="fold-body stack">{open===m.id&&<MockupView mockupId={m.id} onChanged={load} projectId={id} repos={repos}/>}</div></details>)}
   <details className="fold"><summary className="fold-summary"><strong>Nouvelle maquette</strong><small className="muted">un écran de votre site</small></summary><div className="fold-body stack">
    <Field label="Nom de la maquette"><input value={form.title} maxLength={160} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Ex. Accueil du livre"/></Field>
    <Field label="Page du site concernée (facultatif)" hint="Ce que vous voyez sur la capture, par exemple « Accueil » ou « Liste de courses ».">
     <input value={form.page_name} maxLength={160} onChange={e=>setForm({...form,page_name:e.target.value})}/></Field>
    <Button disabled={busy||!form.title.trim()} onClick={()=>void create()}>Créer la maquette</Button>
   </div></details>
  </div></details>;
}

function MockupView({mockupId,onChanged,projectId,repos}:{mockupId:string;onChanged:()=>Promise<void>;projectId:string;repos:any[]}){
 const [m,setM]=useState<any>(null),[img,setImg]=useState<string>(''),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [confirm,setConfirm]=useState(false),[hist,setHist]=useState<{undo:Entry[];redo:Entry[]}>({undo:[],redo:[]}),[palettes,setPalettes]=useState<any[]>([]);
 useEffect(()=>{api('/mockups/palettes').then(r=>setPalettes(r.palettes||[])).catch(()=>setPalettes([]));},[]);
 const reload=useCallback(async()=>{
  try{
   const d=await api(`/mockups/${mockupId}`);setM(d);
   if(d.has_image){const i=await api(`/mockups/${mockupId}/image`);setImg(`data:${i.mime};base64,${i.data}`);}else setImg('');
  }catch(e){setError(e);}
 },[mockupId]);
 useEffect(()=>{void reload();},[reload]);
 const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError(null);setNotice('');try{await fn();await reload();await onChanged();}catch(e){setError(e);}finally{setBusy(false);}};
 async function onFile(file:File|undefined){
  if(!file)return;
  await run(async()=>{
   let c;try{c=await compressCapture(file);}catch(e){throw e instanceof CaptureError?e:new Error('Cette image n’a pas pu être préparée.');}
   await put(`/mockups/${mockupId}/image`,{mime:c.mime,data:await blobToBase64(c.blob)});
   setNotice(`Capture enregistrée : ${c.width} × ${c.height} px, ${ko(c.bytes)} (limite ${ko(MAX_CAPTURE_BYTES)}), format ${c.mime.replace('image/','').toUpperCase()}.`);
  });
 }
 if(!m)return error?<ErrorBox error={error}/>:<Loading/>;
 const locked=Boolean(m.start_fixed),sc=m.screen_width,sh=m.screen_height;
 /** Envoie un lot d'opérations. Une modification faite ailleurs (409) recharge la maquette et vide l'historique : rien n'est appliqué à moitié. */
 async function send(ops:any[]):Promise<boolean>{
  setBusy(true);setError(null);setNotice('');
  try{const d=await post(`/mockups/${mockupId}/ops`,{revision:m.revision,ops});setM(d);await onChanged();return true;}
  catch(e:any){setError(e);if(e?.status===409){setHist({undo:[],redo:[]});await reload();}return false;}
  finally{setBusy(false);}
 }
 const apply=async(e:Entry)=>{if(await send(e.forward))setHist(h=>({undo:[...h.undo,e].slice(-50),redo:[]}));};
 const undo=async()=>{const e=hist.undo.at(-1);if(e&&await send(e.inverse))setHist(h=>({undo:h.undo.slice(0,-1),redo:[...h.redo,e]}));};
 const redo=async()=>{const e=hist.redo.at(-1);if(e&&await send(e.forward))setHist(h=>({undo:[...h.undo,e],redo:h.redo.slice(0,-1)}));};
 const choosePalette=async(site:string)=>{setBusy(true);setError(null);try{setM(await put(`/mockups/${mockupId}/palette`,{site}));}catch(e){setError(e);}finally{setBusy(false);}};
 return <>
  <ErrorBox error={error}/>{notice&&<p role="status" className="notice">{notice}</p>}
  <h4>1. La capture de départ</h4>
  {!m.has_image&&<p className="muted">Sur votre téléphone : faites une capture de l’écran du site que vous voulez changer (boutons du téléphone), puis choisissez-la ci-dessous. Elle est réduite sur votre appareil avant l’envoi ; elle reste privée.</p>}
  {!locked&&<Field label={m.has_image?'Remplacer la capture':'Choisir la capture (galerie du téléphone)'} hint={`Taille finale : ${ko(MAX_CAPTURE_BYTES)} au plus.`}>
   <input type="file" accept="image/*" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';void onFile(f);}}/></Field>}
  {m.has_image&&<p className="muted">Capture : {m.image.width} × {m.image.height} px · {ko(m.image.bytes)} · {m.image.mime.replace('image/','').toUpperCase()}. Écran de travail : {sc} × {sh}.</p>}
  {m.has_image&&<><h4>2. Modifier la maquette</h4>
   <MockupEditor m={m} img={img} busy={busy} locked={locked} onEntry={e=>void apply(e)} onUndo={()=>void undo()} onRedo={()=>void redo()} undoLabel={hist.undo.at(-1)?.label||''} redoLabel={hist.redo.at(-1)?.label||''} onPalette={s=>void choosePalette(s)} palettes={palettes} onError={setError}/></>}
  {m.has_image&&<><h4>3. Conseils d’ergonomie</h4><MockupGuide m={m}/></>}
  {m.has_image&&<><h4>4. Discussion</h4><MockupChat m={m}/></>}
  {m.has_image&&<><h4>5. Fiche de mise en page et mission</h4><MockupSheet m={m} img={img} projectId={projectId} repos={repos}/></>}
  <h4>6. Ce qu’Atelier sait déjà de ce projet</h4>
  <p className="muted">Lecture seule : ce sont les décisions « actuelles » et les fonctionnalités du suivi. Rien n’est inventé ; chaque ligne garde son niveau de fiabilité.</p>
  {m.context.decisions.length?<ul className="plain">{m.context.decisions.map((d:any)=><li key={d.id}><strong>{d.title}</strong> <small className="muted">{d.reliability_symbol} {d.reliability_word}{d.source_ref?' · source : '+d.source_ref:''}</small></li>)}</ul>:<p className="muted">Aucune décision actuelle enregistrée pour ce projet.</p>}
  {m.context.features.length?<details><summary>{m.context.features.length} fonctionnalité(s) du suivi</summary><ul className="plain">{m.context.features.slice(0,60).map((f:any)=><li key={f.id}>{f.code} — {f.name}</li>)}</ul>{m.context.features.length>60&&<p className="muted">… et {m.context.features.length-60} autres (liste complète dans « Suivi des fonctionnalités »).</p>}</details>:<p className="muted">Aucune fonctionnalité dans le suivi.</p>}
  <p className="muted">Passages utiles de l’historique importé (export ChatGPT) : Atelier les cherche quand vous posez une question dans la « Discussion » (niveau Rapporté). Sans import, il n’y en a aucun.</p>
  {m.has_image&&<div className="stack"><h4>7. Fixer l’écran de départ</h4>
   {locked?<p className="notice">Écran de départ fixé le {new Date(m.start_at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})} ({m.start.blocks} bloc(s)). Il sert de point de comparaison : vous pouvez continuer à modifier la maquette, la copie de départ ne bouge plus.</p>
    :<><p className="muted">Quand les blocs recouvrent bien la capture, fixez l’écran de départ : c’est la référence pour montrer, plus tard, ce qui a changé. <strong>Après cela, la capture ne peut plus être remplacée.</strong> Les blocs restent modifiables.</p>
     <Button kind="secondary" disabled={busy||!m.blocks.length} onClick={()=>setConfirm(true)}>Fixer l’écran de départ</Button></>}</div>}
  {confirm&&<Confirm title="Fixer l’écran de départ ?" onClose={()=>setConfirm(false)} onConfirm={async()=>{await post(`/mockups/${mockupId}/lock-start`,{});setConfirm(false);setNotice('Écran de départ fixé.');await reload();await onChanged();}}>
   Les {m.blocks.length} blocs posés deviennent la référence. Ensuite la capture ne pourra plus être remplacée ; vous pourrez toujours modifier les blocs.</Confirm>}
 </>;
}
