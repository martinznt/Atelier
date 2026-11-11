/* Plan de projet : règles pures (aucun accès réseau ni D1). Les tâches du plan sont des tâches MÉTIER ; elles n'ont rien
   à voir avec la table `tasks` des jobs asynchrones. */
export const TASK_STATUSES=['todo','ready','in_progress','waiting','blocked','to_verify','done','abandoned'] as const;
export type TaskStatus=typeof TASK_STATUSES[number];
export const OWNERS=['user','chatgpt','claude_code','codex','gemini','mistral','other_ai','automation'] as const;
export const STATUS_LABEL:Record<TaskStatus,string>={todo:'À faire',ready:'Prêt',in_progress:'En cours',waiting:'En attente',blocked:'Bloqué',to_verify:'À vérifier',done:'Terminé',abandoned:'Abandonné'};
export const OWNER_LABEL:Record<string,string>={user:'Vous',chatgpt:'ChatGPT',claude_code:'Claude Code',codex:'Codex',gemini:'Gemini',mistral:'Mistral',other_ai:'Autre IA',automation:'Automatisation'};

export interface PlanTask{
 id:string;title:string;status:TaskStatus;depends_on:string[];priority:number;position:number;phase_id:string|null;parent_id?:string|null;
 owner?:string;proof?:string;blocking_question?:string;next_action?:string;pr_number?:number|null;
}
export function parseIds(raw:unknown):string[]{
 try{const v=typeof raw==='string'?JSON.parse(raw):raw;return Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,20):[];}catch{return [];}
}
const byIdOf=(tasks:PlanTask[])=>new Map(tasks.map(t=>[t.id,t]));

/** Prérequis non terminés. Un prérequis abandonné ou introuvable n'est PAS satisfait : l'utilisateur corrige la dépendance. */
export function unmetDependencies(task:PlanTask,all:PlanTask[]):PlanTask[]{
 const m=byIdOf(all);
 return task.depends_on.map(id=>m.get(id)).filter((d):d is PlanTask=>!d||d.status!=='done').map(d=>d||({id:'?',title:'tâche introuvable',status:'todo',depends_on:[],priority:3,position:0,phase_id:null} as PlanTask));
}
/** Vrai si ajouter ces dépendances à `taskId` créerait un cycle (y compris vers elle-même). */
export function wouldCycle(taskId:string,newDeps:string[],all:PlanTask[]):boolean{
 const m=byIdOf(all);
 const reaches=(from:string,target:string,seen=new Set<string>()):boolean=>{
  if(from===target)return true;if(seen.has(from))return false;seen.add(from);
  const t=m.get(from);return (t?t.depends_on:[]).some(d=>reaches(d,target,seen));
 };
 return newDeps.some(d=>d===taskId||reaches(d,taskId));
}
/** Un statut « prêt » ou « en cours » (ou « à vérifier » / « terminé ») suppose les prérequis terminés. */
export function statusAllowed(task:PlanTask,next:TaskStatus,all:PlanTask[]):{ok:true}|{ok:false;reason:string}{
 if(['ready','in_progress','to_verify','done'].includes(next)){
  const unmet=unmetDependencies(task,all);
  if(unmet.length)return {ok:false,reason:'Prérequis non terminés : '+unmet.map(u=>'« '+u.title+' »').join(', ')+'. Terminez-les d’abord ou retirez la dépendance.'};
 }
 if(next==='blocked'&&!String(task.blocking_question||'').trim())return {ok:false,reason:'Indiquez la question ou le blocage avant de marquer la tâche « Bloqué ».'};
 return {ok:true};
}
/** Statut affiché : une tâche « à faire » ou « prête » dont un prérequis manque est en attente, jamais prête. */
export function effectiveStatus(task:PlanTask,all:PlanTask[]):TaskStatus{
 if((task.status==='todo'||task.status==='ready')&&unmetDependencies(task,all).length)return 'waiting';
 return task.status;
}
export function isVerifiedDone(t:PlanTask){return t.status==='done'&&String(t.proof||'').trim().length>0;}
export function progressOf(tasks:PlanTask[]){
 const live=tasks.filter(t=>t.status!=='abandoned');
 const done=live.filter(t=>t.status==='done');
 return {total:live.length,done:done.length,verified:done.filter(isVerifiedDone).length,unverified_done:done.filter(t=>!isVerifiedDone(t)).length,
  blocked:live.filter(t=>t.status==='blocked').length,to_verify:live.filter(t=>t.status==='to_verify').length,in_progress:live.filter(t=>t.status==='in_progress').length};
}
/** Prochaine tâche utile : non terminée, non bloquée, prérequis terminés ; priorité (1 = haute), puis ordre. */
export function pickNextTask(tasks:PlanTask[],phaseOrder:Record<string,number>={}):PlanTask|null{
 const candidates=tasks.filter(t=>['todo','ready','in_progress'].includes(t.status)&&!unmetDependencies(t,tasks).length);
 candidates.sort((a,b)=>(a.status==='in_progress'?0:1)-(b.status==='in_progress'?0:1)||a.priority-b.priority||(phaseOrder[a.phase_id||'']??999)-(phaseOrder[b.phase_id||'']??999)||a.position-b.position||a.title.localeCompare(b.title));
 return candidates[0]||null;
}
