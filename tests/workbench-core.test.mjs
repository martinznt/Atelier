import {test} from 'node:test';
import assert from 'node:assert/strict';
import {questionKey,questionsCsv,answerText,progressDetail,resumeText,devPrompt} from '../server/workbench-core.ts';
import {canSetStatus,parsePromptDocument,statusFromMeta,promptMarkdown,promptText,nextCode,cleanCommands} from '../server/prompt-core.ts';
import {classifyMemoryPath,treeToDocs,isTextDoc} from '../server/memory-index.ts';
import {inventoryExport,makeLots,coverageOf} from '../server/export-inventory.ts';
import {classifyRepoPath,auditCoverage,prGraph} from '../server/audit-core.ts';

test('question déjà posée : même clé malgré accents, casse, ponctuation et mots vides',()=>{
 assert.equal(questionKey('Quel format pour les fiches ?'),questionKey('  quel FORMAT, pour les fiches'));
 assert.equal(questionKey('Faut-il une étape de visite ?'),questionKey('faut il une etape de visite'));
 assert.notEqual(questionKey('Quel format pour les fiches ?'),questionKey('Quel format pour les photos ?'));
});
test('export CSV des questions et texte de réponse',()=>{
 const csv=questionsCsv([{id:'1',project:'Sport',theme:'UX',question:'A, "B" ?',status:'answered',answer:'x;y',answered_at:'2026-11-12'}]);
 assert.ok(csv.includes('"A, ""B"" ?"')&&csv.includes('"x;y"'));
 assert.equal(answerText({selected:[1],text:'précision',unknown:false},[{label:'A'},{label:'B'}]),'B ; précision');
 assert.equal(answerText({unknown:true},[]),'Je ne sais pas');
});
test('progression : sous-tâches et abandons exclus, trois mesures distinctes',()=>{
 const p=progressDetail([{status:'done',proof:'test',validated_at:'x'},{status:'done',proof:''},{status:'done',proof:'p',parent_id:'a'},{status:'blocked'},{status:'abandoned'},{status:'todo'}]);
 assert.deepEqual([p.total,p.done,p.proved,p.validated,p.blocked],[4,2,1,1,1]);
 assert.deepEqual([p.percent_done,p.percent_proved,p.percent_validated],[50,25,25]);
 assert.equal(progressDetail([]).percent_done,0);
});
test('synthèse de reprise : seulement des objets enregistrés, propositions séparées des décisions',()=>{
 const text=resumeText({project:'Sport',objective:'Finir',state:'Actif',phase:'Phase 1',generatedAt:'2026-11-12',repositories:[{full_name:'o/r',branch:'main',head_sha:'a'.repeat(40),verified:true}],
  progress:progressDetail([{status:'done',proof:'p'}]),decisions:[{id:'d1aaaaaaaa',title:'Validée',status:'validated',source_ref:'PR 3'},{id:'d2bbbbbbbb',title:'Idée IA',status:'proposed',source_ref:''}],
  questions:[{id:'q1cccccccc',question:'Quel format ?'}],actions:[{id:'a1dddddddd',title:'Tester sur téléphone',blocking:true}],
  tasks:[{id:'t1eeeeeeee',title:'Écran',status:'blocked',owner:'claude_code',next_action:'',blocking_question:'Quoi ?'}],nextAction:{title:'Répondre',do:'Ouvrir'},documents:[]});
 for(const s of ['Validée','source : PR 3','Propositions non validées','Idée IA','Quel format ?','(bloquant)','Bloqué','aucun résumé IA'])assert.ok(text.includes(s),s);
 assert.ok(text.indexOf('Idée IA')>text.indexOf('Propositions non validées'));
});
test('consigne de développement : références exactes, rien d’inventé',()=>{
 const p=devPrompt({project:'Sport',task:{title:'Corriger',objective:'Obj',acceptance:'Crit',context:'',files_hint:'web/a.ts',tests:'',risks:'',next_action:'',owner:'claude_code'},repository:{full_name:'o/r',branch:'main',head_sha:'b'.repeat(40),verified:false},decisions:[{title:'D',source_ref:'S'}],dependencies:[{title:'Avant',status:'done'}]});
 for(const s of ['o/r','b'.repeat(40),'non vérifié','web/a.ts','Crit','D (source : S)','Avant — Terminé'])assert.ok(p.includes(s),s);
 assert.ok(!/envoy[ée] le|modèle :|quota/i.test(p));
 assert.ok(devPrompt({project:'x',task:{title:'t',objective:'',acceptance:'',context:'',files_hint:'',tests:'',risks:'',next_action:'',owner:'user'},repository:null,decisions:[],dependencies:[]}).includes('Aucun dépôt associé'));
});
test('prompts : statuts, fiche Markdown, exports exacts',()=>{
 assert.equal(canSetStatus('to_prepare','to_give'),true);assert.equal(canSetStatus('to_give','given'),false);assert.equal(canSetStatus('given','awaiting'),true);
 const doc=parsePromptDocument('# PROMPT-X-0002 — Titre\n\n---\nid: PROMPT-X-0002\ntitle: Titre\nrecipient: Claude Code\nmodel: À choisir\nsent_at:\nstatus: À donner — pas encore envoyé\nversion: 1\n---\n\n# 1. Mission\nTexte exact.\n');
 assert.equal(doc.meta.id,'PROMPT-X-0002');assert.equal(doc.meta.sent_at,'');assert.ok(doc.body.includes('# 1. Mission\nTexte exact.'));assert.ok(!doc.body.includes('recipient:'));
 assert.equal(statusFromMeta(doc.meta),'to_give');
 assert.equal(statusFromMeta({status:'Déjà donné',sent_at:''}),'to_give');          // pas de date d'envoi : jamais « donné »
 assert.equal(statusFromMeta({status:'Déjà donné',sent_at:'2026-11-02'}),'given');
 assert.equal(parsePromptDocument('Texte sans en-tête').body,'Texte sans en-tête');
 const exp={code:'P-0001',title:'T',project:'Sport',recipient:'Claude Code',provider:'Anthropic',product:'Claude Code',model:'',effort:'',version:2,status:'to_give',created_at:'2026-11-12',planned_send:null,sent_at:null,objective:'',body:'Corps exact\nligne 2',commands:[{label:'Quota',command:'/usage',where_when:'au début'}],content_hash:'h'};
 assert.equal(promptText(exp),'Corps exact\nligne 2\n');
 const md=promptMarkdown(exp);assert.ok(md.includes('model: inconnu')&&md.includes('sent_at: \n')&&md.includes('`/usage`')&&md.includes('Corps exact\nligne 2'));
 assert.equal(nextCode(['PROMPT-CLAUDECODE-0001','PROMPT-CLAUDECODE-0002','AUTRE-0009'],'prompt-claudecode'),'PROMPT-CLAUDECODE-0003');
 assert.deepEqual(cleanCommands([{command:' '},{command:'/usage',label:'x'}]).length,1);
});
test('référentiel mémoire : classement par chemin, chemins dangereux écartés',()=>{
 assert.deepEqual(classifyMemoryPath('04_PROMPTS/01_A_DONNER/PROMPT-CLAUDECODE-0002.md'),{project_key:'general',doc_type:'prompt',title:'PROMPT CLAUDECODE 0002',doc_date:null,doc_ref:'PROMPT-CLAUDECODE-0002'});
 assert.equal(classifyMemoryPath('01_SPORT/AUDITS/2026-11-10_AUDIT_DOCUMENTAIRE_APPROFONDI.md').doc_type,'audit');
 assert.equal(classifyMemoryPath('01_SPORT/AUDITS/2026-11-10_AUDIT_DOCUMENTAIRE_APPROFONDI.md').project_key,'sport');
 assert.equal(classifyMemoryPath('01_SPORT/AUDITS/2026-11-10_AUDIT_DOCUMENTAIRE_APPROFONDI.md').doc_date,'2026-11-10');
 assert.equal(classifyMemoryPath('03_LIVRE_DE_RECETTES/README.md').project_key,'livre_recettes');
 assert.equal(classifyMemoryPath('02_ATELIER/CAHIER_DES_CHARGES_ATELIER_COMPLET.md').doc_type,'cahier');
 assert.equal(classifyMemoryPath('08_FICHIERS_FONDATION/SPORT/FONDATION-SPORT-CAHIER-V1-2026-09-23.md').project_key,'sport');
 const docs=treeToDocs([{path:'a.md',type:'blob',sha:'a'.repeat(40),size:3},{path:'dir',type:'tree',sha:'b'.repeat(40)},{path:'../x.md',type:'blob',sha:'c'.repeat(40)},{path:'b.md',type:'blob',sha:'pas-un-sha'}]);
 assert.deepEqual(docs.map(d=>d.path),['a.md']);assert.equal(isTextDoc('a.md'),true);assert.equal(isTextDoc('a.png'),false);
});
test('inventaire d’export ChatGPT : branches, pièces jointes absentes, doublons, entrées non reconnues',()=>{
 const conv={id:'c1',title:'Conv',create_time:1760000000,update_time:1760000100,mapping:{
  root:{children:['u1']},
  u1:{parent:'root',children:['a1','a2'],message:{author:{role:'user'},create_time:1760000001,content:{parts:['Bonjour']}}},
  a1:{parent:'u1',children:[],message:{author:{role:'assistant'},content:{parts:['Réponse 1']}}},
  a2:{parent:'u1',children:[],message:{author:{role:'assistant'},content:{parts:[{content_type:'image_asset_pointer',asset_pointer:'file-service://x'}]},metadata:{attachments:[{name:'photo.png'}]}}}}};
 const inv=inventoryExport([conv,conv,{foo:1},{id:'vide',mapping:{}},{uuid:'k1',name:'Claude',created_at:'2026-11-01T10:00:00Z',chat_messages:[{uuid:'m1',text:'Salut'},{uuid:'m2',parent_message_uuid:'m1',text:'A'},{uuid:'m3',parent_message_uuid:'m1',text:'B',attachments:[{}]}]}]);
 assert.equal(inv.provider,'ChatGPT');assert.equal(inv.unrecognized,1);assert.deepEqual(inv.duplicates,['c1']);
 const c1=inv.rows.find(r=>r.source_id==='c1');
 assert.deepEqual([c1.node_count,c1.message_count,c1.branch_count,c1.attachment_refs,c1.parse_status],[4,2,1,2,'partial']);
 assert.equal(c1.created_time,new Date(1760000000*1000).toISOString());
 assert.equal(inv.rows.find(r=>r.source_id==='vide').parse_status,'error');
 const k1=inv.rows.find(r=>r.source_id==='k1');assert.deepEqual([k1.message_count,k1.branch_count,k1.attachment_refs],[3,1,1]);
 assert.equal(inventoryExport({nope:true}).rows.length,0);
});
test('lots reproductibles et bilan de couverture honnête',()=>{
 const rows=[{source_id:'b',created_time:'2026-01-02',message_count:300},{source_id:'a',created_time:'2026-01-01',message_count:300},{source_id:'c',created_time:null,message_count:10}];
 const lots=makeLots(rows,400);assert.deepEqual(lots,makeLots([...rows].reverse(),400));
 assert.equal(lots.c,'LOT-001');assert.equal(lots.a,'LOT-001');assert.equal(lots.b,'LOT-002');
 const cov=coverageOf([{parse_status:'complete',import_status:'imported',project_id:'p',project_confirmed:1,lot:'LOT-001',message_count:5,imported_messages:5,attachment_refs:0},{parse_status:'partial',import_status:'not_imported',project_id:null,project_confirmed:0,lot:'',message_count:7,imported_messages:0,attachment_refs:2}],[{lot:'LOT-001',kind:'independent'},{lot:'LOT-001',kind:'independent'},{lot:'LOT-001',kind:'cross'}],5);
 assert.equal(cov.complete,false);assert.equal(cov.conversations.missing_from_inventory,3);assert.equal(cov.attachments.accessible,0);
 assert.deepEqual([cov.lots.with_two_independent,cov.lots.with_cross,cov.lots.without_lot,cov.projects.unassigned],[1,1,1,1]);
});
test('audit de référence : jamais « intégral » sans lecture complète du code',()=>{
 assert.equal(classifyRepoPath('migrations/0001_initial.sql'),'migration');assert.equal(classifyRepoPath('tests/a.test.mjs'),'test');assert.equal(classifyRepoPath('server/index.ts'),'code');
 assert.equal(classifyRepoPath('docs/A.md'),'doc');assert.equal(classifyRepoPath('package.json'),'config');assert.equal(classifyRepoPath('public/icon.png'),'asset');
 const partial=auditCoverage([{kind:'code',read_status:'full',size:1},{kind:'code',read_status:'tool',size:1},{kind:'doc',read_status:'not_started',size:1}]);
 assert.equal(partial.integral,false);assert.equal(partial.code.percent_full,50);assert.equal(partial.not_covered,1);assert.match(partial.statement,/partiel/);
 assert.equal(auditCoverage([{kind:'code',read_status:'full',size:1},{kind:'asset',read_status:'excluded',size:1}]).integral,true);
 assert.equal(auditCoverage([]).integral,false);
 const g=prGraph([{number:1,title:'a',head:'f/a',base:'main',draft:false},{number:2,title:'b',head:'f/b',base:'f/a',draft:false},{number:3,title:'c',head:'f/c',base:'ancienne',draft:true}],'main');
 assert.equal(g[1].depends_on,1);assert.equal(g[0].on_default,true);assert.match(g[2].note,/aucune PR ouverte/);
});
