import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planReview,checksAllGreen} from '../server/review-plan.ts';
const green=[{name:'CI',status:'completed',conclusion:'success'}];
const red=[{name:'CI',status:'completed',conclusion:'failure'}];
const src=[{filename:'src/a.ts'}],withTests=[{filename:'src/a.ts'},{filename:'tests/a.test.ts'}],docs=[{filename:'README.md'}];
const base={files:src,checks:green,checksKnown:true,hasSecondary:true};
const roles=p=>p.assigned.map(a=>a.role);
test('économique : changement simple + tests verts = aucune IA, avec la raison',()=>{
 const p=planReview({...base,mode:'economique',risk:'simple',files:docs});
 assert.deepEqual(p.assigned,[]);assert.match(p.skipped[0].reason,/aucune IA sollicitée/);assert.match(p.summary,/aucune IA sollicitée/);
});
test('économique : tests en échec, non lus ou changement non trivial = une seule IA, jamais la deuxième',()=>{
 for(const input of [{checks:red,risk:'simple'},{checks:[],checksKnown:false,risk:'simple'},{checks:green,risk:'critical'}]){
  const p=planReview({...base,mode:'economique',...input});
  assert.deepEqual(roles(p),['correctness']);assert.equal(p.assigned[0].use,'primary');
 }
});
test('économique : tests listés vides ou en cours ne comptent pas comme verts',()=>{
 assert.equal(checksAllGreen([]),false);
 assert.equal(checksAllGreen([{name:'x',status:'in_progress',conclusion:null}]),false);
 assert.equal(checksAllGreen(green),true);
});
test('équilibré : reproduit le comportement antérieur (deuxième IA seulement si non simple)',()=>{
 assert.deepEqual(roles(planReview({...base,mode:'equilibre',risk:'simple'})),['correctness']);
 const p=planReview({...base,mode:'equilibre',risk:'critical'});
 assert.deepEqual(roles(p),['correctness','security']);assert.equal(p.assigned[1].use,'secondary');
 assert.deepEqual(roles(planReview({...base,mode:'equilibre',risk:'critical',hasSecondary:false})),['correctness']);
});
test('approfondi : vérifications spécialisées seulement quand elles ajoutent une couverture',()=>{
 assert.deepEqual(roles(planReview({...base,mode:'approfondi',risk:'functional'})),['correctness','security','tests']);
 assert.deepEqual(roles(planReview({...base,mode:'approfondi',risk:'functional',files:withTests})),['correctness','security']);
 assert.deepEqual(roles(planReview({...base,mode:'approfondi',risk:'simple',files:docs})),['correctness']);
 const p=planReview({...base,mode:'approfondi',risk:'critical',hasSecondary:false});
 assert.equal(p.assigned[1].use,'primary');assert.match(p.assigned[1].reason,/aucune IA indépendante/);
});
test('une IA ayant signalé une limite n’est jamais appelée ni remplacée automatiquement',()=>{
 const p=planReview({...base,mode:'equilibre',risk:'critical',primaryLimited:true});
 assert.deepEqual(roles(p),['security']);
 assert.ok(p.skipped.some(x=>/aucun basculement/.test(x.reason)));
 const q=planReview({...base,mode:'equilibre',risk:'critical',secondaryLimited:true});
 assert.deepEqual(roles(q),['correctness']);assert.ok(q.skipped.some(x=>/n’est pas sollicitée/.test(x.reason)));
});
test('chaque vérification planifiée porte une raison lisible',()=>{
 for(const mode of ['economique','equilibre','approfondi'])for(const risk of ['simple','functional','critical'])
  for(const a of planReview({...base,mode,risk}).assigned)assert.ok(a.reason.length>10);
});
