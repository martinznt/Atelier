import {unseal} from './crypto.ts';
import {testConnection} from './connectors/ai.ts';
import {ProviderError} from './connectors/http.ts';
import type {Env} from './types.ts';

import {recordModelCatalogue} from './catalog-store.ts';
export {recordModelCatalogue} from './catalog-store.ts';

/** Opt-in metadata refresh only. No generation, benchmark, model switch or paid inference. */
export async function refreshModelCatalogues(env:Env):Promise<void>{
 const date=new Date().toISOString(),old=new Date(Date.now()-86400000).toISOString(),retry=new Date(Date.now()-3600000).toISOString();
 const {results}=await env.DB.prepare(`SELECT c.* FROM connections c JOIN users u ON u.id=c.user_id
  WHERE c.auto_refresh_models=1 AND c.status='connected' AND c.provider IN ('openai','anthropic','gemini') AND u.deleted_at IS NULL
  AND (c.expires_at IS NULL OR c.expires_at>?) AND (c.models_checked_at IS NULL OR c.models_checked_at<?)
  AND (c.models_refresh_attempted_at IS NULL OR c.models_refresh_attempted_at<?)
  ORDER BY COALESCE(c.models_refresh_attempted_at,'') LIMIT 2`).bind(date,old,retry).all<Record<string,any>>();
 for(const conn of results){
  const claimed=await env.DB.prepare(`UPDATE connections SET models_refresh_attempted_at=? WHERE id=? AND user_id=? AND secret=? AND auto_refresh_models=1
   AND (models_refresh_attempted_at IS NULL OR models_refresh_attempted_at<?)`).bind(date,conn.id,conn.user_id,conn.secret,retry).run();
  if(!claimed.meta.changes)continue;
  try{
   const secret=await unseal(env.MASTER_KEY,conn.secret,`${conn.user_id}:${conn.id}`);
   const result=await testConnection(conn.provider,secret);
   await recordModelCatalogue(env.DB,conn.id,conn.user_id,conn.secret,result,date);
  }catch(error){
   if(error instanceof ProviderError&&[401,403].includes(error.status))await env.DB.prepare("UPDATE connections SET status='expired',tested_at=? WHERE id=? AND user_id=? AND secret=? AND (tested_at IS NULL OR tested_at<=?)").bind(date,conn.id,conn.user_id,conn.secret,date).run();
   // Keep the last known catalogue and timestamp. A failed refresh is never a success.
  }
 }
}
