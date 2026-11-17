/* Lot 5B (5B-4) — conseils par règles vérifiables, sans IA. Chaque conseil cite sa règle, sa source et son niveau de fiabilité.
   Accepter : le conseil entre dans la fiche et la mission. Refuser : il ne revient plus (sauf si la situation change vraiment). */
import {useCallback,useEffect,useState} from 'react';
import {api,post} from './api';
import {Button,ErrorBox} from './ui';

const SYMBOL:Record<string,string>={verified:'✔',reported:'◐',hypothesis:'?'};
export function MockupGuide({m}:{m:any}){
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{setBusy(true);setError(null);try{setData(await api(`/mockups/${m.id}/guide`));}catch(e){setError(e);}finally{setBusy(false);}},[m.id]);
 useEffect(()=>{if(data)void load();// eslint-disable-next-line react-hooks/exhaustive-deps
 },[m.revision]); // la maquette a changé : les conseils sont recalculés
 const decide=async(s:any,decision:'accepted'|'refused')=>{setBusy(true);setError(null);setNotice('');
  try{await post(`/mockups/${m.id}/guide`,{rule:s.rule,key:s.key,decision});setNotice(decision==='accepted'?`Accepté : « ${s.title} » entrera dans la fiche et la mission.`:`Refusé : « ${s.title} » ne sera plus proposé.`);setData(await api(`/mockups/${m.id}/guide`));}
  catch(e){setError(e);}finally{setBusy(false);}};
 return <div className="stack mq-guide">
  <p className="muted">Atelier vérifie la maquette avec des <strong>règles fixes, sans IA</strong> : taille des boutons et contraste (règles officielles WCAG 2.2 du W3C), couleurs hors palette, chevauchements, fonctionnalités et décisions du projet. Chaque conseil dit d’où il vient et à quel point il est sûr. Vous décidez.</p>
  <ErrorBox error={error}/>{notice&&<p role="status" className="notice">{notice}</p>}
  <Button kind="secondary" disabled={busy} onClick={()=>void load()}>{data?'Vérifier à nouveau':'Vérifier la maquette'}</Button>
  {data&&(data.items.length===0?<p className="notice">Aucun conseil : rien ne déclenche les règles.{data.refused_hidden?` (${data.refused_hidden} conseil(s) refusé(s) masqué(s).)`:''}</p>:<>
   <p className="muted">{data.items.length} conseil(s){data.refused_hidden?` · ${data.refused_hidden} refusé(s), masqué(s)`:''}. Source des seuils : {data.sources}</p>
   <ul className="mq-tips">{data.items.map((s:any)=><li key={s.rule+s.key} className={'mq-tip'+(s.decision==='accepted'?' ok':'')}>
    <strong>{s.title}</strong>
    <span className="mq-level">{SYMBOL[s.level]} {s.level_word}</span>
    <p>{s.detail}</p>
    <small className="muted">Règle : {s.source.url?<a href={s.source.url} target="_blank" rel="noreferrer">{s.source.label}</a>:s.source.label}</small>
    {s.decision==='accepted'?<p className="muted">✔ Accepté : sera dans la fiche et la mission.</p>:
     <div className="mq-row"><Button disabled={busy} onClick={()=>void decide(s,'accepted')}>Accepter</Button><Button kind="secondary" disabled={busy} onClick={()=>void decide(s,'refused')}>Refuser</Button></div>}
   </li>)}</ul>
   <small className="muted">Un conseil refusé ne revient pas. Il ne réapparaît que si la situation change (par exemple une autre couleur).</small>
  </>)}
 </div>;
}
