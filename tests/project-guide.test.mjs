import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextAction} from '../server/project-guide.ts';
const t=(id,o={})=>({id,title:'T'+id,status:'todo',depends_on:[],priority:2,position:0,phase_id:null,proof:'',blocking_question:'',owner:'claude_code',...o});
const base={hasGithubConnection:true,repositories:[{id:'r',full_name:'a/b',verified:true}],tasks:[],proposedDecisions:[],packages:[],github:null};
const code=o=>nextAction({...base,...o}).code;
test('une seule action, dans l’ordre de priorité',()=>{
 assert.equal(code({hasGithubConnection:false,repositories:[]}),'add_github_connection');
 assert.equal(code({repositories:[]}),'link_repository');
 assert.equal(code({repositories:[{id:'r',full_name:'a/b',verified:false}]}),'verify_repository');
 assert.equal(code({tasks:[t('1',{status:'blocked',blocking_question:'Quel format ?'}),t('2')]}),'answer_blocking_question');
 assert.equal(code({github:{available:true,prs:[{number:5,title:'x',ci:'failure',review:null}]},tasks:[t('1')]}),'ci_failed');
 assert.equal(code({packages:[{id:'h',title:'H',status:'ready',destination:'claude_code'}],tasks:[t('1')]}),'copy_handoff');
 assert.equal(code({packages:[{id:'h',title:'H',status:'copied',destination:'chatgpt'}]}),'add_response');
 assert.equal(code({tasks:[t('1',{status:'to_verify'})]}),'verify_task');
 assert.equal(code({proposedDecisions:[{id:'d',title:'D'}],tasks:[t('1')]}),'settle_decision');
 assert.equal(code({tasks:[t('1')]}),'start_task');
 assert.equal(code({}),'nothing');
});
test('le guide complet contient les six éléments demandés et ne propose pas de tâche aux prérequis manquants',()=>{
 const g=nextAction({...base,tasks:[t('a'),t('b',{depends_on:['a'],priority:1})]});
 for(const k of ['where','open','do','expected','verify','if_missing'])assert.ok(g[k]&&g[k].length>3,k);
 assert.equal(g.ref.id,'a');
});
test('un état GitHub indisponible ne déclenche jamais « échec »',()=>{
 assert.equal(code({github:{available:false,prs:[]},tasks:[]}),'nothing');
});
