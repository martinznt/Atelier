/* Lecture des tests d'une PR. Les « check-runs » exigent le droit Checks, que les jetons GitHub à
   permissions fines (personnels) ne proposent pas (docs.github.com/en/rest/checks/runs : jetons d'application
   seulement ; lisibles sans jeton uniquement sur un dépôt public). Repli : exécutions GitHub Actions du commit,
   couvertes par le droit « Actions : lecture ». Les contrôles d'autres services ne sont pas visibles par ce repli. */
export interface CheckItem{name:string;status:string;conclusion:string|null}
export type Fetcher=(path:string)=>Promise<{data:any;hasNext?:boolean}>;
export interface ChecksResult{checks:CheckItem[];source:'check_runs'|'actions';error:unknown|null;partial:boolean}

export async function loadChecks(get:Fetcher,base:string,sha:string):Promise<ChecksResult>{
 let firstError:unknown=null;
 try{
  const r=await get(base+'/commits/'+sha+'/check-runs?per_page=30');
  return {checks:(r.data?.check_runs||[]).map((x:any)=>({name:String(x.name),status:String(x.status),conclusion:x.conclusion??null})),source:'check_runs',error:null,partial:Boolean(r.hasNext)};
 }catch(e){firstError=e;}
 try{
  const r=await get(base+'/actions/runs?head_sha='+sha+'&per_page=30');
  const runs=Array.isArray(r.data?.workflow_runs)?r.data.workflow_runs:[];
  return {checks:runs.map((x:any)=>({name:String(x.name||'Workflow'),status:String(x.status),conclusion:x.conclusion??null})),source:'actions',error:null,partial:Boolean(r.hasNext)};
 }catch{return {checks:[],source:'check_runs',error:firstError,partial:false};}
}
