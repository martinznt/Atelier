import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAX_BLOCKS,MAX_GROUPS,MAX_OPS,MAX_WRITES,MockupError,applyOps,planWrites} from '../server/mockup-core.ts';
import {SITE_PALETTES} from '../server/site-palettes.ts';

/* Lot 5B (5B-2) — opérations de modification : déplacer, redimensionner, colorier, grouper, séparer, ajouter, supprimer.
   Chaque règle a un cas qui la déclenche et un cas qui ne la déclenche pas. Rien n'est jamais appliqué à moitié. */
const ctx={screen_width:360,screen_height:780,featureExists:(id)=>id==='f0000000-0000-4000-8000-000000000001'};
const A='a0000000-0000-4000-8000-000000000001',B='b0000000-0000-4000-8000-000000000002',C='c0000000-0000-4000-8000-000000000003',D='d0000000-0000-4000-8000-000000000004';
const blk=(id,over={})=>({id,kind:'button',label:'B'+id[0],x:16,y:100,w:100,h:40,position:0,group:null,fill:'',text_color:'',behavior:'',feature_id:null,...over});
const base=()=>({blocks:[blk(A,{position:0,y:100}),blk(B,{position:1,y:200}),blk(C,{position:2,y:300})],groups:[]});
const err=(fn,status,re)=>assert.throws(fn,(e)=>e instanceof MockupError&&e.status===status&&re.test(e.message),`attendu ${status} ${re}`);
const get=(l,id)=>l.blocks.find((b)=>b.id===id);

/* ───── déplacer / redimensionner ───── */
test('update : déplace un bloc ; la copie d’origine n’est pas modifiée',()=>{
 const l=base(),r=applyOps(l,[{op:'update',id:A,patch:{x:40,y:150}}],ctx);
 assert.deepEqual([get(r,A).x,get(r,A).y],[40,150]);assert.deepEqual([get(l,A).x,get(l,A).y],[16,100]);
});
test('update : redimensionne ; bord exact accepté, un pixel de plus refusé',()=>{
 assert.doesNotThrow(()=>applyOps(base(),[{op:'update',id:A,patch:{x:0,w:360}}],ctx));
 err(()=>applyOps(base(),[{op:'update',id:A,patch:{x:0,w:361}}],ctx),400,/dépasse à droite/);
 assert.doesNotThrow(()=>applyOps(base(),[{op:'update',id:A,patch:{y:740,h:40}}],ctx));
 err(()=>applyOps(base(),[{op:'update',id:A,patch:{y:741,h:40}}],ctx),400,/dépasse en bas/);
});
test('update : valeurs négatives, décimales ou vides refusées',()=>{
 err(()=>applyOps(base(),[{op:'update',id:A,patch:{x:-1}}],ctx),400,/avant le bord/);
 err(()=>applyOps(base(),[{op:'update',id:A,patch:{x:1.5}}],ctx),400,/entier/);
 err(()=>applyOps(base(),[{op:'update',id:A,patch:{w:''}}],ctx),400,/entier/);
});
test('update : champ interdit (id, groupe, position) et patch vide refusés',()=>{
 err(()=>applyOps(base(),[{op:'update',id:A,patch:{id:B}}],ctx),400,/pas permise/);
 err(()=>applyOps(base(),[{op:'update',id:A,patch:{group:'X'}}],ctx),400,/pas permise/);
 err(()=>applyOps(base(),[{op:'update',id:A,patch:{}}],ctx),400,/Aucune modification/);
});
test('update : bloc inconnu refusé',()=>err(()=>applyOps(base(),[{op:'update',id:D,patch:{x:1}}],ctx),400,/n’existe plus/));

/* ───── couleurs ───── */
test('couleur : #rrggbb accepté (majuscules ramenées en minuscules), « aucune » = chaîne vide',()=>{
 const r=applyOps(base(),[{op:'update',id:A,patch:{fill:'#D39A62',text_color:'#14110e'}}],ctx);assert.equal(get(r,A).fill,'#d39a62');
 const r2=applyOps(r,[{op:'update',id:A,patch:{fill:''}}],ctx);assert.equal(get(r2,A).fill,'');
});
test('couleur : refuse un nom, du code, une valeur courte',()=>{
 for(const bad of ['rouge','#fff','url(x)','#d39a62;x'])err(()=>applyOps(base(),[{op:'update',id:A,patch:{fill:bad}}],ctx),400,/#rrggbb/);
});

/* ───── grouper / séparer ───── */
test('group : réunit des blocs sous un nom et crée le groupe',()=>{
 const r=applyOps(base(),[{op:'group',ids:[A,B],name:'Actions'}],ctx);
 assert.deepEqual(r.groups,['Actions']);assert.equal(get(r,A).group,'Actions');assert.equal(get(r,B).group,'Actions');assert.equal(get(r,C).group,null);
});
test('group : réutilise un groupe existant sans le dupliquer',()=>{
 const l={...base(),groups:['Actions']};const r=applyOps(l,[{op:'group',ids:[C],name:'Actions'}],ctx);assert.deepEqual(r.groups,['Actions']);
});
test('group : nom vide, trop long, aucun bloc, doublon, bloc inconnu refusés',()=>{
 err(()=>applyOps(base(),[{op:'group',ids:[A],name:'  '}],ctx),400,/nom au groupe/);
 err(()=>applyOps(base(),[{op:'group',ids:[A],name:'x'.repeat(61)}],ctx),400,/trop long/);
 err(()=>applyOps(base(),[{op:'group',ids:[],name:'G'}],ctx),400,/au moins un bloc/);
 err(()=>applyOps(base(),[{op:'group',ids:[A,A],name:'G'}],ctx),400,/deux fois/);
 err(()=>applyOps(base(),[{op:'group',ids:[A,D],name:'G'}],ctx),400,/n’existe plus/);
});
test('group : 30 groupes acceptés, le 31e refusé',()=>{
 const names=Array.from({length:MAX_GROUPS},(_,i)=>'G'+i);
 assert.doesNotThrow(()=>applyOps({...base(),groups:names.slice(0,MAX_GROUPS-1)},[{op:'group',ids:[A],name:'dernier'}],ctx));
 err(()=>applyOps({...base(),groups:names},[{op:'group',ids:[A],name:'trop'}],ctx),409,/30 groupes/);
});
test('ungroup : sépare ; un bloc déjà seul reste seul',()=>{
 const l=applyOps(base(),[{op:'group',ids:[A,B],name:'G'}],ctx);
 const r=applyOps(l,[{op:'ungroup',ids:[A,C]}],ctx);assert.equal(get(r,A).group,null);assert.equal(get(r,B).group,'G');assert.equal(get(r,C).group,null);
});
test('delete_group : le groupe disparaît, ses blocs restent, détachés',()=>{
 const l=applyOps(base(),[{op:'group',ids:[A,B],name:'G'}],ctx),r=applyOps(l,[{op:'delete_group',name:'G'}],ctx);
 assert.deepEqual(r.groups,[]);assert.equal(r.blocks.length,3);assert.equal(get(r,A).group,null);
 err(()=>applyOps(base(),[{op:'delete_group',name:'Absent'}],ctx),400,/n’existe pas/);
});
test('move_group : déplace tous les blocs du groupe ensemble',()=>{
 const l=applyOps(base(),[{op:'group',ids:[A,B],name:'G'}],ctx),r=applyOps(l,[{op:'move_group',name:'G',dx:10,dy:-50}],ctx);
 assert.deepEqual([get(r,A).x,get(r,A).y,get(r,B).x,get(r,B).y,get(r,C).y],[26,50,26,150,300]);
});
test('move_group : refuse si UN bloc du groupe sortirait de l’écran (rien n’est déplacé)',()=>{
 const l=applyOps(base(),[{op:'group',ids:[A,B],name:'G'}],ctx);
 err(()=>applyOps(l,[{op:'move_group',name:'G',dx:0,dy:-101}],ctx),400,/sortirait de l’écran/);
 assert.doesNotThrow(()=>applyOps(l,[{op:'move_group',name:'G',dx:0,dy:-100}],ctx));
 err(()=>applyOps(l,[{op:'move_group',name:'Absent',dx:1,dy:1}],ctx),400,/n’existe pas/);
 err(()=>applyOps(l,[{op:'move_group',name:'G',dx:'a',dy:1}],ctx),400,/entier/);
});

/* ───── ajouter / supprimer ───── */
const NEW={kind:'card',label:'Carte',x:0,y:0,w:360,h:100};
test('add : crée un bloc à la fin, avec un identifiant ; groupe créé au passage',()=>{
 const r=applyOps(base(),[{op:'add',block:{...NEW,group_name:'Haut'}}],ctx);const n=r.blocks.at(-1);
 assert.equal(n.position,3);assert.match(n.id,/^[0-9a-f-]{36}$/);assert.equal(n.group,'Haut');assert.deepEqual(r.groups,['Haut']);
});
test('add : identifiant fourni gardé (sert à annuler une suppression) ; doublon ou format faux refusés',()=>{
 assert.equal(applyOps(base(),[{op:'add',block:{...NEW,id:D}}],ctx).blocks.at(-1).id,D);
 err(()=>applyOps(base(),[{op:'add',block:{...NEW,id:A}}],ctx),409,/existe déjà/);
 err(()=>applyOps(base(),[{op:'add',block:{...NEW,id:'pas-un-uuid'}}],ctx),400,/Identifiant/);
});
test('add : 100 blocs acceptés, le 101e refusé ; hors écran refusé',()=>{
 const full={blocks:Array.from({length:MAX_BLOCKS-1},(_,i)=>blk(`e${String(i).padStart(7,'0')}-0000-4000-8000-000000000000`,{position:i})),groups:[]};
 assert.doesNotThrow(()=>applyOps(full,[{op:'add',block:NEW}],ctx));
 err(()=>applyOps({blocks:[...full.blocks,blk(D,{position:99})],groups:[]},[{op:'add',block:NEW}],ctx),409,/100 blocs/);
 err(()=>applyOps(base(),[{op:'add',block:{...NEW,x:10}}],ctx),400,/dépasse à droite/);
});
test('add / update : fonctionnalité d’un autre projet refusée, celle du projet acceptée',()=>{
 const F='f0000000-0000-4000-8000-000000000001';
 assert.equal(applyOps(base(),[{op:'add',block:{...NEW,feature_id:F}}],ctx).blocks.at(-1).feature_id,F);
 err(()=>applyOps(base(),[{op:'add',block:{...NEW,feature_id:'f0000000-0000-4000-8000-0000000000ff'}}],ctx),400,/fonctionnalité/);
 assert.equal(get(applyOps(base(),[{op:'update',id:A,patch:{feature_id:F}}],ctx),A).feature_id,F);
 err(()=>applyOps(base(),[{op:'update',id:A,patch:{feature_id:'f0000000-0000-4000-8000-0000000000ff'}}],ctx),400,/fonctionnalité/);
 assert.equal(get(applyOps(applyOps(base(),[{op:'update',id:A,patch:{feature_id:F}}],ctx),[{op:'update',id:A,patch:{feature_id:null}}],ctx),A).feature_id,null);
});
test('delete : retire le bloc ; bloc inconnu refusé',()=>{
 assert.deepEqual(applyOps(base(),[{op:'delete',id:B}],ctx).blocks.map((b)=>b.id),[A,C]);err(()=>applyOps(base(),[{op:'delete',id:D}],ctx),400,/n’existe plus/);
});

/* ───── lots d'opérations ───── */
test('lot : tout ou rien — une opération fautive annule les précédentes du même lot',()=>{
 const l=base();err(()=>applyOps(l,[{op:'update',id:A,patch:{x:50}},{op:'update',id:B,patch:{x:-5}}],ctx),400,/avant le bord/);
 assert.equal(get(l,A).x,16);
});
test('lot : 12 opérations acceptées, 13 refusées ; liste vide ou inconnue refusée',()=>{
 const ops=(n)=>Array.from({length:n},(_,i)=>({op:'update',id:A,patch:{x:i}}));
 assert.doesNotThrow(()=>applyOps(base(),ops(MAX_OPS),ctx));err(()=>applyOps(base(),ops(MAX_OPS+1),ctx),400,/Trop de modifications/);
 err(()=>applyOps(base(),[],ctx),400,/Aucune/);err(()=>applyOps(base(),[{op:'exploser'}],ctx),400,/inconnue/);err(()=>applyOps(base(),'x',ctx),400,/Aucune/);
});
test('annuler : l’opération inverse rend exactement l’état d’avant (déplacer, grouper, ajouter-supprimer)',()=>{
 const l=base();
 const moved=applyOps(l,[{op:'update',id:A,patch:{x:80,y:210}}],ctx),back=applyOps(moved,[{op:'update',id:A,patch:{x:16,y:100}}],ctx);assert.deepEqual(back,l);
 const g=applyOps(l,[{op:'group',ids:[A,B],name:'G'}],ctx),ug=applyOps(g,[{op:'ungroup',ids:[A,B]},{op:'delete_group',name:'G'}],ctx);assert.deepEqual(ug,l);
 const gone=applyOps(l,[{op:'delete',id:B}],ctx),again=applyOps(gone,[{op:'add',block:{...get(l,B),group_name:null}}],ctx);
 assert.deepEqual(again.blocks.map((b)=>[b.id,b.x,b.y,b.w,b.h,b.label]).sort(),l.blocks.map((b)=>[b.id,b.x,b.y,b.w,b.h,b.label]).sort());
});

/* ───── plan d'écriture : peu de requêtes ───── */
test('planWrites : rien ne change → rien à écrire',()=>assert.deepEqual(planWrites(base(),base()),[]));
test('planWrites : un déplacement de groupe = UNE requête, quel que soit le nombre de blocs',()=>{
 const blocks=Array.from({length:60},(_,i)=>blk(`e${String(i).padStart(7,'0')}-0000-4000-8000-000000000000`,{position:i,group:'G',y:10}));
 const l={blocks,groups:['G']},r=applyOps(l,[{op:'move_group',name:'G',dx:5,dy:20}],ctx),w=planWrites(l,r);
 assert.equal(w.length,1);assert.deepEqual([w[0].t,w[0].dx,w[0].dy,w[0].ids.length],['translate',5,20,60]);
});
test('planWrites : grouper plusieurs blocs = group_add + une seule requête de rattachement',()=>{
 const w=planWrites(base(),applyOps(base(),[{op:'group',ids:[A,B,C],name:'G'}],ctx));assert.deepEqual(w.map((x)=>x.t),['group_add','set_group']);assert.equal(w[1].ids.length,3);
});
test('planWrites : couleur ou taille = une mise à jour du bloc ; suppression = une requête pour plusieurs blocs',()=>{
 assert.deepEqual(planWrites(base(),applyOps(base(),[{op:'update',id:A,patch:{fill:'#d39a62'}}],ctx)).map((x)=>x.t),['block_update']);
 const w=planWrites(base(),applyOps(base(),[{op:'delete',id:A},{op:'delete',id:B}],ctx));assert.deepEqual(w.map((x)=>x.t),['block_delete']);assert.equal(w[0].ids.length,2);
});
test('planWrites : au plus 40 écritures différentes',()=>{
 const blocks=Array.from({length:50},(_,i)=>blk(`e${String(i).padStart(7,'0')}-0000-4000-8000-000000000000`,{position:i,y:i*10,h:8}));
 const l={blocks,groups:[]},ops=(from)=>Array.from({length:12},(_,i)=>({op:'update',id:blocks[from+i].id,patch:{w:50+i}}));
 let cur=l;for(const f of [0,12,24])cur=applyOps(cur,ops(f),ctx);
 assert.ok(planWrites(l,cur).length<=MAX_WRITES);
 const more=applyOps(cur,ops(36),ctx);err(()=>planWrites(l,more),413,/Trop de changements/);
});

/* ───── palettes lues dans les dépôts ───── */
test('palettes : deux sites, couleurs valides, chacune avec sa ligne ; commits épinglés',()=>{
 assert.deepEqual(SITE_PALETTES.map((p)=>p.key),['recettes','sport']);
 for(const p of SITE_PALETTES){assert.match(p.commit,/^[0-9a-f]{40}$/);assert.ok(p.colors.length>=10);for(const c of p.colors){assert.match(c.hex,/^#[0-9a-f]{6}$/);assert.ok(c.line>0);assert.match(c.token,/^--[a-z0-9-]+$/);}}
 assert.equal(SITE_PALETTES[0].colors.find((c)=>c.token==='--accent').hex,'#d39a62');assert.equal(SITE_PALETTES[1].colors.find((c)=>c.token==='--accent').hex,'#c8914d');
});
