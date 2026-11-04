import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listModels} from '../server/connectors/model-list.ts';
import {generate} from '../server/connectors/ai.ts';
import {recommendedReviewTeam} from '../server/review-team.mjs';
// Fixtures locales : ils valident la logique d'Atelier, pas un compte ni un quota Groq réels.
const sse=(...chunks)=>new Response(chunks.map(c=>'data: '+JSON.stringify(c)+'\n\n').join('')+'data: [DONE]\n\n',{status:200,headers:{'x-ratelimit-remaining-requests':'13999','x-ratelimit-limit-tokens':'6000'}});
async function collect(fetcher,secret='gsk_FIXTURE'){
 const original=globalThis.fetch;globalThis.fetch=fetcher;const out=[];
 try{for await(const d of generate('groq',secret,'openai/gpt-oss-120b',[{role:'user',content:'x'}],100,new AbortController().signal))out.push(d);}
 finally{globalThis.fetch=original;}
 return out;
}
test('Groq : destination officielle, jeton en Authorization, aucun jeton dans le corps',async()=>{
 let seen;
 const out=await collect(async(url,init)=>{seen={url,init};return sse({choices:[{delta:{content:'ok'}}],model:'openai/gpt-oss-120b'},{choices:[{delta:{},finish_reason:'stop'}],x_groq:{usage:{prompt_tokens:12,completion_tokens:3}}});});
 assert.equal(seen.url,'https://api.groq.com/openai/v1/chat/completions');
 assert.equal(new Headers(seen.init.headers).get('authorization'),'Bearer gsk_FIXTURE');
 assert.doesNotMatch(String(seen.init.body),/gsk_FIXTURE/);
 assert.equal(seen.init.redirect,'manual');
 assert.equal(out.map(d=>d.text||'').join(''),'ok');
 assert.deepEqual(out.find(d=>d.input),{input:12,output:3});
 assert.equal(out[0].quota.values['x-ratelimit-remaining-requests'],'13999');
});
test('Groq : réponse coupée par la longueur = erreur, jamais un succès partiel silencieux',async()=>{
 await assert.rejects(()=>collect(async()=>sse({choices:[{delta:{content:'a'},finish_reason:'length'}]})),e=>e.code==='output_limit');
});
test('Groq : flux interrompu sans fin déclarée = erreur',async()=>{
 await assert.rejects(()=>collect(async()=>sse({choices:[{delta:{content:'a'}}]})),e=>e.code==='interrupted_stream');
});
test('Groq : 429 conserve Retry-After pour l’arrêt sur quota',async()=>{
 await assert.rejects(()=>collect(async()=>new Response('{}',{status:429,headers:{'retry-after':'42'}})),e=>e.status===429&&e.retryAfter==='42');
});
test('Groq : catalogue réellement listé, chemin compatible OpenAI',async()=>{
 const paths=[];
 const r=await listModels('groq',async p=>{paths.push(p);return {data:{data:[{id:'openai/gpt-oss-120b'},{id:'whisper-large-v3'}]},quota:{}};});
 assert.deepEqual(paths,['/openai/v1/models']);assert.deepEqual(r.models,['openai/gpt-oss-120b','whisper-large-v3']);
});
test('Groq : proposé seulement si connecté et consenti ; modèles audio écartés',()=>{
 const base={provider:'groq',status:'connected',api_consent:1,scopes:['chat'],label:'g'};
 assert.equal(recommendedReviewTeam([{...base,id:'1',models:['whisper-large-v3']}]).primary,null);
 const t=recommendedReviewTeam([{...base,id:'1',models:['whisper-large-v3','openai/gpt-oss-120b']}]);
 assert.deepEqual(t.primary,{connection_id:'1',model:'openai/gpt-oss-120b'});
 assert.equal(recommendedReviewTeam([{...base,id:'2',models:['m'],api_consent:0}]).primary,null);
});
