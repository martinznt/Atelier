import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canTransition,HANDOFF_STATUSES,decisionItem,taskItem,fileItem,renderPackage,secretFindings,sha256Hex,HANDOFF_LABEL} from '../server/handoff-core.ts';
test('« Envoyé » n’existe pas et le cycle de statuts est contrôlé',()=>{
 assert.equal(HANDOFF_STATUSES.includes('sent'),false);assert.equal(Object.values(HANDOFF_LABEL).includes('Envoyé'),false);
 assert.equal(canTransition('draft','ready'),true);assert.equal(canTransition('draft','copied'),false);
 assert.equal(canTransition('ready','copied'),true);assert.equal(canTransition('copied','response_received'),true);
 assert.equal(canTransition('done','ready'),false);assert.equal(canTransition('response_received','copied'),false);
});
test('les pièces sont construites par allowlist : aucun champ interne ne fuit',()=>{
 const row={id:'d1',user_id:'U-SECRET',project_id:'P',title:'Choix du format',reason:'Plus simple',status:'validated',source_kind:'pr',source_ref:'PR 12',revision:7,created_at:'x'};
 const item=decisionItem(row);
 const dump=JSON.stringify(item);
 assert.ok(!dump.includes('U-SECRET')&&!dump.includes('revision')&&!dump.includes('created_at'));
 assert.match(item.label,/validée/);
 const task=JSON.stringify(taskItem({id:'t',title:'X',status:'done',objective:'o',acceptance:'a',proof:'p',user_id:'U-SECRET',secret:'sk-FAUX'}));
 assert.ok(!task.includes('U-SECRET')&&!task.includes('sk-FAUX'));
 const f=fileItem({id:'f',name:'cahier.md',storage_key:'K'},{version:3,sha256:'a'.repeat(64),size:10,object_key:'OBJ'},null);
 assert.ok(!JSON.stringify(f).includes('OBJ')&&!JSON.stringify(f).includes('storage_key'));assert.equal(f.content_included,false);
});
test('le rendu est déterministe, complet et sans jeton',async()=>{
 const input={projectName:'Livre de recettes',preparedAt:'2026-11-11T10:00:00.000Z',
  pkg:{title:'Corriger X',destination:'claude_code',version:2,objective:'Corriger le bug',instruction:'Reproduis d’abord.',constraints:'Aucun secret',success_criteria:'Test vert',
   repository:{full_name:'martinznt/Livre-de-recettes',branch:'main',base_sha:'a'.repeat(40),pr_number:111},task_title:'Tâche A'},
  items:[decisionItem({id:'d',title:'D',reason:'R',status:'validated',source_kind:'other',source_ref:''}),fileItem({id:'f',name:'n.md'},{version:1,sha256:'b'.repeat(64),size:5},'bonjour')]};
 const a=renderPackage(input),b=renderPackage(input);
 assert.equal(a,b);assert.equal(await sha256Hex(a),await sha256Hex(b));
 for(const s of ['Claude Code','Version 2','a'.repeat(40),'PR : #111','pull/111','Décision validée','bonjour','Provenance des pièces'])assert.ok(a.includes(s),s);
 assert.deepEqual(secretFindings(a),[]);
 assert.ok(!renderPackage({...input,items:[]}).includes('### Fichier'));
});
test('détection de secrets : noms génériques seulement, jamais la valeur',()=>{
 const faux='ghp_'+'a'.repeat(30);
 const f=secretFindings('ma clé : '+faux+' et password=Abcdefgh123');
 assert.ok(f.includes('jeton GitHub')&&f.includes('secret affecté à une variable'));
 assert.ok(!JSON.stringify(f).includes(faux));
 assert.deepEqual(secretFindings('Un texte ordinaire sur des recettes de cuisine.'),[]);
});
