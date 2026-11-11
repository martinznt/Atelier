import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
test('le build de branche (wrangler preview) a son bloc previews',()=>{
 assert.ok(config.previews&&typeof config.previews==='object');
});
test('previews n’est branché à AUCUNE ressource : jamais de données de production dans un aperçu de branche',()=>{
 for(const key of ['d1_databases','kv_namespaces','r2_buckets','queues','services','durable_objects','hyperdrive','vectorize','analytics_engine_datasets','ai_search','secrets','containers'])
  assert.equal(key in config.previews,false,'previews ne doit pas déclarer '+key);
 assert.equal(config.previews.vars.ALLOW_REGISTRATION,'false','aucune inscription sur un aperçu');
});
test('la production garde ses liaisons',()=>{assert.ok(config.d1_databases?.[0]?.binding==='DB');assert.ok(config.queues?.producers?.[0]?.binding==='TASKS');});
