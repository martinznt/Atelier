import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSubmission,savedSubmission,acknowledgeSubmission,readDraft,writeDraft,clearSentDraft} from '../web/submission.ts';
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
const draft={conversation_id:'thread',message:'Continue',assistants:[{connection_id:'ai',model:'actual-model'}],mode:'individual',rounds:1,max_tokens:1024,memory_ids:['source'],file_ids:[],share_consent:false};
test('un rechargement après réponse perdue conserve la requête et sa clé',()=>{
 const store=storage(),first=prepareSubmission(store,'alice',draft);
 const restored=savedSubmission(store,'alice','thread');assert.deepEqual(restored,first);
 assert.deepEqual(prepareSubmission(store,'alice',structuredClone(draft)),first);
});
test('une modification de message, modèle ou consentement constitue une nouvelle demande explicite',()=>{
 const store=storage(),first=prepareSubmission(store,'alice',draft);
 const changed=prepareSubmission(store,'alice',{...draft,share_consent:true});assert.notEqual(changed.idempotency_key,first.idempotency_key);
 acknowledgeSubmission(store,'alice',first);assert.deepEqual(savedSubmission(store,'alice','thread'),changed);
});
test('les requêtes conservées sont isolées par compte et conversation',()=>{
 const store=storage();prepareSubmission(store,'alice',draft);
 assert.equal(savedSubmission(store,'bob','thread'),null);assert.equal(savedSubmission(store,'alice','another'),null);
});
test('un succès connu libère la clé pour le prochain message volontaire',()=>{
 const store=storage(),first=prepareSubmission(store,'alice',draft);acknowledgeSubmission(store,'alice',first);
 assert.equal(savedSubmission(store,'alice','thread'),null);assert.notEqual(prepareSubmission(store,'alice',draft).idempotency_key,first.idempotency_key);
});
test('un stockage indisponible empêche de préparer un envoi non protégé',()=>{
 assert.throws(()=>prepareSubmission({getItem:()=>null,setItem:()=>{throw new Error('QuotaExceededError');}},'alice',draft),/QuotaExceeded/);
});

test('une réponse tardive après démontage ne vide pas le nouveau brouillon',()=>{
 const store=storage(),sent=writeDraft(store,'alice','thread','Premier message');
 writeDraft(store,'alice','thread','Nouveau brouillon');
 assert.equal(clearSentDraft(store,'alice','thread',sent),false);assert.equal(readDraft(store,'alice','thread').text,'Nouveau brouillon');
});
test('retaper le même texte crée une nouvelle révision protégée',()=>{
 const store=storage(),sent=writeDraft(store,'alice','thread','Même texte');
 writeDraft(store,'alice','thread','Autre idée');writeDraft(store,'alice','thread','Même texte');
 assert.equal(clearSentDraft(store,'alice','thread',sent),false);
});
test('un succès vide seulement sa révision et empêche la résurrection du format ancien',()=>{
 const store=storage();store.setItem('atelier:alice:draft:thread','Ancien brouillon');
 assert.equal(readDraft(store,'alice','thread').text,'Ancien brouillon');
 const sent=writeDraft(store,'alice','thread','Message');assert.equal(clearSentDraft(store,'alice','thread',sent),true);
 assert.equal(readDraft(store,'alice','thread').text,'');
});
