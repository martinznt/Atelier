import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
test('le build de branche (wrangler preview) a son bloc previews',()=>{
 assert.ok(config.previews&&typeof config.previews==='object');
});
/* Décision de Martin (15 novembre 2026) : la SEULE ressource tolérée dans `previews` est la base D1 de test `atelier-db-test`
   (nom et identifiant exacts). Toute autre ressource, ou une autre base, reste refusée. */
const TEST_DB={binding:'DB',database_name:'atelier-db-test',database_id:'098e53fe-0479-4084-87b1-81951d857fea',migrations_dir:'migrations'};
const PRODUCTION_DB_IDS=['eea113c4'];// préfixe de la base de production cité au rapport du lot 0 ; l'identifiant complet n'est pas dans le dépôt
test('previews n’est branché à aucune ressource de production : seule la base de test exacte est tolérée',()=>{
 for(const key of ['kv_namespaces','r2_buckets','queues','services','durable_objects','hyperdrive','vectorize','analytics_engine_datasets','ai_search','secrets','containers'])
  assert.equal(key in config.previews,false,'previews ne doit pas déclarer '+key);
 if('d1_databases' in config.previews)assert.deepEqual(config.previews.d1_databases,[TEST_DB],'seule la base de test exacte est permise dans previews');
 assert.equal(config.previews.vars.ALLOW_REGISTRATION,'false','aucune inscription sur un aperçu');
});
test('la base de test n’est ni celle de la production ni la base nulle de la configuration de production',()=>{
 for(const db of config.previews.d1_databases||[]){
  assert.notEqual(db.database_name,config.d1_databases[0].database_name);
  assert.notEqual(db.database_id,config.d1_databases[0].database_id);
  for(const p of PRODUCTION_DB_IDS)assert.ok(!db.database_id.startsWith(p),'previews ne doit jamais pointer la base de production');
 }
});
test('la production garde ses liaisons',()=>{assert.ok(config.d1_databases?.[0]?.binding==='DB');assert.ok(config.queues?.producers?.[0]?.binding==='TASKS');});
