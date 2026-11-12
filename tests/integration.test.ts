import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {Miniflare,createFetchMock} from 'miniflare';import {build} from 'esbuild';import {readFile,readdir,mkdir} from 'node:fs/promises';import {unzipSync,strFromU8} from 'fflate';import {hashPassword,verifyPassword} from '../server/password';
import {normalizeMigrationForD1} from './migration-sql.mjs';
import {queueReview,queueReviewDetailed,executeReview,maintenanceReviews,publishReport} from '../server/reviews';
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
  // Publication demandée sans accès « écriture » sur la connexion GitHub : refus précis, rien d'enregistré.
  const noWrite=await json('/reviews/configs','POST',{...input,enabled:true,post_comment:true},cookie);
  expect(noWrite.status).toBe(403);
  expect(JSON.stringify(noWrite.body)).toContain('Sauvegarder sur GitHub');expect(JSON.stringify(noWrite.body)).toContain('Test GitHub');
  expect((await json('/reviews/configs?project='+ownProject.body.id,'GET',undefined,cookie)).body.items).toHaveLength(0);
  // Le propriétaire peut accorder l'accès d'écriture à sa connexion GitHub sans la recréer ; « lire » reste accordé.
  const grant=await json('/connections/'+gh.body.id,'PATCH',{scopes:['write']},cookie);
  expect(grant.status).toBe(200);
  const listed=await json('/connections','GET',undefined,cookie);
  expect(listed.body.items.find((x:any)=>x.id===gh.body.id).scopes).toEqual(['read','write']);
  expect((await json('/connections/'+ai.body.id,'PATCH',{scopes:['read']},cookie)).status).toBe(400);
  expect((await json('/connections/'+gh.body.id,'PATCH',{scopes:['deploy']},cookie)).status).toBe(400);
  const withPost=await json('/reviews/configs','POST',{...input,enabled:true,post_comment:true},cookie);
  expect(withPost.status).toBe(200);
  // Retrait possible : l'accès redevient « lire » seulement.
  expect((await json('/connections/'+gh.body.id,'PATCH',{scopes:['read']},cookie)).status).toBe(200);
  expect((await json('/connections','GET',undefined,cookie)).body.items.find((x:any)=>x.id===gh.body.id).scopes).toEqual(['read']);
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
 it('publier un rapport terminé sur la PR : refus sans accès écriture, puis deux commentaires, jamais deux fois',async()=>{
  const ctx=await setup();
  const done=await runReview(ctx,320,{mistral:'ok',gemini:'ok',groq:'ok'});
  expect(done.row.status).toBe('completed');expect(done.report.handoff).toBeTruthy();expect(done.report.comment).toBeUndefined();
  const refused=await json('/reviews/runs/'+done.id+'/publish','POST',{},ctx.cookie);
  expect(refused.status).toBe(403);expect(JSON.stringify(refused.body)).toContain('Sauvegarder sur GitHub');
  await ctx.db.prepare("UPDATE connections SET scopes='[\"read\",\"write\"]' WHERE id=?").bind(ctx.ids.gh).run();
  const posted:string[]=[],original=globalThis.fetch;
  globalThis.fetch=(async(input:any,init?:any)=>{
   const url=String(typeof input==='string'?input:input.url);
   if(url.startsWith('https://api.github.com/')&&init?.method==='POST'&&url.includes('/issues/')){posted.push(JSON.parse(init.body).body);return Response.json({html_url:'https://github.com/martinznt/Livre-de-recettes/pull/320#issuecomment-'+posted.length},{status:201});}
   throw new Error('Appel réseau inattendu : '+url);
  }) as any;
  try{
   const env={DB:ctx.db,MASTER_KEY:Buffer.alloc(32,7).toString('base64'),TASKS:{send:async()=>{}}} as any;
   const comment=await publishReport(env,ctx.user,done.id);
   expect(comment.posted).toBe(true);
   expect(posted).toHaveLength(2);expect(posted[0]).toMatch(/Pour Claude Code/);expect(posted[1]).toMatch(/Pour ChatGPT/);
   await expect(publishReport(env,ctx.user,done.id)).rejects.toThrow();
   expect(posted).toHaveLength(2);
  }finally{globalThis.fetch=original;}
  const saved=await ctx.db.prepare('SELECT report FROM review_runs WHERE id=?').bind(done.id).first<any>();
  expect(JSON.parse(saved.report).comment.posted).toBe(true);
 });
 it('relancer une analyse : nouvelle version mise en file, même commit refusé avec sa raison, demande manuelle non bornée par le plafond du dépôt',async()=>{
  const ctx=await setup();
  const env={DB:ctx.db,MASTER_KEY:Buffer.alloc(32,7).toString('base64'),TASKS:{send:async()=>{}}} as any;
  const cfg:any=await ctx.db.prepare('SELECT * FROM review_configs WHERE repository_id=?').bind(ctx.repoId).first();
  const repo={id:ctx.repoId,user_id:ctx.user,project_id:ctx.project,connection_id:ctx.ids.gh,full_name:'martinznt/Livre-de-recettes'};
  const v1='b'.repeat(40),v2='c'.repeat(40),v3='d'.repeat(40);
  expect((await queueReviewDetailed(env,{...cfg,daily_limit:2},repo,111,v1)).reason).toBe('queued');
  const same=await queueReviewDetailed(env,{...cfg,daily_limit:2},repo,111,v1,{manual:true});
  expect(same.queued).toBe(false);expect(same.reason).toBe('exists');expect(same.status).toBe('queued');
  expect((await queueReviewDetailed(env,{...cfg,daily_limit:1},repo,111,v2)).reason).toBe('cap_repo');
  const manual=await queueReviewDetailed(env,{...cfg,daily_limit:1},repo,111,v2,{manual:true});
  expect(manual.queued).toBe(true);
  expect((await queueReviewDetailed(env,cfg,repo,111,'pas-un-sha')).reason).toBe('bad_sha');
  const today=new Date().toISOString();
  for(let i=0;i<6;i++)await ctx.db.prepare("INSERT INTO review_runs(id,user_id,project_id,repository_id,pr_number,head_sha,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'completed',?,?)").bind(crypto.randomUUID(),ctx.user,ctx.project,ctx.repoId,200+i,'e'.repeat(40),today,today).run();
  // 8 sans l'option : l'automatique est bloqué par le plafond du compte, pas la demande manuelle ni le réglage « sans plafond ».
  expect((await queueReviewDetailed(env,{...cfg,daily_limit:4},repo,112,v3)).reason).toBe('cap_user');
  expect((await queueReviewDetailed(env,{...cfg,no_daily_cap:1,daily_limit:1},repo,113,v3)).queued).toBe(true);
  expect((await queueReviewDetailed(env,cfg,repo,114,v3,{manual:true})).queued).toBe(true);
  // plafond de sécurité du compte : atteint à 100 pour une demande sans plafond
  for(let i=0;i<100;i++)await ctx.db.prepare("INSERT INTO review_runs(id,user_id,project_id,repository_id,pr_number,head_sha,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'completed',?,?)").bind(crypto.randomUUID(),ctx.user,ctx.project,ctx.repoId,300+i,'f'.repeat(40),today,today).run();
  expect((await queueReviewDetailed(env,cfg,repo,115,v3,{manual:true})).reason).toBe('cap_user');
 });
 it('toutes les IA à leur limite : l’automatique attend sans rien créer ; une demande manuelle est mise en pause avec l’heure de reprise',async()=>{
  const ctx=await setup();
  const env={DB:ctx.db,MASTER_KEY:Buffer.alloc(32,7).toString('base64'),TASKS:{send:async()=>{throw new Error('aucun envoi pour une analyse en pause');}}} as any;
  const cfg:any=await ctx.db.prepare('SELECT * FROM review_configs WHERE repository_id=?').bind(ctx.repoId).first();
  const repo={id:ctx.repoId,user_id:ctx.user,project_id:ctx.project,connection_id:ctx.ids.gh,full_name:'martinznt/Livre-de-recettes'};
  const until=new Date(Date.now()+3600e3).toISOString();
  for(const id of [ctx.ids.m,ctx.ids.g,ctx.ids.q])await ctx.db.prepare('UPDATE connections SET quota=? WHERE id=?').bind(JSON.stringify({status:'rate_limited',retry_at:until}),id).run();
  const sha='9'.repeat(40);
  const auto=await queueReviewDetailed(env,cfg,repo,121,sha);
  expect(auto.queued).toBe(false);expect(auto.reason).toBe('no_ai');expect(auto.until).toBe(until);
  expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM review_runs WHERE repository_id=? AND pr_number=121').bind(ctx.repoId).first<any>().then((r:any)=>r.n)).toBe(0);
  const manual=await queueReviewDetailed(env,cfg,repo,121,sha,{manual:true});
  expect(manual.queued).toBe(true);expect(manual.reason).toBe('paused');expect(manual.until).toBe(until);
  const row:any=await ctx.db.prepare('SELECT status,resume_at,report FROM review_runs WHERE repository_id=? AND pr_number=121').bind(ctx.repoId).first();
  expect(row.status).toBe('queued');expect(row.resume_at).toBe(until);expect(JSON.parse(row.report).waiting.until).toBe(until);
 });
 it('marque de titre : seules les PR dont le titre commence par la marque sont mises en file ; enregistrement et retrait de la marque',async()=>{
  const ctx=await setup();
  const base={repository_id:ctx.repoId,primary:{connection_id:ctx.ids.m,model:'ministral-test'},secondary:null,enabled:true,auto_scope:'all',daily_limit:4,share_consent:true};
  expect((await json('/reviews/configs','POST',{...base,auto_mark:''},ctx.cookie)).status).toBe(400);
  expect((await json('/reviews/configs','POST',{...base,auto_mark:'x'.repeat(41)},ctx.cookie)).status).toBe(400);
  expect((await json('/reviews/configs','POST',{...base,auto_mark:'EN VÉRIFICATION'},ctx.cookie)).status).toBe(200);
  expect((await json('/reviews/configs?project='+ctx.project,'GET',undefined,ctx.cookie)).body.items[0].auto_mark).toBe('EN VÉRIFICATION');
  const repoName='martinznt/Livre-de-recettes',mk=(n:number,title:string)=>({number:n,title,body:null,state:'open',head:{ref:'claude/x'+n,sha:String(n%9+1).repeat(40),repo:{full_name:repoName}}});
  const original=globalThis.fetch;
  globalThis.fetch=(async(input:any)=>{
   const url=String(typeof input==='string'?input:input.url);
   if(url.includes('/pulls?state=open'))return Response.json([mk(401,'EN VÉRIFICATION — Version 4.6.0'),mk(402,'A FUSIONNER — Version 4.5.0'),mk(403,'en verification : autre')]);
   throw new Error('Appel inattendu : '+url);
  }) as any;
  try{await maintenanceReviews({DB:ctx.db,MASTER_KEY:Buffer.alloc(32,7).toString('base64'),TASKS:{send:async()=>{}}} as any);}finally{globalThis.fetch=original;}
  expect((await ctx.db.prepare('SELECT pr_number FROM review_runs WHERE repository_id=? ORDER BY pr_number').bind(ctx.repoId).all<any>()).results.map((x:any)=>x.pr_number)).toEqual([401,403]);
  // Retrait de la marque : la valeur est bien effacée (pas conservée par l'ancien enregistrement).
  expect((await json('/reviews/configs','POST',{...base,auto_mark:null},ctx.cookie)).status).toBe(200);
  expect((await json('/reviews/configs?project='+ctx.project,'GET',undefined,ctx.cookie)).body.items[0].auto_mark).toBeNull();
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

describe('pilotage de deux projets : espaces, plan, transmissions, suivi GitHub',()=>{
 const REPO='martinznt/Livre-de-recettes',SHA='1'.repeat(40),SHA2='2'.repeat(40);
 const github=()=>mockNetwork.get('https://api.github.com');
 let recettes:string,sport:string,conn:string;
 const raw=(path:string,method='GET',cookie=a)=>mf.dispatchFetch(`${origin}/api${path}`,{method,headers:{Origin:origin,Cookie:cookie}});
 it('deux espaces séparés, initialisation explicite, aucun dépôt associé ni deviné',async()=>{
  const before=await json('/spaces');expect(before.status).toBe(200);expect(before.body.items).toHaveLength(0);
  expect(before.body.templates.map((t:any)=>t.key).sort()).toEqual(['livre_recettes','sport']);
  const r=await json('/spaces/init','POST',{template:'livre_recettes'});expect(r.status).toBe(201);recettes=r.body.project_id;
  const s=await json('/spaces/init','POST',{template:'sport'});expect(s.status).toBe(201);sport=s.body.project_id;
  expect(recettes).not.toBe(sport);
  expect((await json('/spaces/init','POST',{template:'sport'})).body).toMatchObject({project_id:sport,created:false});
  const list=await json('/spaces');expect(list.body.items).toHaveLength(2);
  for(const item of list.body.items)expect(item.repositories).toEqual([]);
  expect((await json('/spaces/init','POST',{template:'autre'})).status).toBe(400);
  // Bob n'a rien : ses espaces sont indépendants et invisibles pour Alice.
  expect((await json('/spaces','GET',undefined,b)).body.items).toHaveLength(0);
  expect((await json('/spaces/'+recettes+'/overview','GET',undefined,b)).status).toBe(404);
  expect((await json('/spaces/'+recettes+'/plan','GET',undefined,b)).status).toBe(404);
  const ov=await json('/spaces/'+sport+'/overview');expect(ov.status).toBe(200);expect(ov.body.repositories).toEqual([]);
  expect(['add_github_connection','link_repository']).toContain(ov.body.next_action.code);  // selon les connexions déjà présentes sur le compte de test
 });
 it('association GitHub : sélection explicite, vérification par le connecteur, branche lue chez GitHub, refus si inaccessible, double association confirmée',async()=>{
  conn=(await json('/connections','POST',{provider:'github',label:'GitHub pilotage',secret:'exemple-jeton-factice-2026',scopes:['read']})).body.id;
  expect((await json('/spaces/'+recettes+'/overview')).body.next_action.code).toBe('link_repository');
  github().intercept({path:'/repos/'+REPO,method:'GET'}).reply(200,{full_name:REPO,default_branch:'trunk',permissions:{pull:true,push:false}}).times(3);
  github().intercept({path:'/repos/'+REPO+'/branches/trunk',method:'GET'}).reply(200,{commit:{sha:SHA}}).times(3);
  github().intercept({path:'/repos/martinznt/Inconnu',method:'GET'}).reply(404,{message:'Not Found'}).persist();
  github().intercept({path:'/repos/martinznt/Sans-lecture',method:'GET'}).reply(200,{full_name:'martinznt/Sans-lecture',default_branch:'main',permissions:{pull:false,push:false}}).persist();
  const ok=await json('/spaces/'+recettes+'/repository','POST',{connection_id:conn,full_name:REPO});
  expect(ok.status).toBe(201);expect(ok.body.repositories[0]).toMatchObject({full_name:REPO,branch:'trunk',head_sha:SHA,verified:true,can_push:false});
  // Refus : dépôt introuvable, ou sans droit de lecture : rien n'est enregistré.
  expect((await json('/spaces/'+recettes+'/repository','POST',{connection_id:conn,full_name:'martinznt/Inconnu'})).status).toBe(403);
  expect((await json('/spaces/'+recettes+'/repository','POST',{connection_id:conn,full_name:'martinznt/Sans-lecture'})).status).toBe(403);
  expect((await json('/spaces/'+recettes+'/overview')).body.repositories).toHaveLength(1);
  // Le même dépôt n'est pas associé à Sport sans confirmation explicite, dont la trace est conservée.
  const refused=await json('/spaces/'+sport+'/repository','POST',{connection_id:conn,full_name:REPO});
  expect(refused.status).toBe(409);expect(JSON.stringify(refused.body)).toContain('Livre de recettes');
  expect((await json('/spaces/'+sport+'/overview')).body.repositories).toHaveLength(0);
  const confirmed=await json('/spaces/'+sport+'/repository','POST',{connection_id:conn,full_name:REPO,confirm_shared:true});
  expect(confirmed.status).toBe(201);expect(confirmed.body.repositories[0].shared_ack).toBe(true);
  // Bob ne peut pas utiliser la connexion d'Alice ni associer à son projet.
  expect((await json('/spaces/'+recettes+'/repository','POST',{connection_id:conn,full_name:REPO},b)).status).toBe(404);
  // Sans connexion GitHub, le reste du projet reste utilisable (plan, décisions).
  expect((await json('/spaces/'+recettes+'/phases','POST',{title:'Cadrage'})).status).toBe(201);
 });
 it('plan métier : dépendances, cycles, blocage, isolation par projet, jobs techniques intouchés',async()=>{
  const db=await mf.getD1Database('DB');
  const jobsBefore=(await db.prepare('SELECT COUNT(*) AS n FROM tasks').first<any>()).n;
  const ph=(await json('/spaces/'+recettes+'/phases','POST',{title:'Phase 1'})).body;
  const t1=(await json('/spaces/'+recettes+'/tasks','POST',{title:'Cahier des charges',phase_id:ph.id,priority:1,owner:'user',acceptance:'Validé par Martin'})).body;
  const t2=(await json('/spaces/'+recettes+'/tasks','POST',{title:'Écran liste',phase_id:ph.id,depends_on:[t1.id],owner:'claude_code',status:'todo'})).body;
  expect((await json('/spaces/'+recettes+'/tasks','POST',{title:'Trop tôt',depends_on:[t1.id],status:'ready'})).status).toBe(409);
  const patch=(id:string,d:any,p=recettes)=>json('/spaces/'+p+'/tasks/'+id,'PATCH',d);
  expect((await patch(t2.id,{status:'in_progress',revision:1})).status).toBe(409);
  expect((await patch(t1.id,{depends_on:[t2.id],revision:1})).status).toBe(409);       // cycle
  expect((await patch(t1.id,{status:'blocked',revision:1})).status).toBe(409);         // question obligatoire
  const plan=await json('/spaces/'+recettes+'/plan');expect(plan.body.tasks.find((t:any)=>t.id===t2.id).effective_status).toBe('waiting');
  const done=await patch(t1.id,{status:'done',proof:'Relu et validé le 11/11',revision:1});expect(done.status).toBe(200);
  expect((await patch(t2.id,{status:'in_progress',revision:1})).status).toBe(200);
  expect((await patch(t2.id,{title:'Écran',revision:1})).status).toBe(409);            // révision périmée
  // Isolation : une tâche de Livre de recettes est invisible et inutilisable depuis Sport.
  expect((await json('/spaces/'+sport+'/plan')).body.tasks).toHaveLength(0);
  expect((await patch(t1.id,{title:'x',revision:2},sport)).status).toBe(404);
  expect((await json('/spaces/'+sport+'/tasks','POST',{title:'Autre',depends_on:[t1.id]})).status).toBe(400);
  expect((await json('/spaces/'+sport+'/tasks','POST',{title:'Autre',phase_id:ph.id})).status).toBe(400);
  expect((await json('/spaces/'+recettes+'/tasks/'+t1.id,'PATCH',{title:'pirate',revision:2},b)).status).toBe(404);
  const ov=await json('/spaces/'+recettes+'/overview');
  expect(ov.body.progress).toMatchObject({done:1,verified:1,in_progress:1});expect(ov.body.answers.verified[0].title).toBe('Cahier des charges');
  expect(ov.body.next_action.code).not.toBe('nothing');
  // Les tâches du plan ne passent jamais par la table des jobs asynchrones.
  expect((await db.prepare('SELECT COUNT(*) AS n FROM tasks').first<any>()).n).toBe(jobsBefore);
 });
 it('décisions : rattachées à leur projet, source conservée, remplacement, aucune fuite entre projets',async()=>{
  const d=(await json('/spaces/'+recettes+'/decisions','POST',{title:'Format des fiches',reason:'Plus lisible',status:'validated',source_kind:'pr',source_ref:'PR 111'})).body;
  expect(d.decided_at).toBeTruthy();
  const d2=(await json('/spaces/'+recettes+'/decisions','POST',{title:'Format des fiches v2',supersedes_id:d.id,status:'validated'})).body;
  const list=(await json('/spaces/'+recettes+'/decisions')).body.items;
  expect(list.find((x:any)=>x.id===d.id).status).toBe('superseded');expect(list.find((x:any)=>x.id===d2.id).supersedes_id).toBe(d.id);
  expect((await json('/spaces/'+sport+'/decisions')).body.items).toHaveLength(0);
  expect((await json('/spaces/'+sport+'/decisions','POST',{title:'X',supersedes_id:d.id})).status).toBe(400);
  expect((await json('/spaces/'+recettes+'/decisions/'+d.id,'PATCH',{status:'rejected',revision:99})).status).toBe(409);
  expect((await json('/spaces/'+sport+'/decisions/'+d.id,'PATCH',{status:'rejected',revision:2})).status).toBe(404);
 });
 it('transmission : aperçu = export, statut « Copié » jamais « Envoyé », contexte du seul projet, aucun secret, réponse liée à la tâche',async()=>{
  const decision=(await json('/spaces/'+recettes+'/decisions','POST',{title:'Pas de R2',reason:'Gratuit uniquement',status:'validated',source_kind:'other'})).body;
  const foreign=(await json('/spaces/'+sport+'/decisions','POST',{title:'Décision SPORT CONFIDENTIELLE',reason:'ne doit jamais apparaître',status:'validated'})).body;
  const task=(await json('/spaces/'+recettes+'/tasks','POST',{title:'Corriger le planning',objective:'Corriger',owner:'claude_code'})).body;
  const f=(await json('/files/text','POST',{project_id:recettes,name:'consignes.md',content:'Consigne de test : garder les quantités.'})).body.file_id;
  const fSport=(await json('/files/text','POST',{project_id:sport,name:'sport.md',content:'FICHIER SPORT'})).body.file_id;
  const db=await mf.getD1Database('DB');
  await db.prepare('INSERT INTO memory(id,user_id,project_id,title,content,kind,source,pinned,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),ownerA,recettes,'Mémoire','MÉMOIRE-GENERALE-JAMAIS-INCLUSE','note','test',1,new Date().toISOString(),new Date().toISOString()).run();
  const repoId=(await json('/spaces/'+recettes+'/overview')).body.repositories[0].id;
  // Pièces d'un autre projet ou d'un autre compte : refusées.
  const bad=(items:any[])=>json('/handoffs','POST',{project_id:recettes,title:'X',destination:'claude_code',items});
  expect((await bad([{kind:'decision',ref:foreign.id}])).status).toBe(400);
  expect((await bad([{kind:'file',ref:fSport}])).status).toBe(400);
  expect((await json('/handoffs','POST',{project_id:recettes,title:'X',destination:'claude_code',task_id:crypto.randomUUID()})).status).toBe(400);
  expect((await json('/handoffs','POST',{project_id:recettes,title:'X',destination:'claude_code'},b)).status).toBe(404);
  const created=await json('/handoffs','POST',{project_id:recettes,title:'Corriger le planning',destination:'claude_code',task_id:task.id,objective:'Corriger le bug',instruction:'Reproduis d’abord.',constraints:'Rien hors périmètre',success_criteria:'Test vert',repository_id:repoId,branch:'trunk',base_sha:SHA,pr_number:111,
   items:[{kind:'decision',ref:decision.id},{kind:'task',ref:task.id},{kind:'file',ref:f,include_content:true}]});
  expect(created.status).toBe(201);expect(created.body.status).toBe('draft');const id=created.body.id;
  expect((await json('/handoffs/'+id+'/export')).status).toBe(409);                       // pas d'export avant « Prêt à copier »
  const draft=(await json('/handoffs/'+id)).body;
  for(const s of ['Pas de R2','Corriger le planning','Consigne de test','garder les quantités','pull/111',SHA])expect(draft.rendered).toContain(s);
  for(const s of ['MÉMOIRE-GENERALE-JAMAIS-INCLUSE','SPORT','CONFIDENTIELLE',ownerA,'Cookie','exemple-jeton-factice'])expect(draft.rendered).not.toContain(s);
  expect(draft.provenance.map((p:any)=>p.kind).sort()).toEqual(['decision','file','task']);
  // SHA devenu obsolète : GitHub est ailleurs, le dossier n'est pas figé.
  github().intercept({path:'/repos/'+REPO+'/branches/trunk',method:'GET'}).reply(200,{commit:{sha:SHA2}}).times(2);
  expect((await json('/handoffs/'+id+'/ready','POST',{})).status).toBe(409);
  expect((await json('/handoffs/'+id)).body.status).toBe('draft');
  expect((await json('/handoffs/'+id,'PATCH',{base_sha:SHA2,revision:1})).status).toBe(200);
  const ready=await json('/handoffs/'+id+'/ready','POST',{});expect(ready.status).toBe(200);expect(ready.body.status).toBe('ready');
  const exported=await raw('/handoffs/'+id+'/export');const text=await exported.text();
  expect(text).toBe(ready.body.rendered);expect(exported.headers.get('x-content-hash')).toBe(ready.body.content_hash);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  expect(Buffer.from(hash).toString('hex')).toBe(ready.body.content_hash);
  expect((await json('/handoffs/'+id,'PATCH',{title:'x',revision:3})).status).toBe(409);   // figé
  // Statuts : « Copié » après une action locale, « Envoyé » n'existe pas.
  expect((await json('/handoffs/'+id+'/transfer','POST',{mode:'sent'})).status).toBe(400);
  const copied=await json('/handoffs/'+id+'/transfer','POST',{mode:'clipboard'});
  expect(copied.body.status).toBe('copied');expect(copied.body.status_label).toBe('Copié');expect(JSON.stringify(copied.body)).not.toMatch(/Envoy/);
  // Réponse : liée au bon dossier et à la bonne tâche.
  github().intercept({path:'/repos/'+REPO+'/pulls/112',method:'GET'}).reply(200,{number:112}).times(1);
  const resp=await json('/handoffs/'+id+'/response','POST',{text:'Corrigé, tests verts.',pr_number:112});
  expect(resp.status).toBe(200);expect(resp.body).toMatchObject({status:'response_received',result_pr:112,result_verified:1});
  expect((await json('/spaces/'+recettes+'/plan')).body.tasks.find((t:any)=>t.id===task.id).pr_number).toBe(112);
  expect((await json('/handoffs/'+id+'/response','POST',{text:'x'},b)).status).toBe(404);
  expect((await json('/handoffs/'+id+'/close','POST',{})).body.status).toBe('done');
  const v2=await json('/handoffs/'+id+'/new-version','POST',{});expect(v2.body).toMatchObject({version:2,status:'draft',parent_id:id});
  // Aucune pièce d'Alice dans la liste de Bob ; Sport ne voit pas les dossiers de Livre de recettes.
  expect((await json('/handoffs?project='+sport)).body.items).toHaveLength(0);expect((await json('/handoffs?project='+recettes,'GET',undefined,b)).status).toBe(404);
 });
 it('secrets : une pièce ou un texte qui ressemble à un secret n’est jamais transmis',async()=>{
  const faux='ghp_'+'a'.repeat(30);
  const f=(await json('/files/text','POST',{project_id:recettes,name:'notes.md',content:'Mon jeton : '+faux})).body.file_id;
  const p=(await json('/handoffs','POST',{project_id:recettes,title:'Secret',destination:'chatgpt',instruction:'Voir pièce',items:[{kind:'file',ref:f,include_content:true}]})).body;
  const preview=await json('/handoffs/'+p.id);expect(preview.body.rendered).toBeNull();expect(preview.body.preview_error).toContain('secret');expect(JSON.stringify(preview.body)).not.toContain(faux);
  expect((await json('/handoffs/'+p.id+'/ready','POST',{})).status).toBe(400);
  // En référence seulement, la même pièce est acceptée (le contenu n'est pas transmis).
  expect((await json('/handoffs/'+p.id,'PATCH',{items:[{kind:'file',ref:f}],revision:1})).status).toBe(200);
  const ok=await json('/handoffs/'+p.id+'/ready','POST',{});expect(ok.status).toBe(200);expect(ok.body.rendered).not.toContain(faux);expect(ok.body.rendered).toContain('contenu non inclus');
  const q=(await json('/handoffs','POST',{project_id:recettes,title:'Secret 2',destination:'codex',instruction:'password=Abcdefgh1234'})).body;
  expect((await json('/handoffs/'+q.id+'/ready','POST',{})).status).toBe(400);
 });
 it('suivi GitHub : états CI réels, « inconnu » sans information, liens exacts, indisponibilité signalée',async()=>{
  const sha='3'.repeat(40),shaFail='4'.repeat(40);
  github().intercept({path:'/repos/'+REPO+'/pulls?state=open&sort=updated&per_page=8',method:'GET'}).reply(200,[
   {number:5,title:'PR verte',draft:false,head:{sha,ref:'claude/a'},updated_at:'2026-11-10T10:00:00Z'},
   {number:6,title:'PR rouge',draft:false,head:{sha:shaFail,ref:'claude/b'},updated_at:'2026-11-10T11:00:00Z'}]).persist();
  github().intercept({path:'/repos/'+REPO+'/commits/'+SHA2+'/check-runs?per_page=30',method:'GET'}).reply(200,{check_runs:[]}).persist();
  github().intercept({path:'/repos/'+REPO+'/commits/'+sha+'/check-runs?per_page=30',method:'GET'}).reply(200,{check_runs:[{name:'check',status:'completed',conclusion:'success'}]}).persist();
  github().intercept({path:'/repos/'+REPO+'/commits/'+shaFail+'/check-runs?per_page=30',method:'GET'}).reply(200,{check_runs:[{name:'check',status:'completed',conclusion:'failure'}]}).persist();
  github().intercept({path:'/repos/'+REPO+'/branches/trunk',method:'GET'}).reply(200,{commit:{sha:SHA2,commit:{committer:{date:'2026-11-10T09:00:00Z'},message:'Titre du commit\nsuite'}}}).times(1);
  github().intercept({path:'/repos/'+REPO,method:'GET'}).reply(200,{full_name:REPO,default_branch:'trunk'}).times(1);
  const g=await json('/spaces/'+recettes+'/github');expect(g.status).toBe(200);
  const repo=g.body.repositories[0];
  expect(repo).toMatchObject({available:true,default_branch:'trunk'});expect(repo.head).toMatchObject({sha:SHA2,message:'Titre du commit',url:'https://github.com/'+REPO+'/commit/'+SHA2});
  expect(repo.head_ci.state).toBe('unknown');                              // aucun contrôle reçu : jamais « réussi »
  const green=repo.prs.find((p:any)=>p.number===5),red=repo.prs.find((p:any)=>p.number===6);
  expect(green.ci.state).toBe('success');expect(green.url).toBe('https://github.com/'+REPO+'/pull/5');expect(red.ci.state).toBe('failure');expect(red.next_action.code).toBe('fix');
  expect(g.body.next_action.code).toBe('ci_failed');
  expect((await json('/spaces/'+recettes+'/github','GET',undefined,b)).status).toBe(404);
  // Dépôt devenu inaccessible : indisponible, avec la raison, sans fausse réussite.
  github().intercept({path:'/repos/'+REPO,method:'GET'}).reply(403,{message:'rate limited'}).times(1);
  const down=await json('/spaces/'+recettes+'/github');expect(down.body.repositories[0].available).toBe(false);expect(down.body.repositories[0].reason).toContain('403');expect(down.body.repositories[0].prs).toBeUndefined();
 });
});

describe('poste de pilotage : accueil, boîte de Martin, questions, discussions, mémoire, prompts, export, audit de référence',()=>{
 const MEM='martinznt/Memoire-Projets',CODE='martinznt/Sport-Test',C1='a1'.repeat(20),T1='b1'.repeat(20),C2='a2'.repeat(20),T2='b2'.repeat(20);
 const B=(n:number)=>String(n).padStart(2,'0').repeat(20);
 const github=()=>mockNetwork.get('https://api.github.com');
 const b64=(s:string)=>Buffer.from(s,'utf8').toString('base64');
 const raw=(path:string,cookie=a)=>mf.dispatchFetch(`${origin}/api${path}`,{headers:{Origin:origin,Cookie:cookie}});
 let pA:string,pB:string,bobProject:string,conn:string,conv1:string,conv2:string,msg:string;
 it('prépare deux projets d’Alice et un projet de Bob',async()=>{
  pA=(await json('/projects','POST',{name:'Pilotage A'})).body.id;pB=(await json('/projects','POST',{name:'Pilotage B'})).body.id;
  bobProject=(await json('/projects','POST',{name:'Projet de Bob'},b)).body.id;
  conn=(await json('/connections','POST',{provider:'github',label:'GitHub mémoire',secret:'exemple-jeton-factice-2026',scopes:['read']})).body.id;
  conv1=(await json('/conversations','POST',{project_id:pA,title:'Vision du produit'})).body.id;conv2=(await json('/conversations','POST',{project_id:pA,title:'Bugs du planning'})).body.id;
  const note=await json('/conversations/'+conv1+'/notes','POST',{content:'Martin veut un mode cuisine en pages. Décision : garder les quantités visibles.'});expect(note.status).toBe(201);msg=note.body.id;
 });
 it('À faire par Martin : action bloquante en tête, preuve exigée, isolation des comptes et des projets',async()=>{
  expect((await json('/workbench/actions','POST',{project_id:bobProject,title:'x'})).status).toBe(404);
  const t=(await json('/spaces/'+pB+'/tasks','POST',{title:'Tâche de B'})).body;
  expect((await json('/workbench/actions','POST',{project_id:pA,title:'x',task_id:t.id})).status).toBe(400);
  const act=await json('/workbench/actions','POST',{project_id:pA,title:'Tester sur le téléphone',why:'Seul Martin a l’appareil',expected:'Ouvrir le site et noter le résultat',kind:'test',blocking:true});
  expect(act.status).toBe(201);
  const home=await json('/workbench/home');expect(home.status).toBe(200);
  const card=home.body.projects.find((p:any)=>p.id===pA);
  expect(card.next_action.code).toBe('do_martin_action');expect(card.counts.blocking_actions).toBe(1);expect(home.body.inbox.actions).toBeGreaterThanOrEqual(1);
  expect(home.body.projects.some((p:any)=>p.id===bobProject)).toBe(false);
  expect((await json('/workbench/actions/'+act.body.id,'PATCH',{status:'done',revision:1})).status).toBe(400);            // ni réponse ni preuve
  expect((await json('/workbench/actions/'+act.body.id,'PATCH',{status:'done',proof:'x',revision:1},b)).status).toBe(404);
  const done=await json('/workbench/actions/'+act.body.id,'PATCH',{status:'done',proof:'Testé le 12/11, page correcte',revision:1});
  expect(done.status).toBe(200);expect(done.body.done_at).toBeTruthy();
  expect((await json('/workbench/actions/'+act.body.id,'PATCH',{title:'y',revision:1})).status).toBe(409);               // révision périmée
  expect((await json('/workbench/actions?project='+pA)).body.items).toHaveLength(0);
  expect((await json('/workbench/actions?project='+pA+'&status=all')).body.items).toHaveLength(1);
  expect((await json('/workbench/actions?project='+pB)).body.items).toHaveLength(0);
 });
 it('Questions d’Atelier : une question déjà posée ou répondue n’est jamais reposée ; réponse conservée ; décision validée seulement par Martin',async()=>{
  const q=await json('/workbench/questions','POST',{project_id:pA,theme:'UX',question:'Quel format pour les fiches ?',reason:'Change l’écran de saisie',options:[{label:'Cartes',tradeoff:'plus visuel',recommended:true},{label:'Liste',tradeoff:'plus dense'}],priority:1});
  expect(q.status).toBe(201);
  const dup=await json('/workbench/questions','POST',{project_id:pA,question:'  quel FORMAT, pour les fiches'});
  expect(dup.status).toBe(409);expect(dup.body.existing.id).toBe(q.body.id);
  expect((await json('/workbench/questions','POST',{project_id:pB,question:'Quel format pour les fiches ?'})).status).toBe(201);   // autre projet : autre périmètre
  expect((await json('/workbench/home')).body.projects.find((p:any)=>p.id===pA).next_action.code).toBe('answer_question');
  expect((await json('/workbench/questions/'+q.body.id+'/answer','POST',{selected:[0,1]})).status).toBe(400);              // choix unique
  expect((await json('/workbench/questions/'+q.body.id+'/answer','POST',{})).status).toBe(400);
  expect((await json('/workbench/questions/'+q.body.id+'/answer','POST',{selected:[0]},b)).status).toBe(404);
  const ans=await json('/workbench/questions/'+q.body.id+'/answer','POST',{selected:[0],text:'avec photo',create_decision:true});
  expect(ans.status).toBe(200);expect(ans.body).toMatchObject({status:'answered',answer_text:'Cartes ; avec photo'});expect(ans.body.decision_id).toBeTruthy();
  const decisions=(await json('/spaces/'+pA+'/decisions')).body.items;expect(decisions.find((d:any)=>d.id===ans.body.decision_id).status).toBe('validated');
  const again=await json('/workbench/questions','POST',{project_id:pA,question:'Quel format pour les fiches ?'});
  expect(again.status).toBe(409);expect(again.body.error).toContain('déjà reçu une réponse');expect(again.body.existing.answer_text).toBe('Cartes ; avec photo');
  // Questionnaire rempli hors ligne : réponses groupées, erreurs par question.
  const q2=(await json('/workbench/questions','POST',{project_id:pA,question:'Faut-il un thème clair ?',allow_unknown:true})).body;
  const bulk=await json('/workbench/questions/answers','POST',{answers:[{id:q2.id,unknown:true},{id:crypto.randomUUID(),text:'x'}]});
  expect(bulk.body.answered).toBe(1);expect(bulk.body.errors).toHaveLength(1);
  const exp=await json('/workbench/questions/export');expect(exp.body.questions.length).toBeGreaterThanOrEqual(3);
  const csv=await (await raw('/workbench/questions/export?format=csv')).text();expect(csv).toContain('Quel format pour les fiches ?');expect(csv).toContain('Je ne sais pas');
  expect((await json('/workbench/questions/export','GET',undefined,b)).body.questions).toHaveLength(0);
 });
 it('discussions : catégorie et statut sans toucher aux messages, recherche qui ouvre le message exact, liens, reprise d’extrait, extraction candidate',async()=>{
  const upd=await json('/workbench/conversations/'+conv1,'PATCH',{category:'Vision',status:'to_resume',objective:'Cadrer le mode cuisine',pinned:true});
  expect(upd.status).toBe(200);expect(upd.body).toMatchObject({category:'Vision',status:'to_resume',pinned:1});
  expect((await json('/workbench/conversations/'+conv1,'PATCH',{status:'archived'},b)).status).toBe(404);
  const list=await json('/workbench/conversations?project='+pA+'&status=to_resume');expect(list.body.items.map((x:any)=>x.id)).toEqual([conv1]);expect(list.body.items[0].message_count).toBe(1);
  await json('/workbench/conversations/'+conv1,'PATCH',{status:'archived'});
  expect((await json('/conversations/'+conv1+'/messages')).body.items).toHaveLength(1);                                      // archivée : messages intacts
  const found=await json('/workbench/search?project='+pA+'&q=mode cuisine');
  expect(found.body.items).toHaveLength(1);expect(found.body.items[0]).toMatchObject({id:msg,conversation_id:conv1,project_id:pA});expect(found.body.items[0].excerpt).toContain('mode cuisine');
  expect((await json('/workbench/search?project='+pB+'&q=mode cuisine')).body.items).toHaveLength(0);                         // limité au projet courant
  expect((await json('/workbench/search?project='+pA+'&q=mode cuisine','GET',undefined,b)).status).toBe(404);
  expect((await json('/workbench/search?project='+pA+'&q=100%25')).body.items).toHaveLength(0);                               // % n'est pas un joker
  // Liens entre discussions : même projet seulement, sans fusion.
  const other=(await json('/conversations','POST',{project_id:pB,title:'Autre projet'})).body.id;
  expect((await json('/workbench/conversations/'+conv1+'/links','POST',{to_id:other})).status).toBe(400);
  expect((await json('/workbench/conversations/'+conv1+'/links','POST',{to_id:conv2,note:'même sujet'})).status).toBe(201);
  expect((await json('/workbench/conversations/'+conv2+'/links','POST',{to_id:conv1})).status).toBe(409);
  // Réutiliser un extrait : passage exact, citation datée dans la cible, original inchangé.
  expect((await json('/workbench/messages/'+msg+'/reuse','POST',{target_conversation_id:conv2,excerpt:'phrase inventée'})).status).toBe(400);
  expect((await json('/workbench/messages/'+msg+'/reuse','POST',{target_conversation_id:other,excerpt:'mode cuisine'})).status).toBe(400);
  const reuse=await json('/workbench/messages/'+msg+'/reuse','POST',{target_conversation_id:conv2,excerpt:'garder les quantités visibles'});expect(reuse.status).toBe(201);
  const target=(await json('/conversations/'+conv2+'/messages')).body.items;expect(target).toHaveLength(1);expect(target[0].role).toBe('note');expect(target[0].content).toContain('> garder les quantités visibles');expect(target[0].content).toContain(msg);
  expect((await json('/conversations/'+conv1+'/messages')).body.items[0].content).toBe('Martin veut un mode cuisine en pages. Décision : garder les quantités visibles.');
  // Extraction : une décision issue d'un message reste « proposée ».
  const ex=await json('/workbench/messages/'+msg+'/extract','POST',{kind:'decision',title:'Garder les quantités visibles',excerpt:'garder les quantités visibles'});
  expect(ex.status).toBe(201);expect(ex.body.status).toBe('proposed');
  expect((await json('/spaces/'+pA+'/decisions')).body.items.find((d:any)=>d.id===ex.body.id).status).toBe('proposed');
  expect((await json('/workbench/messages/'+msg+'/extract','POST',{kind:'decision',title:'x y z',excerpt:'mode cuisine'},b)).status).toBe(404);
  const links=await json('/workbench/conversations/'+conv1+'/links');
  expect(links.body.links[0]).toMatchObject({other_id:conv2,other_title:'Bugs du planning'});expect(links.body.objects.map((o:any)=>o.target_kind).sort()).toEqual(['conversation','decision']);
  const prov=await json('/workbench/links?project='+pA+'&target_kind=decision&target_id='+ex.body.id);expect(prov.body.items[0]).toMatchObject({source_kind:'message',source_id:msg,excerpt:'garder les quantités visibles'});
  // Lien manuel refusé si la cible est d'un autre projet.
  const tB=(await json('/spaces/'+pB+'/tasks','POST',{title:'Cible B'})).body.id;
  expect((await json('/workbench/links','POST',{project_id:pA,source_kind:'message',source_id:msg,target_kind:'plan_task',target_id:tB})).status).toBe(400);
 });
 it('référentiel mémoire : lecture seule, commit épinglé, cache par blob, périmé signalé, jamais confondu avec un dépôt de code',async()=>{
  const fiche='# PROMPT-CLAUDECODE-0009 — Test\n\n---\nid: PROMPT-CLAUDECODE-0009\ntitle: Mission de test\nrecipient: Claude Code\nprovider: Anthropic\nmodel: À choisir\nsent_at:\nstatus: À donner — pas encore envoyé\nversion: 1\n---\n\n# 1. Mission\nTexte exact du prompt.\n';
  github().intercept({path:'/repos/'+MEM,method:'GET'}).reply(200,{full_name:MEM,default_branch:'main',private:true}).persist();
  github().intercept({path:'/repos/'+MEM+'/branches/main',method:'GET'}).reply(200,{commit:{sha:C1,commit:{tree:{sha:T1},committer:{date:'2026-11-11T17:45:23Z'}}}}).times(2);
  github().intercept({path:'/repos/'+MEM+'/git/trees/'+T1+'?recursive=1',method:'GET'}).reply(200,{truncated:false,tree:[
   {path:'00_PILOTAGE',type:'tree',sha:B(1)},{path:'00_PILOTAGE/ETAT_GLOBAL.md',type:'blob',sha:B(2),size:40},
   {path:'04_PROMPTS/01_A_DONNER/PROMPT-CLAUDECODE-0009.md',type:'blob',sha:B(3),size:fiche.length},{path:'01_SPORT/CAHIER_DES_CHARGES.md',type:'blob',sha:B(4),size:30},{path:'image.png',type:'blob',sha:B(5),size:10}]}).times(1);
  github().intercept({path:'/repos/'+MEM+'/git/blobs/'+B(2),method:'GET'}).reply(200,{encoding:'base64',content:b64('État global : Atelier d’abord.')}).times(1);
  github().intercept({path:'/repos/'+MEM+'/git/blobs/'+B(3),method:'GET'}).reply(200,{encoding:'base64',content:b64(fiche)}).times(1);
  expect((await json('/memory-repo','POST',{connection_id:conn,full_name:MEM},b)).status).toBe(404);                         // connexion d'Alice
  const link=await json('/memory-repo','POST',{connection_id:conn,full_name:MEM});expect(link.status).toBe(201);expect(link.body).toMatchObject({branch:'main',status:'never',stale:true});
  const repoId=link.body.id;
  expect((await json('/memory-repo','POST',{connection_id:conn,full_name:MEM})).status).toBe(409);
  // Ce dépôt ne peut pas devenir le dépôt de code d'un projet.
  expect((await json('/spaces/'+pA+'/repository','POST',{connection_id:conn,full_name:MEM})).status).toBe(409);
  const sync=await json('/memory-repo/'+repoId+'/sync','POST',{});
  if(sync.status!==200)console.log('SYNC',JSON.stringify(sync.body));
  expect(sync.status).toBe(200);expect(sync.body).toMatchObject({commit_sha:C1,status:'ok',file_count:4,truncated:false,stale:false});
  expect((await json('/memory-repo/'+repoId+'/sync','POST',{},b)).status).toBe(404);
  const docs=await json('/memory-repo/'+repoId+'/docs?type=prompt');expect(docs.body.items).toHaveLength(1);expect(docs.body.items[0]).toMatchObject({doc_ref:'PROMPT-CLAUDECODE-0009',content_state:'none',indexed_commit:C1});
  expect((await json('/memory-repo/'+repoId+'/docs?project=sport')).body.items.map((d:any)=>d.path)).toEqual(['01_SPORT/CAHIER_DES_CHARGES.md']);
  const etat=(await json('/memory-repo/'+repoId+'/docs?q=ETAT')).body.items[0];
  const doc=await json('/memory-repo/docs/'+etat.id);
  expect(doc.body).toMatchObject({content:'État global : Atelier d’abord.',content_state:'fresh',commit:C1,blob_sha:B(2),path:'00_PILOTAGE/ETAT_GLOBAL.md'});expect(doc.body.url).toContain('/blob/'+C1+'/00_PILOTAGE/ETAT_GLOBAL.md');
  expect((await json('/memory-repo/docs/'+etat.id)).body.content_state).toBe('fresh');                                       // second appel : cache, aucun appel réseau
  expect((await json('/memory-repo/docs/'+etat.id,'GET',undefined,b)).status).toBe(404);
  expect((await json('/memory-repo/'+repoId+'/docs?q=Atelier d’abord&content=1')).body.items[0].excerpt).toContain('Atelier d’abord');
  const img=(await json('/memory-repo/'+repoId+'/docs?q=image')).body.items[0];expect((await json('/memory-repo/docs/'+img.id)).body).toMatchObject({content:null,content_state:'none'});
  // Import d'une fiche de prompt : champs lus dans la fiche ; sans date d'envoi, jamais « Déjà donné ».
  const promptDoc=docs.body.items[0];
  const imp=await json('/prompts/import-memory','POST',{memory_doc_id:promptDoc.id,project_id:pA});
  expect(imp.status).toBe(201);expect(imp.body).toMatchObject({code:'PROMPT-CLAUDECODE-0009',status:'to_give',recipient:'Claude Code',model:'À choisir'});expect(imp.body.source_note).toContain(C1.slice(0,8));
  expect((await json('/prompts/import-memory','POST',{memory_doc_id:promptDoc.id})).status).toBe(409);
  const full=await json('/prompts/'+imp.body.id);expect(full.body.versions[0].body).toBe('# PROMPT-CLAUDECODE-0009 — Test\n\n# 1. Mission\nTexte exact du prompt.');expect(full.body.versions[0].locked).toBe(false);
  // Nouveau commit : le fichier change, l'ancien cache est signalé périmé ; un fichier supprimé disparaît de l'index.
  await (await mf.getD1Database('DB')).prepare('UPDATE memory_repos SET last_attempt_at=NULL WHERE id=?').bind(repoId).run();
  github().intercept({path:'/repos/'+MEM+'/branches/main',method:'GET'}).reply(200,{commit:{sha:C2,commit:{tree:{sha:T2},committer:{date:'2026-11-12T08:00:00Z'}}}}).times(1);
  github().intercept({path:'/repos/'+MEM+'/git/trees/'+T2+'?recursive=1',method:'GET'}).reply(200,{truncated:true,tree:[{path:'00_PILOTAGE/ETAT_GLOBAL.md',type:'blob',sha:B(6),size:50}]}).times(1);
  const sync2=await json('/memory-repo/'+repoId+'/sync','POST',{});
  expect(sync2.body).toMatchObject({commit_sha:C2,status:'partial',truncated:true});expect(sync2.body.last_error).toContain('tronqué');
  expect((await json('/memory-repo/'+repoId+'/docs?q=ETAT')).body.items[0]).toMatchObject({content_state:'stale',blob_sha:B(6),indexed_commit:C2});
  expect((await json('/memory-repo/'+repoId+'/docs?type=prompt')).body.items).toHaveLength(1);                                // arbre tronqué : rien n'est déclaré supprimé
  github().intercept({path:'/repos/'+MEM+'/git/blobs/'+B(6),method:'GET'}).reply(503,{message:'down'}).times(1);
  const stale=await json('/memory-repo/docs/'+etat.id);expect(stale.body.content_state).toBe('stale');expect(stale.body.notice).toContain('périmé');
  expect((await json('/workbench/home')).body.alerts.join(' ')).toContain('synchronisation partielle');
  // Document de référence de projet : pointe vers le référentiel, la bibliothèque ou une adresse ; jamais vers le fichier d'un autre projet.
  const d1=await json('/workbench/documents','POST',{project_id:pA,title:'État global',doc_type:'reference',source_kind:'memory_doc',memory_doc_id:etat.id,reliability:'verified'});
  expect(d1.status).toBe(201);expect(d1.body).toMatchObject({memory_path:'00_PILOTAGE/ETAT_GLOBAL.md',memory_commit:C2,memory_repo:MEM});
  const fB=(await json('/files/text','POST',{project_id:pB,name:'b.md',content:'B'})).body.file_id;
  expect((await json('/workbench/documents','POST',{project_id:pA,title:'x',source_kind:'file',file_id:fB})).status).toBe(400);
  expect((await json('/workbench/documents','POST',{project_id:pA,title:'x',source_kind:'url',url:'http://non-securise'})).status).toBe(400);
  expect((await json('/workbench/documents?project='+pA)).body.items).toHaveLength(1);expect((await json('/workbench/documents?project='+pB)).body.items).toHaveLength(0);
  expect((await json('/workbench/documents?project='+pA,'GET',undefined,b)).status).toBe(404);
 });
 it('prompts : copie exacte, version transmise immuable, date réelle exigée, réponse rattachée, secret refusé',async()=>{
  expect((await json('/prompts','POST',{title:'Secret',body:'clé : ghp_'+'a'.repeat(30)})).status).toBe(400);
  const p=await json('/prompts','POST',{project_id:pA,title:'Finaliser le planning',prefix:'PROMPT-CLAUDECODE',recipient:'Claude Code',provider:'Anthropic',product:'Claude Code',body:'Ligne 1\n\n  Ligne 2 avec espaces  \n',commands:[{label:'Quota',command:'/usage',where_when:'au début de la session'}]});
  expect(p.status).toBe(201);expect(p.body.code).toBe('PROMPT-CLAUDECODE-0010');expect(p.body.status).toBe('to_prepare');const id=p.body.id;
  const txt=await raw('/prompts/'+id+'/export?format=txt');expect(await txt.text()).toBe('Ligne 1\n\n  Ligne 2 avec espaces  \n\n');
  const md=await (await raw('/prompts/'+id+'/export?format=md')).text();expect(md).toContain('model: inconnu');expect(md).toContain('sent_at: \n');expect(md).toContain('`/usage`');expect(md).toContain('Ligne 1\n\n  Ligne 2 avec espaces  \n');
  expect((await raw('/prompts/'+id+'/export?format=txt',b)).status).toBe(404);
  expect((await json('/prompts/'+id,'PATCH',{status:'given',revision:1})).status).toBe(409);                                 // « Déjà donné » sans confirmation
  expect((await json('/prompts/'+id+'/responses','POST',{response:'ok'})).status).toBe(409);                                 // pas de réponse à un prompt non transmis
  expect((await json('/prompts/'+id+'/body','PUT',{body:'Version corrigée'})).body).toMatchObject({version:1,new_version:false});
  expect((await json('/prompts/'+id+'/sent','POST',{confirm:true,sent_at:'2999-01-01'})).status).toBe(400);                  // date future
  expect((await json('/prompts/'+id+'/sent','POST',{sent_at:'2026-11-12'})).status).toBe(400);                               // sans confirmation
  const sent=await json('/prompts/'+id+'/sent','POST',{confirm:true,sent_at:'2026-11-12',recipient:'Claude Code'});expect(sent.body.status).toBe('given');
  expect((await json('/prompts/'+id+'/sent','POST',{confirm:true,sent_at:'2026-11-12'})).status).toBe(409);
  const v2=await json('/prompts/'+id+'/body','PUT',{body:'Version 2 après retour'});expect(v2.status).toBe(201);expect(v2.body).toMatchObject({version:2,new_version:true});
  const full=await json('/prompts/'+id);
  expect(full.body.versions.map((v:any)=>[v.version,v.locked,v.body,v.sent_at])).toEqual([[2,false,'Version 2 après retour',null],[1,true,'Version corrigée','2026-11-12']]);
  expect(full.body.status).toBe('to_give');
  expect(await (await raw('/prompts/'+id+'/export?format=txt&version=1')).text()).toBe('Version corrigée\n');                // l'ancienne version reste lisible telle quelle
  await json('/prompts/'+id+'/sent','POST',{confirm:true,sent_at:'2026-11-12T10:00:00Z'});
  const resp=await json('/prompts/'+id+'/responses','POST',{response:'PR ouverte, tests verts.',url:'https://github.com/o/r/pull/3'});expect(resp.status).toBe(201);
  expect((await json('/prompts/'+id)).body).toMatchObject({status:'response_received'});
  expect((await json('/prompts?project='+pB)).body.items).toHaveLength(0);expect((await json('/prompts','GET',undefined,b)).body.items).toHaveLength(0);
  // Depuis une tâche : références exactes ; une décision non validée ne peut pas être citée comme règle.
  const task=(await json('/spaces/'+pA+'/tasks','POST',{title:'Corriger le planning',objective:'Corriger',acceptance:'Test vert',owner:'claude_code'})).body;
  await json('/workbench/tasks/'+task.id+'/details','PATCH',{files_hint:'public/js/planner.js',tests:'npm test'});
  const proposed=(await json('/spaces/'+pA+'/decisions')).body.items.find((d:any)=>d.status==='proposed');
  expect((await json('/prompts/from-task','POST',{task_id:task.id,decision_ids:[proposed.id]})).status).toBe(400);
  const fromTask=await json('/prompts/from-task','POST',{task_id:task.id});expect(fromTask.status).toBe(201);
  const body=(await json('/prompts/'+fromTask.body.id)).body.versions[0].body;
  for(const s of ['Corriger le planning','public/js/planner.js','Test vert','npm test','Aucun dépôt associé'])expect(body).toContain(s);
  expect((await json('/prompts/from-task','POST',{task_id:task.id},b)).status).toBe(404);
  // Validation réelle par Martin : seulement une tâche terminée avec preuve.
  expect((await json('/workbench/tasks/'+task.id+'/validate','POST',{validated:true})).status).toBe(409);
  await json('/spaces/'+pA+'/tasks/'+task.id,'PATCH',{status:'done',proof:'CI verte',revision:1});
  expect((await json('/workbench/tasks/'+task.id+'/validate','POST',{validated:true})).body.validated_at).toBeTruthy();
  const prog=(await json('/workbench/home')).body.projects.find((p:any)=>p.id===pA).progress;expect(prog.validated).toBe(1);expect(prog.formula).toContain('preuve');
 });
 it('export ChatGPT : inventaire repris par empreinte, lots stables, deux analyses avant croisement, couverture honnête',async()=>{
  const sha='c'.repeat(64);
  const batch=await json('/exports','POST',{provider:'ChatGPT',filename:'export.zip',size:1234,sha256:sha,declared_total:3});expect(batch.status).toBe(201);const id=batch.body.id;
  expect((await json('/exports','POST',{provider:'ChatGPT',filename:'copie.zip',size:1234,sha256:sha,declared_total:3})).body).toMatchObject({id,resumed:true});
  const row=(s:string,n:number,o:any={})=>({source_id:s,title:'Conv '+s,created_time:'2026-10-0'+n+'T10:00:00.000Z',updated_time:null,message_count:10*n,node_count:12*n,branch_count:n-1,attachment_refs:0,non_text_parts:0,parse_status:'complete',parse_note:'',...o});
  expect((await json('/exports/'+id+'/conversations','POST',{rows:[row('c1',1),row('c2',2,{attachment_refs:2,parse_status:'partial',parse_note:'2 pièces jointes référencées'})]})).body).toMatchObject({inventoried:2,declared:3});
  expect((await json('/exports/'+id+'/conversations','POST',{rows:[row('c1',1)]},b)).status).toBe(404);
  let cov=(await json('/exports/'+id+'/coverage')).body.coverage;
  expect(cov.complete).toBe(false);expect(cov.conversations).toMatchObject({declared:3,inventoried:2,missing_from_inventory:1,partial:1});expect(cov.attachments).toMatchObject({referenced:2,accessible:0});
  const list=(await json('/exports/'+id+'/conversations')).body.items;
  expect((await json('/exports/'+id+'/conversations','PATCH',{ids:[list[0].id],ignore:true})).status).toBe(400);            // pas d'exclusion sans raison
  expect((await json('/exports/'+id+'/conversations','PATCH',{ids:[list[0].id],project_id:bobProject})).status).toBe(404);
  await json('/exports/'+id+'/conversations','PATCH',{ids:[list[0].id],project_id:pA});
  expect((await json('/exports/'+id+'/conversations')).body.items[0]).toMatchObject({project_id:pA,project_confirmed:0});    // candidat, pas confirmé
  await json('/exports/'+id+'/conversations','PATCH',{ids:[list[0].id],project_confirmed:true});
  expect((await json('/exports/'+id+'/lots','POST',{max_messages:50})).body.lots).toBe(1);
  expect((await json('/exports/'+id+'/analyses','POST',{lot:'LOT-999',kind:'independent',assistant:'ChatGPT',report:'x'})).status).toBe(400);
  expect((await json('/exports/'+id+'/analyses','POST',{lot:'LOT-001',kind:'cross',assistant:'Claude',report:'x'})).status).toBe(409);
  for(const assistant of ['ChatGPT','Claude'])expect((await json('/exports/'+id+'/analyses','POST',{lot:'LOT-001',kind:'independent',assistant,report:'Rapport de '+assistant})).status).toBe(201);
  expect((await json('/exports/'+id+'/analyses','POST',{lot:'LOT-001',kind:'cross',assistant:'Mistral',report:'Croisement'})).status).toBe(201);
  cov=(await json('/exports/'+id+'/refresh-imports','POST',{})).body;
  expect(cov.imports).toMatchObject({imported:0,not_imported:2});expect(cov.lots).toMatchObject({total:1,with_two_independent:1,with_cross:1});expect(cov.projects).toMatchObject({assigned:1,confirmed:1,unassigned:1});
  expect((await json('/exports','GET',undefined,b)).body.items).toHaveLength(0);
 });
 it('audit de référence : manifeste au commit figé, statuts par fichier, reprise des blobs inchangés, jamais « intégral » sans preuve',async()=>{
  github().intercept({path:'/repos/'+CODE,method:'GET'}).reply(200,{full_name:CODE,default_branch:'main',permissions:{pull:true,push:false}}).times(1);
  github().intercept({path:'/repos/'+CODE+'/branches/main',method:'GET'}).reply(200,{commit:{sha:C1,commit:{tree:{sha:T1}}}}).times(3);
  github().intercept({path:'/repos/'+CODE+'/git/trees/'+T1+'?recursive=1',method:'GET'}).reply(200,{truncated:false,tree:[{path:'src/app.ts',type:'blob',sha:B(11),size:30},{path:'tests/app.test.ts',type:'blob',sha:B(12),size:20},{path:'README.md',type:'blob',sha:B(13),size:10},{path:'logo.png',type:'blob',sha:B(14),size:99}]}).times(1);
  const repos=await json('/spaces/'+pA+'/repository','POST',{connection_id:conn,full_name:CODE});expect(repos.status).toBe(201);const repoId=repos.body.repositories[0].id;
  expect((await json('/ref-audits','POST',{project_id:pB,repository_id:repoId})).status).toBe(404);                           // dépôt d'un autre projet
  const audit=await json('/ref-audits','POST',{project_id:pA,repository_id:repoId});
  if(audit.status!==201)console.log('AUDIT',JSON.stringify(audit.body));
  expect(audit.status).toBe(201);expect(audit.body).toMatchObject({commit_sha:C1,file_count:4,truncated:false});expect(audit.body.coverage).toMatchObject({total:4,integral:false,not_covered:4});const id=audit.body.id;
  for(const s of [B(11),B(12),B(13)])github().intercept({path:'/repos/'+CODE+'/git/blobs/'+s,method:'GET'}).reply(200,{encoding:'base64',content:b64('ligne 1\nligne 2 // TODO\n')}).times(1);
  const an=await json('/ref-audits/'+id+'/analyse','POST',{});expect(an.body).toMatchObject({analysed:4,failed:0,remaining:0});
  let full=(await json('/ref-audits/'+id)).body;
  expect(full.files.find((f:any)=>f.path==='src/app.ts')).toMatchObject({kind:'code',read_status:'tool',lines:3});expect(full.files.find((f:any)=>f.path==='logo.png').read_status).toBe('metadata');
  expect(full.coverage.integral).toBe(false);expect(full.coverage.statement).toContain('partiel');                            // analysé par outil ≠ lu
  expect((await json('/ref-audits/'+id+'/files','PATCH',{paths:['logo.png'],read_status:'excluded'})).status).toBe(400);     // exclusion sans motif
  await json('/ref-audits/'+id+'/files','PATCH',{paths:['src/app.ts'],read_status:'full',note:'Relu en entier'});
  await json('/ref-audits/'+id+'/files','PATCH',{paths:['logo.png'],read_status:'excluded',note:'Image'});
  full=(await json('/ref-audits/'+id)).body;expect(full.coverage.integral).toBe(true);expect(full.coverage.code).toMatchObject({total:1,full:1});
  expect((await json('/ref-audits/'+id+'/findings','POST',{title:'Chemin inconnu',path:'absent.ts'})).status).toBe(400);
  expect((await json('/ref-audits/'+id+'/findings','POST',{title:'Validation manquante',severity:'P1',confidence:'medium',path:'src/app.ts',reproduction:'Appeler sans jeton'})).status).toBe(201);
  const report=await (await raw('/ref-audits/'+id+'/report')).text();
  for(const s of [C1,'truncated=false','État : intégral','[P1] Validation manquante','| src/app.ts | code | Lu intégralement |'])expect(report).toContain(s);
  expect((await json('/ref-audits/'+id,'GET',undefined,b)).status).toBe(404);expect((await raw('/ref-audits/'+id+'/report',b)).status).toBe(404);
  expect((await json('/ref-audits','POST',{project_id:pA,repository_id:repoId})).body).toMatchObject({id,resumed:true});      // même commit : même audit
  // Nouveau commit : un fichier change, les autres gardent leur statut (blob identique).
  github().intercept({path:'/repos/'+CODE+'/branches/main',method:'GET'}).reply(200,{commit:{sha:C2,commit:{tree:{sha:T2}}}}).times(1);
  github().intercept({path:'/repos/'+CODE+'/git/trees/'+T2+'?recursive=1',method:'GET'}).reply(200,{truncated:true,tree:[{path:'src/app.ts',type:'blob',sha:B(15),size:35},{path:'README.md',type:'blob',sha:B(13),size:10}]}).times(1);
  const second=await json('/ref-audits','POST',{project_id:pA,repository_id:repoId});
  expect(second.status).toBe(201);expect(second.body).toMatchObject({commit_sha:C2,reused:1,truncated:true});expect(second.body.warning).toContain('tronqué');
  const f2=(await json('/ref-audits/'+second.body.id)).body.files;
  expect(f2.find((f:any)=>f.path==='README.md')).toMatchObject({read_status:'tool',reused_from:id});expect(f2.find((f:any)=>f.path==='src/app.ts').read_status).toBe('not_started');
  expect(await (await raw('/ref-audits/'+second.body.id+'/report')).text()).toContain('État : partiel');
 });
 it('synthèse de reprise, journal par projet et export du compte',async()=>{
  const resume=await json('/workbench/resume?project='+pA);expect(resume.status).toBe(200);
  for(const s of ['# Reprise du projet — Pilotage A','Propositions non validées','Garder les quantités visibles','aucun résumé IA',CODE])expect(resume.body.text).toContain(s);
  expect(resume.body.text).not.toContain('Cible B');expect((await json('/workbench/resume?project='+pA,'GET',undefined,b)).status).toBe(404);
  const journal=await json('/workbench/journal?project='+pA);expect(journal.body.items.length).toBeGreaterThan(3);expect(journal.body.items.every((e:any)=>e.project_id===pA)).toBe(true);
  expect((await json('/workbench/journal?project='+pA,'GET',undefined,b)).status).toBe(404);
  const exported=await json('/account/export?metadata=true');expect(exported.status).toBe(200);
  for(const t of ['plan_tasks','project_decisions','handoff_packages','martin_actions','atelier_questions','prompts','prompt_versions','object_links','project_documents','memory_repos','memory_docs','export_batches','ref_audits','ref_audit_files'])expect(Array.isArray(exported.body[t])).toBe(true);
  expect(exported.body.prompt_versions.length).toBeGreaterThanOrEqual(3);expect(exported.body.memory_docs[0].content).toBeUndefined();
  expect(JSON.stringify(exported.body)).not.toContain('exemple-jeton-factice');
  const bob=await json('/account/export?metadata=true','GET',undefined,b);expect(bob.body.prompts).toHaveLength(0);expect(bob.body.martin_actions).toHaveLength(0);
 });
});

describe('pilotage Claude : conseil de modèle, relevés de quota, retours de travail, points de reprise',()=>{
 let p1:string,bobP:string,task:string;
 it('conseil : Sonnet par défaut, aucun modèle pour une vérification mécanique, dossier de la tâche pris en compte',async()=>{
  p1=(await json('/projects','POST',{name:'Quotas A'})).body.id;bobP=(await json('/projects','POST',{name:'Quotas Bob'},b)).body.id;
  const d=await json('/claude/advise','POST',{});expect(d.status).toBe(200);expect(d.body.model).toBe('sonnet');expect(d.body.effort).toBe('medium');expect(d.body.basis).toContain('pas une mesure');
  expect((await json('/claude/advise','POST',{kind:'mechanical_check'})).body.model).toBe('none');
  expect((await json('/claude/advise','POST',{kind:'inconnu'})).status).toBe(400);
  task=(await json('/spaces/'+p1+'/tasks','POST',{title:'Corriger la liste',objective:'La liste se trie par date',acceptance:'Tri vérifié par un test'})).body.id;
  expect((await json('/claude/tasks/'+task+'/advice','GET',undefined,b)).status).toBe(404);
  expect((await json('/claude/tasks/'+task+'/brief','PATCH',{complexity:'hard'},b)).status).toBe(404);
  expect((await json('/claude/tasks/'+task+'/brief','PATCH',{do_not_touch:'clé sk-ant-api03-'+'A'.repeat(40)})).status).toBe(400);
  const brief=await json('/claude/tasks/'+task+'/brief','PATCH',{work_kind:'fix',complexity:'simple',importance:'normal',constraints_text:'Migrations additives uniquement',do_not_touch:'server/worker.ts',already_verified:'tsc propre le 12/11',difficulties:'D1 local lent'});
  expect(brief.status).toBe(200);expect(brief.body.advice.model).toBe('sonnet');expect(brief.body.advice.effort).toBe('low');expect(brief.body.task.do_not_touch).toBe('server/worker.ts');
  await json('/workbench/tasks/'+task+'/details','PATCH',{files_hint:'web/List.tsx',tests:'npm test'});
  expect((await json('/claude/tasks/'+task+'/advice')).body.cost_risk).toBe('low');
 });
 it('relevés de quota : saisis seulement, source obligatoire, périmés signalés, alertes, isolation',async()=>{
  const empty=await json('/claude/quotas');expect(empty.status).toBe(200);expect(empty.body.latest).toHaveLength(0);expect(empty.body.triggered).toHaveLength(0);expect(empty.body.truth.measured).toContain('Rien n’est mesuré');
  expect((await json('/claude/quotas','POST',{scope:'session_5h',used_percent:null,source:'usage_screen'})).status).toBe(400);
  expect((await json('/claude/quotas','POST',{scope:'session_5h',used_percent:120,source:'usage_screen'})).status).toBe(400);
  expect((await json('/claude/quotas','POST',{scope:'weekly_model',used_percent:10,source:'usage_screen'})).status).toBe(400);
  expect((await json('/claude/quotas','POST',{scope:'session_5h',used_percent:10,source:'screenshot'})).status).toBe(400);
  expect((await json('/claude/quotas','POST',{scope:'session_5h',used_percent:10,source:'mesure_auto'})).status).toBe(400);
  const future=new Date(Date.now()+3600000).toISOString(),past=new Date(Date.now()-3600000).toISOString();
  expect((await json('/claude/quotas','POST',{scope:'session_5h',used_percent:10,source:'usage_screen',observed_at:new Date(Date.now()+86400000).toISOString()})).status).toBe(400);
  expect((await json('/claude/quotas','POST',{scope:'session_5h',used_percent:10,source:'usage_screen',evidence_name:'a.png',evidence_sha256:'a'.repeat(64)})).status).toBe(400);
  const r1=await json('/claude/quotas','POST',{scope:'session_5h',used_percent:86,resets_at:future,source:'screenshot',evidence_name:'usage-12-nov.png',evidence_sha256:'c'.repeat(64)});expect(r1.status).toBe(201);
  expect((await json('/claude/quotas','POST',{scope:'weekly_model',model_family:'opus',used_percent:95,resets_at:past,source:'declared',observed_at:new Date(Date.now()-7200000).toISOString()})).status).toBe(201);
  expect((await json('/claude/alerts','PUT',{alerts:[{scope:'session_5h',model_family:'all',threshold:80,enabled:true},{scope:'session_5h',model_family:'all',threshold:90,enabled:true}]})).status).toBe(400);
  expect((await json('/claude/alerts','PUT',{alerts:[{scope:'session_5h',model_family:'all',threshold:80,enabled:true},{scope:'weekly_model',model_family:'opus',threshold:50,enabled:true}]})).status).toBe(200);
  const q=await json('/claude/quotas');expect(q.body.latest).toHaveLength(2);
  expect(q.body.latest.find((x:any)=>x.scope==='session_5h').state).toBe('current');expect(q.body.latest.find((x:any)=>x.scope==='weekly_model').state).toBe('expired');
  expect(q.body.triggered).toHaveLength(1);expect(q.body.triggered[0].text).toContain('86 %');                                // le relevé périmé ne déclenche rien
  const imp=await json('/claude/quotas/import-statusline','POST',{json:JSON.stringify({model:{display_name:'Sonnet 5.5'},rate_limits:{five_hour:{used_percentage:12.3,resets_at:Math.floor(Date.now()/1000)+3000},seven_day:{used_percentage:40}}})});
  expect(imp.status).toBe(201);expect(imp.body.imported).toBe(2);
  expect((await json('/claude/quotas/import-statusline','POST',{json:'{"model":{}}'})).status).toBe(400);
  const q2=await json('/claude/quotas');const five=q2.body.latest.find((x:any)=>x.scope==='session_5h');expect(five.used_percent).toBe(12.3);expect(five.source).toBe('statusline_json');expect(q2.body.triggered).toHaveLength(0);
  expect(q2.body.latest.find((x:any)=>x.scope==='weekly').state).toBe('no_reset');
  expect((await json('/claude/quotas','GET',undefined,b)).body.latest).toHaveLength(0);
  expect((await json('/claude/quotas/'+r1.body.id,'DELETE',undefined,b)).status).toBe(404);expect((await json('/claude/quotas/'+r1.body.id,'DELETE')).status).toBe(200);
 });
 it('retour de travail : classement du texte, consommation seulement avec sa source, échec compté sur la tâche',async()=>{
  const parsed=await json('/claude/sessions/parse','POST',{text:'## Modifications effectuées\nTri corrigé\n## Tests réellement exécutés\nnpm test 62/62\n## Problèmes non résolus\naucun'});
  expect(parsed.body.found).toBe(3);expect(parsed.body.fields.tests_run).toBe('npm test 62/62');
  expect((await json('/claude/sessions','POST',{title:'x',model_family:'sonnet',project_id:bobP})).status).toBe(404);
  expect((await json('/claude/sessions','POST',{title:'x',model_family:'sonnet',cost_usd:2})).status).toBe(400);                 // consommation sans source
  expect((await json('/claude/sessions','POST',{title:'x',model_family:'sonnet',usage_source:'usage_screen'})).status).toBe(400); // source sans consommation
  expect((await json('/claude/sessions','POST',{title:'x',model_family:'gpt'})).status).toBe(400);
  const fail1=await json('/claude/sessions','POST',{project_id:p1,task_id:task,title:'Premier essai',model_family:'sonnet',effort:'low',outcome:'failed',results:'Le tri casse sur les dates vides',unresolved:'dates vides',tests_run:'npm test : 1 échec',files_modified:'web/List.tsx'});
  expect(fail1.status).toBe(201);
  const adv=await json('/claude/tasks/'+task+'/advice');expect(adv.body.warnings.join(' ')).toContain('sans analyse');
  const ok=await json('/claude/sessions','POST',{project_id:p1,title:'Audit',model_family:'opus',effort:'high',usage_source:'usage_screen',cost_usd:4.5,output_tokens:12000});expect(ok.status).toBe(201);
  const q=await json('/claude/quotas');expect(q.body.top).toHaveLength(1);expect(q.body.top[0].title).toBe('Audit');
  expect(q.body.by_model.find((m:any)=>m.model_family==='sonnet').with_usage).toBe(0);expect(q.body.by_model.find((m:any)=>m.model_family==='opus').cost_usd).toBe(4.5);
  expect((await json('/claude/sessions?project='+p1)).body.items).toHaveLength(2);expect((await json('/claude/sessions?project='+p1,'GET',undefined,b)).status).toBe(404);
  expect((await json('/claude/sessions','GET',undefined,b)).body.items).toHaveLength(0);
 });
 it('dossier de travail : la consigne reprend contraintes, interdits, travail précédent et modèle conseillé',async()=>{
  const pr=await json('/prompts/from-task','POST',{task_id:task});expect(pr.status).toBe(201);
  const body=pr.body.versions?.[0]?.body||pr.body.body||(await json('/prompts/'+pr.body.id)).body.versions?.[0]?.body||JSON.stringify((await json('/prompts/'+pr.body.id)).body);
  for(const s of ['Modèle et effort conseillés','Sonnet 5.5','Migrations additives uniquement','Fichiers à ne surtout pas modifier','server/worker.ts','Déjà vérifié (ne pas refaire)','Le tri casse sur les dates vides','ne pas refaire ces analyses','Ne pas relire tout le dépôt','Tests réellement exécutés'])expect(body).toContain(s);
 });
 it('points de reprise : brouillon depuis l’existant, texte complet, révision, isolation',async()=>{
  expect((await json('/claude/checkpoints/draft?project='+p1,'GET',undefined,b)).status).toBe(404);
  const draft=await json('/claude/checkpoints/draft?project='+p1+'&task='+task);expect(draft.status).toBe(200);
  expect(draft.body.objective).toBe('La liste se trie par date');expect(draft.body.errors).toBe('dates vides');expect(draft.body.tests).toBe('npm test : 1 échec');expect(draft.body.basis).toContain('Relisez-le');
  expect((await json('/claude/checkpoints','POST',{title:'x',project_id:bobP})).status).toBe(404);
  const cp=await json('/claude/checkpoints','POST',{project_id:p1,task_id:task,title:'Tri de la liste',objective:draft.body.objective,done:'',remaining:'gérer les dates vides',errors:draft.body.errors,tests:draft.body.tests,next_action:''});
  expect(cp.status).toBe(201);expect(cp.body.gaps).toEqual(['prochaine action exacte']);expect(cp.body.text).toContain('## Prochaine action exacte');expect(cp.body.text).toContain('Quotas A');
  const up=await json('/claude/checkpoints/'+cp.body.id,'PATCH',{next_action:'Ajouter un test sur une date vide',revision:1});expect(up.status).toBe(200);expect(up.body.gaps).toEqual([]);
  expect((await json('/claude/checkpoints/'+cp.body.id,'PATCH',{title:'y',revision:1})).status).toBe(409);
  expect((await json('/claude/checkpoints/'+cp.body.id,'PATCH',{title:'y',revision:2},b)).status).toBe(404);
  expect((await json('/claude/checkpoints?project='+p1)).body.items).toHaveLength(1);expect((await json('/claude/checkpoints','GET',undefined,b)).body.items).toHaveLength(0);
  const again=await json('/prompts/from-task','POST',{task_id:task});expect(JSON.stringify((await json('/prompts/'+again.body.id)).body)).toContain('Ajouter un test sur une date vide');
  const exported=await json('/account/export?metadata=true');for(const tb of ['quota_readings','quota_alerts','work_sessions','checkpoints'])expect(Array.isArray(exported.body[tb])).toBe(true);
  expect((await json('/claude/checkpoints/'+cp.body.id,'DELETE')).status).toBe(200);
  const health=await (await mf.dispatchFetch(origin+'/api/health')).json() as any;expect(health.schema.applied).toContain('0019');
 });
});
