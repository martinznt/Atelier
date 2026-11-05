import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewEffort,supportsReasoningEffort,outputBudget} from '../server/review-effort.ts';
import {generate} from '../server/connectors/ai.ts';
const gpt={provider:'groq',model:'openai/gpt-oss-120b'};
test('le réglage n’est proposé que pour les modèles documentés (Groq GPT-OSS)',()=>{
 assert.equal(supportsReasoningEffort('groq','openai/gpt-oss-120b'),true);
 assert.equal(supportsReasoningEffort('groq','openai/gpt-oss-20b'),true);
 for(const [p,m] of [['groq','llama-3.3-70b'],['mistral','mistral-small'],['gemini','gemini-x'],['openai','gpt-x'],['anthropic','claude-x'],['groq','openai/gpt-oss-safeguard']])
  assert.equal(supportsReasoningEffort(p,m),false);
 const c=reviewEffort({mode:'approfondi',role:'security',risk:'critical',provider:'mistral',model:'mistral-small'});
 assert.equal(c.effort,null);assert.match(c.reason,/valeur par défaut/);
});
test('économique : toujours légère',()=>{
 for(const risk of ['simple','functional','critical'])assert.equal(reviewEffort({mode:'economique',role:'correctness',risk,...gpt}).effort,'low');
});
test('équilibré : suit le risque, élevée seulement pour la sécurité d’un changement sensible',()=>{
 const e=(role,risk)=>reviewEffort({mode:'equilibre',role,risk,...gpt}).effort;
 assert.equal(e('correctness','simple'),'low');assert.equal(e('correctness','functional'),'medium');
 assert.equal(e('correctness','critical'),'medium');assert.equal(e('security','critical'),'high');assert.equal(e('security','functional'),'medium');
});
test('approfondi : un cran de plus que le besoin, plafonné',()=>{
 const e=risk=>reviewEffort({mode:'approfondi',role:'correctness',risk,...gpt}).effort;
 assert.equal(e('simple'),'medium');assert.equal(e('functional'),'high');assert.equal(e('critical'),'high');
});
test('le budget de sortie grandit avec le niveau (la réflexion fait partie des jetons de sortie)',()=>{
 assert.ok(outputBudget.low<outputBudget.medium&&outputBudget.medium<outputBudget.high);
 assert.equal(reviewEffort({mode:'approfondi',role:'security',risk:'critical',...gpt}).maxTokens,outputBudget.high);
});
async function body(provider,model,options){
 let sent;const original=globalThis.fetch;
 globalThis.fetch=async(_,init)=>{sent=JSON.parse(init.body);return new Response('data: '+JSON.stringify({choices:[{delta:{content:'ok'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n',{status:200});};
 try{for await(const _ of generate(provider,'k_FIXTURE',model,[{role:'user',content:'x'}],100,new AbortController().signal,options));}finally{globalThis.fetch=original;}
 return sent;
}
test('Groq : reasoning_effort envoyé seulement quand il est demandé ; jamais pour un autre fournisseur',async()=>{
 assert.equal((await body('groq','openai/gpt-oss-120b',{reasoningEffort:'high'})).reasoning_effort,'high');
 assert.equal('reasoning_effort' in await body('groq','openai/gpt-oss-120b',{}),false);
 assert.equal('reasoning_effort' in await body('mistral','mistral-small',{reasoningEffort:'high'}),false);
});
