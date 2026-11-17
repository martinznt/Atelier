/* Lot 5B (5B-5) : la migration 0027 (une table, messages de la discussion d'une maquette) sur une base REMPLIE, maquettes comprises.
   Preuves : (1) chaque ancienne table est identique ligne par ligne avant/après ; (2) la seule table nouvelle est mockup_messages, vide ;
   (3) les écrans de lecture existants répondent à l'identique ; (4) aucune violation de clé étrangère ; (5) supprimer un projet supprime ses décisions, jamais celles d'un autre compte ;
   (6) la base refuse un auteur ou un niveau inconnu, et un texte trop long. */
import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {Miniflare} from 'miniflare';import {build} from 'esbuild';import {readFile,readdir,mkdir} from 'node:fs/promises';
import {normalizeMigrationForD1} from './migration-sql.mjs';
let mf:Miniflare,db:D1Database;const origin='http://localhost:8787';
async function api(path:string,method='GET',data?:unknown,cookie=''){const r=await mf.dispatchFetch(origin+'/api'+path,{method,headers:{Origin:origin,Cookie:cookie,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const text=await r.text();let body:any=null;try{body=JSON.parse(text);}catch{body=text;}return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};}
async function snapshot(){
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'d1_migrations' ORDER BY name").all<{name:string}>()).results.map(t=>t.name);
 const out:Record<string,string>={};for(const t of tables)out[t]=JSON.stringify((await db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results);return out;
}
beforeAll(async()=>{
 await mkdir('test-results',{recursive:true});await build({entryPoints:['server/index.ts'],outfile:'test-results/worker-mig27.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022'});
 mf=new Miniflare({modules:true,scriptPath:'test-results/worker-mig27.mjs',compatibilityDate:'2025-10-24',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],queueProducers:{TASKS:'atelier-tasks-mig27'},bindings:{MASTER_KEY:Buffer.alloc(32,7).toString('base64'),APP_ORIGIN:origin,ALLOW_REGISTRATION:'true',STORAGE_LIMIT_MB:'1',MAX_FILE_MB:'1'}});
 db=await mf.getD1Database('DB');
 for(const m of (await readdir('migrations')).filter(n=>/^\d+.*\.sql$/.test(n)&&!n.startsWith('0027')).sort())await db.exec(normalizeMigrationForD1(await readFile('migrations/'+m,'utf8')));
});
afterAll(async()=>{await mf?.dispose();});
describe('migration 0027 sur une base remplie',()=>{
 it('ne touche à aucune donnée existante, ajoute une table vide, garde les écrans de lecture identiques',async()=>{
  const a=await api('/auth/register','POST',{email:'martin27@example.test',password:'phrase-de-test-solide-2026'});expect(a.status).toBe(201);
  const b=await api('/auth/register','POST',{email:'autre27@example.test',password:'autre-phrase-solide-2026'});expect(b.status).toBe(201);
  const sport=(await api('/spaces/init','POST',{template:'sport'},a.cookie)).body.project_id,libre=(await api('/projects','POST',{name:'Projet libre'},a.cookie)).body.id,bob=(await api('/projects','POST',{name:'Projet de Bob'},b.cookie)).body.id;
  expect((await api('/spaces/'+sport+'/tasks','POST',{title:'Tâche existante',objective:'Objectif'},a.cookie)).status).toBe(201);
  const before=await snapshot();
  const reads=['/spaces?all=1','/spaces/'+sport+'/plan','/spaces/'+sport+'/overview','/projects'];const beforeReads:any[]=[];
  for(const r of reads){const x=await api(r,'GET',undefined,a.cookie);expect(x.status,r).toBe(200);beforeReads.push(x.body);}
  await db.exec(normalizeMigrationForD1(await readFile('migrations/0027_mockup_discussion.sql','utf8')));
  const after=await snapshot();
  for(const t of Object.keys(before))expect(after[t],'table '+t+' modifiée par la migration').toBe(before[t]);
  expect(Object.keys(after).sort()).toEqual([...Object.keys(before),'mockup_messages'].sort());expect(JSON.parse(after.mockup_messages)).toEqual([]);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  for(const [i,r] of reads.entries()){const x=await api(r,'GET',undefined,a.cookie);expect(x.status,r).toBe(200);expect(x.body,'réponse de '+r).toEqual(beforeReads[i]);}
  const at='2026-11-17T10:00:00.000Z',owner=(await api('/auth/me','GET',undefined,a.cookie)).body.user.id,other=(await api('/auth/me','GET',undefined,b.cookie)).body.user.id;
  const mk=async(id:string,user:string,project:string)=>{
   await db.prepare('INSERT INTO mockups(id,user_id,project_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,user,project,'M',at,at).run();
   await db.prepare("INSERT INTO mockup_messages(id,user_id,project_id,mockup_id,author,kind,body,created_at) VALUES(?,?,?,?,?,?,?,?)").bind('s-'+id,user,project,id,'martin','question','Q',at).run();
  };
  await mk('00000000-0000-4000-8000-0000000000a1',owner,libre);await mk('00000000-0000-4000-8000-0000000000b1',other,bob);
  await db.prepare('DELETE FROM projects WHERE id=?').bind(libre).run();
  expect((await db.prepare('SELECT id FROM mockup_messages').all<{id:string}>()).results.map(r=>r.id)).toEqual(['s-00000000-0000-4000-8000-0000000000b1']);
  const bad=(sql:string,...a:any[])=>db.prepare(sql).bind(...a).run();
  await expect(bad("INSERT INTO mockup_messages(id,user_id,project_id,mockup_id,author,kind,body,created_at) VALUES('x',?,?,?,?,?,?,?)",other,bob,'00000000-0000-4000-8000-0000000000b1','robot','question','Q',at)).rejects.toThrow();
  await expect(bad("INSERT INTO mockup_messages(id,user_id,project_id,mockup_id,author,kind,body,level,created_at) VALUES('y',?,?,?,?,?,?,?,?)",other,bob,'00000000-0000-4000-8000-0000000000b1','ai','answer','A','certain',at)).rejects.toThrow();
  await expect(bad("INSERT INTO mockup_messages(id,user_id,project_id,mockup_id,author,kind,body,created_at) VALUES('z',?,?,?,?,?,?,?)",other,bob,'00000000-0000-4000-8000-0000000000b1','martin','question','x'.repeat(12001),at)).rejects.toThrow();
 },120000);
});
