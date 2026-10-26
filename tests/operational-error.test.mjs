import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalFailure} from '../server/operational-error.ts';

test('une MASTER_KEY absente est signalée sans divulguer sa valeur',()=>{
 const error=operationalFailure(new Error('MASTER_KEY manquante ou invalide'));
 assert.deepEqual([error.status,error.code],[503,'MISSING_MASTER_KEY']);
 assert.match(error.message,/MASTER_KEY/);
});
test('migrations D1 manquantes classées sans exposer SQL ou valeurs privées',()=>{
 const error=operationalFailure(new Error('D1_ERROR: no such table: connections SELECT * WHERE secret=private-value'));
 assert.equal(error.status,503);
 assert.equal(error.code,'D1_MIGRATION_REQUIRED');
 assert.doesNotMatch(JSON.stringify(error),/private-value|SELECT \*/);
});
test('colonne ajoutée dans migration ultérieure est reconnue',()=>{
 const error=operationalFailure(new Error('D1_ERROR: table review_configs has no column named daily_limit'));
 assert.equal(error.code,'D1_MIGRATION_REQUIRED');
});
test('une erreur inconnue n’expose ni secret ni contenu',()=>{
 const error=operationalFailure(new Error('secret super-prive X'));
 assert.equal(error.code,'UNEXPECTED_SERVER_ERROR');
 assert.doesNotMatch(JSON.stringify(error),/super-prive/);
 assert.match(error.message,/partiellement/);
});
