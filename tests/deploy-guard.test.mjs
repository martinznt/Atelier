import test from 'node:test';import assert from 'node:assert/strict';
import {assertProductionBranch,deploymentBranch} from '../scripts/deploy-guard.mjs';
test('une branche de test ne peut ni migrer ni publier la production',()=>{
 for(const branch of [null,'','feat/stockage-gratuit-outils','refs/heads/main','preview','abcdef'])assert.throws(()=>assertProductionBranch(branch),/réservées à main/);
 assert.doesNotThrow(()=>assertProductionBranch('main'));
});
test('la branche Workers Builds fait autorité sur une variable GitHub contradictoire',()=>{
 assert.equal(deploymentBranch('/nonexistent',{WORKERS_CI_BRANCH:'feature',GITHUB_REF_NAME:'main'}),'feature');
 assert.equal(deploymentBranch('/nonexistent',{GITHUB_REF_NAME:'main'}),'main');
 assert.equal(deploymentBranch('/nonexistent',{}),null);
});
