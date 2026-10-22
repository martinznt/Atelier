import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {inspectDeployment} from '../scripts/deploy-check.mjs';
const base=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const presence={hasDependencies:true,hasBuild:true,hasToken:true,hasAccount:true};
const missing=checks=>checks.filter(x=>!x.ok).map(x=>x.id);
test('la configuration locale ne peut pas passer pour une configuration de publication',()=>{
 const errors=missing(inspectDeployment({...presence,config:base}));
 for(const id of ['database','https-origin','route'])assert.ok(errors.includes(id));
});
test('les accès absents sont listés sans inventer ni exposer un secret',()=>{
 const checks=inspectDeployment({config:null});assert.equal(checks.length,5);assert.ok(checks.every(x=>!x.ok));
});
test('les traitements durables restent nécessaires et R2 est facultatif',()=>{
 const config=structuredClone(base);delete config.queues;delete config.triggers;delete config.r2_buckets;
 const errors=missing(inspectDeployment({...presence,config}));for(const id of ['tasks','maintenance'])assert.ok(errors.includes(id));
});
test('origine externe sûre et identité de session autonome sont exigées',()=>{
 const config=structuredClone(base);config.vars.APP_ORIGIN='https://atelier.example/path';config.vars.SITES_AUTHENTICATION='true';config.vars.MASTER_KEY='fixture-not-a-key';
 const errors=missing(inspectDeployment({...presence,config}));for(const id of ['https-origin','no-sites-identity','no-plaintext-key'])assert.ok(errors.includes(id));
});
