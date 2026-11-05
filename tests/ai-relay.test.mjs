import {test} from 'node:test';
import assert from 'node:assert/strict';
import {availabilityOf,classifyFailure,storedFailure,mergeObservation,parseResetHeader} from '../server/ai-availability.ts';
import {selectCandidates,runWithRelay,AttemptError} from '../server/ai-relay.ts';
import {ProviderError} from '../server/connectors/http.ts';
// Fixtures locales : aucun appel réseau, aucun fournisseur réel. Ils valident la logique d'Atelier.
const NOW='2026-11-06T10:00:00.000Z';
const conn=(id,provider,models,extra={})=>({id,label:id+'-label',provider,status:'connected',api_consent:1,scopes:'["chat"]',models:JSON.stringify(models),expires_at:null,quota:null,...extra});
const mistral=conn('m','mistral',['ministral-small']),gemini=conn('g','gemini',['gemini-flash']),groq=conn('q','groq',['openai/gpt-oss-120b']);
const refused=(status,detail='',extra={})=>new AttemptError(new ProviderError(status,'http',extra.retryAfter??null,{detail,headers:extra.headers||{}}),false);
const plan=(connections,allowRelay=true,preferred=[{connection_id:'m',model:'ministral-small'}])=>selectCandidates({connections,preferred,allowRelay,now:NOW});
const run=(candidates,behavior,extra={})=>{
 const calls=[];
 return {calls,promise:runWithRelay({candidates,maxAttempts:3,now:()=>NOW,attempt:async c=>{calls.push(c.provider);return behavior(c);},...extra})};
};

test('classification : limites par minute, par jour, crédit, auth, permission, modèle, erreur temporaire',()=>{
 const k=(status,detail,extra)=>classifyFailure(new ProviderError(status,'http',null,{detail,headers:extra?.headers||{}}),{now:NOW,accepted:false}).kind;
 assert.equal(k(429,'Rate limit reached for model on tokens per minute (TPM): Limit 6000'),'rate_limit_tokens');
 assert.equal(k(429,'Rate limit reached on requests per minute (RPM)'),'rate_limit_requests');
 assert.equal(k(429,'You exceeded your current quota, check plan and billing. quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier'),'quota_daily');
 assert.equal(k(429,'You exceeded your current quota, please check your plan and billing details'),'billing');
 assert.equal(k(429,'monthly spending limit reached'),'quota_monthly');
 assert.equal(k(429,'',{headers:{'x-ratelimit-remaining-tokens':'0'}}),'rate_limit_tokens');
 assert.equal(k(429,''),'rate_limit_unknown');
 assert.equal(k(401,''),'auth');assert.equal(k(402,''),'billing');assert.equal(k(403,''),'permission');
 assert.equal(k(404,'model not found'),'model_unavailable');assert.equal(k(400,'The model does not exist'),'model_unavailable');
 assert.equal(k(400,'invalid prompt'),'request_rejected');assert.equal(k(503,''),'temporary');
});
test('aucune date inventée : Retry-After et en-têtes de réinitialisation seulement, sinon pause interne étiquetée',()=>{
 const withDate=classifyFailure(new ProviderError(429,'http','42',{detail:'requests per minute'}),{now:NOW,accepted:false});
 assert.equal(withDate.retry_at,new Date(Date.parse(NOW)+42000).toISOString());assert.equal(withDate.retry_source,'provider');
 const none=classifyFailure(new ProviderError(429,'http',null,{detail:'requests per minute'}),{now:NOW,accepted:false});
 assert.equal(none.retry_at,null);
 const f=storedFailure(none,'m',NOW);
 assert.equal(f.hold_source,'internal');assert.equal(f.retry_at,null);
 assert.equal(parseResetHeader('1m30.5s',NOW),new Date(Date.parse(NOW)+90500).toISOString());
 assert.equal(parseResetHeader('250ms',NOW),new Date(Date.parse(NOW)+250).toISOString());
 assert.equal(parseResetHeader('n’importe quoi',NOW),null);
});
test('Mistral limité, Gemini disponible : une tentative refusée, puis Gemini répond',async()=>{
 const {candidates}=plan([mistral,gemini,groq]);
 assert.deepEqual(candidates.map(c=>c.provider),['mistral','gemini','groq']);
 const r=run(candidates,c=>{if(c.provider==='mistral')throw refused(429,'requests per minute',{retryAfter:'30'});return 'ok:'+c.provider;});
 const res=await r.promise;
 assert.equal(res.status,'completed');assert.equal(res.value,'ok:gemini');assert.deepEqual(r.calls,['mistral','gemini']);
 assert.deepEqual(res.attempts.map(a=>a.outcome),['refused','completed']);assert.equal(res.attempts[0].until_source,'provider');
});
test('Gemini limité, Groq disponible',async()=>{
 const {candidates}=plan([gemini,groq],true,[{connection_id:'g',model:'gemini-flash'}]);
 const r=run(candidates,c=>{if(c.provider==='gemini')throw refused(429,'PerDay');return c.provider;});
 const res=await r.promise;
 assert.equal(res.value,'groq');assert.deepEqual(r.calls,['gemini','groq']);assert.equal(res.attempts[0].kind,'quota_daily');
});
test('plusieurs fournisseurs limités : le troisième répond, chaque fournisseur est essayé une seule fois',async()=>{
 const {candidates}=plan([mistral,gemini,groq]);
 const r=run(candidates,c=>{if(c.provider!=='groq')throw refused(429,'');return 'groq';});
 const res=await r.promise;
 assert.equal(res.status,'completed');assert.deepEqual(r.calls,['mistral','gemini','groq']);
});
test('tous les fournisseurs limités : arrêt propre, aucune boucle, plafond respecté',async()=>{
 const many=[mistral,gemini,groq,conn('o','openai',['gpt-mini']),conn('a','anthropic',['claude-haiku'])];
 const {candidates}=plan(many);
 const r=run(candidates,()=>{throw refused(429,'');});
 const res=await r.promise;
 assert.equal(res.status,'exhausted');assert.ok(r.calls.length<=3,'plafond de 3 appels : '+r.calls.length);
 assert.ok(res.attempts.some(a=>a.outcome==='skipped'&&/Plafond/.test(a.reason)));
});
test('erreur d’authentification : fournisseur écarté, aucune nouvelle tentative sur cette connexion, relais vers un autre',async()=>{
 const {candidates}=plan([mistral,groq]);
 const r=run(candidates,c=>{if(c.provider==='mistral')throw refused(401,'invalid api key');return 'groq';});
 const res=await r.promise;
 assert.equal(res.value,'groq');assert.equal(r.calls.filter(p=>p==='mistral').length,1);
 // L'autre modèle de la même connexion n'est pas essayé après un refus valable pour toute la connexion.
 const two=[conn('m','mistral',['ministral-small','mistral-large']),groq];
 const c2=plan(two).candidates;
 const r2=run(c2,c=>{if(c.provider==='mistral')throw refused(401,'');return 'groq';});
 await r2.promise;assert.equal(r2.calls.filter(p=>p==='mistral').length,1);
});
test('erreur de facturation : connexion bloquée jusqu’à action de l’utilisateur, jamais re-sondée',async()=>{
 const cl=classifyFailure(new ProviderError(402,'http',null,{detail:'insufficient credit'}),{now:NOW,accepted:false});
 const quota=mergeObservation(null,{type:'failure',failure:storedFailure(cl,'ministral-small',NOW)},NOW);
 const a=availabilityOf({...mistral,quota},{model:'ministral-small',now:new Date(Date.parse(NOW)+10*86400000).toISOString()});
 assert.equal(a.state,'blocked');assert.equal(a.usable,false);assert.equal(a.until,null);
});
test('Retry-After : exclue pendant la pause fournie, éligible ensuite ; l’autre modèle de la connexion n’est pas bloqué',()=>{
 const cl=classifyFailure(new ProviderError(429,'http','60',{detail:'requests per minute'}),{now:NOW,accepted:false});
 const quota=mergeObservation(null,{type:'failure',failure:storedFailure(cl,'ministral-small',NOW)},NOW);
 const during=availabilityOf({...mistral,quota},{model:'ministral-small',now:new Date(Date.parse(NOW)+30000).toISOString()});
 assert.equal(during.state,'held');assert.equal(during.until_source,'provider');
 const after=availabilityOf({...mistral,quota},{model:'ministral-small',now:new Date(Date.parse(NOW)+61000).toISOString()});
 assert.equal(after.usable,true);assert.equal(after.probe,true);
 const otherModel=availabilityOf({...mistral,models:'["ministral-small","other"]',quota},{model:'other',now:new Date(Date.parse(NOW)+30000).toISOString()});
 assert.equal(otherModel.usable,true);
});
test('interruption après début du flux : aucun relais, résultat partiel conservé et non présenté comme complet',async()=>{
 const {candidates}=plan([mistral,gemini]);
 const r=run(candidates,()=>{throw new AttemptError(new ProviderError(502,'stream_error'),true,'début de réponse…');});
 const res=await r.promise;
 assert.equal(res.status,'interrupted');assert.equal(res.partial,'début de réponse…');assert.deepEqual(r.calls,['mistral']);
 assert.equal(res.value,undefined);assert.equal(res.attempts[0].outcome,'interrupted');
});
test('timeout : résultat incertain, aucun relais automatique ; erreur réseau avant réponse : relais permis',async()=>{
 const {candidates}=plan([mistral,gemini]);
 const t=run(candidates,()=>{throw new AttemptError(new ProviderError(504,'timeout'),false);});
 assert.equal((await t.promise).status,'stopped');assert.deepEqual(t.calls,['mistral']);
 const n=run(candidates,c=>{if(c.provider==='mistral')throw new AttemptError(new ProviderError(503,'network'),false);return 'ok';});
 const res=await n.promise;assert.equal(res.value,'ok');assert.deepEqual(n.calls,['mistral','gemini']);
});
test('demande rejetée (400 sur le contenu) : un autre fournisseur ne la résoudrait pas, arrêt sans gaspiller d’appel',async()=>{
 const {candidates}=plan([mistral,gemini,groq]);
 const r=run(candidates,()=>{throw refused(400,'prompt too long');});
 const res=await r.promise;
 assert.equal(res.status,'stopped');assert.equal(r.calls.length,1);
});
test('réponse complète : un seul appel, aucun autre fournisseur sollicité',async()=>{
 const {candidates}=plan([mistral,gemini,groq]);
 const r=run(candidates,c=>'complet:'+c.provider);
 const res=await r.promise;
 assert.equal(res.status,'completed');assert.deepEqual(r.calls,['mistral']);assert.equal(res.attempts.length,1);
});
test('deux tâches simultanées : la seconde voit la pause enregistrée par la première et ne rappelle pas Mistral',async()=>{
 const store={m:mistral,g:gemini};
 const view=()=>Object.values(store);
 const attemptFor=(log)=>async c=>{log.push(c.provider);if(c.provider==='mistral')throw refused(429,'requests per minute',{retryAfter:'60'});return 'ok';};
 const persist=async(c,cl,accepted)=>{store[c.connection_id]={...store[c.connection_id],quota:mergeObservation(store[c.connection_id].quota,{type:'failure',failure:storedFailure(cl,c.model,NOW)},NOW)};};
 const recheck=async c=>availabilityOf(store[c.connection_id],{model:c.model,now:NOW});
 const logA=[],logB=[];
 const candidatesFor=()=>selectCandidates({connections:view(),preferred:[{connection_id:'m',model:'ministral-small'}],allowRelay:true,now:NOW}).candidates;
 const a=await runWithRelay({candidates:candidatesFor(),maxAttempts:3,now:()=>NOW,attempt:attemptFor(logA),recheck,onFailure:persist});
 const b=await runWithRelay({candidates:candidatesFor(),maxAttempts:3,now:()=>NOW,attempt:attemptFor(logB),recheck,onFailure:persist});
 assert.deepEqual(logA,['mistral','gemini']);assert.deepEqual(logB,['gemini']);
 assert.equal(a.status,'completed');assert.equal(b.status,'completed');
 // Cas limite d'une tâche déjà partie avec une liste périmée : la relecture juste avant l'appel évite l'appel inutile.
 const stale=[{connection_id:'m',label:'m',provider:'mistral',model:'ministral-small',origin:'preferred',reason:'x',probe:false},{connection_id:'g',label:'g',provider:'gemini',model:'gemini-flash',origin:'relay',reason:'y',probe:false}];
 const logC=[];
 const c=await runWithRelay({candidates:stale,maxAttempts:3,now:()=>NOW,attempt:attemptFor(logC),recheck,onFailure:persist});
 assert.deepEqual(logC,['gemini']);assert.equal(c.attempts[0].outcome,'skipped');
});
test('absence d’information fiable sur les quotas : connexion utilisable, quota déclaré inconnu, rien d’inventé',()=>{
 const a=availabilityOf(mistral,{model:'ministral-small',now:NOW});
 assert.equal(a.usable,true);assert.equal(a.quota_known,false);assert.match(a.reason,/quota inconnu/);
 assert.deepEqual(a.known,{});assert.equal(a.until,null);
 const official=availabilityOf({...mistral,quota:{kind:'official',updated_at:NOW,values:{'x-ratelimit-remaining-requests':'0'}}},{model:'ministral-small',now:NOW});
 assert.equal(official.state,'held');assert.equal(official.until_source,'internal');
});
test('compteurs fournisseur frais insuffisants pour la demande : connexion écartée ; compteurs anciens : ignorés',()=>{
 const q=(updated)=>({kind:'official',updated_at:updated,values:{'x-ratelimit-remaining-tokens':'500'}});
 assert.equal(availabilityOf({...groq,quota:q(NOW)},{model:'openai/gpt-oss-120b',now:NOW,estimateTokens:3000}).usable,false);
 assert.equal(availabilityOf({...groq,quota:q(new Date(Date.parse(NOW)-10*60000).toISOString())},{model:'openai/gpt-oss-120b',now:NOW,estimateTokens:3000}).usable,true);
});
test('seules les connexions autorisées, testées et avec accès discussion sont candidates ; sans relais, seule la préférence est utilisée',()=>{
 const untested=conn('u','groq',['x'],{status:'untested'}),noConsent=conn('n','gemini',['y'],{api_consent:0}),noScope=conn('s','openai',['z'],{scopes:'["read"]'}),expired=conn('e','anthropic',['w'],{expires_at:'2026-01-01T00:00:00.000Z'});
 const r=plan([mistral,untested,noConsent,noScope,expired]);
 assert.deepEqual(r.candidates.map(c=>c.provider),['mistral']);
 assert.equal(r.excluded.length,4);
 const noRelay=plan([mistral,gemini,groq],false);
 assert.deepEqual(noRelay.candidates.map(c=>c.provider),['mistral']);
});
test('un succès sur un modèle efface sa pause mais conserve celle des autres modèles',()=>{
 const f1=storedFailure(classifyFailure(new ProviderError(429,'http','600',{detail:'requests per minute'}),{now:NOW,accepted:false}),'A',NOW);
 const f2=storedFailure(classifyFailure(new ProviderError(429,'http','600',{detail:'requests per minute'}),{now:NOW,accepted:false}),'B',NOW);
 let q=mergeObservation(null,{type:'failure',failure:f1},NOW);q=mergeObservation(q,{type:'failure',failure:f2},NOW);
 q=mergeObservation(q,{type:'success',model:'A',headers:{kind:'official',scope:'API',values:{},updated_at:NOW}},NOW);
 assert.equal(Boolean(q.holds.A),false);assert.equal(Boolean(q.holds.B),true);assert.equal(q.status,'rate_limited');
});
test('sécurité : un secret présent dans un message d’erreur du fournisseur n’est jamais conservé',async()=>{
 const {generate}=await import('../server/connectors/ai.ts');
 const key='gsk_'+'A1b2C3d4'.repeat(6);
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'Invalid API key '+key+' for requests per minute'}}),{status:429,headers:{'retry-after':'3','x-ratelimit-remaining-requests':'0'}});
 let caught;
 try{for await(const _ of generate('groq','secret-fixture','openai/gpt-oss-120b',[{role:'user',content:'x'}],10,new AbortController().signal));}catch(e){caught=e;}finally{globalThis.fetch=original;}
 assert.ok(caught instanceof ProviderError);
 assert.doesNotMatch(JSON.stringify({detail:caught.detail,headers:caught.headers,message:caught.message}),new RegExp(key));
 assert.match(caught.detail,/\[masqué\]/);
 const stored=JSON.stringify(storedFailure(classifyFailure(caught,{now:NOW,accepted:false}),'m',NOW));
 assert.doesNotMatch(stored,new RegExp(key));assert.doesNotMatch(stored,/secret-fixture/);
 assert.equal(caught.headers['x-ratelimit-remaining-requests'],'0');
});
test('Groq : « requêtes restantes » = quota journalier, réinitialisation fournie par Groq (documentation officielle)',()=>{
 const updated=NOW;
 const quota={kind:'official',updated_at:updated,values:{'x-ratelimit-remaining-requests':'0','x-ratelimit-reset-requests':'2m30s','x-ratelimit-remaining-tokens':'5000'}};
 const during=availabilityOf({...groq,quota},{model:'openai/gpt-oss-120b',now:new Date(Date.parse(NOW)+60000).toISOString()});
 assert.equal(during.state,'held');assert.equal(during.kind,'quota_daily');assert.equal(during.until_source,'provider');
 assert.equal(during.until,new Date(Date.parse(NOW)+150000).toISOString());
 // Même au-delà de 60 s (fraîcheur) la pause fournie par Groq reste respectée ; elle prend fin à la date indiquée.
 assert.equal(availabilityOf({...groq,quota},{model:'openai/gpt-oss-120b',now:new Date(Date.parse(NOW)+160000).toISOString()}).usable,true);
 // Pour un autre fournisseur, le même compteur n'est pas interprété comme journalier.
 const other=availabilityOf({...mistral,quota},{model:'ministral-small',now:new Date(Date.parse(NOW)+10000).toISOString()});
 assert.equal(other.kind,'rate_limit_requests');assert.equal(other.until_source,'internal');
});
test('Groq : un 429 avec 0 requête restante est classé quota journalier avec la date de Groq',()=>{
 const cl=classifyFailure(new ProviderError(429,'http',null,{detail:'',headers:{'x-ratelimit-remaining-requests':'0','x-ratelimit-reset-requests':'7m12s'}}),{now:NOW,accepted:false,provider:'groq'});
 assert.equal(cl.kind,'quota_daily');assert.equal(cl.retry_at,new Date(Date.parse(NOW)+432000).toISOString());assert.equal(cl.retry_source,'provider');
 assert.equal(classifyFailure(new ProviderError(429,'http',null,{detail:'',headers:{'x-ratelimit-remaining-requests':'0'}}),{now:NOW,accepted:false,provider:'mistral'}).kind,'rate_limit_requests');
});
