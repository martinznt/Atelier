import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {Miniflare} from 'miniflare';import {build} from 'esbuild';import {readFile,readdir,mkdir} from 'node:fs/promises';import {unzipSync,strFromU8} from 'fflate';import {hashPassword,verifyPassword} from '../server/password';
import {normalizeMigrationForD1} from './migration-sql.mjs';
let mf:Miniflare;let a:string,b:string;const origin='http://localhost:8787';let project:string,conversation:string,file:string;
let ownerA:string,ownerB:string,spaceA:string,spaceB:string,importedConversation:string;
const importedMessage='Historique privé Alice : référence CANNELLE-719.';
async function call(path:string,method='GET',data?:unknown,cookie=a,headers:Record<string,string>={}){const response=await mf.dispatchFetch(`${origin}/api${path}`,{method,headers:{Origin:origin,Cookie:cookie||'',...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});return response;}
async function json(path:string,method='GET',data?:unknown,cookie=a,headers:Record<string,string>={}){const r=await call(path,method,data,cookie,headers);return {status:r.status,body:await r.json() as any,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
beforeAll(async()=>{
 await mkdir('test-results',{recursive:true});await build({entryPoints:['server/index.ts'],outfile:'test-results/worker.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022'});
 mf=new Miniflare({modules:true,scriptPath:'test-results/worker.mjs',compatibilityDate:'2025-10-24',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],queueProducers:{TASKS:'atelier-tasks'},bindings:{MASTER_KEY:Buffer.alloc(32,7).toString('base64'),APP_ORIGIN:origin,ALLOW_REGISTRATION:'true',STORAGE_LIMIT_MB:'1',MAX_FILE_MB:'1'}});
 const db=await mf.getD1Database('DB');
 // Exercise the complete application schema, including bridge exports and OAuth tables.
 for(const migration of (await readdir('migrations')).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  const sql=await readFile(`migrations/${migration}`,'utf8');
  // Chaque instruction complète tient sur une ligne, triggers SQL compris.
  await db.exec(normalizeMigrationForD1(sql));
 }
 const first=await json('/auth/register','POST',{email:'alice@example.test',password:'phrase-de-test-solide-2026'},'');expect(first.status).toBe(201);a=first.cookie!;const second=await json('/auth/register','POST',{email:'bob@example.test',password:'autre-phrase-solide-2026'},'');expect(second.status).toBe(201);b=second.cookie!;
 project=(await json('/projects','POST',{name:'Projet de test'})).body.id;conversation=(await json('/conversations','POST',{project_id:project,title:'Conversation'})).body.id;file=(await json('/files/text','POST',{project_id:project,name:'test.txt',content:'version une'})).body.file_id;
 ownerA=first.body.user.id;ownerB=second.body.user.id;
 const bridgeA=await json(`/bridge/project/${project}`,'POST',{});expect(bridgeA.status).toBe(200);spaceA=bridgeA.body.id;
 const bridgeB=await json('/bridge/spaces','POST',{name:'Mémoire privée Bob'},b);expect(bridgeB.status).toBe(201);spaceB=bridgeB.body.id;
 const imported=await json(`/bridge/spaces/${spaceA}/import`,'POST',{source_key:'integration-fixture',provider:'ChatGPT (fixture)',title:'Historique de test',missing:'Contenu de test local, aucun accès fournisseur.',messages:[{source_key:'fixture-message',role:'user',content:importedMessage,original_date:'2026-10-16',parent_source_key:''}]});
 expect(imported.status).toBe(201);importedConversation=imported.body.id;
});

// Prepared for Miniflare/Vitest: native bridge tests do not validate these Hono routes.
describe('passerelle intégrée : sessions Hono, propriétaires et en-têtes non fiables',()=>{
 it('retrouve la même mémoire de projet et le contenu importé après une nouvelle connexion',async()=>{
  const login=await json('/auth/login','POST',{email:'alice@example.test',password:'phrase-de-test-solide-2026'},'');expect(login.status).toBe(200);expect(login.cookie).toBeTruthy();
  const linked=await json(`/bridge/project/${project}`,'GET',undefined,login.cookie!);expect(linked.status).toBe(200);expect(linked.body.space.id).toBe(spaceA);
  expect((await json(`/bridge/project/${project}`,'POST',{},login.cookie!)).body.id).toBe(spaceA);
  const history=await json(`/bridge/conversations/${importedConversation}`,'GET',undefined,login.cookie!);expect(history.status).toBe(200);expect(history.body.items.map((message:any)=>message.content)).toContain(importedMessage);
  const exported=await json('/account/export?metadata=true','GET',undefined,login.cookie!);expect(exported.status).toBe(200);
  expect(exported.body.bridge_spaces.map((space:any)=>space.id)).toContain(spaceA);expect(exported.body.bridge_spaces.map((space:any)=>space.id)).not.toContain(spaceB);
  expect(exported.body.bridge_messages.map((message:any)=>message.content)).toContain(importedMessage);
 });

 it('refuse les URL de la mémoire d’Alice à Bob, y compris import, export et modification',async()=>{
  const login=await json('/auth/login','POST',{email:'bob@example.test',password:'autre-phrase-solide-2026'},'');expect(login.status).toBe(200);expect(login.cookie).toBeTruthy();
  const cookie=login.cookie!;
  for(const path of [`/bridge/project/${project}`,`/bridge/spaces/${spaceA}`,`/bridge/spaces/${spaceA}/context-history`,`/bridge/spaces/${spaceA}/conversations`,`/bridge/spaces/${spaceA}/handoffs`,`/bridge/spaces/${spaceA}/export`,`/bridge/conversations/${importedConversation}`])expect((await call(path,'GET',undefined,cookie)).status,path).toBe(404);
  for(const [path,method,body] of [
   [`/bridge/project/${project}`,'POST',{}],
   [`/bridge/spaces/${spaceA}`,'PATCH',{revision:1,context:'Intrusion'}],
   [`/bridge/spaces/${spaceA}/import`,'POST',{}],
   [`/bridge/spaces/${spaceA}/handoffs`,'POST',{}],
   [`/bridge/spaces/${spaceA}`,'DELETE',{confirm_name:'Projet de test'}],
  ] as const)expect((await call(path,method,body,cookie)).status,path).toBe(404);
  const found=await json('/bridge/search?q=CANNELLE-719','GET',undefined,cookie);expect(found.status).toBe(200);expect(found.body.messages).toEqual([]);
 });

 it('remplace l’identité Sites fournie par le navigateur par celle de la session',async()=>{
  const forged={'oai-authenticated-user-id':ownerA};
  const me=await json('/bridge/me','GET',undefined,b,forged);expect(me.status).toBe(200);expect(me.body.id).toBe(ownerB);
  const spaces=await json('/bridge/spaces','GET',undefined,b,forged);expect(spaces.status).toBe(200);
  expect(spaces.body.items.map((space:any)=>space.id)).toContain(spaceB);expect(spaces.body.items.map((space:any)=>space.id)).not.toContain(spaceA);
  expect((await call(`/bridge/spaces/${spaceA}`,'GET',undefined,b,forged)).status).toBe(404);
  expect((await call(`/bridge/spaces/${spaceA}`,'PATCH',{revision:1,context:'Usurpation'},b,forged)).status).toBe(404);
  expect((await call('/bridge/spaces','GET',undefined,'',forged)).status).toBe(401);
 });

 it('protège les mutations de la passerelle contre les origines tierces',async()=>{
  expect((await call(`/bridge/spaces/${spaceA}`,'PATCH',{revision:1,context:'CSRF'},a,{Origin:'https://evil.example'})).status).toBe(403);
  expect((await call('/bridge/oauth/authorize','POST',{},a,{Origin:'https://evil.example'})).status).toBe(403);
 });

 it('refuse le MCP sans autorisation OAuth et la liaison Sites désactivée',async()=>{
  // A cookie or a forged identity header is not a bearer token or a trusted Sites session.
  const response=await mf.dispatchFetch(`${origin}/mcp`,{method:'POST',headers:{Origin:origin,Cookie:a,'Content-Type':'application/json','oai-authenticated-user-id':ownerA},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_spaces',arguments:{}}})});
  expect(response.status).toBe(401);expect(response.headers.get('WWW-Authenticate')).toContain('/.well-known/oauth-protected-resource/mcp');
  const refused=await call('/bridge/site-link','POST',{consent:true},a,{'oai-authenticated-user-id':ownerA});expect(refused.status).toBe(409);
  const access=await json('/bridge/access');expect(access.status).toBe(200);expect(access.body.site_linked).toBe(false);
 });
});
afterAll(async()=>{await mf?.dispose();});
describe('compte affiché et cookie partagé entre onglets',()=>{
 it('refuse lectures et mutations lorsque le cookie a changé de compte',async()=>{
  const expectedA={'X-Atelier-Account':ownerA};
  expect((await call('/projects','GET',undefined,b,expectedA)).status).toBe(401);
  expect((await call('/projects','POST',{name:'Ne doit pas appartenir à Bob'},b,expectedA)).status).toBe(401);
  expect((await call('/auth/preferences','PATCH',{monthly_tokens:123},b,expectedA)).status).toBe(401);
  expect((await call('/auth/password','POST',{currentPassword:'autre-phrase-solide-2026',newPassword:'ne-pas-changer-le-compte'},b,expectedA)).status).toBe(401);
  expect((await call('/auth/logout-all','POST',{},b,expectedA)).status).toBe(401);
  const bob=await json('/auth/me','GET',undefined,b);expect(bob.status).toBe(200);expect(bob.body.user.monthly_tokens).toBe(100000);
  expect((await json('/projects','GET',undefined,b)).body.items).toEqual([]);
 });
 it('utilise toujours la session pour autoriser, jamais le compte annoncé par le navigateur',async()=>{
  expect((await call('/projects','GET',undefined,b,{'X-Atelier-Account':ownerB})).status).toBe(200);
  expect((await call(`/projects/${project}`,'GET',undefined,b,{'X-Atelier-Account':ownerB})).status).toBe(404);
  expect((await call('/projects','GET',undefined,'',{'X-Atelier-Account':ownerA})).status).toBe(401);
 });
 it('préserve la session et le cookie de B lors d’une déconnexion différée de A',async()=>{
  const response=await call('/auth/logout','POST',{},b,{'X-Atelier-Account':ownerA});
  expect(response.status).toBe(401);expect(response.headers.get('set-cookie')).toBeNull();
  expect((await json('/auth/me','GET',undefined,b)).status).toBe(200);
  const login=await json('/auth/login','POST',{email:'alice@example.test',password:'phrase-de-test-solide-2026'},'');
  const ended=await call('/auth/logout','POST',{},login.cookie!,{'X-Atelier-Account':ownerA});
  expect(ended.status).toBe(200);expect(ended.headers.get('set-cookie')).toContain('atelier_session=');
  expect((await json('/auth/me','GET',undefined,login.cookie!)).status).toBe(401);
  expect((await call('/auth/logout','POST',{},login.cookie!,{'X-Atelier-Account':ownerA})).status).toBe(200);
  expect((await call('/auth/logout','POST',{},'',{'X-Atelier-Account':ownerA})).status).toBe(200);
 });
});
describe('sécurité et persistance réelles D1 sans R2 locales',()=>{
 it('hachage scrypt bibliothèque, mot de passe incorrect et sel distinct',async()=>{const hash=await hashPassword('test mot de passe 123');expect(await verifyPassword('test mot de passe 123',hash)).toBe(true);expect(await verifyPassword('mauvais',hash)).toBe(false);expect(await hashPassword('test mot de passe 123')).not.toBe(hash);});
 it('compte email, sessions sécurisées et refus sans session',async()=>{expect((await json('/auth/me')).body.user.email).toBe('alice@example.test');expect((await json('/projects','GET',undefined,'')).status).toBe(401);const login=await call('/auth/login','POST',{email:'alice@example.test',password:'phrase-de-test-solide-2026'},'');expect(login.headers.get('set-cookie')).toMatch(/HttpOnly/i);expect(login.headers.get('set-cookie')).toMatch(/SameSite=Strict/i);});
 it('refuse explicitement les URL et IDs privés de A pour B',async()=>{for(const path of [`/projects/${project}`,`/conversations/${conversation}/messages`,`/files/${file}/download`,`/files/${file}/versions`,`/files/${file}/preview`])expect((await call(path,'GET',undefined,b)).status,path).toBe(404);expect((await json('/conversations','POST',{project_id:project,title:'Intrusion'},b)).status).toBe(404);expect((await json('/projects','GET',undefined,b)).body.items).toEqual([]);expect((await json('/files/zip','POST',{ids:[file]},b)).status).toBe(404);});
 it('ignore un identifiant utilisateur fourni par le navigateur',async()=>{const me=(await json('/auth/me','GET',undefined,b)).body.user;const result=await json('/projects','POST',{name:'À Alice',user_id:me.id});expect(result.body.user_id).not.toBe(me.id);});
 it('bloque les mutations depuis une origine tierce',async()=>{const response=await mf.dispatchFetch(`${origin}/api/projects`,{method:'POST',headers:{Cookie:a,Origin:'https://evil.example','Content-Type':'application/json'},body:'{"name":"bad"}'});expect(response.status).toBe(403);});
 it('conflit entre deux appareils sans écrasement',async()=>{const initial=(await json(`/projects/${project}`)).body;expect((await json(`/projects/${project}`,'PATCH',{revision:initial.revision,name:'Nouvelle version'})).status).toBe(200);expect((await json(`/projects/${project}`,'PATCH',{revision:initial.revision,name:'Écrasement'})).status).toBe(409);});
 it('la création distingue le fichier adressable de sa première version immuable',async()=>{
  const content='Identité du fichier et de sa première version';
  const created=await json('/files/text','POST',{project_id:project,name:'identite.txt',content});
  expect(created.status).toBe(201);
  const saved=created.body;
  expect(saved.id).toBe(saved.file_id);
  expect(saved.version_id).toEqual(expect.any(String));
  expect(saved.version_id).not.toBe(saved.id);
  expect(saved.version).toBe(1);
  const listing=await json(`/files?project=${project}`);
  expect(listing.status).toBe(200);
  expect(listing.body.items).toContainEqual(expect.objectContaining({id:saved.id,name:'identite.txt',current_version:1}));
  const versions=await json(`/files/${saved.id}/versions`);
  expect(versions.status).toBe(200);
  expect(versions.body.items).toEqual([expect.objectContaining({id:saved.version_id,version:1,sha256:saved.sha256})]);
  const db=await mf.getD1Database('DB');
  const stored=await db.prepare('SELECT file_id,version FROM file_versions WHERE id=?').bind(saved.version_id).first();
  expect(stored).toEqual({file_id:saved.id,version:1});
  const downloaded=await call(`/files/${saved.id}/download?version=1`);
  expect(downloaded.status).toBe(200);
  expect(await downloaded.text()).toBe(content);
 });
 it('télécharge chaque version et restaure par création',async()=>{expect((await json('/files/text','POST',{project_id:project,file_id:file,expected_version:1,name:'test.txt',content:'version deux'})).status).toBe(201);expect(await (await call(`/files/${file}/download?version=1`)).text()).toBe('version une');expect(await (await call(`/files/${file}/download?version=2`)).text()).toBe('version deux');expect((await json(`/files/${file}/restore`,'POST',{version:1,expected_version:2})).body.version).toBe(3);expect(await (await call(`/files/${file}/download?version=3`)).text()).toBe('version une');});
 it('ZIP intègre des fichiers réels et un manifeste SHA-256',async()=>{const response=await call('/files/zip','POST',{ids:[file]});expect(response.status).toBe(200);const archive=unzipSync(new Uint8Array(await response.arrayBuffer()));const manifest=JSON.parse(strFromU8(archive['integrite.json']));expect(manifest[0].sha256).toHaveLength(64);expect(strFromU8(archive[manifest[0].path])).toBe('version une');});
 it('pagination des longues conversations',async()=>{for(let i=0;i<35;i++)await json(`/conversations/${conversation}/notes`,'POST',{content:`Note ${i}`});const first=(await json(`/conversations/${conversation}/messages`)).body;expect(first.items.length).toBe(30);expect(first.next).not.toBeNull();const second=(await json(`/conversations/${conversation}/messages?before=${first.next}`)).body;expect(second.items.length).toBe(5);expect(new Set([...first.items,...second.items].map(m=>m.id)).size).toBe(35);});
 it('export exclut mots de passe, sessions et secrets fournisseurs',async()=>{const result=await json('/account/export?metadata=true');const text=JSON.stringify(result.body);expect(text).not.toContain('password_hash');expect(text).not.toContain('token_hash');expect(text).not.toContain('code_hash');expect(result.body.projects.length).toBeGreaterThan(0);});
 it('révocation, déconnexion et récupération à usage unique',async()=>{const c=await json('/auth/register','POST',{email:'carole@example.test',password:'mot-de-passe-de-carole'},'');const cookie=c.cookie!,code=c.body.recoveryCodes[0];expect(c.body.recoveryCodes.length).toBe(8);expect((await json('/auth/logout','POST',{},cookie)).status).toBe(200);expect((await json('/auth/me','GET',undefined,cookie)).status).toBe(401);const recovered=await json('/auth/recover','POST',{email:'carole@example.test',password:'nouveau-mot-de-passe-de-carole',code},'');expect(recovered.status).toBe(200);expect((await json('/auth/recover','POST',{email:'carole@example.test',password:'encore-autre-mot-de-passe',code},'')).status).toBe(401);});
});

// Fixture credentials and catalogues only. No inference or provider test is invoked.
describe('connexions nommées et propositions de tâches isolées',()=>{
 async function fixtureConnection(cookie:string,label:string){
  const created=await json('/connections','POST',{provider:'anthropic',label,secret:'credential-integration-fixture',scopes:['chat'],api_consent:true},cookie);
  expect(created.status).toBe(201);
  const db=await mf.getD1Database('DB');
  await db.prepare("UPDATE connections SET status='connected',models='[\"model-fixture\"]',models_revision=1,models_checked_at=? WHERE id=?").bind(new Date().toISOString(),created.body.id).run();
  return created.body.id as string;
 }
 it('sépare deux accès du même fournisseur et protège leur renommage et leurs secrets',async()=>{
  const first=await fixtureConnection(a,'Principal'),second=await fixtureConnection(a,'Secondaire');
  expect(first).not.toBe(second);
  expect((await json(`/connections/${first}`,'PATCH',{label:'Personnel'})).status).toBe(200);
  const listed=(await json('/connections')).body.items;
  expect(listed.find((c:any)=>c.id===first).label).toBe('Personnel');
  expect(listed.find((c:any)=>c.id===first).status).toBe('connected');
  expect(listed.find((c:any)=>c.id===second).label).toBe('Secondaire');
  expect(JSON.stringify(listed)).not.toContain('credential-integration-fixture');
  for(const method of ['PATCH','DELETE'])expect((await call(`/connections/${first}`,method,method==='PATCH'?{label:'Intrusion'}:undefined,b)).status).toBe(404);
  expect((await call(`/connections/${first}/test`,'POST',{},b)).status).toBe(404);
 });
 it('ne révèle aucune connexion étrangère lors d’une proposition',async()=>{
  const foreign=await fixtureConnection(b,'Libellé privé de Bob');
  const planning={priority:'speed',max_wait_minutes:0,missions:[{role:'Vérifier le SQL',candidates:[{connection_id:foreign,model:'model-fixture'}]}]};
  expect((await json('/tasks/plan','POST',{conversation_id:conversation,planning},b)).status).toBe(404);
  const response=await json('/tasks/plan','POST',{conversation_id:conversation,planning});
  expect(response.status).toBe(200);expect(response.body.assistants).toEqual([]);expect(response.body.blocked.length).toBeGreaterThan(0);
  expect(JSON.stringify(response.body)).not.toContain('Libellé privé de Bob');
 });
 it('exige un plan inchangé et un accord de programmation, puis conserve une seule tâche annulable',async()=>{
  const connection=await fixtureConnection(a,'Planification contrôlée');
  const convo=(await json('/conversations','POST',{project_id:project,title:'Test de programmation isolé'})).body.id;
  const db=await mf.getD1Database('DB'),retryAt=new Date(Date.now()+86400000).toISOString();
  await db.prepare('UPDATE connections SET quota=? WHERE id=?').bind(JSON.stringify({kind:'unavailable',status:'rate_limited',retry_at:retryAt}),connection).run();
  const planning={priority:'quality',max_wait_minutes:0,missions:[{role:'Vérifier les permissions du projet',candidates:[{connection_id:connection,model:'model-fixture'}]}]};
  const preview=await json('/tasks/plan','POST',{conversation_id:convo,planning});expect(preview.status).toBe(200);expect(preview.body.not_before).toBe(retryAt);
  const body={conversation_id:convo,message:'Test de programmation sans inference',mode:'individual',rounds:1,max_tokens:128,assistants:[{connection_id:connection,model:'model-fixture',role:planning.missions[0].role}],planning,plan_fingerprint:preview.body.fingerprint,idempotency_key:crypto.randomUUID()};
  expect((await json('/tasks','POST',{...body,plan_fingerprint:'0'.repeat(64),allow_scheduled:true})).status).toBe(409);
  expect((await json('/tasks','POST',body)).status).toBe(400);
  const started=await json('/tasks','POST',{...body,allow_scheduled:true});expect(started.status).toBe(202);expect(started.body.not_before).toBe(retryAt);
  const duplicate=await json('/tasks','POST',{...body,allow_scheduled:true});expect(duplicate.body.id).toBe(started.body.id);expect(duplicate.body.duplicate).toBe(true);
  expect((await json(`/conversations/${convo}/messages`)).body.items).toHaveLength(1);
  expect((await call(`/tasks/${started.body.id}`,'GET',undefined,b)).status).toBe(404);
  expect((await call(`/tasks/${started.body.id}/cancel`,'POST',{},b)).status).toBe(404);
  expect((await json(`/tasks/${started.body.id}/cancel`,'POST',{})).status).toBe(200);
  expect((await json(`/tasks/${started.body.id}`)).body.status).toBe('cancelled');
  await db.prepare('UPDATE connections SET models_revision=models_revision+1 WHERE id=?').bind(connection).run();
  expect((await json('/tasks','POST',{...body,idempotency_key:crypto.randomUUID(),allow_scheduled:true})).status).toBe(409);
 });
});

// These routes require Miniflare and actual password hashing; native SQLite tests do not replace them.
describe('email et mots de passe de huit caractères',()=>{
 it('refuse sept caractères, email absent/invalide et accepte exactement huit',async()=>{
  for(const data of [{email:'eight@example.test',password:'1234567'},{username:'legacy-new',password:'12345678'},{email:'not-email',password:'12345678'}])expect((await json('/auth/register','POST',data,'')).status).toBe(400);
  const registered=await json('/auth/register','POST',{email:' Eight@Example.Test ',password:'abcdefgh'},'');expect(registered.status).toBe(201);expect(registered.body.user.email).toBe('eight@example.test');expect(registered.body.user.needs_email).toBe(false);
  const login=await json('/auth/login','POST',{email:'EIGHT@example.test',password:'abcdefgh'},'');expect(login.status).toBe(200);
  expect((await json('/auth/register','POST',{email:'EIGHT@example.test',password:'abcdefgh'},'')).status).toBe(409);
  expect((await json('/auth/password','POST',{currentPassword:'abcdefgh',newPassword:'1234567'},login.cookie!)).status).toBe(400);
  const changed=await json('/auth/password','POST',{currentPassword:'abcdefgh',newPassword:'12345678'},login.cookie!);expect(changed.status).toBe(200);
  const recovered=await json('/auth/recover','POST',{email:'eight@example.test',password:'87654321',code:registered.body.recoveryCodes[0]},'');expect(recovered.status).toBe(200);
 });
 it('un ancien compte ajoute son email avec preuve de mot de passe et conserve son propriétaire',async()=>{
  const db=await mf.getD1Database('DB'),id=crypto.randomUUID(),hash=await hashPassword('legacy-password');
  await db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(id,'old-account',hash,new Date().toISOString()).run();
  const old=await json('/auth/legacy-login','POST',{username:'old-account',password:'legacy-password'},'');expect(old.status).toBe(200);expect(old.body.user.needs_email).toBe(true);
  expect((await call('/projects','GET',undefined,old.cookie!)).status).toBe(403);
  expect((await json('/auth/email','POST',{email:'old@example.test',password:'wrong'},old.cookie!)).status).toBe(403);
  expect((await json('/auth/email','POST',{email:'old@example.test',password:'legacy-password'},b)).status).toBe(409);
  const added=await json('/auth/email','POST',{email:'old@example.test',password:'legacy-password'},old.cookie!);expect(added.status).toBe(200);expect(added.body.user.id).toBe(id);expect(added.body.user.needs_email).toBe(false);
  expect((await call('/auth/me','GET',undefined,old.cookie!)).status).toBe(401);
  expect((await json('/auth/legacy-login','POST',{username:'old-account',password:'legacy-password'},'')).status).toBe(401);
  const again=await json('/auth/login','POST',{email:'old@example.test',password:'legacy-password'},'');expect(again.status).toBe(200);expect(again.body.user.id).toBe(id);
 });
});


describe('revues IA des PR : isolation des comptes et consentement',()=>{
 it('refuse de consulter les rapports privés d’un autre compte',async()=>{
  const own=await json('/reviews/runs?project='+project);
  expect(own.status).toBe(200);
  expect(own.body.items).toEqual([]);
  expect((await call('/reviews/runs?project='+project,'GET',undefined,b)).status).toBe(404);
  expect((await call('/reviews/configs?project='+project,'GET',undefined,'')).status).toBe(401);
 });
 it('ne crée aucun traitement sans dépôt appartenant au compte',async()=>{
  const foreign=crypto.randomUUID();
  expect((await json('/reviews/start','POST',{repository_id:foreign,pr_number:58})).status).toBe(404);
  expect((await json('/reviews/configs','POST',{repository_id:foreign,primary:{connection_id:crypto.randomUUID(),model:'test'},enabled:true,share_consent:true})).status).toBe(404);
 });
});
