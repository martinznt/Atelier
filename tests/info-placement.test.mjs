import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PLACEMENT,copyNote,GIT_WRITE_ALLOWED} from '../server/info-placement.ts';
import {FIND_KINDS,FIND_ORIGIN} from '../server/find-core.ts';
test('un fait = une seule source de vérité : aucune information n’est déclarée deux fois ni dans deux endroits',()=>{
 const keys=PLACEMENT.map(p=>p.key);assert.equal(new Set(keys).size,keys.length);
 assert.equal(new Set(PLACEMENT.map(p=>p.label)).size,PLACEMENT.length);
 for(const p of PLACEMENT){assert.ok(['git','atelier'].includes(p.home));assert.ok(p.why.length>5);assert.equal(p.copy_in_atelier,p.home==='git','seul ce qui vit dans Git a une copie dans Atelier : '+p.key);}
});
test('la table dit la même chose que la recherche : chaque type indexé a l’origine annoncée',()=>{
 for(const p of PLACEMENT)if(p.find_kind){assert.ok(FIND_KINDS.includes(p.find_kind),p.find_kind);assert.equal(FIND_ORIGIN[p.find_kind],p.home,p.key);}
 for(const k of FIND_KINDS)assert.ok(['atelier','git'].includes(FIND_ORIGIN[k]),'origine manquante : '+k);
 assert.deepEqual(FIND_KINDS.filter(k=>FIND_ORIGIN[k]==='git'),['gitdoc']);
});
test('l’écriture dans Git est interdite ; toute copie dit d’où, quel commit, quelle date',()=>{
 assert.equal(GIT_WRITE_ALLOWED,false);
 const n=copyNote({repo:'martinznt/Memoire-Projets',commit:'af30cd0e0000',syncedAt:'2026-11-14T08:00:00.000Z',textCopied:true});
 assert.match(n,/^Copie du dépôt martinznt\/Memoire-Projets · commit af30cd0 · lue le 2026-11-14/);assert.doesNotMatch(n,/texte non copié/);
 assert.match(copyNote({repo:'r',commit:null,syncedAt:null,textCopied:false}),/commit \? · lue le \? · titre et chemin seulement/);
});
