import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addBlock,clampDelta,deleteBlocks,deleteGroup,groupBlocks,moveBlocks,placeUnder,resizeBlocks,setColors,ungroupBlocks,updateBlock} from '../web/mockup-edit.ts';
import {applyOps} from '../server/mockup-core.ts';

/* Lot 5B (5B-2) — actions de l'écran. Propriété centrale : pour chaque action, « aller » puis « inverse » rend EXACTEMENT l'état d'avant,
   quand les deux sont rejouées par le vrai moteur du serveur (applyOps). Et le serveur accepte toujours ce que l'écran envoie. */
const W=360,H=780;
const ids=['a','b','c','d'].map((l,i)=>`${l}0000000-0000-4000-8000-00000000000${i+1}`);const [A,B,C,D]=ids;
const ui=(id,over={})=>({id,kind:'button',label:'Bloc '+id[0],x:20,y:100,w:100,h:40,group_name:'',fill:'',text_color:'',behavior:'',feature:null,...over});
const scene=()=>[ui(A,{y:100}),ui(B,{y:200,group_name:'G',x:30}),ui(C,{y:300,group_name:'G',x:40}),ui(D,{y:400,x:200})];
const toState=(all,groups)=>({blocks:all.map((b,i)=>({id:b.id,kind:b.kind,label:b.label,x:b.x,y:b.y,w:b.w,h:b.h,position:i,group:b.group_name||null,fill:b.fill,text_color:b.text_color,behavior:b.behavior,feature_id:b.feature?.id??null})),groups});
const ctx={screen_width:W,screen_height:H,featureExists:()=>true};
const canon=(o)=>Object.fromEntries(Object.keys(o).sort().map((k)=>[k,o[k]]));
const norm=(l)=>JSON.stringify({g:[...l.groups].sort(),b:l.blocks.map((b)=>canon({...b,position:0})).sort((p,q)=>p.id.localeCompare(q.id))});
/** aller puis inverse = état d'origine ; l'aller change bien quelque chose. */
function roundTrip(entry,groups=['G']){
 const start=toState(scene(),groups),mid=applyOps(start,entry.forward,ctx),back=applyOps(mid,entry.inverse,ctx);
 assert.notEqual(norm(mid),norm(start),'l’aller doit changer quelque chose');assert.equal(norm(back),norm(start),'l’inverse doit tout rétablir');
 return mid;
}
const posOf=(l,id)=>l.blocks.find((b)=>b.id===id);

test('déplacer au doigt ou par bouton : de dx,dy ; inverse exact',()=>{
 const e=moveBlocks(scene(),[A],15,-20,false,W,H);assert.deepEqual(e.forward,[{op:'update',id:A,patch:{x:35,y:80}}]);
 const mid=roundTrip(e);assert.deepEqual([posOf(mid,A).x,posOf(mid,A).y],[35,80]);
});
test('déplacer : limité au bord de l’écran (pas d’erreur, pas de sortie) ; déjà au bord = rien à faire',()=>{
 assert.equal(moveBlocks(scene(),[A],-500,0,false,W,H).forward[0].patch.x,0);
 assert.equal(moveBlocks(scene(),[A],0,5000,false,W,H).forward[0].patch.y,H-40);
 assert.equal(moveBlocks([ui(A,{x:0})],[A],-10,0,false,W,H),null);
 assert.deepEqual(clampDelta([ui(A,{x:300,w:60})],50,0,W,H),{dx:0,dy:0});
});
test('déplacer plusieurs blocs ensemble : le plus contraint décide pour tous',()=>{
 const e=moveBlocks(scene(),[A,D],200,0,false,W,H);// D est à x=200,w=100 → max +60
 assert.deepEqual(e.forward.map((o)=>o.patch.x),[80,260]);roundTrip(e);
});
test('déplacer un bloc d’un groupe SEUL (sans l’option) ne touche pas le reste du groupe',()=>{
 const e=moveBlocks(scene(),[B],10,0,false,W,H);assert.equal(e.forward.length,1);assert.equal(e.forward[0].op,'update');roundTrip(e);
});
test('déplacer avec « tout le groupe » : une seule opération de groupe, les autres blocs inchangés',()=>{
 const e=moveBlocks(scene(),[B],10,5,true,W,H);assert.deepEqual(e.forward,[{op:'move_group',name:'G',dx:10,dy:5}]);
 const mid=roundTrip(e);assert.equal(posOf(mid,C).x,50);assert.equal(posOf(mid,A).x,20);
});
test('déplacer le groupe : le bloc le plus à droite du groupe limite le mouvement',()=>{
 const e=moveBlocks(scene(),[B],1000,0,true,W,H);assert.equal(e.forward[0].dx,W-100-40);roundTrip(e);
});
test('plus de 12 blocs d’un coup → message clair, rien envoyé',()=>{
 const many=Array.from({length:13},(_,i)=>ui(`e${String(i).padStart(7,'0')}-0000-4000-8000-000000000000`,{x:10,y:10*i}));
 assert.throws(()=>moveBlocks(many,many.map((b)=>b.id),5,0,false,W,H),/12 au plus/);
});
test('redimensionner : borné à l’écran et à 8 px minimum ; inverse exact',()=>{
 const e=resizeBlocks(scene(),[A],50,10,W,H);assert.deepEqual(e.forward[0].patch,{w:150,h:50});roundTrip(e);
 assert.equal(resizeBlocks(scene(),[A],9999,0,W,H).forward[0].patch.w,W-20);
 assert.equal(resizeBlocks(scene(),[A],-9999,-9999,W,H).forward[0].patch.w,8);
 assert.equal(resizeBlocks([ui(A,{x:0,w:360})],[A],10,0,W,H),null);
});
test('placer sous un autre bloc : même bord gauche, 8 px en dessous ; refus si pas de place',()=>{
 const e=placeUnder(scene(),D,A,8,W,H);assert.deepEqual(e.forward[0].patch,{x:20,y:148});roundTrip(e);
 assert.throws(()=>placeUnder(scene(),A,A,8,W,H),/autre bloc/);
 assert.throws(()=>placeUnder([ui(A,{y:100}),ui(B,{y:700,h:70})],A,B,8,W,H),/pas assez de place/);
 assert.equal(placeUnder([ui(A,{x:20,y:100}),ui(B,{x:20,y:148})],B,A,8,W,H),null);
});
test('couleur de fond et de texte : inverse exact ; même couleur = rien à faire ; plusieurs blocs',()=>{
 const e=setColors(scene(),[A,D],{fill:'#d39a62',text_color:'#14110e'});assert.equal(e.forward.length,2);roundTrip(e);
 assert.equal(setColors([ui(A,{fill:'#d39a62'})],[A],{fill:'#d39a62'}),null);
 const clear=setColors([ui(A,{fill:'#d39a62'})],[A],{fill:''});assert.deepEqual(clear.forward[0].patch,{fill:''});assert.deepEqual(clear.inverse[0].patch,{fill:'#d39a62'});
});
test('grouper : crée le groupe ; l’inverse remet chacun dans son groupe d’avant et supprime le groupe créé',()=>{
 const e=groupBlocks(scene(),[A,B,D],'Haut',['G']);// B vient du groupe G, A et D étaient seuls
 assert.deepEqual(e.forward,[{op:'group',ids:[A,B,D],name:'Haut'}]);
 const mid=roundTrip(e);assert.deepEqual(mid.groups.sort(),['G','Haut']);assert.equal(posOf(mid,B).group,'Haut');
 assert.throws(()=>groupBlocks(scene(),[A],'  ',[]),/nom au groupe/);
});
test('grouper dans un groupe qui existe déjà : l’inverse ne supprime pas ce groupe',()=>{
 const e=groupBlocks(scene(),[A],'G',['G']);assert.ok(!e.inverse.some((o)=>o.op==='delete_group'));roundTrip(e);
});
test('séparer : sort les blocs de leur groupe ; rien à séparer = null',()=>{
 const e=ungroupBlocks(scene(),[B,C]);assert.deepEqual(e.forward,[{op:'ungroup',ids:[B,C]}]);
 const start=toState(scene(),['G']),mid=applyOps(start,e.forward,ctx);assert.equal(posOf(mid,B).group,null);assert.equal(norm(applyOps(mid,e.inverse,ctx)),norm(start));
 assert.equal(ungroupBlocks(scene(),[A,D]),null);
 assert.deepEqual(ungroupBlocks(scene(),[A,B]).forward[0].ids,[B]);
});
test('supprimer le groupe : les blocs restent, détachés ; l’inverse les regroupe',()=>{
 const e=deleteGroup(scene(),'G');const start=toState(scene(),['G']),mid=applyOps(start,e.forward,ctx);
 assert.deepEqual(mid.groups,[]);assert.equal(posOf(mid,B).group,null);assert.equal(norm(applyOps(mid,e.inverse,ctx)),norm(start));
});
test('supprimer des blocs puis annuler : mêmes blocs, mêmes réglages, même groupe',()=>{
 const e=deleteBlocks(scene(),[A,B]);const start=toState(scene(),['G']),mid=applyOps(start,e.forward,ctx);assert.equal(mid.blocks.length,2);
 const back=applyOps(mid,e.inverse,ctx);assert.equal(norm(back),norm(start));
 assert.throws(()=>deleteBlocks(Array.from({length:13},(_,i)=>ui(`e${String(i).padStart(7,'0')}-0000-4000-8000-000000000000`)),Array.from({length:13},(_,i)=>`e${String(i).padStart(7,'0')}-0000-4000-8000-000000000000`)),/12 au plus/);
});
test('ajouter un bloc : annuler le supprime (même identifiant)',()=>{
 const n=ui('f0000000-0000-4000-8000-0000000000f1',{x:0,y:600,w:360,h:60,kind:'bottom_bar'}),e=addBlock(n);
 const start=toState(scene(),['G']),mid=applyOps(start,e.forward,ctx);assert.equal(mid.blocks.length,5);assert.equal(norm(applyOps(mid,e.inverse,ctx)),norm(start));
});
test('modifier un champ (nom, type, comportement, fonctionnalité) : seulement ce qui change ; inverse exact',()=>{
 const e=updateBlock(scene(),A,{label:'Nouveau',kind:'card',x:20,behavior:'Ouvre la liste'});assert.deepEqual(Object.keys(e.forward[0].patch).sort(),['behavior','kind','label']);roundTrip(e);
 assert.equal(updateBlock(scene(),A,{x:20,y:100}),null);
 const f=updateBlock(scene(),A,{feature_id:'f0000000-0000-4000-8000-000000000001'});assert.deepEqual(f.inverse[0].patch,{feature_id:null});
});
test('tout ce que l’écran envoie est accepté par le serveur (jamais de refus pour un geste normal)',()=>{
 const start=toState(scene(),['G']);
 for(const e of [moveBlocks(scene(),[A,D],500,500,false,W,H),moveBlocks(scene(),[C],-500,-500,true,W,H),resizeBlocks(scene(),[A,B,C,D],999,999,W,H),placeUnder(scene(),A,D,8,W,H),groupBlocks(scene(),[A,B,C,D],'Tout',['G']),deleteBlocks(scene(),[A,B,C,D])])
  assert.doesNotThrow(()=>applyOps(start,e.forward,ctx));
});
