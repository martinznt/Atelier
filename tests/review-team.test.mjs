import test from 'node:test';
import assert from 'node:assert/strict';
import {activeReviewConnections,recommendedReviewTeam,reviewHandoff} from '../server/review-team.mjs';
const connection=(id,provider,model,overrides={})=>({
 id,provider,models:[model],scopes:['chat'],api_consent:1,status:'connected',label:provider+' '+id,...overrides
});
test('selects only connected, allowed, not rate-limited API connections',()=>{
 const list=[
  connection('a','mistral','ministral-small'),
  connection('b','openai','gpt-6-mini',{quota:{status:'rate_limited'}}),
  connection('c','anthropic','claude-haiku',{api_consent:0}),
  connection('d','gemini','gemini-flash',{status:'expired'}),
  connection('e','mistral','embed-mistral'),
  connection('f','github','main')
 ];
 const result=activeReviewConnections(list);
 assert.deepEqual(result.map(c=>c.id),['a']);
});
test('prefers a known smaller-name hint without asserting a free tier',()=>{
 const c=connection('a','mistral','zz-large',{models:['zz-large','mini-review']});
 const r=recommendedReviewTeam([c]);
 assert.equal(r.primary.model,'mini-review');
 assert.equal(r.secondary,null);
 assert.match(r.warning,/limites gratuites/);
});
test('selects different provider for independent review when available',()=>{
 const c1=connection('a','mistral','ministral-3b'),c2=connection('b','mistral','ministral-small'),c3=connection('c','openai','gpt-6-mini');
 const r=recommendedReviewTeam([c1,c2,c3]);
 assert.equal(r.primary.connection_id,'a');
 assert.equal(r.secondary.connection_id,'c');
});
test('expired connections are not recommended',()=>{
 const c=connection('a','mistral','ministral-3b',{expires_at:'2000-01-01T00:00:00Z'});
 assert.equal(recommendedReviewTeam([c]).ready,0);
});
test('handoff gives Codex a prioritized actionable report without claiming bugs are proven',()=>{
 const report=reviewHandoff({repo:'martinznt/Livre-de-recettes',pr_number:58,head_sha:'f'.repeat(40),risk:'functional',
 checks:[{name:'Playwright',conclusion:'failure'},{name:'TS',conclusion:'success'}],
 reviewers:[
  {model:'Mistral',review:{findings:[{severity:'P2',file:'src/display.ts',reason:'Vérifier le focus',reproduction:'Ouvrir sur mobile'},{severity:'P0',file:'src/save.ts',reason:'Écriture incertaine',reproduction:'Retenter le commit'}]}},
  {model:'autre modèle',review:{findings:[{severity:'P0',file:'src/save.ts',reason:'Écriture incertaine',reproduction:'Retenter le commit'}]}}
 ]});
 assert.match(report,/Playwright \(failure\)/);
 assert.equal((report.match(/Écriture incertaine/g)||[]).length,1);
 assert.ok(report.indexOf('[P0]')<report.indexOf('[P2]'));
 assert.match(report,/confirmer les anomalies par un test/i);
});
