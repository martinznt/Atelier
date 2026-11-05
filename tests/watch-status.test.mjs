import test from 'node:test';
import assert from 'node:assert/strict';
import {watchVerdict} from '../server/watch-status.ts';
const base={config:{enabled:1,consent:1,auto_scope:'claude_code',daily_limit:2},pr:{number:5,sha:'a',claude_code:true},runs:[],todayRepo:0,todayUser:0,aiUsable:true};
const st=o=>watchVerdict({...base,...o}).state;
test('cas simples',()=>{
 assert.equal(st({}),'will_queue');
 assert.equal(st({config:null}),'no_config');
 assert.equal(st({config:{...base.config,enabled:0}}),'off');
 assert.equal(st({config:{...base.config,consent:0}}),'no_consent');
});
test('portée Claude Code',()=>{
 assert.equal(st({pr:{...base.pr,claude_code:false}}),'out_of_scope');
 assert.equal(st({pr:{...base.pr,claude_code:false},config:{...base.config,auto_scope:'all'}}),'will_queue');
});
test('analyse existante, file, IA, plafonds',()=>{
 assert.equal(st({runs:[{pr_number:5,head_sha:'a',status:'completed'}]}),'analysed');
 assert.equal(st({runs:[{pr_number:5,head_sha:'a',status:'running'}]}),'pending');
 assert.equal(st({runs:[{pr_number:5,head_sha:'old',status:'completed'}]}),'will_queue');
 assert.equal(st({aiUsable:false}),'no_ai');
 assert.equal(st({todayRepo:2}),'cap');
 assert.equal(st({todayUser:8}),'cap');
});
