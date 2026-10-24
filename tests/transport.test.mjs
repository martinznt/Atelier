import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient, ApiError} from '../web/transport.ts';
import {createSessionScope} from '../web/session.ts';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(fetcher, options={}){
 const scope=createSessionScope();scope.bind('alice');
 const entries=new Map(),writes=[];
 const cache={user:'alice',epoch:1,get:async key=>entries.get(key)??null,put:async(key,value)=>{writes.push(value);entries.set(key,value);}};
 return {scope,cache,entries,writes,...createApiClient({scope,cache,fetcher,online:()=>true,...options})};
}
test('une réponse A tardive est refusée après passage au compte B',async()=>{
 const response=deferred(),c=setup(()=>response.promise),pending=c.api('/projects');
 c.scope.bind('bob');c.cache.user='bob';c.cache.epoch++;response.resolve(Response.json({private:'A'}));
 await assert.rejects(pending,/compte a changé/);assert.deepEqual(c.writes,[]);
});
test('une panne A ne renvoie pas le cache de B',async()=>{
 const response=deferred(),c=setup(()=>response.promise),pending=c.api('/projects');
 c.entries.set('api:/projects',{private:'B'});c.scope.bind('bob');c.cache.user='bob';response.reject(new TypeError('network'));
 await assert.rejects(pending,/compte a changé/);
});
test('le repli hors connexion est limité à la copie du compte courant',async()=>{
 const c=setup(()=>assert.fail('aucun appel réseau'),{online:()=>false});c.entries.set('api:/projects',{private:'A'});
 assert.deepEqual(await c.api('/projects'),{private:'A'});c.cache.user='bob';await assert.rejects(c.api('/projects'),/Hors connexion/);
});
test('un coffre déverrouillé hors ligne exige une session vérifiée avant les envois',async()=>{
 let calls=0;const c=setup(async()=>{calls++;return Response.json({ok:true});});c.scope.bind('alice',false);
 await assert.rejects(c.api('/tasks',{method:'POST',body:'{}'}),/Reconnectez-vous/);assert.equal(calls,0);
 await c.api('/auth/me');assert.equal(calls,1);
});
test('une expiration serveur ne se transforme pas en réussite grâce au cache',async()=>{
 let expired=0;const c=setup(async()=>Response.json({error:'Session expirée'},{status:401}),{onExpired:()=>expired++});c.entries.set('api:/projects',{old:true});
 await assert.rejects(c.api('/projects'),error=>error instanceof ApiError&&error.status===401);assert.equal(expired,1);
});
test('la limite de temps annule un envoi sans le rejouer et signale son issue incertaine',async()=>{
 let calls=0;const c=setup((_url,init)=>{calls++;return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));},{timeoutMs:10});
 await assert.rejects(c.api('/tasks',{method:'POST',body:'{}'}),/peut-être été enregistrée/);assert.equal(calls,1);
});
test('les en-têtes explicites sont conservés, les accès privés ne sont jamais mis en cache',async()=>{
 const c=setup(async(_url,init)=>{assert.equal(init.headers.get('X-Test'),'ok');assert.equal(init.credentials,'same-origin');return Response.json({data:'private'});});
 for(const path of ['/auth/me','/connections','/bridge/access','/bridge/oauth/preview'])await c.api(path,{headers:new Headers({'X-Test':'ok'})});
 assert.deepEqual(c.writes,[]);
});
test('le verrouillage pendant une lecture de cache écarte la valeur',async()=>{
 const reading=deferred(),c=setup(()=>assert.fail(),{online:()=>false});c.cache.get=()=>reading.promise;
 const pending=c.api('/projects');c.cache.epoch++;c.cache.user=null;reading.resolve({private:'A'});await assert.rejects(pending,/Hors connexion/);
});
test('un téléchargement A est écarté avant affichage si le compte change',async()=>{
 const data=deferred(),started=deferred(),c=setup(async()=>({ok:true,blob:()=>{started.resolve();return data.promise;}}));
 const pending=c.blob('/files/file/download');await started.promise;c.scope.bind('bob');data.resolve(new Blob(['secret A']));await assert.rejects(pending,/compte a changé/);
});

test('les requêtes privées portent le compte attendu sans remplacer la session serveur',async()=>{
 const c=setup(async(path,init)=>{assert.equal(init.headers.get('X-Atelier-Account'),path==='/api/auth/me'?null:'alice');return Response.json({ok:true});});
 await c.api('/projects');await c.api('/tasks',{method:'POST',body:'{}'});await c.api('/auth/password',{method:'POST',body:'{}'});await c.api('/auth/me');
});

test('une ancienne chaîne asynchrone ne démarre plus de lecture ou modification après verrouillage',async()=>{
 const c=setup(()=>assert.fail('aucun appel privé après verrouillage'));c.scope.invalidate();
 await assert.rejects(c.api('/projects'),/Connectez-vous/);
 await assert.rejects(c.api('/tasks',{method:'POST',body:'{}'}),/Connectez-vous/);
 await assert.rejects(c.api('/auth/password',{method:'POST',body:'{}'}),/Connectez-vous/);
});

test('anciens comptes : connexion et récupération accessibles sans session, ajout email privé',async()=>{
 let calls=0;const scope=createSessionScope();const cache={user:null,epoch:1,get:async()=>null,put:async()=>assert.fail('auth jamais cachée')};
 const client=createApiClient({scope,cache,online:()=>true,fetcher:async()=>{calls++;return Response.json({ok:true});}});
 await client.api('/auth/legacy-login',{method:'POST',body:'{}'});await client.api('/auth/legacy-recover',{method:'POST',body:'{}'});
 assert.equal(calls,2);await assert.rejects(client.api('/auth/email',{method:'POST',body:'{}'}),/Connectez-vous/);assert.equal(calls,2);
});
