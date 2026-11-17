import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blockAbove,buildSheet,checklist,colorName,diffLayouts,groupsOf,instructionFor,missionFields,probableFiles,readingOrder} from '../server/mockup-sheet.ts';
import {SITE_PALETTES} from '../server/site-palettes.ts';

/* Lot 5B (5B-3) — fiche et texte de mission par RÈGLES FIXES. Chaque cas donne le texte EXACT attendu (mêmes blocs → même texte).
   La palette utilisée est la vraie palette du Livre de recettes (lue dans le dépôt). */
const P=SITE_PALETTES.find((p)=>p.key==='recettes');
const pal={key:P.key,label:P.label,file:P.file,commit:P.commit,colors:P.colors,files:P.files};
const b=(id,label,over={})=>({id,kind:'button',label,x:16,y:100,w:120,h:40,group:'',fill:'',text_color:'',behavior:'',feature:null,...over});
const s=(blk)=>({id:blk.id,kind:blk.kind,label:blk.label,x:blk.x,y:blk.y,w:blk.w,h:blk.h,group_name:blk.group||null,fill:blk.fill,text_color:blk.text_color,behavior:blk.behavior,feature_id:null});
const input=(blocks,start,over={})=>({title:'Accueil',page_name:'Accueil',screen_width:360,screen_height:780,blocks,start:start===null?null:start.map(s),start_at:start===null?null:'2026-11-17T10:00:00.000Z',palette:pal,features:{},...over});
const one=(before,after,extra={})=>{const i=input(after,before,extra);return diffLayouts(i).map((c)=>instructionFor(c,i));};

/* ───── 1 à 22 : une règle, un texte exact ───── */
test('01 déplacé juste sous un autre bloc',()=>{
 const A=b('a','Recherche',{y:300}),B=b('b','Titre',{y:60,h:40});
 assert.deepEqual(one([B,A],[B,{...A,y:108}]),['Déplace « Recherche » juste sous « Titre » (position visée : 16 px du bord gauche, 108 px du haut ; avant : 16, 300).']);
});
test('02 déplacé sans voisin au-dessus : position en pixels',()=>{
 const A=b('a','Bouton',{x:16,y:100});assert.deepEqual(one([A],[{...A,x:200,y:500}]),['Déplace « Bouton » à 200 px du bord gauche et 500 px du haut (avant : 16, 100).']);
});
test('03 un voisin trop loin (plus de 24 px) n’est pas « juste au-dessus »',()=>{
 const A=b('a','Bouton',{y:300}),B=b('b','Titre',{y:60,h:40});assert.match(one([B,A],[B,{...A,y:125}])[0],/^Déplace « Bouton » à 16 px/);
});
test('04 un voisin qui ne chevauche pas horizontalement n’est pas « au-dessus »',()=>{
 const A=b('a','Bouton',{x:200,y:300,w:100}),B=b('b','Titre',{x:16,y:60,w:100,h:40});assert.match(one([B,A],[B,{...A,y:108}])[0],/à 200 px du bord gauche/);
});
test('05 redimensionné',()=>{
 const A=b('a','Carte');assert.deepEqual(one([A],[{...A,w:328,h:160}]),['Change la taille de « Carte » : 328 × 160 px sur un écran de 360 px de large (avant : 120 × 40).']);
});
test('06 regroupé (entre dans un groupe)',()=>{
 const A=b('a','Ajouter');assert.deepEqual(one([A],[{...A,group:'Actions'}]),['Regroupe « Ajouter » avec les autres éléments du groupe « Actions » : ils restent ensemble, côte à côte, et se déplacent ensemble.']);
});
test('07 séparé (sort d’un groupe)',()=>{
 const A=b('a','Ajouter',{group:'Actions'});assert.deepEqual(one([A],[{...A,group:''}]),['Sépare « Ajouter » du groupe « Actions » : il devient indépendant.']);
});
test('08 changé de groupe : un seul texte, vers le nouveau groupe',()=>{
 const A=b('a','Ajouter',{group:'Haut'});assert.deepEqual(one([A],[{...A,group:'Bas'}]),['Regroupe « Ajouter » avec les autres éléments du groupe « Bas » : ils restent ensemble, côte à côte, et se déplacent ensemble.']);
});
test('09 couleur de fond prise dans la palette : nom du jeton du site',()=>{
 const A=b('a','Enregistrer');assert.deepEqual(one([A],[{...A,fill:'#d39a62'}]),['Couleur de fond de « Enregistrer » : --accent (#d39a62), utilise la variable CSS du site plutôt que le code (avant : aucune).']);
});
test('10 couleur de texte hors palette : signalée',()=>{
 const A=b('a','Enregistrer');assert.deepEqual(one([A],[{...A,text_color:'#123456'}]),['Couleur du texte de « Enregistrer » : #123456 (hors palette du site) (avant : aucune).']);
});
test('11 couleur retirée',()=>{
 const A=b('a','Enregistrer',{fill:'#d39a62'});assert.deepEqual(one([A],[{...A,fill:''}]),['Couleur de fond de « Enregistrer » : aucune (avant : --accent (#d39a62)).']);
});
test('12 fond ET texte changés : deux consignes, fond d’abord',()=>{
 const A=b('a','Ok');const out=one([A],[{...A,fill:'#14110e',text_color:'#f3ece2'}]);assert.equal(out.length,2);assert.match(out[0],/^Couleur de fond de « Ok » : --bg \(#14110e\)/);assert.match(out[1],/^Couleur du texte de « Ok » : --text \(#f3ece2\)/);
});
test('13 ajouté',()=>{
 const A=b('a','Titre'),N=b('n','Barre du bas',{kind:'bottom_bar',x:0,y:720,w:360,h:60});
 assert.deepEqual(one([A],[A,N]),['Ajoute « Barre du bas » (barre du bas) à 0 px du bord gauche et 720 px du haut, taille 360 × 60 px.']);
});
test('14 retiré',()=>{
 const A=b('a','Titre'),R=b('r','Vieux bouton',{y:400});assert.deepEqual(one([A,R],[A]),['Retire « Vieux bouton » de cette page.']);
});
test('15 renommé',()=>{
 const A=b('a','Valider');assert.deepEqual(one([A],[{...A,label:'Enregistrer'}]),['Renomme « Valider » en « Enregistrer ».']);
});
test('16 changé de type',()=>{
 const A=b('a','Recherche');assert.deepEqual(one([A],[{...A,kind:'field'}]),['« Recherche » devient champ (avant : bouton).']);
});
test('17 comportement ajouté puis retiré',()=>{
 const A=b('a','Courses');assert.deepEqual(one([A],[{...A,behavior:'Ouvre la liste de courses.'}]),['Comportement de « Courses » : Ouvre la liste de courses.']);
 assert.deepEqual(one([{...A,behavior:'x'}],[A]),['« Courses » n\'a plus de comportement particulier.']);
});
test('18 lien vers une fonctionnalité du suivi',()=>{
 const A=b('a','Courses');assert.deepEqual(one([A],[{...A,feature:{code:'F-0012',name:'Liste de courses'}}]),['« Courses » sert la fonctionnalité F-0012 « Liste de courses ».']);
});
test('19 plusieurs changements sur un bloc : ordre fixe (nom, type, position, taille, groupe, couleurs)',()=>{
 const A=b('a','A'),B=b('b','B',{y:40,h:40});
 const out=one([A,B],[{...A,label:'A2',kind:'card',y:88,w:200,group:'G',fill:'#d39a62'},B]);
 assert.deepEqual(out.map((x)=>x.split(' ')[0]),['Renomme','«','Déplace','Change','Regroupe','Couleur']);
});
test('20 aucun écart',()=>{
 const A=b('a','A');assert.deepEqual(one([A],[A]),[]);
 assert.match(buildSheet(input([A],[A])).markdown,/Aucun écart : la maquette est identique à l’écran de départ\./);
});
test('21 écran de départ non fixé : pas d’écarts, mission sur la mise en page visée',()=>{
 const i=input([b('a','A')],null),sh=buildSheet(i);assert.equal(sh.changes,null);
 assert.match(sh.markdown,/L’écran de départ n’a pas été fixé/);assert.match(missionFields(i,sh).perimeter,/^Écran de départ non fixé : reproduire la mise en page visée ci-dessous\.\n1\. « A »/);
});
test('22 regroupement de deux blocs : deux consignes + une ligne de contrôle « ensemble »',()=>{
 const C=b('c','Ajouter',{x:16,y:600}),D=b('d','Partager',{x:180,y:600});
 const i=input([{...C,group:'Actions'},{...D,group:'Actions'}],[C,D]),sh=buildSheet(i);
 assert.equal(sh.instructions.filter((x)=>x.startsWith('Regroupe')).length,2);
 assert.ok(sh.checklist.includes('« Ajouter » et « Partager » sont ensemble (groupe « Actions »).'));
});

/* ───── ordre, déterminisme, fichiers, mission ───── */
test('23 ordre de lecture : haut → bas, puis gauche → droite ; même ligne à 8 px près',()=>{
 const l=[b('3','C',{x:200,y:105}),b('1','A',{x:16,y:300}),b('2','B',{x:16,y:100})];assert.deepEqual(readingOrder(l).map((x)=>x.label),['B','C','A']);
 assert.deepEqual(readingOrder([b('1','Droite',{x:200,y:100}),b('2','Gauche',{x:16,y:104})]).map((x)=>x.label),['Gauche','Droite'],'même ligne à 4 px près : gauche d’abord');
 assert.deepEqual(readingOrder([b('1','Haut',{x:200,y:100}),b('2','Bas',{x:16,y:109})]).map((x)=>x.label),['Haut','Bas'],'9 px d’écart : deux lignes');
});
test('24 mêmes blocs dans un autre ordre → fiche et mission identiques au caractère près',()=>{
 const A=b('a','Titre',{y:40}),B=b('b','Carte',{y:100,group:'G',fill:'#d39a62'}),C=b('c','Bas',{y:700,x:0,w:360});
 const st=[A,{...B,group:'',fill:''},C];
 const i1=input([A,B,C],st),i2=input([C,A,B],[C,{...B,group:'',fill:''},A]);
 const s1=buildSheet(i1),s2=buildSheet(i2);assert.equal(s1.markdown,s2.markdown);assert.deepEqual(missionFields(i1,s1),missionFields(i2,s2));
 assert.equal(buildSheet(i1).markdown,s1.markdown,'deux appels → même texte');
});
test('25 fichiers probablement concernés : feuille de styles si couleur, page d’entrée, et noms de fichiers qui reprennent un mot',()=>{
 const i=input([b('a','Planner',{fill:'#d39a62'})],null,{page_name:'Agenda'});
 const f=probableFiles(i,null);assert.equal(f[0],'public/css/app.css');assert.ok(f.includes('public/index.html'));assert.ok(f.includes('public/js/core/agenda.js'));assert.ok(f.includes('public/js/core/planner.js'));
 assert.deepEqual(probableFiles(input([b('a','X')],null,{palette:null}),null),[]);
 for(const x of f)assert.ok(P.files.includes(x),'fichier inventé : '+x);
});
test('26 la mission est marquée Hypothèse pour les fichiers et ne dépasse pas 3000 caractères par champ',()=>{
 const many=Array.from({length:60},(_,i)=>b(`id${String(i).padStart(3,'0')}`,'Bloc numéro '+i+' au nom assez long pour remplir',{y:i*12,h:10}));
 const i=input(many.map((x)=>({...x,x:x.x+4})),many),sh=buildSheet(i),f=missionFields(i,sh);
 for(const [k,v] of Object.entries(f))assert.ok(v.length<=3000,k+' '+v.length);
 assert.match(f.perimeter,/autre\(s\) point\(s\) dans la fiche de mise en page jointe/);
 assert.match(missionFields(input([b('a','A',{fill:'#d39a62'})],null),buildSheet(input([b('a','A',{fill:'#d39a62'})],null))).files,/^Hypothèse \(liste des fichiers du dépôt au commit 92ec7c5, contenu non lu\)/);
});
test('27 liste de contrôle : ordre de lecture, groupe, placement, couleur, et rien d’autre n’a changé',()=>{
 const A=b('a','Titre',{y:40,h:40}),B=b('b','Bouton',{y:300});
 const i=input([A,{...B,y:88,fill:'#d39a62'}],[A,B]),l=checklist(i,diffLayouts(i));
 assert.deepEqual(l,['De haut en bas, on voit dans cet ordre : « Titre », « Bouton ».','« Bouton » est juste sous « Titre ».','Le fond de « Bouton » a la couleur --accent (#d39a62).','Rien d’autre n’a changé sur la page, et les autres pages sont identiques.','À 360 px de large, rien ne dépasse à droite et les boutons se touchent facilement.']);
});
test('28 aides : couleur sans palette, groupes triés, bloc au-dessus le plus proche',()=>{
 assert.equal(colorName('#d39a62',null),'#d39a62 (hors palette du site)');assert.equal(colorName('',pal),'aucune');
 assert.deepEqual(groupsOf([b('1','Z',{group:'b'}),b('2','Y',{group:'a',y:50}),b('3','X',{group:'a',y:10})]),[{name:'a',members:['X','Y']},{name:'b',members:['Z']}]);
 const t=[b('1','Loin',{y:0,h:40}),b('2','Près',{y:70,h:20})];assert.equal(blockAbove({id:'x',x:16,y:100,w:50},t),'Près');
});
test('29 la fiche ne contient aucun secret ni chemin local, et dit qu’elle est faite sans IA',()=>{
 const md=buildSheet(input([b('a','A',{fill:'#d39a62'})],[b('a','A')])).markdown;
 assert.match(md,/règles fixes, sans IA/);assert.doesNotMatch(md,/\/home\/|password|token=|sk-/i);
 assert.match(md,/Atelier ne promet pas une reproduction au pixel près/);
});
