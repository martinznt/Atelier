export async function recordModelCatalogue(db:D1Database,id:string,user:string,credential:string,result:{models:string[];account:string;quota:unknown},date:string):Promise<boolean>{
 const models=JSON.stringify([...new Set(result.models)].sort());
 // A model-list success does not prove that a chat rate limit has ended.
 const changed=await db.prepare(`UPDATE connections SET status='connected',models_revision=models_revision+CASE WHEN models<>? THEN 1 ELSE 0 END,
  models=?,account_label=?,models_checked_at=?,tested_at=?,
  quota=CASE WHEN json_extract(COALESCE(quota,'{}'),'$.status')='rate_limited' THEN quota ELSE ? END
  WHERE id=? AND user_id=? AND secret=? AND (models_checked_at IS NULL OR models_checked_at<=?)
  AND (tested_at IS NULL OR tested_at<=?)`).bind(models,models,result.account,date,date,JSON.stringify(result.quota),id,user,credential,date,date).run();
 return changed.meta.changes===1;
}

