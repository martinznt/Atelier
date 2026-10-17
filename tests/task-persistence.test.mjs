import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {openDatabase} from '../passerelle/scripts/sqlite.mjs';
import {persistChatTask} from '../server/task-persistence.ts';

// Real production statements and migrations, using SQLite transactions; no provider calls.
const date='2026-10-16T10:00:00.000Z';
function database(t) {
 const DB=openDatabase();
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())
  DB.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 DB.exec(`INSERT INTO users(id,username,password_hash,created_at) VALUES('a','alice','fixture','date'),('b','bob','fixture','date');
  INSERT INTO projects(id,user_id,name,created_at,updated_at) VALUES('pa','a','A','old','old'),('pb','b','B','old','old');
  INSERT INTO conversations(id,user_id,project_id,title,created_at,updated_at) VALUES('ca','a','pa','A','old','old'),('cb','b','pb','B','old','old');`);
 t.after(()=>DB.close());
 return {DB};
}
function pending(overrides={}) {
 return {id:randomUUID(),userId:'a',projectId:'pa',conversationId:'ca',idempotencyKey:'operation',requestHash:'hash',
  payload:JSON.stringify({reservation:100}),context:'{"text":"Contexte"}',messageId:randomUUID(),message:'Demande',reservation:100,createdAt:date,...overrides};
}
const count=async(env,table)=>(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;

test('la création publie ensemble tâche, message, date de conversation et événement',async t=>{
 const env=database(t),task=pending();
 assert.deepEqual(await persistChatTask(env,task),{kind:'created',id:task.id,status:'queued'});
 assert.equal(await count(env,'tasks'),1);
 const message=await env.DB.prepare('SELECT * FROM messages').first();
 assert.equal(message.task_id,task.id);assert.equal(message.content,task.message);assert.equal(message.user_id,'a');
 assert.equal((await env.DB.prepare("SELECT updated_at FROM conversations WHERE id='ca'").first()).updated_at,date);
 assert.equal((await env.DB.prepare('SELECT * FROM events').first()).task_id,task.id);
});

test('deux créations concurrentes avec la même clé donnent une seule tâche et un seul message',async t=>{
 const env=database(t);
 // Both callers reached persistence before learning of another request's result.
 const results=await Promise.all([persistChatTask(env,pending()),persistChatTask(env,pending())]);
 assert.deepEqual(results.map(result=>result.kind).sort(),['created','duplicate']);
 assert.equal(results[0].id,results[1].id);
 for(const table of ['tasks','messages','events'])assert.equal(await count(env,table),1);
});

test('la clé réutilisée avec un contenu différent donne un conflit sans modification',async t=>{
 const env=database(t),task=pending();
 await persistChatTask(env,task);
 assert.deepEqual(await persistChatTask(env,pending({requestHash:'autre',message:'Autre demande'})),{kind:'conflict'});
 assert.equal((await env.DB.prepare('SELECT content FROM messages').first()).content,task.message);
 assert.equal(await count(env,'events'),1);
});

test('la même clé appartient séparément à chaque compte',async t=>{
 const env=database(t);
 const a=await persistChatTask(env,pending());
 const b=await persistChatTask(env,pending({userId:'b',projectId:'pb',conversationId:'cb'}));
 assert.equal(a.kind,'created');assert.equal(b.kind,'created');assert.notEqual(a.id,b.id);
 assert.equal(await count(env,'messages'),2);
});

test('un compte ne peut pas créer une tâche sur la conversation ou le projet d’un autre',async t=>{
 const env=database(t);
 for(const overrides of [{conversationId:'cb'},{projectId:'pb'},{projectId:'pb',conversationId:'cb'}])
  assert.deepEqual(await persistChatTask(env,pending(overrides)),{kind:'unavailable'});
 for(const table of ['tasks','messages','events'])assert.equal(await count(env,table),0);
});

test('une panne pendant l’enregistrement du message annule aussi la tâche',async t=>{
 const env=database(t);
 env.DB.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT,'injected message failure'); END;");
 await assert.rejects(persistChatTask(env,pending()),/injected message failure/);
 for(const table of ['tasks','messages','events'])assert.equal(await count(env,table),0);
 assert.equal((await env.DB.prepare("SELECT updated_at FROM conversations WHERE id='ca'").first()).updated_at,'old');
 env.DB.exec('DROP TRIGGER injected_failure;');
 assert.equal((await persistChatTask(env,pending())).kind,'created');
});

test('une panne lors de l’événement annule les écritures antérieures du lot',async t=>{
 const env=database(t);
 env.DB.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'injected event failure'); END;");
 await assert.rejects(persistChatTask(env,pending()),/injected event failure/);
 for(const table of ['tasks','messages','events'])assert.equal(await count(env,table),0);
 assert.equal((await env.DB.prepare("SELECT updated_at FROM conversations WHERE id='ca'").first()).updated_at,'old');
});

test('les réservations concurrentes respectent le plafond sans message orphelin',async t=>{
 const env=database(t);
 env.DB.exec("UPDATE users SET monthly_tokens=150 WHERE id='a';");
 const results=await Promise.all([persistChatTask(env,pending({idempotencyKey:'first'})),persistChatTask(env,pending({idempotencyKey:'second'}))]);
 assert.deepEqual(results.map(result=>result.kind).sort(),['budget','created']);
 for(const table of ['tasks','messages','events'])assert.equal(await count(env,table),1);
});

test('une réponse perdue peut être retrouvée même si la première réservation a rempli le budget',async t=>{
 const env=database(t);
 env.DB.exec("UPDATE users SET monthly_tokens=100 WHERE id='a';");
 const first=await persistChatTask(env,pending());
 assert.deepEqual(await persistChatTask(env,pending()),{kind:'duplicate',id:first.id,status:'queued'});
 assert.deepEqual(await persistChatTask(env,pending({requestHash:'autre'})),{kind:'conflict'});
 assert.equal(await count(env,'messages'),1);
});

test('une suppression survenue avant le commit n’enregistre aucune nouvelle tâche',async t=>{
 const env=database(t);
 env.DB.exec("UPDATE users SET deleted_at='2026-10-16' WHERE id='a';");
 assert.deepEqual(await persistChatTask(env,pending()),{kind:'unavailable'});
 for(const table of ['tasks','messages','events'])assert.equal(await count(env,table),0);
});
