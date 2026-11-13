import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
import {auditOne,auditAll} from '../scripts/requirements-audit.mjs';
const have=new Set(['server/a.ts','tests/a.test.mjs','docs/X.md']);const ex=p=>have.has(p);
test('niveau retenu : jamais VALIDÉ sans test cité, sans preuve complète ni avec une limite de simulation',()=>{
 const a=(o)=>auditOne({id:'X',section:1,statut:'réalisé',preuve:null,limite:null,...o},ex).level;
 assert.equal(a({preuve:'server/a.ts ; tests/a.test.mjs'}),'VALIDÉ');
 assert.equal(a({preuve:'server/a.ts'}),'NON VÉRIFIÉ');assert.equal(a({preuve:null}),'NON VÉRIFIÉ');
 assert.equal(a({preuve:'server/a.ts ; server/absent.ts ; tests/a.test.mjs'}),'PARTIEL');
 assert.equal(a({preuve:'tests/a.test.mjs',limite:'Testé seulement avec des réponses simulées.'}),'PARTIEL');
 assert.equal(a({preuve:'tests/a.test.mjs (poste de pilotage)',limite:'Rien à signaler'}),'VALIDÉ');
 assert.equal(auditOne({id:'B',section:1,statut:'bloqué',preuve:'tests/a.test.mjs',limite:null},ex).level,'BLOQUÉ');assert.equal(auditOne({id:'F',section:1,statut:'à faire',preuve:null,limite:null},ex).level,'À FAIRE');
 assert.deepEqual(auditOne({id:'M',section:1,statut:'vérifié',preuve:'server/absent.ts',limite:null},ex).missing,['server/absent.ts']);
});
test('les 502+ exigences du dépôt sont toutes auditées, identifiants uniques conservés',()=>{
 const list=JSON.parse(await_read());const rows=auditAll(list);assert.equal(rows.length,list.length);assert.equal(new Set(rows.map(r=>r.id)).size,list.length);assert.ok(list.length>=502);
 assert.ok(['REQ-00-001','PIL-28-001','QCL-29-001','HIS-30-001'].every(id=>rows.some(r=>r.id===id)));                                  // aucun identifiant historique perdu
 assert.ok(rows.filter(r=>r.declared==='vérifié'||r.declared==='réalisé').every(r=>r.level!=='VALIDÉ'||(r.tests>0&&!r.missing.length)));
});
import {readFileSync} from 'node:fs';function await_read(){return readFileSync('docs/EXIGENCES.json','utf8');}
