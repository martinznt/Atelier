/* Lot 5B (5B-2) — l'éditeur de la maquette : on déplace, on regroupe, on colorie, au doigt, à la souris ET par boutons.
   Les boutons font tout ce que le glisser fait (le glisser seul est difficile sur un petit téléphone).
   Rien n'est écrit ici : chaque geste devient une « entrée » (aller + inverse) que MockupView envoie au serveur. */
import {useRef,useState} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp,Redo2,Undo2} from 'lucide-react';
import {Button,Field} from './ui';
import {STEPS,MAX_SELECTION,addBlock,clampDelta,deleteBlocks,deleteGroup,groupBlocks,movingSet,moveBlocks,placeUnder,resizeBlocks,setColors,ungroupBlocks,updateBlock,type Entry,type UiBlock} from './mockup-edit';

interface Palette{key:string;label:string;commit:string;file:string;colors:{token:string;hex:string;line:number}[]}
interface Props{m:any;img:string;busy:boolean;locked:boolean;onEntry:(e:Entry)=>void;onUndo:()=>void;onRedo:()=>void;undoLabel:string;redoLabel:string;onPalette:(site:string)=>void;palettes:Palette[];onError:(e:unknown)=>void}
const EMPTY={kind:'button',label:'',group:'',new_group:'',feature_id:'',behavior:''};

function Swatches({palette,value,label,onPick}:{palette:Palette|null;value:string;label:string;onPick:(hex:string)=>void}){
 const [other,setOther]=useState('');
 return <div className="mq-swatches" role="group" aria-label={label}>
  <button type="button" className={'mq-sw none'+(value===''?' on':'')} aria-pressed={value===''} aria-label={label+' : aucune'} onClick={()=>onPick('')}>Aucune</button>
  {palette?.colors.map(c=><button type="button" key={c.token} className={'mq-sw'+(value===c.hex?' on':'')} aria-pressed={value===c.hex} aria-label={`${label} ${c.hex} (${c.token})`} title={`${c.token} ${c.hex}`} style={{background:c.hex}} onClick={()=>onPick(c.hex)}/>)}
  <div className="mq-other"><input aria-label={label+' : autre couleur #rrggbb'} placeholder="#rrggbb" maxLength={7} value={other} onChange={e=>setOther(e.target.value)}/>
   <Button kind="secondary" disabled={!/^#[0-9a-fA-F]{6}$/.test(other)} onClick={()=>{onPick(other.toLowerCase());setOther('');}}>Autre couleur</Button></div>
  <small className="muted">Choisie : {value||'aucune'}{value&&palette&&!palette.colors.some(c=>c.hex===value)?' (hors palette du site)':''}</small>
 </div>;
}

export function MockupEditor({m,img,busy,locked,onEntry,onUndo,onRedo,undoLabel,redoLabel,onPalette,palettes,onError}:Props){
 const sc:number=m.screen_width,sh:number=m.screen_height,blocks:UiBlock[]=m.blocks,groups:string[]=m.groups.map((g:any)=>g.name);
 const [sel,setSel]=useState<string[]>([]),[multi,setMulti]=useState(false),[step,setStep]=useState<number>(8),[whole,setWhole]=useState(false),[drag,setDrag]=useState<{dx:number;dy:number}|null>(null);
 const [add,setAdd]=useState<any>(EMPTY),[gname,setGname]=useState('');
 const stage=useRef<HTMLDivElement>(null),dragRef=useRef<{x0:number;y0:number;moved:boolean}|null>(null),noClick=useRef(false);
 const palette:Palette|null=m.palette||null;
 const present=sel.filter(id=>blocks.some(b=>b.id===id)),picked=blocks.filter(b=>present.includes(b.id)),one=picked.length===1?picked[0]:null;
 const hasGroup=picked.some(b=>b.group_name);
 const guard=(fn:()=>Entry|null,empty?:string)=>{try{const e=fn();if(e)onEntry(e);else if(empty)onError(new Error(empty));}catch(e){onError(e);}};
 const scale=()=>(stage.current?.getBoundingClientRect().width||sc)/sc;
 const toggle=(id:string)=>setSel(s=>multi?(s.includes(id)?s.filter(x=>x!==id):s.length>=MAX_SELECTION?s:[...s,id]):(s.length===1&&s[0]===id?[]:[id]));
 const move=(dx:number,dy:number)=>guard(()=>moveBlocks(blocks,present,dx,dy,whole,sc,sh),'Le bloc est déjà au bord de l’écran.');
 const preview=drag&&present.length?(()=>{try{const {moving}=movingSet(blocks,present,whole);const c=clampDelta(moving,drag.dx,drag.dy,sc,sh);return {ids:new Set(moving.map(b=>b.id)),...c};}catch{return null;}})():null;

 function down(b:UiBlock,e:React.PointerEvent){
  if(busy||!present.includes(b.id))return; // un bloc non choisi laisse défiler la page ; il se choisit d'un toucher
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);dragRef.current={x0:e.clientX,y0:e.clientY,moved:false};
 }
 function movePtr(e:React.PointerEvent){
  const d=dragRef.current;if(!d)return;const s=scale(),dx=Math.round((e.clientX-d.x0)/s),dy=Math.round((e.clientY-d.y0)/s);
  if(!d.moved&&Math.abs(dx)+Math.abs(dy)<3)return;d.moved=true;setDrag({dx,dy});
 }
 function up(){
  const d=dragRef.current;dragRef.current=null;
  if(d?.moved&&drag){noClick.current=true;setTimeout(()=>{noClick.current=false;},0);const {dx,dy}=drag;setDrag(null);move(dx,dy);}else setDrag(null);
 }
 function key(b:UiBlock,e:React.KeyboardEvent){
  const k:Record<string,[number,number]>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
  if(!k[e.key]||busy)return;e.preventDefault();if(!present.includes(b.id)){setSel([b.id]);return;}move(...k[e.key]);
 }
 const [vals,setVals]=useState<any>(null);
 const form=one?{label:one.label,kind:one.kind,x:String(one.x),y:String(one.y),w:String(one.w),h:String(one.h),behavior:one.behavior,feature_id:one.feature?.id||''}:null;
 const v=vals&&vals.id===one?.id&&vals.rev===m.revision?vals.f:form;
 const setV=(k:string,val:string)=>setVals({id:one?.id,rev:m.revision,f:{...v,[k]:val}});
 const num=(s:string)=>s.trim()===''?NaN:Number(s);
 const others=blocks.filter(b=>!present.includes(b.id));

 return <>
  <div className="mq-bar" role="toolbar" aria-label="Annuler et rétablir">
   <Button kind="secondary" disabled={busy||!undoLabel} onClick={onUndo}><Undo2 size={16}/>Annuler{undoLabel?' : '+undoLabel:''}</Button>
   <Button kind="secondary" disabled={busy||!redoLabel} onClick={onRedo}><Redo2 size={16}/>Rétablir{redoLabel?' : '+redoLabel:''}</Button>
  </div>
  <p className="muted">Touchez un bloc pour le choisir. Un bloc choisi se <strong>glisse au doigt</strong>, ou se déplace avec les boutons ci-dessous. {palettes.length>0&&''}</p>
  <div className="mq-stage" ref={stage} style={{aspectRatio:`${sc} / ${sh}`}} role="group" aria-label="Capture avec les blocs posés dessus">
   <img src={img} alt="Capture de l’écran de départ" className="mq-bg" draggable={false}/>
   {blocks.map((b:any,i:number)=>{const on=present.includes(b.id),moving=on&&preview&&preview.ids.has(b.id);
    return <button type="button" key={b.id} className={'mq-block'+(on?' on':'')+(moving?' drag':'')} aria-label={`Bloc ${i+1} : ${b.kind_label} — ${b.label}`} aria-pressed={on}
     style={{left:`${b.x/sc*100}%`,top:`${b.y/sh*100}%`,width:`${b.w/sc*100}%`,height:`${b.h/sh*100}%`,...(b.fill?{background:b.fill+'99'}:{}),...(moving?{transform:`translate(${preview!.dx*scale()}px,${preview!.dy*scale()}px)`}:{})}}
     onPointerDown={e=>down(b,e)} onPointerMove={movePtr} onPointerUp={up} onPointerCancel={()=>{dragRef.current=null;setDrag(null);}} onKeyDown={e=>key(b,e)}
     onClick={()=>{if(noClick.current)return;toggle(b.id);}}><span className="mq-num">{i+1}</span></button>;})}
  </div>
  {!blocks.length&&<p className="muted">Aucun bloc pour l’instant. Ajoutez-en un plus bas.</p>}
  <label className="check"><input type="checkbox" checked={multi} onChange={e=>{setMulti(e.target.checked);if(!e.target.checked)setSel(s=>s.slice(0,1));}}/>Choisir plusieurs blocs à la fois (jusqu’à {MAX_SELECTION})</label>
  {blocks.length>0&&<ol className="mq-legend">{blocks.map((b:any,i:number)=><li key={b.id}><button type="button" className={'mq-item'+(present.includes(b.id)?' on':'')} aria-pressed={present.includes(b.id)} onClick={()=>toggle(b.id)}>
   <strong>{i+1}. {b.label}</strong><small className="muted">{b.kind_label}{b.group_name?' · groupe « '+b.group_name+' »':''}{b.feature?' · '+b.feature.code+' '+b.feature.name:''}</small></button></li>)}</ol>}
  {groups.length>0&&<p className="muted">Groupes : {groups.join(' · ')}</p>}

  {picked.length>0&&<div className="mq-panel stack" role="region" aria-label="Réglages du bloc choisi">
   <strong>{one?one.label:picked.length+' blocs choisis'}</strong>
   <h5>Déplacer</h5>
   <Field label="Pas du déplacement"><select value={step} onChange={e=>setStep(Number(e.target.value))}>{STEPS.map(s=><option key={s} value={s}>{s} px</option>)}</select></Field>
   <div className="mq-pad" role="group" aria-label="Déplacer le bloc">
    <span/><Button kind="secondary" disabled={busy} onClick={()=>move(0,-step)}><ArrowUp size={18}/><span className="sr">Monter</span></Button><span/>
    <Button kind="secondary" disabled={busy} onClick={()=>move(-step,0)}><ArrowLeft size={18}/><span className="sr">À gauche</span></Button><span className="mq-pad-c">{one?`${one.x} · ${one.y}`:'—'}</span><Button kind="secondary" disabled={busy} onClick={()=>move(step,0)}><ArrowRight size={18}/><span className="sr">À droite</span></Button>
    <span/><Button kind="secondary" disabled={busy} onClick={()=>move(0,step)}><ArrowDown size={18}/><span className="sr">Descendre</span></Button><span/>
   </div>
   {hasGroup&&<label className="check"><input type="checkbox" checked={whole} onChange={e=>setWhole(e.target.checked)}/>Déplacer aussi tout le groupe du bloc</label>}
   {one&&others.length>0&&<Field label="Placer ce bloc juste sous…"><select value="" onChange={e=>{const t=e.target.value;if(t)guard(()=>placeUnder(blocks,one.id,t,8,sc,sh));}}><option value="">Choisir un bloc</option>{others.map((b:any)=><option key={b.id} value={b.id}>{b.label}</option>)}</select></Field>}
   <h5>Taille</h5>
   <div className="mq-row"><Button kind="secondary" disabled={busy} onClick={()=>guard(()=>resizeBlocks(blocks,present,step,0,sc,sh),'Taille déjà au maximum ou au minimum.')}>Plus large</Button><Button kind="secondary" disabled={busy} onClick={()=>guard(()=>resizeBlocks(blocks,present,-step,0,sc,sh),'Taille déjà au maximum ou au minimum.')}>Moins large</Button>
    <Button kind="secondary" disabled={busy} onClick={()=>guard(()=>resizeBlocks(blocks,present,0,step,sc,sh),'Taille déjà au maximum ou au minimum.')}>Plus haut</Button><Button kind="secondary" disabled={busy} onClick={()=>guard(()=>resizeBlocks(blocks,present,0,-step,sc,sh),'Taille déjà au maximum ou au minimum.')}>Moins haut</Button></div>
   <h5>Groupe</h5>
   <p className="muted">Un groupe réunit des blocs qui vont ensemble. {hasGroup?'Groupe(s) du choix : '+[...new Set(picked.map(b=>b.group_name).filter(Boolean))].join(', ')+'.':'Aucun groupe pour ce choix.'}</p>
   <Field label="Nom du groupe" hint="Un nom qui existe déjà ajoute les blocs à ce groupe."><input list="mq-groups" value={gname} maxLength={60} onChange={e=>setGname(e.target.value)} placeholder="Ex. Barre d’actions"/></Field>
   <datalist id="mq-groups">{groups.map(g=><option key={g} value={g}/>)}</datalist>
   <div className="mq-row"><Button disabled={busy||!gname.trim()} onClick={()=>guard(()=>groupBlocks(blocks,present,gname,groups))}>Grouper le choix</Button>
    <Button kind="secondary" disabled={busy||!hasGroup} onClick={()=>guard(()=>ungroupBlocks(blocks,present),'Ces blocs ne sont dans aucun groupe.')}>Séparer du groupe</Button></div>
   {hasGroup&&<Button kind="text" disabled={busy} onClick={()=>guard(()=>deleteGroup(blocks,picked.find(b=>b.group_name)!.group_name))}>Supprimer le groupe « {picked.find(b=>b.group_name)!.group_name} » (les blocs restent)</Button>}
   <h5>Couleurs</h5>
   <Field label="Palette du site" hint={palette?`Lue dans ${palette.file} du dépôt, commit ${palette.commit.slice(0,7)} (lecture seule).`:'Choisissez la palette de votre site pour voir ses couleurs.'}>
    <select value={palette?.key||''} onChange={e=>onPalette(e.target.value)}><option value="">Aucune palette</option>{palettes.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>
   <p className="muted"><strong>Fond</strong> du bloc :</p>
   <Swatches palette={palette} label="Fond" value={one?one.fill:picked.every(b=>b.fill===picked[0].fill)?picked[0].fill:''} onPick={hex=>guard(()=>setColors(blocks,present,{fill:hex}),'Cette couleur est déjà choisie.')}/>
   <p className="muted"><strong>Texte</strong> du bloc :</p>
   <Swatches palette={palette} label="Texte" value={one?one.text_color:picked.every(b=>b.text_color===picked[0].text_color)?picked[0].text_color:''} onPick={hex=>guard(()=>setColors(blocks,present,{text_color:hex}),'Cette couleur est déjà choisie.')}/>
   {one&&v&&<div className="stack"><h5>Détails</h5>
    <Field label="Nom"><input value={v.label} maxLength={120} onChange={e=>setV('label',e.target.value)}/></Field>
    <Field label="Type"><select value={v.kind} onChange={e=>setV('kind',e.target.value)}>{m.kinds.map((k:any)=><option key={k.key} value={k.key}>{k.label}</option>)}</select></Field>
    <div className="two-fields"><Field label="Depuis la gauche"><input inputMode="numeric" value={v.x} onChange={e=>setV('x',e.target.value.replace(/\D/g,''))}/></Field><Field label="Depuis le haut"><input inputMode="numeric" value={v.y} onChange={e=>setV('y',e.target.value.replace(/\D/g,''))}/></Field></div>
    <div className="two-fields"><Field label="Largeur"><input inputMode="numeric" value={v.w} onChange={e=>setV('w',e.target.value.replace(/\D/g,''))}/></Field><Field label="Hauteur"><input inputMode="numeric" value={v.h} onChange={e=>setV('h',e.target.value.replace(/\D/g,''))}/></Field></div>
    <Field label="Fonctionnalité liée"><select value={v.feature_id} onChange={e=>setV('feature_id',e.target.value)}><option value="">Aucune</option>{m.context.features.map((f:any)=><option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}</select></Field>
    <Field label="Comportement"><textarea rows={2} value={v.behavior} maxLength={500} onChange={e=>setV('behavior',e.target.value)}/></Field>
    <Button disabled={busy} onClick={()=>guard(()=>updateBlock(blocks,one.id,{label:v.label,kind:v.kind,x:num(v.x),y:num(v.y),w:num(v.w),h:num(v.h),behavior:v.behavior,feature_id:v.feature_id||null}),'Aucun changement à enregistrer.')}>Appliquer les détails</Button></div>}
   <Button kind="danger" disabled={busy} onClick={()=>guard(()=>deleteBlocks(blocks,present))}>Supprimer {one?'ce bloc':'ces blocs'}</Button>
   <small className="muted">« Annuler » rend le bloc supprimé tant que vous ne quittez pas cette page.</small>
  </div>}

  <div className="stack mq-add"><h4>Ajouter un bloc</h4>
   <p className="muted">Le nouveau bloc apparaît en haut à gauche de l’écran ; déplacez-le ensuite.</p>
   <Field label="Type"><select value={add.kind} onChange={e=>setAdd({...add,kind:e.target.value})}>{m.kinds.map((k:any)=><option key={k.key} value={k.key}>{k.label}</option>)}</select></Field>
   <Field label="Nom du bloc"><input value={add.label} maxLength={120} onChange={e=>setAdd({...add,label:e.target.value})} placeholder="Ex. Bouton Enregistrer"/></Field>
   <Field label="Fonctionnalité liée (facultatif)"><select value={add.feature_id} onChange={e=>setAdd({...add,feature_id:e.target.value})}><option value="">Aucune</option>{m.context.features.map((f:any)=><option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}</select></Field>
   <Button disabled={busy||!add.label.trim()||blocks.length>=100} onClick={()=>{
    const kindFull=add.kind==='bottom_bar',b:UiBlock={id:crypto.randomUUID(),kind:add.kind,label:add.label.trim(),x:kindFull?0:16,y:kindFull?Math.max(0,sh-60):16,w:kindFull?sc:Math.min(160,sc-16),h:kindFull?60:48,group_name:'',fill:'',text_color:'',behavior:add.behavior,feature:add.feature_id?{id:add.feature_id}:null};
    guard(()=>addBlock(b));setAdd({...add,label:''});setSel([b.id]);}}>Ajouter ce bloc</Button>
  </div>
  {locked&&<p className="muted">L’écran de départ est fixé : la capture ne change plus, mais vous pouvez modifier les blocs ; la copie de départ reste intacte.</p>}
 </>;
}
