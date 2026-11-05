/* Persistance du relais : état des connexions et historique de consommation (D1). Toutes les écritures sont tolérantes. */
import {mergeObservation,type StoredFailure,type Availability} from './ai-availability.ts';
import type {RelayConnection} from './ai-relay.ts';
import type {AttemptLog} from './ai-relay.ts';

type Observation={type:'failure';failure:StoredFailure}|{type:'success';model:string;headers?:Record<string,any>|null};

/** Ajoute une observation au quota d'UNE connexion (jamais mélangée avec une autre clé). Contrôle optimiste, 3 essais. */
export async function recordObservation(db:D1Database,connectionId:string,userId:string,credentialSnapshot:string,obs:Observation,now:string):Promise<boolean>{
 for(let attempt=0;attempt<3;attempt++){
  const row=await db.prepare('SELECT quota FROM connections WHERE id=? AND user_id=? AND secret=?').bind(connectionId,userId,credentialSnapshot).first<{quota:string|null}>();
  if(!row)return false; // clé remplacée entre-temps : l'observation ne concerne plus cette clé
  const next=JSON.stringify(mergeObservation(row.quota,obs,now));
  const res=await db.prepare("UPDATE connections SET quota=? WHERE id=? AND user_id=? AND secret=? AND COALESCE(quota,'')=COALESCE(?,'')").bind(next,connectionId,userId,credentialSnapshot,row.quota).run();
  if(res.meta.changes===1)return true;
 }
 return false;
}

export async function loadAiConnections(db:D1Database,userId:string):Promise<RelayConnection[]>{
 const rows=await db.prepare("SELECT id,label,provider,status,models,scopes,api_consent,expires_at,quota FROM connections WHERE user_id=? AND provider IN ('mistral','gemini','groq','openai','anthropic') ORDER BY created_at").bind(userId).all<any>();
 return rows.results as RelayConnection[];
}

/** Appels IA des dernières 24 h par connexion : sert seulement à départager des candidats équivalents. */
export async function recentCalls(db:D1Database,userId:string,now:string):Promise<Record<string,number>>{
 try{
  const since=new Date(Date.parse(now)-86_400_000).toISOString();
  const rows=await db.prepare('SELECT connection_id,COUNT(*) AS n FROM ai_usage WHERE user_id=? AND started_at>=? GROUP BY connection_id').bind(userId,since).all<{connection_id:string;n:number}>();
  return Object.fromEntries(rows.results.map(r=>[r.connection_id,r.n]));
 }catch{return {};} // migration 0013 absente
}

export async function recordUsage(db:D1Database,userId:string,input:{task_kind:string;task_id:string|null;role:string|null;attempts:AttemptLog[];tokens?:Record<string,{input?:number;output?:number}>}):Promise<void>{
 try{
  const stmts=input.attempts.filter(a=>a.outcome!=='skipped').map(a=>{
   const t=input.tokens?.[a.connection_id+'\n'+a.model];
   return db.prepare('INSERT INTO ai_usage(id,user_id,connection_id,provider,model,task_kind,task_id,role,outcome,failure_kind,input_tokens,output_tokens,started_at,ended_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),userId,a.connection_id,a.provider,a.model,input.task_kind,input.task_id,input.role,a.outcome,a.kind,a.outcome==='completed'?t?.input??null:null,a.outcome==='completed'?t?.output??null:null,a.started_at,a.ended_at);
  });
  if(stmts.length)await db.batch(stmts);
 }catch{/* l'historique ne doit jamais interrompre une tâche */}
}

export const unavailable=(reason:string):Availability=>({usable:false,state:'ineligible',kind:null,label:'Indisponible',until:null,until_source:null,probe:false,quota_known:false,known:{},reason});
