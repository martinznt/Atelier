import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDiagnostic,categorize} from '../server/review-diagnostics.ts';
import {ProviderError} from '../server/connectors/http.ts';

test('403 GitHub sur les checks : permission, reprise refusée tant que le droit manque',()=>{
 const d=buildDiagnostic({stage:'github_checks',lastOk:'github_files',error:new ProviderError(403,'http'),provider:'github'});
 assert.equal(d.category,'permission');assert.equal(d.retry_allowed,false);assert.equal(d.ai_started,false);
 assert.match(d.message,/Aucun appel IA/);assert.match(d.message,/Checks/);
});
test('415 : catégorie format et code HTTP conservé',()=>{
 assert.deepEqual(categorize(new ProviderError(415,'http')),{category:'format',code:'http_415',http_status:415});
});
test('délai pendant l’appel IA : résultat inconnu, jamais de reprise automatique',()=>{
 const d=buildDiagnostic({stage:'ai_call',lastOk:'github_checks',error:new ProviderError(504,'timeout'),provider:'mistral',aiStarted:true});
 assert.equal(d.ai_result,'unknown');assert.equal(d.retry_allowed,false);assert.match(d.message,/résultat est inconnu/);
});
test('erreur HTTP 503 du fournisseur IA : aucune génération reçue, reprise manuelle permise',()=>{
 const d=buildDiagnostic({stage:'ai_call',lastOk:'github_checks',error:new ProviderError(503,'http'),provider:'mistral',aiStarted:true});
 assert.equal(d.ai_result,'none');assert.equal(d.retry_allowed,true);
});
test('429 : pas de reprise, quota à vérifier',()=>{
 assert.equal(buildDiagnostic({stage:'ai_call',lastOk:null,error:new ProviderError(429,'http'),aiStarted:true}).retry_allowed,false);
});
test('le diagnostic ne contient ni secret ni message brut',()=>{
 const d=buildDiagnostic({stage:'github_pr',lastOk:'config',error:new Error('Bearer ghp_SECRET https://x')});
 assert.doesNotMatch(JSON.stringify(d),/ghp_SECRET|Bearer/);assert.equal(d.category,'unknown');
});
test('plafond de 3 tentatives',()=>{
 assert.equal(buildDiagnostic({stage:'github_pr',lastOk:null,error:new ProviderError(502,'http'),attempts:3}).retry_allowed,false);
});
