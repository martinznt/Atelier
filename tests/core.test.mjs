import {test} from 'node:test';import assert from 'node:assert/strict';
import {seal,unseal,digest,randomToken} from '../server/crypto.ts';
test('AES-GCM protège le secret et lie le chiffrement au compte et à la connexion',async()=>{
 const key=Buffer.alloc(32,3).toString('base64');const encrypted=await seal(key,'un-secret-fictif-de-test','a:connexion-a');assert(!encrypted.includes('un-secret'));
 assert.equal(await unseal(key,encrypted,'a:connexion-a'),'un-secret-fictif-de-test');await assert.rejects(()=>unseal(key,encrypted,'b:connexion-a'));
 const parts=encrypted.split('.');const data=Buffer.from(parts[1],'base64');data[2]^=1;await assert.rejects(()=>unseal(key,`${parts[0]}.${data.toString('base64')}`,'a:connexion-a'));
});
test('une clé serveur manquante ne permet pas de conserver un secret en clair',async()=>{await assert.rejects(()=>seal('','secret','a:b'));});
test('SHA-256 correspond au vecteur standard et les jetons sont aléatoires',async()=>{assert.equal(await digest('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');const tokens=new Set(Array.from({length:1000},randomToken));assert.equal(tokens.size,1000);for(const t of tokens)assert.match(t,/^[A-Za-z0-9_-]{43}$/);});
