import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVault} from '../web/vault-store.ts';

// Unit-level storage double, not a browser or an IndexedDB implementation.
// Encryption, KDF, account epochs and production vault methods run unchanged.
// Delays represent requests already in flight when a user changes accounts.
function memoryDatabase(seed){
 const stores=seed?structuredClone(seed):{vaults:new Map(),records:new Map()};
 const waits=[];
 async function pause(method,store,key){
  const index=waits.findIndex(w=>w.method===method&&w.store===store&&(w.key===undefined||w.key===key));
  if(index<0)return;
  const wait=waits.splice(index,1)[0];wait.enter();await wait.waiting;
 }
 return {
  stores,
  hold(method,store,key){
   let enter,release;const entered=new Promise(r=>enter=r),waiting=new Promise(r=>release=r);
   waits.push({method,store,key,enter,waiting});return {entered,release};
  },
  async get(store,key){const value=structuredClone(stores[store].get(key));await pause('get',store,key);return value;},
  async add(store,value){
   const key=value.user;if(stores[store].has(key))throw new DOMException('Already present','ConstraintError');
   stores[store].set(key,structuredClone(value));return key;
  },
  async put(store,value){const key=value.id;stores[store].set(key,structuredClone(value));return key;},
  async getAll(store){return structuredClone([...stores[store].values()]);},
  async getAllKeys(store){await pause('getAllKeys',store);return [...stores[store].keys()];},
  transaction(){
   return {done:Promise.resolve(),objectStore(store){
    return {async delete(key){stores[store].delete(key);},async openCursor(){
     const entries=[...stores[store].entries()];let i=0;
     const next=()=>i<entries.length?{
      value:entries[i][1],
      async delete(){stores[store].delete(entries[i][0]);},
      async continue(){i++;return next();}
     }:null;
     return next();
    }};
   }};
  }
 };
}

const password='une-phrase-locale-pour-les-tests';
const seedDB=memoryDatabase(),seedVault=createVault(Promise.resolve(seedDB));
for(const id of ['a','b']){
 await seedVault.create({id,username:`Compte ${id}`},password);
 await seedVault.put('first',{text:`document confidentiel ${id}`});
 await seedVault.put('second',{text:`autre document confidentiel ${id}`});
 await seedVault.putFile('report',new Blob([`fichier ${id}`]));
}
async function fixture(){
 const db=memoryDatabase(seedDB.stores),vault=createVault(Promise.resolve(db));
 await vault.unlock('a',password);return {db,vault};
}

test('chaque compte lit uniquement ses données et fichiers chiffrés, le verrou refuse leur lecture',async()=>{
 const {vault}=await fixture();
 assert.equal((await vault.get('first')).text,'document confidentiel a');
 assert.equal(await (await vault.getFile('report')).text(),'fichier a');
 await vault.unlock('b',password);
 assert.equal((await vault.get('first')).text,'document confidentiel b');
 assert.equal(await (await vault.getFile('report')).text(),'fichier b');
 assert.deepEqual((await vault.search('confidentiel')).map(r=>r.value.text),['document confidentiel b','autre document confidentiel b']);
 vault.lock();assert.equal(await vault.get('first'),null);assert.equal(await vault.getFile('report'),null);
 await assert.rejects(vault.unlock('a','mot-de-passe-incorrect'),/incorrect/);
 assert.equal(vault.user,null);
});

test('un déverrouillage déjà en cours ne réactive pas le coffre après un verrouillage',async()=>{
 const {db,vault}=await fixture(),hold=db.hold('get','vaults','a');
 const unlocking=vault.unlock('a',password);await hold.entered;
 const before=vault.epoch;vault.lock();assert(vault.epoch>before);hold.release();
 await assert.rejects(unlocking,/verrouillé/);assert.equal(vault.user,null);assert.equal(vault.unlocked,false);
});

test('une création interrompue ne réactive pas le coffre et ne conserve pas une nouvelle clé',async()=>{
 const {db,vault}=await fixture();
 const creating=vault.create({id:'c',username:'Compte c'},password);
 await Promise.resolve();vault.lock();
 await assert.rejects(creating,/verrouillé/);assert.equal(vault.unlocked,false);assert(!db.stores.vaults.has('c'));
});

test('deux déverrouillages concurrents conservent seulement le compte choisi en dernier',async()=>{
 const {db,vault}=await fixture(),hold=db.hold('get','vaults','a');
 const stale=vault.unlock('a',password);await hold.entered;
 await vault.unlock('b',password);hold.release();
 await assert.rejects(stale,/compte a changé/);assert.equal(vault.user,'b');
 assert.equal((await vault.get('first')).text,'document confidentiel b');
});

test('une lecture JSON ou fichier en cours est abandonnée au changement de compte',async()=>{
 const {db,vault}=await fixture();
 for(const [id,method] of [['first','get'],['blob:report','getFile']]){
  await vault.unlock('a',password);
  const hold=db.hold('get','records',`a:${id}`),reading=vault[method](id.replace('blob:',''));
  await hold.entered;await vault.unlock('b',password);hold.release();
  assert.equal(await reading,null);
 }
});

test('une recherche abandonne aussi les résultats déjà accumulés pour le compte précédent',async()=>{
 const {db,vault}=await fixture(),hold=db.hold('get','records','a:second');
 const search=vault.search('confidentiel');await hold.entered;
 await vault.unlock('b',password);hold.release();
 assert.deepEqual(await search,[]);
});

test('un téléchargement en cours ne réintroduit pas les données effacées et ne les écrit pas chez un autre compte',async()=>{
 const {db,vault}=await fixture();let release;
 const bytes=new Promise(r=>release=r),saving=vault.putFile('pending',{arrayBuffer:()=>bytes});
 await vault.clear('a');await vault.unlock('b',password);
 release(new TextEncoder().encode('contenu privé a').buffer);
 await assert.rejects(saving,/verrouillé/);
 assert(![...db.stores.records.keys()].some(k=>k.startsWith('a:')));
 assert.equal(await vault.getFile('pending'),null);
});

test('une nouvelle création ne peut pas écraser le mot de passe et les copies existantes',async()=>{
 const {vault}=await fixture();
 await assert.rejects(vault.create({id:'a',username:'Compte a'},'un-autre-mot-de-passe'),/existe déjà/);
 await vault.unlock('a',password);
 assert.equal((await vault.get('first')).text,'document confidentiel a');
 assert.equal(await (await vault.getFile('report')).text(),'fichier a');
});

test('effacer A protège B et un déverrouillage demandé pendant l’effacement attend sa fin',async()=>{
 const {db,vault}=await fixture();
 const clearing=vault.clear('a'),unlocking=vault.unlock('a',password);
 await clearing;await assert.rejects(unlocking,/Aucune copie locale/);
 assert.equal(vault.user,null);assert(!db.stores.vaults.has('a'));assert(db.stores.vaults.has('b'));
 await vault.unlock('b',password);assert.equal(await (await vault.getFile('report')).text(),'fichier b');
});

test('un effacement sans propriétaire après verrouillage ne supprime pas les autres comptes',async()=>{
 const {db,vault}=await fixture();vault.lock();await vault.clear();
 assert.equal(db.stores.vaults.size,2);assert.equal(db.stores.records.size,6);
});

test('une écriture chiffrée commencée avant le verrouillage ne persiste pas après celui-ci',async()=>{
 const {db,vault}=await fixture(),writing=vault.put('pending',{text:'privé'});
 vault.lock();await writing;assert(!db.stores.records.has('a:pending'));
});
