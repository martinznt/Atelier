import test from 'node:test';import assert from 'node:assert/strict';
import {classifyEntry,isConversationFile,maxJsonDepth,validateConversationJson,indexConversation,structureOf,readCorrespondance,jsonShape,claimedCounts,compareClaims,entryNameProblem,safeArchivePath} from '../server/archive-entries.ts';
import {inventoryExport} from '../server/export-inventory.ts';

test('A. détection : tous les noms de segments attendus sont reconnus, et seulement eux',()=>{
 for(const n of ['conversations.json','conversations_1.json','conversations_2.json','conversations-1.json','conversations-2.json','conversations-000.json','conversations_filtrees.json','Conversations_Filtrees.JSON','export/conversations.json','export/conversations-001.json'])assert.equal(isConversationFile(n),true,n);
 for(const n of ['shared_conversations.json','conversations.json.bak','conversations_index.json','conversations_filtrees.txt','mes_conversations.json','conversations_filtrees.json/','conversations__1.json','conversations_.json','correspondance_fichiers.json','inventaire_complet.json','verification.json','EXCLUSIONS_IMAGES.json','LISEZMOI_ALLEGE.txt','user.json','message_feedback.json','a/b/conversations.json'])assert.equal(isConversationFile(n),false,n);
});
test('A. un fichier nommé comme un segment mais rangé dans sites/, pieces_jointes/ ou bibliotheque_non_rattachee/ est une ressource, pas une conversation',()=>{
 for(const p of ['sites/conversations.json','pieces_jointes/conversations_filtrees.json','bibliotheque_non_rattachee/x/conversations-1.json','export/sites/conversations.json']){const c=classifyEntry(p);assert.equal(c.kind,'fichier',p);assert.ok(['sites','pieces_jointes','bibliotheque_non_rattachee'].includes(c.group),p);}
});
test('A. annexes et groupes reconnus ; noms dangereux jamais classés comme conversations',()=>{
 const k=n=>classifyEntry(n).kind;
 assert.equal(k('correspondance_fichiers.json'),'correspondance');assert.equal(k('inventaire_complet.json'),'inventaire');assert.equal(k('verification.json'),'verification');assert.equal(k('EXCLUSIONS_IMAGES.json'),'exclusions');assert.equal(k('LISEZMOI_ALLEGE.txt'),'lisez_moi');assert.equal(k('export/verification.json'),'verification');
 assert.equal(k('sites/mon-site/index.html'),'fichier');assert.equal(classifyEntry('sites/mon-site/index.html').group,'sites');assert.equal(classifyEntry('pieces_jointes/file-AB-x.png').group,'pieces_jointes');assert.equal(classifyEntry('autre/truc.bin').group,'autre');
 assert.equal(k('../conversations.json'),'dangereux');assert.equal(k('a\\conversations.json'),'dangereux');assert.equal(k('/conversations.json'),'dangereux');assert.equal(entryNameProblem('ok/f.txt'),null);
 assert.equal(k('profond/niveau/trois/conversations.json'),'fichier');                       // pas de segment enfoui profondément
});
test('B. profondeur JSON : mesurée sans analyser, chaînes ignorées, limite respectée',()=>{
 assert.equal(maxJsonDepth('[{"a":[1,{"b":2}]}]'),4);assert.equal(maxJsonDepth('{"x":"[[[[[["}'),1);assert.equal(maxJsonDepth('{"x":"\\"[[["}'),1);
 assert.ok(maxJsonDepth('['.repeat(500)+']'.repeat(500),100)>100);
});
const gpt=(id,extra={})=>({id,title:'T '+id,create_time:1788000000,update_time:1788000100,current_node:'b',default_model_slug:'gpt-5',is_archived:false,plugin_ids:['x'],mapping:{root:{id:'root',parent:null,children:['a'],message:null},a:{id:'a',parent:'root',children:['b','c'],message:{id:'a',author:{role:'user'},create_time:1788000001,content:{content_type:'text',parts:['Bonjour']},metadata:{model_slug:'gpt-5',weird_key:1,attachments:[{id:'file-AAA111',name:'x.pdf'}]}}},b:{id:'b',parent:'a',children:[],message:{id:'b',author:{role:'assistant'},create_time:1788000002,content:{content_type:'text',parts:['Réponse 1']},metadata:{}}},c:{id:'c',parent:'a',children:[],message:{id:'c',author:{role:'assistant'},create_time:1788000003,content:{content_type:'text',parts:['Réponse 2']},metadata:{}}}},...extra});
test('B. validation de structure : valide, enveloppe, mêlé, vide, incomplet — avec le motif de chaque rejet',()=>{
 const ok=validateConversationJson([gpt('c1'),gpt('c2')]);assert.equal(ok.ok,true);assert.equal(ok.valid,2);assert.equal(ok.provider,'ChatGPT');assert.equal(ok.wrapper,null);
 const wrapped=validateConversationJson({conversations:[gpt('c1')]});assert.equal(wrapped.ok,true);assert.equal(wrapped.wrapper,'conversations');assert.equal(wrapped.wrapper_unverified,false);
 const other=validateConversationJson({meta:{n:1},conversations_conservees:[gpt('c1')]});assert.equal(other.ok,true);assert.equal(other.wrapper,'conversations_conservees');assert.equal(other.wrapper_unverified,true);   // signalé, jamais silencieux
 assert.equal(validateConversationJson({a:[gpt('x')],b:[gpt('y')]}).ok,false);                                             // ambigu : rien n'est choisi
 assert.equal(validateConversationJson(gpt('single')).valid,1);
 const noId=validateConversationJson([gpt('c1'),{mapping:{}},{title:'sans mapping',id:'z'},'texte',null]);assert.equal(noId.valid,1);assert.equal(noId.invalid,4);assert.deepEqual(noId.issues.map(i=>i.reason),['identifiant de conversation absent','structure non reconnue (ni « mapping » ni « chat_messages »)','entrée qui n’est pas un objet','entrée qui n’est pas un objet']);
 for(const bad of [[],{},{conversations:[]},'texte',42,null,[{}],[{id:'x'}],[{mapping:{}}]]){const r=validateConversationJson(bad);assert.equal(r.ok,false,JSON.stringify(bad));assert.ok(r.reason);}
 const mixed=validateConversationJson([gpt('a'),{uuid:'u',chat_messages:[]}]);assert.equal(mixed.valid,1);assert.match(mixed.issues[0].reason,/format Claude mêlé à ChatGPT/);
 assert.equal(validateConversationJson([gpt('a')],{maxConversations:0,maxNodes:10}).ok,false);assert.equal(validateConversationJson([gpt('a')],{maxConversations:10,maxNodes:2}).ok,false);   // limites
});
test('C. intégrité : nœuds, branches, relations parent/enfant, dates, identifiants, références de fichiers conservés',()=>{
 const idx=indexConversation(gpt('c1'));
 assert.deepEqual(idx.nodes.map(n=>n.node_id),['root','a','b','c']);
 const a=idx.nodes.find(n=>n.node_id==='a');assert.deepEqual(a.children,['b','c']);assert.equal(a.parent_id,'root');assert.equal(a.role,'user');assert.equal(a.has_text,true);assert.equal(a.text_chars,7);assert.equal(a.attachment_refs,1);assert.equal(a.create_time,'2026-08-29T10:40:01.000Z');
 assert.equal(idx.nodes.find(n=>n.node_id==='root').parent_id,null);assert.equal(idx.nodes.find(n=>n.node_id==='root').has_text,false);          // nœud sans message conservé dans la structure
 assert.equal(idx.nodes.find(n=>n.node_id==='c').parent_id,'a');                                                                              // branche alternative conservée
 assert.equal(a.meta.model_slug,'gpt-5');assert.equal(a.meta.weird_key,undefined);assert.equal(idx.dropped['metadata.weird_key'],1);              // ce qui n'est pas conservé est compté, pas tu
 assert.equal(idx.meta.scalars.default_model_slug,'gpt-5');assert.equal(idx.meta.scalars.is_archived,false);assert.deepEqual(idx.meta.unstored_keys,['plugin_ids']);
 assert.deepEqual(idx.structure,{roots:1,dangling:0,cycles:0,branch_points:1,leaves:2,current_node:'b',current_node_ok:true});
 const inv=inventoryExport([gpt('c1')]).rows[0];assert.equal(inv.node_count,idx.nodes.length);assert.equal(inv.branch_count,1);assert.equal(inv.source_id,'c1');                 // l'inventaire et l'index s'accordent
});
test('C. cohérence de l’arbre : parent introuvable, cycle, nœud actif absent détectés ; racine Claude reconnue',()=>{
 const n=(id,parent,children=[])=>({node_id:id,parent_id:parent,children});
 assert.deepEqual(structureOf([n('a',null,['b']),n('b','zzz')],'q'),{roots:1,dangling:1,cycles:0,branch_points:0,leaves:1,current_node:'q',current_node_ok:false});
 assert.equal(structureOf([n('a','b',['b']),n('b','a',['a'])]).cycles,1);assert.equal(structureOf([n('a','a')]).cycles,1);
 const claude={uuid:'u1',name:'N',created_at:'2026-10-01T10:00:00Z',chat_messages:[{uuid:'m1',sender:'human',text:'Salut',parent_message_uuid:'00000000-0000-4000-8000-000000000000',created_at:'2026-10-01T10:00:01Z'},{uuid:'m2',sender:'assistant',text:'Hello',parent_message_uuid:'m1',created_at:'2026-10-01T10:00:02Z'},{uuid:'m3',sender:'assistant',text:'Alt',parent_message_uuid:'m1',created_at:'2026-10-01T10:00:03Z',attachments:[{file_name:'a.txt'}]}]};
 const ci=indexConversation(claude);assert.deepEqual(ci.nodes.find(x=>x.node_id==='m1').children,['m2','m3']);assert.equal(ci.structure.roots,1);assert.equal(ci.structure.dangling,0);assert.equal(ci.structure.branch_points,1);assert.equal(ci.nodes.find(x=>x.node_id==='m3').attachment_refs,1);
});
test('E. annexes : correspondance sous deux formes, forme inconnue signalée sans lien, résumé de forme',()=>{
 const map=readCorrespondance({'file-service://file-AAA111':'pieces_jointes/file-AAA111-x.pdf','file-BBB222':'./bibliotheque_non_rattachee/y.png','vide':''});
 assert.equal(map.shape,'map');assert.deepEqual(map.pairs,[{ref:'file-AAA111',path:'pieces_jointes/file-AAA111-x.pdf'},{ref:'file-BBB222',path:'bibliotheque_non_rattachee/y.png'}]);assert.equal(map.skipped,1);
 const rec=readCorrespondance({fichiers:[{id:'file-1',chemin:'sites/a/index.html'},{file_id:'file-2',path:'pieces_jointes/z.pdf'},{id:'file-3'},{note:'x'}]});
 assert.equal(rec.shape,'records');assert.equal(rec.pairs.length,2);assert.equal(rec.skipped,2);
 for(const bad of [42,'texte',[],[1,2],{a:1,b:2},{a:{b:1},c:{d:2}}]){const r=readCorrespondance(bad);assert.equal(r.pairs.length,0,JSON.stringify(bad));assert.ok(r.reason);}
 assert.deepEqual(jsonShape([{a:1,b:2}]),{type:'array',length:1,keys:['a','b']});assert.equal(jsonShape({x:1}).type,'object');assert.equal(jsonShape('t').type,'string');
});
test('E. chiffres annoncés : seuls les chiffres de ce qui est conservé comptent ; écart et absence d’annonce distingués',()=>{
 const claims=claimedCounts({conversations_conservees:137,conversations_exclues:580,messages_conserves:6508,noeuds:6723,images_exclues:169,details:{nombre_de_conversations:137,erreurs_messages:3},total_original:{conversations:717}});
 assert.deepEqual(claims.map(c=>[c.category,c.value]).sort(),[['conversations',137],['conversations',137],['messages',6508],['nodes',6723]].sort());
 const cmp=Object.fromEntries(compareClaims(claims,{conversations:137,messages:6500,nodes:6723}).map(c=>[c.category,c.status]));
 assert.deepEqual(cmp,{conversations:'concordant',messages:'ecart',nodes:'concordant'});
 assert.equal(compareClaims([],{conversations:1,messages:1,nodes:1})[0].status,'non_annonce');
 assert.deepEqual(claimedCounts([1,2,3]),[]);assert.deepEqual(claimedCounts('x'),[]);
});

test('chemins déclarés par une correspondance : seuls les chemins relatifs sûrs sont acceptés, aucun n’est « réparé »',()=>{
 const ok={'./pieces_jointes/fichier.pdf':'pieces_jointes/fichier.pdf','pieces_jointes/fichier.pdf':'pieces_jointes/fichier.pdf','sites/siteA/index.html':'sites/siteA/index.html','bibliotheque_non_rattachee/50% offert.pdf':'bibliotheque_non_rattachee/50% offert.pdf'};
 for(const [raw,want] of Object.entries(ok))assert.equal(safeArchivePath(raw),want,raw);
 for(const bad of ['/pieces_jointes/fichier.pdf','//serveur/partage/f.pdf','C:/pieces_jointes/fichier.pdf','c:\\pieces_jointes\\fichier.pdf','\\\\srv\\x','../pieces_jointes/fichier.pdf','dossier/../../fichier.pdf','a/../b.pdf','./../x.pdf','pieces_jointes\\fichier.pdf','pieces_jointes//fichier.pdf','pieces_jointes/./fichier.pdf','pieces_jointes/','','.','..','%2e%2e/secret','pieces_jointes/%2E%2E/x','a%2fb','x\u0000.pdf','x\n.pdf','a|b.pdf',' pieces_jointes/x.pdf',null,undefined,42,'x'.repeat(501)])
  assert.equal(safeArchivePath(bad),null,JSON.stringify(bad));
});
test('correspondance : un chemin rejeté ne produit aucun couple (forme dictionnaire et forme enregistrements), il est compté',()=>{
 const m=readCorrespondance({'file-1':'/pieces_jointes/f.pdf','file-2':'C:/pieces_jointes/f.pdf','file-3':'../pieces_jointes/f.pdf','file-4':'dossier/../../f.pdf','file-5':'./pieces_jointes/f.pdf','file-6':'pieces_jointes/f.pdf'});
 assert.deepEqual(m.pairs,[{ref:'file-5',path:'pieces_jointes/f.pdf'},{ref:'file-6',path:'pieces_jointes/f.pdf'}]);assert.equal(m.unsafe,4);assert.equal(m.skipped,4);
 const r=readCorrespondance([{id:'file-1',chemin:'/etc/passwd'},{id:'file-2',chemin:'..\\x'},{id:'file-3',chemin:'pieces_jointes/f.pdf'}]);
 assert.deepEqual(r.pairs,[{ref:'file-3',path:'pieces_jointes/f.pdf'}]);assert.equal(r.unsafe,2);
 const none=readCorrespondance({'file-1':'/a/b.pdf'});assert.deepEqual(none.pairs,[]);assert.ok(none.reason);
});
