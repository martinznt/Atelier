import {beforeAll,afterAll,describe,it,expect} from 'vitest';import {Miniflare,createFetchMock} from 'miniflare';import {build} from 'esbuild';import {readFile,readdir,mkdir} from 'node:fs/promises';
import {normalizeMigrationForD1} from './migration-sql.mjs';
/* Lot 5B (5B-5) — discussion liée à la maquette, dans Miniflare. La réponse de Mistral est SIMULÉE (aucun appel réel, aucune vraie clé). */
let mf:Miniflare,db:D1Database;const mock=createFetchMock();mock.disableNetConnect();const origin='http://localhost:8787';
let a:string,b:string,ownerA:string,projectA:string,mid:string,blockId:string,aiConn:string,paidConn:string;
async function json(path:string,method='GET',data?:unknown,cookie=a){const r=await mf.dispatchFetch(`${origin}/api${path}`,{method,headers:{Origin:origin,Cookie:cookie||'',...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});const t=await r.text();let body:any=null;try{body=JSON.parse(t);}catch{body=t;}return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const le16=(n:number)=>[n&255,(n>>8)&255];
const webp=()=>{const x=new Uint8Array(64);x.set([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50,0x56,0x50,0x38,0x20,0,0,0,0,0x10,0,0,0x9d,0x01,0x2a,...le16(720),...le16(1560)]);return Buffer.from(x).toString('base64');};
beforeAll(async()=>{
 await mkdir('test-results',{recursive:true});await build({entryPoints:['server/index.ts'],outfile:'test-results/worker-chat.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022'});
 mf=new Miniflare({modules:true,scriptPath:'test-results/worker-chat.mjs',fetchMock:mock,compatibilityDate:'2025-10-24',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],queueProducers:{TASKS:'atelier-tasks-chat'},bindings:{MASTER_KEY:Buffer.alloc(32,7).toString('base64'),APP_ORIGIN:origin,ALLOW_REGISTRATION:'true',STORAGE_LIMIT_MB:'1',MAX_FILE_MB:'1'}});
 db=await mf.getD1Database('DB');
 for(const m of (await readdir('migrations')).filter(n=>/^\d+.*\.sql$/.test(n)).sort())await db.exec(normalizeMigrationForD1(await readFile(`migrations/${m}`,'utf8')));
 const ra=await json('/auth/register','POST',{email:'alice-5b5@example.test',password:'phrase-de-test-solide-2026'},'');a=ra.cookie!;ownerA=ra.body.user.id;
 b=(await json('/auth/register','POST',{email:'bob-5b5@example.test',password:'autre-phrase-solide-2026'},'')).cookie!;
 projectA=(await json('/projects','POST',{name:'Livre de recettes (essai)'})).body.id;
 const mc=await json('/connections','POST',{provider:'mistral',label:'Mistral essai',secret:'exemple-cle-factice-2026',scopes:['chat'],api_consent:true});
 const oc=await json('/connections','POST',{provider:'openai',label:'Payante essai',secret:'exemple-cle-factice-2027',scopes:['chat'],api_consent:true});
 aiConn=mc.body.id;paidConn=oc.body.id;
 await db.prepare("UPDATE connections SET status='connected',models=? WHERE id=?").bind('["ministral-test"]',aiConn).run();await db.prepare("UPDATE connections SET status='connected',models=? WHERE id=?").bind('["gpt-test"]',paidConn).run();
 const at=new Date().toISOString();
 await db.prepare("INSERT INTO project_decisions(id,user_id,project_id,title,reason,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),ownerA,projectA,'La recherche reste en haut','Martin la cherche tout de suite','validated',at,at).run();
 mid=(await json('/mockups','POST',{project_id:projectA,title:'Accueil'})).body.id;await json(`/mockups/${mid}/image`,'PUT',{mime:'image/webp',data:webp()});
 blockId=(await json(`/mockups/${mid}/blocks`,'POST',{kind:'field',label:'Recherche',x:16,y:88,w:328,h:40})).body.blocks[0].id;
});
afterAll(async()=>{await mf?.dispose();});
describe('discussion liée à la maquette (5B-5)',()=>{
 let answerId:string;
 it('une question sur un bloc : Atelier répond SANS IA avec le bloc, la règle et la décision, chaque élément sourcé',async()=>{
  const r=await json(`/mockups/${mid}/discussion`,'POST',{block_id:blockId,question:'Est-ce bien de mettre la recherche ici ?'});
  expect(r.status).toBe(201);expect(r.body.items.map((x:any)=>[x.author,x.kind])).toEqual([['martin','question'],['atelier','answer']]);
  const ans=r.body.items[1];answerId=ans.id;expect(ans.block_label).toBe('Recherche');
  expect(ans.body).toMatch(/Champ à 16 px du bord gauche et 88 px du haut, 328 × 40 px/);
  expect(ans.body).toMatch(/« Recherche » est petit pour un pouce/); // règle WCAG 2.5.5 (40 px < 44)
  expect(ans.body).toMatch(/Décision actuelle « La recherche reste en haut »/);
  expect(ans.sources.map((s:any)=>s.kind)).toEqual(['block','rule','rule','decision']); // 2 règles : 2.5.5 (Vérifié) et « une décision parle du bloc » (Hypothèse)
  expect(ans.body).toMatch(/Une décision parle de « Recherche ».*\[Hypothèse\]/);expect(ans.level).toBe('');
 });
 it('IA (Mistral simulé) avec la clé de l’utilisateur : réponse marquée Hypothèse ; une seule demande, jamais rejouée ; IA payante refusée',async()=>{
  expect((await json(`/mockups/${mid}/discussion/${answerId}/ai`,'POST',{connection_id:paidConn,model:'gpt-test'})).status).toBe(403);
  const sse=['data: '+JSON.stringify({choices:[{delta:{content:'Oui : la recherche juste sous le titre respecte votre décision. Agrandissez-la à 44 px de haut.'}}],model:'ministral-test'}),'','data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]}),'','data: [DONE]',''].join('\n');
  mock.get('https://api.mistral.ai').intercept({method:'POST',path:'/v1/chat/completions'}).reply(200,sse,{headers:{'content-type':'text/event-stream'}});
  const r=await json(`/mockups/${mid}/discussion/${answerId}/ai`,'POST',{connection_id:aiConn,model:'ministral-test'});
  expect(r.status).toBe(201);expect(r.body).toMatchObject({author:'ai',level:'hypothesis',level_word:'Hypothèse',ai_provider:'mistral',ai_model:'ministral-test'});expect(r.body.body).toMatch(/juste sous le titre/);
  expect((await json(`/mockups/${mid}/discussion/${answerId}/ai`,'POST',{connection_id:aiConn,model:'ministral-test'})).status).toBe(409);
  expect((await json(`/mockups/${mid}/discussion/${answerId}/ai`,'POST',{connection_id:aiConn,model:'inconnu'})).status).toBe(409);
 });
 it('une IA qui ne répond pas : rien n’est ajouté, et la demande n’est pas rejouée',async()=>{
  const q=await json(`/mockups/${mid}/discussion`,'POST',{block_id:null,question:'Faut-il une barre du bas ?'});const ans=q.body.items[1].id;
  mock.get('https://api.mistral.ai').intercept({method:'POST',path:'/v1/chat/completions'}).reply(503,'{"error":"busy"}',{headers:{'content-type':'application/json'}});
  const before=(await json(`/mockups/${mid}/discussion`)).body.items.length;
  expect((await json(`/mockups/${mid}/discussion/${ans}/ai`,'POST',{connection_id:aiConn,model:'ministral-test'})).status).toBe(502);
  expect((await json(`/mockups/${mid}/discussion`)).body.items.length).toBe(before);
 });
 it('conclusion : « Confirmé par vous » seulement quand Martin la confirme ; elle entre dans la fiche et la mission',async()=>{
  let sh=(await json(`/mockups/${mid}/sheet`)).body;expect(sh.markdown).toMatch(/## Conclusions confirmées par vous \(discussion\)\n\nAucune\./);
  const ai=(await json(`/mockups/${mid}/discussion`)).body.items.find((x:any)=>x.author==='ai');
  const c=await json(`/mockups/${mid}/discussion/conclusion`,'POST',{reply_to:ai.id,text:'La recherche reste juste sous le titre, en 44 px de haut.'});
  expect(c.status).toBe(201);expect(c.body).toMatchObject({author:'martin',kind:'conclusion',level:'confirmed',level_word:'Confirmé par vous'});expect(c.body.sources[0].label).toMatch(/IA \(Hypothèse\) relue par vous/);
  sh=(await json(`/mockups/${mid}/sheet`)).body;expect(sh.markdown).toContain('- La recherche reste juste sous le titre, en 44 px de haut.');expect(sh.mission.fields.perimeter).toContain('Décisions de mise en page confirmées par Martin');
  // la prochaine réponse d'Atelier sur ce bloc rappelle la conclusion
  const again=await json(`/mockups/${mid}/discussion`,'POST',{block_id:blockId,question:'Et la couleur ?'});expect(again.body.items[1].body).toMatch(/Vous avez déjà conclu : La recherche reste juste sous le titre/);
  expect((await json(`/mockups/${mid}/discussion/conclusion`,'POST',{reply_to:ai.id,text:'  '})).status).toBe(400);
 });
 it('refus clairs : question vide, secret dans la question, bloc d’une autre maquette',async()=>{
  expect((await json(`/mockups/${mid}/discussion`,'POST',{block_id:null,question:'   '})).status).toBe(400);
  expect((await json(`/mockups/${mid}/discussion`,'POST',{block_id:null,question:'Ma clé est sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'})).status).toBe(400);
  expect((await json(`/mockups/${mid}/discussion`,'POST',{block_id:crypto.randomUUID(),question:'Bonjour ?'})).status).toBe(400);
 });
 it('A contre B : B ne lit ni n’écrit dans la discussion de A, ni ne déclenche son IA ; l’export de B ne contient rien de A',async()=>{
  const g=await json(`/mockups/${mid}/discussion`,'GET',undefined,b);expect(g.status).toBe(404);expect(JSON.stringify(g.body)).not.toMatch(/recherche/i);
  expect((await json(`/mockups/${mid}/discussion`,'POST',{block_id:null,question:'Intrus ?'},b)).status).toBe(404);
  expect((await json(`/mockups/${mid}/discussion/${answerId}/ai`,'POST',{connection_id:aiConn,model:'ministral-test'},b)).status).toBe(404);
  expect((await json(`/mockups/${mid}/discussion/conclusion`,'POST',{reply_to:answerId,text:'x'},b)).status).toBe(404);
  const exA=await json('/account/export?metadata=true');expect(exA.body.mockup_messages.length).toBeGreaterThan(4);
  const exB=await json('/account/export?metadata=true','GET',undefined,b);expect(exB.body.mockup_messages).toEqual([]);
 });
});
