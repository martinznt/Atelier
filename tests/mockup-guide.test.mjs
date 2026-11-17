import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contrastRatio,luminance,suggestions} from '../server/mockup-guide.ts';
import {SITE_PALETTES} from '../server/site-palettes.ts';

/* Lot 5B (5B-4) — chaque règle a un cas qui la DÉCLENCHE et un cas qui ne la déclenche PAS. Seuils WCAG 2.2 vérifiés à la source (w3.org). */
const pal=SITE_PALETTES[0].colors.map((c)=>({hex:c.hex,token:c.token}));
const b=(id,over={})=>({id,kind:'text',label:'Bloc '+id,x:16,y:Number(id.replace(/\D/g,'')||1)*60,w:200,h:48,group:'',fill:'',text_color:'',feature_id:null,...over});
const run=(blocks,over={})=>suggestions({blocks,palette:null,features:[],decisions:[],...over});
const rules=(s)=>s.map((x)=>x.rule);

test('formule de contraste WCAG : noir/blanc = 21:1, couleur identique = 1:1, #767676 sur blanc ≈ 4,54:1, symétrique',()=>{
 assert.equal(Math.round(contrastRatio('#000000','#ffffff')*100)/100,21);assert.equal(contrastRatio('#d39a62','#d39a62'),1);
 assert.equal(Math.round(contrastRatio('#767676','#ffffff')*100)/100,4.54);assert.equal(contrastRatio('#ffffff','#767676'),contrastRatio('#767676','#ffffff'));
 assert.equal(luminance('#000000'),0);assert.equal(luminance('#ffffff'),1);assert.throws(()=>luminance('noir'));
});
test('2.5.8 cible minimum (AA, 24 px) : bouton 20 × 48 déclenche ; 24 × 24 ne déclenche pas ; un texte de 10 px n’est pas une cible',()=>{
 assert.deepEqual(rules(run([b('b1',{kind:'button',w:20,h:48})])),['target_min']);
 assert.ok(!rules(run([b('b1',{kind:'button',w:24,h:24})])).includes('target_min'));
 assert.deepEqual(rules(run([b('b1',{kind:'text',w:10,h:10})])),[]);
 const s=run([b('b1',{kind:'field',w:300,h:20})])[0];assert.equal(s.level,'verified');assert.match(s.source.url,/WCAG22\/#target-size-minimum$/);assert.match(s.detail,/24 × 24 px/);
});
test('2.5.5 cible confortable (AAA, 44 px) : 40 × 40 déclenche ; 44 × 44 ne déclenche pas ; jamais les deux règles à la fois',()=>{
 assert.deepEqual(rules(run([b('b1',{kind:'button',w:40,h:40})])),['target_comfort']);
 assert.deepEqual(rules(run([b('b1',{kind:'button',w:44,h:44})])),[]);
 assert.deepEqual(rules(run([b('b1',{kind:'button',w:10,h:10})])),['target_min']);
});
test('1.4.3 contraste du texte (AA, 4,5:1) : #767676 sur blanc passe (4,54) ; #777777 sur blanc échoue ; gros texte mentionné entre 3 et 4,5',()=>{
 assert.deepEqual(rules(run([b('b1',{fill:'#ffffff',text_color:'#767676'})])),[]);
 const s=run([b('b1',{fill:'#ffffff',text_color:'#777777'})]);assert.deepEqual(rules(s),['text_contrast']);assert.match(s[0].detail,/4,4\d:1/);assert.match(s[0].detail,/3:1 si le texte est gros/);
 assert.match(run([b('b1',{fill:'#ffffff',text_color:'#eeeeee'})])[0].detail,/même un gros texte demande 3:1/);
});
test('contraste impossible à vérifier : une seule couleur déclenche (Hypothèse) ; les deux ou aucune ne déclenchent pas',()=>{
 for(const o of [{fill:'#ffffff'},{text_color:'#000000'}]){const s=run([b('b1',o)]);assert.deepEqual(rules(s),['contrast_unknown']);assert.equal(s[0].level,'hypothesis');}
 assert.deepEqual(rules(run([b('b1',{fill:'#ffffff',text_color:'#000000'})])),[]);assert.deepEqual(rules(run([b('b1')])),[]);
});
test('hors palette : une couleur absente de la palette du site déclenche ; une couleur du site, ou sans palette, non',()=>{
 assert.deepEqual(rules(run([b('b1',{fill:'#123456',text_color:'#f3ece2'})],{palette:pal})).filter((r)=>r==='off_palette'),['off_palette']);
 assert.deepEqual(rules(run([b('b1',{fill:'#14110e',text_color:'#f3ece2'})],{palette:pal})),[]);
 assert.ok(!rules(run([b('b1',{fill:'#123456',text_color:'#ffffff'})])).includes('off_palette'));
});
test('fonctionnalité liée abandonnée ou bloquée : déclenche (Rapporté) ; actuelle et en cours : non',()=>{
 const f=(life,state)=>[{id:'f1',code:'F-0001',name:'Courses',life,state}];
 for(const [life,state] of [['abandoned','done'],['rejected','to_design'],['replaced','done'],['current','blocked']]){const s=run([b('b1',{feature_id:'f1'})],{features:f(life,state)});assert.deepEqual(rules(s),['feature_status'],life+state);assert.equal(s[0].level,'reported');}
 assert.deepEqual(rules(run([b('b1',{feature_id:'f1'})],{features:f('current','in_progress')})),[]);
});
test('décision qui cite le bloc : déclenche (Hypothèse) ; mot seulement contenu dans un autre mot, ou nom trop court : non',()=>{
 const d=[{id:'d1',title:'La barre de recherche reste en haut',reason:''}];
 const s=run([b('b1',{label:'Recherche'})],{decisions:d});assert.deepEqual(rules(s),['decision_mention']);assert.equal(s[0].level,'hypothesis');
 assert.deepEqual(rules(run([b('b1',{label:'Cherche'})],{decisions:d})),[]);assert.deepEqual(rules(run([b('b1',{label:'La'})],{decisions:d})),[]);
 assert.deepEqual(rules(run([b('b1',{label:'Recherche'})],{decisions:[{id:'d2',title:'Thème noir',reason:'pour la recherche du soir'}]})),['decision_mention']);
});
test('chevauchement : deux blocs qui se recouvrent déclenchent ; bord à bord, ou même groupe, non',()=>{
 const s=run([b('b1',{x:0,y:0,w:100,h:50}),b('b2',{x:90,y:40,w:100,h:50})]);assert.deepEqual(rules(s),['overlap']);assert.match(s[0].detail,/10 × 10 px/);
 assert.deepEqual(rules(run([b('b1',{x:0,y:0,w:100,h:50}),b('b2',{x:100,y:0,w:100,h:50})])),[]);
 assert.deepEqual(rules(run([b('b1',{x:0,y:0,w:100,h:50,group:'G'}),b('b2',{x:90,y:40,w:100,h:50,group:'G'})])),[]);
});
test('trop d’éléments au même niveau (repère d’Atelier, Hypothèse) : 9 blocs sans groupe déclenchent ; 8, ou 9 dont 2 groupés, non',()=>{
 const n=(k,g=0)=>Array.from({length:k},(_,i)=>b('b'+(i+1),{x:0,y:i*60,w:100,h:40,group:i<g?'G':''}));
 const s=run(n(9));assert.deepEqual(rules(s),['crowded']);assert.equal(s[0].level,'hypothesis');assert.match(s[0].source.label,/sans source officielle/);
 assert.deepEqual(rules(run(n(8))),[]);assert.deepEqual(rules(run(n(9,2))),[]);
});
test('clés stables : même situation → même clé ; nouvelle couleur → nouvelle clé (une suggestion refusée ne revient pas, une NOUVELLE situation si)',()=>{
 const k=(o)=>run([b('b1',o)])[0].key;
 assert.equal(k({fill:'#ffffff',text_color:'#777777'}),k({fill:'#ffffff',text_color:'#777777'}));
 assert.notEqual(k({fill:'#ffffff',text_color:'#777777'}),k({fill:'#ffffff',text_color:'#888888'}));
 assert.equal(run([b('b1',{kind:'button',w:20,h:20})])[0].key,run([b('b1',{kind:'button',w:10,h:12})])[0].key,'taille : même bloc → même clé');
});
test('chaque suggestion a un titre, un détail, une source, un niveau et une consigne pour la mission',()=>{
 const all=run([b('b1',{kind:'button',w:20,h:20,fill:'#ffffff',text_color:'#777777',x:0,y:0}),b('b2',{x:10,y:10})]);
 for(const s of all){assert.ok(s.title&&s.detail&&s.instruction&&s.source.label);assert.ok(['verified','reported','hypothesis'].includes(s.level));}
});
