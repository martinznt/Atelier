import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {normalizeMigrationForD1} from './migration-sql.mjs';

test('each migration keeps whole trigger statements',async()=>{
 for(const name of (await readdir('migrations')).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
  const sql=await readFile('migrations/'+name,'utf8');
  const result=normalizeMigrationForD1(sql);
  assert.ok(result.length>0,name);
  const inputTriggers=(sql.match(/CREATE\s+TRIGGER\b/gi)||[]).length;
  const outputTriggers=result.split('\n').filter(x=>/^CREATE\s+TRIGGER\b/i.test(x)).length;
  assert.equal(outputTriggers,inputTriggers,name);
  for(const statement of result.split('\n')){
   assert.match(statement,/;\s*$/,name+' : instruction incomplète');
   if(/^CREATE\s+TRIGGER\b/i.test(statement))assert.match(statement,/\bEND\s*;\s*$/i,name+' : trigger tronqué');
  }
 }
});
