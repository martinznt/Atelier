/* Suivi GitHub d'un projet : lecture seule. Chaque état distingue « inconnu » (rien reçu), « en attente », « échec » et « réussi » ;
   une réussite n'est jamais déduite d'une absence d'information. */
import {loadChecks,type CheckItem,type Fetcher} from './github-checks.ts';
export type CiState='success'|'failure'|'pending'|'unknown';
export interface CiSummary{state:CiState;total:number;failed:number;pending:number;source:'check_runs'|'actions'|null}
const FAIL=new Set(['failure','timed_out','cancelled','action_required','startup_failure','stale']);
const OK=new Set(['success','neutral','skipped']);
export function ciSummary(checks:CheckItem[]|null,source:'check_runs'|'actions'|null=null):CiSummary{
 if(!checks||!checks.length)return {state:'unknown',total:0,failed:0,pending:0,source};
 const failed=checks.filter(c=>c.status==='completed'&&c.conclusion&&FAIL.has(c.conclusion)).length;
 const pending=checks.filter(c=>c.status!=='completed').length;
 const unknownDone=checks.filter(c=>c.status==='completed'&&!(c.conclusion&&(FAIL.has(c.conclusion)||OK.has(c.conclusion)))).length;
 const state:CiState=failed?'failure':pending?'pending':unknownDone?'unknown':'success';
 return {state,total:checks.length,failed,pending,source};
}
export const CI_LABEL:Record<CiState,string>={success:'réussi',failure:'échec',pending:'en attente',unknown:'inconnu'};
export interface PrAction{code:'unknown'|'wait'|'fix'|'verify'|'validate'|'draft';label:string}
export function prNextAction(p:{draft:boolean;ci:CiState;review:string|null}):PrAction{
 if(p.ci==='failure')return {code:'fix',label:'Corriger : des contrôles sont en échec'};
 if(p.ci==='pending')return {code:'wait',label:'Attendre la fin des contrôles'};
 if(p.draft)return {code:'draft',label:'PR en brouillon : à terminer avant vérification'};
 if(p.ci==='unknown')return {code:'unknown',label:'Vérifier sur GitHub : aucun état de contrôle reçu'};
 if(!p.review)return {code:'verify',label:'Demander une vérification (aucun rapport Atelier pour ce commit)'};
 return {code:'validate',label:'Rapport reçu : à valider par vous'};
}
export const links=(full:string)=>({repo:`https://github.com/${full}`,branch:(b:string)=>`https://github.com/${full}/tree/${b.split('/').map(encodeURIComponent).join('/')}`,commit:(sha:string)=>`https://github.com/${full}/commit/${sha}`,pr:(n:number)=>`https://github.com/${full}/pull/${n}`});

export interface Tracked{
 available:boolean;reason?:string;checked_at:string;
 default_branch?:string;head?:{sha:string;date:string|null;message:string;url:string};head_ci?:CiSummary;
 prs?:{number:number;title:string;draft:boolean;branch:string;head_sha:string;updated_at:string;url:string;ci:CiSummary}[];
}
const reasonOf=(e:any)=>{const s=Number(e?.status);return s===401||s===403?'Accès GitHub refusé ou limité (HTTP '+s+') : vérifiez le jeton dans Réglages → Connexions.':s===404?'Dépôt ou branche introuvable avec cet accès (HTTP 404).':'GitHub n’a pas répondu'+(s?' (HTTP '+s+')':'')+' : réessayez plus tard.';};
/** Au plus 8 PR ouvertes et un appel de contrôles par PR : pas de scan massif. */
export async function trackRepository(get:Fetcher,repo:{full_name:string;branch:string},now:string,maxPrs=8):Promise<Tracked>{
 const base='/repos/'+repo.full_name;
 let info:any;try{info=(await get(base)).data;}catch(e){return {available:false,reason:reasonOf(e),checked_at:now};}
 const branch=String(info?.default_branch||repo.branch);
 const out:Tracked={available:true,checked_at:now,default_branch:branch};
 try{
  const b=(await get(base+'/branches/'+encodeURIComponent(branch))).data;const sha=String(b?.commit?.sha||'');
  if(/^[0-9a-f]{40}$/.test(sha)){
   out.head={sha,date:b?.commit?.commit?.committer?.date||null,message:String(b?.commit?.commit?.message||'').split('\n')[0].slice(0,200),url:links(repo.full_name).commit(sha)};
   const c=await loadChecks(get,base,sha);out.head_ci=ciSummary(c.error?null:c.checks,c.error?null:c.source);
  }
 }catch{/* tête de branche inconnue : laissée absente, jamais inventée */}
 try{
  const prs=(await get(base+'/pulls?state=open&sort=updated&per_page='+maxPrs)).data;
  out.prs=[];
  for(const p of (Array.isArray(prs)?prs:[]).slice(0,maxPrs)){
   const head=String(p?.head?.sha||'');let ci:CiSummary={state:'unknown',total:0,failed:0,pending:0,source:null};
   if(/^[0-9a-f]{40}$/.test(head)){const c=await loadChecks(get,base,head);ci=ciSummary(c.error?null:c.checks,c.error?null:c.source);}
   out.prs.push({number:Number(p.number),title:String(p.title||'').slice(0,200),draft:Boolean(p.draft),branch:String(p?.head?.ref||''),head_sha:head,updated_at:String(p.updated_at||''),url:links(repo.full_name).pr(Number(p.number)),ci});
  }
 }catch{/* liste des PR indisponible : champ absent, signalé par l'interface */}
 return out;
}
