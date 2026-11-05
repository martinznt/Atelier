import test from 'node:test';
import assert from 'node:assert/strict';
import {loadChecks} from '../server/github-checks.ts';

test('check-runs lisibles : utilisés tels quels', async()=>{
 const get=async p=>{assert.match(p,/check-runs/);return {data:{check_runs:[{name:'CI',status:'completed',conclusion:'success'}]}};};
 const r=await loadChecks(get,'/repos/a/b','abc');
 assert.equal(r.source,'check_runs');assert.equal(r.error,null);assert.deepEqual(r.checks,[{name:'CI',status:'completed',conclusion:'success'}]);
});
test('check-runs refusés (403) : repli sur GitHub Actions', async()=>{
 const seen=[];
 const get=async p=>{seen.push(p);if(p.includes('check-runs'))throw new Error('403');return {data:{workflow_runs:[{name:'Tests',status:'completed',conclusion:'failure'},{status:'in_progress'}]}};};
 const r=await loadChecks(get,'/repos/a/b','abc');
 assert.equal(r.source,'actions');assert.equal(r.error,null);
 assert.deepEqual(r.checks,[{name:'Tests',status:'completed',conclusion:'failure'},{name:'Workflow',status:'in_progress',conclusion:null}]);
 assert.match(seen[1],/actions\/runs\?head_sha=abc/);
});
test('les deux refusés : liste vide et erreur d’origine conservée', async()=>{
 const e1=new Error('403 checks');
 const get=async p=>{throw p.includes('check-runs')?e1:new Error('403 actions');};
 const r=await loadChecks(get,'/repos/a/b','abc');
 assert.deepEqual(r.checks,[]);assert.equal(r.error,e1);
});
