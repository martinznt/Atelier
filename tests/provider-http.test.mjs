import test from 'node:test';
import assert from 'node:assert/strict';
import {request,ProviderError} from '../server/connectors/http.ts';

async function withMock(handler,task){
 const previous=globalThis.fetch;
 globalThis.fetch=handler;
 try{await task();}
 finally{globalThis.fetch=previous;}
}
test('Cloudflare: les appels GitHub utilisent manual et non redirect:error',async()=>{
 let calls=0;
 await withMock(async(url,opts)=>{
  calls++;
  assert.equal(url,'https://api.github.com/user');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.headers.get('Authorization'),'Bearer jeton-factice');
  assert.equal(opts.headers.get('User-Agent'),'Atelier/0.1');
  return Response.json({login:'test'});
 },async()=>{
  const response=await request('github','jeton-factice','/user');
  assert.equal(response.status,200);
 });
 assert.equal(calls,1);
});
test('Cloudflare: une redirection ne reçoit jamais le jeton',async()=>{
 let calls=0;
 await withMock(async(url,opts)=>{
  calls++;
  assert.equal(url,'https://api.github.com/user');
  assert.equal(opts.redirect,'manual');
  return Response.redirect('https://autre-domaine.example/test',302);
 },async()=>{
  await assert.rejects(()=>request('github','secret-ne-pas-suivre','/user'),e=>{
   assert.ok(e instanceof ProviderError);
   assert.equal(e.code,'redirect');
   assert.equal(e.status,302);
   assert.match(e.message,/ne la suit pas/);
   assert.doesNotMatch(e.message,/secret-ne-pas-suivre/);
   return true;
  });
 });
 assert.equal(calls,1);
});
test('Codes 401 et 429 : messages précis, jeton jamais affiché',async()=>{
 for(const status of [401,429]){
  await withMock(async()=>new Response('{}',{status,headers:status===429?{'retry-after':'60'}:{}}),async()=>{
   await assert.rejects(()=>request('github','secret-caché','/user'),error=>{
    assert.equal(error.status,status);
    assert.equal(error.code,'http');
    assert.doesNotMatch(error.message,/secret-caché/);
    if(status===429)assert.equal(error.retryAfter,'60');
    return true;
   });
  });
 }
});
test('Échec de liaison réseau : erreur classée sans fuite du jeton',async()=>{
 await withMock(async()=>{throw new TypeError('network connection failed with a private bearer')},async()=>{
  await assert.rejects(()=>request('github','secret-caché','/user'),error=>{
   assert.equal(error.status,503);
   assert.equal(error.code,'network');
   assert.doesNotMatch(error.message,/secret-caché|private bearer/);
   return true;
  });
 });
});
test('Délai dépassé : erreur distincte du réseau générique',async()=>{
 await withMock(async()=>{const error=new Error('aborted');error.name='TimeoutError';throw error},async()=>{
  await assert.rejects(()=>request('github','secret-caché','/user'),error=>{
   assert.equal(error.status,504);
   assert.equal(error.code,'timeout');
   assert.match(error.message,/délai/);
   return true;
  });
 });
});
test('Les autres fournisseurs utilisent également redirect:manual',async()=>{
 for(const provider of ['mistral','openai','anthropic','gemini']){
  await withMock(async(_url,opts)=>{
   assert.equal(opts.redirect,'manual');
   return Response.json({ok:true});
  },async()=>{assert.equal((await request(provider,'jeton-factice','/v1/models')).status,200);});
 }
});
