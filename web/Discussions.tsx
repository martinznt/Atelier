/* Organisation des discussions : filtres, recherche dans les messages du projet, fiche d'une discussion, liens entre discussions,
   réutilisation d'un extrait et création d'objets candidats depuis un message. Les messages d'origine ne sont jamais modifiés. */
import {useEffect,useState} from 'react';
import {api,post,patch,remove,date} from './api';
import {Button,Modal,Field,ErrorBox} from './ui';

export const CATEGORIES=['Vision','Fonctionnalités','UX/UI','Règles métier','Architecture','Développement','Bugs','Audits/Tests','Décisions','Planification','Questions','Autre'];
export const CONV_STATUS:Record<string,string>={active:'Active',to_resume:'À reprendre',waiting:'En attente',archived:'Archivée'};
export interface DiscussionFilter{status:string;category:string;q:string}

export function DiscussionFilters({project,filter,onFilter,onOpenMessage}:{project:any;filter:DiscussionFilter;onFilter:(f:DiscussionFilter)=>void;onOpenMessage:(hit:any)=>void}){
 const [q,setQ]=useState(''),[hits,setHits]=useState<any[]|null>(null),[next,setNext]=useState<number|null>(null),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 async function search(more=false){
  if(q.trim().length<2){setHits(null);return;}
  setBusy(true);setError(null);
  try{const d=await api(`/workbench/search?project=${project.id}&q=${encodeURIComponent(q.trim())}${more&&next?`&before=${next}`:''}`);setHits(old=>more&&old?[...old,...d.items]:d.items);setNext(d.next);}catch(e){setError(e);}finally{setBusy(false);}
 }
 return <div className="discussion-tools">
  <div className="filter-row">
   <select aria-label="Filtrer par statut" value={filter.status} onChange={e=>onFilter({...filter,status:e.target.value})}><option value="">Tous les statuts</option>{Object.entries(CONV_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
   <select aria-label="Filtrer par thème" value={filter.category} onChange={e=>onFilter({...filter,category:e.target.value})}><option value="">Tous les thèmes</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
  </div>
  <input type="search" aria-label="Filtrer les discussions par titre" placeholder="Titre ou objectif…" value={filter.q} onChange={e=>onFilter({...filter,q:e.target.value})}/>
  <form className="filter-row" onSubmit={e=>{e.preventDefault();void search();}}>
   <input type="search" aria-label="Rechercher dans les messages du projet" placeholder="Chercher dans les messages du projet…" value={q} onChange={e=>setQ(e.target.value)}/>
   <Button kind="secondary" type="submit" disabled={busy||q.trim().length<2}>Chercher</Button>
  </form>
  <ErrorBox error={error}/>
  {hits&&<div className="search-hits" role="region" aria-label="Résultats dans les messages">
   <small className="muted">{hits.length?hits.length+' message(s) dans « '+project.name+' »':'Aucun message ne contient ce texte dans ce projet.'}<button className="link-button" onClick={()=>{setHits(null);setQ('');}}>Fermer</button></small>
   {hits.map(h=><button key={h.id} className="search-hit" onClick={()=>onOpenMessage(h)}><strong>{h.conversation_title}</strong><small>{h.role==='user'?'Vous':h.role==='note'?'Note':h.provider||h.role} · {date(h.created_at)}</small><span>{h.excerpt}</span><small className="muted">Ouvrir au message</small></button>)}
   {next&&<Button kind="text" disabled={busy} onClick={()=>void search(true)}>Résultats suivants</Button>}
  </div>}
 </div>;
}

export function DiscussionOrganiser({conversation,all,onClose,onChanged,onOpen}:{conversation:any;all:any[];onClose:()=>void;onChanged:(c:any)=>void;onOpen:(id:string)=>void}){
 const [title,setTitle]=useState(conversation.title),[category,setCategory]=useState(conversation.category||''),[status,setStatus]=useState(conversation.status||'active'),[objective,setObjective]=useState(conversation.objective||''),[pinned,setPinned]=useState(Boolean(conversation.pinned)),[summary,setSummary]=useState(conversation.summary||'');
 const [links,setLinks]=useState<any>(null),[linkTo,setLinkTo]=useState(''),[note,setNote]=useState(''),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 const loadLinks=()=>api(`/workbench/conversations/${conversation.id}/links`).then(setLinks).catch(setError);
 useEffect(()=>{void loadLinks();},[conversation.id]);
 async function save(){setBusy(true);setError(null);try{onChanged(await patch(`/workbench/conversations/${conversation.id}`,{title:title.trim()||conversation.title,category:category||null,status,objective,pinned,summary}));onClose();}catch(e){setError(e);}finally{setBusy(false);}}
 async function addLink(){setBusy(true);setError(null);try{await post(`/workbench/conversations/${conversation.id}/links`,{to_id:linkTo,note});setLinkTo('');setNote('');await loadLinks();}catch(e){setError(e);}finally{setBusy(false);}}
 const KIND:Record<string,string>={decision:'Décision',plan_task:'Tâche',question:'Question',action:'Action de Martin',conversation:'Extrait réutilisé',prompt:'Prompt',handoff:'Transmission',document:'Document'};
 return <Modal title="Organiser la discussion" onClose={onClose}><div className="stack">
  <ErrorBox error={error}/>
  <Field label="Titre"><input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></Field>
  <Field label="Objectif de la discussion"><input value={objective} maxLength={500} onChange={e=>setObjective(e.target.value)}/></Field>
  <Field label="Thème"><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Sans thème</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
  <Field label="Statut" hint="Archiver ne supprime aucun message : la discussion reste recherchable."><select value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(CONV_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
  <label className="check"><input type="checkbox" checked={pinned} onChange={e=>setPinned(e.target.checked)}/>Épingler en haut de la liste</label>
  <Field label="Résumé de reprise (écrit par vous)" hint={conversation.summary_updated_at?'Dernière mise à jour : '+date(conversation.summary_updated_at):'Faits confirmés, décisions, questions, prochaine action.'}><textarea rows={4} value={summary} maxLength={6000} onChange={e=>setSummary(e.target.value)}/></Field>
  <Button disabled={busy} onClick={()=>void save()}>Enregistrer</Button>
  <h3>Discussions liées</h3>
  {links?<>
   {links.parent&&<p className="muted">Reprise de : <button className="link-button" onClick={()=>{onOpen(links.parent.id);onClose();}}>{links.parent.title}</button></p>}
   {links.children.length>0&&<p className="muted">Reprises : {links.children.map((ch:any)=><button key={ch.id} className="link-button" onClick={()=>{onOpen(ch.id);onClose();}}>{ch.title}</button>)}</p>}
   {links.links.map((l:any)=><p key={l.id}><button className="link-button" onClick={()=>{onOpen(l.other_id);onClose();}}>{l.other_title}</button>{l.note&&<span className="muted"> — {l.note}</span>} <button className="link-button danger" onClick={()=>void remove(`/workbench/conversation-links/${l.id}`).then(loadLinks).catch(setError)}>Retirer le lien</button></p>)}
   {!links.links.length&&!links.parent&&!links.children.length&&<p className="muted">Aucune discussion liée.</p>}
   <Field label="Lier à une autre discussion du projet (les messages ne sont pas mélangés)"><select value={linkTo} onChange={e=>setLinkTo(e.target.value)}><option value="">Choisir</option>{all.filter(c=>c.id!==conversation.id).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
   {linkTo&&<><Field label="Pourquoi ce lien (facultatif)"><input value={note} maxLength={300} onChange={e=>setNote(e.target.value)}/></Field><Button kind="secondary" disabled={busy} onClick={()=>void addLink()}>Lier</Button></>}
   <h3>Ce que cette discussion a produit</h3>
   {links.objects.length?<ul className="plain">{links.objects.map((o:any)=><li key={o.id}><strong>{KIND[o.target_kind]||o.target_kind}</strong> · {date(o.created_at)}<br/><span className="muted">« {String(o.excerpt).slice(0,160)} »</span></li>)}</ul>:<p className="muted">Aucune décision, tâche ou question n’a encore été tirée de cette discussion.</p>}
  </>:<p className="muted">Lecture des liens…</p>}
 </div></Modal>;
}

/** Depuis un message : réutiliser un passage exact ailleurs (avec lien retour), ou créer un objet candidat relié à ce message. */
export function MessageActionModal({message,conversation,all,onClose,onDone}:{message:any;conversation:any;all:any[];onClose:()=>void;onDone:(text:string)=>void}){
 const initial=(()=>{try{const s=window.getSelection()?.toString().trim()||'';return s&&String(message.content).includes(s)?s:'';}catch{return '';}})();
 const [excerpt,setExcerpt]=useState(initial||String(message.content).slice(0,1500)),[action,setAction]=useState('reuse'),[target,setTarget]=useState(''),[title,setTitle]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 const exact=String(message.content).includes(excerpt.trim())&&excerpt.trim().length>0;
 const others=all.filter(c=>c.id!==conversation.id);
 async function run(){
  setBusy(true);setError(null);
  try{
   if(action==='reuse'){await post(`/workbench/messages/${message.id}/reuse`,{target_conversation_id:target,excerpt:excerpt.trim()});onDone('Extrait cité dans « '+(others.find(c=>c.id===target)?.title||'la discussion')+' », avec un lien vers ce message.');}
   else{const r=await post(`/workbench/messages/${message.id}/extract`,{kind:action,title:title.trim(),excerpt:excerpt.trim(),reason});onDone(r.kind==='decision'?'Décision proposée créée. Elle reste « proposée » tant que vous ne la validez pas dans Pilotage.':r.kind==='question'?'Question ajoutée aux Questions d’Atelier.':r.kind==='action'?'Action ajoutée à « À faire par Martin ».':'Tâche ajoutée au plan du projet.');}
   onClose();
  }catch(e){setError(e);}finally{setBusy(false);}
 }
 return <Modal title="Réutiliser ou classer ce message" onClose={onClose}><div className="stack">
  <ErrorBox error={error}/>
  <p className="muted">Source : « {conversation.title} » · {message.role==='user'?'vous':message.provider||message.role} · {date(message.created_at)}. Le message d’origine n’est pas modifié.</p>
  <Field label="Extrait exact (réduisez-le au passage utile)" hint={exact?'Passage exact du message.':'Ce texte n’est plus un passage exact du message : corrigez-le.'}><textarea rows={5} value={excerpt} maxLength={4000} onChange={e=>setExcerpt(e.target.value)}/></Field>
  <Field label="Que faire de cet extrait ?"><select value={action} onChange={e=>setAction(e.target.value)}>
   <option value="reuse">Le citer dans une autre discussion</option><option value="decision">Créer une décision proposée</option><option value="question">Créer une question d’Atelier</option><option value="action">Créer une action à faire par Martin</option><option value="plan_task">Créer une tâche du plan</option></select></Field>
  {action==='reuse'?<Field label="Discussion de destination (même projet)"><select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choisir</option>{others.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>:<>
   <Field label={action==='question'?'Question':'Intitulé'}><input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/></Field>
   <Field label="Raison ou précision (facultatif)"><textarea rows={2} value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></Field>
   {action==='decision'&&<p className="notice">Une décision créée ici est seulement « proposée ». Elle ne devient applicable que si vous la validez.</p>}</>}
  <Button disabled={busy||!exact||(action==='reuse'?!target:title.trim().length<3)} onClick={()=>void run()}>{action==='reuse'?'Citer dans cette discussion':'Créer'}</Button>
 </div></Modal>;
}
