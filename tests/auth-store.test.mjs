import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {openDatabase} from '../passerelle/scripts/sqlite.mjs';
import {createSession,recoverAccount,changePassword,revokeSession} from '../server/auth-store.ts';

async function setup(t) {
 const db=openDatabase();t.after(()=>db.close());
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())
  db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 for(const id of ['a','b']){
  await db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(id,`user-${id}`,`old-${id}`,'2026-10-16').run();
  await db.prepare('INSERT INTO recovery_codes(user_id,code_hash) VALUES(?,?)').bind(id,`code-${id}`).run();
  await db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(`session-${id}`,id,'2026-10-15','2026-10-29').run();
 }
 return db;
}
const session=tokenHash=>({tokenHash,createdAt:'2026-10-16',expiresAt:'2026-10-30'});
const password=async(db,id)=>(await db.prepare('SELECT password_hash FROM users WHERE id=?').bind(id).first()).password_hash;
const sessions=async(db,id)=>(await db.prepare('SELECT token_hash FROM sessions WHERE user_id=? ORDER BY token_hash').bind(id).all()).results.map(r=>r.token_hash);
const code=async(db,id)=>Boolean(await db.prepare('SELECT 1 FROM recovery_codes WHERE user_id=?').bind(id).first());

test('récupérer un compte consomme son code, remplace ses sessions et préserve l’autre compte',async t=>{
 const db=await setup(t);
 assert.equal(await recoverAccount(db,'a','code-a','new-a',session('new-session-a')),true);
 assert.equal(await password(db,'a'),'new-a');assert.equal(await code(db,'a'),false);
 assert.deepEqual(await sessions(db,'a'),['new-session-a']);
 assert.equal(await password(db,'b'),'old-b');assert.equal(await code(db,'b'),true);
 assert.deepEqual(await sessions(db,'b'),['session-b']);
});

test('code incorrect ou appartenant à B : aucune donnée du compte A ne change',async t=>{
 const db=await setup(t);
 for(const invalid of ['incorrect','code-b'])assert.equal(await recoverAccount(db,'a',invalid,'new-a',session('attempt')),false);
 assert.equal(await password(db,'a'),'old-a');assert.equal(await code(db,'a'),true);
 assert.deepEqual(await sessions(db,'a'),['session-a']);assert.deepEqual(await sessions(db,'b'),['session-b']);
});

test('un échec de création de session annule aussi la consommation du code et le nouveau mot de passe',async t=>{
 const db=await setup(t);
 await assert.rejects(()=>recoverAccount(db,'a','code-a','new-a',session('session-b')),/UNIQUE/);
 assert.equal(await password(db,'a'),'old-a');assert.equal(await code(db,'a'),true);
 assert.deepEqual(await sessions(db,'a'),['session-a']);assert.deepEqual(await sessions(db,'b'),['session-b']);
 assert.equal(await recoverAccount(db,'a','code-a','new-a',session('retry')),true);
});

test('rejouer le même code ne remplace pas le mot de passe ni la session déjà créés',async t=>{
 const db=await setup(t);
 const results=await Promise.all([
  recoverAccount(db,'a','code-a','first',session('first-session')),
  recoverAccount(db,'a','code-a','second',session('second-session')),
 ]);
 assert.deepEqual(results,[true,false]);assert.equal(await password(db,'a'),'first');
 assert.deepEqual(await sessions(db,'a'),['first-session']);
});

test('une session vérifiée avant une récupération ne peut pas ressusciter après la révocation',async t=>{
 const db=await setup(t);
 await recoverAccount(db,'a','code-a','new-a',session('recovered-session'));
 assert.equal(await createSession(db,'a','old-a',session('stale-login')),false);
 assert.equal(await changePassword(db,'a','old-a','stale-change',session('stale-change-session')),false);
 assert.equal(await password(db,'a'),'new-a');assert.deepEqual(await sessions(db,'a'),['recovered-session']);
 assert.equal(await createSession(db,'a','new-a',session('current-login')),true);
});

test('modification du mot de passe et rotation de session sont atomiques',async t=>{
 const db=await setup(t);
 await assert.rejects(()=>changePassword(db,'a','old-a','new-a',session('session-b')),/UNIQUE/);
 assert.equal(await password(db,'a'),'old-a');assert.deepEqual(await sessions(db,'a'),['session-a']);
 assert.equal((await db.prepare('SELECT count(*) AS count FROM events').first()).count,0);
 assert.equal(await changePassword(db,'a','old-a','new-a',session('new-session')),true);
 assert.equal(await password(db,'a'),'new-a');assert.deepEqual(await sessions(db,'a'),['new-session']);
 assert.equal(await code(db,'a'),true);assert.deepEqual(await sessions(db,'b'),['session-b']);
 assert.equal((await db.prepare('SELECT count(*) AS count FROM events WHERE user_id=?').bind('a').first()).count,1);
});

test('un compte supprimé ne peut ni récupérer son accès, ni changer son mot de passe, ni ouvrir une session',async t=>{
 const db=await setup(t);
 await db.prepare('UPDATE users SET deleted_at=? WHERE id=?').bind('2026-10-16','a').run();
 assert.equal(await recoverAccount(db,'a','code-a','new-a',session('recovered')),false);
 assert.equal(await changePassword(db,'a','old-a','new-a',session('changed')),false);
 assert.equal(await createSession(db,'a','old-a',session('login')),false);
 assert.equal(await password(db,'a'),'old-a');assert.equal(await code(db,'a'),true);
});

test('révoquer une session est idempotent et accepte une session déjà expirée ou absente',async t=>{
 const db=await setup(t);
 await db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind('2020-01-01','session-a').run();
 await revokeSession(db,'session-a');await revokeSession(db,'session-a');await revokeSession(db,null);
 assert.deepEqual(await sessions(db,'a'),[]);assert.deepEqual(await sessions(db,'b'),['session-b']);
});
test('une déconnexion différée de A ne révoque jamais le cookie de B',async t=>{
 const db=await setup(t);
 assert.equal(await revokeSession(db,'session-b','a'),false);
 assert.deepEqual(await sessions(db,'a'),['session-a']);assert.deepEqual(await sessions(db,'b'),['session-b']);
 // Even an expired cookie retains its owner until it has been removed.
 await db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind('2020-01-01','session-b').run();
 assert.equal(await revokeSession(db,'session-b','a'),false);
 assert.deepEqual(await sessions(db,'b'),['session-b']);
 assert.equal(await revokeSession(db,'session-a','a'),true);
 assert.equal(await revokeSession(db,'session-a','a'),true);
 assert.equal(await revokeSession(db,null,'a'),true);
 assert.deepEqual(await sessions(db,'a'),[]);assert.deepEqual(await sessions(db,'b'),['session-b']);
});
