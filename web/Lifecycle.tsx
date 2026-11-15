/* Lot 1 — un seul composant pour la fiabilité (pastille + mot, jamais la couleur seule) et l'éditeur d'état d'une information
   (décision, document, note, fonctionnalité). Aucune suppression : on change l'état, avec une raison gardée dans l'historique. */
import {useEffect,useState} from 'react';
import {api,post,date} from './api';
import {Button,Field,ErrorBox,Loading} from './ui';
import {LIFE_LABEL,RELIABILITY_VIEW,TRANSITIONS,type Life} from '../server/lifecycle-core';

export function ReliabilityBadge({level}:{level:string}){
 const v=RELIABILITY_VIEW[level as keyof typeof RELIABILITY_VIEW];if(!v)return null;
 return <span className={'rel rel-'+level} title={v.help}><span aria-hidden="true">{v.symbol}</span> {v.word}</span>;
}
export const LifeBadge=({status}:{status:string})=><span className={'life life-'+status}>{LIFE_LABEL[status as Life]||status}</span>;

const RELS=[['verified','Vérifié'],['confirmed','Confirmé par vous'],['reported','Rapporté'],['hypothesis','Hypothèse']] as const;
export function LifecycleEditor({project,kind,item,candidates,onChanged}:{project:string;kind:'decision'|'document'|'memory'|'feature';item:any;candidates:any[];onChanged:()=>void}){
 const [toStatus,setToStatus]=useState(''),[toRel,setToRel]=useState(''),[reason,setReason]=useState(''),[source,setSource]=useState(item.source_ref||''),[fit,setFit]=useState(false),[test,setTest]=useState(false),[valid,setValid]=useState(false),[by,setBy]=useState('');
 const [error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false),[history,setHistory]=useState<any[]|null>(null),[done,setDone]=useState('');
 const url=`/model/${project}/lifecycle/${kind}/${item.id}`;
 useEffect(()=>{let alive=true;api(url+'/history').then(r=>{if(alive)setHistory(r.items);}).catch(()=>{if(alive)setHistory([]);});return()=>{alive=false;};},[url,done]);
 const moves=TRANSITIONS[item.status as Life]||[];
 const needsValid=toStatus==='current'||toRel==='confirmed',needsProof=toRel==='verified';
 async function submit(){
  setBusy(true);setError(null);setDone('');
  try{
   await post(url,{to_status:toStatus||undefined,to_reliability:toRel||undefined,reason,source_ref:needsProof||source!==(item.source_ref||'')?source:undefined,fit_confirmed:needsProof?fit:undefined,test_passed:needsProof&&kind==='feature'?test:undefined,validated_by_martin:needsValid?valid:undefined,replaced_by_id:toStatus==='replaced'?by||undefined:undefined});
   setDone('Changement enregistré.');setToStatus('');setToRel('');setReason('');setFit(false);setTest(false);setValid(false);setBy('');onChanged();
  }catch(e){setError(e);}finally{setBusy(false);}
 }
 return <div className="stack lifecycle-editor">
  <p><LifeBadge status={item.status}/> <ReliabilityBadge level={item.reliability}/>{item.replaced_by_id&&<span className="muted"> · remplacée par une autre information</span>}</p>
  {item.status==='replaced'||item.status==='abandoned'||item.status==='rejected'?<p className="muted">Cette information est « {LIFE_LABEL[item.status as Life].toLowerCase()} » : elle est conservée mais ne sert plus. {TRANSITIONS[item.status as Life].length?'Vous pouvez la rouvrir comme proposition.':'Ce changement est définitif.'}</p>:null}
  {(moves.length>0||item.status==='current'||item.status==='proposed'||item.status==='hypothesis')&&<>
   {moves.length>0&&<Field label="Nouvel état"><select value={toStatus} onChange={e=>setToStatus(e.target.value)}><option value="">Ne pas changer l’état</option>{moves.map(m=><option key={m} value={m}>{LIFE_LABEL[m]}</option>)}</select></Field>}
   {!['replaced','abandoned','rejected'].includes(item.status)&&<Field label="Niveau de fiabilité"><select value={toRel} onChange={e=>setToRel(e.target.value)}><option value="">Ne pas changer le niveau</option>{RELS.filter(([k])=>k!==item.reliability_stored).map(([k,v])=><option key={k} value={k}>{RELIABILITY_VIEW[k].symbol} {v}</option>)}</select></Field>}
   {toStatus==='replaced'&&<Field label="Remplacée par"><select value={by} onChange={e=>setBy(e.target.value)}><option value="">Choisir…</option>{candidates.filter(c=>c.id!==item.id&&!['replaced','abandoned','rejected'].includes(c.status)).map(c=><option key={c.id} value={c.id}>{c.code?c.code+' — ':''}{c.title}</option>)}</select></Field>}
   {needsProof&&<>
    <Field label="Source précise (lien, fichier, test ou commit)"><input value={source} maxLength={500} onChange={e=>setSource(e.target.value)}/></Field>
    <label className="check"><input type="checkbox" checked={fit} onChange={e=>setFit(e.target.checked)}/>Adapté à ma demande (j’ai contrôlé que cette source répond bien à ce que je voulais)</label>
    {kind==='feature'&&<label className="check"><input type="checkbox" checked={test} onChange={e=>setTest(e.target.checked)}/>Un test a réussi (pour du code)</label>}
    <p className="muted">Sans source ET sans cette coche, l’élément reste « Rapporté ».</p>
   </>}
   {needsValid&&<label className="check"><input type="checkbox" checked={valid} onChange={e=>setValid(e.target.checked)}/>{toStatus==='current'?'Je valide : cette information devient actuelle.':'Je confirme : je l’ai décidé ou constaté moi-même.'}</label>}
   <Field label="Pourquoi ce changement ? (gardé dans l’historique)"><textarea rows={2} value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></Field>
   <ErrorBox error={error}/>{done&&<p className="notice" role="status">{done}</p>}
   <Button disabled={busy||(!toStatus&&!toRel)||reason.trim().length<3} onClick={()=>void submit()}>{busy?'Enregistrement…':'Enregistrer le changement'}</Button>
  </>}
  <details className="fold"><summary className="fold-summary"><strong>Historique</strong><small className="muted">{history?history.length+' changement(s)':'chargement…'}</small></summary><div className="fold-body">
   {history===null?<Loading/>:history.length===0?<p className="muted">Aucun changement enregistré : l’état affiché est déduit de l’ancien format.</p>:<ul className="plain">{history.map(h=><li key={h.id}><strong>{date(h.created_at)}</strong> · {h.author_kind==='ai'?'IA (à relire)':'Martin'} · {h.from_status?LIFE_LABEL[h.from_status as Life]+' → ':''}{LIFE_LABEL[h.to_status as Life]} · {RELIABILITY_VIEW[h.to_reliability as keyof typeof RELIABILITY_VIEW]?.word}<br/><span className="muted">{h.reason}{h.source_ref?' · source : '+h.source_ref:''}</span></li>)}</ul>}
  </div></details>
 </div>;
}
