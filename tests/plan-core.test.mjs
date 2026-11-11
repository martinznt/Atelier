import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unmetDependencies,wouldCycle,statusAllowed,effectiveStatus,progressOf,pickNextTask,parseIds,isVerifiedDone} from '../server/plan-core.ts';
const t=(id,o={})=>({id,title:'T'+id,status:'todo',depends_on:[],priority:2,position:0,phase_id:null,proof:'',blocking_question:'',...o});
test('une tâche dépendante n’est pas prête tant que son prérequis n’est pas terminé',()=>{
 const a=t('a'),b=t('b',{depends_on:['a'],status:'ready'});
 assert.equal(unmetDependencies(b,[a,b]).length,1);
 assert.equal(effectiveStatus(b,[a,b]),'waiting');
 assert.equal(statusAllowed(b,'in_progress',[a,b]).ok,false);
 const done={...a,status:'done'};
 assert.equal(statusAllowed(b,'in_progress',[done,b]).ok,true);assert.equal(effectiveStatus(b,[done,b]),'ready');
});
test('un prérequis abandonné ou introuvable n’est pas satisfait',()=>{
 const a=t('a',{status:'abandoned'}),b=t('b',{depends_on:['a','zz']});
 assert.equal(unmetDependencies(b,[a,b]).length,2);
});
test('cycles et auto-dépendance refusés',()=>{
 const a=t('a',{depends_on:['b']}),b=t('b');
 assert.equal(wouldCycle('b',['a'],[a,b]),true);
 assert.equal(wouldCycle('a',['a'],[a,b]),true);
 assert.equal(wouldCycle('b',[],[a,b]),false);
});
test('bloqué exige une question ; terminé sans preuve n’est pas « vérifié »',()=>{
 assert.equal(statusAllowed(t('a'),'blocked',[t('a')]).ok,false);
 assert.equal(statusAllowed(t('a',{blocking_question:'Quel format ?'}),'blocked',[t('a')]).ok,true);
 const done=t('d',{status:'done'}),proved=t('p',{status:'done',proof:'npm test vert'});
 assert.equal(isVerifiedDone(done),false);assert.equal(isVerifiedDone(proved),true);
 const p=progressOf([done,proved,t('x',{status:'abandoned'}),t('y',{status:'blocked'})]);
 assert.deepEqual([p.total,p.done,p.verified,p.unverified_done,p.blocked],[3,2,1,1,1]);
});
test('prochaine tâche : en cours d’abord, puis priorité, jamais une tâche aux prérequis manquants',()=>{
 const a=t('a',{priority:3}),b=t('b',{priority:1,depends_on:['a']}),c=t('c',{priority:2});
 assert.equal(pickNextTask([a,b,c]).id,'c');
 assert.equal(pickNextTask([a,b,{...c,status:'done'}]).id,'a');
 assert.equal(pickNextTask([{...a,status:'in_progress'},c]).id,'a');
 assert.equal(pickNextTask([t('z',{status:'blocked'})]),null);
});
test('parseIds est tolérant',()=>{assert.deepEqual(parseIds('["a","b"]'),['a','b']);assert.deepEqual(parseIds('pas du json'),[]);assert.deepEqual(parseIds('[1,"a"]'),['a']);});
