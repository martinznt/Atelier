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
test('handoff gives the next assistant a prioritized actionable report without claiming bugs are proven',()=>{
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
test('le dossier de transmission contient lien, SHA, IA, tests non lus, concordance et questions',()=>{
 const text=reviewHandoff({repo:'martinznt/Livre-de-recettes',pr_number:105,head_sha:'a'.repeat(40),risk:'functional',
  checks:[],checks_unavailable:'Échec à l’étape « lecture des tests GitHub Actions » (HTTP 403).',
  reviewers:[
   {provider:'mistral',model:'mistral-small',role:'correctness',coverage:{included:3,excluded:1,redacted:0,complete:false},review:{findings:[{severity:'P1',file:'a.ts',reason:'Cas limite',reproduction:'Test X'}]}},
   {provider:'groq',model:'openai/gpt-oss-120b',role:'security',review:{findings:[{severity:'P1',file:'a.ts',reason:'cas limite',reproduction:'Test X'}]}},
   {provider:'gemini',role:'security',error:'Indisponible'}
  ]});
 assert.match(text,/https:\/\/github\.com\/martinznt\/Livre-de-recettes\/pull\/105/);
 assert.match(text,/a{40}/);
 assert.match(text,/Tests GitHub NON lus/);
 assert.match(text,/mistral · mistral-small/);assert.match(text,/groq · openai\/gpt-oss-120b/);
 assert.match(text,/concordance de plusieurs IA, non une preuve/);
 assert.equal((text.match(/Cas limite/gi)||[]).length,1);
 assert.match(text,/diff incomplet/);assert.match(text,/sans résultat : gemini/);
 assert.match(text,/Questions pour l’assistant/);
 assert.match(text,/ne prouve pas que le code est correct/);
});
import {notVerified,disagreements} from '../server/review-team.mjs';
test('le dossier indique couverture, ce qui n’a pas été vérifié et les désaccords entre IA',()=>{
 const result={repo:'o/r',pr_number:5,head_sha:'a'.repeat(40),risk:'functional',checks:[],checks_unavailable:'HTTP 403 sur les checks.',files_partial:false,
  reviewers:[
   {provider:'mistral',model:'m1',role:'correctness',coverage:{complete:false,percent:42,included:5,excluded:3,redacted:1,files:[{name:'docs/a.md',state:'excluded',reason:'au-delà du budget de lecture'},{name:'.env',state:'excluded',reason:'fichier sensible : jamais transmis'}]},review:{findings:[{severity:'P1',file:'src/a.ts',location:'save()',reason:'Perte possible',impact:'Recette perdue',reproduction:'Test X',fix:'Verrouiller'}]}},
   {provider:'groq',model:'g1',role:'security',review:{findings:[]}},
   {provider:'gemini',role:'security',error:'x',partial:{complete:false,text:'début'}}]};
 const text=reviewHandoff(result);
 assert.match(text,/Couverture du diff : 42 %/);assert.match(text,/Conséquence : Recette perdue/);assert.match(text,/Correction suggérée : Verrouiller/);
 assert.match(text,/save\(\)/);assert.match(text,/Désaccords entre les IA/);assert.match(text,/non signalé par groq/);
 assert.match(text,/Ce qui n’a PAS été vérifié/);assert.match(text,/Aucun test n’a été exécuté par Atelier/);
 assert.match(text,/Diff incomplet : 42 %.*docs\/a\.md/);assert.doesNotMatch(text,/\.env/);
 assert.match(text,/Tests GitHub non lus/);assert.match(text,/réponse interrompue/);
 assert.equal(disagreements(result).length,1);assert.ok(notVerified(result).length>=5);
});

test('les modèles non textuels ne sont jamais proposés pour la revue',async()=>{
 const {pickReviewModel}=await import('../server/review-team.mjs');
 const assert=(await import('node:assert/strict')).default;
 assert.equal(pickReviewModel({models:['gemini-2.5-computer-use-preview-10-2025','gemini-2.5-flash-image','gemini-live-2.5-flash','veo-3.0','gemini-2.5-flash']}),'gemini-2.5-flash');
 assert.equal(pickReviewModel({models:['gemini-2.5-computer-use-preview-10-2025']}),undefined);
});
