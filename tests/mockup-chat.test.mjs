import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aiPrompt,contextAnswer,keywords} from '../server/mockup-chat.ts';

/* Lot 5B (5B-5) — la réponse d'Atelier SANS IA ne contient que ce qui existe, avec la source et le niveau de chaque élément. */
const blk={id:'b1',label:'Recherche',kind_label:'Champ',x:16,y:88,w:328,h:44,group:'Haut',fill:'#ffffff',text_color:'#14110e',behavior:'Filtre les recettes'};
const base={question:'Est-ce bien de mettre la recherche ici ?',block:blk,group_mates:['Titre'],suggestions:[],feature:null,decisions:[],passages:[],conclusions:[]};
test('faits du bloc toujours présents, marqués Vérifié (mesure de la maquette)',()=>{
 const a=contextAnswer(base);assert.match(a.body,/^Ce qu'Atelier sait déjà sur « Recherche », sans IA :/);
 assert.match(a.body,/Champ à 16 px du bord gauche et 88 px du haut, 328 × 44 px, dans le groupe « Haut » avec « Titre », fond #ffffff, texte #14110e\. Comportement prévu : Filtre les recettes\. \[Vérifié\]/);
 assert.equal(a.sources.length,1);assert.equal(a.sources[0].level,'verified');
});
test('rien d’autre : Atelier le dit, il n’invente pas',()=>{
 assert.match(contextAnswer(base).body,/Aucune règle, décision, fonctionnalité ni passage de l’historique ne concerne ce bloc\./);
 assert.match(contextAnswer({...base,block:null,group_mates:[]}).body,/^Ce qu’Atelier sait déjà sur cette page, sans IA :\n- Aucune règle, décision ni passage/);
});
test('règle, fonctionnalité, décision, historique, conclusion : chacun cité avec son niveau',()=>{
 const a=contextAnswer({...base,
  suggestions:[{rule:'target_comfort',key:'b1',title:'« Recherche » est petit pour un pouce',detail:'328 × 40 px…',level:'verified',source:{label:'WCAG 2.2, critère 2.5.5',url:'https://www.w3.org/TR/WCAG22/#target-size-enhanced'},block_ids:['b1'],instruction:''}],
  feature:{code:'F-0003',name:'Recherche',state_label:'Fait',life_label:'Actuelle'},
  decisions:[{title:'La recherche reste en haut',reason:'Martin la cherche tout de suite',reliability_word:'Confirmé par vous',source_ref:'conversation du 3 octobre'}],
  passages:[{title:'Idées pour le livre',excerpt:'mettre la recherche tout en haut',date:'2026-10-03T10:00:00Z'}],
  conclusions:['La recherche reste sous le titre.']});
 assert.deepEqual(a.sources.map((s)=>[s.kind,s.level]),[['block','verified'],['rule','verified'],['feature','reported'],['decision','confirmed'],['history','reported'],['decision','confirmed']]);
 assert.match(a.body,/WCAG 2\.2, critère 2\.5\.5\)\. \[Vérifié\]/);assert.match(a.body,/F-0003 « Recherche » : Fait, Actuelle dans le suivi du projet\. \[Rapporté\]/);
 assert.match(a.body,/Décision actuelle « La recherche reste en haut » : Martin la cherche tout de suite \(source : conversation du 3 octobre\)\. \[Confirmé par vous\]/);
 assert.match(a.body,/Historique importé, « Idées pour le livre » \(2026-10-03\) : « mettre la recherche tout en haut » \[Rapporté\]/);
 assert.match(a.body,/Vous avez déjà conclu : La recherche reste sous le titre\. \[Confirmé par vous\]/);
 assert.doesNotMatch(a.body,/Aucune règle/);
});
test('même contexte → même réponse (règles fixes)',()=>assert.equal(contextAnswer(base).body,contextAnswer(base).body));
test('mots-clés : 4 lettres ou plus, sans accents ni mots vides, 6 au plus',()=>{
 assert.deepEqual(keywords('Est-ce bien de mettre la Recherche dans la barre du haut ?'),['recherche','barre','haut']);
 assert.equal(keywords('a b c').length,0);assert.ok(keywords('un deux trois quatre cinq sixième septième huitième neuvième').length<=6);
});
test('texte pour l’IA : question + contexte, borné, consigne de ne rien inventer, aucune image',()=>{
 const p=aiPrompt('Q'.repeat(5000),'C'.repeat(10000));assert.ok(p.length<8000);assert.match(p,/N’invente aucune règle ni aucun chiffre/);assert.doesNotMatch(p,/data:image|base64/);
});
