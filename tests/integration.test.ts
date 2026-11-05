import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {Miniflare,createFetchMock} from 'miniflare';import {build} from 'esbuild';import {readFile,readdir,mkdir} from 'node:fs/promises';import {unzipSync,strFromU8} from 'fflate';import {hashPassword,verifyPassword} from '../server/password';
import {normalizeMigrationForD1} from './migration-sql.mjs';
import {queueReview,executeReview,maintenanceReviews} from '../server/reviews';
import {executeTask} from '../server/worker';
let mf:Miniflare;const mockNetwork=createFetchMock();mockNetwork.disableNetConnect();let a:string,b:string;const origin='http://localhost:8787';let project:string,conversation:string,file:string;
let ownerA:string,ownerB:string,spaceA:string,spaceB:string,importedConversation:string;
const importedMessage='Historique privé Alice : référence CANNELLE-719.';
async function call(path:string,method='GET',data?:unknown,cookie=a,headers:Record<string,string>={}){const response=await mf.dispatchFetch(`${origin}/api${path}`,{method,headers:{Origin:origin,Cookie:cookie||'',...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});return response;}
async function json(path:string,method='GET',data?:unknown,cookie=a,headers:Record<string,string>={}){const r=await call(path,method,data,cookie,headers);return {status:r.status,body:await r.json() as any,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
beforeAll(async()=>{
 await mkdir('test-results',{recursive:true});await build({entryPoints:['server/index.ts'],outfile:'test-results/worker.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022'});
 mf=new Miniflare({modules:true,scriptPath:'test-results/worker.mjs',fetchMock:mockNetwork,compatibilityDate:'2025-10-24',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],queueProducers:{TASKS:'atelier-tasks'},bindings:{MASTER_KEY:Buffer.alloc(32,7).toString('base64'),APP_ORIGIN:origin,ALLOW_REGISTRATION:'true',STORAGE_LIMIT_MB:'1',MAX_FILE_MB:'1'}});
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
 it('conserve le diagnostic d’une interruption et ne permet la reprise que si elle est sûre',async()=>{
  const db=await mf.getD1Database('DB'),at=new Date().toISOString(),conn=crypto.randomUUID(),repo=crypto.randomUUID();
  await db.prepare("INSERT INTO connections(id,user_id,provider,label,secret,created_at) VALUES(?,?,'github','gh','x',?)").bind(conn,ownerA,at).run();
  await db.prepare("INSERT INTO repositories(id,user_id,project_id,connection_id,full_name,branch,head_sha,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(repo,ownerA,project,conn,'o/r','main','0',at).run();
  const mk=async(sha:string,diag:object)=>{const id=crypto.randomUUID();await db.prepare("INSERT INTO review_runs(id,user_id,project_id,repository_id,pr_number,head_sha,status,stage,diagnostic,error,created_at,updated_at) VALUES(?,?,?,?,105,?,'interrupted','ai_call',?,'x',?,?)").bind(id,ownerA,project,repo,sha,JSON.stringify(diag),at,at).run();return id;};
  const safe=await mk('a'.repeat(40),{stage:'ai_call',last_ok_stage:'github_checks',category:'provider_down',code:'http_503',retry_allowed:true,ai_started:true,ai_result:'none',attempts:1});
  const unsafe=await mk('b'.repeat(40),{stage:'ai_call',last_ok_stage:'github_checks',category:'timeout',code:'timeout',retry_allowed:false,ai_started:true,ai_result:'unknown',attempts:1});
  const list=await json('/reviews/runs?project='+project);
  expect(list.body.items.find((r:any)=>r.id===unsafe).diagnostic.ai_result).toBe('unknown');
  expect((await json('/reviews/runs/'+unsafe+'/retry','POST',{})).status).toBe(409);
  const legacy=await mk('c'.repeat(40),null as any);await db.prepare('UPDATE review_runs SET diagnostic=NULL WHERE id=?').bind(legacy).run();
  expect((await json('/reviews/runs/'+legacy+'/retry','POST',{})).status).toBe(409);
  expect((await json('/reviews/runs/'+legacy+'/retry','POST',{acknowledge_uncertain:true})).status).toBe(202);
  expect((await json('/reviews/runs/'+unsafe+'/retry','POST',{acknowledge_uncertain:true})).status).toBe(202);
  expect((await json('/reviews/runs/'+safe+'/retry','POST',{},b)).status).toBe(404);
  expect((await json('/reviews/runs/'+safe+'/retry','POST',{})).status).toBe(202);
  expect((await db.prepare('SELECT status FROM review_runs WHERE id=?').bind(safe).first<any>()).status).toBe('queued');
  expect((await json('/reviews/runs/'+safe+'/retry','POST',{})).status).toBe(409);
 });
 it('ne crée aucun traitement sans dépôt appartenant au compte',async()=>{
  const foreign=crypto.randomUUID();
  expect((await json('/reviews/start','POST',{repository_id:foreign,pr_number:58})).status).toBe(404);
  expect((await json('/reviews/configs','POST',{repository_id:foreign,primary:{connection_id:crypto.randomUUID(),model:'test'},enabled:true,share_consent:true})).status).toBe(404);
 });
});


describe('configuration IA : limite gratuite, connexion validée et isolation',()=>{
 it('préserve les choix et bloque un plafond quotidien abusif',async()=>{
  const email='review-'+crypto.randomUUID()+'@example.test';
  const registration=await json('/auth/register','POST',{email,password:'unmotdepassefort'},'');
  expect(registration.status).toBe(201);const cookie=registration.cookie!;
  const ownProject=await json('/projects','POST',{name:'Projet revue IA'},cookie);
  expect(ownProject.status).toBe(201);
  const ai=await json('/connections','POST',{provider:'mistral',label:'Test IA',secret:'exemple-clé-factice-2026',scopes:['chat'],api_consent:true},cookie);
  const gh=await json('/connections','POST',{provider:'github',label:'Test GitHub',secret:'exemple-jeton-factice-2026',scopes:['read']},cookie);
  expect(ai.status).toBe(201);expect(gh.status).toBe(201);
  const db=await mf.getD1Database('DB');
  await db.prepare("UPDATE connections SET status='connected',models=? WHERE id=?").bind('["ministral-test"]',ai.body.id).run();
  const repoId=crypto.randomUUID(),at=new Date().toISOString();
  await db.prepare('INSERT INTO repositories(id,user_id,project_id,connection_id,full_name,branch,head_sha,created_at) VALUES(?,?,?,?,?,?,?,?)')
   .bind(repoId,registration.body.user.id,ownProject.body.id,gh.body.id,'martinznt/Livre-de-recettes','main','a'.repeat(40),at).run();
  const input={repository_id:repoId,primary:{connection_id:ai.body.id,model:'ministral-test'},secondary:null,enabled:false,daily_limit:2,share_consent:true};
  expect((await json('/reviews/configs','POST',{...input,daily_limit:5},cookie)).status).toBe(400);
  expect((await json('/reviews/configs','POST',input,cookie)).status).toBe(200);
  const read=await json('/reviews/configs?project='+ownProject.body.id,'GET',undefined,cookie);
  expect(read.status).toBe(200);expect(read.body.items).toHaveLength(1);
  expect(read.body.items[0].daily_limit).toBe(2);
  expect(read.body.items[0].enabled).toBe(0);
  // Mode de revue : 'equilibre' par défaut (comportement antérieur), modes valides persistés, valeur inconnue refusée.
  expect(read.body.items[0].review_mode).toBe('equilibre');expect(read.body.items[0].post_comment).toBe(0);
  expect((await json('/reviews/configs','POST',{...input,mode:'turbo'},cookie)).status).toBe(400);
  for(const mode of ['approfondi','economique']){
   expect((await json('/reviews/configs','POST',{...input,mode},cookie)).status).toBe(200);
   expect((await json('/reviews/configs?project='+ownProject.body.id,'GET',undefined,cookie)).body.items[0].review_mode).toBe(mode);
  }
  expect((await json('/reviews/configs','POST',input,cookie)).status).toBe(200);
  // Commentaire de PR : refusé tant que la connexion GitHub n'a pas l'accès « write » dans Atelier.
  expect((await json('/reviews/configs','POST',{...input,post_comment:true},cookie)).status).toBe(403);
  expect((await json('/reviews/configs?project='+ownProject.body.id,'GET',undefined,cookie)).body.items[0].post_comment).toBe(0);
  expect((await call('/reviews/configs?project='+ownProject.body.id,'GET',undefined,b)).status).toBe(404);
  const config=read.body.items[0];
  const minimalRepo={id:repoId,user_id:registration.body.user.id,project_id:ownProject.body.id,connection_id:gh.body.id,full_name:'martinznt/Livre-de-recettes'};
  const sent:string[]=[];
  const isolatedEnv={DB:db,TASKS:{send:async(payload:any)=>{sent.push(payload.id);}}} as any;
  const first=await queueReview(isolatedEnv,config,minimalRepo,101,'b'.repeat(40));
  const second=await queueReview(isolatedEnv,config,minimalRepo,102,'c'.repeat(40));
  const excess=await queueReview(isolatedEnv,config,minimalRepo,103,'d'.repeat(40));
  expect([first,second,excess]).toEqual([true,true,false]);
  const again=await queueReview(isolatedEnv,config,minimalRepo,102,'c'.repeat(40));
  expect(again).toBe(false);
  const count=await db.prepare('SELECT COUNT(*) AS n FROM review_runs WHERE user_id=? AND repository_id=?').bind(registration.body.user.id,repoId).first<{n:number}>();
  expect(count?.n).toBe(2);expect(sent).toHaveLength(2);

 });
});


describe('diagnostic du site : accès et schéma présents',()=>{
 it('expose les prérequis sans divulguer le secret ni les données d’autres comptes',async()=>{
  const response=await json('/account/readiness');
  expect(response.status).toBe(200);
  expect(response.body.checks.find((c:any)=>c.id==='master-key').status).toBe('ok');
  expect(response.body.checks.find((c:any)=>c.id==='database').status).toBe('ok');
  expect(response.body.checks.find((c:any)=>c.id==='review-migration').status).toBe('ok');
  expect(JSON.stringify(response.body)).not.toContain(Buffer.alloc(32,7).toString('base64'));
  expect(JSON.stringify(response.body)).not.toContain('alice@example.test');
  expect((await call('/account/readiness','GET',undefined,'')).status).toBe(401);
  expect((await json('/account/readiness','GET',undefined,b)).status).toBe(200);
 });
});


describe('GitHub réel depuis le runtime Cloudflare simulé, sans jeton utilisateur réel',()=>{
 it('création, chiffrement et test API GitHub via une sortie réseau contrôlée par workerd',async()=>{
  const github=mockNetwork.get('https://api.github.com');
  github.intercept({method:'GET',path:'/user'}).reply(200,JSON.stringify({login:'atelier-test-api'}),{headers:{'content-type':'application/json'}});
  const email='cloudflare-github-'+crypto.randomUUID()+'@example.test';
  const sign=await json('/auth/register','POST',{email,password:'mot-de-passe-robuste'},'');
  expect(sign.status).toBe(201);
  const cookie=sign.cookie!;
  const created=await json('/connections','POST',{provider:'github',label:'GitHub vérifié en workerd',secret:'ghp_FAUX_JETON_TEST_JAMAIS_PUBLIC',scopes:['read']},cookie);
  expect(created.status).toBe(201);
  const attempted=await json('/connections/'+created.body.id+'/test','POST',{},cookie);
  expect(attempted.status).toBe(200);
  expect(attempted.body.account).toBe('atelier-test-api');
  const summary=await json('/connections','GET',undefined,cookie);
  const saved=summary.body.items.find((row:any)=>row.id===created.body.id);
  expect(saved.status).toBe('connected');
  expect(JSON.stringify(summary.body)).not.toContain('ghp_FAUX_JETON_TEST_JAMAIS_PUBLIC');
  const separate=await json('/connections','GET',undefined,b);
  expect(separate.body.items.some((row:any)=>row.id===created.body.id)).toBe(false);
 });
});


describe('diagnostic GitHub réseau dans le véritable moteur workerd',()=>{
 it('sonde GitHub sans jeton et impose une session pour déclencher l’appel',async()=>{
  mockNetwork.get('https://api.github.com').intercept({method:'GET',path:'/zen'}).reply(200,'GitHub egress OK',{headers:{'content-type':'text/plain'}});
  expect((await json('/account/github-probe','POST',{},'')).status).toBe(401);
  const result=await json('/account/github-probe','POST',{},a);
  expect(result.status).toBe(200);
  expect(result.body.reachable).toBe(true);
  expect(result.body.outcome).toBe('ok');
  expect(JSON.stringify(result.body)).not.toContain('Bearer');
 });
});


describe('relais automatique entre IA : analyse réelle (base D1 de test) avec fournisseurs simulés',()=>{
 let relayAccount:{cookie:string;id:string}|null=null;
 const SHA=(n:number)=>String(n).repeat(40).slice(0,40);
 type Hit={github:number;mistral:number;gemini:number;groq:number};
 async function setup(withSecondary=false){
  // Un seul compte de test (la création de comptes est limitée par l'application) ; ses données de test sont nettoyées à chaque scénario.
  if(!relayAccount){
   // Base de test uniquement : la limite anti-abus des inscriptions a été atteinte par les scénarios précédents.
   await (await mf.getD1Database('DB')).prepare('DELETE FROM auth_limits').run();
   const reg=await json('/auth/register','POST',{email:'relay-'+crypto.randomUUID()+'@example.test',password:'unmotdepassefort'},'');expect(reg.status).toBe(201);
   relayAccount={cookie:reg.cookie!,id:reg.body.user.id};
  }
  const reg={body:{user:{id:relayAccount.id}}},cookie=relayAccount.cookie;
  const clean=await mf.getD1Database('DB');
  await clean.prepare('DELETE FROM review_runs WHERE user_id=?').bind(relayAccount.id).run();
  await clean.prepare('DELETE FROM review_configs WHERE user_id=?').bind(relayAccount.id).run();
  await clean.prepare('DELETE FROM repositories WHERE user_id=?').bind(relayAccount.id).run();
  await clean.prepare('DELETE FROM ai_usage WHERE user_id=?').bind(relayAccount.id).run();
  await clean.prepare('DELETE FROM connections WHERE user_id=?').bind(relayAccount.id).run();
  const project=await json('/projects','POST',{name:'Relais'},cookie);
  const mk=async(provider:string,scopes:string[],models?:string[])=>{
   const r=await json('/connections','POST',{provider,label:provider+'-test',secret:'exemple-secret-factice-'+provider,scopes,api_consent:provider!=='github'},cookie);expect(r.status).toBe(201);
   const db=await mf.getD1Database('DB');
   await db.prepare("UPDATE connections SET status='connected',models=? WHERE id=?").bind(JSON.stringify(models||[]),r.body.id).run();return r.body.id as string;
  };
  const gh=await mk('github',['read']),m=await mk('mistral',['chat'],['ministral-test']),g=await mk('gemini',['chat'],['gemini-flash-test']),q=await mk('groq',['chat'],['openai/gpt-oss-120b']);
  const db=await mf.getD1Database('DB'),repoId=crypto.randomUUID(),at=new Date().toISOString();
  await db.prepare('INSERT INTO repositories(id,user_id,project_id,connection_id,full_name,branch,head_sha,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(repoId,reg.body.user.id,project.body.id,gh,'martinznt/Livre-de-recettes','main','a'.repeat(40),at).run();
  const cfg=await json('/reviews/configs','POST',{repository_id:repoId,primary:{connection_id:m,model:'ministral-test'},secondary:withSecondary?{connection_id:g,model:'gemini-flash-test'}:null,enabled:false,daily_limit:4,share_consent:true},cookie);expect(cfg.status).toBe(200);
  return {db,cookie,user:reg.body.user.id as string,project:project.body.id as string,repoId,ids:{gh,m,g,q}};
 }
 async function runReview(ctx:Awaited<ReturnType<typeof setup>>,pr:number,behaviour:{mistral:'limit'|'ok'|'ok_then_limit';gemini:'limit'|'ok';groq:'limit'|'ok'},opts:{retryAfter?:string;existingId?:string}={}){
  const sha=SHA(pr%9+1),id=opts.existingId||crypto.randomUUID(),at=new Date().toISOString();
  if(!opts.existingId)await ctx.db.prepare("INSERT INTO review_runs(id,user_id,project_id,repository_id,pr_number,head_sha,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'queued',?,?)").bind(id,ctx.user,ctx.project,ctx.repoId,pr,sha,at,at).run();
  const hits:Hit={github:0,mistral:0,gemini:0,groq:0};
  const posted:string[]=[];
  const original=globalThis.fetch;
  const sse=(text:string)=>new Response('data: '+JSON.stringify({choices:[{delta:{content:text}}],model:'m'})+'\n\n'+'data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:90,completion_tokens:10}})+'\n\ndata: [DONE]\n\n',{status:200});
  globalThis.fetch=(async(input:any,init?:any)=>{
   const url=String(typeof input==='string'?input:input.url);
   if(url.startsWith('https://api.github.com/')){
    hits.github++;
    if(init?.method==='POST'&&url.includes('/issues/')){posted.push(JSON.parse(init.body).body);return Response.json({html_url:'https://github.com/martinznt/Livre-de-recettes/pull/'+pr+'#issuecomment-'+posted.length},{status:201});}
    if(url.endsWith('/pulls/'+pr))return Response.json({state:'open',number:pr,title:'PR',head:{sha,repo:{full_name:'martinznt/Livre-de-recettes'}}});
    if(url.includes('/files'))return Response.json([{filename:'src/a.ts',status:'modified',patch:'+const a=1;'}]);
    return Response.json({check_runs:[{name:'CI',status:'completed',conclusion:'success'}]});
   }
   const limit=()=>new Response(JSON.stringify({error:{message:'Rate limit reached on requests per minute (RPM)'}}),{status:429,headers:{'retry-after':opts.retryAfter||'30','content-type':'application/json'}});
   const good=()=>sse('{"findings":[],"summary":"Rien d\'étayé dans cet extrait."}');
   if(url.startsWith('https://api.mistral.ai/')){hits.mistral++;return behaviour.mistral==='limit'||(behaviour.mistral==='ok_then_limit'&&hits.mistral>1)?limit():good();}
   const geminiGood=()=>new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({findings:[],summary:'Rien detaye dans cet extrait.'})}]},finishReason:'STOP'}],modelVersion:'gemini-flash-test',usageMetadata:{promptTokenCount:90,candidatesTokenCount:10}})+'\n\n',{status:200});
   if(url.includes('generativelanguage.googleapis.com')){hits.gemini++;return behaviour.gemini==='limit'?limit():geminiGood();}
   if(url.startsWith('https://api.groq.com/')){hits.groq++;return behaviour.groq==='limit'?limit():good();}
   throw new Error('Appel réseau inattendu : '+url);
  }) as any;
  try{await executeReview({DB:ctx.db,MASTER_KEY:Buffer.alloc(32,7).toString('base64'),TASKS:{send:async()=>{}}} as any,id);}finally{globalThis.fetch=original;}
  const row=await ctx.db.prepare('SELECT status,report,error,resume_at,resume_state FROM review_runs WHERE id=?').bind(id).first<any>();
  return {row,report:row.report?JSON.parse(row.report):null,hits,id,posted};
 }
 it('Mistral limité : Groq prend le relais, Gemini n’est pas sollicité, la pause de Mistral est mémorisée et respectée par la tâche suivante',async()=>{
  const ctx=await setup();
  const first=await runReview(ctx,201,{mistral:'limit',gemini:'ok',groq:'ok'});
  expect(first.row.status).toBe('completed');
  const reviewer=first.report.reviewers[0];
  expect(reviewer.provider).toBe('gemini'); // ordre de préférence existant : Mistral, puis Gemini, puis Groq
  expect(reviewer.relayed).toBe(true);
  expect(reviewer.attempts.map((a:any)=>[a.provider,a.outcome])).toEqual([['mistral','refused'],['gemini','completed']]);
  expect(reviewer.attempts[0].kind).toBe('rate_limit_requests');expect(reviewer.attempts[0].until_source).toBe('provider');
  expect(first.hits).toMatchObject({mistral:1,gemini:1,groq:0});
  const quota=JSON.parse((await ctx.db.prepare('SELECT quota FROM connections WHERE id=?').bind(ctx.ids.m).first<any>()).quota);
  expect(quota.holds['ministral-test'].kind).toBe('rate_limit_requests');expect(quota.holds['ministral-test'].hold_source).toBe('provider');
  const geminiQuota=(await ctx.db.prepare('SELECT quota FROM connections WHERE id=?').bind(ctx.ids.g).first<any>()).quota;
  expect(geminiQuota===null||!JSON.parse(geminiQuota).holds?.['gemini-flash-test']).toBe(true); // quotas jamais mélangés entre clés
  const rows=(await ctx.db.prepare('SELECT provider,outcome,failure_kind,input_tokens FROM ai_usage WHERE user_id=? ORDER BY started_at,rowid').bind(ctx.user).all<any>()).results;
  expect(rows.map((r:any)=>[r.provider,r.outcome])).toEqual([['mistral','refused'],['gemini','completed']]);
  expect(rows[0].input_tokens).toBeNull(); // un refus n'a consommé aucun jeton connu
  // Seconde tâche : Mistral est en pause, il n'est même pas appelé.
  const second=await runReview(ctx,202,{mistral:'limit',gemini:'ok',groq:'ok'});
  expect(second.hits.mistral).toBe(0);
  expect(second.report.reviewers[0].provider).toBe('gemini');
  expect(second.report.reviewers[0].excluded.some((e:any)=>e.provider==='mistral'&&e.kind==='rate_limit_requests'&&e.until_source==='provider')).toBe(true);
 });
 it('Mistral et Gemini limités : Groq répond ; chaque fournisseur est appelé une seule fois',async()=>{
  const ctx=await setup();
  const r=await runReview(ctx,203,{mistral:'limit',gemini:'limit',groq:'ok'});
  expect(r.row.status).toBe('completed');
  expect(r.report.reviewers[0].provider).toBe('groq');
  expect(r.hits).toMatchObject({mistral:1,gemini:1,groq:1});
 });
 it('tous les fournisseurs limités : analyse partielle claire, aucun résultat inventé, aucun appel répété',async()=>{
  const ctx=await setup();
  const r=await runReview(ctx,204,{mistral:'limit',gemini:'limit',groq:'limit'});
  // Les refus fournissent une date (Retry-After) : l'analyse attend la réinitialisation au lieu d'échouer.
  expect(r.row.status).toBe('queued');expect(r.row.resume_at).toBeTruthy();
  const rev=r.report.reviewers[0];
  expect(rev.review).toBeUndefined();expect(rev.error).toMatch(/limitées ou indisponibles/);
  expect(r.report.waiting.source).toBe('provider');expect(r.report.waiting.roles).toEqual(['correctness']);
  expect(r.hits).toMatchObject({mistral:1,gemini:1,groq:1});
  expect(rev.attempts.filter((a:any)=>a.outcome==='refused')).toHaveLength(3);
  // Avant la date de reprise, relancer l'exécution ne fait aucun appel (aucune consommation inutile).
  const again=await runReview(ctx,204,{mistral:'ok',gemini:'ok',groq:'ok'},{existingId:r.id});
  expect(again.hits).toMatchObject({github:0,mistral:0,gemini:0,groq:0});expect(again.row.status).toBe('queued');
 });
 it('relais désactivé : seule l’IA choisie est appelée, même limitée',async()=>{
  const ctx=await setup();
  await ctx.db.prepare('UPDATE review_configs SET relay=0 WHERE repository_id=?').bind(ctx.repoId).run();
  const r=await runReview(ctx,205,{mistral:'limit',gemini:'ok',groq:'ok'});
  expect(r.hits).toMatchObject({mistral:1,gemini:0,groq:0});expect(r.row.status).toBe('queued');
 });
 it('limite atteinte en cours de route : reprise automatique après réinitialisation, seule la vérification restante est refaite',async()=>{
  const ctx=await setup(true);
  // Vérification 1 (Mistral) réussie ; vérification 2 : Gemini, Mistral puis Groq refusent avec Retry-After de 1 s.
  const first=await runReview(ctx,206,{mistral:'ok_then_limit',gemini:'limit',groq:'limit'},{retryAfter:'1'});
  expect(first.row.status).toBe('queued');
  expect(first.report.waiting.roles).toEqual(['security']);
  expect(first.report.reviewers.find((x:any)=>x.role==='correctness').provider).toBe('mistral');
  expect(first.hits).toMatchObject({mistral:2,gemini:1,groq:1});
  const state=JSON.parse(first.row.resume_state);
  expect(state.done.map((x:any)=>x.role)).toEqual(['correctness']);expect(state.resumes).toBe(1);
  await new Promise(r=>setTimeout(r,1400)); // la limite fournie par le fournisseur est réinitialisée
  const resumed=await runReview(ctx,206,{mistral:'ok',gemini:'ok',groq:'ok'},{existingId:first.id});
  expect(resumed.row.status).toBe('completed');
  expect(resumed.report.resumed.count).toBe(1);
  // Reprise à l'endroit de l'arrêt : un seul appel IA (la vérification restante), Mistral n'est pas rappelé pour la première.
  expect(resumed.hits.mistral+resumed.hits.gemini+resumed.hits.groq).toBe(1);
  expect(resumed.report.reviewers.map((x:any)=>x.role).sort()).toEqual(['correctness','security']);
  expect(resumed.report.reviewers.every((x:any)=>x.review)).toBe(true);
  expect(resumed.row.resume_at).toBeNull();
 });
 it('la page de santé publique expose l’état des migrations D1 sans aucune donnée sensible',async()=>{
  const health=await json('/health','GET',undefined,'');
  expect(health.status).toBe(200);
  expect(health.body.schema.complete).toBe(true);
  expect(health.body.schema.missing).toEqual([]);
  expect(health.body.schema.applied).toContain('0013');
  expect(JSON.stringify(health.body)).not.toMatch(/@|secret|token/i);
 });
 it('discussion : Mistral refuse avant le flux, Gemini prend le relais ; sans consentement de partage, aucun relais',async()=>{
  const ctx=await setup();
  const conv=await json('/conversations','POST',{project_id:ctx.project,title:'Relais discussion'},ctx.cookie);expect(conv.status).toBe(201);
  const hits={mistral:0,gemini:0,groq:0};
  const original=globalThis.fetch;
  globalThis.fetch=(async(input:any)=>{
   const url=String(typeof input==='string'?input:input.url);
   if(url.startsWith('https://api.mistral.ai/')){hits.mistral++;return new Response(JSON.stringify({error:{message:'Rate limit reached on requests per minute (RPM)'}}),{status:429,headers:{'retry-after':'60','content-type':'application/json'}});}
   if(url.includes('generativelanguage.googleapis.com')){hits.gemini++;return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'Réponse relayée par Gemini.'}]},finishReason:'STOP'}],modelVersion:'gemini-flash-test',usageMetadata:{promptTokenCount:20,candidatesTokenCount:6}})+'\n\n',{status:200});}
   if(url.startsWith('https://api.groq.com/')){hits.groq++;}
   throw new Error('Appel réseau inattendu : '+url);
  }) as any;
  const env={DB:ctx.db,MASTER_KEY:Buffer.alloc(32,7).toString('base64'),TASKS:{send:async()=>{}},STORAGE_LIMIT_MB:'1',MAX_FILE_MB:'1'} as any;
  const makeTask=async(share:boolean)=>{
   const id=crypto.randomUUID(),at=new Date().toISOString();
   await ctx.db.prepare('INSERT INTO tasks(id,user_id,project_id,conversation_id,idempotency_key,request_hash,payload,context,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,ctx.user,ctx.project,conv.body.id,crypto.randomUUID(),'h',JSON.stringify({mode:'individual',rounds:1,message:'Bonjour',max_tokens:200,share_consent:share,assistants:[{connection_id:ctx.ids.m,model:'ministral-test'}]}),JSON.stringify({notice:'',text:''}),at,at).run();
   return id;
  };
  try{
   const ok=await makeTask(true);await executeTask(env,ok);
   const task=await ctx.db.prepare('SELECT status,error FROM tasks WHERE id=?').bind(ok).first<any>();
   expect(task.status).toBe('completed');
   const msg=await ctx.db.prepare("SELECT provider,assistant_label,content,status,model FROM messages WHERE task_id=? AND role='assistant'").bind(ok).first<any>();
   expect(msg.provider).toBe('gemini');expect(msg.content).toContain('Réponse relayée par Gemini.');expect(msg.status).toBe('final');
   expect(hits).toMatchObject({mistral:1,gemini:1,groq:0});
   const ev=await ctx.db.prepare("SELECT detail FROM events WHERE task_id=? AND kind='relay'").bind(ok).first<any>();
   expect(ev.detail).toMatch(/Relais automatique/);
   const mq=JSON.parse((await ctx.db.prepare('SELECT quota FROM connections WHERE id=?').bind(ctx.ids.m).first<any>()).quota);
   expect(mq.holds['ministral-test'].kind).toBe('rate_limit_requests');
   // Sans consentement de partage : le contexte ne part jamais vers un autre fournisseur.
   hits.mistral=0;hits.gemini=0;
   await ctx.db.prepare('UPDATE connections SET quota=NULL WHERE id=?').bind(ctx.ids.m).run();
   const noShare=await makeTask(false);await executeTask(env,noShare);
   const t2=await ctx.db.prepare('SELECT status FROM tasks WHERE id=?').bind(noShare).first<any>();
   expect(t2.status).toBe('quota');expect(hits).toMatchObject({mistral:1,gemini:0,groq:0});
  }finally{globalThis.fetch=original;}
 });
 it('suppression de compte : l’historique de consommation IA est effacé avec le compte (cascade D1)',async()=>{
  const db=await mf.getD1Database('DB'),u=crypto.randomUUID(),at=new Date().toISOString();
  await db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(u,'cascade-'+u.slice(0,8),'x',at).run();
  await db.prepare("INSERT INTO ai_usage(id,user_id,connection_id,provider,model,task_kind,outcome,started_at,ended_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),u,'c','groq','m','review','completed',at,at).run();
  expect((await db.prepare('SELECT COUNT(*) AS n FROM ai_usage WHERE user_id=?').bind(u).first<any>()).n).toBe(1);
  await db.prepare('DELETE FROM users WHERE id=?').bind(u).run();
  expect((await db.prepare('SELECT COUNT(*) AS n FROM ai_usage WHERE user_id=?').bind(u).first<any>()).n).toBe(0);
 });
 it('publication automatique : deux commentaires (Claude Code, ChatGPT) quand l’option est activée avec l’accès en écriture ; aucun sinon',async()=>{
  const ctx=await setup();
  const none=await runReview(ctx,310,{mistral:'ok',gemini:'ok',groq:'ok'});
  expect(none.posted).toHaveLength(0);expect(none.report.comment).toBeUndefined();
  await ctx.db.prepare("UPDATE connections SET scopes='[\"read\",\"write\"]' WHERE id=?").bind(ctx.ids.gh).run();
  await ctx.db.prepare('UPDATE review_configs SET post_comment=1 WHERE repository_id=?').bind(ctx.repoId).run();
  const r=await runReview(ctx,311,{mistral:'ok',gemini:'ok',groq:'ok'});
  expect(r.row.status).toBe('completed');
  expect(r.posted).toHaveLength(2);
  expect(r.posted[0]).toMatch(/Pour Claude Code/);expect(r.posted[0]).toMatch(/reproduis d’abord/);
  expect(r.posted[1]).toMatch(/Pour ChatGPT/);expect(r.posted[1]).toMatch(/avis indépendant/);
  expect(r.posted.join('')).not.toMatch(/@claude/);
  expect(r.report.comment.posted).toBe(true);
  expect(r.report.comment.urls.claude_code).toMatch(/^https:\/\/github\.com\//);expect(r.report.comment.urls.chatgpt).toMatch(/issuecomment-2$/);
 });
 it('analyse automatique « travail de Claude Code » : seules les PR de Claude Code sont mises en file ; réglage conservé',async()=>{
  const ctx=await setup();
  expect((await json('/reviews/configs','POST',{repository_id:ctx.repoId,primary:{connection_id:ctx.ids.m,model:'ministral-test'},secondary:null,enabled:true,auto_scope:'turbo',daily_limit:4,share_consent:true},ctx.cookie)).status).toBe(400);
  const saved=await json('/reviews/configs','POST',{repository_id:ctx.repoId,primary:{connection_id:ctx.ids.m,model:'ministral-test'},secondary:null,enabled:true,auto_scope:'claude_code',daily_limit:4,share_consent:true},ctx.cookie);
  expect(saved.status).toBe(200);
  const cfg=(await json('/reviews/configs?project='+ctx.project,'GET',undefined,ctx.cookie)).body.items[0];
  expect(cfg.auto_scope).toBe('claude_code');expect(cfg.enabled).toBe(1);
  const repoName='martinznt/Livre-de-recettes',mk=(n:number,ref:string,body:string|null)=>({number:n,title:'PR '+n,body,state:'open',head:{ref,sha:String(n%9+1).repeat(40),repo:{full_name:repoName}}});
  const original=globalThis.fetch;
  globalThis.fetch=(async(input:any)=>{
   const url=String(typeof input==='string'?input:input.url);
   if(url.includes('/pulls?state=open'))return Response.json([mk(301,'claude/atelier-x',null),mk(302,'codex/f1',null),mk(303,'feat/z','Résumé\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)')]);
   throw new Error('Appel inattendu : '+url);
  }) as any;
  const sent:string[]=[];
  try{await maintenanceReviews({DB:ctx.db,MASTER_KEY:Buffer.alloc(32,7).toString('base64'),TASKS:{send:async(m:any)=>{sent.push(m.id);}}} as any);}finally{globalThis.fetch=original;}
  const runs=(await ctx.db.prepare('SELECT pr_number,status FROM review_runs WHERE repository_id=? ORDER BY pr_number').bind(ctx.repoId).all<any>()).results;
  expect(runs.map((x:any)=>x.pr_number)).toEqual([301,303]);
  expect(runs.every((x:any)=>x.status==='queued')).toBe(true);
  // Portée « toutes les PR » : la PR ordinaire est aussi mise en file.
  await ctx.db.prepare("UPDATE review_configs SET auto_scope='all' WHERE repository_id=?").bind(ctx.repoId).run();
  await ctx.db.prepare('DELETE FROM review_runs WHERE repository_id=?').bind(ctx.repoId).run();
  globalThis.fetch=(async(input:any)=>{
   const url=String(typeof input==='string'?input:input.url);
   if(url.includes('/pulls?state=open'))return Response.json([mk(301,'claude/atelier-x',null),mk(302,'codex/f1',null)]);
   throw new Error('Appel inattendu : '+url);
  }) as any;
  try{await maintenanceReviews({DB:ctx.db,MASTER_KEY:Buffer.alloc(32,7).toString('base64'),TASKS:{send:async()=>{}}} as any);}finally{globalThis.fetch=original;}
  expect((await ctx.db.prepare('SELECT pr_number FROM review_runs WHERE repository_id=? ORDER BY pr_number').bind(ctx.repoId).all<any>()).results.map((x:any)=>x.pr_number)).toEqual([301,302]);
 });
});
