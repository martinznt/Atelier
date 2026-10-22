import {Hono} from 'hono';import {z} from 'zod';import {zipSync} from 'fflate';
import {credentialsFor} from './connections.ts';import {jsonRequest,request} from '../connectors/http.ts';import {externalAction} from '../actions.ts';import {getVersion,readVersion} from '../storage.ts';
import {fail,jsonBody,many,now,owned,run,uid,userId} from '../core.ts';import type {AppEnv} from '../types.ts';
export const deployments=new Hono<AppEnv>();
const remoteId=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
deployments.get('/sites',async c=>{
 const {conn,secret}=await credentialsFor(c.env,c.req.query('connection')||'',userId(c),'read');const page=Math.max(1,Number(c.req.query('page'))||1);
 if(conn.provider==='netlify'){const d=await jsonRequest('netlify',secret,`/api/v1/sites?per_page=30&page=${page}`);return c.json({items:d.data.map((s:any)=>({id:s.id,name:s.name,url:s.ssl_url||s.url,auto_deploy:!!s.build_settings?.repo_url})),next:d.data.length===30?page+1:null});}
 if(conn.provider==='cloudflare'){const account=c.req.query('account');if(!account){const d=await jsonRequest('cloudflare',secret,`/client/v4/accounts?page=${page}&per_page=30`);return c.json({accounts:d.data.result,next:d.data.result_info?.total_pages>page?page+1:null});}remoteId.parse(account);const d=await jsonRequest('cloudflare',secret,`/client/v4/accounts/${account}/pages/projects?page=${page}&per_page=30`);return c.json({items:d.data.result.map((s:any)=>({id:s.name,name:s.name,url:`https://${s.subdomain}`,auto_deploy:!!s.source})),next:d.data.result_info?.total_pages>page?page+1:null});}
 fail(400,'Choisissez une connexion d’hébergement.');
});
deployments.get('/targets',async c=>c.json({items:await many(c.env,'SELECT t.*,c.provider,c.label AS connection_label FROM deployment_targets t JOIN connections c ON c.id=t.connection_id WHERE t.user_id=? AND (? IS NULL OR t.project_id=?) ORDER BY t.created_at',userId(c),c.req.query('project')||null,c.req.query('project')||null)}));
deployments.post('/targets',async c=>{const d=z.object({project_id:z.string().uuid(),connection_id:z.string().uuid(),name:z.string().min(1).max(100),remote_id:remoteId,account_id:remoteId.optional(),environment:z.enum(['preview','production'])}).parse(await jsonBody(c));await owned(c.env,'projects',d.project_id,userId(c));const {conn,secret}=await credentialsFor(c.env,d.connection_id,userId(c),'read');if(conn.provider==='cloudflare'){if(!d.account_id)fail(400,'Compte Cloudflare requis.');await jsonRequest('cloudflare',secret,`/client/v4/accounts/${d.account_id}/pages/projects/${d.remote_id}`);}else if(conn.provider==='netlify')await jsonRequest('netlify',secret,`/api/v1/sites/${d.remote_id}`);else fail(400,'Service non pris en charge.');const id=uid();await run(c.env,'INSERT INTO deployment_targets(id,user_id,project_id,connection_id,name,remote_id,account_id,environment,created_at) VALUES(?,?,?,?,?,?,?,?,?)',id,userId(c),d.project_id,d.connection_id,d.name,d.remote_id,d.account_id??null,d.environment,now());return c.json({id},201);});
deployments.get('/:id/history',async c=>{
 const t=await owned(c.env,'deployment_targets',c.req.param('id'),userId(c));const {conn,secret}=await credentialsFor(c.env,t.connection_id,userId(c),'read');const page=Math.max(1,Number(c.req.query('page'))||1);
 const result=await jsonRequest(conn.provider,secret,conn.provider==='netlify'?`/api/v1/sites/${t.remote_id}/deploys?per_page=20&page=${page}`:`/client/v4/accounts/${t.account_id}/pages/projects/${t.remote_id}/deployments?per_page=20&page=${page}`);
 const rows=conn.provider==='netlify'?result.data:result.data.result;
 return c.json({items:rows.map((d:any)=>conn.provider==='netlify'?{id:d.id,status:d.state,environment:d.context,branch:d.branch,commit_sha:d.commit_ref,created_at:d.created_at,url:d.deploy_ssl_url||d.deploy_url,error:d.error_message?String(d.error_message).slice(0,500):null}:{id:d.id,status:d.latest_stage?.status,environment:d.environment,branch:d.deployment_trigger?.metadata?.branch,commit_sha:d.deployment_trigger?.metadata?.commit_hash,created_at:d.created_on,url:d.url}),next:rows.length===20?page+1:null});
});
deployments.post('/:id/preview',async c=>{
 const t=await owned(c.env,'deployment_targets',c.req.param('id'),userId(c));const {conn,secret}=await credentialsFor(c.env,t.connection_id,userId(c),'deploy');
 const d=z.object({files:z.array(z.object({id:z.string().uuid(),path:z.string().min(1).max(200),version:z.number().int().positive()})).min(1).max(100),idempotency_key:z.string().uuid(),publication_consent:z.literal(true),cost_consent:z.literal(true)}).parse(await jsonBody(c));
 if(conn.provider!=='netlify')fail(400,'L’envoi ZIP est disponible pour Netlify. Pour Cloudflare, utilisez le suivi et la relance d’un déploiement Pages existant.');
 if(t.environment!=='preview')fail(400,'Sélectionnez une cible de test.');
 return c.json(await externalAction(c.env,userId(c),t.project_id,d.idempotency_key,'deployment',d,async()=>{
 const archive:Record<string,Uint8Array>={};let total=0;
 for(const selected of d.files){const {file,version}=await getVersion(c.env,userId(c),selected.id,selected.version);if(file.project_id!==t.project_id)fail(403,'Tous les fichiers doivent appartenir au projet.');if(selected.path.startsWith('/')||selected.path.split('/').some(p=>p==='..'||p==='.'||p==='')||selected.path.includes('\\')||archive[selected.path])fail(400,'Chemin de publication invalide ou dupliqué.');total+=version.size;if(total>20*1048576)fail(413,'Le déploiement ZIP est limité à 20 Mo dans ce lot.');const obj=await readVersion(c.env,userId(c),version);if(!obj)fail(404,'Contenu introuvable.');archive[selected.path]=new Uint8Array(await obj.arrayBuffer());}
 if(!archive['index.html'])fail(400,'Un fichier doit être affecté au chemin index.html.');
 const response=await request('netlify',secret,`/api/v1/sites/${t.remote_id}/deploys?draft=true`,{method:'POST',headers:{'Content-Type':'application/zip'},body:zipSync(archive,{level:0}) as BodyInit});const result:any=await response.json();
 const id=uid();await run(c.env,'INSERT INTO deployments(id,user_id,project_id,target_id,remote_id,status,url,detail,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,userId(c),t.project_id,t.id,result.id,result.state,result.deploy_ssl_url||result.deploy_url||null,'Instantané des fichiers de la bibliothèque, aucun commit Git revendiqué.',now(),now());return {id,remote_id:result.id,status:result.state,url:result.deploy_ssl_url||result.deploy_url};
 }));
});
deployments.post('/:id/action',async c=>{
 const t=await owned(c.env,'deployment_targets',c.req.param('id'),userId(c));const {conn,secret}=await credentialsFor(c.env,t.connection_id,userId(c),'deploy');const d=z.object({action:z.enum(['retry','rollback','publish']),remote_id:remoteId,idempotency_key:z.string().uuid(),publication_consent:z.literal(true),cost_consent:z.literal(true),data_migrations_ack:z.literal(true)}).parse(await jsonBody(c));
 return c.json(await externalAction(c.env,userId(c),t.project_id,d.idempotency_key,'deployment-action',d,async()=>{
 if(conn.provider==='cloudflare'){
 if(d.action==='publish')fail(400,'Publiez depuis Cloudflare après vérification de la branche de production.');
 const result=await jsonRequest('cloudflare',secret,`/client/v4/accounts/${t.account_id}/pages/projects/${t.remote_id}/deployments/${d.remote_id}/${d.action}`,{method:'POST'});if(!result.data.success)fail(502,'Cloudflare a refusé cette action.');return {status:result.data.result.latest_stage?.status||'pending',deployment:result.data.result};
 }
 if(d.action==='retry')fail(400,'Pour cet hébergeur, relancez un nouvel aperçu après vérification.');
 // The site-scoped endpoint prevents restoring a deployment on another site.
 return (await jsonRequest('netlify',secret,`/api/v1/sites/${t.remote_id}/deploys/${d.remote_id}/restore`,{method:'POST'})).data;
 }));
});
