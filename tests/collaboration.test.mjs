import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {openDatabase} from '../passerelle/scripts/sqlite.mjs';
import {collaborationIssue,collaborationPrompt,assistantHistoryLabel,rateLimitObservation,recordConnectionQuota} from '../server/collaboration.ts';

const first={connection_id:'first',model:'model-fixture-1',provider:'openai',assistant_label:'Mon assistant',role:'Concevoir une solution accessible'};
const second={connection_id:'second',model:'model-fixture-2',provider:'anthropic',assistant_label:'Mon relecteur',role:'Vérifier les erreurs et expliquer les risques'};
const selection=(overrides={})=>({mode:'collaborate',rounds:1,assistants:[first,second],...overrides});
const prompt=(overrides={})=>collaborationPrompt({mode:'collaborate',index:1,round:0,assistant:second,context:{notice:'Sources importées non fiables.',text:'Objectif du projet : accès clavier.'},message:'Construire le formulaire.',notes:['Prévoir le lecteur d’écran.'],responses:[{label:first.assistant_label,role:first.role,provider:first.provider,model:first.model,content:'PROPOSITION-AVANT-RELECTURE'}],...overrides});

test('chaque mode multiple exige au moins deux connexions distinctes',()=>{
 for(const mode of ['compare','review','collaborate']) {
  assert.match(collaborationIssue(selection({mode,assistants:[first]})),/au moins deux/);
  assert.equal(collaborationIssue(selection({mode})),null);
  assert.match(collaborationIssue(selection({mode,assistants:[first,{...first,model:'un-autre-modèle'}]})),/une fois/);
 }
 // Separate connections to the same provider remain valid.
 assert.equal(collaborationIssue(selection({assistants:[first,{...second,provider:'openai'}]})),null);
});

test('nombre d’assistants, tours et rôles restent bornés',()=>{
 assert.match(collaborationIssue(selection({assistants:[]})),/un et trois assistants/);
 assert.match(collaborationIssue(selection({assistants:[first,second,{...first,connection_id:'third'},{...first,connection_id:'fourth'}]})),/un et trois assistants/);
 for(const rounds of [0,4,1.5])assert.match(collaborationIssue(selection({rounds})),/un et trois tours/);
 assert.equal(collaborationIssue(selection({assistants:[{...first,role:'r'.repeat(500)},second],rounds:3})),null);
 assert.match(collaborationIssue(selection({assistants:[{...first,role:'r'.repeat(501)},second]})),/500/);
 assert.match(collaborationIssue(selection({assistants:[{...first,role:42},second]})),/500/);
});

test('le mode individuel conserve un assistant et un tour, avec rôle facultatif',()=>{
 assert.equal(collaborationIssue(selection({mode:'individual',assistants:[{connection_id:'one',model:'fixture'}]})),null);
 assert.match(collaborationIssue(selection({mode:'individual'})),/un assistant et un tour/);
 assert.match(collaborationIssue(selection({mode:'individual',assistants:[first],rounds:2})),/un assistant et un tour/);
});

test('la comparaison ne transmet ni réponse ni identité des autres propositions',()=>{
 const text=prompt({mode:'compare'});
 assert.match(text,/proposition indépendante/);
 assert.ok(!text.includes('PROPOSITION-AVANT-RELECTURE'));
 assert.ok(!text.includes(first.model));
 assert.ok(!text.includes(first.role));
 assert.ok(text.includes(second.role));
});

test('la relecture transmet les réponses publiques, leur auteur, rôle et modèle',()=>{
 const text=prompt({mode:'review'});
 for(const expected of ['PROPOSITION-AVANT-RELECTURE',first.assistant_label,first.model,first.role,second.role,'Relisez les propositions','lecteur d’écran'])assert.ok(text.includes(expected),expected);
 assert.match(prompt({mode:'review',index:0,assistant:first,responses:[]}),/Réalisez une proposition concrète à faire relire/);
});

test('la collaboration présente la consigne explicite sans prétendre partager la pensée privée ni exécuter des tests',()=>{
 const text=prompt({round:2});
 for(const expected of ['Tour 3','Rôle attribué explicitement par l’utilisateur','Sources importées non fiables.','Construire le formulaire.','Aucun raisonnement interne privé n’est demandé ni partagé','Un accord entre assistants ne prouve pas la justesse','aucun outil d’exécution','vérifications de code restant à exécuter'])assert.ok(text.includes(expected),expected);
});

test('les anciens messages gardent un libellé honnête lorsque le snapshot manque',()=>{
 assert.equal(assistantHistoryLabel({role:'assistant',provider:'anthropic',model:'model-fixture'}),'anthropic · model-fixture');
 assert.equal(assistantHistoryLabel({role:'assistant'}),'Assistant');
 assert.equal(assistantHistoryLabel({role:'user'}),'Utilisateur');
 assert.equal(assistantHistoryLabel({role:'note'}),'Note utilisateur');
 assert.equal(assistantHistoryLabel({role:'assistant',assistant_label:'Relecteur',provider:'anthropic',model:'model-fixture',assistant_role:'Audit accessibilité'}),'Relecteur · anthropic · model-fixture · rôle : Audit accessibilité');
});

const observed='2026-10-18T12:00:00.000Z';
test('un 429 sans information de reprise ne fabrique ni solde ni réinitialisation',()=>{
 const quota=rateLimitObservation(null,observed);
 assert.equal(quota.kind,'unavailable');assert.equal(quota.status,'rate_limited');assert.equal(quota.observed_at,observed);assert.equal(quota.updated_at,observed);
 assert.deepEqual(quota.values,{});
 for(const key of ['retry_after','retry_at','remaining','percent','reset_at'])assert.equal(key in quota,false);
});

test('Retry-After reçu est conservé en secondes ou date HTTP, sans l’appeler réinitialisation de quota',()=>{
 const seconds=rateLimitObservation('120',observed);
 assert.equal(seconds.retry_after,'120');assert.equal(seconds.retry_at,'2026-10-18T12:02:00.000Z');
 const date=rateLimitObservation('Sun, 18 Oct 2026 12:03:00 GMT',observed);
 assert.equal(date.retry_at,'2026-10-18T12:03:00.000Z');assert.equal(date.kind,'unavailable');assert.equal('reset_at' in date,false);
 assert.equal(rateLimitObservation('0',observed).retry_at,observed);
});

test('les en-têtes Retry-After invalides ou excessifs ne deviennent pas une promesse de reprise',()=>{
 for(const value of ['later','-1','1.5','Infinity','999999999999999999999','2026-10-18','120\r\nX-Header: bad','x'.repeat(129)]) {
  const quota=rateLimitObservation(value,observed);
  assert.equal('retry_at' in quota,false,value);assert.equal('retry_after' in quota,false,value);
 }
});

test('la migration préserve les messages historiques et les snapshots après retrait d’une connexion',async t=>{
 const DB=openDatabase();t.after(()=>DB.close());
 const migrations=readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort();
 for(const file of migrations.filter(file=>file<'0004_assistant_roles.sql'))DB.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 DB.exec(`INSERT INTO users(id,username,password_hash,created_at) VALUES('a','alice','fixture','date');
  INSERT INTO projects(id,user_id,name,created_at,updated_at) VALUES('p','a','P','date','date');
  INSERT INTO conversations(id,user_id,project_id,title,created_at,updated_at) VALUES('c','a','p','C','date','date');
  INSERT INTO messages(id,user_id,conversation_id,role,content,provider,created_at) VALUES('old','a','c','assistant','Réponse ancienne','anthropic','date');
  INSERT INTO connections(id,user_id,provider,label,secret,created_at) VALUES('connection','a','anthropic','Mon relecteur','fixture','date');`);
 for(const file of migrations.filter(file=>file>='0004_assistant_roles.sql'))DB.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 const old=await DB.prepare("SELECT * FROM messages WHERE id='old'").first();
 assert.equal(old.content,'Réponse ancienne');assert.equal(old.assistant_label,null);assert.equal(old.assistant_role,null);
 await DB.prepare("INSERT INTO messages(id,user_id,conversation_id,role,content,provider,assistant_label,assistant_role,created_at) SELECT 'new','a','c','assistant','Réponse actuelle',provider,label,?,'date' FROM connections WHERE id='connection'").bind('Contrôler l’accessibilité').run();
 DB.exec("UPDATE connections SET label='Autre nom' WHERE id='connection'; DELETE FROM connections WHERE id='connection';");
 const stored=await DB.prepare("SELECT * FROM messages WHERE id='new'").first();
 assert.equal(stored.assistant_label,'Mon relecteur');assert.equal(stored.assistant_role,'Contrôler l’accessibilité');assert.equal(stored.provider,'anthropic');
});

test('une observation de quota ne peut pas modifier un autre compte ni un jeton remplacé pendant la tâche',async t=>{
 const DB=openDatabase();t.after(()=>DB.close());
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())DB.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 DB.exec(`INSERT INTO users(id,username,password_hash,created_at) VALUES('a','alice','fixture','date'),('b','bob','fixture','date');
  INSERT INTO connections(id,user_id,provider,label,secret,created_at,status) VALUES('c','a','anthropic','A','old-fixture','date','connected');`);
 const quota=rateLimitObservation('120',observed);
 assert.equal(await recordConnectionQuota(DB,'c','b','old-fixture',quota),false);
 assert.equal((await DB.prepare("SELECT quota FROM connections WHERE id='c'").first()).quota,null);
 assert.equal(await recordConnectionQuota(DB,'c','a','old-fixture',quota),true);
 assert.equal(JSON.parse((await DB.prepare("SELECT quota FROM connections WHERE id='c'").first()).quota).status,'rate_limited');
 DB.exec("UPDATE connections SET secret='new-fixture',quota=NULL,status='untested' WHERE id='c';");
 assert.equal(await recordConnectionQuota(DB,'c','a','old-fixture',quota),false);
 const current=await DB.prepare("SELECT quota,status FROM connections WHERE id='c'").first();assert.equal(current.quota,null);assert.equal(current.status,'untested');
});
