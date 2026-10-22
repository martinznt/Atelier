import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {openDatabase} from '../passerelle/scripts/sqlite.mjs';
import {persistTextVersion,readTextVersion,storedText,MAX_TEXT_BYTES} from '../server/storage-store.ts';
import {captureArtifact} from '../server/artifact-save.ts';
function database(t){
 const DB=openDatabase();
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())DB.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 DB.exec(`INSERT INTO users(id,username,password_hash,created_at) VALUES('a','alice','fixture','date'),('b','bob','fixture','date');
 INSERT INTO projects(id,user_id,name,created_at,updated_at) VALUES('pa','a','A','date','date'),('pb','b','B','date','date');
 INSERT INTO files(id,user_id,project_id,name,mime,author,created_at,updated_at) VALUES('fa','a','pa','icone.json','application/json','Vous','date','date'),('fb','b','pb','note.md','text/plain','Vous','date','date');`);
 t.after(()=>DB.close());return DB;
}
function version(overrides={}){
 const content='Création 🟣\n';const size=Buffer.byteLength(content);
 return {user:'a',file:'fa',expected:0,id:randomUUID(),content,size,sha:createHash('sha256').update(content).digest('hex'),state:'final',date:new Date().toISOString(),quota:1048576,...overrides};
}
test('contenu UTF-8, BOM et limites exactes sans sérialisation binaire',()=>{
 for(const text of ['Été 🟣','\ufefftest',''])assert.equal(storedText(new TextEncoder().encode(text)),text);
 assert.equal(storedText(new Uint8Array(MAX_TEXT_BYTES).fill(65)).length,MAX_TEXT_BYTES);
 assert.throws(()=>storedText(new Uint8Array(MAX_TEXT_BYTES+1)),e=>e.status===413);
 assert.throws(()=>storedText(Uint8Array.from([0xff,0x80])),e=>e.status===422);
 assert.throws(()=>storedText(Uint8Array.from([65,0,66])),e=>e.status===422);
});
test('enregistrement et lecture privés sans binding R2',async t=>{
 const DB=database(t),v=version();await persistTextVersion(DB,v);
 assert.equal(await readTextVersion(DB,'a',v.id),v.content);
 await assert.rejects(readTextVersion(DB,'b',v.id),e=>e.status===404);
 assert.equal((await DB.prepare("SELECT bytes FROM file_storage_usage WHERE user_id='a'").first()).bytes,v.size);
 assert.equal((await DB.prepare("SELECT current_version FROM files WHERE id='fa'").first()).current_version,1);
});
test('versions immuables et restauration par nouvelle version',async t=>{
 const DB=database(t),v1=version();await persistTextVersion(DB,v1);
 await persistTextVersion(DB,version({expected:1,content:'seconde',size:7}));
 const restored=version({expected:2,content:await readTextVersion(DB,'a',v1.id)});await persistTextVersion(DB,restored);
 assert.equal(await readTextVersion(DB,'a',restored.id),v1.content);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM file_versions').first()).n,3);
 await assert.rejects(DB.prepare("UPDATE file_contents SET content='autre' WHERE version_id=?").bind(v1.id).run(),/immutable/);
 await assert.rejects(DB.prepare('UPDATE file_versions SET version=20 WHERE id=?').bind(v1.id).run(),/immutable/);
});
test('deux enregistrements concurrents ne remplacent pas la même version',async t=>{
 const DB=database(t),results=await Promise.allSettled([persistTextVersion(DB,version()),persistTextVersion(DB,version())]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM file_contents').first()).n,1);
});
test('quota utilisateur plein : aucun contenu, compteur ni version orpheline',async t=>{
 const DB=database(t);await assert.rejects(persistTextVersion(DB,version({quota:1})),e=>e.status===413);
 for(const table of ['file_versions','file_contents','file_storage_usage'])assert.equal((await DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0);
});
test('quota partagé plein : transaction annulée sans purge',async t=>{
 const DB=database(t);DB.exec("INSERT INTO file_storage_usage VALUES('b',104857600)");
 await assert.rejects(persistTextVersion(DB,version()),e=>e.status===413);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM file_versions').first()).n,0);
 assert.equal((await DB.prepare("SELECT bytes FROM file_storage_usage WHERE user_id='b'").first()).bytes,104857600);
});
test('propriétaire étranger ou compte désactivé refusé',async t=>{
 const DB=database(t);await assert.rejects(persistTextVersion(DB,version({user:'b'})),e=>e.status===404);
 DB.exec("UPDATE users SET deleted_at='date' WHERE id='a'");
 await assert.rejects(persistTextVersion(DB,version()));
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM file_versions').first()).n,0);
});
test('panne de contenu : toute la transaction est annulée',async t=>{
 const DB=database(t);DB.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON file_contents BEGIN SELECT RAISE(ABORT,'injected'); END");
 await assert.rejects(persistTextVersion(DB,version()),/injected/);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM file_versions').first()).n,0);
 assert.equal((await DB.prepare("SELECT current_version FROM files WHERE id='fa'").first()).current_version,0);
});
test('suppression du projet retire ses contenus et ajuste son quota',async t=>{
 const DB=database(t);await persistTextVersion(DB,version());DB.exec("DELETE FROM projects WHERE id='pa'");
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM file_contents').first()).n,0);
 assert.equal((await DB.prepare("SELECT bytes FROM file_storage_usage WHERE user_id='a'").first()).bytes,0);
});
test('migration additive préserve une version historique sans inventer son contenu',async t=>{
 const DB=openDatabase();t.after(()=>DB.close());const migrations=readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
 for(const f of migrations.filter(f=>f<'0006'))DB.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 DB.exec(`INSERT INTO users(id,username,password_hash,created_at) VALUES('a','a','fixture','date');INSERT INTO projects(id,user_id,name,created_at,updated_at) VALUES('p','a','p','date','date');INSERT INTO files(id,user_id,project_id,name,mime,author,created_at,updated_at,current_version) VALUES('f','a','p','f.txt','text/plain','a','date','date',1);INSERT INTO file_versions VALUES('legacy','f','a',1,3,'hash','a/f/legacy','final','date');`);
 for(const f of migrations.filter(f=>f>='0006'))DB.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 assert.equal((await DB.prepare("SELECT object_key FROM file_versions WHERE id='legacy'").first()).object_key,'a/f/legacy');
 await assert.rejects(readTextVersion(DB,'a','legacy'),e=>e.status===404&&e.message.includes('historique'));
});
test('saturation d’artefact : conversation conservée et avertissement visible',async()=>{
 let response='Réponse complète',warning=0;const result=await captureArtifact(async()=>{throw Error('storage full');},async()=>{warning++;});
 assert.equal(result,undefined);assert.equal(response,'Réponse complète');assert.equal(warning,1);
 assert.equal(await captureArtifact(async()=>42,async()=>{throw Error('unexpected');}),42);
 await captureArtifact(async()=>{throw Error('storage full');},async()=>{throw Error('database unavailable');});
});
