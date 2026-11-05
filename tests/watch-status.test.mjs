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
test('sans plafond : le plafond du dépôt et celui de 8 ne bloquent plus, la sécurité à 100 oui',()=>{
 const cfg={...base.config,no_daily_cap:1,daily_limit:1};
 assert.equal(st({config:cfg,todayRepo:50,todayUser:50}),'will_queue');
 assert.equal(st({config:cfg,todayUser:100}),'cap');
 assert.equal(st({config:{...base.config,no_daily_cap:0},todayUser:8}),'cap');
});
test('toutes les IA en pause : état no_ai avec l’heure de reprise',()=>{
 const v=watchVerdict({...base,aiUsable:false,aiPause:{until:'2026-11-06T00:00:00.000Z',source:'provider'}});
 assert.equal(v.state,'no_ai');assert.equal(v.until,'2026-11-06T00:00:00.000Z');assert.equal(v.until_source,'provider');
 assert.match(v.label,/toutes les IA/);
});
test('marque de titre : une PR au titre non marqué est ignorée, une PR marquée suit le parcours normal',()=>{
 const cfg={...base.config,auto_scope:'all',auto_mark:'EN VÉRIFICATION'};
 assert.equal(st({config:cfg,pr:{...base.pr,title:'A FUSIONNER — x'}}),'unmarked');
 assert.equal(st({config:cfg,pr:{...base.pr,title:'EN VÉRIFICATION — x'}}),'will_queue');
 assert.equal(st({config:{...cfg,auto_mark:null},pr:{...base.pr,title:'A FUSIONNER — x'}}),'will_queue');
});
