import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAtelierReadiness} from '../server/readiness.ts';
import {providerErrorMessage,ProviderError} from '../server/connectors/http.ts';

const tables=['users','sessions','projects','connections','tasks','repositories','file_contents','review_configs','review_runs'];
function environment({key=Buffer.alloc(32,7).toString('base64'),allTables=tables,hasLimit=true,hasDiagnostic=true,brokenDb=false}={}){
 return {
  MASTER_KEY:key,APP_ORIGIN:'https://atelier.example.workers.dev',
  ASSETS:{fetch:async()=>Response.json({})},TASKS:{send:async()=>{}},
  DB:{prepare:(sql)=>{
   if(brokenDb)throw Error('private D1 connection details');
   if(sql.includes('sqlite_master'))return {all:async()=>({results:allTables.map(name=>({name}))})};
   if(sql.includes('PRAGMA table_info(review_runs)'))return {all:async()=>({results:hasDiagnostic?[{name:'stage'},{name:'diagnostic'},{name:'resume_at'},{name:'resume_state'}]:[{name:'other'}]})};
   if(sql.includes('PRAGMA table_info'))return {all:async()=>({results:hasLimit?[{name:'daily_limit'}]:[{name:'other'}]})};
   throw Error('unexpected SQL query');
  }}
 };
}
test('la validation des prérequis renvoie uniquement les états, sans aucun secret',async()=>{
 const env=environment(),result=await inspectAtelierReadiness(env);
 assert.equal(result.ready,true);
 assert.equal(result.checks.every(c=>c.status==='ok'),true);
 assert.doesNotMatch(JSON.stringify(result),new RegExp(env.MASTER_KEY));
});
test('la migration IA manquante est détectée sans recréer la base',async()=>{
 const r=await inspectAtelierReadiness(environment({hasLimit:false,allTables:tables.filter(x=>x!=='review_runs')}));
 assert.equal(r.ready,false);
 assert.equal(r.checks.find(x=>x.id==='database')?.status,'error');
 assert.equal(r.checks.find(x=>x.id==='review-migration')?.status,'error');
});
test('une MASTER_KEY absente ou invalide est détectée sans fuite',async()=>{
 for(const key of ['',Buffer.from('short').toString('base64'),'@@@private@@@']){
  const r=await inspectAtelierReadiness(environment({key}));
  assert.equal(r.ready,false);assert.equal(r.checks.find(x=>x.id==='master-key')?.status,'error');
  assert.doesNotMatch(JSON.stringify(r),new RegExp(key||'not-shared'));
 }
});
test('une D1 inaccessible n’empêche pas le diagnostic du Worker',async()=>{
 const r=await inspectAtelierReadiness(environment({brokenDb:true}));
 assert.equal(r.ready,false);
 assert.equal(r.checks.find(x=>x.id==='database')?.status,'error');
 assert.doesNotMatch(JSON.stringify(r),/private D1 connection details/);
});
test('les codes GitHub réseau, refus, quota et erreur distante restent distincts',()=>{
 assert.match(providerErrorMessage(503,'network'),/réseau ou délai/i);
 assert.match(providerErrorMessage(403,'http'),/HTTP 403/);
 assert.match(providerErrorMessage(429,'http'),/HTTP 429/);
 assert.match(providerErrorMessage(502,'http'),/HTTP 502/);
 assert.match(providerErrorMessage(404,'http'),/HTTP 404/);
 assert.notEqual(new ProviderError(503,'network').message,new ProviderError(503,'http').message);
});
test('la migration 0010 manquante est signalée sans bloquer le diagnostic des autres éléments',async()=>{
 const r=await inspectAtelierReadiness(environment({hasDiagnostic:false}));
 assert.equal(r.ready,false);
 const check=r.checks.find(x=>x.id==='review-diagnostics');
 assert.equal(check?.status,'error');assert.match(check.detail||check.message||JSON.stringify(check),/0010/);
 assert.equal(r.checks.find(x=>x.id==='review-migration')?.status,'ok');
});
test('la migration 0013 manquante est signalée avec ses conséquences',async()=>{
 const base=environment();
 const env={...base,DB:{prepare:sql=>sql.includes('PRAGMA table_info(review_runs)')?{all:async()=>({results:[{name:'stage'},{name:'diagnostic'}]})}:base.DB.prepare(sql)}};
 const r=await inspectAtelierReadiness(env);
 const check=r.checks.find(x=>x.id==='ai-relay');
 assert.equal(check?.status,'error');assert.match(JSON.stringify(check),/0013/);assert.match(JSON.stringify(check),/reprise automatique est désactivée/);
 assert.equal(r.checks.find(x=>x.id==='review-diagnostics')?.status,'ok');
});
