import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
test('le build de branche (wrangler preview) a son bloc previews',()=>{
 assert.ok(config.previews&&typeof config.previews==='object');
});
test('previews n’est branché à AUCUNE ressource de production : seule la base de test « atelier-db-test » est autorisée, identifiée exactement',()=>{
 for(const key of ['kv_namespaces','r2_buckets','queues','services','durable_objects','hyperdrive','vectorize','analytics_engine_datasets','ai_search','secrets','containers'])
  assert.equal(key in config.previews,false,'previews ne doit pas déclarer '+key);
 assert.equal(config.previews.vars.ALLOW_REGISTRATION,'false','aucune inscription sur un aperçu');
 // Décision de Martin (15 novembre 2026) : les aperçus utilisent une base D1 de test dédiée. Aucune autre base n'est acceptée, ni plusieurs.
 const dbs=config.previews.d1_databases;
 assert.ok(Array.isArray(dbs)&&dbs.length===1,'previews : exactement une base D1 (la base de test)');
 assert.deepEqual(Object.keys(dbs[0]).sort(),['binding','database_id','database_name','migrations_dir']);
 assert.equal(dbs[0].binding,'DB');assert.equal(dbs[0].database_name,'atelier-db-test');assert.equal(dbs[0].database_id,'098e53fe-0479-4084-87b1-81951d857fea');
 const prod=config.d1_databases[0];
 assert.notEqual(dbs[0].database_name,prod.database_name,'la base des aperçus doit différer de celle de production');
 assert.notEqual(dbs[0].database_id,prod.database_id,'l’identifiant de la base des aperçus doit différer de celui de production');
});
test('production : inscriptions fermées (décision de Martin du 15 novembre 2026, « pour l’instant ») ; la connexion des comptes existants n’en dépend pas',()=>{
 assert.equal(config.vars.ALLOW_REGISTRATION,'false');
});
test('la production garde ses liaisons',()=>{assert.ok(config.d1_databases?.[0]?.binding==='DB');assert.ok(config.queues?.producers?.[0]?.binding==='TASKS');});
