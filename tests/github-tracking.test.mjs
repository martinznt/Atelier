import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ciSummary,prNextAction,trackRepository,links} from '../server/github-tracking.ts';
const ok={name:'a',status:'completed',conclusion:'success'};
test('états CI : jamais de réussite sans information',()=>{
 assert.equal(ciSummary(null).state,'unknown');assert.equal(ciSummary([]).state,'unknown');
 assert.equal(ciSummary([ok]).state,'success');
 assert.equal(ciSummary([ok,{name:'b',status:'completed',conclusion:'failure'}]).state,'failure');
 assert.equal(ciSummary([ok,{name:'b',status:'in_progress',conclusion:null}]).state,'pending');
 assert.equal(ciSummary([{name:'c',status:'completed',conclusion:null}]).state,'unknown');
});
test('prochaine action d’une PR',()=>{
 assert.equal(prNextAction({draft:false,ci:'failure',review:null}).code,'fix');
 assert.equal(prNextAction({draft:false,ci:'pending',review:null}).code,'wait');
 assert.equal(prNextAction({draft:true,ci:'success',review:null}).code,'draft');
 assert.equal(prNextAction({draft:false,ci:'unknown',review:null}).code,'unknown');
 assert.equal(prNextAction({draft:false,ci:'success',review:null}).code,'verify');
 assert.equal(prNextAction({draft:false,ci:'success',review:'completed'}).code,'validate');
});
test('liens exacts',()=>{const l=links('o/r');assert.equal(l.pr(5),'https://github.com/o/r/pull/5');assert.equal(l.branch('feat/x y'),'https://github.com/o/r/tree/feat/x%20y');assert.equal(l.commit('a'.repeat(40)),'https://github.com/o/r/commit/'+'a'.repeat(40));});
test('suivi : tout est lu via le connecteur, les échecs partiels restent « inconnu »',async()=>{
 const sha='a'.repeat(40),calls=[];
 const get=async p=>{calls.push(p);
  if(p==='/repos/o/r')return {data:{default_branch:'trunk'}};
  if(p.includes('/branches/trunk'))return {data:{commit:{sha,commit:{committer:{date:'2026-11-10T10:00:00Z'},message:'Titre\nsuite'}}}};
  if(p.includes('/pulls?'))return {data:[{number:7,title:'PR',draft:false,head:{sha:'b'.repeat(40),ref:'feat/x'},updated_at:'2026-11-10T11:00:00Z'}]};
  if(p.includes(sha+'/check-runs'))return {data:{check_runs:[ok]}};
  throw Object.assign(new Error('403'),{status:403});};
 const r=await trackRepository(get,{full_name:'o/r',branch:'main'},'2026-11-11T00:00:00Z');
 assert.equal(r.available,true);assert.equal(r.default_branch,'trunk');assert.equal(r.head.message,'Titre');assert.equal(r.head_ci.state,'success');
 assert.equal(r.prs[0].ci.state,'unknown');assert.equal(r.prs[0].url,'https://github.com/o/r/pull/7');
});
test('dépôt inaccessible : indisponible, avec la raison',async()=>{
 const r=await trackRepository(async()=>{throw Object.assign(new Error('x'),{status:404});},{full_name:'o/r',branch:'main'},'t');
 assert.equal(r.available,false);assert.match(r.reason,/404/);
});
