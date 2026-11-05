import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schemaStatus,resetSchemaCache} from '../server/schema-status.ts';
const tables={
 users:['id','email'],review_runs:['head_sha','report','stage','diagnostic','resume_at','resume_state'],
 review_configs:['daily_limit','post_comment','review_mode','relay','relay_max_attempts'],ai_usage:['connection_id','outcome']
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
