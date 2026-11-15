import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {Miniflare,createFetchMock} from 'miniflare';import {build} from 'esbuild';import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {normalizeMigrationForD1} from './migration-sql.mjs';
import {checkSeed,seedFile} from '../server/seed-core.ts';
/* Lot 4 — « Atelier dans Atelier » : parcours complet que Martin fera, joué dans Miniflare avec GitHub SIMULÉ (aucun appel réel).
   Contenu : import du fichier de départ (aperçu, création, idempotence, rien de supprimé), isolation A/B,
   puis tâche, validation des décisions, mission du lot 5A générée avec les vraies règles d'Atelier, verdict. */
let mf:Miniflare;const mock=createFetchMock();mock.disableNetConnect();const origin='http://localhost:8787';
let a:string,b:string,ownerA:string,ownerB:string,pA:string,pB:string,repoA:string;
async function call(path:string,method='GET',data?:unknown,cookie=a){return mf.dispatchFetch(`${origin}/api${path}`,{method,headers:{Origin:origin,Cookie:cookie||'',...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:typeof data==='string'?data:JSON.stringify(data)});}
async function json(path:string,method='GET',data?:unknown,cookie=a){const r=await call(path,method,data,cookie);const text=await r.text();let body:any=null;try{body=JSON.parse(text);}catch{body=text;}return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const SEED=JSON.parse(await readFile('docs/atelier-dans-atelier/atelier-depart.json','utf8'));
const sh=(args:string[])=>{try{return execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return '';}};
/* Les vraies règles d'Atelier, lues dans Git au commit de main (sinon dans le dossier de travail, avec des empreintes calculées). */
const REF=sh(['rev-parse','--verify','origin/main'])||'';
const gitText=(f:string)=>REF?sh(['show',`${REF}:${f}`]):'';
const FILES=['AGENTS.md','CLAUDE.md','package.json'];
const real=FILES.map(f=>{const t=gitText(f);return {path:f,text:t};});
const COMMIT=REF||'7'.repeat(40),TREE=REF?sh(['rev-parse',`${REF}^{tree}`]):'8'.repeat(40);
const blobSha=(t:string)=>createHash('sha1').update(`blob ${Buffer.byteLength(t)}\0`).update(t).digest('hex');
const gh=()=>mock.get('https://api.github.com');const hdr={headers:{'content-type':'application/json'}};
const q=(path:string,body:string,status=200)=>gh().intercept({method:'GET',path}).reply(status,body,hdr).persist();
beforeAll(async()=>{
 await mkdir('test-results',{recursive:true});await build({entryPoints:['server/index.ts'],outfile:'test-results/worker-lot4.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022'});
 mf=new Miniflare({modules:true,scriptPath:'test-results/worker-lot4.mjs',fetchMock:mock,compatibilityDate:'2025-10-24',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],queueProducers:{TASKS:'atelier-tasks'},bindings:{MASTER_KEY:'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',APP_ORIGIN:origin,ALLOW_REGISTRATION:'true'}});
 const db=await mf.getD1Database('DB');
 for(const m of (await readdir('migrations')).filter(n=>/^\d+.*\.sql$/.test(n)).sort())await db.exec(normalizeMigrationForD1(await readFile(`migrations/${m}`,'utf8')));
 const ra=await json('/auth/register','POST',{email:'alice-l4@example.test',password:'phrase-de-test-solide-2026'},'');a=ra.cookie!;ownerA=ra.body.user.id;
 const rb=await json('/auth/register','POST',{email:'bob-l4@example.test',password:'autre-phrase-solide-2026'},'');b=rb.cookie!;ownerB=rb.body.user.id;
 pA=(await json('/projects','POST',{name:'Atelier'})).body.id;pB=(await json('/projects','POST',{name:'Atelier de Bob'},b)).body.id;
 if(REF){
  q(`/repos/martinznt/Atelier/branches/main`,JSON.stringify({commit:{sha:COMMIT,commit:{tree:{sha:TREE}}}}));
  q(`/repos/martinznt/Atelier/git/trees/${TREE}`,JSON.stringify({tree:real.map(e=>({path:e.path,type:'blob',sha:blobSha(e.text),size:Buffer.byteLength(e.text)}))}));
  for(const e of real)q(`/repos/martinznt/Atelier/git/blobs/${blobSha(e.text)}`,JSON.stringify({encoding:'base64',content:Buffer.from(e.text).toString('base64')}));
 }
 const gc=await json('/connections','POST',{provider:'github',label:'GitHub essai',secret:'exemple-jeton-factice-2026',scopes:['read']});
 repoA=crypto.randomUUID();const at=new Date().toISOString();
 await db.prepare('INSERT INTO repositories(id,user_id,project_id,connection_id,full_name,branch,head_sha,created_at,default_branch) VALUES(?,?,?,?,?,?,?,?,?)').bind(repoA,ownerA,pA,gc.body.id,'martinznt/Atelier','main',COMMIT,at,'main').run();
});
afterAll(async()=>{await mf?.dispose();});
const count=async(sql:string,...args:any[])=>(await (await mf.getD1Database('DB')).prepare(sql).bind(...args).first<{n:number}>())!.n;
const snapshot=async(user:string)=>{const db=await mf.getD1Database('DB');const out:Record<string,unknown>={};for(const t of ['project_features','project_decisions','item_lifecycle','lifecycle_events','project_setup'])out[t]=(await db.prepare(`SELECT * FROM ${t} WHERE user_id=? ORDER BY 1,2,3`).bind(user).all()).results;return out;};

describe('fichier de départ : format et contenu',()=>{
 it('est valable, sans problème de règle, et chaque élément cite sa source',()=>{
  const p=seedFile.safeParse(SEED);expect(p.success,JSON.stringify(p.success?'':p.error.issues.slice(0,3))).toBe(true);
  expect(checkSeed(p.data!)).toEqual([]);
  for(const f of SEED.features)expect(f.source_ref.length,f.key).toBeGreaterThanOrEqual(3);
  for(const d of SEED.decisions)expect(d.source_ref.length,d.key).toBeGreaterThanOrEqual(3);
 });
 it('« Vérifié » seulement avec un test cité, jamais « Vérifié sur téléphone », aucun secret',()=>{
  for(const f of SEED.features){expect(f.reliability==='verified',f.key).toBe(Boolean(f.test_ref));expect(f.state,f.key).not.toBe('phone_verified');}
  expect(JSON.stringify(SEED)).not.toMatch(/(sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN)/);
 });
 it('contient les 12 décisions annoncées, sans en inventer le sens, et les lots 5A et 5B à concevoir',()=>{
  expect(SEED.decisions.map((d:any)=>d.key)).toEqual(['d1','d2','d3','d4','d5','d6','d8','d9','d10','d10bis','d11','d12']);
  for(const k of ['lot-5a-liaison','lot-5b-a-preciser'])expect(SEED.features.find((f:any)=>f.key===k).state).toBe('to_design');
  for(const k of ['d1','d9','d10','d10bis','d11','d12'])expect(SEED.decisions.find((d:any)=>d.key===k).reason).toContain('n’est écrit dans aucun fichier');
 });
});

describe('fichier de départ : à jour',()=>{
 it('le fichier versionné correspond à ce que fabrique scripts/build-atelier-seed.mjs',()=>{expect(()=>execFileSync('node',['scripts/build-atelier-seed.mjs','--check'],{stdio:'pipe'})).not.toThrow();});
});

describe('import : sans doublon, sans suppression, sans modification',()=>{
 it('refuse tant que le module « Suivi des fonctionnalités » est désactivé, puis l\'active par le gabarit « Atelier »',async()=>{
  expect((await json(`/model/${pA}/import`,'POST',SEED)).status).toBe(403);
  const r=await json(`/model/${pA}/modules`,'PUT',{template:'atelier'});expect(r.status).toBe(200);
 });
 it('aperçu (dry_run) : annonce ce qui sera créé et n\'écrit rien',async()=>{
  const before=await snapshot(ownerA);
  const r=await json(`/model/${pA}/import?dry_run=1`,'POST',SEED);expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ok:true,imported:false,dry_run:true,summary:{features:{new:SEED.features.length,already_present:0},decisions:{new:12,already_present:0}}});
  expect(await snapshot(ownerA)).toEqual(before);
 });
 it('un fichier invalide n\'écrit rien : « Vérifié » sans test, clé en double, « Vérifié sur téléphone », format inconnu',async()=>{
  const before=await snapshot(ownerA),base={format:'atelier-depart',version:1,project:{name:'x'},features:[] as any[],decisions:[] as any[]};
  const f=(over:any)=>({key:'une-cle',name:'Nom',source_ref:'docs/X.md',...over});
  const noTest=await json(`/model/${pA}/import`,'POST',{...base,features:[f({reliability:'verified'})]});expect(noTest.status).toBe(422);expect(noTest.body.problems[0].message).toContain('test cité');
  const dup=await json(`/model/${pA}/import`,'POST',{...base,features:[f({}),f({})]});expect(dup.status).toBe(422);expect(dup.body.problems[0].message).toContain('deux fois');
  const ph=await json(`/model/${pA}/import`,'POST',{...base,features:[f({state:'phone_verified'})]});expect(ph.status).toBe(422);expect(ph.body.problems[0].message).toContain('téléphone');
  const orphan=await json(`/model/${pA}/import`,'POST',{...base,features:[f({reliability:'reported',test_ref:'tests/x.test.ts'})]});expect(orphan.status).toBe(422);
  const bad=await json(`/model/${pA}/import`,'POST',{...base,format:'autre'});expect(bad.status).toBe(422);expect(bad.body.message??bad.body.error).toContain('Rien n’a été importé');
  const nosrc=await json(`/model/${pA}/import`,'POST',{...base,features:[f({source_ref:''})]});expect(nosrc.status).toBe(422);
  expect(await snapshot(ownerA)).toEqual(before);
 });
 it('crée tout une fois ; une fonctionnalité déjà saisie à la main et sa numérotation sont respectées',async()=>{
  const hand=await json(`/model/${pA}/features`,'POST',{name:'Fonctionnalité saisie à la main',source_kind:'request'});expect(hand.body.code).toBe('F-0001');
  const handSnap=(await (await mf.getD1Database('DB')).prepare('SELECT * FROM project_features WHERE id=?').bind(hand.body.id).first());
  const r=await json(`/model/${pA}/import`,'POST',SEED);expect(r.status).toBe(201);expect(r.body.summary.features.new).toBe(SEED.features.length);
  expect(await count('SELECT count(*) AS n FROM project_features WHERE user_id=? AND project_id=?',ownerA,pA)).toBe(SEED.features.length+1);
  expect(await count('SELECT count(*) AS n FROM project_decisions WHERE user_id=? AND project_id=?',ownerA,pA)).toBe(12);
  expect(await (await mf.getD1Database('DB')).prepare('SELECT * FROM project_features WHERE id=?').bind(hand.body.id).first()).toEqual(handSnap);
  const codes=(await json(`/model/${pA}/features?all=1`)).body.items.map((x:any)=>x.code).sort();expect(new Set(codes).size).toBe(codes.length);expect(codes).toContain('F-0002');expect(codes.at(-1)).toBe('F-'+String(SEED.features.length+1).padStart(4,'0'));
 });
 it('niveaux et sources conservés tels que déclarés : Rapporté par défaut, Vérifié avec test, décisions Proposées',async()=>{
  const items=(await json(`/model/${pA}/features?all=1`)).body.items;
  const get=(name:string)=>items.find((x:any)=>x.name===name);
  const v=get('Migration 0023 : projets existants identiques');expect(v.life).toMatchObject({status:'current',reliability:'verified',proof_kind:'test'});expect(v.life.source_ref).toContain('tests/migration-0023.test.ts');expect(v.source_ref).toContain('RAPPORT_LOT_1');
  const r=get('§13 — Mode hors connexion');expect(r.life.reliability).toBe('reported');expect(r.source_kind).toBe('repo_file');expect(r.source_ref).toContain('EXIGENCES.json');
  expect(get('Lot 5A — Relier Sport et Livre de recettes (lecture seule)')).toMatchObject({state:'to_design',state_label:'À concevoir'});
  expect(items.some((x:any)=>x.state==='phone_verified')).toBe(false);
  const decs=(await json(`/spaces/${pA}/decisions`)).body.items;expect(decs.length).toBe(12);expect(new Set(decs.map((d:any)=>d.status))).toEqual(new Set(['proposed']));
  const hist=await json(`/model/${pA}/lifecycle/feature/${v.id}/history`);expect(hist.body.items[0].reason).toContain('Importé par vous depuis le fichier de départ');
 });
 it('idempotent : un second import ne crée rien et ne modifie rien (même après une modification de Martin)',async()=>{
  const f=(await json(`/model/${pA}/features`)).body.items.find((x:any)=>x.name==='Lot 4 — Atelier dans Atelier (banc d’essai)');
  const up=await json(`/model/${pA}/features/${f.id}`,'PATCH',{state:'done',revision:f.revision});expect(up.status).toBe(200);
  const before=await snapshot(ownerA);
  const r=await json(`/model/${pA}/import`,'POST',SEED);expect(r.status).toBe(200);
  expect(r.body).toMatchObject({imported:false,summary:{features:{new:0,already_present:SEED.features.length},decisions:{new:0,already_present:12}}});expect(r.body.message).toContain('rien n’a été modifié');
  expect(await snapshot(ownerA)).toEqual(before);
  expect((await json(`/model/${pA}/features`)).body.items.find((x:any)=>x.id===f.id).state).toBe('done');
 });
 it('rien n\'est supprimé : un fichier plus court n\'enlève rien, un fichier qui ajoute une entrée ne crée que celle-là',async()=>{
  const n0=await count('SELECT count(*) AS n FROM project_features WHERE user_id=?',ownerA);
  const short={...SEED,features:SEED.features.slice(0,3),decisions:[]};
  const r=await json(`/model/${pA}/import`,'POST',short);expect(r.status).toBe(200);expect(await count('SELECT count(*) AS n FROM project_features WHERE user_id=?',ownerA)).toBe(n0);
  const more={...SEED,features:[...SEED.features,{key:'nouvelle-entree',name:'Nouvelle entrée',source_ref:'docs/AVANCEMENT.md',reliability:'reported',state:'to_design'}]};
  const r2=await json(`/model/${pA}/import`,'POST',more);expect(r2.status).toBe(201);expect(r2.body.summary.features).toEqual({new:1,already_present:SEED.features.length});
  expect(await count('SELECT count(*) AS n FROM project_features WHERE user_id=?',ownerA)).toBe(n0+1);
  expect(await count("SELECT count(*) AS n FROM lifecycle_events WHERE user_id=? AND kind='feature'",ownerA)).toBe(n0+1);
  expect((await json(`/model/${pA}/features/${crypto.randomUUID()}`,'DELETE')).status).toBe(404);
 });
 it('imports simultanés : aucun doublon',async()=>{
  const pC=(await json('/projects','POST',{name:'Atelier (concurrence)'})).body.id;await json(`/model/${pC}/modules`,'PUT',{template:'atelier'});
  const rs=await Promise.all([1,2,3].map(()=>call(`/model/${pC}/import`,'POST',SEED)));expect(rs.every(r=>r.status<300)).toBe(true);
  expect(await count('SELECT count(*) AS n FROM project_features WHERE project_id=?',pC)).toBe(SEED.features.length);
  expect(await count('SELECT count(DISTINCT code) AS n FROM project_features WHERE project_id=?',pC)).toBe(SEED.features.length);
  expect(await count('SELECT count(*) AS n FROM project_decisions WHERE project_id=?',pC)).toBe(12);
 });
});

describe('isolation entre comptes A et B',()=>{
 it('B ne peut ni aperçu, ni importer, ni lire dans le projet de A',async()=>{
  const before=await snapshot(ownerA);
  for(const path of [`/model/${pA}/import?dry_run=1`,`/model/${pA}/import`])expect((await json(path,'POST',SEED,b)).status).toBe(404);
  expect((await json(`/model/${pA}/features`,'GET',undefined,b)).status).toBe(404);expect((await json(`/spaces/${pA}/decisions`,'GET',undefined,b)).status).toBe(404);
  expect(await snapshot(ownerA)).toEqual(before);
 });
 it('B importe le même fichier dans son propre projet : tout est créé pour B, rien pour A, identifiants différents',async()=>{
  await json(`/model/${pB}/modules`,'PUT',{template:'atelier'},b);
  const nA=await count('SELECT count(*) AS n FROM project_features WHERE user_id=?',ownerA);
  const r=await json(`/model/${pB}/import`,'POST',SEED,b);expect(r.status).toBe(201);
  expect(await count('SELECT count(*) AS n FROM project_features WHERE user_id=?',ownerB)).toBe(SEED.features.length);
  expect(await count('SELECT count(*) AS n FROM project_features WHERE user_id=?',ownerA)).toBe(nA);
  expect(await count('SELECT count(*) AS n FROM project_features WHERE id IN (SELECT id FROM project_features WHERE user_id=?) AND user_id<>?',ownerA,ownerA)).toBe(0);
  const fa=(await json(`/model/${pA}/features?all=1`)).body.items.map((x:any)=>x.id),fb=(await json(`/model/${pB}/features?all=1`,'GET',undefined,b)).body.items.map((x:any)=>x.id);
  expect(fa.filter((id:string)=>fb.includes(id))).toEqual([]);
 });
 it('la recherche de B ne voit rien de A, celle de A voit ses fonctionnalités avec leur origine',async()=>{
  const rb=await json(`/workbench/find?q=${encodeURIComponent('Lot 5A')}&all=1&project=${pB}`,'GET',undefined,b);expect(rb.status).toBe(200);
  const ids=(r:any)=>JSON.stringify(r.body);
  const ra=await json(`/workbench/find?q=${encodeURIComponent('Lot 5A')}&all=1&project=${pA}`);expect(ids(ra)).toContain('Lot 5A');
  expect(ids(rb)).not.toContain(pA);
 });
});

describe('parcours de Martin : tâche, décisions, mission du lot 5A, verdict',()=>{
 let task:string,mission:any;
 it('crée la tâche du lot 5A (Pilotage → Plan)',async()=>{
  const r=await json(`/spaces/${pA}/tasks`,'POST',{title:'Lot 5A — Relier Sport et Livre de recettes en lecture seule',
   objective:'Relier les dépôts martinznt/Livre-de-recettes et martinznt/Sport à Atelier, en lecture seule, pour suivre leurs fonctionnalités et leur avancement dans Atelier, comme le lot 4 le fait pour Atelier lui-même. Brancher aussi la correspondance des statuts de Memoire-Projets (docs/CORRESPONDANCE_STATUTS.md, fromMemoireProjets) à la lecture des documents Git.',
   acceptance:'Les deux sites sont suivis dans Atelier avec leurs fonctionnalités, la source et le niveau de fiabilité de chacune ; toute copie venue de Git dit son dépôt, son commit et sa date ; un statut inconnu de Memoire-Projets donne « aucune correspondance » ; aucune écriture dans les dépôts lus ; tous les contrôles listés sont exécutés et leur résultat réel est noté.',
   proof:'Sortie réelle des contrôles ; test d’isolation A/B ; test montrant qu’aucune requête n’écrit dans un dépôt lu ; rapport docs/audits/RAPPORT_LOT_5A_<date>.md avec les niveaux V / R / H.',priority:1});
  expect(r.status).toBe(201);task=r.body.id;
 });
 it('ne cite que les décisions « actuelles » : proposées au départ, validées une par une par Martin',async()=>{
  const decs=(await json(`/spaces/${pA}/decisions`)).body.items,d2=decs.find((d:any)=>d.title.startsWith('D2 —'));
  const refuse=await json('/missions','POST',{project_id:pA,task_id:task,repository_id:repoA,decision_ids:[d2.id]});expect(refuse.status).toBe(400);expect(refuse.body.error??refuse.body.message).toContain('actuelles');
  for(const k of ['D2 —','D3 —','D4 —','D5 —','D6 —','D8 —']){
   const d=decs.find((x:any)=>x.title.startsWith(k));
   const no=await json(`/model/${pA}/lifecycle/decision/${d.id}`,'POST',{to_status:'current',reason:'Je confirme ce choix.'});expect(no.status).toBe(422); // sans « Je valide »
   const ok=await json(`/model/${pA}/lifecycle/decision/${d.id}`,'POST',{to_status:'current',reason:'Je confirme ce choix.',validated_by_martin:true});expect(ok.status).toBe(200);expect(ok.body.status).toBe('current');
  }
 });
 it('génère la mission du lot 5A, lit les vraies règles d\'Atelier, la fige, la copie ; texte écrit dans test-results',async()=>{
  const decs=(await json(`/spaces/${pA}/decisions`)).body.items.filter((d:any)=>/^D[2-6]|^D8/.test(d.title)).map((d:any)=>d.id);
  const feats=(await json(`/model/${pA}/features`)).body.items,fid=['Lot 5A — Relier Sport et Livre de recettes (lecture seule)','Suivi des fonctionnalités (numéro stable F-0001…)','Où vit quoi : recherche unique, origine Git ou Atelier'].map(n=>feats.find((x:any)=>x.name===n).id);
  const m=await json('/missions','POST',{project_id:pA,task_id:task,repository_id:repoA,level:'full',feature_ids:fid,decision_ids:decs,
   fields:{perimeter:'Lecture seule de martinznt/Livre-de-recettes, martinznt/Sport et martinznt/Memoire-Projets (statuts). Copie Git marquée : dépôt, commit, date (docs/OU_VIT_QUOI.md). Migrations additives seulement. POINT OUVERT : le périmètre exact du lot 5A n’est écrit nulle part dans le dépôt ; ce texte reprend uniquement ce que docs/CORRESPONDANCE_STATUTS.md, docs/OU_VIT_QUOI.md et le rapport du lot 1 en disent.',
    forbidden:'Aucune écriture, aucune PR, aucun commit dans Livre-de-recettes, Sport, Outil-image ni Memoire-Projets. Aucun service payant, aucune clé dans le code. Ne rien fusionner, ne rien appliquer en production. Ne pas inventer un état : un statut inconnu donne « aucune correspondance ».',
    files:'server/lifecycle-core.ts (fromMemoireProjets)\nserver/info-placement.ts\nserver/routes/workbench.ts (/find)\nserver/routes/github.ts\nweb/ProjectSpace.tsx\ndocs/CORRESPONDANCE_STATUTS.md\ndocs/OU_VIT_QUOI.md',
    tests:'npm run check\nnpm test\nnpm run build\nnpm run test:regressions\nnpm run test:storage\nnode --test tests/workbench-core.test.mjs tests/claude-advisor.test.mjs tests/history-analysis.test.mjs tests/zip-reader.test.mjs tests/requirements-audit.test.mjs\nnode scripts/requirements-audit.mjs'}});
  expect(m.status).toBe(201);mission=m.body;
  const rr=await json(`/missions/${mission.id}/read-rules`,'POST',{});expect(rr.status).toBe(200);
  if(REF)expect(rr.body.rules.state).toBe('read');
  const ready=await json(`/missions/${mission.id}/ready`,'POST',{allow_without_rules:!REF});expect(ready.status).toBe(200);
  const text=ready.body.rendered as string;
  expect(text).toContain('Lot 5A');expect(text).toContain('D2 —');expect(text).toContain('F-');
  expect(text).not.toMatch(/(sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,})/);
  const exp=await call(`/missions/${mission.id}/export`);expect(exp.status).toBe(200);expect(await exp.text()).toBe(text);
  const tr=await json(`/missions/${mission.id}/transfer`,'POST',{mode:'clipboard'});expect(tr.body.status).toBe('copied');
  await writeFile('test-results/mission-lot-5A.md',text);
 });
 it('enregistre le registre et un verdict ; jamais « envoyée »',async()=>{
  const reg=await json(`/missions/${mission.id}/registry`,'PATCH',{executor_family:'sonnet',executor_effort:'medium',executor_why:'Travail courant : lecture, tests, écriture limitée.'});expect(reg.status).toBe(200);expect(reg.body.usage_source??'none').toBe('none');
  const v=await json(`/missions/${mission.id}/verdict`,'POST',{verdict:'redo',note:'Essai du lot 4 : mission générée, pas encore donnée à Claude Code.'});expect(v.status).toBe(200);expect(v.body.verdict).toBe('redo');
  expect((await json('/missions?project='+pA)).body.items.some((x:any)=>x.status==='sent')).toBe(false);
 });
 it('B ne voit pas la mission de A',async()=>{
  expect((await json(`/missions/${mission.id}`,'GET',undefined,b)).status).toBe(404);
  expect((await json(`/missions/${mission.id}/export`,'GET',undefined,b)).status).toBe(404);
  expect((await json('/missions?project='+pA,'GET',undefined,b)).status).toBe(404);
 });
});
