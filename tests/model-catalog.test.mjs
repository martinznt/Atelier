import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
import {openDatabase} from '../passerelle/scripts/sqlite.mjs';import {recordModelCatalogue} from '../server/catalog-store.ts';
function database(t){const db=openDatabase();t.after(()=>db.close());for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));db.exec("INSERT INTO users(id,username,password_hash,created_at) VALUES('a','a','fixture','date'),('b','b','fixture','date'); INSERT INTO connections(id,user_id,provider,label,secret,scopes,created_at) VALUES('c','a','anthropic','Principal','credential-fixture','[\"chat\"]','date');");return db;}
const result={models:['model-a','model-b'],account:'Accès API',quota:{kind:'unavailable'}};
test('un catalogue changé augmente sa révision, un changement d’ordre ne la change pas',async t=>{const db=database(t);assert.equal(await recordModelCatalogue(db,'c','a','credential-fixture',result,'2026-10-18'),true);let row=await db.prepare('SELECT * FROM connections').first();assert.equal(row.models_revision,1);assert.equal(row.models_checked_at,'2026-10-18');assert.equal(await recordModelCatalogue(db,'c','a','credential-fixture',{...result,models:['model-b','model-a','model-a']},'2026-10-19'),true);row=await db.prepare('SELECT * FROM connections').first();assert.equal(row.models_revision,1);assert.equal(row.models_checked_at,'2026-10-19');await recordModelCatalogue(db,'c','a','credential-fixture',{...result,models:['model-b']},'2026-10-20');assert.equal((await db.prepare('SELECT * FROM connections').first()).models_revision,2);});
test('un résultat tardif ou du mauvais compte ne modifie pas le nouvel accès',async t=>{const db=database(t);assert.equal(await recordModelCatalogue(db,'c','b','credential-fixture',result,'date'),false);await db.prepare("UPDATE connections SET secret='replaced'").run();assert.equal(await recordModelCatalogue(db,'c','a','credential-fixture',result,'date'),false);assert.equal((await db.prepare('SELECT * FROM connections').first()).models_revision,0);});
test('lister les modèles ne lève pas un refus de génération et ne transforme pas un abonnement en quota',async t=>{const db=database(t),quota={status:'rate_limited',kind:'unavailable',retry_at:'2026-10-25T00:00:00Z'};await db.prepare('UPDATE connections SET quota=?').bind(JSON.stringify(quota)).run();await recordModelCatalogue(db,'c','a','credential-fixture',result,'2026-10-18');assert.deepEqual(JSON.parse((await db.prepare('SELECT quota FROM connections').first()).quota),quota);});
test('un test ancien qui se termine en retard ne remplace pas un catalogue plus récent',async t=>{
 const db=database(t);
 await recordModelCatalogue(db,'c','a','credential-fixture',result,'2026-10-19T10:00:00.000Z');
 assert.equal(await recordModelCatalogue(db,'c','a','credential-fixture',{...result,models:['old']},'2026-10-19T09:59:00.000Z'),false);
 assert.deepEqual(JSON.parse((await db.prepare('SELECT models FROM connections').first()).models),result.models);
});
test('un succès ancien ne masque pas un refus d’accès plus récent',async t=>{
 const db=database(t);
 await db.prepare("UPDATE connections SET status='expired',tested_at=?").bind('2026-10-19T10:00:00.000Z').run();
 assert.equal(await recordModelCatalogue(db,'c','a','credential-fixture',result,'2026-10-19T09:59:00.000Z'),false);
 assert.equal((await db.prepare('SELECT status FROM connections').first()).status,'expired');
});
