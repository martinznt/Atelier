import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planTeam,planIdentity,plannedStartIssue} from '../server/planning.ts';
const time=Date.parse('2026-10-18T10:00:00Z'),later=new Date(time+7*86400000).toISOString();
const candidate=id=>({connection_id:id,model:'model-test'});
const connection=(id,extra={})=>({id,label:`Compte ${id}`,provider:'anthropic',status:'connected',models:['model-test'],scopes:['chat'],api_consent:1,models_revision:2,models_checked_at:new Date(time).toISOString(),...extra});
const base={priority:'speed',max_wait_minutes:10,missions:[{role:'Vérifier une migration, avec des preuves.',candidates:[candidate('preferred'),candidate('alternative')]}]};
const connections=[connection('preferred',{quota:{status:'rate_limited',retry_at:later,observed_at:new Date(time).toISOString()}}),connection('alternative',{provider:'openai'})];
test('urgence : retient l’alternative disponible, avec la même mission et une raison',()=>{
 const p=planTeam(base,connections,time);assert.deepEqual(p.blocked,[]);assert.equal(p.assistants[0].connection_id,'alternative');assert.equal(p.assistants[0].role,base.missions[0].role);assert.equal(p.not_before,null);assert.equal(p.basis,'user_preferences');assert.match(p.assistants[0].reason,/Choix 2/);
});
test('qualité selon préférences : conserve le premier choix et attend le délai fourni',()=>{
 const p=planTeam({...base,priority:'quality'},connections,time);assert.equal(p.assistants[0].connection_id,'preferred');assert.equal(p.not_before,later);
});
test('équilibre : attend une courte période, mais écarte une attente d’une semaine',()=>{
 assert.equal(planTeam({...base,priority:'balanced'},connections,time).assistants[0].connection_id,'alternative');
 const soon=[connection('preferred',{quota:{status:'rate_limited',retry_at:new Date(time+5*60000).toISOString()}}),connections[1]];
 assert.equal(planTeam({...base,priority:'balanced'},soon,time).assistants[0].connection_id,'preferred');
});
test('un délai inconnu n’est jamais converti en date de réinitialisation',()=>{
 const limited=[connection('preferred',{quota:{status:'rate_limited',observed_at:'2020-01-01'}}),connections[1]];
 assert.equal(planTeam({...base,priority:'quality'},limited,time).assistants.length,0);
 assert.equal(planTeam(base,limited,time).assistants[0].connection_id,'alternative');
});
test('date limite, expiration et autorisations excluent un choix devenu impossible',()=>{
 const p=planTeam({...base,priority:'quality',start_before:new Date(time+3600000).toISOString()},connections,time);assert.ok(p.blocked.length);
 for(const invalid of [{status:'expired'},{api_consent:0},{scopes:[]},{models:['retired']},{expires_at:new Date(time-1).toISOString()}])assert.equal(planTeam(base,[connection('preferred',invalid),connections[1]],time).assistants[0].connection_id,'alternative');
});
test('l’appariement trouve une équipe distincte même si un choix glouton échouerait',()=>{
 const p=planTeam({...base,missions:[{role:'Créer',candidates:[candidate('a'),candidate('b')]},{role:'Vérifier',candidates:[candidate('a')]}]},[connection('a'),connection('b')],time);
 assert.deepEqual(p.assistants.map(a=>a.connection_id),['b','a']);
});
test('deux missions ne partagent jamais la même connexion et une attente >30 jours est refusée',()=>{
 const p=planTeam({...base,missions:[{role:'A',candidates:[candidate('a')]},{role:'B',candidates:[candidate('a')]}]},[connection('a')],time);assert.ok(p.blocked.length);
 const far=[connection('preferred',{quota:{status:'rate_limited',retry_at:new Date(time+31*86400000).toISOString()}})];assert.ok(planTeam({...base,priority:'quality'},far,time).blocked.length);
});
test('nouvelle version du catalogue : empreinte changée ; l’heure seule ne change pas un choix immédiat',()=>{
 const p=planTeam(base,[connections[1]],time),q=planTeam(base,[connections[1]],time+1000);assert.equal(planIdentity(p),planIdentity(q));
 const updated=planTeam(base,[{...connections[1],models_revision:3}],time);assert.notEqual(planIdentity(p),planIdentity(updated));
});
test('les catalogues sans date produisent un avertissement et aucun classement factice',()=>{
 const copy=structuredClone(base),p=planTeam(base,[connection('alternative',{models_checked_at:null})],time);
 assert.ok(p.warnings.some(w=>w.includes('catalogue')));assert.deepEqual(base,copy);assert.equal(p.basis,'user_preferences');assert.equal('quality_score' in p.assistants[0],false);
});
test('une attente en file ne contourne pas la date limite explicite au lancement',()=>{
 const planned={...base,start_before:new Date(time+60000).toISOString()};
 assert.equal(plannedStartIssue(planned,time),null);
 assert.match(plannedStartIssue(planned,time+60001),/Aucun appel IA/);
 assert.equal(plannedStartIssue(base,time+7*86400000),null);
 assert.match(plannedStartIssue({...base,start_before:'date-invalide'},time),/dépassée/);
});
