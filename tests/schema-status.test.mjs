import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schemaStatus,resetSchemaCache} from '../server/schema-status.ts';
const N0022={
 export_nodes:['id','user_id','batch_id','conversation_id','node_id','parent_id','children','role','content_type','create_time','has_text','text_chars','attachment_refs','meta'],
 export_segments:['rows_stored','nodes_stored','dropped_fields','issues','wrapper','reason_code'],
 export_annexes:['id','user_id','batch_id','name','kind','size','sha256','status','shape','content','note','created_at'],
 export_links:['id','user_id','batch_id','ref_key','declared_path','file_id','status']
};
const tables={
 users:['id','email'],review_runs:['head_sha','report','stage','diagnostic','resume_at','resume_state'],
 review_configs:['daily_limit','post_comment','review_mode','relay','relay_max_attempts','auto_scope','no_daily_cap','auto_mark'],ai_usage:['connection_id','outcome'],
 handoff_packages:['content_hash','status'],plan_tasks:['depends_on','proof','work_kind','do_not_touch'],repositories:['verified_at'],
 conversations:['category','status'],export_conversations:['segment','meta','source_index'],export_attachment_refs:['link_source','note'],export_nodes:[...N0022.export_nodes],export_segments:[...N0022.export_segments],export_annexes:[...N0022.export_annexes],export_links:[...N0022.export_links],atelier_questions:['dedupe_key'],prompt_versions:['locked','sent_at'],ref_audit_files:['read_status'],quota_readings:['used_percent','source'],checkpoints:['next_action'],export_batches:['ai_consent_at'],analysis_items:['quote_verified','agreement'],export_files:['sniff_kind','sha256','group_name'],
 project_setup:['project_id','template','feature_seq'],project_modules:['project_id','module_key','enabled'],item_lifecycle:['kind','item_id','status','reliability','source_ref','proof_kind','replaced_by_id'],lifecycle_events:['kind','item_id','to_status','to_reliability','reason','author_kind'],project_features:['code','name','state','group_name'],feature_links:['feature_id','target_kind','target_id'],
 missions:['repo_full_name','rules_commit','executor_family','verdict','verdict_evidence'],
 mockups:['page_name','screen_height','palette','start_state'],mockup_images:['mime','bytes','sha256','data'],mockup_groups:['mockup_id','name','position'],
 mockup_blocks:['kind','label','group_id','fill','text_color','feature_id','behavior'],
 mockup_suggestion_decisions:['mockup_id','rule','target_key','decision']
};
const fake=(t)=>({prepare:sql=>({all:async()=>{const m=/table_info\((\w+)\)/.exec(sql);return {results:(t[m[1]]||[]).map(name=>({name}))};}})});
test('toutes les migrations présentes : complet, liste appliquée, rien de manquant',async()=>{
 resetSchemaCache();
 const s=await schemaStatus(fake(tables));
 assert.equal(s.complete,true);assert.deepEqual(s.missing,[]);assert.ok(s.applied.includes('0013'));
});
test('migration 0013 absente : signalée sans masquer les précédentes',async()=>{
 resetSchemaCache();
 const s=await schemaStatus(fake({...tables,ai_usage:[],review_runs:['head_sha','report','stage','diagnostic']}));
 assert.equal(s.complete,false);assert.deepEqual(s.missing,['0013']);assert.ok(s.applied.includes('0010'));
});
test('base illisible : état inconnu, jamais déclaré complet',async()=>{
 resetSchemaCache();
 const s=await schemaStatus({prepare:()=>{throw new Error('SECRET_DETAIL');}});
 assert.equal(s.complete,null);assert.doesNotMatch(JSON.stringify(s),/SECRET_DETAIL/);
});
test('la page publique n’interroge pas D1 à chaque appel : cache de 60 s, relecture ensuite',async()=>{
 resetSchemaCache();let queries=0;
 const counting={prepare:sql=>({all:async()=>{queries++;const m=/table_info\((\w+)\)/.exec(sql);return {results:(tables[m[1]]||[]).map(name=>({name}))};}})};
 await schemaStatus(counting,1000);const first=queries;
 await schemaStatus(counting,30000);assert.equal(queries,first);
 await schemaStatus(counting,62000);assert.ok(queries>first);
 resetSchemaCache();
});

const without=(table,col)=>({...tables,[table]:col===null?undefined:tables[table].filter(c=>c!==col)});
const status=async t=>{resetSchemaCache();return schemaStatus(fake(t));};
test('0022 : tout présent → appliquée, et seulement alors',async()=>{
 const s=await status(tables);assert.equal(s.complete,true);assert.ok(s.applied.includes('0022'));assert.ok(!s.missing.includes('0022'));
});
for(const [label,table,col] of [
 ['table export_links absente','export_links',null],['table export_nodes absente','export_nodes',null],['table export_annexes absente','export_annexes',null],
 ['colonne export_conversations.meta absente','export_conversations','meta'],['colonne export_conversations.source_index absente','export_conversations','source_index'],
 ['colonne export_files.group_name absente','export_files','group_name'],['colonne export_attachment_refs.link_source absente','export_attachment_refs','link_source'],
 ['colonne export_attachment_refs.note absente','export_attachment_refs','note'],['colonne export_segments.reason_code absente','export_segments','reason_code'],
 ['colonne export_links.declared_path absente','export_links','declared_path'],['colonne export_nodes.parent_id absente','export_nodes','parent_id'],['colonne export_annexes.content absente','export_annexes','content']
]){
 test('0022 incomplète — '+label+' : déclarée manquante, jamais appliquée, antérieures intactes',async()=>{
  const s=await status(without(table,col));
  assert.equal(s.complete,false);assert.deepEqual(s.missing,['0022']);assert.ok(!s.applied.includes('0022'));assert.ok(s.applied.includes('0021')&&s.applied.includes('0013'));
 });
}
test('0022 : plusieurs éléments manquants à la fois → une seule entrée « manquante », 0021 toujours appliquée',async()=>{
 const s=await status({...tables,export_links:undefined,export_nodes:undefined,export_conversations:['segment'],export_files:['sniff_kind','sha256']});
 assert.equal(s.complete,false);assert.deepEqual(s.missing,['0022']);assert.ok(s.applied.includes('0021'));
});
test('base d’avant 0021 et 0022 (colonnes absentes) : 0021 et 0022 manquantes, antérieures appliquées',async()=>{
 const s=await status({...tables,export_files:['id'],export_conversations:['id'],export_nodes:undefined,export_links:undefined,export_annexes:undefined,export_segments:undefined,export_attachment_refs:undefined});
 assert.deepEqual(s.missing,['0021','0022']);assert.ok(s.applied.includes('0020'));
});

test('0023 : tout présent → appliquée ; une table manquante → seule 0023 manquante, 0022 intacte',async()=>{
 let s=await status(tables);assert.ok(s.applied.includes('0023'));assert.equal(s.complete,true);
 for(const t of ['project_setup','project_modules','item_lifecycle','lifecycle_events','project_features','feature_links']){
  s=await status({...tables,[t]:undefined});assert.equal(s.complete,false);assert.deepEqual(s.missing,['0023']);assert.ok(s.applied.includes('0022'));
 }
 s=await status(without('item_lifecycle','proof_kind'));assert.deepEqual(s.missing,['0023']);
});
test('0024 absente (table missions) : déclarée manquante, antérieures intactes',async()=>{
 resetSchemaCache();
 const {missions:_m,...without}=tables;
 const s=await schemaStatus(fake(without));
 assert.equal(s.complete,false);assert.deepEqual(s.missing,['0024']);assert.ok(s.applied.includes('0023'));
});
test('0025 : tout présent → appliquée ; une table ou une colonne manquante → seule 0025 manquante, 0024 intacte',async()=>{
 let s=await status(tables);assert.ok(s.applied.includes('0025'));assert.equal(s.complete,true);
 for(const t of ['mockups','mockup_images','mockup_groups','mockup_blocks']){
  s=await status({...tables,[t]:undefined});assert.equal(s.complete,false);assert.deepEqual(s.missing,['0025'],t);assert.ok(s.applied.includes('0024'));
 }
 s=await status(without('mockup_blocks','feature_id'));assert.deepEqual(s.missing,['0025']);
});
test('0026 : table présente → appliquée ; absente → seule 0026 manquante, 0025 intacte',async()=>{
 let s=await status(tables);assert.ok(s.applied.includes('0026'));assert.equal(s.complete,true);
 s=await status({...tables,mockup_suggestion_decisions:undefined});assert.deepEqual(s.missing,['0026']);assert.ok(s.applied.includes('0025'));
});
