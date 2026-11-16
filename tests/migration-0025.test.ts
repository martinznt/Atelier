/* Lot 5B (5B-1) : la migration 0025 (quatre tables de maquettes) sur une base REMPLIE. 0001 à 0024 sont appliquées, des données réalistes sont posées
   (deux comptes, projets, tâche, décision, mission, fonctionnalité), puis 0025. Preuves : (1) chaque ancienne table est identique ligne par ligne avant/après ;
   (2) les seules tables nouvelles sont mockups, mockup_images, mockup_groups, mockup_blocks, toutes vides ; (3) les écrans de lecture existants répondent à l'identique ;
   (4) aucune violation de clé étrangère ; (5) supprimer un projet supprime ses maquettes (cascade), jamais celles d'un autre compte ;
   (6) retirer une fonctionnalité ou un groupe détache le bloc sans le supprimer ; (7) les contraintes refusent une capture trop lourde ou un type inconnu. */
import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {Miniflare} from 'miniflare';import {build} from 'esbuild';import {readFile,readdir,mkdir} from 'node:fs/promises';
import {normalizeMigrationForD1} from './migration-sql.mjs';
let mf:Miniflare,db:D1Database;const origin='http://localhost:8787';
async function api(path:string,method='GET',data?:unknown,cookie=''){const r=await mf.dispatchFetch(origin+'/api'+path,{method,headers:{Origin:origin,Cookie:cookie,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const text=await r.text();let body:any=null;try{body=JSON.parse(text);}catch{body=text;}return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};}
async function snapshot(){
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'d1_migrations' ORDER BY name").all<{name:string}>()).results.map(t=>t.name);
 const out:Record<string,string>={};for(const t of tables)out[t]=JSON.stringify((await db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results);return out;
}
beforeAll(async()=>{
 await mkdir('test-results',{recursive:true});await build({entryPoints:['server/index.ts'],outfile:'test-results/worker-mig25.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022'});
 mf=new Miniflare({modules:true,scriptPath:'test-results/worker-mig25.mjs',compatibilityDate:'2025-10-24',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],queueProducers:{TASKS:'atelier-tasks-mig25'},bindings:{MASTER_KEY:Buffer.alloc(32,7).toString('base64'),APP_ORIGIN:origin,ALLOW_REGISTRATION:'true',STORAGE_LIMIT_MB:'1',MAX_FILE_MB:'1'}});
 db=await mf.getD1Database('DB');
 for(const m of (await readdir('migrations')).filter(n=>/^\d+.*\.sql$/.test(n)&&!n.startsWith('0025')).sort())await db.exec(normalizeMigrationForD1(await readFile('migrations/'+m,'utf8')));
});
afterAll(async()=>{await mf?.dispose();});
describe('migration 0025 sur une base remplie',()=>{
 it('ne touche à aucune donnée existante, ajoute quatre tables vides, garde les écrans de lecture identiques',async()=>{
  const a=await api('/auth/register','POST',{email:'martin25@example.test',password:'phrase-de-test-solide-2026'});expect(a.status).toBe(201);
  const b=await api('/auth/register','POST',{email:'autre25@example.test',password:'autre-phrase-solide-2026'});expect(b.status).toBe(201);
  const sport=(await api('/spaces/init','POST',{template:'sport'},a.cookie)).body.project_id,libre=(await api('/projects','POST',{name:'Projet libre'},a.cookie)).body.id,bob=(await api('/projects','POST',{name:'Projet de Bob'},b.cookie)).body.id;
  expect((await api('/spaces/'+sport+'/tasks','POST',{title:'Tâche existante',objective:'Objectif'},a.cookie)).status).toBe(201);
  const before=await snapshot();
  const reads=['/spaces?all=1','/spaces/'+sport+'/plan','/spaces/'+sport+'/overview','/projects'];const beforeReads:any[]=[];
  for(const r of reads){const x=await api(r,'GET',undefined,a.cookie);expect(x.status,r).toBe(200);beforeReads.push(x.body);}
  await db.exec(normalizeMigrationForD1(await readFile('migrations/0025_mockups.sql','utf8')));
  const after=await snapshot();
  for(const t of Object.keys(before))expect(after[t],'table '+t+' modifiée par la migration').toBe(before[t]);
  const added=['mockup_blocks','mockup_groups','mockup_images','mockups'];
  expect(Object.keys(after).sort()).toEqual([...Object.keys(before),...added].sort());for(const t of added)expect(JSON.parse(after[t]),t).toEqual([]);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  for(const [i,r] of reads.entries()){const x=await api(r,'GET',undefined,a.cookie);expect(x.status,r).toBe(200);expect(x.body,'réponse de '+r).toEqual(beforeReads[i]);}
  // Cascade : supprimer un projet supprime ses maquettes (blocs, groupes, capture) et seulement les siennes.
  const at='2026-11-16T10:00:00.000Z',owner=(await api('/auth/me','GET',undefined,a.cookie)).body.user.id,other=(await api('/auth/me','GET',undefined,b.cookie)).body.user.id;
  const mk=async(id:string,user:string,project:string)=>{
   await db.prepare('INSERT INTO mockups(id,user_id,project_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,user,project,'M',at,at).run();
   await db.prepare("INSERT INTO mockup_images(mockup_id,user_id,project_id,mime,width,height,bytes,sha256,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id,user,project,'image/webp',720,1560,10,'s','AAAA',at,at).run();
   await db.prepare('INSERT INTO mockup_groups(id,user_id,project_id,mockup_id,name,created_at) VALUES(?,?,?,?,?,?)').bind('g-'+id,user,project,id,'G',at).run();
   await db.prepare("INSERT INTO mockup_blocks(id,user_id,project_id,mockup_id,kind,label,x,y,w,h,group_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind('b-'+id,user,project,id,'button','B',0,0,10,10,'g-'+id,at,at).run();
  };
  await mk('00000000-0000-4000-8000-0000000000a1',owner,libre);await mk('00000000-0000-4000-8000-0000000000b1',other,bob);
  await db.prepare('DELETE FROM projects WHERE id=?').bind(libre).run();
  for(const t of ['mockups','mockup_images','mockup_groups','mockup_blocks'])expect((await db.prepare(`SELECT COUNT(*) n FROM ${t}`).first<{n:number}>())!.n,t).toBe(1);
  expect((await db.prepare('SELECT id FROM mockups').all<{id:string}>()).results.map(r=>r.id)).toEqual(['00000000-0000-4000-8000-0000000000b1']);
  // Retirer une fonctionnalité ou un groupe détache le bloc sans le supprimer.
  await db.prepare("INSERT INTO project_features(id,user_id,project_id,code,name,created_at,updated_at) VALUES('f1',?,?,'F-0001','Fonction',?,?)").bind(other,bob,at,at).run();
  await db.prepare("UPDATE mockup_blocks SET feature_id='f1' WHERE id='b-00000000-0000-4000-8000-0000000000b1'").run();
  await db.prepare("DELETE FROM project_features WHERE id='f1'").run();await db.prepare("DELETE FROM mockup_groups WHERE id='g-00000000-0000-4000-8000-0000000000b1'").run();
  const blk=await db.prepare("SELECT feature_id,group_id FROM mockup_blocks WHERE id='b-00000000-0000-4000-8000-0000000000b1'").first<any>();expect(blk).toEqual({feature_id:null,group_id:null});
  // Les contraintes de la base refusent ce que le serveur refuse aussi.
  const bad=(sql:string,...a:any[])=>db.prepare(sql).bind(...a).run();
  await expect(bad("INSERT INTO mockup_images(mockup_id,user_id,project_id,mime,width,height,bytes,sha256,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",'00000000-0000-4000-8000-0000000000b1',other,bob,'image/gif',720,1560,10,'s','A',at,at)).rejects.toThrow();
  await expect(bad("UPDATE mockup_images SET bytes=180001")).rejects.toThrow();
  await expect(bad("UPDATE mockup_images SET data=?",'A'.repeat(262145))).rejects.toThrow();
  await expect(bad("UPDATE mockup_blocks SET kind='robot'")).rejects.toThrow();
  await expect(bad("UPDATE mockup_blocks SET w=0")).rejects.toThrow();
  await expect(bad("INSERT INTO mockup_groups(id,user_id,project_id,mockup_id,name,created_at) VALUES('g2',?,?,?,?,?)",other,bob,'00000000-0000-4000-8000-0000000000b1','G',at)).resolves.toBeTruthy();
  await expect(bad("INSERT INTO mockup_groups(id,user_id,project_id,mockup_id,name,created_at) VALUES('g3',?,?,?,?,?)",other,bob,'00000000-0000-4000-8000-0000000000b1','G',at)).rejects.toThrow();
 },120000);
});
