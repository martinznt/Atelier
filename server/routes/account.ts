import {readVersion} from '../storage.ts';
import {inspectAtelierReadiness} from '../readiness.ts';
import {probeGithubNetwork} from '../github-probe.ts';
import {DEFAULT_STORAGE_BYTES,MAX_TEXT_BYTES,SHARED_STORAGE_BYTES} from '../storage-store.ts';
import {Hono} from 'hono';import {z} from 'zod';import {zipSync,strToU8} from 'fflate';import {deleteCookie} from 'hono/cookie';
import {verifyPassword} from '../password.ts';import {fail,jsonBody,many,now,run,safeFilename,userId} from '../core.ts';import {rateLimit} from '../auth.ts';import type {AppEnv} from '../types.ts';
export const account=new Hono<AppEnv>();
account.get('/readiness',async c=>c.json(await inspectAtelierReadiness(c.env)));
account.post('/github-probe',async c=>{await rateLimit(c.env,`github-egress:${userId(c)}`,12,3600);return c.json(await probeGithubNetwork());});

account.get('/usage',async c=>c.json({storage:{used:(await many(c.env,'SELECT bytes FROM file_storage_usage WHERE user_id=?',userId(c)))[0]?.bytes||0,limit:Math.min(Number(c.env.STORAGE_LIMIT_MB||20)*1048576,DEFAULT_STORAGE_BYTES),max_file_bytes:MAX_TEXT_BYTES,provider:'d1-text',shared_limit:SHARED_STORAGE_BYTES,notice:'Petits textes UTF-8 uniquement. Les dépôts GitHub et fichiers locaux ont leurs propres limites.'},monthly_token_limit:c.get('user').monthly_tokens,connections:await many(c.env,"SELECT c.id,c.label,c.provider,c.status,c.quota,c.tested_at,SUM(COALESCE(t.input_tokens,0)) AS input_tokens,SUM(COALESCE(t.output_tokens,0)) AS output_tokens FROM connections c LEFT JOIN tasks t ON t.user_id=c.user_id AND t.payload LIKE '%'||c.id||'%' AND t.created_at>=? WHERE c.user_id=? GROUP BY c.id",now().slice(0,7)+'-01T00:00:00.000Z',userId(c)),cost:{kind:'unavailable',message:'Aucun tarif vérifié configuré. Consommation mesurée dans Atelier uniquement ; ne couvre pas le compte global.'}}));
account.get('/export',async c=>{
 const user=userId(c),meta:Record<string,unknown>={format:'atelier-export-v1',exported_at:now(),user:{id:user,username:c.get('user').username,email:c.get('user').email,created_at:c.get('user').created_at},exclusions:['jetons et clés','mots de passe et codes de récupération','sessions','données déjà supprimées']};
 const project=c.req.query('project')||null;
 for(const table of ['projects','conversations','messages','memory','memory_history','files','file_versions','tasks','repositories','deployment_targets','deployments','events']){
 // Fixed table allow-list. All rows are filtered by the authenticated owner.
 const rows=await many(c.env,`SELECT * FROM ${table} WHERE user_id=? LIMIT 10001`,user);
 if(rows.length>10000)fail(413,'Ce compte dépasse la taille du petit export intégré. Utilisez la procédure d’export administrateur documentée.');
 meta[table]=rows.map(row=>{const {object_key,...rest}=row;return rest;});
 }
 meta.backup={self_contained:false,kind:'metadata-and-references',notice:'Les métadonnées seules ne contiennent aucun fichier. Les dépôts GitHub et données locales nécessitent une sauvegarde séparée.'};
 meta.connections=await many(c.env,'SELECT id,provider,label,scopes,status,created_at FROM connections WHERE user_id=?',user);
 if(project){const ownedProjects=meta.projects as any[];if(!ownedProjects.some(p=>p.id===project))fail(404,'Projet introuvable.');for(const table of ['projects','conversations','memory','files','tasks','repositories','deployment_targets','deployments','events'])meta[table]=(meta[table] as any[]).filter(r=>table==='projects'?r.id===project:r.project_id===project);const conversations=new Set((meta.conversations as any[]).map(r=>r.id));meta.messages=(meta.messages as any[]).filter(r=>conversations.has(r.conversation_id));const memories=new Set((meta.memory as any[]).map(r=>r.id));meta.memory_history=(meta.memory_history as any[]).filter(r=>memories.has(r.memory_id));const files=new Set((meta.files as any[]).map(r=>r.id));meta.file_versions=(meta.file_versions as any[]).filter(r=>files.has(r.file_id));delete meta.connections;}
 const bridgeSpaces=await many(c.env,'SELECT s.* FROM bridge_spaces s LEFT JOIN bridge_project_spaces l ON l.space_id=s.id WHERE s.owner_id=? AND (? IS NULL OR l.project_id=?)',user,project,project);
 const allowedSpaces=new Set(bridgeSpaces.map(s=>s.id));meta.bridge_spaces=bridgeSpaces;
 for(const table of ['bridge_context_versions','bridge_conversations','bridge_handoffs']){
  const rows=await many(c.env,`SELECT t.* FROM ${table} t JOIN bridge_spaces s ON s.id=t.space_id WHERE s.owner_id=? LIMIT 10001`,user);
  if(rows.length>10000)fail(413,'Mémoire trop grande pour cet export. Exportez séparément chaque mémoire de projet, avec son export progressif.');
  meta[table]=rows.filter(r=>allowedSpaces.has(r.space_id));
 }
 const imported=await many(c.env,'SELECT m.*,c.space_id FROM bridge_messages m JOIN bridge_conversations c ON c.id=m.conversation_id WHERE m.owner_id=? LIMIT 10001',user);
 if(imported.length>10000)fail(413,'Historique importé trop grand pour cet export. Utilisez les exports progressifs de mémoire par projet.');
 meta.bridge_messages=imported.filter(r=>allowedSpaces.has(r.space_id)).map(({owner_id,...row})=>row);
 if(c.req.query('metadata')==='true')return c.json(meta);
 meta.backup={self_contained:true,kind:'atelier-active-data',notice:'Contient les données Atelier et toutes les versions accessibles. Les dépôts GitHub référencés, fichiers uniquement locaux, secrets et données externes sont exclus.'};
 const archive:Record<string,Uint8Array>={'donnees.json':strToU8(JSON.stringify(meta,null,2))};let size=archive['donnees.json'].length;
 const included=new Set((meta.files as any[]).map(f=>f.id));const versions=await many(c.env,'SELECT v.*,f.name FROM file_versions v JOIN files f ON f.id=v.file_id WHERE v.user_id=?',user);const integrity=[];
 for(const v of versions){if(!included.has(v.file_id))continue;size+=v.size;if(size>25*1048576)fail(413,'Archive supérieure à 25 Mo. Exportez les métadonnées puis les fichiers par lots, ou utilisez la procédure administrateur.');const obj=await readVersion(c.env,user,v);if(!obj)fail(404,'Un contenu est absent. L’export n’est pas complet.');const path=`fichiers/${v.file_id}/v${v.version}/${safeFilename(v.name)}`;archive[path]=new Uint8Array(await obj.arrayBuffer());integrity.push({path,sha256:v.sha256,size:v.size});}
 archive['integrite.json']=strToU8(JSON.stringify(integrity,null,2));return new Response(zipSync(archive,{level:0}) as BodyInit,{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="atelier-export.zip"','Cache-Control':'no-store'}});
});
account.delete('/',async c=>{
 const d=z.object({password:z.string().max(128),confirmation:z.literal('SUPPRIMER')}).parse(await jsonBody(c));const user=userId(c);await rateLimit(c.env,`delete:${user}`,5);
 if(!await verifyPassword(d.password,c.get('user').password_hash))fail(401,'Mot de passe incorrect.');
 // Atomic tombstone and cancellation stop new sessions, tasks and writes.
 await c.env.DB.batch([c.env.DB.prepare('UPDATE users SET deleted_at=? WHERE id=?').bind(now(),user),c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user),c.env.DB.prepare("UPDATE tasks SET cancel_requested=1,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END WHERE user_id=?").bind(user)]);
 deleteCookie(c,'atelier_session',{path:'/'});
 return c.json({ok:true,status:'deleting',message:'Compte désactivé, sessions révoquées. La suppression des données et fichiers est reprise par le planificateur après un délai minimum de cinq minutes. Les données externes restent inchangées ; les sauvegardes suivent leur rétention.'},202);
});
