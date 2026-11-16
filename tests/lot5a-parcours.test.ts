import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {Miniflare,createFetchMock} from 'miniflare';import {build} from 'esbuild';import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';import {existsSync} from 'node:fs';import {execFileSync} from 'node:child_process';
import {normalizeMigrationForD1} from './migration-sql.mjs';
import {checkSeed,seedFile,SEED_LIMITS} from '../server/seed-core.ts';
/* Lot 5A — Livre de recettes et Sport suivis dans Atelier, EN LECTURE SEULE.
   Parcours joué dans Miniflare avec GitHub SIMULÉ (aucun appel réel). Les règles des deux dépôts viennent de leurs VRAIS fichiers,
   lus avec `git show` au commit épinglé ; la simulation ne répond qu'aux requêtes GET (toute autre méthode ferait échouer le test). */
const REC={full:'martinznt/Livre-de-recettes',dir:'/home/user/Livre-de-recettes',commit:'92ec7c54c9987d52fcaa0f838dce01d60c3c7f50'};
const SPO={full:'martinznt/Sport',dir:'/home/user/Sport',commit:'f0ef3b008e38f54b28c49d8f1ae9605d07298f29'};
const HAVE_CLONES=existsSync(REC.dir)&&existsSync(SPO.dir);
const SEED_R=JSON.parse(await readFile('docs/sites/recettes-depart.json','utf8')),SEED_S=JSON.parse(await readFile('docs/sites/sport-depart.json','utf8'));
let mf:Miniflare;const mock=createFetchMock();mock.disableNetConnect();const origin='http://localhost:8787';
let a:string,b:string,ownerA:string,ownerB:string,pR:string,pS:string,pB:string;
const githubCalls:string[]=[];
async function call(path:string,method='GET',data?:unknown,cookie=a){return mf.dispatchFetch(`${origin}/api${path}`,{method,headers:{Origin:origin,Cookie:cookie||'',...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:typeof data==='string'?data:JSON.stringify(data)});}
async function json(path:string,method='GET',data?:unknown,cookie=a){const r=await call(path,method,data,cookie);const text=await r.text();let body:any=null;try{body=JSON.parse(text);}catch{body=text;}return {status:r.status,body,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
const git=(dir:string,...args:string[])=>execFileSync('git',['-C',dir,...args],{encoding:'utf8',maxBuffer:64e6});
const gh=()=>mock.get('https://api.github.com');const hdr={headers:{'content-type':'application/json'}};
const q=(path:string,body:string)=>gh().intercept({method:'GET',path}).reply(200,(o:any)=>{githubCalls.push(`${o.method} ${o.path}`);return body;},hdr).persist();
/** Simule GitHub pour un dépôt avec ses vrais fichiers racine (arbre, empreintes et contenus lus dans Git au commit épinglé). */
function simulate(site:{full:string;dir:string;commit:string}){
 const tree=git(site.dir,'rev-parse',`${site.commit}^{tree}`).trim();
 const entries=git(site.dir,'ls-tree',site.commit).trim().split('\n').map(l=>{const m=/^(\d+) (\w+) ([0-9a-f]{40})\t(.+)$/.exec(l)!;return {mode:m[1],type:m[2],sha:m[3],path:m[4]};});
 const need=new Set(['AGENTS.md','CLAUDE.md','package.json']);
 const treeBody=entries.map(e=>({path:e.path,type:e.type==='blob'?'blob':'tree',sha:e.sha,size:e.type==='blob'?Number(git(site.dir,'cat-file','-s',e.sha).trim()):0}));
 q(`/repos/${site.full}/branches/main`,JSON.stringify({commit:{sha:site.commit,commit:{tree:{sha:tree}}}}));
 q(`/repos/${site.full}/git/trees/${tree}`,JSON.stringify({tree:treeBody}));
 for(const e of entries)if(need.has(e.path)){const text=git(site.dir,'show',`${site.commit}:${e.path}`);q(`/repos/${site.full}/git/blobs/${e.sha}`,JSON.stringify({encoding:'base64',content:Buffer.from(text).toString('base64')}));}
 return {tree,rootFiles:entries.map(e=>e.path)};
}
let simR:{tree:string;rootFiles:string[]},simS:{tree:string;rootFiles:string[]};
const repoRow:Record<string,string>={};
beforeAll(async()=>{
 await mkdir('test-results',{recursive:true});await build({entryPoints:['server/index.ts'],outfile:'test-results/worker-lot5a.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022'});
 mf=new Miniflare({modules:true,scriptPath:'test-results/worker-lot5a.mjs',fetchMock:mock,compatibilityDate:'2025-10-24',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],queueProducers:{TASKS:'atelier-tasks'},bindings:{MASTER_KEY:'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',APP_ORIGIN:origin,ALLOW_REGISTRATION:'true'}});
 const db=await mf.getD1Database('DB');
 for(const m of (await readdir('migrations')).filter(n=>/^\d+.*\.sql$/.test(n)).sort())await db.exec(normalizeMigrationForD1(await readFile(`migrations/${m}`,'utf8')));
 const ra=await json('/auth/register','POST',{email:'alice-l5a@example.test',password:'phrase-de-test-solide-2026'},'');a=ra.cookie!;ownerA=ra.body.user.id;
 const rb=await json('/auth/register','POST',{email:'bob-l5a@example.test',password:'autre-phrase-solide-2026'},'');b=rb.cookie!;ownerB=rb.body.user.id;
 pR=(await json('/projects','POST',{name:'Livre de recettes'})).body.id;pS=(await json('/projects','POST',{name:'Sport'})).body.id;pB=(await json('/projects','POST',{name:'Livre de recettes (Bob)'},b)).body.id;
 await json(`/model/${pR}/modules`,'PUT',{template:'livre_recettes'});await json(`/model/${pS}/modules`,'PUT',{template:'sport'});await json(`/model/${pB}/modules`,'PUT',{template:'livre_recettes'},b);
 if(HAVE_CLONES){
  simR=simulate(REC);simS=simulate(SPO);
  const gc=await json('/connections','POST',{provider:'github',label:'GitHub essai',secret:'exemple-jeton-factice-2026',scopes:['read']});const at=new Date().toISOString();
  for(const [k,proj,site] of [['r',pR,REC],['s',pS,SPO]] as const){
   repoRow[k]=crypto.randomUUID();
   await db.prepare('INSERT INTO repositories(id,user_id,project_id,connection_id,full_name,branch,head_sha,created_at,default_branch) VALUES(?,?,?,?,?,?,?,?,?)').bind(repoRow[k],ownerA,proj,gc.body.id,site.full,'main',site.commit,at,'main').run();
  }
 }
});
afterAll(async()=>{await mf?.dispose();});
const count=async(sql:string,...args:any[])=>(await (await mf.getD1Database('DB')).prepare(sql).bind(...args).first<{n:number}>())!.n;
const snapshot=async(user:string)=>{const db=await mf.getD1Database('DB');const out:Record<string,unknown>={};for(const t of ['project_features','project_decisions','item_lifecycle','lifecycle_events','project_setup'])out[t]=(await db.prepare(`SELECT * FROM ${t} WHERE user_id=? ORDER BY 1,2,3`).bind(user).all()).results;return out;};

describe('fichiers de départ : format, sources, niveaux',()=>{
 for(const [nom,S] of [['Livre de recettes',SEED_R],['Sport',SEED_S]] as const)describe(nom,()=>{
  it('est valable, sans problème de règle, sous les limites d’import',()=>{
   const p=seedFile.safeParse(S);expect(p.success,JSON.stringify(p.success?'':p.error.issues.slice(0,3))).toBe(true);
   expect(checkSeed(p.data!)).toEqual([]);expect(Buffer.byteLength(JSON.stringify(S))).toBeLessThan(SEED_LIMITS.bytes);expect(S.features.length).toBeLessThanOrEqual(SEED_LIMITS.features);
  });
  it('chaque ligne cite sa source (fichier, ligne, commit épinglé) ; niveau « Rapporté » partout ; jamais « Vérifié » ni « Vérifié sur téléphone »',()=>{
   const short=S.project.pinned_commit.slice(0,7);
   for(const f of S.features){
    expect(f.reliability,f.key).toBe('reported');expect(f.test_ref,f.key).toBe('');expect(f.state,f.key).not.toBe('phone_verified');
    expect(f.source_ref.length,f.key).toBeGreaterThan(10);
    if(f.source_kind==='repo_file'){expect(f.source_ref,f.key).toContain(short);expect(f.source_ref,f.key).toMatch(/ligne \d+/);}
    else expect(f.source_ref,f.key).toMatch(/GitHub .*pull\/\d+/);
    expect(f.description,f.key).toContain('Niveau Atelier : Rapporté');
   }
   for(const d of S.decisions)expect(d.source_ref,d.key).toContain(short);
  });
  it('ne contient aucun secret et aucune trace de conversation de l’export',()=>{
   const t=JSON.stringify(S);expect(t).not.toMatch(/(sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN|conversations?\.json|chatgpt\.com\/c\/)/i);
  });
 });
 it('l’étiquette d’origine est recopiée (symbole ou crochets) et l’état suit la table fixe ; le sens de ⏳ diffère entre les deux sites',()=>{
  const st=(S:any,sym:string)=>S.features.filter((f:any)=>f.key.startsWith('dem-')&&f.description.includes('Étiquette d’origine : '+sym));
  for(const f of st(SEED_R,'✅'))expect(f.state).toBe('done');for(const f of st(SEED_R,'🟡'))expect(f.state).toBe('in_progress');
  for(const f of st(SEED_R,'⏳'))expect(f.state).toBe('to_design');for(const f of st(SEED_R,'⚠️'))expect(f.state).toBe('blocked');
  for(const f of st(SEED_S,'⏳'))expect(f.state).toBe('in_progress');
  expect(st(SEED_R,'✅').length+st(SEED_R,'🟡').length+st(SEED_R,'⏳').length+st(SEED_R,'⚠️').length).toBeGreaterThan(40);
  expect(st(SEED_S,'✅').length).toBeGreaterThan(20);
 });
 it('les lignes sans état d’origine ne sont pas reprises mais sont comptées dans EXTRACTION.json ; les états mixtes sont listés',async()=>{
  const e=JSON.parse(await readFile('docs/sites/EXTRACTION.json','utf8'));
  expect(e.recettes.lignes_non_reprises.length).toBeGreaterThan(0);expect(e.sport.lignes_non_reprises.length).toBe(8);expect(e.sport.etats_mixtes.length).toBe(2);expect(e.recettes.etats_mixtes.length).toBeGreaterThanOrEqual(1);
  for(const x of [...e.recettes.lignes_non_reprises,...e.sport.lignes_non_reprises])expect(x.raison).toMatch(/non reprise/);
 });
 it.skipIf(!HAVE_CLONES)('à jour : les fichiers versionnés correspondent à ce que fabrique scripts/build-sites-seed.mjs (relu dans Git, commit épinglé)',()=>{
  expect(()=>execFileSync('node',['scripts/build-sites-seed.mjs','--check'],{stdio:'pipe'})).not.toThrow();
 });
 it.skipIf(!HAVE_CLONES)('contrôle d’extraction : chaque ligne reprise est retrouvée dans son texte d’origine (nom, état, étiquette)',()=>{
  expect(()=>execFileSync('node',['scripts/check-sites-seed.mjs'],{stdio:'pipe'})).not.toThrow();
 });
});

describe('import des deux fichiers : aperçu, ajout, sans doublon, sans suppression',()=>{
 it('aperçu : annonce ce qui sera créé et n’écrit rien',async()=>{
  const before=await snapshot(ownerA);
  const r=await json(`/model/${pR}/import?dry_run=1`,'POST',SEED_R);expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ok:true,imported:false,dry_run:true,summary:{features:{new:SEED_R.features.length,already_present:0},decisions:{new:SEED_R.decisions.length,already_present:0}}});
  expect(await snapshot(ownerA)).toEqual(before);
 });
 it('crée les fonctionnalités et les décisions des deux sites, chacune dans son projet',async()=>{
  const r1=await json(`/model/${pR}/import`,'POST',SEED_R),r2=await json(`/model/${pS}/import`,'POST',SEED_S);expect(r1.status).toBe(201);expect(r2.status).toBe(201);
  expect(await count('SELECT count(*) AS n FROM project_features WHERE user_id=? AND project_id=?',ownerA,pR)).toBe(SEED_R.features.length);
  expect(await count('SELECT count(*) AS n FROM project_features WHERE user_id=? AND project_id=?',ownerA,pS)).toBe(SEED_S.features.length);
  const decs=(await json(`/spaces/${pR}/decisions`)).body.items;expect(decs.length).toBe(SEED_R.decisions.length);expect(new Set(decs.map((d:any)=>d.status))).toEqual(new Set(['proposed']));
  const decS=(await json(`/spaces/${pS}/decisions`)).body.items;expect(decS.length).toBe(SEED_S.decisions.length);expect(new Set(decS.map((d:any)=>d.status))).toEqual(new Set(['proposed']));
 });
 it('niveaux, états et sources conservés : tout est « Rapporté », rien n’est « Vérifié sur téléphone »',async()=>{
  for(const [p,S] of [[pR,SEED_R],[pS,SEED_S]] as const){
   const items=(await json(`/model/${p}/features?all=1`)).body.items;expect(items.length).toBe(S.features.length);
   for(const it of items){expect(it.life.reliability).toBe('reported');expect(it.state).not.toBe('phone_verified');expect(it.source_ref.length).toBeGreaterThan(10);}
  }
  const items=(await json(`/model/${pS}/features?all=1`)).body.items,f=items.find((x:any)=>x.name==='Les mettre à tous les endroits liés');
  expect(f).toMatchObject({state:'in_progress',state_label:'En cours',source_kind:'repo_file'});expect(f.source_ref).toContain('docs/DEMANDES_8_35.md, ligne 38');expect(f.source_ref).toContain('f0ef3b0');
  const hist=await json(`/model/${pS}/lifecycle/feature/${f.id}/history`);expect(hist.body.items[0].reason).toContain('Importé par vous depuis le fichier de départ');
  const pr=(await json(`/model/${pR}/features?all=1`)).body.items.find((x:any)=>x.name.startsWith('PR n°61'));expect(pr.state).toBe('in_progress');expect(pr.source_kind).toBe('other');
 });
 it('idempotent : un second import ne crée rien ; un fichier plus court ne supprime rien',async()=>{
  const before=await snapshot(ownerA);
  const r=await json(`/model/${pR}/import`,'POST',SEED_R);expect(r.status).toBe(200);expect(r.body).toMatchObject({imported:false,summary:{features:{new:0,already_present:SEED_R.features.length}}});
  const r2=await json(`/model/${pS}/import`,'POST',{...SEED_S,features:SEED_S.features.slice(0,3),decisions:[]});expect(r2.status).toBe(200);
  expect(await snapshot(ownerA)).toEqual(before);
 });
 it('la loupe retrouve une fonctionnalité de chaque site avec son origine',async()=>{
  const r=await json(`/workbench/find?q=${encodeURIComponent('PR n°94')}&all=1&project=${pR}`);expect(r.status).toBe(200);expect(JSON.stringify(r.body)).toContain('PR n°94');
  const s=await json(`/workbench/find?q=${encodeURIComponent('endroits liés')}&all=1&project=${pS}`);expect(JSON.stringify(s.body)).toContain('endroits liés');
 });
});

describe('isolation entre comptes A et B',()=>{
 it('B ne peut ni lire, ni aperçu, ni importer dans les projets de A',async()=>{
  const before=await snapshot(ownerA);
  for(const p of [pR,pS]){
   for(const path of [`/model/${p}/import?dry_run=1`,`/model/${p}/import`])expect((await json(path,'POST',SEED_R,b)).status).toBe(404);
   expect((await json(`/model/${p}/features?all=1`,'GET',undefined,b)).status).toBe(404);expect((await json(`/spaces/${p}/decisions`,'GET',undefined,b)).status).toBe(404);
  }
  expect(await snapshot(ownerA)).toEqual(before);
 });
 it('B importe le même fichier dans son projet : tout est créé pour B, rien de plus pour A, identifiants différents ; la recherche de B ne voit rien de A',async()=>{
  const nA=await count('SELECT count(*) AS n FROM project_features WHERE user_id=?',ownerA);
  const r=await json(`/model/${pB}/import`,'POST',SEED_R,b);expect(r.status).toBe(201);
  expect(await count('SELECT count(*) AS n FROM project_features WHERE user_id=?',ownerB)).toBe(SEED_R.features.length);expect(await count('SELECT count(*) AS n FROM project_features WHERE user_id=?',ownerA)).toBe(nA);
  expect(await count('SELECT count(*) AS n FROM project_features WHERE user_id=? AND id IN (SELECT id FROM project_features WHERE user_id=?)',ownerB,ownerA)).toBe(0);
  const rb=await json(`/workbench/find?q=${encodeURIComponent('endroits liés')}&all=1&project=${pS}`,'GET',undefined,b);expect(JSON.stringify(rb.body)).not.toContain(pS);
 });
});

describe.skipIf(!HAVE_CLONES)('missions : une par site, règles propres lues au commit épinglé, GitHub en lecture seule',()=>{
 const out:Record<string,any>={};
 it('les arbres simulés sont les vrais : Recettes a AGENTS.md et CLAUDE.md, Sport n’en a aucun',()=>{
  expect(simR.rootFiles).toEqual(expect.arrayContaining(['AGENTS.md','CLAUDE.md','package.json']));
  expect(simS.rootFiles).not.toContain('AGENTS.md');expect(simS.rootFiles).not.toContain('CLAUDE.md');expect(simS.rootFiles).toContain('package.json');
 });
 const make=(label:string,proj:()=>string,repo:()=>string,task:any,featureName:string,fields:any)=>it(`${label} : tâche, mission complète, règles lues, figée, copiée, jamais « envoyée »`,async()=>{
  const t=await json(`/spaces/${proj()}/tasks`,'POST',task);expect(t.status).toBe(201);
  const feats=(await json(`/model/${proj()}/features?all=1`)).body.items,fid=feats.find((x:any)=>x.name.includes(featureName));expect(fid,featureName).toBeTruthy();
  const m=await json('/missions','POST',{project_id:proj(),task_id:t.body.id,repository_id:repo(),level:'full',feature_ids:[fid.id],decision_ids:[],fields});expect(m.status).toBe(201);
  const rr=await json(`/missions/${m.body.id}/read-rules`,'POST',{});expect(rr.status).toBe(200);
  const ready=await json(`/missions/${m.body.id}/ready`,'POST',{allow_without_rules:false});expect(ready.status,JSON.stringify(ready.body).slice(0,300)).toBe(200);
  const text=ready.body.rendered as string;out[label]={mission:m.body,rules:rr.body.rules,text};
  expect(text).not.toMatch(/(sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,})/);
  const exp=await call(`/missions/${m.body.id}/export`);expect(await exp.text()).toBe(text);
  expect((await json(`/missions/${m.body.id}/transfer`,'POST',{mode:'clipboard'})).body.status).toBe('copied');
  await writeFile(`test-results/mission-lot5a-${label}.md`,text);
  expect((await json('/missions?project='+proj())).body.items.some((x:any)=>x.status==='sent')).toBe(false);
  // B ne voit pas cette mission
  expect((await json(`/missions/${m.body.id}`,'GET',undefined,b)).status).toBe(404);expect((await json(`/missions/${m.body.id}/export`,'GET',undefined,b)).status).toBe(404);
 });
 make('recettes',()=>pR,()=>repoRow.r,{title:'Recettes — 4.9 : téléphone tenu à l’horizontale (page plus haute que l’écran)',
  objective:'Point 4.9 de CE_QUI_MANQUE.txt : « Téléphone tenu à l’horizontale : la page du livre est plus haute que l’écran, il faut la faire défiler (rien n’est perdu ; le mode cuisine, lui, est fait pour cet usage). En vertical, de 320 × 640 à la tablette, la page tient au-dessus de la navigation. » Rendre la page plus utilisable en paysage sur téléphone, sans rien changer en vertical.',
  acceptance:'En paysage (par exemple 640 × 360 et 740 × 360), la navigation et l’en-tête prennent moins de place et le contenu reste atteignable sans rien perdre ; le vertical (320 × 640 à la tablette) est identique ; tests existants verts ; un test navigateur en paysage ; hors connexion préservé.',
  proof:'Sortie réelle de npm test et du test navigateur ; captures en paysage à regarder ; liste de ce qui n’a pas été essayé sur le Galaxy A05s.',priority:2},
  'Téléphone tenu à l',{objective:'Rendre la fiche et la navigation du livre utilisables en paysage sur téléphone (point 4.9 de CE_QUI_MANQUE.txt), sans rien changer en vertical.',
   perimeter:'Seulement la mise en page en paysage sur petit écran (hauteur ≤ 480 px) : barre de navigation, en-tête, fiche. Aucune donnée, aucun KV, aucune migration, aucune dépendance.',
   forbidden:'Ne pas modifier les clés KV ni RECETTES_KV. Ne rien fusionner (Martin fusionne ; une fusion met en ligne). Aucun service payant ni IA ajoutée. Ne pas supprimer ni affaiblir un test. Ne pas toucher aux PR ouvertes #61, #69, #81, #94, #96, #97, #98, #107, #139.',
   files:'public/ (feuilles de style et écrans de navigation : à repérer ; Atelier ne les a pas lus)\npublic/sw.js (à reconstruire avec node scripts/build-sw.mjs après un changement dans public/)\ntests/ (un test navigateur en paysage)\nCE_QUI_MANQUE.txt (règle n°9 du dépôt : étiquette [testé], [code] ou [non vérifié], point 4.9 à mettre à jour)\ndocs/agents/etat-claude.md (section « Pour reprendre », à tenir à jour)',
   tests:'npm test\nnpm run test:e2e (tests navigateur ciblés d’abord)\nnode scripts/build-sw.mjs\nnpm run deploy:check (avant toute mise en ligne ; doit montrer RECETTES_KV 6318a2cc55cd40c19985da6eb5c9665e)'});
 make('sport',()=>pS,()=>repoRow.s,{title:'Sport — Mettre les petits messages « va dans … » à tous les endroits liés',
  objective:'Demande 🟡 de docs/DEMANDES_8_35.md ligne 38 : « Les mettre à tous les endroits liés » (petits messages « si tu as besoin de …, va dans … » cliquables). Le document dit : lieux, objectifs, phases, étirements, mesures, poids, bilan, exercices, zones à ménager et Progrès sont faits ; « à compléter selon ton retour ». Repérer les endroits liés encore sans message et les compléter.',
  acceptance:'Chaque endroit lié repéré a son message cliquable avec « ‹ Retour » ; le test existant qui vérifie que chaque chemin mène à la bonne page couvre les nouveaux chemins ; aucun débordement à 320, 360 et 390 px ; texte du site en français simple ; la liste des endroits ajoutés est donnée à Martin.',
  proof:'Sortie réelle de npm run check, npm test, npm run test:e2e ; liste des endroits ajoutés ; captures à 360 px.',priority:2},
  'Les mettre à tous les endroits liés',{objective:'Compléter les petits messages « si tu as besoin de …, va dans … » aux endroits liés qui n’en ont pas encore (demande 🟡, DEMANDES_8_35.md ligne 38).',
   perimeter:'Seulement les messages de renvoi (texte et lien) et leur test. Aucune nouvelle fonction, aucune opération Cloudflare, aucune annonce « Envoyer à tous ».',
   forbidden:'Pas de déploiement ni de fusion dans main (Martin fusionne ; la fusion déclenche le déploiement automatique). Base de données : seulement des ajouts, rien de supprimé. Ne pas supprimer ni affaiblir un test. Aucun service payant.',
   files:'public/ et pages/ (écrans : à repérer ; Atelier ne les a pas lus)\ntests/ (test des chemins « va dans »)',
   tests:'npm run check\nnpm test\nnpm run test:e2e'});
 it('le contenu des deux missions : règles propres citées avec le commit, absence de règles signalée pour Sport, Codex signalé pour Recettes',()=>{
  const r=out.recettes.text as string,s=out.sport.text as string;
  expect(r).toContain(REC.commit.slice(0,12));expect(r).toContain('AGENTS.md');expect(r).toMatch(/Codex/);expect(r).toContain('RECETTES_KV');
  expect(s).toContain(SPO.commit.slice(0,12));expect(s).toMatch(/Aucun `CLAUDE\.md` ni `AGENTS\.md`/);
  expect(r).toContain('Téléphone tenu à l');expect(s).toContain('Les mettre à tous les endroits liés');
 });
 it('aucune écriture dans les dépôts lus : toutes les requêtes GitHub de la simulation sont des GET sur /repos/…, et rien n’a été modifié dans les clones',()=>{
  expect(githubCalls.length).toBeGreaterThanOrEqual(6);
  for(const c of githubCalls){expect(c.startsWith('GET /repos/'),c).toBe(true);expect(c).toMatch(/^GET \/repos\/martinznt\/(Livre-de-recettes|Sport)\/(branches|git\/trees|git\/blobs)\//);}
  for(const site of [REC,SPO]){expect(git(site.dir,'rev-parse','HEAD').trim().length).toBe(40);expect(git(site.dir,'status','--porcelain').trim()).toBe('');}
 });
});
