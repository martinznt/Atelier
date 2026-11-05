import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasMark} from '../server/pr-mark.ts';
test('titre marqué : accents, casse, crochets et espaces ignorés',()=>{
 assert.equal(hasMark('EN VÉRIFICATION — Version 4.6.0 : Mes réalisations','EN VÉRIFICATION'),true);
 assert.equal(hasMark('en verification — x','EN VÉRIFICATION'),true);
 assert.equal(hasMark('  [EN VÉRIFICATION] x','EN VÉRIFICATION'),true);
 assert.equal(hasMark('En   vérification : x','EN VÉRIFICATION'),true);
});
test('titre non marqué ou marque ailleurs dans le titre : refusé',()=>{
 assert.equal(hasMark('A FUSIONNER — Version 4.5.0','EN VÉRIFICATION'),false);
 assert.equal(hasMark('Version 4.5.0 EN VÉRIFICATION','EN VÉRIFICATION'),false);
 assert.equal(hasMark('',"EN VÉRIFICATION"),false);
 assert.equal(hasMark(undefined,'EN VÉRIFICATION'),false);
});
test('aucune marque demandée : tout passe',()=>{
 assert.equal(hasMark('n\'importe quoi',null),true);
 assert.equal(hasMark('x','   '),true);
});
