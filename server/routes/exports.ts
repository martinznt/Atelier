/* Inventaire d'un export personnel (ChatGPT, Claude). L'archive originale ne quitte pas l'appareil de Martin : Atelier ne
   conserve que son empreinte, le manifeste par conversation, les lots, les rapports d'analyse collés à la main et la couverture.
   Les messages eux-mêmes passent par l'import de mémoire existant (passerelle), jamais par cette route. */
import {Hono} from 'hono';import {z} from 'zod';
import {event,fail,jsonBody,many,now,one,owned,page,run,uid,userId} from '../core.ts';
import {coverageOf,makeLots,matchAttachment} from '../export-inventory.ts';
import {classifyEntry,entryNameProblem,claimedCounts,compareClaims,jsonShape,readCorrespondance,GROUP_LABEL} from '../archive-entries.ts';
import {secretFindings} from '../handoff-core.ts';
import {analysisStep,prepareUnits,unitMessages} from '../history-run.ts';
import {AGREEMENT_LABEL,ANALYSIS_PROVIDERS,ITEM_KINDS,KIND_LABEL,analysisStatement} from '../history-analysis.ts';
import {loadAiConnections} from '../ai-persist.ts';
import {sha256Hex} from '../handoff-core.ts';
import {availabilityOf} from '../ai-availability.ts';
import {pickReviewModel} from '../review-team.mjs';
import type {AppEnv,Env,Row} from '../types.ts';
export const exportsRoute=new Hono<AppEnv>();
const like=(q:string)=>'%'+q.slice(0,120).replace(/[\\%_]/g,m=>'\\'+m)+'%';
async function batchOf(env:Env,user:string,id:string){return owned<Row>(env,'export_batches',id,user);}
const isoOrNull=z.string().max(40).nullable();
const rowInput=z.object({source_id:z.string().min(1).max(200),title:z.string().max(200),created_time:isoOrNull,updated_time:isoOrNull,message_count:z.number().int().min(0).max(1000000),node_count:z.number().int().min(0).max(1000000),branch_count:z.number().int().min(0).max(1000000),
 attachment_refs:z.number().int().min(0).max(1000000),non_text_parts:z.number().int().min(0).max(1000000),parse_status:z.enum(['complete','partial','error']),parse_note:z.string().max(500),segment:z.string().max(200).default(''),source_index:z.number().int().min(0).max(1000000).nullable().default(null),
 meta:z.object({scalars:z.record(z.string(),z.union([z.string().max(200),z.number(),z.boolean(),z.null()])).default({}),unstored_keys:z.array(z.string().max(80)).max(30).default([]),structure:z.object({roots:z.number().int(),dangling:z.number().int(),cycles:z.number().int(),branch_points:z.number().int(),leaves:z.number().int(),current_node:z.string().max(200).nullable(),current_node_ok:z.boolean().nullable()}).partial().default({})}).default({scalars:{},unstored_keys:[],structure:{}})});
const batchView=(b:Row)=>{let stats:any={};try{stats=JSON.parse(b.stats);}catch{/* statistiques illisibles */}return {...b,stats};};
async function coverage(env:Env,user:string,b:Row){
 const rows=await many<Row>(env,'SELECT parse_status,import_status,project_id,project_confirmed,lot,message_count,imported_messages,attachment_refs FROM export_conversations WHERE user_id=? AND batch_id=?',user,b.id);
 const analyses=await many<Row>(env,'SELECT lot,kind FROM export_analyses WHERE user_id=? AND batch_id=?',user,b.id);
 const refs=await many<Row>(env,'SELECT link_status,COUNT(*) AS n FROM export_attachment_refs WHERE user_id=? AND batch_id=? GROUP BY link_status',user,b.id);
 const files=await one<Row>(env,"SELECT COUNT(*) AS n,SUM(status='hashed') AS hashed FROM export_files WHERE user_id=? AND batch_id=?",user,b.id);
 const by=(k:string)=>Number(refs.find(r=>r.link_status===k)?.n||0),total=refs.reduce((s2,r)=>s2+Number(r.n),0);
 const attachments=total||files?.n?{referenced:total,in_archive:by('in_archive'),ambiguous:by('ambiguous'),referenced_only:by('referenced_only')+by('unlinked'),files_indexed:Number(files?.n||0),files_hashed:Number(files?.hashed||0)}:undefined;
 return coverageOf(rows as any[],analyses as any[],b.declared_total,{duplicates:Number(b.duplicate_count||0),attachments});
}
exportsRoute.get('/',async c=>{
 const user=userId(c),batches=await many<Row>(c.env,'SELECT * FROM export_batches WHERE user_id=? ORDER BY created_at DESC LIMIT 20',user),out=[];
 for(const b of batches)out.push({...batchView(b),coverage:await coverage(c.env,user,b)});
 return c.json({items:out});
});
exportsRoute.post('/',async c=>{
 const user=userId(c),d=z.object({provider:z.enum(['ChatGPT','Claude','inconnu']),filename:z.string().min(1).max(200),size:z.number().int().min(1).max(20*1024*1024*1024),sha256:z.string().regex(/^[0-9a-f]{64}$/),declared_total:z.number().int().min(0).max(200000),
  stats:z.object({unrecognized:z.number().int().min(0).default(0),duplicates:z.number().int().min(0).default(0),zip_entries:z.number().int().min(0).default(0),zip_by_extension:z.record(z.string().max(12),z.number().int().min(0)).default({}),inner_file:z.string().max(200).default(''),inner_sha256:z.string().max(64).default(''),segments_detected:z.number().int().min(0).max(100000).default(0),annexes_detected:z.number().int().min(0).max(1000).default(0),entries_by_group:z.record(z.string().max(40),z.number().int().min(0)).default({})}).default({unrecognized:0,duplicates:0,zip_entries:0,zip_by_extension:{},inner_file:'',inner_sha256:'',segments_detected:0,annexes_detected:0,entries_by_group:{}}),notes:z.string().max(2000).default('')}).parse(await jsonBody(c));
 const existing=await one<Row>(c.env,'SELECT * FROM export_batches WHERE user_id=? AND sha256=?',user,d.sha256);
 // Même empreinte : c'est le même fichier. On reprend l'inventaire existant au lieu d'en créer un second.
 if(existing)return c.json({...batchView(existing),resumed:true});
 const id=uid(),at=now();
 // Deux imports simultanés de la même archive : le second perd la course sur la contrainte d'unicité, reprend l'inventaire du premier et ne plante pas.
 const ins=await run(c.env,'INSERT INTO export_batches(id,user_id,provider,filename,size,sha256,received_at,declared_total,stats,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,sha256) DO NOTHING',id,user,d.provider,d.filename,d.size,d.sha256,at,d.declared_total,JSON.stringify(d.stats),d.notes,at);
 if(!ins.meta.changes)return c.json({...batchView(await one<Row>(c.env,'SELECT * FROM export_batches WHERE user_id=? AND sha256=?',user,d.sha256) as Row),resumed:true});
 await event(c.env,user,'export_received','Export '+d.provider+' inventorié : '+d.filename+' (SHA-256 '+d.sha256.slice(0,12)+'…, '+d.declared_total+' conversations déclarées)');
 return c.json({...batchView(await batchOf(c.env,user,id)),resumed:false},201);
});
exportsRoute.post('/:id/conversations',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({rows:z.array(rowInput).min(1).max(300)}).parse(await jsonBody(c));
 const st=d.rows.map(r=>c.env.DB.prepare('INSERT INTO export_conversations(id,user_id,batch_id,source_id,title,created_time,updated_time,message_count,node_count,branch_count,attachment_refs,non_text_parts,parse_status,parse_note,segment,source_index,meta) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(batch_id,source_id) DO NOTHING')
  .bind(uid(),user,b.id,r.source_id,r.title||'Sans titre',r.created_time,r.updated_time,r.message_count,r.node_count,r.branch_count,r.attachment_refs,r.non_text_parts,r.parse_status,r.parse_note,r.segment,r.source_index,JSON.stringify(r.meta).slice(0,3000)));
 let inserted=0;const ignored:string[]=[];
 for(let i=0;i<st.length;i+=60){const res=await c.env.DB.batch(st.slice(i,i+60));res.forEach((x,k)=>{const n=Number(x.meta?.changes||0);inserted+=n;if(!n)ignored.push(d.rows[i+k].source_id);});}
 const n=(await one<Row>(c.env,'SELECT COUNT(*) AS n FROM export_conversations WHERE user_id=? AND batch_id=?',user,b.id))?.n||0;
 await run(c.env,"UPDATE export_batches SET conversation_count=?,status=CASE WHEN status='inventory' AND ?>=declared_total THEN 'inventoried' ELSE status END WHERE id=? AND user_id=?",n,n,b.id,user);
 // Une conversation déjà présente peut venir d'un AUTRE segment (vrai doublon) ou du MÊME segment (reprise après interruption) : seul le premier cas est un doublon.
 const otherSegment:string[]=[];
 for(let i=0;i<ignored.length;i+=50){const chunk=ignored.slice(i,i+50);
  const found=await many<Row>(c.env,`SELECT source_id,segment FROM export_conversations WHERE user_id=? AND batch_id=? AND source_id IN (${chunk.map(()=>'?').join(',')})`,user,b.id,...chunk);
  for(const f of found){const mine=d.rows.find(r=>r.source_id===f.source_id);if(!mine||f.segment!==mine.segment)otherSegment.push(f.source_id);}}
 return c.json({inventoried:n,declared:b.declared_total,inserted,already_present:otherSegment.length,resumed_same_segment:ignored.length-otherSegment.length,ignored:otherSegment});
});
exportsRoute.get('/:id/conversations',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),{limit,offset}=page(c),q=(c.req.query('q')||'').trim(),lot=c.req.query('lot')||'',project=c.req.query('project')||'',status=c.req.query('status')||'';
 const rows=await many<Row>(c.env,"SELECT e.*,p.name AS project_name FROM export_conversations e LEFT JOIN projects p ON p.id=e.project_id AND p.user_id=e.user_id WHERE e.user_id=? AND e.batch_id=? AND (?='' OR e.title LIKE ? ESCAPE '\\' OR e.source_id LIKE ? ESCAPE '\\') AND (?='' OR e.lot=?) AND (?='' OR (?='none' AND e.project_id IS NULL) OR e.project_id=?) AND (?='' OR e.parse_status=? OR e.import_status=?) ORDER BY COALESCE(e.created_time,''),e.source_id LIMIT ? OFFSET ?",
  user,b.id,q,like(q),like(q),lot,lot,project,project,project,status,status,status,limit+1,offset);
 return c.json({items:rows.slice(0,limit),next:rows.length>limit?offset+limit:null});
});
exportsRoute.patch('/:id/conversations',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id'));
 const d=z.object({ids:z.array(z.string().uuid()).min(1).max(200),project_id:z.string().uuid().nullable().optional(),project_confirmed:z.boolean().optional(),lot:z.string().max(40).optional(),ignore:z.boolean().optional(),reason:z.string().max(300).default('')}).parse(await jsonBody(c));
 if(d.project_id)await owned(c.env,'projects',d.project_id,user);
 if(d.ignore===true&&!d.reason.trim())fail(400,'Indiquez pourquoi ces conversations sont écartées : aucune n’est ignorée sans raison.');
 let changed=0;
 for(const id of d.ids){
  const cur=await one<Row>(c.env,'SELECT * FROM export_conversations WHERE id=? AND user_id=? AND batch_id=?',id,user,b.id);if(!cur)continue;
  const project=d.project_id===undefined?cur.project_id:d.project_id;
  // Un projet proposé reste « candidat » tant que Martin ne l'a pas confirmé.
  const confirmed=d.project_id!==undefined&&d.project_confirmed===undefined?0:(d.project_confirmed===undefined?cur.project_confirmed:Number(d.project_confirmed&&Boolean(project)));
  const ignored=d.ignore===true?'ignored':d.ignore===false&&cur.parse_status==='ignored'?'partial':cur.parse_status;
  await run(c.env,'UPDATE export_conversations SET project_id=?,project_confirmed=?,lot=?,parse_status=?,parse_note=? WHERE id=? AND user_id=?',project,confirmed,d.lot??cur.lot,ignored,d.ignore===true?('Écartée : '+d.reason).slice(0,500):d.ignore===false?'Réintégrée ; statut de lecture à revoir.':cur.parse_note,id,user);changed++;
 }
 return c.json({changed});
});
exportsRoute.post('/:id/lots',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({max_messages:z.number().int().min(50).max(5000).default(400),prefix:z.string().regex(/^[A-Z0-9-]{2,12}$/).default('LOT'),only_unassigned:z.boolean().default(true)}).parse(await jsonBody(c));
 const rows=await many<Row>(c.env,"SELECT id,source_id,created_time,message_count,lot FROM export_conversations WHERE user_id=? AND batch_id=? AND parse_status<>'ignored'",user,b.id);
 if(d.only_unassigned&&rows.some(r=>r.lot)&&rows.some(r=>!r.lot))fail(409,'Des lots existent déjà. Les recalculer changerait leur composition : retirez-les d’abord, ou affectez les conversations restantes à la main.');
 const lots=makeLots(rows as any[],d.max_messages,d.prefix);
 const st=rows.map(r=>c.env.DB.prepare('UPDATE export_conversations SET lot=? WHERE id=? AND user_id=?').bind(lots[r.source_id]||'',r.id,user));
 for(let i=0;i<st.length;i+=60)await c.env.DB.batch(st.slice(i,i+60));
 await run(c.env,"UPDATE export_batches SET status=CASE WHEN status IN ('inventory','inventoried') THEN 'analysing' ELSE status END WHERE id=? AND user_id=?",b.id,user);
 return c.json({lots:[...new Set(Object.values(lots))].length,conversations:rows.length});
});
/** Recompte, dans la mémoire importée, les messages réellement présents pour chaque conversation de l'inventaire. */
exportsRoute.post('/:id/refresh-imports',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id'));
 const counts=await many<Row>(c.env,'SELECT bc.source_key,COUNT(m.id) AS n FROM bridge_conversations bc JOIN bridge_spaces s ON s.id=bc.space_id LEFT JOIN bridge_messages m ON m.conversation_id=bc.id WHERE s.owner_id=? AND bc.provider=? GROUP BY bc.source_key',user,b.provider);
 const byKey=new Map(counts.map(r=>[String(r.source_key),Number(r.n)]));
 const rows=await many<Row>(c.env,'SELECT id,source_id,message_count FROM export_conversations WHERE user_id=? AND batch_id=?',user,b.id);
 const st=rows.map(r=>{const n=byKey.get(b.provider+':'+r.source_id)||0;return c.env.DB.prepare('UPDATE export_conversations SET imported_messages=?,import_status=? WHERE id=? AND user_id=?').bind(n,n===0?'not_imported':n>=r.message_count?'imported':'partial',r.id,user);});
 for(let i=0;i<st.length;i+=60)await c.env.DB.batch(st.slice(i,i+60));
 return c.json(await coverage(c.env,user,b));
});
exportsRoute.get('/:id/coverage',async c=>{const user=userId(c),b=await batchOf(c.env,user,c.req.param('id'));return c.json({batch:batchView(b),coverage:await coverage(c.env,user,b)});});
exportsRoute.get('/:id/analyses',async c=>{const user=userId(c),b=await batchOf(c.env,user,c.req.param('id'));return c.json({items:await many<Row>(c.env,'SELECT id,lot,kind,assistant,prompt_ref,report,created_at FROM export_analyses WHERE user_id=? AND batch_id=? ORDER BY lot,created_at',user,b.id)});});
exportsRoute.post('/:id/analyses',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({lot:z.string().min(1).max(40),kind:z.enum(['independent','cross','third']),assistant:z.string().trim().min(1).max(80),prompt_ref:z.string().max(120).default(''),report:z.string().trim().min(1).max(100000)}).parse(await jsonBody(c));
 if(!await one(c.env,'SELECT id FROM export_conversations WHERE user_id=? AND batch_id=? AND lot=? LIMIT 1',user,b.id,d.lot))fail(400,'Ce lot n’existe pas dans cet inventaire.');
 const f=secretFindings(d.report);if(f.length)fail(400,'Le rapport contient ce qui ressemble à un secret ('+f.join(', ')+') : retirez-le.');
 // Un croisement suppose au moins deux analyses indépendantes déjà enregistrées pour ce lot.
 if(d.kind!=='independent'){const n=(await one<Row>(c.env,"SELECT COUNT(*) AS n FROM export_analyses WHERE user_id=? AND batch_id=? AND lot=? AND kind='independent'",user,b.id,d.lot))?.n||0;if(n<2)fail(409,'Enregistrez d’abord deux analyses indépendantes de ce lot avant le croisement.');}
 const id=uid();await run(c.env,'INSERT INTO export_analyses(id,user_id,batch_id,lot,kind,assistant,prompt_ref,report,created_at) VALUES(?,?,?,?,?,?,?,?,?)',id,user,b.id,d.lot,d.kind,d.assistant,d.prompt_ref,d.report,now());
 return c.json({id},201);
});
exportsRoute.delete('/analyses/:aid',async c=>{const r=await run(c.env,'DELETE FROM export_analyses WHERE id=? AND user_id=?',c.req.param('aid'),userId(c));if(!r.meta.changes)fail(404,'Rapport introuvable.');return c.json({ok:true});});
exportsRoute.delete('/:id',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id'));
 await run(c.env,'DELETE FROM export_batches WHERE id=? AND user_id=?',b.id,user);
 await event(c.env,user,'export_removed','Inventaire d’export retiré (les messages déjà importés dans la mémoire sont conservés) : '+b.filename);
 return c.json({ok:true});
});

/* ---------- Segments, fichiers de l'archive, pièces jointes, bilan chiffré ---------- */
exportsRoute.get('/:id/segments',async c=>{const user=userId(c),b=await batchOf(c.env,user,c.req.param('id'));return c.json({items:await many<Row>(c.env,'SELECT name,size,sha256,conversation_count,duplicate_count,rows_stored,nodes_stored,reason_code,status,note,created_at FROM export_segments WHERE user_id=? AND batch_id=? ORDER BY name',user,b.id)});});
/** Enregistre la fin de l'inventaire d'un segment. Idempotent : même nom et même empreinte = déjà fait ; même nom mais autre empreinte = autre export, refusé. */
const MAX_NODES_PER_BATCH=1_000_000,MAX_ANNEX_CHARS=1_000_000,MAX_ANNEXES=12;
/** Enregistre la fin de l'inventaire d'un segment. Le serveur RECOMPTE ce qu'il a réellement enregistré avant de déclarer le segment terminé :
    un segment dont les conversations ou les nœuds ne sont pas tous persistés est refusé (409) et sera repris au prochain essai. */
exportsRoute.post('/:id/segments',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({name:z.string().min(1).max(200),size:z.number().int().min(0),sha256:z.string().regex(/^[0-9a-f]{64}$/),conversation_count:z.number().int().min(0).max(200000),duplicates:z.number().int().min(0).max(200000).default(0),
  status:z.enum(['inventoried','too_large','unreadable','invalid_json']),note:z.string().max(500).default(''),rows_expected:z.number().int().min(0).max(200000).optional(),nodes_expected:z.number().int().min(0).max(5000000).optional(),
  dropped_fields:z.record(z.string().max(120),z.number().int().min(0)).default({}),issues:z.array(z.object({index:z.number().int(),reason:z.string().max(200)})).max(50).default([]),wrapper:z.string().max(80).default(''),reason_code:z.string().max(40).default('')}).parse(await jsonBody(c));
 let rowsStored=0,nodesStored=0;
 if(d.status==='inventoried'&&d.rows_expected!==undefined){
  rowsStored=Number((await one<Row>(c.env,'SELECT COUNT(*) AS n FROM export_conversations WHERE user_id=? AND batch_id=? AND segment=?',user,b.id,d.name))?.n||0);
  nodesStored=Number((await one<Row>(c.env,'SELECT COUNT(*) AS n FROM export_nodes x JOIN export_conversations e ON e.id=x.conversation_id WHERE x.user_id=? AND x.batch_id=? AND e.segment=?',user,b.id,d.name))?.n||0);
  if(rowsStored!==d.rows_expected||(d.nodes_expected!==undefined&&nodesStored!==d.nodes_expected))
   fail(409,'Segment « '+d.name+' » incomplet côté serveur : '+rowsStored+' conversation(s) et '+nodesStored+' nœud(s) enregistrés, '+d.rows_expected+' et '+(d.nodes_expected??'?')+' attendus. Rien n’est marqué terminé ; relancez le même fichier pour reprendre.');
 }
 const dropped=JSON.stringify(Object.fromEntries(Object.entries(d.dropped_fields).slice(0,40))),issues=JSON.stringify(d.issues);
 const ins=await run(c.env,'INSERT INTO export_segments(id,user_id,batch_id,name,size,sha256,conversation_count,duplicate_count,status,note,created_at,rows_stored,nodes_stored,dropped_fields,issues,wrapper,reason_code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(batch_id,name) DO NOTHING',
  uid(),user,b.id,d.name,d.size,d.sha256,d.conversation_count,d.duplicates,d.status,d.note,now(),rowsStored,nodesStored,dropped,issues,d.wrapper,d.reason_code);
 if(ins.meta.changes){
  if(d.status==='inventoried')await run(c.env,'UPDATE export_batches SET declared_total=declared_total+?,duplicate_count=duplicate_count+? WHERE id=? AND user_id=?',d.conversation_count,d.duplicates,b.id,user);
  return c.json({resumed:false,rows_stored:rowsStored,nodes_stored:nodesStored},201);
 }
 // Déjà enregistré (reprise ou course avec un autre onglet) : même empreinte = rien à refaire ; autre empreinte = autre export.
 const cur=await one<Row>(c.env,'SELECT * FROM export_segments WHERE batch_id=? AND name=? AND user_id=?',b.id,d.name,user) as Row;
 if(cur.sha256!==d.sha256&&cur.sha256!=='0'.repeat(64))fail(409,'Le segment « '+d.name+' » existe déjà avec un contenu différent : ce n’est pas le même export. Importez-le comme un nouvel export.');
 if(cur.status==='inventoried'||d.status!=='inventoried')return c.json({resumed:true,status:cur.status});
 // Un segment resté illisible ou trop gros peut être repris plus tard : mise à jour conditionnelle, comptée une seule fois même si deux onglets la tentent.
 const up=await run(c.env,"UPDATE export_segments SET status=?,conversation_count=?,duplicate_count=?,note=?,size=?,sha256=?,rows_stored=?,nodes_stored=?,dropped_fields=?,issues=?,wrapper=?,reason_code=? WHERE id=? AND user_id=? AND status!='inventoried'",d.status,d.conversation_count,d.duplicates,d.note,d.size,d.sha256,rowsStored,nodesStored,dropped,issues,d.wrapper,d.reason_code,cur.id,user);
 if(up.meta.changes)await run(c.env,'UPDATE export_batches SET declared_total=declared_total+?,duplicate_count=duplicate_count+? WHERE id=? AND user_id=?',d.conversation_count,d.duplicates,b.id,user);
 return c.json({resumed:!up.meta.changes,updated:Boolean(up.meta.changes),rows_stored:rowsStored,nodes_stored:nodesStored});
});
const nodeInput=z.object({node_id:z.string().min(1).max(200),parent_id:z.string().max(200).nullable(),children:z.array(z.string().max(200)).max(500),role:z.string().max(40),content_type:z.string().max(60),create_time:z.string().max(40).nullable(),has_text:z.boolean(),text_chars:z.number().int().min(0).max(100_000_000),attachment_refs:z.number().int().min(0).max(100000),
 meta:z.record(z.string().max(60),z.union([z.string().max(120),z.number(),z.boolean(),z.null()])).default({})});
/** Structure d'une conversation : un enregistrement par nœud (parent, enfants dans l'ordre). Idempotent : un nœud déjà présent n'est jamais dupliqué. */
exportsRoute.post('/:id/nodes',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({items:z.array(z.object({source_id:z.string().min(1).max(200),nodes:z.array(nodeInput).min(1).max(600)})).min(1).max(50)}).parse(await jsonBody(c));
 const total=d.items.reduce((n,i)=>n+i.nodes.length,0);if(total>600)fail(413,'Trop de nœuds dans une seule requête (600 au plus).');
 const have=Number((await one<Row>(c.env,'SELECT COUNT(*) AS n FROM export_nodes WHERE user_id=? AND batch_id=?',user,b.id))?.n||0);
 if(have+total>MAX_NODES_PER_BATCH)fail(413,'Cet export dépasse '+MAX_NODES_PER_BATCH+' nœuds enregistrés : plafond de protection. Aucun nœud existant n’est supprimé.');
 let inserted=0,unknown=0;const st:any[]=[];
 for(const it of d.items){
  const conv=await one<Row>(c.env,'SELECT id FROM export_conversations WHERE user_id=? AND batch_id=? AND source_id=?',user,b.id,it.source_id);if(!conv){unknown+=it.nodes.length;continue;}
  for(const n of it.nodes)st.push(c.env.DB.prepare('INSERT INTO export_nodes(id,user_id,batch_id,conversation_id,node_id,parent_id,children,role,content_type,create_time,has_text,text_chars,attachment_refs,meta) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(batch_id,conversation_id,node_id) DO NOTHING')
   .bind(uid(),user,b.id,conv.id,n.node_id,n.parent_id,JSON.stringify(n.children),n.role,n.content_type,n.create_time,n.has_text?1:0,n.text_chars,n.attachment_refs,JSON.stringify(n.meta).slice(0,1000)));
 }
 for(let i=0;i<st.length;i+=60){const res=await c.env.DB.batch(st.slice(i,i+60));for(const x of res)inserted+=Number(x.meta?.changes||0);}
 return c.json({inserted,already_present:st.length-inserted,unknown_conversations:unknown});
});
const fileInput=z.object({entry_name:z.string().min(1).max(500),size:z.number().int().min(0),compressed_size:z.number().int().min(0),sniff_kind:z.string().max(30).default(''),sniff_mime:z.string().max(80).default(''),sha256:z.string().regex(/^[0-9a-f]{64}$/).nullable().default(null),
 status:z.enum(['hashed','indexed','unsafe_name','encrypted','unsupported','suspicious','failed']),note:z.string().max(300).default('')});
exportsRoute.post('/:id/files',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({rows:z.array(fileInput).min(1).max(300)}).parse(await jsonBody(c));
 const st=d.rows.map(r=>{
  // Le serveur recontrôle le nom : un nom dangereux n'est jamais présenté comme sûr, quoi que dise le client.
  const bad=entryNameProblem(r.entry_name),status=bad&&r.status==='hashed'?'unsafe_name':r.status;
  return c.env.DB.prepare('INSERT INTO export_files(id,user_id,batch_id,entry_name,size,compressed_size,sniff_kind,sniff_mime,sha256,status,note,created_at,group_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(batch_id,entry_name) DO UPDATE SET group_name=excluded.group_name,sha256=COALESCE(excluded.sha256,export_files.sha256),sniff_kind=CASE WHEN excluded.sniff_kind!=\'\' THEN excluded.sniff_kind ELSE export_files.sniff_kind END,sniff_mime=CASE WHEN excluded.sniff_mime!=\'\' THEN excluded.sniff_mime ELSE export_files.sniff_mime END,status=CASE WHEN excluded.status=\'hashed\' OR export_files.status!=\'hashed\' THEN excluded.status ELSE export_files.status END,note=excluded.note')
   .bind(uid(),user,b.id,r.entry_name,r.size,r.compressed_size,r.sniff_kind,r.sniff_mime,r.sha256,status,bad?('Nom inhabituel : '+bad).slice(0,300):r.note,now(),classifyEntry(r.entry_name).group);});
 for(let i=0;i<st.length;i+=60)await c.env.DB.batch(st.slice(i,i+60));
 return c.json({saved:d.rows.length});
});
exportsRoute.get('/:id/files',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),{limit,offset}=page(c),status=c.req.query('status')||'',kind=c.req.query('kind')||'',q=(c.req.query('q')||'').trim();
 const rows=await many<Row>(c.env,"SELECT f.id,f.entry_name,f.size,f.compressed_size,f.sniff_kind,f.sniff_mime,f.sha256,f.status,f.note,(SELECT COUNT(*) FROM export_attachment_refs r WHERE r.file_id=f.id AND r.user_id=f.user_id) AS linked_refs FROM export_files f WHERE f.user_id=? AND f.batch_id=? AND (?='' OR f.status=?) AND (?='' OR f.sniff_kind=?) AND (?='' OR f.entry_name LIKE ? ESCAPE '\\') ORDER BY f.entry_name LIMIT ? OFFSET ?",user,b.id,status,status,kind,kind,q,like(q),limit+1,offset);
 const kinds=await many<Row>(c.env,'SELECT sniff_kind,COUNT(*) AS n FROM export_files WHERE user_id=? AND batch_id=? GROUP BY sniff_kind ORDER BY n DESC',user,b.id);
 return c.json({items:rows.slice(0,limit),next:rows.length>limit?offset+limit:null,kinds});
});
exportsRoute.post('/:id/attachments',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({items:z.array(z.object({source_id:z.string().min(1).max(200),refs:z.array(z.object({ref_key:z.string().min(1).max(200),name:z.string().max(200).default(''),mime:z.string().max(100).default(''),size:z.number().int().min(0).nullable().default(null),message_key:z.string().max(200).default('')})).max(200)})).min(1).max(100)}).parse(await jsonBody(c));
 let saved=0;const st:any[]=[];
 for(const it of d.items){
  const conv=await one<Row>(c.env,'SELECT id FROM export_conversations WHERE user_id=? AND batch_id=? AND source_id=?',user,b.id,it.source_id);if(!conv)continue;
  for(const r of it.refs){st.push(c.env.DB.prepare('INSERT INTO export_attachment_refs(id,user_id,batch_id,conversation_id,ref_key,name,mime,size,message_key) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(batch_id,conversation_id,ref_key) DO NOTHING').bind(uid(),user,b.id,conv.id,r.ref_key,r.name,r.mime,r.size,r.message_key));saved++;}
 }
 for(let i=0;i<st.length;i+=60)await c.env.DB.batch(st.slice(i,i+60));
 return c.json({saved});
});
const normPath=(p:string)=>p.replace(/^\.\//,'').replace(/^\/+/,'');
/** Rapproche chaque référence des fichiers de l'archive. Deux sources, jamais mêlées : l'identifiant cité dans la conversation, puis les couples
    identifiant → chemin déclarés par correspondance_fichiers.json. Un lien n'est créé que si le fichier visé EXISTE dans l'archive indexée.
    Recalculé à chaque appel : le résultat ne dépend que des données enregistrées. */
exportsRoute.post('/:id/link-attachments',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id'));
 // Un fichier au nom dangereux (« .. », chemin absolu…) n'est jamais une cible de lien : il reste indexé et signalé, mais ne peut être désigné par aucune référence.
 const files=(await many<Row>(c.env,"SELECT id,entry_name FROM export_files WHERE user_id=? AND batch_id=? AND status!='unsafe_name'",user,b.id)).map(r=>({id:String(r.id),entry_name:String(r.entry_name)}));
 const links=await many<Row>(c.env,'SELECT id,ref_key,declared_path FROM export_links WHERE user_id=? AND batch_id=?',user,b.id);
 const byName=new Map(files.map(f=>[f.entry_name,f.id]));const linkState=new Map<string,{status:'present'|'path_missing';file_id:string|null}>();let st:any[]=[];
 for(const l of links){
  const want=normPath(String(l.declared_path));let id=byName.get(want)||null;
  if(!id){const tail=files.filter(f=>f.entry_name.endsWith('/'+want));if(tail.length===1)id=tail[0].id;}
  const state={status:id?'present' as const:'path_missing' as const,file_id:id};linkState.set(l.ref_key+'\n'+l.declared_path,state);
  st.push(c.env.DB.prepare('UPDATE export_links SET status=?,file_id=? WHERE id=? AND user_id=?').bind(state.status,state.file_id,l.id,user));
 }
 const flush=async()=>{for(let i=0;i<st.length;i+=60)await c.env.DB.batch(st.slice(i,i+60));st=[];};await flush();
 const refs=await many<Row>(c.env,'SELECT id,ref_key FROM export_attachment_refs WHERE user_id=? AND batch_id=?',user,b.id);
 const counts={in_archive:0,ambiguous:0,referenced_only:0,via_correspondance:0};const citedRefs=new Set<string>();
 for(const r of refs){
  citedRefs.add(r.ref_key);
  let status:'in_archive'|'ambiguous'|'referenced_only'|'unlinked'=files.length?'referenced_only':'unlinked',fileId:string|null=null,source='',note='';
  if(files.length){
   const m=matchAttachment(r.ref_key,files);status=m.status;fileId=m.file_id;if(m.status==='in_archive')source='id';
   if(m.status!=='in_archive'){
    const declared=links.filter(l=>l.ref_key===r.ref_key).map(l=>({l,state:linkState.get(l.ref_key+'\n'+l.declared_path)!}));
    const ok=declared.filter(x=>x.state.status==='present');
    if(ok.length===1){status='in_archive';fileId=ok[0].state.file_id;source='correspondance';counts.via_correspondance++;}
    else if(ok.length>1){status='ambiguous';note='La correspondance désigne plusieurs fichiers présents.';}
    else if(declared.length){status='referenced_only';note='La correspondance de l’archive désigne « '+String(declared[0].l.declared_path).slice(0,160)+' » : fichier absent de l’archive.';}
    else if(m.status==='ambiguous')note='Plusieurs fichiers portent cet identifiant.';
   }
  }
  (counts as any)[status==='unlinked'?'referenced_only':status]++;
  st.push(c.env.DB.prepare('UPDATE export_attachment_refs SET link_status=?,file_id=?,link_source=?,note=? WHERE id=? AND user_id=?').bind(status,fileId,source,note,r.id,user));
 }
 await flush();
 const declaredUnused=links.filter(l=>!citedRefs.has(l.ref_key)).length;
 return c.json({refs:refs.length,files:files.length,...counts,declared_links:links.length,declared_present:[...linkState.values()].filter(x=>x.status==='present').length,declared_path_missing:[...linkState.values()].filter(x=>x.status==='path_missing').length,declared_not_cited:declaredUnused,
  notice:files.length?'Rapprochement par identifiant puis par correspondance déclarée, à vérifier. Rien n’est copié dans Atelier.':'Aucun fichier de l’archive indexé : tout reste « non rapproché ».'});
});
exportsRoute.get('/:id/attachments',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),{limit,offset}=page(c),status=c.req.query('status')||'';
 const rows=await many<Row>(c.env,"SELECT r.id,r.ref_key,r.name,r.mime,r.size,r.message_key,r.link_status,e.title AS conversation_title,e.source_id,f.entry_name,f.sha256,f.sniff_kind FROM export_attachment_refs r JOIN export_conversations e ON e.id=r.conversation_id LEFT JOIN export_files f ON f.id=r.file_id WHERE r.user_id=? AND r.batch_id=? AND (?='' OR r.link_status=?) ORDER BY e.created_time,r.ref_key LIMIT ? OFFSET ?",user,b.id,status,status,limit+1,offset);
 return c.json({items:rows.slice(0,limit),next:rows.length>limit?offset+limit:null});
});
/** Bilan chiffré : périodes, comparaison inventaire / import, recoupements avec d'autres exports. Rien n'est calculé à partir de suppositions. */
exportsRoute.get('/:id/summary',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),since=/^\d{4}-\d{2}-\d{2}/.test(c.req.query('since')||'')?String(c.req.query('since')).slice(0,10)+'T00:00:00.000Z':'2026-09-01T00:00:00.000Z';
 const inv=await one<Row>(c.env,'SELECT COUNT(*) AS conversations,COALESCE(SUM(message_count),0) AS messages,MIN(created_time) AS first_created,MAX(created_time) AS last_created,MAX(updated_time) AS last_activity,SUM(created_time IS NULL) AS undated,SUM(created_time<?) AS before_since,SUM(created_time>=?) AS since_or_after,COALESCE(SUM(branch_count),0) AS branches FROM export_conversations WHERE user_id=? AND batch_id=?',since,since,user,b.id);
 const months=await many<Row>(c.env,"SELECT substr(created_time,1,7) AS month,COUNT(*) AS conversations,SUM(message_count) AS messages FROM export_conversations WHERE user_id=? AND batch_id=? AND created_time IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 36",user,b.id);
 const imp=await one<Row>(c.env,"SELECT COUNT(DISTINCT bc.id) AS conversations,COUNT(m.id) AS messages,MIN(m.original_date) AS first_date,MAX(m.original_date) AS last_date FROM bridge_conversations bc JOIN bridge_spaces s ON s.id=bc.space_id JOIN bridge_messages m ON m.conversation_id=bc.id WHERE s.owner_id=? AND bc.provider=? AND bc.source_key IN (SELECT ?||':'||source_id FROM export_conversations WHERE user_id=? AND batch_id=?)",user,b.provider,b.provider,user,b.id);
 const overlap=await one<Row>(c.env,"SELECT COUNT(*) AS n FROM export_conversations a WHERE a.user_id=? AND a.batch_id=? AND EXISTS(SELECT 1 FROM export_conversations x JOIN export_batches xb ON xb.id=x.batch_id WHERE x.user_id=a.user_id AND x.batch_id!=a.batch_id AND x.source_id=a.source_id AND xb.provider=?)",user,b.id,b.provider);
 const segs=await many<Row>(c.env,'SELECT status,COUNT(*) AS n FROM export_segments WHERE user_id=? AND batch_id=? GROUP BY status',user,b.id);
 const notes:string[]=[];
 if(Number(inv?.undated||0))notes.push(inv!.undated+' conversation(s) sans date : non comptées dans les périodes.');
 if(Number(imp?.messages||0)>Number(inv?.messages||0))notes.push('Plus de messages importés que d’inventoriés : l’import compte aussi des messages qui n’avaient pas de texte à l’inventaire ; comparez conversation par conversation.');
 return c.json({since,inventory:{...inv,undated:Number(inv?.undated||0),before_since:Number(inv?.before_since||0),since_or_after:Number(inv?.since_or_after||0)},months,imported:{conversations:Number(imp?.conversations||0),messages:Number(imp?.messages||0),first_date:imp?.first_date||null,last_date:imp?.last_date||null},
  other_exports_overlap:Number(overlap?.n||0),segments:segs,duplicates_in_file:Number(b.duplicate_count||0),notes,
  warning:'La période est lue dans le contenu réel de l’export. Atelier ne filtre rien : si l’export a été demandé « depuis le 1er septembre », la répartition ci-dessus le confirme ou non.'});
});

/** Structure d'une conversation importée, nœud par nœud (parents, enfants, branches), pour vérifier que le déroulement est reconstructible. */
exportsRoute.get('/:id/conversations/:cid/nodes',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),conv=await one<Row>(c.env,'SELECT id,source_id,title,created_time,updated_time,segment,source_index,node_count,meta FROM export_conversations WHERE id=? AND user_id=? AND batch_id=?',c.req.param('cid'),user,b.id);
 if(!conv)fail(404,'Conversation introuvable.');
 const rows=await many<Row>(c.env,'SELECT node_id,parent_id,children,role,content_type,create_time,has_text,text_chars,attachment_refs,meta FROM export_nodes WHERE user_id=? AND batch_id=? AND conversation_id=? ORDER BY rowid LIMIT 5001',user,b.id,conv.id);
 const j=(t:string,d:any)=>{try{return JSON.parse(t);}catch{return d;}};
 return c.json({conversation:{id:conv.id,source_id:conv.source_id,title:conv.title,created_time:conv.created_time,segment:conv.segment,source_index:conv.source_index,announced_nodes:conv.node_count,meta:j(conv.meta,{})},
  nodes:rows.slice(0,5000).map(r=>({node_id:r.node_id,parent_id:r.parent_id,children:j(r.children,[]),role:r.role,content_type:r.content_type,create_time:r.create_time,has_text:Boolean(r.has_text),text_chars:r.text_chars,attachment_refs:r.attachment_refs,meta:j(r.meta,{})})),truncated:rows.length>5000,
  notice:'Structure et métadonnées scalaires seulement : le contenu des messages se lit dans la mémoire importée, et l’original dans votre archive.'});
});

/* ---------- Annexes de l'archive ---------- */
const ANNEX_KINDS=['correspondance','inventaire','verification','exclusions','lisez_moi'] as const;
/** Annexes (correspondance_fichiers.json, verification.json…) : le texte est conservé tel quel (≤ 1 Mo) avec son empreinte ; sa forme est résumée ; rien n'est interprété au-delà de ce que le format permet. */
exportsRoute.post('/:id/annexes',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({name:z.string().min(1).max(300),size:z.number().int().min(0),sha256:z.string().regex(/^[0-9a-f]{64}$/),content:z.string().max(MAX_ANNEX_CHARS).nullable().default(null),note:z.string().max(300).default('')}).parse(await jsonBody(c));
 const cls=classifyEntry(d.name);if(!(ANNEX_KINDS as readonly string[]).includes(cls.kind))fail(400,'Ce fichier n’est pas une annexe reconnue.');
 const kind=cls.kind as typeof ANNEX_KINDS[number];
 const cur=await one<Row>(c.env,'SELECT id,sha256 FROM export_annexes WHERE user_id=? AND batch_id=? AND name=?',user,b.id,d.name);
 if(cur&&cur.sha256!==d.sha256)fail(409,'L’annexe « '+d.name+' » existe déjà avec un contenu différent : ce n’est pas le même export.');
 if(!cur&&Number((await one<Row>(c.env,'SELECT COUNT(*) AS n FROM export_annexes WHERE user_id=? AND batch_id=?',user,b.id))?.n||0)>=MAX_ANNEXES)fail(413,'Trop d’annexes pour un export ('+MAX_ANNEXES+' au plus).');
 if(d.content!==null&&(await sha256Hex(d.content))!==d.sha256)fail(400,'L’empreinte annoncée ne correspond pas au texte reçu : annexe refusée (rien n’est enregistré).');
 let status:'stored'|'too_large'|'invalid_json'|'unrecognized_shape'=d.content===null?'too_large':'stored',shape:any={},note=d.note,pairs:{ref:string;path:string}[]=[];
 if(d.content!==null&&kind!=='lisez_moi'){
  let value:unknown;try{value=JSON.parse(d.content);}catch{status='invalid_json';note=note||'JSON illisible : le texte est conservé tel quel, rien n’est interprété.';}
  if(status==='stored'){
   shape={...jsonShape(value)};
   if(kind==='correspondance'){const r=readCorrespondance(value);shape.correspondance={form:r.shape,pairs:r.pairs.length,skipped:r.skipped};pairs=r.pairs.slice(0,50000);if(!r.pairs.length){status='unrecognized_shape';note=r.reason||'Forme non reconnue.';}}
   else if(kind==='verification'||kind==='inventaire'){shape.claims=claimedCounts(value).slice(0,60);}
  }
 }else if(d.content===null)note=note||'Taille supérieure à 1 Mo ou texte non lisible : seuls le nom, la taille et l’empreinte sont conservés.';
 await run(c.env,'INSERT INTO export_annexes(id,user_id,batch_id,name,kind,size,sha256,status,shape,content,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(batch_id,name) DO UPDATE SET status=excluded.status,shape=excluded.shape,content=excluded.content,note=excluded.note,size=excluded.size',uid(),user,b.id,d.name,kind,d.size,d.sha256,status,JSON.stringify(shape).slice(0,8000),d.content,note,now());
 const st=pairs.map(p=>c.env.DB.prepare('INSERT INTO export_links(id,user_id,batch_id,ref_key,declared_path,status) VALUES(?,?,?,?,?,?) ON CONFLICT(batch_id,ref_key,declared_path) DO NOTHING').bind(uid(),user,b.id,p.ref.slice(0,200),p.path.slice(0,500),'path_missing'));
 for(let i=0;i<st.length;i+=60)await c.env.DB.batch(st.slice(i,i+60));
 return c.json({kind,status,note,pairs:pairs.length,shape},201);
});
exportsRoute.get('/:id/annexes',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id'));
 const rows=await many<Row>(c.env,'SELECT id,name,kind,size,sha256,status,shape,note,created_at,CASE WHEN content IS NULL THEN 0 ELSE 1 END AS content_stored FROM export_annexes WHERE user_id=? AND batch_id=? ORDER BY name',user,b.id);
 return c.json({items:rows.map(r=>({...r,shape:(()=>{try{return JSON.parse(r.shape);}catch{return {};}})()}))});
});
exportsRoute.get('/:id/annexes/:aid/content',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),r=await one<Row>(c.env,'SELECT name,content FROM export_annexes WHERE id=? AND user_id=? AND batch_id=?',c.req.param('aid'),user,b.id);
 if(!r)fail(404,'Annexe introuvable.');if(r.content===null)fail(404,'Le texte de cette annexe n’est pas conservé (trop volumineuse) : relisez-la dans votre archive.');
 return c.json({name:r.name,content:String(r.content).slice(0,200000),truncated:String(r.content).length>200000});
});

/* ---------- Rapport d'intégrité : annoncé / enregistré / écarts ---------- */
/** Compare ce que l'archive annonce à ce qu'Atelier a réellement enregistré, et distingue trois cas : absent de l'archive, invalide, non importé. */
exportsRoute.get('/:id/integrity',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),batchStats=(()=>{try{return JSON.parse(b.stats);}catch{return {} as any;}})();
 const segs=await many<Row>(c.env,'SELECT name,status,conversation_count,duplicate_count,rows_stored,nodes_stored,dropped_fields,issues,wrapper,reason_code,note FROM export_segments WHERE user_id=? AND batch_id=? ORDER BY name',user,b.id);
 const conv=await one<Row>(c.env,"SELECT COUNT(*) AS n,COALESCE(SUM(message_count),0) AS messages,COALESCE(SUM(node_count),0) AS nodes,COALESCE(SUM(imported_messages),0) AS imported,SUM(parse_status='error') AS errors,SUM(import_status='imported') AS imp,SUM(import_status='partial') AS part,SUM(import_status='not_imported') AS notimp,COALESCE(SUM(json_extract(meta,'$.structure.dangling')),0) AS dangling,COALESCE(SUM(json_extract(meta,'$.structure.cycles')),0) AS cycles,COALESCE(SUM(json_extract(meta,'$.structure.current_node_ok')=0),0) AS bad_current,COALESCE(SUM(json_extract(meta,'$.structure.branch_points')),0) AS branches FROM export_conversations WHERE user_id=? AND batch_id=? AND parse_status!='ignored'",user,b.id);
 const nodes=await one<Row>(c.env,'SELECT COUNT(*) AS n,COALESCE(SUM(has_text),0) AS text FROM export_nodes WHERE user_id=? AND batch_id=?',user,b.id);
 const dangling=Number((await one<Row>(c.env,'SELECT COUNT(*) AS n FROM export_nodes x WHERE x.user_id=? AND x.batch_id=? AND x.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM export_nodes p WHERE p.batch_id=x.batch_id AND p.conversation_id=x.conversation_id AND p.node_id=x.parent_id) AND x.parent_id NOT LIKE \'00000000-0000-%\'',user,b.id))?.n||0);
 const files=await many<Row>(c.env,'SELECT group_name,status,COUNT(*) AS n FROM export_files WHERE user_id=? AND batch_id=? GROUP BY group_name,status',user,b.id);
 const refs=await many<Row>(c.env,'SELECT link_status,link_source,COUNT(*) AS n FROM export_attachment_refs WHERE user_id=? AND batch_id=? GROUP BY link_status,link_source',user,b.id);
 const annexes:Row[]=(await many<Row>(c.env,'SELECT name,kind,status,size,sha256,note,shape FROM export_annexes WHERE user_id=? AND batch_id=?',user,b.id)).map(r=>({...r,shape:(()=>{try{return JSON.parse(r.shape);}catch{return {};}})()}));
 const links=await one<Row>(c.env,"SELECT COUNT(*) AS n,SUM(status='present') AS present,SUM(status='path_missing') AS missing FROM export_links WHERE user_id=? AND batch_id=?",user,b.id);
 const stored={conversations:Number(conv?.n||0),messages:Number(conv?.messages||0),nodes:Number(nodes?.n||0)};
 const claims=annexes.filter(a=>a.kind==='verification'||a.kind==='inventaire').flatMap(a=>(a.shape?.claims||[]).map((x:any)=>({...x,annex:a.name})));
 const comparisons=compareClaims(claims,stored).map(x=>({...x,heuristic:true,annexes:[...new Set(claims.filter((cl:any)=>cl.category===x.category).map((cl:any)=>cl.annex))]}));
 const dropped:Record<string,number>={};let invalid=0;const failedSegments:any[]=[];
 for(const sg of segs){let dr:any={};try{dr=JSON.parse(sg.dropped_fields);}catch{/* illisible */}for(const [k,v] of Object.entries<any>(dr))dropped[k]=(dropped[k]||0)+Number(v);let is:any[]=[];try{is=JSON.parse(sg.issues);}catch{/* illisible */}invalid+=is.length;
  if(sg.status!=='inventoried'||sg.reason_code)failedSegments.push({name:sg.name,status:sg.status,reason_code:sg.reason_code,note:sg.note});}
 const detected=Number(batchStats.segments_detected||0),registered=segs.length;
 const gaps:{category:'absent_de_l_archive'|'invalide'|'non_importe'|'ecart';count:number;text:string}[]=[];
 const refBy=(k:string)=>refs.filter(r=>r.link_status===k).reduce((n,r)=>n+Number(r.n),0);
 if(detected>registered)gaps.push({category:'non_importe',count:detected-registered,text:(detected-registered)+' fichier(s) de conversations détecté(s) mais pas encore inventorié(s) : relancez le même fichier pour reprendre.'});
 if(failedSegments.length)gaps.push({category:'invalide',count:failedSegments.length,text:failedSegments.length+' fichier(s) de conversations en échec ou invalide(s) : '+failedSegments.slice(0,3).map(f=>f.name+' ('+(f.reason_code||f.status)+')').join(', ')+'.'});
 if(invalid)gaps.push({category:'invalide',count:invalid,text:invalid+' conversation(s) rejetée(s) pour structure invalide (motifs dans le détail des fichiers). Elles ne sont pas importées et restent dans votre archive.'});
 if(Number(conv?.errors||0))gaps.push({category:'invalide',count:Number(conv?.errors),text:Number(conv?.errors)+' conversation(s) inventoriée(s) avec une erreur de lecture.'});
 const nodeGap=Number(conv?.nodes||0)-stored.nodes;if(nodeGap!==0)gaps.push({category:'ecart',count:Math.abs(nodeGap),text:'Écart entre les nœuds annoncés à l’inventaire ('+Number(conv?.nodes||0)+') et les nœuds enregistrés ('+stored.nodes+').'});
 if(dangling||Number(conv?.cycles||0)||Number(conv?.bad_current||0))gaps.push({category:'ecart',count:dangling+Number(conv?.cycles||0)+Number(conv?.bad_current||0),text:'Structure à vérifier : '+dangling+' parent(s) introuvable(s), '+Number(conv?.cycles||0)+' cycle(s), '+Number(conv?.bad_current||0)+' nœud actif absent.'});
 if(refBy('referenced_only')+refBy('unlinked'))gaps.push({category:'absent_de_l_archive',count:refBy('referenced_only')+refBy('unlinked'),text:(refBy('referenced_only')+refBy('unlinked'))+' pièce(s) jointe(s) citée(s) sans fichier dans l’archive (ou archive non indexée).'});
 if(refBy('ambiguous'))gaps.push({category:'ecart',count:refBy('ambiguous'),text:refBy('ambiguous')+' pièce(s) jointe(s) avec plusieurs fichiers possibles : aucune n’est choisie.'});
 if(Number(links?.missing||0))gaps.push({category:'absent_de_l_archive',count:Number(links!.missing),text:Number(links!.missing)+' fichier(s) désigné(s) par la correspondance de l’archive mais absent(s) de l’archive.'});
 for(const a of annexes){if(a.status==='invalid_json'||a.status==='unrecognized_shape')gaps.push({category:'invalide',count:1,text:'Annexe « '+a.name+' » : '+(a.status==='invalid_json'?'JSON illisible':'forme non reconnue')+' (texte conservé, non interprété).'});}
 for(const x of comparisons)if(x.status==='ecart')gaps.push({category:'ecart',count:1,text:'Chiffre annoncé par l’archive pour « '+x.category+' » : '+x.claimed.join(' / ')+' ; enregistré : '+x.recorded+' (lecture heuristique des annexes, à vérifier).'});
 const notImported=Number(conv?.notimp||0)+Number(conv?.part||0);if(notImported)gaps.push({category:'non_importe',count:notImported,text:notImported+' conversation(s) dont les messages ne sont pas (entièrement) importés dans la mémoire : étape volontaire, à faire par conversation.'});
 const hard=gaps.some(g=>g.category==='ecart'&&/nœuds annoncés|Structure/.test(g.text));
 const inventory=!segs.length?'aucun_segment':detected>registered||failedSegments.length?'incomplet':hard?'incoherent':'complet';
 const byGroup:Record<string,any>={};for(const f of files){const g=byGroup[f.group_name||'autre']||(byGroup[f.group_name||'autre']={label:(GROUP_LABEL as any)[f.group_name||'autre']||f.group_name,total:0,hashed:0,problems:0});g.total+=Number(f.n);if(f.status==='hashed')g.hashed+=Number(f.n);else g.problems+=Number(f.n);}
 return c.json({inventory_status:inventory,summary:inventory==='complet'?'Inventaire cohérent : '+stored.conversations+' conversation(s), '+stored.nodes+' nœud(s) enregistrés. Les messages et les pièces jointes sont comptés à part.':inventory==='aucun_segment'?'Aucun fichier de conversations inventorié.':inventory==='incomplet'?'Inventaire INCOMPLET : voir les écarts.':'Inventaire INCOHÉRENT : voir les écarts.',
  segments:{detected,registered,failed:failedSegments},conversations:{stored:stored.conversations,duplicates:Number(b.duplicate_count||0),invalid,import:{imported:Number(conv?.imp||0),partial:Number(conv?.part||0),not_imported:Number(conv?.notimp||0)}},
  nodes:{announced_by_inventory:Number(conv?.nodes||0),stored:stored.nodes,with_text:Number(nodes?.text||0),without_text:stored.nodes-Number(nodes?.text||0),dangling,cycles:Number(conv?.cycles||0),current_node_missing:Number(conv?.bad_current||0),branch_points:Number(conv?.branches||0)},
  messages:{text_nodes:Number(nodes?.text||0),inventoried:stored.messages,imported:Number(conv?.imported||0)},files_by_group:byGroup,attachments:{in_archive:refBy('in_archive'),referenced_only:refBy('referenced_only')+refBy('unlinked'),ambiguous:refBy('ambiguous'),via_correspondance:refs.filter(r=>r.link_source==='correspondance').reduce((n,r)=>n+Number(r.n),0)},
  correspondance:{declared:Number(links?.n||0),present:Number(links?.present||0),path_missing:Number(links?.missing||0)},annexes:annexes.map(a=>({name:a.name,kind:a.kind,status:a.status,size:a.size,note:a.note,form:a.shape?.correspondance?.form||null})),comparisons,
  not_preserved:{fields:Object.entries(dropped).sort((x,y)=>y[1]-x[1]).slice(0,30).map(([field,count])=>({field,count})),note:'Champs présents dans l’archive mais non conservés par Atelier (compte des occurrences). Le contenu des fichiers de l’archive n’est jamais copié.'},
  gaps,notice:'Les chiffres annoncés par les annexes sont lus d’après le NOM des clés (heuristique) : ils ne prouvent rien tant qu’ils n’ont pas été vérifiés avec l’archive réelle.'});
});

/* ---------- Analyse de l'historique par les IA déjà connectées (Gemini, Groq, Mistral) ---------- */
async function analysisOverview(env:Env,user:string,b:Row){
 const rows=await many<Row>(env,'SELECT status,second_status,truncated,COUNT(*) AS n FROM analysis_units WHERE user_id=? AND batch_id=? GROUP BY status,second_status,truncated',user,b.id);
 const c={pending:0,analysed:0,failed:0,superseded:0,second_wanted:0,second_done:0,second_failed:0,truncated:0};
 for(const r of rows){(c as any)[r.status]+=r.n;if(r.status==='superseded')continue;if(r.second_status==='wanted')c.second_wanted+=r.n;if(r.second_status==='done')c.second_done+=r.n;if(r.second_status==='failed')c.second_failed+=r.n;if(r.truncated)c.truncated+=r.n;}
 const without=(await one<Row>(env,"SELECT COUNT(*) AS n FROM export_conversations e WHERE e.user_id=? AND e.batch_id=? AND e.parse_status!='ignored' AND NOT EXISTS(SELECT 1 FROM analysis_units u WHERE u.conversation_id=e.id AND u.user_id=e.user_id AND u.status!='superseded')",user,b.id))?.n||0;
 const usage=await many<Row>(env,"SELECT provider,model,COUNT(*) AS calls,SUM(outcome='completed') AS completed,SUM(outcome='refused') AS refused,SUM(outcome='interrupted') AS interrupted,SUM(input_tokens) AS input_tokens,SUM(output_tokens) AS output_tokens FROM ai_usage WHERE user_id=? AND task_kind='export_analysis' AND task_id=? GROUP BY provider,model ORDER BY calls DESC",user,b.id);
 const at=now(),providers=(await loadAiConnections(env.DB,user)).filter(x=>(ANALYSIS_PROVIDERS as readonly string[]).includes(x.provider)).map(x=>{let list:string[]=[];try{const m=typeof x.models==='string'?JSON.parse(x.models):x.models;if(Array.isArray(m))list=m.map(String);}catch{/* liste illisible */}const model=pickReviewModel({models:list});const a=availabilityOf(x,{model,now:at});return {label:x.label,provider:x.provider,model:model||null,usable:a.usable,reason:a.reason,until:a.until,until_source:a.until_source};});
 const items=await many<Row>(env,'SELECT review_status,agreement,COUNT(*) AS n FROM analysis_items WHERE user_id=? AND batch_id=? GROUP BY review_status,agreement',user,b.id);
 return {consent_at:b.ai_consent_at||null,units:c,without_units:without,statement:analysisStatement(c,without),usage,providers,items,
  notice:'Deux IA d’accord ne sont pas une preuve : chaque élément renvoie aux messages d’origine, et rien ne devient une décision sans votre validation.'};
}
exportsRoute.get('/:id/analysis',async c=>{const user=userId(c),b=await batchOf(c.env,user,c.req.param('id'));return c.json(await analysisOverview(c.env,user,b));});
exportsRoute.post('/:id/analysis/consent',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({confirm:z.boolean()}).parse(await jsonBody(c));
 await run(c.env,'UPDATE export_batches SET ai_consent_at=? WHERE id=? AND user_id=?',d.confirm?now():null,b.id,user);
 await event(c.env,user,'export_analysis_consent',d.confirm?'Accord donné : les messages importés de « '+b.filename+' » peuvent être envoyés à Gemini, Groq ou Mistral pour analyse.':'Accord retiré pour l’analyse de « '+b.filename+' ».');
 return c.json(await analysisOverview(c.env,user,await batchOf(c.env,user,b.id)));
});
exportsRoute.post('/:id/analysis/prepare',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({lot:z.string().max(40).default(''),after:z.string().max(60).default('')}).parse(await jsonBody(c));
 return c.json(await prepareUnits(c.env,user,b,d));
});
exportsRoute.post('/:id/analysis/step',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({lot:z.string().max(40).default('')}).parse(await jsonBody(c));
 const step=await analysisStep(c.env,user,b,d);return c.json({step,overview:await analysisOverview(c.env,user,b)});
});
/** Remet en attente les unités en échec : rien n'est effacé, les réponses précédentes restent consultables. */
exportsRoute.post('/:id/analysis/retry-failed',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),at=now();
 const r1=await run(c.env,"UPDATE analysis_units SET status='pending',fail_count=0,updated_at=? WHERE user_id=? AND batch_id=? AND status='failed'",at,user,b.id);
 const r2=await run(c.env,"UPDATE analysis_units SET second_status='wanted',fail_count=0,updated_at=? WHERE user_id=? AND batch_id=? AND second_status='failed'",at,user,b.id);
 return c.json({retried:(r1.meta.changes||0)+(r2.meta.changes||0)});
});
const itemView=(r:Row)=>({id:r.id,unit_id:r.unit_id,pass:r.pass,kind:r.kind,kind_label:KIND_LABEL[r.kind as keyof typeof KIND_LABEL]||r.kind,text:r.text,source_keys:JSON.parse(r.source_keys),quote:r.quote,quote_verified:Boolean(r.quote_verified),reclassified:Boolean(r.reclassified),
 project_hint:r.project_hint,important:Boolean(r.important),agreement:r.agreement,agreement_label:AGREEMENT_LABEL[r.agreement],review_status:r.review_status,review_note:r.review_note,provider:r.provider,model:r.model,conversation_title:r.conversation_title,created_at:r.created_at});
exportsRoute.get('/:id/analysis/items',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),{limit,offset}=page(c),kind=c.req.query('kind')||'',status=c.req.query('status')||'',agreement=c.req.query('agreement')||'';
 if(kind&&!(ITEM_KINDS as readonly string[]).includes(kind))fail(400,'Type inconnu.');
 const rows=await many<Row>(c.env,"SELECT i.*,r.provider,r.model,e.title AS conversation_title FROM analysis_items i JOIN analysis_results r ON r.id=i.result_id JOIN analysis_units u ON u.id=i.unit_id JOIN export_conversations e ON e.id=u.conversation_id WHERE i.user_id=? AND i.batch_id=? AND u.status!='superseded' AND (?='' OR i.kind=?) AND (?='' OR i.review_status=?) AND (?='' OR i.agreement=?) ORDER BY i.important DESC,i.created_at,i.id LIMIT ? OFFSET ?",
  user,b.id,kind,kind,status,status,agreement,agreement,limit+1,offset);
 return c.json({items:rows.slice(0,limit).map(itemView),next:rows.length>limit?offset+limit:null});
});
/** Un élément avec ses messages d'origine complets : c'est la source qui fait foi, pas la reformulation de l'IA. */
exportsRoute.get('/analysis/items/:item',async c=>{
 const user=userId(c),i=await one<Row>(c.env,'SELECT i.*,r.provider,r.model,e.title AS conversation_title FROM analysis_items i JOIN analysis_results r ON r.id=i.result_id JOIN analysis_units u ON u.id=i.unit_id JOIN export_conversations e ON e.id=u.conversation_id WHERE i.id=? AND i.user_id=?',c.req.param('item'),user);
 if(!i)fail(404,'Élément introuvable.');
 const unit=await one<Row>(c.env,'SELECT * FROM analysis_units WHERE id=? AND user_id=?',i.unit_id,user),keys:string[]=JSON.parse(i.source_keys);
 const messages=unit?(await unitMessages(c.env,user,unit)).filter(m=>keys.includes(m.key)):[];
 const others=await many<Row>(c.env,'SELECT i.id,i.pass,i.kind,i.text,r.provider FROM analysis_items i JOIN analysis_results r ON r.id=i.result_id WHERE i.user_id=? AND i.unit_id=? AND i.id!=? AND i.pass!=?',user,i.unit_id,i.id,i.pass);
 return c.json({item:itemView(i),sources:messages.map(m=>({key:m.key,role:m.role,date:m.date,content:m.content})),sources_missing:keys.length-messages.length,
  other_reading:others.filter(o=>true).map(o=>({id:o.id,kind_label:KIND_LABEL[o.kind as keyof typeof KIND_LABEL]||o.kind,text:o.text,provider:o.provider}))});
});
exportsRoute.patch('/analysis/items/:item',async c=>{
 const user=userId(c),d=z.object({review_status:z.enum(['candidate','accepted','rejected']),review_note:z.string().max(500).default('')}).parse(await jsonBody(c));
 const r=await run(c.env,'UPDATE analysis_items SET review_status=?,review_note=? WHERE id=? AND user_id=?',d.review_status,d.review_note,c.req.param('item'),user);
 if(!r.meta.changes)fail(404,'Élément introuvable.');return c.json({saved:true});
});
