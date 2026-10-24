import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {openDatabase} from '../passerelle/scripts/sqlite.mjs';
import {normalizeEmail,validNewPassword} from '../server/account-policy.ts';
import {enrollEmail,createSession,recoverAccount,changePassword} from '../server/auth-store.ts';
function database(t){const db=openDatabase();for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f<'0007').sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));db.exec(`INSERT INTO users(id,username,password_hash,created_at) VALUES('a','alice','hash-a','date'),('b','bob','hash-b','date');INSERT INTO projects(id,user_id,name,created_at,updated_at) VALUES('p','a','Travail conservé','date','date');INSERT INTO sessions VALUES('old-a','a','date','future'),('old-b','b','date','future');INSERT INTO recovery_codes VALUES('a','code-a'),('b','code-b');`);for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f>='0007').sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));t.after(()=>db.close());return db;}
const session=tokenHash=>({tokenHash,createdAt:'2026-10-24',expiresAt:'2026-11-07'});
const email=async(db,id)=>(await db.prepare('SELECT email FROM users WHERE id=?').bind(id).first()).email;
const sessions=async(db,id)=>(await db.prepare('SELECT token_hash FROM sessions WHERE user_id=? ORDER BY token_hash').bind(id).all()).results.map(r=>r.token_hash);
test('8 caractères acceptés, 7 refusés ; maximum et caractères Unicode comptés',()=>{
 assert.equal(validNewPassword('12345678'),true);assert.equal(validNewPassword('1234567'),false);assert.equal(validNewPassword('😀'.repeat(4)),false);assert.equal(validNewPassword('😀'.repeat(8)),true);assert.equal(validNewPassword('a'.repeat(128)),true);assert.equal(validNewPassword('a'.repeat(129)),false);assert.equal(validNewPassword(12345678),false);
});
test('email normalisé, adresses usuelles acceptées, entrées invalides refusées',()=>{
 assert.equal(normalizeEmail('  Martin+atelier@Exemple.FR  '),'martin+atelier@exemple.fr');
 for(const value of ['',null,'alice','a@','@example.fr','a..b@example.fr','.a@example.fr','a@localhost','a@-example.fr','a@example..fr','a@example.fr\nBcc:other@example.fr','a'.repeat(65)+'@example.fr'])assert.equal(normalizeEmail(value),null,String(value));
});
test('migration additive : anciens comptes, projets, mots de passe et codes conservés',async t=>{
 const db=database(t);assert.equal(await email(db,'a'),null);assert.equal((await db.prepare("SELECT name FROM projects WHERE id='p'").first()).name,'Travail conservé');assert.equal((await db.prepare("SELECT password_hash FROM users WHERE id='a'").first()).password_hash,'hash-a');assert.equal((await db.prepare('SELECT count(*) AS n FROM recovery_codes').first()).n,2);
});
test('ajout email atomique : même propriétaire, projets conservés, autres sessions révoquées',async t=>{
 const db=database(t);assert.equal(await enrollEmail(db,'a','hash-a','alice@example.fr',session('new-a')),true);assert.equal(await email(db,'a'),'alice@example.fr');assert.deepEqual(await sessions(db,'a'),['new-a']);assert.deepEqual(await sessions(db,'b'),['old-b']);assert.equal((await db.prepare("SELECT user_id FROM projects WHERE id='p'").first()).user_id,'a');assert.equal((await db.prepare("SELECT count(*) AS n FROM recovery_codes WHERE user_id='a'").first()).n,1);
});
test('email déjà pris et variantes de casse : aucune fusion, transaction annulée',async t=>{
 const db=database(t);await enrollEmail(db,'b','hash-b','shared@example.fr',session('new-b'));
 await assert.rejects(enrollEmail(db,'a','hash-a','SHARED@example.fr',session('new-a')),/UNIQUE/);assert.equal(await email(db,'a'),null);assert.deepEqual(await sessions(db,'a'),['old-a']);assert.deepEqual(await sessions(db,'b'),['new-b']);
});
test('deux comptes revendiquent la même adresse : un seul propriétaire',async t=>{
 const db=database(t),results=await Promise.allSettled([enrollEmail(db,'a','hash-a','same@example.fr',session('new-a')),enrollEmail(db,'b','hash-b','same@example.fr',session('new-b'))]);assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value).length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal((await db.prepare("SELECT count(*) AS n FROM users WHERE email='same@example.fr'").first()).n,1);
});
test('mot de passe changé, propriétaire étranger ou compte désactivé : aucune attribution',async t=>{
 const db=database(t);assert.equal(await enrollEmail(db,'b','hash-a','stolen@example.fr',session('stolen')),false);assert.equal(await enrollEmail(db,'a','old-hash','stale@example.fr',session('stale')),false);db.exec("UPDATE users SET deleted_at='date' WHERE id='a'");assert.equal(await enrollEmail(db,'a','hash-a','deleted@example.fr',session('deleted')),false);assert.equal(await email(db,'a'),null);assert.equal(await email(db,'b'),null);assert.deepEqual(await sessions(db,'b'),['old-b']);
});
test('panne pendant rotation : adresse et sessions précédentes intactes',async t=>{
 const db=database(t);db.exec("CREATE TRIGGER injected_event_failure BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'injected'); END");await assert.rejects(enrollEmail(db,'a','hash-a','a@example.fr',session('new')),/injected/);assert.equal(await email(db,'a'),null);assert.deepEqual(await sessions(db,'a'),['old-a']);
});
test('après ajout email : aucune connexion ou récupération ancienne retardée',async t=>{
 const db=database(t);await enrollEmail(db,'a','hash-a','a@example.fr',session('enrolled'));assert.equal(await createSession(db,'a','hash-a',session('stale-legacy'),true),false);assert.equal(await recoverAccount(db,'a','code-a','new-password',session('stale-recovery'),true),false);assert.deepEqual(await sessions(db,'a'),['enrolled']);assert.equal((await db.prepare("SELECT count(*) AS n FROM recovery_codes WHERE user_id='a'").first()).n,1);
});
test('l’adresse seule et le code d’un autre compte ne récupèrent pas le compte',async t=>{
 const db=database(t);await enrollEmail(db,'a','hash-a','a@example.fr',session('enrolled'));for(const code of ['', 'a@example.fr','code-b'])assert.equal(await recoverAccount(db,'a',code,'replacement',session('invalid-'+code)),false);assert.deepEqual(await sessions(db,'a'),['enrolled']);
 assert.equal(await recoverAccount(db,'a','code-a','new-hash',session('recovered')),true);assert.equal(await email(db,'a'),'a@example.fr');assert.equal(await changePassword(db,'a','new-hash','another-hash',session('changed')),true);assert.equal(await email(db,'a'),'a@example.fr');
});
test('un second ajout ne remplace jamais l’adresse choisie',async t=>{
 const db=database(t);await enrollEmail(db,'a','hash-a','first@example.fr',session('first'));assert.equal(await enrollEmail(db,'a','hash-a','second@example.fr',session('second')),false);assert.equal(await email(db,'a'),'first@example.fr');assert.deepEqual(await sessions(db,'a'),['first']);
});
