/* Lot 1 : la migration 0023 sur une base REMPLIE. Les migrations 0001 à 0022 sont appliquées, des données réalistes sont
   posées (deux comptes, projets Sport / Recettes / libre, décisions dans les 4 états, documents, notes, tâches), puis 0023.
   Preuves : (1) chaque ancienne table est identique ligne par ligne avant/après ; (2) les nouvelles tables sont vides ;
   (3) les réponses des écrans de lecture existants sont identiques ; (4) aucune violation de clé étrangère ; (5) la
   contrainte à deux types de project_profiles est intacte (on ne la contourne pas, on ne la reconstruit pas). */
import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {Miniflare} from 'miniflare';import {build} from 'esbuild';import {readFile,readdir,mkdir} from 'node:fs/promises';
import {normalizeMigrationForD1} from './migration-sql.mjs';
let mf:Miniflare,db:D1Database;const origin='http://localhost:8787';let cookieA:string,ownerA:string;
const NEW_TABLES=['project_setup','project_modules','item_lifecycle','lifecycle_events','project_features','feature_links'];
async function api(path:string,method='GET',data?:unknown,cookie=cookieA){const r=await mf.dispatchFetch(origin+'/api'+path,{method,headers:{Origin:origin,Cookie:cookie,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json() as any,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};}
async function snapshot(){
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'d1_migrations' ORDER BY name").all<{name:string}>()).results.map(t=>t.name);
 const out:Record<string,string>={};for(const t of tables)out[t]=JSON.stringify((await db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results);return out;
}
const migrations=async()=>(await readdir('migrations')).filter(n=>/^\d+.*\.sql$/.test(n)).sort();
beforeAll(async()=>{
 await mkdir('test-results',{recursive:true});await build({entryPoints:['server/index.ts'],outfile:'test-results/worker-mig.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022'});
 mf=new Miniflare({modules:true,scriptPath:'test-results/worker-mig.mjs',compatibilityDate:'2025-10-24',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],queueProducers:{TASKS:'atelier-tasks-mig'},bindings:{MASTER_KEY:Buffer.alloc(32,7).toString('base64'),APP_ORIGIN:origin,ALLOW_REGISTRATION:'true'}});
 db=await mf.getD1Database('DB');
 for(const m of (await migrations()).filter(n=>!n.startsWith('0023')))await db.exec(normalizeMigrationForD1(await readFile('migrations/'+m,'utf8')));
});
afterAll(async()=>{await mf?.dispose();});
describe('migration 0023 sur une base remplie',()=>{
 it('ne touche à aucune donnée existante, ajoute six tables vides, garde les écrans de lecture identiques',async()=>{
  const reg=await api('/auth/register','POST',{email:'martin@example.test',password:'phrase-de-test-solide-2026'},'');expect(reg.status).toBe(201);cookieA=reg.cookie;ownerA=reg.body.user.id;
  const other=await api('/auth/register','POST',{email:'autre@example.test',password:'autre-phrase-solide-2026'},'');expect(other.status).toBe(201);
  const sport=(await api('/spaces/init','POST',{template:'sport'})).body.project_id,recettes=(await api('/spaces/init','POST',{template:'livre_recettes'})).body.project_id,libre=(await api('/projects','POST',{name:'Projet libre'})).body.id;
  expect(sport&&recettes&&libre).toBeTruthy();
  const at='2026-11-01T10:00:00.000Z',run=(sql:string,...a:any[])=>db.prepare(sql).bind(...a).run();
  const decisions:[string,string,string|null][]=[['validated','Décision validée','v'],['proposed','Décision proposée','p'],['rejected','Décision rejetée','r'],['superseded','Décision remplacée','s']];
  for(const [status,title,k] of decisions)await run('INSERT INTO project_decisions(id,user_id,project_id,title,reason,status,source_kind,source_ref,decided_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',`00000000-0000-4000-8000-00000000000${decisions.findIndex(x=>x[2]===k)+1}`,ownerA,sport,title,'Raison '+title,status,'other','',status==='validated'?at:null,at,at);
  await run("UPDATE project_decisions SET supersedes_id='00000000-0000-4000-8000-000000000001' WHERE id='00000000-0000-4000-8000-000000000002'");
  for(const [i,rel] of ['verified','reported','deduced','ai_proposed','to_confirm','superseded','unverified','user_confirmed'].entries())await run("INSERT INTO project_documents(id,user_id,project_id,title,doc_type,source_kind,url,reliability,origin,note,created_at,updated_at) VALUES(?,?,?,?,'reference','url','https://exemple.test/'||?,?,?,?,?,?)",`10000000-0000-4000-8000-00000000000${i}`,ownerA,recettes,'Document '+rel,i,rel,'origine '+rel,'note '+rel,at,at);
  for(const [i,src] of ['Saisie utilisateur','Résumé IA','Conversation du 12'].entries())await run('INSERT INTO memory(id,user_id,project_id,title,content,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',`20000000-0000-4000-8000-00000000000${i}`,ownerA,libre,'Note '+i,'Contenu '+src,src,at,at);
  expect((await api('/spaces/'+sport+'/tasks','POST',{title:'Tâche existante',objective:'Objectif'})).status).toBe(201);
  const before=await snapshot();
  const reads=['/spaces?all=1','/spaces/'+sport+'/decisions','/spaces/'+sport+'/plan','/spaces/'+sport+'/overview','/projects','/spaces/'+recettes+'/overview'];
  const beforeReads:any[]=[];for(const r of reads){const x=await api(r);expect(x.status,r).toBe(200);beforeReads.push(x.body);}
  const counts=Object.fromEntries(Object.entries(before).map(([t,v])=>[t,JSON.parse(v).length]));expect(counts.project_decisions).toBe(4);expect(counts.project_documents).toBe(8);expect(counts.memory).toBe(3);expect(counts.project_profiles).toBe(2);
  // ── Migration 0023 ──
  await db.exec(normalizeMigrationForD1(await readFile('migrations/0023_project_model.sql','utf8')));
  const after=await snapshot();
  for(const t of Object.keys(before))expect(after[t],'table '+t+' modifiée par la migration').toBe(before[t]);
  for(const t of NEW_TABLES){expect(JSON.parse(after[t]),t).toEqual([]);}
  expect(Object.keys(after).sort()).toEqual([...Object.keys(before),...NEW_TABLES].sort());
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  for(const [i,r] of reads.entries()){const x=await api(r);expect(x.status,r).toBe(200);expect(x.body,'réponse de '+r).toEqual(beforeReads[i]);}
  // Les anciennes lignes se lisent avec leur état déduit, sans qu'une seule ligne item_lifecycle n'ait été créée.
  const items=await api('/model/'+sport+'/items?kind=decision&all=1');expect(items.status).toBe(200);
  const byTitle=Object.fromEntries(items.body.items.map((i:any)=>[i.title,i]));
  expect(byTitle['Décision validée']).toMatchObject({status:'current',reliability:'confirmed',derived:true});expect(byTitle['Décision proposée']).toMatchObject({status:'proposed',reliability:'hypothesis'});
  expect(byTitle['Décision rejetée']).toMatchObject({status:'rejected',reliability:'obsolete'});expect(byTitle['Décision remplacée']).toMatchObject({status:'replaced',reliability:'obsolete'});
  const docs=Object.fromEntries((await api('/model/'+recettes+'/items?kind=document&all=1')).body.items.map((i:any)=>[i.title,i]));
  expect(docs['Document verified']).toMatchObject({status:'current',reliability:'reported'});expect(docs['Document user_confirmed']).toMatchObject({status:'current',reliability:'confirmed'});expect(docs['Document ai_proposed']).toMatchObject({status:'proposed',reliability:'hypothesis'});expect(docs['Document superseded'].reliability).toBe('obsolete');
  const mem=Object.fromEntries((await api('/model/'+libre+'/items?kind=memory&all=1')).body.items.map((i:any)=>[i.title,i]));
  expect(mem['Note 0']).toMatchObject({status:'current',reliability:'confirmed'});expect(mem['Note 1']).toMatchObject({status:'proposed',reliability:'hypothesis'});
  const cur=(await api('/model/'+sport+'/items?kind=decision')).body;expect(cur.items.map((i:any)=>i.title)).toEqual(['Décision validée']);expect(cur.hidden).toBe(3);
  expect(JSON.parse((await snapshot()).item_lifecycle)).toEqual([]);// lire ne crée rien
  // Projets existants : gabarit déduit de leur profil, sans ligne project_setup.
  expect((await api('/model/'+sport)).body).toMatchObject({template:'sport',explicit:false,enabled:{code_deploy:true,features:true,learning_path:false}});
  expect((await api('/model/'+libre)).body).toMatchObject({template:'vide',explicit:false,enabled:{features:false}});
  // La contrainte à deux types n'est pas reconstruite : elle reste, et un 3e gabarit passe par project_setup.
  const ddl=(await db.prepare("SELECT sql FROM sqlite_master WHERE name='project_profiles'").first<any>()).sql as string;expect(ddl).toContain("'livre_recettes','sport'");
  expect((await api('/model/'+libre+'/modules','PUT',{template:'atelier'})).body).toMatchObject({template:'atelier',explicit:true,enabled:{code_deploy:true,features:true}});
  expect((await snapshot()).project_profiles).toBe(before.project_profiles);
 },120000);
});
