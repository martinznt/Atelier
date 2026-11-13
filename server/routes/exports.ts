/* Inventaire d'un export personnel (ChatGPT, Claude). L'archive originale ne quitte pas l'appareil de Martin : Atelier ne
   conserve que son empreinte, le manifeste par conversation, les lots, les rapports d'analyse collés à la main et la couverture.
   Les messages eux-mêmes passent par l'import de mémoire existant (passerelle), jamais par cette route. */
import {Hono} from 'hono';import {z} from 'zod';
import {event,fail,jsonBody,many,now,one,owned,page,run,uid,userId} from '../core.ts';
import {coverageOf,makeLots} from '../export-inventory.ts';
import {secretFindings} from '../handoff-core.ts';
import {analysisStep,prepareUnits,unitMessages} from '../history-run.ts';
import {AGREEMENT_LABEL,ANALYSIS_PROVIDERS,ITEM_KINDS,KIND_LABEL,analysisStatement} from '../history-analysis.ts';
import {loadAiConnections} from '../ai-persist.ts';
import {availabilityOf} from '../ai-availability.ts';
import {pickReviewModel} from '../review-team.mjs';
import type {AppEnv,Env,Row} from '../types.ts';
export const exportsRoute=new Hono<AppEnv>();
const like=(q:string)=>'%'+q.slice(0,120).replace(/[\\%_]/g,m=>'\\'+m)+'%';
async function batchOf(env:Env,user:string,id:string){return owned<Row>(env,'export_batches',id,user);}
const isoOrNull=z.string().max(40).nullable();
const rowInput=z.object({source_id:z.string().min(1).max(200),title:z.string().max(200),created_time:isoOrNull,updated_time:isoOrNull,message_count:z.number().int().min(0).max(1000000),node_count:z.number().int().min(0).max(1000000),branch_count:z.number().int().min(0).max(1000000),
 attachment_refs:z.number().int().min(0).max(1000000),non_text_parts:z.number().int().min(0).max(1000000),parse_status:z.enum(['complete','partial','error']),parse_note:z.string().max(500)});
const batchView=(b:Row)=>{let stats:any={};try{stats=JSON.parse(b.stats);}catch{/* statistiques illisibles */}return {...b,stats};};
async function coverage(env:Env,user:string,b:Row){
 const rows=await many<Row>(env,'SELECT parse_status,import_status,project_id,project_confirmed,lot,message_count,imported_messages,attachment_refs FROM export_conversations WHERE user_id=? AND batch_id=?',user,b.id);
 const analyses=await many<Row>(env,'SELECT lot,kind FROM export_analyses WHERE user_id=? AND batch_id=?',user,b.id);
 return coverageOf(rows as any[],analyses as any[],b.declared_total);
}
exportsRoute.get('/',async c=>{
 const user=userId(c),batches=await many<Row>(c.env,'SELECT * FROM export_batches WHERE user_id=? ORDER BY created_at DESC LIMIT 20',user),out=[];
 for(const b of batches)out.push({...batchView(b),coverage:await coverage(c.env,user,b)});
 return c.json({items:out});
});
exportsRoute.post('/',async c=>{
 const user=userId(c),d=z.object({provider:z.enum(['ChatGPT','Claude','inconnu']),filename:z.string().min(1).max(200),size:z.number().int().min(1).max(20*1024*1024*1024),sha256:z.string().regex(/^[0-9a-f]{64}$/),declared_total:z.number().int().min(0).max(200000),
  stats:z.object({unrecognized:z.number().int().min(0).default(0),duplicates:z.number().int().min(0).default(0),zip_entries:z.number().int().min(0).default(0),zip_by_extension:z.record(z.string().max(12),z.number().int().min(0)).default({}),inner_file:z.string().max(200).default(''),inner_sha256:z.string().max(64).default('')}).default({unrecognized:0,duplicates:0,zip_entries:0,zip_by_extension:{},inner_file:'',inner_sha256:''}),notes:z.string().max(2000).default('')}).parse(await jsonBody(c));
 const existing=await one<Row>(c.env,'SELECT * FROM export_batches WHERE user_id=? AND sha256=?',user,d.sha256);
 // Même empreinte : c'est le même fichier. On reprend l'inventaire existant au lieu d'en créer un second.
 if(existing)return c.json({...batchView(existing),resumed:true});
 const id=uid(),at=now();
 await run(c.env,'INSERT INTO export_batches(id,user_id,provider,filename,size,sha256,received_at,declared_total,stats,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,user,d.provider,d.filename,d.size,d.sha256,at,d.declared_total,JSON.stringify(d.stats),d.notes,at);
 await event(c.env,user,'export_received','Export '+d.provider+' inventorié : '+d.filename+' (SHA-256 '+d.sha256.slice(0,12)+'…, '+d.declared_total+' conversations déclarées)');
 return c.json({...batchView(await batchOf(c.env,user,id)),resumed:false},201);
});
exportsRoute.post('/:id/conversations',async c=>{
 const user=userId(c),b=await batchOf(c.env,user,c.req.param('id')),d=z.object({rows:z.array(rowInput).min(1).max(300)}).parse(await jsonBody(c));
 const st=d.rows.map(r=>c.env.DB.prepare('INSERT INTO export_conversations(id,user_id,batch_id,source_id,title,created_time,updated_time,message_count,node_count,branch_count,attachment_refs,non_text_parts,parse_status,parse_note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(batch_id,source_id) DO NOTHING')
  .bind(uid(),user,b.id,r.source_id,r.title||'Sans titre',r.created_time,r.updated_time,r.message_count,r.node_count,r.branch_count,r.attachment_refs,r.non_text_parts,r.parse_status,r.parse_note));
 for(let i=0;i<st.length;i+=60)await c.env.DB.batch(st.slice(i,i+60));
 const n=(await one<Row>(c.env,'SELECT COUNT(*) AS n FROM export_conversations WHERE user_id=? AND batch_id=?',user,b.id))?.n||0;
 await run(c.env,"UPDATE export_batches SET conversation_count=?,status=CASE WHEN status='inventory' AND ?>=declared_total THEN 'inventoried' ELSE status END WHERE id=? AND user_id=?",n,n,b.id,user);
 return c.json({inventoried:n,declared:b.declared_total});
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
