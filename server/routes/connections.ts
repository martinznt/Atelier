import {recordModelCatalogue} from '../model-catalog.ts';
import {Hono} from 'hono';import {z} from 'zod';
import {catalog,connector} from '../connectors/catalog.ts';import {testConnection} from '../connectors/ai.ts';
import {rateLimitObservation,recordConnectionQuota} from '../collaboration.ts';
import {seal,unseal} from '../crypto.ts';import {fail,jsonBody,many,now,one,owned,run,uid,userId} from '../core.ts';import {ProviderError} from '../connectors/http.ts';
import type {AppEnv,Connection,Env} from '../types.ts';
export const connections=new Hono<AppEnv>();
export async function credentialsFor(env:Env,id:string,user:string,scope:string){if(!await one(env,'SELECT id FROM users WHERE id=? AND deleted_at IS NULL',user))fail(403,'Ce compte est désactivé.');const conn=await owned<Connection>(env,'connections',id,user);if(conn.expires_at&&conn.expires_at<now())fail(403,'Ce jeton a expiré. Remplacez-le dans Connexions.');if(!JSON.parse(conn.scopes).includes(scope))fail(403,'Cet accès n’a pas été autorisé dans la connexion.');return {conn,secret:await unseal(env.MASTER_KEY,conn.secret,`${user}:${conn.id}`)};}
connections.get('/catalog',c=>c.json({items:catalog}));
connections.get('/',async c=>c.json({items:(await many(c.env,'SELECT id,provider,label,scopes,status,models,account_label,quota,tested_at,expires_at,created_at,api_consent,models_checked_at,models_revision,auto_refresh_models FROM connections WHERE user_id=? ORDER BY created_at',userId(c))).map(r=>({...r,models:JSON.parse(r.models),scopes:JSON.parse(r.scopes),quota:r.quota?JSON.parse(r.quota):{kind:'unavailable'}}))}));
connections.post('/',async c=>{
 const d=z.object({provider:z.string(),label:z.string().trim().min(1).max(80),secret:z.string().trim().min(10).max(4096),scopes:z.array(z.enum(['read','write','chat','deploy'])).min(1),api_consent:z.boolean().default(false),expires_at:z.string().datetime().nullable().default(null)}).parse(await jsonBody(c));
 const definition=connector(d.provider);if(!definition?.available)fail(400,'Ce connecteur n’est pas encore disponible.');if(definition.category==='ai'&&!d.api_consent)fail(400,'Confirmez l’utilisation de l’API et sa facturation éventuelle.');
 const id=uid();await run(c.env,'INSERT INTO connections(id,user_id,provider,label,secret,scopes,api_consent,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',id,userId(c),d.provider,d.label,await seal(c.env.MASTER_KEY,d.secret,`${userId(c)}:${id}`),JSON.stringify(d.scopes),Number(d.api_consent),d.expires_at,now());return c.json({id,status:'untested'},201);
});
connections.post('/:id/test',async c=>{
 const conn=await owned<Connection>(c.env,'connections',c.req.param('id'),userId(c));
 const started=now();
 let result:Awaited<ReturnType<typeof testConnection>>;
 try{if(conn.expires_at&&conn.expires_at<started)throw new ProviderError(401,'expired');const secret=await unseal(c.env.MASTER_KEY,conn.secret,`${userId(c)}:${conn.id}`);result=await testConnection(conn.provider,secret);}
 catch(error){const observed=now();if(error instanceof ProviderError&&error.status===429)await recordConnectionQuota(c.env.DB,conn.id,userId(c),conn.secret,rateLimitObservation(error.retryAfter,observed));await run(c.env,'UPDATE connections SET status=?,tested_at=? WHERE id=? AND user_id=? AND secret=? AND (tested_at IS NULL OR tested_at<=?)',error instanceof ProviderError&&[401,403].includes(error.status)?'expired':'error',started,conn.id,userId(c),conn.secret,started);throw error;}
 const changed=await recordModelCatalogue(c.env.DB,conn.id,userId(c),conn.secret,result,started);
 if(!changed)fail(409,'Cette connexion a été modifiée ou un test plus récent est arrivé. Actualisez ses informations avant de réessayer.');
 return c.json(result);
});
connections.patch('/:id',async c=>{
 const conn=await owned<Connection>(c.env,'connections',c.req.param('id'),userId(c));
 const d=z.object({auto_refresh_models:z.boolean().optional(),label:z.string().trim().min(1).max(80).optional(),secret:z.string().trim().min(10).max(4096).optional(),expires_at:z.string().datetime().nullable().optional(),scopes:z.array(z.enum(['read','write'])).min(1).optional()}).strict().refine(value=>value.label!==undefined||value.secret!==undefined||value.auto_refresh_models!==undefined||value.scopes!==undefined,{message:'Indiquez un nom ou un nouvel accès.'}).parse(await jsonBody(c));
 if(d.auto_refresh_models!==undefined&&!['openai','anthropic','gemini','mistral','groq'].includes(conn.provider))fail(400,'Ce service ne propose pas de catalogue de modèles IA.');
 if(d.secret!==undefined){
  await run(c.env,"UPDATE connections SET label=COALESCE(?,label),secret=?,expires_at=CASE WHEN ? THEN ? ELSE expires_at END,status='untested',models='[]',models_revision=models_revision+1,models_checked_at=NULL,models_refresh_attempted_at=NULL,account_label=NULL,quota=NULL,tested_at=NULL WHERE id=? AND user_id=?",d.label??null,await seal(c.env.MASTER_KEY,d.secret,`${userId(c)}:${conn.id}`),Number(d.expires_at!==undefined),d.expires_at??null,conn.id,userId(c));
 }else if(d.label!==undefined){
  await run(c.env,'UPDATE connections SET label=?,expires_at=CASE WHEN ? THEN ? ELSE expires_at END WHERE id=? AND user_id=?',d.label,Number(d.expires_at!==undefined),d.expires_at??null,conn.id,userId(c));
 }
 if(d.scopes!==undefined){
  // Seul l'accès GitHub peut être élargi ou réduit ici, par son propriétaire ; « lire » reste toujours accordé.
  if(conn.provider!=='github')fail(400,'Les accès de ce service ne se modifient pas ici.');
  const scopes=[...new Set(['read',...d.scopes])];
  await run(c.env,'UPDATE connections SET scopes=? WHERE id=? AND user_id=?',JSON.stringify(scopes),conn.id,userId(c));
 }
 if(d.auto_refresh_models!==undefined)await run(c.env,'UPDATE connections SET auto_refresh_models=? WHERE id=? AND user_id=?',Number(d.auto_refresh_models),conn.id,userId(c));
 return c.json({ok:true});
});
connections.delete('/:id',async c=>{await owned(c.env,'connections',c.req.param('id'),userId(c));const active=await many(c.env,"SELECT payload FROM tasks WHERE user_id=? AND status IN ('queued','running')",userId(c));if(active.some(t=>JSON.stringify(JSON.parse(t.payload)).includes(c.req.param('id'))))fail(409,'Arrêtez les tâches utilisant cette connexion avant de la retirer.');await run(c.env,'DELETE FROM connections WHERE id=? AND user_id=?',c.req.param('id'),userId(c));return c.json({ok:true,message:'Secret effacé d’Atelier. Révoquez également le jeton chez le fournisseur si nécessaire.'});});
