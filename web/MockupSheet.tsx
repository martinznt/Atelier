/* Lot 5B (5B-3) — fiche de mise en page, image et mission pour Claude Code.
   La fiche est fabriquée par des règles fixes (sans IA) ; la mission passe par le générateur du lot 3 (règles du dépôt, texte figé, copie). */
import {useState} from 'react';
import {api,post,saveBlob} from './api';
import {Button,ErrorBox,Field} from './ui';
import {renderMockupPng} from './mockup-image';

const safe=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'maquette';
export function MockupSheet({m,img,projectId,repos}:{m:any;img:string;projectId:string;repos:any[]}){
 const [sheet,setSheet]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState(''),[repo,setRepo]=useState('');
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError(null);setNotice('');try{await fn();}catch(e){setError(e);}finally{setBusy(false);}};
 const fresh=sheet&&sheet.rev===m.revision;
 const load=()=>run(async()=>{setSheet({...await api(`/mockups/${m.id}/sheet`),rev:m.revision});});
 const repoId=repo||repos[0]?.id||'';
 return <div className="stack mq-sheet">
  <p className="muted">Atelier rédige la fiche avec des <strong>règles fixes, sans IA</strong> : mêmes blocs, même texte. Il compare la maquette à l’écran de départ et en tire les consignes et la liste de contrôle à vérifier sur votre téléphone.</p>
  <ErrorBox error={error}/>{notice&&<p role="status" className="notice">{notice}</p>}
  <Button disabled={busy} onClick={()=>void load()}>{fresh?'Mettre à jour la fiche':'Préparer la fiche'}</Button>
  {sheet&&!fresh&&<p className="notice">La maquette a changé depuis : mettez la fiche à jour avant de la copier.</p>}
  {sheet&&<>
   <h5>Écarts avec l’écran de départ</h5>
   {sheet.changes===null?<p className="muted">L’écran de départ n’est pas fixé : la fiche décrit seulement la mise en page visée.</p>
    :sheet.instructions.length?<ol className="mq-list">{sheet.instructions.map((s:string,i:number)=><li key={i}>{s}</li>)}</ol>:<p className="muted">Aucun écart : la maquette est identique à l’écran de départ.</p>}
   <h5>Liste de contrôle à vérifier sur le téléphone</h5>
   <ul className="mq-list">{sheet.checklist.map((s:string,i:number)=><li key={i}>{s}</li>)}</ul>
   <h5>Fichiers probablement concernés <small className="muted">(Hypothèse)</small></h5>
   {sheet.files.length?<ul className="plain">{sheet.files.map((f:string)=><li key={f}><code>{f}</code></li>)}</ul>:<p className="muted">Aucune hypothèse (choisissez la palette du site).</p>}
   <details><summary>Texte complet de la fiche</summary><pre className="handoff-preview">{sheet.markdown}</pre><small className="muted">Empreinte : {String(sheet.content_hash).slice(0,16)}…</small></details>
   <div className="mq-row">
    <Button kind="secondary" disabled={busy||!fresh} onClick={()=>void run(async()=>{try{await navigator.clipboard.writeText(sheet.markdown);setNotice('Fiche copiée.');}catch{throw new Error('La copie a échoué sur cet appareil. Utilisez « Télécharger la fiche ».');}})}>Copier la fiche</Button>
    <Button kind="secondary" disabled={busy||!fresh} onClick={()=>{saveBlob(new Blob([sheet.markdown],{type:'text/markdown;charset=utf-8'}),`fiche-${safe(m.title)}.md`);setNotice('Fiche téléchargée.');}}>Télécharger la fiche</Button>
    <Button kind="secondary" disabled={busy} onClick={()=>void run(async()=>{saveBlob(await renderMockupPng(img,m),`maquette-${safe(m.title)}.png`);setNotice('Image de la maquette téléchargée.');})}>Télécharger l’image</Button>
   </div>
   <h5>Mission pour Claude Code</h5>
   {repos.length===0?<p className="notice">Associez d’abord le dépôt du site à ce projet (section « Dépôts ») : la mission reprendra ses règles.</p>:<>
    <Field label="Dépôt du site"><select value={repoId} onChange={e=>setRepo(e.target.value)}>{repos.map((r:any)=><option key={r.id} value={r.id}>{r.full_name}</option>)}</select></Field>
    <Button disabled={busy||!fresh} onClick={()=>void run(async()=>{const x=await post('/missions',{project_id:projectId,repository_id:repoId,level:'short',title:sheet.mission.title,fields:sheet.mission.fields,feature_ids:sheet.mission.feature_ids,decision_ids:[]});window.dispatchEvent(new Event('atelier:missions-changed'));setNotice(`Mission « ${x.title} » créée en brouillon. Ouvrez « Missions pour Claude Code » (plus haut dans Pilotage) pour lire les règles du dépôt, figer le texte puis le copier. Joignez la fiche et l’image.`);})}>Créer la mission</Button></>}
  </>}
 </div>;
}
