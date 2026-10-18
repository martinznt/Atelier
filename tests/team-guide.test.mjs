import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyTeamMethod,sameAssignments,teamIssue,connectionIssue,appendReflection,relayMessage} from '../web/team-guide.ts';
const connection=id=>({id,label:`Mon compte ${id}`,provider:'anthropic',status:'connected',models:['model'],scopes:['chat'],api_consent:1});
const team={selected:['a','b'],models:{a:'model',b:'model'},roles:{a:'Analyser le SQL de ce projet',b:'Vérifier les permissions'},mode:'review',rounds:1,consent:true};
test('deux comptes du même fournisseur peuvent collaborer avec des rôles distincts',()=>{assert.equal(teamIssue(team,[connection('a'),connection('b')]),null);});
test('changer de méthode conserve les missions personnalisées et ne donne pas le consentement',()=>{const next=applyTeamMethod({...team,consent:false},'collaborate');assert.deepEqual(next.roles,team.roles);assert.equal(next.consent,false);});
test('les autorisations, le modèle retiré et une période d’attente connue empêchent l’envoi immédiat',()=>{assert.ok(connectionIssue({...connection('a'),api_consent:0},'model'));assert.ok(connectionIssue(connection('a'),'retired'));assert.ok(connectionIssue({...connection('a'),quota:{status:'rate_limited',retry_at:'2026-10-25T00:00:00Z'}},'model',Date.parse('2026-10-18')));});
test('une méthode collective exige deux comptes distincts et le partage explicite',()=>{assert.ok(teamIssue({...team,selected:['a']},[connection('a')]));assert.ok(teamIssue({...team,selected:['a','a']},[connection('a')]));assert.ok(teamIssue({...team,consent:false},[connection('a'),connection('b')]));});
test('les aides ajoutent une consigne éditable et le relais préserve un brouillon existant',()=>{assert.match(appendReflection('Mon objectif','verify'),/^Mon objectif/);assert.match(relayMessage('Objectif précédent','Précision nouvelle'),/^Précision nouvelle/);assert.throws(()=>appendReflection('a'.repeat(12000),'verify'),/trop long/);assert.throws(()=>relayMessage('a'.repeat(12000),'brouillon'),/dépasse/);});
test('autoriser le partage conserve la proposition, changer un rôle ou modèle l’invalide',()=>{
 assert.equal(sameAssignments(team,{...team,consent:false}),true);
 assert.equal(sameAssignments(team,{...team,rounds:2}),true);
 for(const change of [{selected:['b','a']},{roles:{...team.roles,a:'Autre mission'}},{models:{...team.models,a:'nouveau-modele'}},{mode:'compare'}])assert.equal(sameAssignments(team,{...team,...change}),false);
});
