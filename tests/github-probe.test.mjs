import test from 'node:test';
import assert from 'node:assert/strict';
import {probeGithubNetwork} from '../server/github-probe.ts';

test('sonde GitHub 200 sans envoyer de jeton',async()=>{
 const result=await probeGithubNetwork(async(url,options)=>{
  assert.equal(url,'https://api.github.com/zen');
  assert.equal(options.redirect,'manual');
  assert.equal(options.headers.Authorization,undefined);
  // Régression HTTP 415 : GitHub n’accepte pas Accept: text/plain sur l’API REST.
  assert.equal(options.headers.Accept,'application/vnd.github+json');
  return new Response('GitHub Zen',{status:200});
 });
 assert.deepEqual([result.reachable,result.outcome,result.http_status],[true,'ok',200]);
});
test('sonde GitHub 403 : le réseau est accessible mais l’appel est limité',async()=>{
 const result=await probeGithubNetwork(async()=>new Response(null,{status:403}));
 assert.equal(result.reachable,true);
 assert.equal(result.outcome,'http');
 assert.match(result.advice,/limite|refuse/);
});
test('sonde GitHub timeout : les erreurs ne divulguent aucune information',async()=>{
 const result=await probeGithubNetwork(async()=>{const error=new Error('SECRET_VALUE');error.name='TimeoutError';throw error;});
 assert.equal(result.reachable,false);
 assert.equal(result.outcome,'timeout');
 assert.doesNotMatch(JSON.stringify(result),/SECRET_VALUE/);
});
test('sonde GitHub réseau : les erreurs ne divulguent aucune information',async()=>{
 const result=await probeGithubNetwork(async()=>{throw Error('SECRET_VALUE');});
 assert.equal(result.reachable,false);
 assert.equal(result.outcome,'network');
 assert.doesNotMatch(JSON.stringify(result),/SECRET_VALUE/);
});
test('sonde GitHub 302 ne suit pas la redirection',async()=>{
 let requests=0;
 const result=await probeGithubNetwork(async()=>{requests++;return Response.redirect('https://untrusted.example',302);});
 assert.equal(result.reachable,true);
 assert.equal(result.outcome,'redirect');
 assert.equal(requests,1);
});
test('sonde GitHub 415 : message explicite sans accuser le jeton',async()=>{
 const result=await probeGithubNetwork(async()=>new Response(null,{status:415}));
 assert.equal(result.http_status,415);
 assert.match(result.advice,/415/);
 assert.match(result.advice,/aucun jeton/);
});
