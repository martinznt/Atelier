import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSessionScope} from '../web/session.ts';
import {retainOfflineFile} from '../web/offline-file.ts';

const blob=new Blob(['document privé A']);
const sha256=Buffer.from(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex');
const file={id:'file-a',current_version:2,size:blob.size,sha256};
function setup(){
 const scope=createSessionScope();scope.bind('a');
 // Deliberate unit double: vault encryption is covered by vault.test.mjs.
 const records=new Map(),cache={user:'a',epoch:1,unlocked:true,
  async putFile(id,value){records.set(id,value);},async getFile(id){return records.get(id)||null;}};
 return {scope,cache,records};
}
function gate(){let release;const promise=new Promise(resolve=>release=resolve);return {promise,release};}

test('conserve exactement la version demandée et relit son empreinte après écriture',async()=>{
 const deps=setup();let requested;
 await retainOfflineFile(file,{...deps,load:async path=>{requested=path;return blob;}});
 assert.equal(requested,'/files/file-a/download?version=2');
 assert.equal(await deps.records.get('file-a:v2').text(),'document privé A');
});

test('un changement A vers B pendant le téléchargement n’écrit aucune copie dans B',async()=>{
 const deps=setup(),download=gate();
 const saving=retainOfflineFile(file,{...deps,load:()=>download.promise});
 deps.scope.bind('b');deps.cache.user='b';deps.cache.epoch++;
 download.release(blob);
 await assert.rejects(saving,/compte a changé/);assert.equal(deps.records.size,0);
});

test('un verrouillage pendant le calcul d’empreinte interdit toute écriture ultérieure',async()=>{
 const deps=setup(),reading=gate(),entered=gate();
 const delayed={size:blob.size,arrayBuffer(){entered.release();return reading.promise;}};
 const saving=retainOfflineFile(file,{...deps,load:async()=>delayed});
 await entered.promise;deps.cache.epoch++;deps.cache.unlocked=false;
 reading.release(await blob.arrayBuffer());
 await assert.rejects(saving,/coffre a été verrouillé/);assert.equal(deps.records.size,0);
});

test('une empreinte distante incorrecte ne crée aucune copie locale',async()=>{
 const deps=setup();
 await assert.rejects(retainOfflineFile({...file,sha256:'0'.repeat(64)},{...deps,load:async()=>blob}),/intégrité/);
 assert.equal(deps.records.size,0);
});

test('la copie relue est vérifiée par empreinte même si sa taille est correcte',async()=>{
 const deps=setup();deps.cache.getFile=async()=>new Blob([new Uint8Array(blob.size)]);
 await assert.rejects(retainOfflineFile(file,{...deps,load:async()=>blob}),/endommagée/);
});
