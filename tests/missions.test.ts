import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {Miniflare,createFetchMock} from 'miniflare';import {build} from 'esbuild';import {readFile,readdir,mkdir} from 'node:fs/promises';
import {normalizeMigrationForD1} from './migration-sql.mjs';
/* Lot 3 — missions, registre, retour : parcours complet dans Miniflare. Les réponses de GitHub et de Mistral sont SIMULÉES (aucun appel réel). */
let mf:Miniflare;const mock=createFetchMock();mock.disableNetConnect();const origin='http://localhost:8787';
let a:string,b:string,ownerA:string,project:string,projectB:string,recRepo:string,sportRepo:string,brokenRepo:string,task:string,decCurrent:string,decProposed:string,feature:string,aiConn:string,paidConn:string;
async function call(path:string,method='GET',data?:unknown,cookie=a){return mf.dispatchFetch(`${origin}/api${path}`,{method,headers:{Origin:origin,Cookie:cookie||'',...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});}
async function json(path:string,method='GET',data?:unknown,cookie=a){const r=await call(path,method,data,cookie);const text=await r.text();let body:any=null;try{body=JSON.parse(text);}catch{body=text;}return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const C1='1'.repeat(40),T1='2'.repeat(40),SP_C='3'.repeat(40),SP_T='4'.repeat(40),HEAD='5'.repeat(40),OLD='6'.repeat(40);
const AGENTS=`# Livre — consignes\n\n1. Tout gratuit : aucune IA payante.\n2. Une tâche = une branche (\`claude/<n°>-<sujet>\` ou \`codex/<n°>-<sujet>\`).\n3. Ne jamais changer l'identifiant de \`RECETTES_KV\`.\n4. Codex reprend tous les fichiers.\n`;
const blob=(t:string)=>JSON.stringify({encoding:'base64',content:Buffer.from(t).toString('base64')});
const gh=()=>mock.get('https://api.github.com');
const hdr={headers:{'content-type':'application/json'}};
function mockRepo(full:string,commit:string,tree:string,entries:{path:string;sha:string;text:string}[]){
 gh().intercept({method:'GET',path:`/repos/${full}/branches/main`}).reply(200,JSON.stringify({commit:{sha:commit,commit:{tree:{sha:tree}}}}),hdr).persist();
 gh().intercept({method:'GET',path:`/repos/${full}/git/trees/${tree}`}).reply(200,JSON.stringify({tree:entries.map(e=>({path:e.path,type:'blob',sha:e.sha,size:e.text.length}))}),hdr).persist();
 for(const e of entries)gh().intercept({method:'GET',path:`/repos/${full}/git/blobs/${e.sha}`}).reply(200,blob(e.text),hdr).persist();
}
beforeAll(async()=>{
 await mkdir('test-results',{recursive:true});await build({entryPoints:['server/index.ts'],outfile:'test-results/worker-missions.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022'});
 mf=new Miniflare({modules:true,scriptPath:'test-results/worker-missions.mjs',fetchMock:mock,compatibilityDate:'2025-10-24',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],queueProducers:{TASKS:'atelier-tasks'},bindings:{MASTER_KEY:Buffer.alloc(32,7).toString('base64'),APP_ORIGIN:origin,ALLOW_REGISTRATION:'true',STORAGE_LIMIT_MB:'1',MAX_FILE_MB:'1'}});
 const db=await mf.getD1Database('DB');
 for(const m of (await readdir('migrations')).filter(n=>/^\d+.*\.sql$/.test(n)).sort())await db.exec(normalizeMigrationForD1(await readFile(`migrations/${m}`,'utf8')));
 const ra=await json('/auth/register','POST',{email:'alice-m@example.test',password:'phrase-de-test-solide-2026'},'');a=ra.cookie!;ownerA=ra.body.user.id;
 const rb=await json('/auth/register','POST',{email:'bob-m@example.test',password:'autre-phrase-solide-2026'},'');b=rb.cookie!;
 project=(await json('/projects','POST',{name:'Livre de recettes (essai)'})).body.id;projectB=(await json('/projects','POST',{name:'Projet de Bob'},b)).body.id;
 const gc=await json('/connections','POST',{provider:'github',label:'GitHub essai',secret:'exemple-jeton-factice-2026',scopes:['read']});
 const mc=await json('/connections','POST',{provider:'mistral',label:'Mistral essai',secret:'exemple-cle-factice-2026',scopes:['chat'],api_consent:true});
 const oc=await json('/connections','POST',{provider:'openai',label:'Payante essai',secret:'exemple-cle-factice-2027',scopes:['chat'],api_consent:true});
 aiConn=mc.body.id;paidConn=oc.body.id;
 await db.prepare("UPDATE connections SET status='connected',models=? WHERE id=?").bind('["ministral-test"]',aiConn).run();
 await db.prepare("UPDATE connections SET status='connected',models=? WHERE id=?").bind('["gpt-test"]',paidConn).run();
 const at=new Date().toISOString(),repo=async(full:string)=>{const id=crypto.randomUUID();await db.prepare('INSERT INTO repositories(id,user_id,project_id,connection_id,full_name,branch,head_sha,created_at,default_branch) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,ownerA,project,gc.body.id,full,'main','0'.repeat(40),at,'main').run();return id;};
 recRepo=await repo('martinznt/Livre-de-recettes');sportRepo=await repo('martinznt/Sport');brokenRepo=await repo('martinznt/Casse');
 task=crypto.randomUUID();
 await db.prepare("INSERT INTO plan_tasks(id,user_id,project_id,title,objective,acceptance,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(task,ownerA,project,'Ajouter la liste de courses','Pouvoir cocher des ingrédients.','La liste se garde hors connexion.',at,at).run();
 await db.prepare("UPDATE plan_tasks SET files_hint=?,tests=?,do_not_touch=? WHERE id=?").bind('public/js/courses.js','npm test','Le KV','' + task).run();
 decCurrent=crypto.randomUUID();decProposed=crypto.randomUUID();
 for(const [id,st] of [[decCurrent,'validated'],[decProposed,'proposed']])await db.prepare("INSERT INTO project_decisions(id,user_id,project_id,title,reason,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,ownerA,project,st==='validated'?'Tout gratuit':'Idée à voir','Aucune IA payante.',st,at,at).run();
 feature=crypto.randomUUID();await db.prepare("INSERT INTO project_features(id,user_id,project_id,code,name,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(feature,ownerA,project,'F-0007','Liste de courses',at,at).run();
 mockRepo('martinznt/Livre-de-recettes',C1,T1,[{path:'AGENTS.md',sha:'a1'.repeat(20),text:AGENTS},{path:'CLAUDE.md',sha:'b1'.repeat(20),text:'@AGENTS.md\n\n- Après un changement dans `public/`, reconstruire : `node scripts/build-sw.mjs`.\n'},{path:'package.json',sha:'c1'.repeat(20),text:'{"scripts":{"test":"x","test:e2e":"y"}}'}]);
 mockRepo('martinznt/Sport',SP_C,SP_T,[{path:'package.json',sha:'d1'.repeat(20),text:'{"scripts":{"check":"x","test":"y","test:e2e":"z","test:audit":"w"}}'},{path:'README.md',sha:'e1'.repeat(20),text:'# Sport\nPas de règles.'}]);
 gh().intercept({method:'GET',path:'/repos/martinznt/Casse/branches/main'}).reply(503,'{"message":"boom"}',hdr).persist();
});
afterAll(async()=>{await mf?.dispose();});
const mkMission=async(over:any={})=>(await json('/missions','POST',{project_id:project,task_id:task,repository_id:recRepo,feature_ids:[feature],decision_ids:[decCurrent],...over}));

describe('missions pour Claude Code (GitHub et Mistral simulés)',()=>{
 it('assemble un brouillon sans IA depuis la tâche, la fonctionnalité et la décision actuelle',async()=>{
  const r=await mkMission();expect(r.status).toBe(201);
  expect(r.body.draft_source).toBe('assembled');expect(r.body.fields.objective).toBe('Pouvoir cocher des ingrédients.');expect(r.body.fields.done).toBe('La liste se garde hors connexion.');
  expect(r.body.rules.state).toBe('unread');expect(r.body.repo_full_name).toBe('martinznt/Livre-de-recettes');
  const d=await json('/missions/'+r.body.id);expect(d.body.rendered).toContain('RÈGLES DU DÉPÔT NON LUES');expect(d.body.rendered).toContain('Fonctionnalité F-0007');expect(d.body.gaps).toEqual([]);
 });
 it('refuse une décision non actuelle, une tâche ou un dépôt d\'un autre projet',async()=>{
  expect((await mkMission({decision_ids:[decProposed]})).status).toBe(400);
  expect((await mkMission({task_id:crypto.randomUUID()})).status).toBe(400);
  expect((await mkMission({repository_id:crypto.randomUUID()})).status).toBe(400);
  expect((await mkMission({feature_ids:[crypto.randomUUID()]})).status).toBe(400);
 });
 it('Recettes : lit les règles à un commit figé, fige le texte, exporte, marque « copiée » ; jamais « envoyée »',async()=>{
  const m=(await mkMission()).body;
  expect((await json(`/missions/${m.id}/ready`,'POST',{})).status).toBe(409);                       // règles non lues
  const rr=await json(`/missions/${m.id}/read-rules`,'POST',{});expect(rr.status).toBe(200);expect(rr.body.rules.state).toBe('read');expect(rr.body.rules.commit).toBe(C1);expect(rr.body.rules.files.map((f:any)=>f.path)).toEqual(['AGENTS.md','CLAUDE.md']);expect(rr.body.rules.ignored).toBe(1);
  const ready=await json(`/missions/${m.id}/ready`,'POST',{});expect(ready.status).toBe(200);
  expect(ready.body.rendered).toContain('RECETTES_KV');expect(ready.body.rendered).toContain('node scripts/build-sw.mjs');expect(ready.body.rendered).toContain('Commit lu : '+C1.slice(0,12));
  expect(ready.body.rendered).toContain('`npm test`, `npm run test:e2e`');expect(ready.body.rendered).not.toContain('test:audit');
  expect(ready.body.rendered.split('### Lignes ignorées')[0]).not.toMatch(/codex\/</i);expect(ready.body.rendered).toContain('```markdown');
  const same=await json('/missions/'+m.id);expect(same.body.rendered).toBe(ready.body.rendered);
  expect((await json(`/missions/${m.id}`,'PATCH',{revision:ready.body.revision,title:'x'})).status).toBe(409);                  // figée
  const exp=await call(`/missions/${m.id}/export`);expect(exp.status).toBe(200);expect(await exp.text()).toBe(ready.body.rendered);expect(exp.headers.get('x-content-hash')).toBe(ready.body.content_hash);
  expect((await json(`/missions/${m.id}/transfer`,'POST',{mode:'sent'})).status).toBe(400);
  const t=await json(`/missions/${m.id}/transfer`,'POST',{mode:'clipboard'});expect(t.body.status).toBe('copied');expect(t.body.status_label).toBe('Copiée');
 });
 it('Sport : aucun CLAUDE.md ni AGENTS.md — la mission le dit et n\'emprunte rien à Recettes',async()=>{
  const m=(await mkMission({repository_id:sportRepo,feature_ids:[],decision_ids:[]})).body;
  const rr=await json(`/missions/${m.id}/read-rules`,'POST',{});expect(rr.body.rules.state).toBe('no_rule_files');expect(rr.body.rules.commit).toBe(SP_C);
  const ready=await json(`/missions/${m.id}/ready`,'POST',{});expect(ready.status).toBe(200);
  const text:string=ready.body.rendered;
  expect(text).toContain('Aucun `CLAUDE.md` ni `AGENTS.md`');expect(text).toContain('`npm run check`, `npm test`, `npm run test:e2e`, `npm run test:audit`');
  for(const leak of ['RECETTES_KV','build-sw','claude/<n°>','Tout gratuit'])expect(text,leak).not.toContain(leak);
 });
 it('changer de dépôt sur un brouillon efface les règles lues (jamais mélangées)',async()=>{
  const m=(await mkMission()).body;await json(`/missions/${m.id}/read-rules`,'POST',{});
  const cur=await json('/missions/'+m.id);expect(cur.body.rules.state).toBe('read');
  const sw=await json(`/missions/${m.id}`,'PATCH',{revision:cur.body.revision,repository_id:sportRepo});
  expect(sw.status).toBe(200);expect(sw.body.rules.state).toBe('unread');expect(sw.body.rules.files).toEqual([]);expect(sw.body.repo_full_name).toBe('martinznt/Sport');
  const d=await json('/missions/'+m.id);expect(d.body.rendered).not.toContain('RECETTES_KV');
 });
 it('GitHub en panne : « règles non lues » ; prêt seulement sur confirmation explicite, et le texte le dit',async()=>{
  const m=(await mkMission({repository_id:brokenRepo})).body;
  const rr=await json(`/missions/${m.id}/read-rules`,'POST',{});expect(rr.status).toBe(200);expect(rr.body.rules.state).toBe('not_read');expect(rr.body.read_error).toBeTruthy();
  expect((await json(`/missions/${m.id}/ready`,'POST',{})).status).toBe(409);
  const ok=await json(`/missions/${m.id}/ready`,'POST',{allow_without_rules:true});expect(ok.status).toBe(200);expect(ok.body.rendered).toContain('RÈGLES DU DÉPÔT NON LUES');
 });
 it('mission incomplète : sans objectif ni critère « terminé », elle n\'est pas prête',async()=>{
  const m=(await json('/missions','POST',{project_id:project,repository_id:sportRepo,title:'Sans détail'})).body;
  const d=await json('/missions/'+m.id);expect(d.body.gaps).toEqual(['l’objectif','le critère « terminé »','le périmètre ou les fichiers concernés']);
  await json(`/missions/${m.id}/read-rules`,'POST',{});
  const r=await json(`/missions/${m.id}/ready`,'POST',{});expect(r.status).toBe(409);expect(r.body.error||r.body.message||JSON.stringify(r.body)).toContain('l’objectif');
 });
 it('reformulation par une IA gratuite : hypothèse tant que non relue ; IA payante refusée ; restauration possible',async()=>{
  const m=(await mkMission({repository_id:sportRepo,feature_ids:[],decision_ids:[]})).body;await json(`/missions/${m.id}/read-rules`,'POST',{});
  expect((await json(`/missions/${m.id}/rephrase`,'POST',{connection_id:paidConn,model:'gpt-test'})).status).toBe(403);
  const sse=['data: '+JSON.stringify({choices:[{delta:{content:'{"objective":"Cocher des ingrédients","perimeter":"","done":"La liste reste hors connexion"}'}}],model:'ministral-test'}),'','data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]}),'','data: [DONE]',''].join('\n');
  mock.get('https://api.mistral.ai').intercept({method:'POST',path:'/v1/chat/completions'}).reply(200,sse,{headers:{'content-type':'text/event-stream'}});
  const rw=await json(`/missions/${m.id}/rephrase`,'POST',{connection_id:aiConn,model:'ministral-test'});expect(rw.status).toBe(200);
  expect(rw.body.draft_source).toBe('ai');expect(rw.body.fields.objective).toBe('Cocher des ingrédients');expect(rw.body.fields.perimeter).toBe('');expect(rw.body.reviewed_at).toBeNull();
  const d=await json('/missions/'+m.id);expect(d.body.rendered).toContain('HYPOTHÈSE');
  expect((await json(`/missions/${m.id}/ready`,'POST',{})).status).toBe(409);
  const back=await json(`/missions/${m.id}/restore-draft`,'POST',{});expect(back.body.draft_source).toBe('assembled');expect(back.body.fields.objective).toBe('Pouvoir cocher des ingrédients.');
 });
 it('isolation A/B : Bob ne voit, ne modifie, ne fige ni ne juge aucune mission d\'Alice',async()=>{
  const m=(await mkMission()).body;
  expect((await json('/missions?project='+project,'GET',undefined,b)).status).toBe(404);
  for(const [p,method,body] of [[`/missions/${m.id}`,'GET',undefined],[`/missions/${m.id}`,'PATCH',{revision:1,title:'x'}],[`/missions/${m.id}`,'DELETE',undefined],[`/missions/${m.id}/read-rules`,'POST',{}],[`/missions/${m.id}/ready`,'POST',{}],
   [`/missions/${m.id}/export`,'GET',undefined],[`/missions/${m.id}/transfer`,'POST',{mode:'clipboard'}],[`/missions/${m.id}/registry`,'PATCH',{executor_family:'sonnet'}],[`/missions/${m.id}/return`,'GET',undefined],[`/missions/${m.id}/verdict`,'POST',{verdict:'accepted'}],[`/missions/${m.id}/rephrase`,'POST',{connection_id:aiConn,model:'ministral-test'}]] as const)
   expect((await call(p,method,body,b)).status,method+' '+p).toBe(404);
  expect((await json('/missions','POST',{project_id:project,repository_id:recRepo,title:'Intrusion'},b)).status).toBe(404);
  expect((await json('/missions','POST',{project_id:projectB,repository_id:recRepo,title:'Dépôt d\'Alice'},b)).status).toBe(400);
  const exp=await json('/account/export?metadata=true','GET',undefined,b);expect(exp.body.missions||[]).toEqual([]);
  const own=await json('/account/export?metadata=true');expect(own.body.missions.length).toBeGreaterThan(0);
 });
 it('registre : rien d\'inventé (consommation vide par défaut) ; IA et modèle déclarés par Martin ; jetons « déclarés »',async()=>{
  const m=(await mkMission()).body;expect([m.input_tokens,m.output_tokens,m.cost_usd,m.usage_source]).toEqual([null,null,null,'none']);expect(m.advice_line).toBeTruthy();
  const r=await json(`/missions/${m.id}/registry`,'PATCH',{executor_family:'sonnet',executor_model:'Sonnet 5.5',executor_effort:'medium',executor_why:'Tâche courante',input_tokens:1200,output_tokens:340});
  expect(r.status).toBe(200);expect(r.body.executor_family).toBe('sonnet');expect(r.body.usage_source).toBe('declared');expect(r.body.cost_usd).toBeNull();
  expect((await json(`/missions/${m.id}/registry`,'PATCH',{executor_why:'clé sk-abcdefghijklmnopqrstuvwxyz123456'})).status).toBe(400);
 });
 it('retour : PR, tests GitHub lus, revue Atelier du SHA courant seulement ; verdict en un clic avec preuve',async()=>{
  const db=await mf.getD1Database('DB'),at=new Date().toISOString();
  const m=(await mkMission()).body;await json(`/missions/${m.id}/read-rules`,'POST',{});await json(`/missions/${m.id}/ready`,'POST',{});
  expect((await json(`/missions/${m.id}/verdict`,'POST',{verdict:'accepted'})).status).toBe(409);        // sans PR : tests non lus → il faut écrire pourquoi
  const ng=await json(`/missions/${m.id}/return`);expect(ng.body.linked).toBe(false);
  await json(`/missions/${m.id}/registry`,'PATCH',{pr_number:12});
  for(const sha of [OLD,HEAD])await db.prepare("INSERT INTO review_runs(id,user_id,project_id,repository_id,pr_number,head_sha,status,created_at,updated_at) VALUES(?,?,?,?,12,?,'completed',?,?)").bind(crypto.randomUUID(),ownerA,project,recRepo,sha,at,at).run();
  gh().intercept({method:'GET',path:'/repos/martinznt/Livre-de-recettes/pulls/12'}).reply(200,JSON.stringify({title:'Liste de courses',state:'open',draft:true,head:{sha:HEAD}}),hdr).persist();
  gh().intercept({method:'GET',path:`/repos/martinznt/Livre-de-recettes/commits/${HEAD}/check-runs`,query:{per_page:30}}).reply(200,JSON.stringify({check_runs:[{name:'ci',status:'completed',conclusion:'failure'}]}),hdr).times(3);
  const red=await json(`/missions/${m.id}/return`);expect(red.body.checks_state).toBe('red');expect(red.body.checks_label).toContain('aucune valeur');expect(red.body.pr.url).toBe('https://github.com/martinznt/Livre-de-recettes/pull/12');
  expect(red.body.review.current.head_sha).toBe(HEAD);expect(red.body.review.older).toBe(1);
  expect((await json(`/missions/${m.id}/verdict`,'POST',{verdict:'accepted'})).status).toBe(409);            // échec : raison obligatoire
  const redo=await json(`/missions/${m.id}/verdict`,'POST',{verdict:'redo',note:'Test en échec'});expect(redo.status).toBe(200);expect(redo.body.verdict).toBe('redo');expect(redo.body.evidence.checks_state).toBe('red');expect(redo.body.evidence.pr_number).toBe(12);
  gh().intercept({method:'GET',path:`/repos/martinznt/Livre-de-recettes/commits/${HEAD}/check-runs`,query:{per_page:30}}).reply(200,JSON.stringify({check_runs:[{name:'ci',status:'completed',conclusion:'success'}]}),hdr).persist();
  const ok=await json(`/missions/${m.id}/verdict`,'POST',{verdict:'accepted'});expect(ok.status).toBe(200);expect(ok.body.verdict).toBe('accepted');expect(ok.body.verdict_label).toBe('Acceptée');expect(ok.body.evidence.checks_state).toBe('green');
  const list=await json('/missions?project='+project);expect(list.body.items.find((x:any)=>x.id===m.id).verdict).toBe('accepted');
 });
 it('un brouillon jamais préparé ne peut pas être jugé ; seul un brouillon se supprime',async()=>{
  const m=(await mkMission()).body;expect((await json(`/missions/${m.id}/verdict`,'POST',{verdict:'abandoned'})).status).toBe(409);
  expect((await json(`/missions/${m.id}`,'DELETE')).status).toBe(200);
 });
});
