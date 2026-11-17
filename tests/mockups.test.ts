import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {Miniflare} from 'miniflare';import {build} from 'esbuild';import {readFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeMigrationForD1} from './migration-sql.mjs';
/* Lot 5B (5B-1) — maquettes d'écran : parcours complet dans Miniflare (vraie base D1 locale, aucun réseau).
   Les captures sont des en-têtes WebP/PNG fabriqués octet par octet (le vrai encodage du navigateur est joué dans tests/e2e/lot5b.spec.ts). */
let mf:Miniflare,db:D1Database;const origin='http://localhost:8787';
let a:string,b:string,ownerA:string,projectA:string,projectB:string,featA:string,featB:string,decCurrent:string,decProposed:string;
async function call(path:string,method='GET',data?:unknown,cookie=a){return mf.dispatchFetch(`${origin}/api${path}`,{method,headers:{Origin:origin,Cookie:cookie||'',...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});}
async function json(path:string,method='GET',data?:unknown,cookie=a){const r=await call(path,method,data,cookie);const text=await r.text();let body:any=null;try{body=JSON.parse(text);}catch{body=text;}return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const le16=(n:number)=>[n&255,(n>>8)&255];
const webp=(w:number,h:number,size=64)=>{const a=new Uint8Array(Math.max(size,64));a.set([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50,0x56,0x50,0x38,0x20,0,0,0,0,0x10,0,0,0x9d,0x01,0x2a,...le16(w),...le16(h)]);return a;};
const b64=(u:Uint8Array)=>Buffer.from(u).toString('base64');
const put=(id:string,u:Uint8Array,cookie=a)=>json(`/mockups/${id}/image`,'PUT',{mime:'image/webp',data:b64(u)},cookie);
const newMockup=async(title='Accueil',project=projectA,cookie=a)=>(await json('/mockups','POST',{project_id:project,title,page_name:'Accueil'},cookie)).body;
const block=(over:any={})=>({kind:'button',label:'Bouton Enregistrer',x:16,y:600,w:328,h:48,...over});
beforeAll(async()=>{
 await mkdir('test-results',{recursive:true});await build({entryPoints:['server/index.ts'],outfile:'test-results/worker-mockups.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022'});
 mf=new Miniflare({modules:true,scriptPath:'test-results/worker-mockups.mjs',compatibilityDate:'2025-10-24',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],queueProducers:{TASKS:'atelier-tasks-mockups'},bindings:{MASTER_KEY:Buffer.alloc(32,7).toString('base64'),APP_ORIGIN:origin,ALLOW_REGISTRATION:'true',STORAGE_LIMIT_MB:'1',MAX_FILE_MB:'1'}});
 db=await mf.getD1Database('DB');
 for(const m of (await readdir('migrations')).filter(n=>/^\d+.*\.sql$/.test(n)).sort())await db.exec(normalizeMigrationForD1(await readFile(`migrations/${m}`,'utf8')));
 const ra=await json('/auth/register','POST',{email:'alice-5b@example.test',password:'phrase-de-test-solide-2026'},'');a=ra.cookie!;ownerA=ra.body.user.id;
 const rb=await json('/auth/register','POST',{email:'bob-5b@example.test',password:'autre-phrase-solide-2026'},'');b=rb.cookie!;
 projectA=(await json('/projects','POST',{name:'Livre de recettes (essai)'})).body.id;projectB=(await json('/projects','POST',{name:'Projet de Bob'},b)).body.id;
 const bobId=(await json('/auth/me','GET',undefined,b)).body.user.id,at=new Date().toISOString();
 featA=crypto.randomUUID();featB=crypto.randomUUID();
 await db.prepare("INSERT INTO project_features(id,user_id,project_id,code,name,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(featA,ownerA,projectA,'F-0001','Liste de courses',at,at).run();
 await db.prepare("INSERT INTO project_features(id,user_id,project_id,code,name,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(featB,bobId,projectB,'F-0001','Fonction de Bob',at,at).run();
 decCurrent=crypto.randomUUID();decProposed=crypto.randomUUID();
 for(const [id,st,title] of [[decCurrent,'validated','Thème noir et blanc inchangé'],[decProposed,'proposed','Passer en bleu (proposée seulement)']])await db.prepare("INSERT INTO project_decisions(id,user_id,project_id,title,reason,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,ownerA,projectA,title,'Raison',st,at,at).run();
});
afterAll(async()=>{await mf?.dispose();});

describe('maquettes d’écran (5B-1)',()=>{
 it('crée une maquette vide : sans capture, sans bloc, et montre seulement les décisions ACTUELLES avec leur niveau',async()=>{
  const m=await newMockup();expect(m.title).toBe('Accueil');expect(m.has_image).toBe(false);expect(m.blocks).toEqual([]);expect(m.screen_width).toBe(360);
  expect(m.context.decisions.map((d:any)=>d.title)).toEqual(['Thème noir et blanc inchangé']);
  expect(m.context.decisions[0].reliability_word).toBe('Confirmé par vous');
  expect(m.context.features.map((f:any)=>f.code)).toEqual(['F-0001']);
  expect((await json('/mockups','POST',{project_id:projectA,title:'   '})).status).toBe(400);
  expect((await json('/mockups','POST',{project_id:projectA,title:'x'.repeat(161)})).status).toBe(400);
 });
 it('refuse un bloc tant qu’il n’y a pas de capture',async()=>{
  const m=await newMockup('Sans capture');const r=await json(`/mockups/${m.id}/blocks`,'POST',block());expect(r.status).toBe(409);expect(r.body.error||r.body.message||JSON.stringify(r.body)).toMatch(/capture/);
 });
 it('enregistre la capture telle quelle (empreinte identique), fixe la hauteur et la relit',async()=>{
  const m=await newMockup('Capture');const img=webp(720,1560,3000);const r=await put(m.id,img);
  expect(r.status).toBe(200);expect(r.body.has_image).toBe(true);expect(r.body.screen_height).toBe(780);expect(r.body.image).toMatchObject({width:720,height:1560,bytes:3000,mime:'image/webp'});
  const g=await json(`/mockups/${m.id}/image`);expect(g.status).toBe(200);expect(g.body.data).toBe(b64(img));
  expect(g.body.sha256).toBe(createHash('sha256').update(b64(img)).digest('hex'));
  // remplacer par une autre capture : la hauteur suit
  const r2=await put(m.id,webp(360,400,2000));expect(r2.status).toBe(200);expect(r2.body.screen_height).toBe(400);expect(r2.body.image.bytes).toBe(2000);
 });
 it('refuse une capture invalide : pas une image, mauvais type annoncé, trop lourde, base64 faux, trop petite',async()=>{
  const m=await newMockup('Mauvaises captures');
  expect((await json(`/mockups/${m.id}/image`,'PUT',{data:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'+' '.repeat(80)+'</svg>').toString('base64')})).status).toBe(422);
  expect((await json(`/mockups/${m.id}/image`,'PUT',{mime:'image/png',data:b64(webp(720,1560))})).status).toBe(422);
  const big=await put(m.id,webp(720,1560,180001));expect(big.status).toBe(413);
  expect((await json(`/mockups/${m.id}/image`,'PUT',{data:'***pas-du-base64***'})).status).toBe(400);
  expect((await put(m.id,webp(50,50))).status).toBe(422);
  expect((await json(`/mockups/${m.id}`)).body.has_image).toBe(false);
  expect((await put(m.id,webp(720,1560,180000))).status).toBe(200); // pile à la limite : accepté
 });
 it('pose des blocs avec groupe et fonctionnalité liée ; refuse ce qui sort de l’écran ou une mauvaise couleur',async()=>{
  const m=await newMockup('Blocs');await put(m.id,webp(720,1560));
  const g=await json(`/mockups/${m.id}/groups`,'POST',{name:'Barre d’actions'});expect(g.status).toBe(201);const gid=g.body.groups[0].id;
  expect((await json(`/mockups/${m.id}/groups`,'POST',{name:'Barre d’actions'})).status).toBe(409);
  expect((await json(`/mockups/${m.id}/groups`,'POST',{name:'  '})).status).toBe(400);
  const r1=await json(`/mockups/${m.id}/blocks`,'POST',block({group_id:gid,feature_id:featA,fill:'#0B0B0C',text_color:'#ffffff',behavior:'Enregistre'}));
  expect(r1.status).toBe(201);const b1=r1.body.blocks[0];
  expect(b1).toMatchObject({kind:'button',label:'Bouton Enregistrer',x:16,y:600,w:328,h:48,group_name:'Barre d’actions',fill:'#0b0b0c',text_color:'#ffffff',position:0});expect(b1.feature).toEqual({id:featA,code:'F-0001',name:'Liste de courses'});
  const r2=await json(`/mockups/${m.id}/blocks`,'POST',block({kind:'title',label:'Titre',y:20,h:40}));expect(r2.body.blocks.map((x:any)=>x.position)).toEqual([0,1]);
  for(const [over,status] of [[{x:40},400],[{y:733},400],[{kind:'robot'},400],[{label:''},400],[{w:0},400],[{x:-1},400],[{fill:'noir'},400],[{text_color:'#12'},400]] as [any,number][])expect((await json(`/mockups/${m.id}/blocks`,'POST',block(over))).status,JSON.stringify(over)).toBe(status);
  expect((await json(`/mockups/${m.id}`)).body.blocks).toHaveLength(2);
 });
 it('un bloc ne peut citer ni le groupe d’une autre maquette, ni la fonctionnalité d’un autre compte',async()=>{
  const m1=await newMockup('Groupe 1'),m2=await newMockup('Groupe 2');await put(m1.id,webp(720,1560));await put(m2.id,webp(720,1560));
  const g=(await json(`/mockups/${m2.id}/groups`,'POST',{name:'Autre'})).body.groups[0].id;
  expect((await json(`/mockups/${m1.id}/blocks`,'POST',block({group_id:g}))).status).toBe(400);
  expect((await json(`/mockups/${m1.id}/blocks`,'POST',block({feature_id:featB}))).status).toBe(400);
  expect((await json(`/mockups/${m1.id}/blocks`,'POST',block({feature_id:crypto.randomUUID()}))).status).toBe(400);
 });
 it('refuse une capture plus courte que les blocs déjà posés',async()=>{
  const m=await newMockup('Capture courte');await put(m.id,webp(720,1560));await json(`/mockups/${m.id}/blocks`,'POST',block());
  const r=await put(m.id,webp(360,300));expect(r.status).toBe(409);expect((await json(`/mockups/${m.id}`)).body.image.height).toBe(1560);
 });
 it('fixe l’écran de départ une seule fois ; ensuite la capture est figée mais les blocs restent modifiables (5B-2)',async()=>{
  const m=await newMockup('Départ');await put(m.id,webp(720,1560));
  expect((await json(`/mockups/${m.id}/lock-start`,'POST',{})).status).toBe(409); // aucun bloc
  await json(`/mockups/${m.id}/groups`,'POST',{name:'Haut'});const gid=(await json(`/mockups/${m.id}`)).body.groups[0].id;
  await json(`/mockups/${m.id}/blocks`,'POST',block({group_id:gid,feature_id:featA,fill:'#ffffff'}));
  const l=await json(`/mockups/${m.id}/lock-start`,'POST',{});expect(l.status).toBe(200);expect(l.body.start_fixed).toBe(true);expect(l.body.start.blocks).toBe(1);
  const saved=JSON.parse((await db.prepare('SELECT start_state FROM mockups WHERE id=?').bind(m.id).first<any>())!.start_state);
  expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({kind:'button',label:'Bouton Enregistrer',x:16,y:600,w:328,h:48,group_name:'Haut',fill:'#ffffff',feature_id:featA});
  expect((await json(`/mockups/${m.id}/lock-start`,'POST',{})).status).toBe(409);
  expect((await put(m.id,webp(720,1560))).status).toBe(409); // la capture de départ ne change plus
  expect((await json(`/mockups/${m.id}/blocks`,'POST',block({label:'Après le départ',y:500}))).status).toBe(201); // on peut modifier
  expect((await json(`/mockups/${m.id}/groups`,'POST',{name:'Autre'})).status).toBe(201);
  // la copie de départ, elle, ne bouge plus : elle garde 1 bloc, même si la maquette en a maintenant 2
  expect(JSON.parse((await db.prepare('SELECT start_state FROM mockups WHERE id=?').bind(m.id).first<any>())!.start_state)).toHaveLength(1);
  expect((await json(`/mockups/${m.id}`)).body.blocks).toHaveLength(2);
 });
 it('refuse de fixer l’écran de départ sans capture',async()=>{
  const m=await newMockup('Sans image');expect((await json(`/mockups/${m.id}/lock-start`,'POST',{})).status).toBe(409);
 });
 it('liste les maquettes d’un projet avec leur état',async()=>{
  const r=await json(`/mockups?project=${projectA}`);expect(r.status).toBe(200);const names=r.body.items.map((x:any)=>x.title);expect(names).toContain('Départ');
  const dep=r.body.items.find((x:any)=>x.title==='Départ');expect(dep).toMatchObject({has_image:true,block_count:2,start_fixed:true});expect(dep.image.bytes).toBe(64);expect('data' in (dep.image||{})).toBe(false);
 });
});

describe('limites mesurées',()=>{
 it('100 blocs au plus et 30 groupes au plus par maquette',async()=>{
  const m=await newMockup('Limites');await put(m.id,webp(360,3000));
  for(let i=0;i<100;i++){const r=await json(`/mockups/${m.id}/blocks`,'POST',block({y:i*10,h:8,label:'B'+i}));if(r.status!==201)throw new Error(`bloc ${i} : ${r.status} ${JSON.stringify(r.body)}`);}
  expect((await json(`/mockups/${m.id}/blocks`,'POST',block({y:1100,h:8}))).status).toBe(409);
  for(let i=0;i<30;i++)expect((await json(`/mockups/${m.id}/groups`,'POST',{name:'G'+i})).status).toBe(201);
  expect((await json(`/mockups/${m.id}/groups`,'POST',{name:'G30'})).status).toBe(409);
 },60000);
 it('40 maquettes au plus par projet',async()=>{
  const bobProject=(await json('/projects','POST',{name:'Plein'})).body.id;
  for(let i=0;i<40;i++)expect((await json('/mockups','POST',{project_id:bobProject,title:'M'+i})).status).toBe(201);
  expect((await json('/mockups','POST',{project_id:bobProject,title:'M40'})).status).toBe(409);
  expect((await json('/mockups','POST',{project_id:projectA,title:'Ailleurs'})).status).toBe(201); // la limite est par projet
 },60000);
 it('20 Mo de captures au plus par compte : la limite est exacte et aucune capture n’est supprimée',async()=>{
  const quotaProject=(await json('/projects','POST',{name:'Projet des lignes de quota'})).body.id,m=await newMockup('Quota',quotaProject),at=new Date().toISOString(),MAX=20*1048576;
  const used=Number((await db.prepare('SELECT COALESCE(SUM(bytes),0) n FROM mockup_images WHERE user_id=?').bind(ownerA).first<any>())!.n);
  // On remplit directement la base jusqu'à ne laisser que 100 000 octets de marge (chaque ligne déclare au plus 180 000 octets).
  let todo=MAX-100000-used;const stmts:D1PreparedStatement[]=[];
  while(todo>0){const n=Math.min(180000,todo),id=crypto.randomUUID();todo-=n;
   stmts.push(db.prepare("INSERT INTO mockups(id,user_id,project_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind(id,ownerA,quotaProject,'Q',at,at),
    db.prepare("INSERT INTO mockup_images(mockup_id,user_id,project_id,mime,width,height,bytes,sha256,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id,ownerA,quotaProject,'image/webp',720,1560,n,'x','AAAA',at,at));}
  for(let i=0;i<stmts.length;i+=50)await db.batch(stmts.slice(i,i+50));
  const count=async()=>Number((await db.prepare('SELECT COUNT(*) n FROM mockup_images WHERE user_id=?').bind(ownerA).first<any>())!.n);
  const before=await count();
  const r=await put(m.id,webp(720,1560,180000));expect(r.status).toBe(413);expect(JSON.stringify(r.body)).toMatch(/20 Mo/);expect(await count()).toBe(before);
  expect((await put(m.id,webp(720,1560,100001))).status).toBe(413);
  expect((await put(m.id,webp(720,1560,100000))).status).toBe(200); // pile à la marge : accepté
  // remplacer une capture compte pour la différence : la même maquette peut encore changer de capture
  expect((await put(m.id,webp(720,1560,90000))).status).toBe(200);
 },60000);
});

describe('isolation entre comptes (A contre B)',()=>{
 let mid:string;
 beforeAll(async()=>{const m=await newMockup('Secret de A');mid=m.id;await put(mid,webp(720,1560));await json(`/mockups/${mid}/blocks`,'POST',block({label:'Bloc privé de A'}));});
 it('B ne peut ni lire, ni modifier, ni compléter la maquette de A (404, jamais le contenu)',async()=>{
  for(const [path,method,data] of [[`/mockups/${mid}`,'GET'],[`/mockups/${mid}/image`,'GET'],[`/mockups/${mid}/image`,'PUT',{data:b64(webp(720,1560))}],[`/mockups/${mid}/blocks`,'POST',block()],[`/mockups/${mid}/groups`,'POST',{name:'x'}],[`/mockups/${mid}/lock-start`,'POST',{}]] as [string,string,any?][]){
   const r=await json(path,method,data,b);expect(r.status,method+' '+path).toBe(404);expect(JSON.stringify(r.body)).not.toMatch(/Bloc privé|Secret de A|"data"/);
  }
  expect((await json(`/mockups/${mid}`)).body.blocks).toHaveLength(1);
 });
 it('B ne voit rien de A dans ses listes et ne peut ni lister ni créer dans le projet de A',async()=>{
  expect((await json(`/mockups?project=${projectA}`,'GET',undefined,b)).status).toBe(404);
  expect((await json('/mockups','POST',{project_id:projectA,title:'Intrus'},b)).status).toBe(404);
  const own=await newMockup('De Bob',projectB,b);expect(own.title).toBe('De Bob');
  const list=await json(`/mockups?project=${projectB}`,'GET',undefined,b);expect(list.body.items.map((x:any)=>x.title)).toEqual(['De Bob']);
  expect(JSON.stringify(own.context)).not.toMatch(/Thème noir|Liste de courses/);
 });
 it('l’export du compte de A contient ses maquettes (blocs et capture) et celui de B n’en contient aucune de A',async()=>{
  const ex=await json('/account/export?metadata=true');expect(ex.status).toBe(200);
  expect(ex.body.mockups.some((m:any)=>m.title==='Secret de A')).toBe(true);expect(ex.body.mockup_blocks.some((x:any)=>x.label==='Bloc privé de A')).toBe(true);
  expect(ex.body.mockup_images.some((x:any)=>x.mockup_id===mid&&x.data.length>0)).toBe(true);
  const exB=await json('/account/export?metadata=true','GET',undefined,b);expect(JSON.stringify(exB.body)).not.toMatch(/Secret de A|Bloc privé de A/);expect(exB.body.mockups.map((m:any)=>m.title)).toEqual(['De Bob']);
 });
});

describe('modifier la maquette (5B-2)',()=>{
 const ops=(id:string,revision:number,o:any[],cookie=a)=>json(`/mockups/${id}/ops`,'POST',{revision,ops:o},cookie);
 let m:any,b1:string,b2:string,b3:string;
 beforeAll(async()=>{
  m=await newMockup('Édition');await put(m.id,webp(720,1560));
  for(const [label,y] of [['Un',100],['Deux',200],['Trois',300]] as [string,number][])await json(`/mockups/${m.id}/blocks`,'POST',block({label,y,h:40,w:100,x:16}));
  const d=(await json(`/mockups/${m.id}`)).body;[b1,b2,b3]=d.blocks.map((x:any)=>x.id);m=d;
 });
 const cur=async()=>(await json(`/mockups/${m.id}`)).body;
 it('palettes des deux sites : couleurs réelles, avec fichier, ligne et commit ; choix enregistré',async()=>{
  const p=await json('/mockups/palettes');expect(p.status).toBe(200);expect(p.body.palettes.map((x:any)=>x.key)).toEqual(['recettes','sport']);
  expect(p.body.palettes[0].colors.find((c:any)=>c.token==='--accent')).toMatchObject({hex:'#d39a62',line:49});expect(p.body.palettes[0].commit).toMatch(/^[0-9a-f]{40}$/);
  const r=await json(`/mockups/${m.id}/palette`,'PUT',{site:'recettes'});expect(r.status).toBe(200);expect(r.body.palette.key).toBe('recettes');expect(r.body.palette.colors.length).toBeGreaterThan(10);
  expect((await json(`/mockups/${m.id}/palette`,'PUT',{site:'inconnu'})).status).toBe(400);
  expect((await json(`/mockups/${m.id}/palette`,'PUT',{site:'sport'},b)).status).toBe(404);
  expect((await json(`/mockups/${m.id}`)).body.palette.key).toBe('recettes');
 });
 it('déplace, redimensionne et colorie en un lot ; la version augmente ; le résultat est relu tel quel',async()=>{
  let d=await cur();const rev=d.revision;
  const r=await ops(m.id,rev,[{op:'update',id:b1,patch:{x:40,y:150,w:200}},{op:'update',id:b2,patch:{fill:'#D39A62',text_color:'#14110e'}}]);
  expect(r.status).toBe(200);expect(r.body.revision).toBe(rev+1);
  const x=r.body.blocks.find((q:any)=>q.id===b1),y=r.body.blocks.find((q:any)=>q.id===b2);
  expect(x).toMatchObject({x:40,y:150,w:200,h:40});expect(y).toMatchObject({fill:'#d39a62',text_color:'#14110e'});
 });
 it('annuler = rejouer l’inverse : on retrouve exactement l’état d’avant',async()=>{
  let d=await cur();const before=JSON.stringify(d.blocks.map((q:any)=>[q.id,q.x,q.y,q.w,q.h,q.fill,q.group_name]));
  let r=await ops(m.id,d.revision,[{op:'group',ids:[b1,b2],name:'Haut'},{op:'update',id:b3,patch:{x:60}}]);expect(r.status).toBe(200);
  expect(r.body.groups.map((g:any)=>g.name)).toEqual(['Haut']);expect(r.body.blocks.find((q:any)=>q.id===b1).group_name).toBe('Haut');
  r=await ops(m.id,r.body.revision,[{op:'ungroup',ids:[b1,b2]},{op:'delete_group',name:'Haut'},{op:'update',id:b3,patch:{x:16}}]);expect(r.status).toBe(200);
  expect(JSON.stringify(r.body.blocks.map((q:any)=>[q.id,q.x,q.y,q.w,q.h,q.fill,q.group_name]))).toBe(before);expect(r.body.groups).toEqual([]);
 });
 it('déplace un groupe entier d’un coup (une seule requête) et refuse s’il sortirait de l’écran',async()=>{
  let d=await cur();let r=await ops(m.id,d.revision,[{op:'group',ids:[b1,b2,b3],name:'Tout'}]);
  const ys=r.body.blocks.map((q:any)=>q.y);r=await ops(m.id,r.body.revision,[{op:'move_group',name:'Tout',dx:10,dy:25}]);expect(r.status).toBe(200);
  expect(r.body.blocks.map((q:any)=>q.y)).toEqual(ys.map((v:number)=>v+25));
  const rev=r.body.revision;const bad=await ops(m.id,rev,[{op:'move_group',name:'Tout',dx:0,dy:5000}]);expect(bad.status).toBe(400);
  expect((await cur()).revision).toBe(rev); // rien n'a bougé, la version non plus
  const far=await ops(m.id,rev,[{op:'move_group',name:'Tout',dx:0,dy:600}]);expect(far.status).toBe(400);expect(far.body.error||far.body.message||JSON.stringify(far.body)).toMatch(/sortirait/);
 });
 it('tout ou rien : un lot dont la dernière opération est fautive ne change RIEN (ni blocs, ni version)',async()=>{
  const d=await cur(),snap=JSON.stringify(d.blocks);
  const r=await ops(m.id,d.revision,[{op:'update',id:b1,patch:{x:99}},{op:'update',id:b2,patch:{x:-4}}]);expect(r.status).toBe(400);
  const after=await cur();expect(JSON.stringify(after.blocks)).toBe(snap);expect(after.revision).toBe(d.revision);
 });
 it('deux écrans en même temps : un seul lot passe, l’autre reçoit « a changé » et ne modifie rien',async()=>{
  const d=await cur();
  const [r1,r2]=await Promise.all([ops(m.id,d.revision,[{op:'update',id:b1,patch:{y:11}}]),ops(m.id,d.revision,[{op:'update',id:b1,patch:{y:22}}])]);
  expect([r1.status,r2.status].sort()).toEqual([200,409]);
  const final=(await cur());expect(final.revision).toBe(d.revision+1);expect([11,22]).toContain(final.blocks.find((q:any)=>q.id===b1).y);
  const stale=await ops(m.id,d.revision,[{op:'update',id:b1,patch:{y:33}}]);expect(stale.status).toBe(409);expect(JSON.stringify(stale.body)).toMatch(/Rechargez/);
 });
 it('supprimer puis annuler (ajout avec le même identifiant) rend le même bloc ; ajouter crée un bloc',async()=>{
  let d=await cur();const old=d.blocks.find((q:any)=>q.id===b3);
  let r=await ops(m.id,d.revision,[{op:'delete',id:b3}]);expect(r.body.blocks.map((q:any)=>q.id)).not.toContain(b3);
  r=await ops(m.id,r.body.revision,[{op:'add',block:{id:b3,kind:old.kind,label:old.label,x:old.x,y:old.y,w:old.w,h:old.h,fill:old.fill,text_color:old.text_color,behavior:old.behavior,group_name:old.group_name,feature_id:old.feature?.id??null}}]);
  expect(r.status).toBe(200);expect(r.body.blocks.find((q:any)=>q.id===b3)).toMatchObject({label:old.label,x:old.x,y:old.y,w:old.w,h:old.h,group_name:old.group_name});
  const n=await ops(m.id,r.body.revision,[{op:'add',block:{kind:'card',label:'Nouvelle carte',x:0,y:400,w:360,h:120,feature_id:featA}}]);expect(n.status).toBe(200);
  expect(n.body.blocks.at(-1)).toMatchObject({label:'Nouvelle carte',feature:{code:'F-0001'}});
 });
 it('refus clairs : fonctionnalité d’un autre compte, bloc d’un autre compte, champ interdit, lot trop long',async()=>{
  const d=await cur();
  expect((await ops(m.id,d.revision,[{op:'update',id:b1,patch:{feature_id:featB}}])).status).toBe(400);
  expect((await ops(m.id,d.revision,[{op:'update',id:crypto.randomUUID(),patch:{x:1}}])).status).toBe(400);
  expect((await ops(m.id,d.revision,[{op:'update',id:b1,patch:{id:b2}}])).status).toBe(400);
  expect((await ops(m.id,d.revision,Array.from({length:13},()=>({op:'update',id:b1,patch:{x:1}})))).status).toBe(400);
  expect((await ops(m.id,d.revision,[])).status).toBe(400);
 });
 it('la copie de l’écran de départ ne change jamais, même après des modifications',async()=>{
  const x=await newMockup('Référence');await put(x.id,webp(720,1560));const bl=(await json(`/mockups/${x.id}/blocks`,'POST',block({label:'Fixe',y:100,h:40}))).body.blocks[0];
  await json(`/mockups/${x.id}/lock-start`,'POST',{});const rev=(await json(`/mockups/${x.id}`)).body.revision;
  const r=await ops(x.id,rev,[{op:'update',id:bl.id,patch:{y:300,fill:'#c8914d'}}]);expect(r.status).toBe(200);
  const start=JSON.parse((await db.prepare('SELECT start_state FROM mockups WHERE id=?').bind(x.id).first<any>())!.start_state);
  expect(start[0]).toMatchObject({y:100,fill:''});expect(r.body.blocks[0]).toMatchObject({y:300,fill:'#c8914d'});
 });
 it('A contre B : B ne peut ni modifier ni lire la maquette de A par ops (404, rien ne change)',async()=>{
  const d=await cur(),snap=JSON.stringify(d.blocks);
  const r=await ops(m.id,d.revision,[{op:'delete',id:b1}],b);expect(r.status).toBe(404);expect(JSON.stringify(r.body)).not.toMatch(/Un|Deux/);
  const after=await cur();expect(JSON.stringify(after.blocks)).toBe(snap);expect(after.revision).toBe(d.revision);
 });
});

describe('fiche de mise en page et mission (5B-3)',()=>{
 const ops=(id:string,revision:number,o:any[],cookie=a)=>json(`/mockups/${id}/ops`,'POST',{revision,ops:o},cookie);
 it('fiche par règles fixes : écarts exacts, liste de contrôle, fichiers en hypothèse ; même maquette → même texte',async()=>{
  const m=await newMockup('Accueil du livre');await put(m.id,webp(720,1560));
  await json(`/mockups/${m.id}/palette`,'PUT',{site:'recettes'});
  for(const [label,y,kind] of [['Titre',40,'title'],['Recherche',300,'field'],['Ajouter',600,'button'],['Partager',600,'button']] as [string,number,string][])
   await json(`/mockups/${m.id}/blocks`,'POST',block({label,y,kind,h:40,w:label==='Partager'?100:160,x:label==='Partager'?200:16}));
  await json(`/mockups/${m.id}/lock-start`,'POST',{});
  let d=(await json(`/mockups/${m.id}`)).body;const id=(l:string)=>d.blocks.find((x:any)=>x.label===l).id;
  const r=await ops(m.id,d.revision,[{op:'update',id:id('Recherche'),patch:{y:88}},{op:'group',ids:[id('Ajouter'),id('Partager')],name:'Actions'},{op:'update',id:id('Ajouter'),patch:{fill:'#d39a62'}},{op:'update',id:id('Titre'),patch:{feature_id:featA}}]);
  expect(r.status).toBe(200);
  const s1=await json(`/mockups/${m.id}/sheet`);expect(s1.status).toBe(200);
  expect(s1.body.instructions).toEqual([ // ordre de lecture : « Titre » est en haut de l'écran
   '« Titre » sert la fonctionnalité F-0001 « Liste de courses ».',
   'Déplace « Recherche » juste sous « Titre » (position visée : 16 px du bord gauche, 88 px du haut ; avant : 16, 300).',
   'Regroupe « Ajouter » avec les autres éléments du groupe « Actions » : ils restent ensemble, côte à côte, et se déplacent ensemble.',
   'Couleur de fond de « Ajouter » : --accent (#d39a62), utilise la variable CSS du site plutôt que le code (avant : aucune).',
   'Regroupe « Partager » avec les autres éléments du groupe « Actions » : ils restent ensemble, côte à côte, et se déplacent ensemble.']);
  expect(s1.body.checklist).toContain('« Ajouter » et « Partager » sont ensemble (groupe « Actions »).');
  expect(s1.body.checklist).toContain('« Recherche » est juste sous « Titre ».');
  expect(s1.body.files[0]).toBe('public/css/app.css');
  expect(s1.body.mission.fields.files).toMatch(/^Hypothèse/);expect(s1.body.mission.feature_ids).toEqual([featA]);
  expect(s1.body.markdown).toMatch(/règles fixes, sans IA/);
  const s2=await json(`/mockups/${m.id}/sheet`);expect(s2.body.markdown).toBe(s1.body.markdown);expect(s2.body.content_hash).toBe(s1.body.content_hash);
  // B ne lit pas la fiche de A
  const sb=await json(`/mockups/${m.id}/sheet`,'GET',undefined,b);expect(sb.status).toBe(404);expect(JSON.stringify(sb.body)).not.toMatch(/Recherche|Titre/);
 });
 it('la mission est créée par le générateur du lot 3 avec les champs de la fiche, et son aperçu contient les consignes',async()=>{
  const m=await newMockup('Mission');await put(m.id,webp(720,1560));await json(`/mockups/${m.id}/palette`,'PUT',{site:'recettes'});
  await json(`/mockups/${m.id}/blocks`,'POST',block({label:'Bouton',y:300}));await json(`/mockups/${m.id}/blocks`,'POST',block({label:'Titre',y:40,h:40}));
  await json(`/mockups/${m.id}/lock-start`,'POST',{});let d=(await json(`/mockups/${m.id}`)).body;
  await ops(m.id,d.revision,[{op:'update',id:d.blocks.find((x:any)=>x.label==='Bouton').id,patch:{y:88}}]);
  const sh=(await json(`/mockups/${m.id}/sheet`)).body;
  const at=new Date().toISOString(),conn=crypto.randomUUID(),repo=crypto.randomUUID();
  await db.prepare("INSERT INTO connections(id,user_id,provider,label,secret,created_at) VALUES(?,?,?,?,?,?)").bind(conn,ownerA,'github','gh essai','x',at).run();
  await db.prepare('INSERT INTO repositories(id,user_id,project_id,connection_id,full_name,branch,head_sha,created_at,default_branch) VALUES(?,?,?,?,?,?,?,?,?)').bind(repo,ownerA,projectA,conn,'martinznt/Livre-de-recettes','main','0'.repeat(40),at,'main').run();
  const mi=await json('/missions','POST',{project_id:projectA,repository_id:repo,level:'short',title:sh.mission.title,fields:sh.mission.fields,feature_ids:sh.mission.feature_ids,decision_ids:[]});
  expect(mi.status).toBe(201);expect(mi.body.title).toBe('Maquette : Mission');expect(mi.body.fields.perimeter).toMatch(/Déplace « Bouton » juste sous « Titre »/);
  const full=await json(`/missions/${mi.body.id}`);expect(full.status).toBe(200);
  expect(String(full.body.rendered)).toMatch(/Déplace « Bouton » juste sous « Titre »/);expect(String(full.body.rendered)).toMatch(/Hypothèse \(liste des fichiers du dépôt/);
  // B ne peut pas créer de mission dans le projet de A
  expect((await json('/missions','POST',{project_id:projectA,repository_id:repo,level:'short',title:'x',fields:sh.mission.fields,feature_ids:[],decision_ids:[]},b)).status).toBe(404);
 });
});

describe('guidage par règles (5B-4)',()=>{
 const ops=(id:string,revision:number,o:any[],cookie=a)=>json(`/mockups/${id}/ops`,'POST',{revision,ops:o},cookie);
 it('suggestions vérifiables, accepter, refuser : une refusée ne revient pas, une acceptée entre dans la fiche et la mission',async()=>{
  const m=await newMockup('Guidage');await put(m.id,webp(720,1560));await json(`/mockups/${m.id}/palette`,'PUT',{site:'recettes'});
  await json(`/mockups/${m.id}/blocks`,'POST',block({kind:'button',label:'Petit',x:16,y:100,w:20,h:20}));
  await json(`/mockups/${m.id}/blocks`,'POST',block({kind:'text',label:'Pâle',x:16,y:200,w:200,h:40,fill:'#ffffff',text_color:'#777777'}));
  let g=await json(`/mockups/${m.id}/guide`);expect(g.status).toBe(200);
  const rules=g.body.items.map((x:any)=>x.rule).sort();expect(rules).toEqual(['off_palette','off_palette','target_min','text_contrast']);
  const small=g.body.items.find((x:any)=>x.rule==='target_min');expect(small.level_word).toBe('Vérifié');expect(small.source.url).toBe('https://www.w3.org/TR/WCAG22/#target-size-minimum');
  expect(g.body.sources).toMatch(/12 December 2024/);
  // refuser : ne revient plus, même après rechargement
  expect((await json(`/mockups/${m.id}/guide`,'POST',{rule:'text_contrast',key:g.body.items.find((x:any)=>x.rule==='text_contrast').key,decision:'refused'})).status).toBe(200);
  g=await json(`/mockups/${m.id}/guide`);expect(g.body.items.map((x:any)=>x.rule)).not.toContain('text_contrast');expect(g.body.refused_hidden).toBe(1);
  // accepter : reste visible, marquée, et la consigne entre dans la fiche et dans la mission
  expect((await json(`/mockups/${m.id}/guide`,'POST',{rule:'target_min',key:small.key,decision:'accepted'})).status).toBe(200);
  g=await json(`/mockups/${m.id}/guide`);expect(g.body.items.find((x:any)=>x.rule==='target_min').decision).toBe('accepted');
  const sh=(await json(`/mockups/${m.id}/sheet`)).body;
  expect(sh.markdown).toContain('## Suggestions de guidage acceptées');expect(sh.markdown).toContain('- Agrandis « Petit » à au moins 24 × 24 px (WCAG 2.2, critère 2.5.8).');
  expect(sh.mission.fields.perimeter).toContain('Règles d’ergonomie acceptées par Martin');expect(sh.markdown).not.toContain('se lit mal');
  // une suggestion qui n'existe plus est refusée (409) ; une règle inventée aussi
  expect((await json(`/mockups/${m.id}/guide`,'POST',{rule:'target_min',key:'inexistant',decision:'refused'})).status).toBe(409);
  expect((await json(`/mockups/${m.id}/guide`,'POST',{rule:'target_min',key:small.key,decision:'peut-être'})).status).toBe(400);
  // corriger la maquette fait disparaître la suggestion (la règle ne se déclenche plus)
  const d=(await json(`/mockups/${m.id}`)).body;await ops(m.id,d.revision,[{op:'update',id:small.block_ids[0],patch:{w:48,h:48}}]);
  g=await json(`/mockups/${m.id}/guide`);expect(g.body.items.map((x:any)=>x.rule)).not.toContain('target_min');
  // une NOUVELLE situation (autre couleur pâle) redonne une suggestion de contraste
  const pale=d.blocks.find((x:any)=>x.label==='Pâle');const d2=(await json(`/mockups/${m.id}`)).body;
  await ops(m.id,d2.revision,[{op:'update',id:pale.id,patch:{text_color:'#888888'}}]);
  g=await json(`/mockups/${m.id}/guide`);expect(g.body.items.map((x:any)=>x.rule)).toContain('text_contrast');
  // A contre B
  const gb=await json(`/mockups/${m.id}/guide`,'GET',undefined,b);expect(gb.status).toBe(404);expect(JSON.stringify(gb.body)).not.toMatch(/Petit|Pâle/);
  expect((await json(`/mockups/${m.id}/guide`,'POST',{rule:'target_min',key:small.key,decision:'refused'},b)).status).toBe(404);
  const ex=await json('/account/export?metadata=true');expect(ex.body.mockup_suggestion_decisions.length).toBeGreaterThanOrEqual(2);
  const exB=await json('/account/export?metadata=true','GET',undefined,b);expect(exB.body.mockup_suggestion_decisions).toEqual([]);
 });
});
