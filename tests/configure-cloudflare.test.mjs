import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareConfiguration,productionConfiguration} from '../scripts/configure-cloudflare.mjs';
const template=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
// Explicit configuration fixtures. They do not identify a real deployed database.
const values={databaseId:'11111111-1111-4111-8111-111111111111',origin:'https://atelier.test-fixture.workers.dev',accountId:'1'.repeat(32)};
test('refuse l’identifiant nul et localhost avant toute publication',()=>{
 assert.throws(()=>productionConfiguration(template),/identifiant D1[\s\S]*HTTPS/);
 assert.throws(()=>productionConfiguration(template,{...values,databaseId:'00000000-0000-0000-0000-000000000000'}),/identifiant D1/);
 assert.throws(()=>productionConfiguration(template,{...values,databaseId:'atelier-db'}),/identifiant D1/);
});
test('produit une copie dédiée, sans modifier la configuration locale ni les ressources nommées',()=>{
 const before=structuredClone(template),result=productionConfiguration(template,values);
 assert.deepEqual(template,before);assert.equal(result.workers_dev,true);assert.equal(result.d1_databases[0].database_id,values.databaseId);
 assert.equal(result.vars.APP_ORIGIN,values.origin);assert.equal(result.account_id,values.accountId);
 assert.deepEqual(result.queues,template.queues);assert.deepEqual(result.r2_buckets,template.r2_buckets);
});
test('refuse une adresse incompatible avec le Worker, une origine locale et un chemin',()=>{
 for(const origin of ['https://autre.test-fixture.workers.dev','https://atelier.test-fixture.workers.dev/chemin','http://atelier.test-fixture.workers.dev','https://localhost','https://atelier.test-fixture.workers.dev:8443'])assert.throws(()=>productionConfiguration(template,{...values,origin}));
});
test('conserve les routes personnalisées existantes sans enregistrer un nouveau domaine',()=>{
 const source={...template,routes:[{pattern:'atelier.example.com',custom_domain:true}]};
 const result=productionConfiguration(source,{...values,origin:'https://atelier.example.com'});
 assert.deepEqual(result.routes,source.routes);assert.equal(result.workers_dev,false);
 assert.throws(()=>productionConfiguration(template,{...values,origin:'https://atelier.example.com'}),/route/);
});
test('refuse un secret dans les variables de configuration et les bindings durables manquants',()=>{
 const source=structuredClone(template);source.vars.MASTER_KEY='fixture-no-secret';
 assert.throws(()=>productionConfiguration(source,values),/secret serveur/);
 delete source.vars.MASTER_KEY;delete source.queues;
 assert.throws(()=>productionConfiguration(source,values),/TASKS/);
 assert.throws(()=>productionConfiguration(template,{...values,accountId:'nom-du-compte'}),/identifiant réel/);
});
test('une copie de production déjà valide reste utilisable sans remplacer ses valeurs',()=>{
 const source=productionConfiguration(template,values);
 assert.deepEqual(productionConfiguration(source),source);
});
function checkout(t,settings=values){
 const directory=mkdtempSync(join(tmpdir(),'atelier-cloudflare-config-'));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 writeFileSync(join(directory,'wrangler.jsonc'),JSON.stringify(template));
 writeFileSync(join(directory,'cloudflare.production.json'),JSON.stringify(settings));
 return directory;
}
test('utilise les identifiants publics suivis pour un checkout de build neuf',t=>{
 const directory=checkout(t),config=prepareConfiguration({directory,environment:{}});
 assert.equal(config.d1_databases[0].database_id,values.databaseId);
 assert.equal(config.account_id,values.accountId);assert.equal(config.vars.APP_ORIGIN,values.origin);
 assert.deepEqual(JSON.parse(readFileSync(join(directory,'wrangler.production.jsonc'),'utf8')),config);
 assert.deepEqual(JSON.parse(readFileSync(join(directory,'wrangler.jsonc'),'utf8')),template);
});
test('une origine manquante ne crée aucun fichier de production incomplet',t=>{
 const directory=checkout(t,{...values,origin:null});
 assert.throws(()=>prepareConfiguration({directory,environment:{}}),/HTTPS/);
 assert.equal(existsSync(join(directory,'wrangler.production.jsonc')),false);
});
test('une variable de build remplace la valeur suivie et une copie existante est préservée',t=>{
 const directory=checkout(t),environment={ATELIER_D1_DATABASE_ID:'22222222-2222-4222-8222-222222222222',ATELIER_PUBLIC_ORIGIN:'https://atelier.second-fixture.workers.dev'};
 const config=prepareConfiguration({directory,environment});
 assert.equal(config.d1_databases[0].database_id,environment.ATELIER_D1_DATABASE_ID);
 assert.equal(config.vars.APP_ORIGIN,environment.ATELIER_PUBLIC_ORIGIN);
 assert.deepEqual(prepareConfiguration({directory,environment:{}}),config);
 const path=join(directory,'wrangler.production.jsonc'),before=readFileSync(path,'utf8');
 assert.throws(()=>prepareConfiguration({directory,environment:{ATELIER_PUBLIC_ORIGIN:'http://localhost:8787'}}),/HTTPS/);
 assert.equal(readFileSync(path,'utf8'),before);
});
test('les paramètres suivis refusent les champs de secrets et les types inattendus sans les journaliser',t=>{
 for(const settings of [{...values,MASTER_KEY:'fixture-never-print'},null,[],{...values,origin:42}]){
  const directory=checkout(t,settings);
  assert.throws(()=>prepareConfiguration({directory,environment:{}}),error=>/Aucun secret/.test(error.message)&&!error.message.includes('fixture-never-print'));
  assert.equal(existsSync(join(directory,'wrangler.production.jsonc')),false);
 }
});
