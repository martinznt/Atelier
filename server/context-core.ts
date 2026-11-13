/* Contexte utile pour une réflexion : choix local et déterministe (aucune IA, aucun quota) des éléments du projet liés à un sujet.
   Chaque élément garde sa source, le pourquoi de sa sélection et son niveau de fiabilité. Module pur. */
const STOP=new Set('alors aussi assez avant avec avoir bien cela celui cette ceux chaque comme comment dans donc dont elle elles encore entre était être faire fait faut leur leurs mais même moins notre nous pour pourquoi quand quel quelle quels sans sera seront sont sous tout toute toutes tous très votre vous cet ces ses son sur par pas plus que qui quoi des les une aux est ont ils elle y a l d j n s t c m qu ou où si ne de du en et le la un au ce se on il je tu'.split(/\s+/));
export function significantTerms(text:string,max=6):string[]{
 const words=String(text||'').toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=4&&!STOP.has(w)&&!/^\d+$/.test(w));
 const freq=new Map<string,number>();for(const w of words)freq.set(w,(freq.get(w)||0)+1);
 return [...freq.entries()].sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length||a[0].localeCompare(b[0])).slice(0,max).map(([w])=>w);
}
export const matchedTerms=(haystack:string,terms:string[])=>{const h=String(haystack||'').toLowerCase();return terms.filter(t=>h.includes(t));};
export type Level='confirmed'|'proposed'|'obsolete'|'rejected'|'verified'|'unverified'|'source';
export interface Reliability{level:Level;label:string;usable:boolean|'source'}
export function reliabilityOf(kind:string,r:{status?:string|null;proof?:string|null;reliability?:string|null}):Reliability{
 if(kind==='decision'){
  if(r.status==='validated')return {level:'confirmed',label:'Décision confirmée',usable:true};
  if(r.status==='superseded')return {level:'obsolete',label:'Décision remplacée : ne plus appliquer',usable:false};
  if(r.status==='rejected')return {level:'rejected',label:'Décision rejetée',usable:false};
  return {level:'proposed',label:'Proposition non confirmée : pas une règle',usable:false};
 }
 if(kind==='task'){
  if(r.status==='done'&&String(r.proof||'').trim())return {level:'verified',label:'Réalisé, preuve notée',usable:true};
  if(r.status==='done')return {level:'unverified',label:'Terminé sans preuve : non vérifié',usable:false};
  if(r.status==='abandoned')return {level:'obsolete',label:'Tâche abandonnée',usable:false};
  return {level:'unverified',label:'Pas terminée',usable:false};
 }
 if(kind==='document'){
  const m:Record<string,Reliability>={user_confirmed:{level:'confirmed',label:'Confirmé par vous',usable:true},verified:{level:'verified',label:'Vérifié directement',usable:true},superseded:{level:'obsolete',label:'Remplacé ou obsolète',usable:false},reported:{level:'unverified',label:'Rapporté, non reproduit',usable:false},deduced:{level:'unverified',label:'Déduit',usable:false},ai_proposed:{level:'proposed',label:'Proposé par une IA',usable:false},to_confirm:{level:'unverified',label:'À confirmer',usable:false}};
  return m[String(r.reliability)]||{level:'unverified',label:'Non vérifié',usable:false};
 }
 if(kind==='chat'||kind==='imported')return {level:'source',label:'Message d’origine : une citation, pas un fait vérifié',usable:'source'};
 return {level:'unverified',label:'Note : à vérifier',usable:false};
}
export interface CtxHit{kind:string;id:string;title:string;excerpt:string;matched:string[];date:string|null;status:string|null;reliability:Reliability;replaced_by?:string|null;open:Record<string,unknown>}
export function rank(hits:CtxHit[],perKind=5):CtxHit[]{
 const by=new Map<string,CtxHit[]>();for(const h of hits)(by.get(h.kind)||by.set(h.kind,[]).get(h.kind)!).push(h);
 const out:CtxHit[]=[];for(const list of by.values())out.push(...list.sort((a,b)=>b.matched.length-a.matched.length||String(b.date||'').localeCompare(String(a.date||''))).slice(0,perKind));
 return out;
}
export function warnings(hits:CtxHit[]):string[]{
 const w:string[]=[],dec=hits.filter(h=>h.kind==='decision');
 if(dec.some(h=>h.reliability.level==='obsolete'))w.push('Une décision remplacée correspond à ce sujet : elle est signalée et ne doit pas être appliquée.');
 if(dec.some(h=>h.reliability.level==='proposed'))w.push('Une proposition non confirmée correspond à ce sujet : ce n’est pas une décision.');
 const confirmed=dec.filter(h=>h.reliability.level==='confirmed');
 if(confirmed.length>=2&&confirmed.some((a,i)=>confirmed.slice(i+1).some(b=>a.matched.filter(t=>b.matched.includes(t)).length>=2)))w.push('Plusieurs décisions confirmées touchent ce sujet : vérifiez qu’elles ne se contredisent pas (Atelier ne le détecte pas).');
 if(hits.some(h=>h.kind==='task'&&h.reliability.label.startsWith('Terminé sans preuve')))w.push('Des tâches « terminées » n’ont pas de preuve : ne les considérez pas comme acquises.');
 if(!hits.length)w.push('Aucun élément trouvé : soit le sujet n’a pas encore été traité dans ce projet, soit il est formulé avec d’autres mots.');
 return w;
}
/** Bloc à coller dans une conversation avec une IA : seulement ce qui a été choisi, avec la nature et la source de chaque ligne. */
export function contextText(topic:string,project:string,hits:Pick<CtxHit,'kind'|'title'|'excerpt'|'date'|'reliability'|'id'>[]):string{
 const KIND:Record<string,string>={decision:'Décision',task:'Tâche',document:'Document',memory:'Note',chat:'Message du chat',imported:'Message importé'};
 const o=['# Contexte sélectionné — '+project,'Sujet : '+topic.replace(/\s+/g,' ').slice(0,300),'','Chaque ligne indique sa nature. Seules les « décisions confirmées » sont des règles ; les messages sont des citations, pas des faits vérifiés.',''];
 for(const h of hits)o.push('- ['+(KIND[h.kind]||h.kind)+' · '+h.reliability.label+'] '+h.title+(h.excerpt&&h.excerpt!==h.title?' — '+h.excerpt:'')+' (source Atelier : '+h.kind+' '+h.id.slice(0,8)+(h.date?', '+h.date.slice(0,10):'')+')');
 o.push('','Ne pas traiter ce contexte comme exhaustif : ce qui n’est pas listé n’est pas forcément inexistant.');
 return o.join('\n');
}
