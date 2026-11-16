/* Lot 5B (5B-1) — Maquettes d'écran : une capture de votre téléphone en fond, des blocs posés dessus.
   À cette étape on crée, on pose des blocs et on relit. Déplacer, grouper et colorier viennent à l'étape suivante.
   Atelier ne produit aucun code de site. */
import {useCallback,useEffect,useState} from 'react';
import {api,post,put} from './api';
import {Button,Confirm,ErrorBox,Field,Loading} from './ui';
import {CaptureError,MAX_CAPTURE_BYTES,blobToBase64,compressCapture} from './mockup-image';

/** Kilo-octets décimaux (1 Ko = 1 000 octets), comme les messages du serveur : la limite s'affiche « 180 Ko ». */
const ko=(n:number)=>(n/1000).toFixed(1).replace('.',',')+' Ko';
const EMPTY_BLOCK={kind:'button',label:'',x:'16',y:'16',w:'160',h:'48',group_id:'',new_group:'',feature_id:'',fill:'',text_color:'',behavior:''};

export function MockupsSection({id}:{id:string}){
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
    <div className="fold-body stack">{open===m.id&&<MockupView mockupId={m.id} onChanged={load}/>}</div></details>)}
   <details className="fold"><summary className="fold-summary"><strong>Nouvelle maquette</strong><small className="muted">un écran de votre site</small></summary><div className="fold-body stack">
    <Field label="Nom de la maquette"><input value={form.title} maxLength={160} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Ex. Accueil du livre"/></Field>
    <Field label="Page du site concernée (facultatif)" hint="Ce que vous voyez sur la capture, par exemple « Accueil » ou « Liste de courses ».">
     <input value={form.page_name} maxLength={160} onChange={e=>setForm({...form,page_name:e.target.value})}/></Field>
    <Button disabled={busy||!form.title.trim()} onClick={()=>void create()}>Créer la maquette</Button>
   </div></details>
  </div></details>;
}

function MockupView({mockupId,onChanged}:{mockupId:string;onChanged:()=>Promise<void>}){
 const [m,setM]=useState<any>(null),[img,setImg]=useState<string>(''),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [sel,setSel]=useState<string>(''),[block,setBlock]=useState<any>(EMPTY_BLOCK),[confirm,setConfirm]=useState(false);
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
 const picked=m.blocks.find((b:any)=>b.id===sel);
 const set=(k:string,v:string)=>setBlock((b:any)=>({...b,[k]:v}));
 async function addBlock(){
  await run(async()=>{
   let groupId=block.group_id||null;
   if(block.new_group.trim()){
    const g=await post(`/mockups/${mockupId}/groups`,{name:block.new_group});
    groupId=g.groups.find((x:any)=>x.name===block.new_group.trim())?.id||null;
   }
   await post(`/mockups/${mockupId}/blocks`,{kind:block.kind,label:block.label,x:block.x,y:block.y,w:block.w,h:block.h,fill:block.fill.trim(),text_color:block.text_color.trim(),behavior:block.behavior,group_id:groupId,feature_id:block.feature_id||null});
   setBlock({...EMPTY_BLOCK,kind:block.kind,x:block.x,w:block.w,h:block.h,y:String(Number(block.y||0)+Number(block.h||0)+8)});
   setNotice('Bloc ajouté.');
  });
 }
 return <>
  <ErrorBox error={error}/>{notice&&<p role="status" className="notice">{notice}</p>}
  <h4>1. La capture de départ</h4>
  {!m.has_image&&<p className="muted">Sur votre téléphone : faites une capture de l’écran du site que vous voulez changer (boutons du téléphone), puis choisissez-la ci-dessous. Elle est réduite sur votre appareil avant l’envoi ; elle reste privée.</p>}
  {!locked&&<Field label={m.has_image?'Remplacer la capture':'Choisir la capture (galerie du téléphone)'} hint={`Taille finale : ${ko(MAX_CAPTURE_BYTES)} au plus.`}>
   <input type="file" accept="image/*" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';void onFile(f);}}/></Field>}
  {m.has_image&&<p className="muted">Capture : {m.image.width} × {m.image.height} px · {ko(m.image.bytes)} · {m.image.mime.replace('image/','').toUpperCase()}. Écran de travail : {sc} × {sh}.</p>}
  {m.has_image&&<>
   <h4>2. Les blocs posés sur la capture</h4>
   <div className="mq-stage" style={{aspectRatio:`${sc} / ${sh}`}} role="group" aria-label="Capture avec les blocs posés dessus">
    <img src={img} alt="Capture de l’écran de départ" className="mq-bg" draggable={false}/>
    {m.blocks.map((b:any,i:number)=><button type="button" key={b.id} className={'mq-block'+(sel===b.id?' on':'')} aria-label={`Bloc ${i+1} : ${b.kind_label} — ${b.label}`} aria-pressed={sel===b.id}
     style={{left:`${b.x/sc*100}%`,top:`${b.y/sh*100}%`,width:`${b.w/sc*100}%`,height:`${b.h/sh*100}%`,...(b.fill?{background:b.fill+'99'}:{})}} onClick={()=>setSel(sel===b.id?'':b.id)}><span className="mq-num">{i+1}</span></button>)}
   </div>
   {!m.blocks.length&&<p className="muted">Aucun bloc pour l’instant. Ajoutez-en un plus bas : indiquez où il commence (distance depuis la gauche et le haut) et sa taille, en pixels d’écran ({sc} de large).</p>}
   {m.blocks.length>0&&<ol className="mq-legend">{m.blocks.map((b:any,i:number)=><li key={b.id}><button type="button" className={'mq-item'+(sel===b.id?' on':'')} onClick={()=>setSel(sel===b.id?'':b.id)}>
    <strong>{i+1}. {b.label}</strong><small className="muted">{b.kind_label}{b.group_name?' · groupe « '+b.group_name+' »':''}{b.feature?' · '+b.feature.code+' '+b.feature.name:''}</small></button></li>)}</ol>}
   {picked&&<div className="mq-detail" role="status"><strong>{picked.label}</strong>
    <dl><dt>Type</dt><dd>{picked.kind_label}</dd><dt>Position</dt><dd>{picked.x} depuis la gauche, {picked.y} depuis le haut</dd><dt>Taille</dt><dd>{picked.w} × {picked.h}</dd>
     <dt>Groupe</dt><dd>{picked.group_name||'aucun'}</dd><dt>Fonctionnalité liée</dt><dd>{picked.feature?picked.feature.code+' — '+picked.feature.name:'aucune'}</dd>
     <dt>Couleur de fond</dt><dd>{picked.fill||'non choisie'}</dd><dt>Couleur du texte</dt><dd>{picked.text_color||'non choisie'}</dd>{picked.behavior&&<><dt>Comportement</dt><dd>{picked.behavior}</dd></>}</dl></div>}
   {m.groups.length>0&&<p className="muted">Groupes : {m.groups.map((g:any)=>g.name).join(' · ')}</p>}
  </>}
  {m.has_image&&!locked&&<div className="stack mq-add"><h4>Ajouter un bloc</h4>
   <Field label="Type"><select value={block.kind} onChange={e=>set('kind',e.target.value)}>{m.kinds.map((k:any)=><option key={k.key} value={k.key}>{k.label}</option>)}</select></Field>
   <Field label="Nom du bloc"><input value={block.label} maxLength={120} onChange={e=>set('label',e.target.value)} placeholder="Ex. Bouton Enregistrer"/></Field>
   <div className="two-fields"><Field label="Depuis la gauche"><input inputMode="numeric" value={block.x} onChange={e=>set('x',e.target.value.replace(/\D/g,''))}/></Field>
    <Field label="Depuis le haut"><input inputMode="numeric" value={block.y} onChange={e=>set('y',e.target.value.replace(/\D/g,''))}/></Field></div>
   <div className="two-fields"><Field label="Largeur"><input inputMode="numeric" value={block.w} onChange={e=>set('w',e.target.value.replace(/\D/g,''))}/></Field>
    <Field label="Hauteur"><input inputMode="numeric" value={block.h} onChange={e=>set('h',e.target.value.replace(/\D/g,''))}/></Field></div>
   <Field label="Groupe" hint="Un groupe réunit des blocs qui vont ensemble."><select value={block.group_id} onChange={e=>set('group_id',e.target.value)}><option value="">Aucun groupe</option>{m.groups.map((g:any)=><option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
   <Field label="Ou créer un nouveau groupe"><input value={block.new_group} maxLength={60} onChange={e=>set('new_group',e.target.value)} placeholder="Ex. Barre d’actions"/></Field>
   <Field label="Fonctionnalité liée (facultatif)" hint="Lien avec le « Suivi des fonctionnalités » du projet."><select value={block.feature_id} onChange={e=>set('feature_id',e.target.value)}><option value="">Aucune</option>{m.context.features.map((f:any)=><option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}</select></Field>
   <div className="two-fields"><Field label="Couleur de fond (facultatif)" hint="Sous la forme #rrggbb"><input value={block.fill} maxLength={7} onChange={e=>set('fill',e.target.value)} placeholder="#0b0b0c"/></Field>
    <Field label="Couleur du texte (facultatif)"><input value={block.text_color} maxLength={7} onChange={e=>set('text_color',e.target.value)} placeholder="#ffffff"/></Field></div>
   <Field label="Comportement (facultatif)"><textarea rows={2} value={block.behavior} maxLength={500} onChange={e=>set('behavior',e.target.value)} placeholder="Ex. Ouvre la liste de courses"/></Field>
   <Button disabled={busy||!block.label.trim()||m.blocks.length>=100} onClick={()=>void addBlock()}>Ajouter ce bloc</Button>
  </div>}
  <h4>3. Ce qu’Atelier sait déjà de ce projet</h4>
  <p className="muted">Lecture seule : ce sont les décisions « actuelles » et les fonctionnalités du suivi. Rien n’est inventé ; chaque ligne garde son niveau de fiabilité.</p>
  {m.context.decisions.length?<ul className="plain">{m.context.decisions.map((d:any)=><li key={d.id}><strong>{d.title}</strong> <small className="muted">{d.reliability_symbol} {d.reliability_word}{d.source_ref?' · source : '+d.source_ref:''}</small></li>)}</ul>:<p className="muted">Aucune décision actuelle enregistrée pour ce projet.</p>}
  {m.context.features.length?<details><summary>{m.context.features.length} fonctionnalité(s) du suivi</summary><ul className="plain">{m.context.features.slice(0,60).map((f:any)=><li key={f.id}>{f.code} — {f.name}</li>)}</ul>{m.context.features.length>60&&<p className="muted">… et {m.context.features.length-60} autres (liste complète dans « Suivi des fonctionnalités »).</p>}</details>:<p className="muted">Aucune fonctionnalité dans le suivi.</p>}
  <p className="muted">Passages utiles de l’export ChatGPT : <strong>pas encore branchés</strong> (prévu avec l’espace de discussion, étape 5B-5).</p>
  {m.has_image&&<div className="stack"><h4>4. Fixer l’écran de départ</h4>
   {locked?<p className="notice">Écran de départ fixé le {new Date(m.start_at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})} ({m.start.blocks} bloc(s)). Il servira de point de comparaison. Modifier la maquette viendra à l’étape suivante.</p>
    :<><p className="muted">Quand les blocs recouvrent bien la capture, fixez l’écran de départ : c’est la référence pour montrer, plus tard, ce qui a changé. <strong>Après cela, à cette étape, on ne peut plus ajouter de bloc ni changer de capture.</strong></p>
     <Button kind="secondary" disabled={busy||!m.blocks.length} onClick={()=>setConfirm(true)}>Fixer l’écran de départ</Button></>}</div>}
  {confirm&&<Confirm title="Fixer l’écran de départ ?" onClose={()=>setConfirm(false)} onConfirm={async()=>{await post(`/mockups/${mockupId}/lock-start`,{});setConfirm(false);setNotice('Écran de départ fixé.');await reload();await onChanged();}}>
   Les {m.blocks.length} blocs posés deviennent la référence. Ensuite, on ne pourra plus ajouter de bloc ni remplacer la capture avant l’étape suivante du lot.</Confirm>}
 </>;
}
