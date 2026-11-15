import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profileOf,extractUnits,testScripts,scriptCommand,assembleFields,missionGaps,renderMission,checksState,reviewForSha,verdictProblem,parseRephrase,rephrasePrompt,cleanFields,emptyFields,sha256Hex} from '../server/mission-core.ts';

/* Fichiers de règles fabriqués pour le test : ils reproduisent la forme des vrais (titres, puces numérotées sur plusieurs lignes,
   paragraphes, ligne d'import, lignes sur Codex) sans en copier le contenu. */
const RECETTES_AGENTS=`# Livre — consignes

**Décision prioritaire :** Codex reprend tout le développement.

## Règles communes

1. Tout gratuit : aucune IA payante.
2. Une tâche = une branche (\`claude/<n°>-<sujet>\` ou \`codex/<n°>-<sujet>\`) = une PR.
   Jamais de commit dans \`main\`.
3. Ne jamais créer un autre KV, ni changer l'identifiant de \`RECETTES_KV\`.
4. Codex reprend tous les fichiers selon la décision de Martin.
- **Codex** : lis docs/agents/CODEX.md.
`;
const RECETTES_CLAUDE=`@AGENTS.md

# Claude Code

Au début de chaque tâche : lis l'état de Codex.

Rappels propres au dépôt :
- Après un changement dans \`public/\`, reconstruire le service worker : \`node scripts/build-sw.mjs\`.
- Tests : \`npm test\`, \`npm run test:e2e\`.
- Une nouvelle version change partout le même numéro : \`package.json\`, \`APP_VERSION\` dans \`worker.js\` (fichier de Codex : le demander), \`public/sw.js\`.
- Voir \`docs/agents/CLAUDE_CODE.md\`.
`;
const files=(repo,list)=>list.map(([path,text])=>({repo,path,sha:'a'.repeat(40),text}));
const units=(repo,list)=>files(repo,list).flatMap(extractUnits);
const meaningful=text=>text.replace(/\r\n?/g,'\n').split('\n').map(l=>l.trim()).filter(l=>l&&!/^#{1,6}\s/.test(l)&&!/^@\S+$/.test(l));
const norm=s=>s.replace(/\s+/g,' ').replace(/^(?:[-*]|\d+[.)])\s+/,'').trim();

test('profileOf : reconnaissance par nom exact du dépôt, jamais par ressemblance',()=>{
 assert.equal(profileOf('martinznt/Livre-de-recettes'),'recettes');assert.equal(profileOf('martinznt/Sport'),'sport');
 assert.equal(profileOf('martinznt/Sport-extra'),'other');assert.equal(profileOf('martinznt/Atelier'),'other');assert.equal(profileOf(''),'other');
});

test('aucune règle du dépôt perdue : chaque ligne source est dans une unité conservée ou ignorée',()=>{
 for(const [path,text] of [['AGENTS.md',RECETTES_AGENTS],['CLAUDE.md',RECETTES_CLAUDE]]){
  const u=extractUnits({path,text}),all=u.map(x=>x.text.replace(/\s+/g,' ')).join(' ¶ ');
  for(const line of meaningful(text)){
   const probe=norm(line).replace(/\s+ou\s+`codex\/[^`]*`/i,'').replace(/\s*\([^()]*codex[^()]*\)/i,'');
   assert.ok(all.includes(probe),'ligne perdue : '+line);
  }
  assert.equal(u.every(x=>x.status==='kept'||x.status==='ignored'),true);
 }
});

test('lignes sur Codex ignorées avec la raison ; la règle de branche claude/ reste ; les puces sur plusieurs lignes restent entières',()=>{
 const u=extractUnits({path:'AGENTS.md',text:RECETTES_AGENTS});
 const ignored=u.filter(x=>x.status==='ignored');
 assert.equal(ignored.length,3);assert.ok(ignored.every(x=>/Codex n’est plus utilisé/.test(x.why)));
 const branch=u.find(x=>/Une tâche = une branche/.test(x.text));
 assert.equal(branch.status,'kept');assert.equal(branch.neutralized,true);
 assert.match(branch.text,/claude\/<n°>-<sujet>/);assert.doesNotMatch(branch.text,/codex/i);assert.match(branch.text,/Jamais de commit dans `main`/);
 assert.ok(u.find(x=>/RECETTES_KV/.test(x.text)&&x.status==='kept'));
 assert.equal(u.find(x=>/Tout gratuit/.test(x.text)).line,7);
});

test('la règle « une version = même numéro partout » n\'est pas perdue à cause d\'une parenthèse sur Codex',()=>{
 const u=extractUnits({path:'CLAUDE.md',text:RECETTES_CLAUDE}).find(x=>/Une nouvelle version change partout/.test(x.text));
 assert.equal(u.status,'kept');assert.equal(u.neutralized,true);assert.doesNotMatch(u.text,/codex/i);assert.match(u.text,/`APP_VERSION` dans `worker\.js`, `public\/sw\.js`/);
});

test('titres et ligne d\'import ne sont pas des règles',()=>{
 const u=extractUnits({path:'CLAUDE.md',text:RECETTES_CLAUDE});
 assert.ok(!u.some(x=>/^#|^@AGENTS/.test(x.text)));
 assert.equal(u.find(x=>/service worker/.test(x.text)).heading,'Claude Code');
});

test('testScripts : seuls les scripts réellement présents ; JSON invalide ou absent = illisible',()=>{
 assert.deepEqual(testScripts('{"scripts":{"check":"x","test":"y","build":"z","test:audit":"w"}}'),{names:['check','test','test:audit'],readable:true});
 assert.deepEqual(testScripts('{"name":"x"}'),{names:[],readable:true});
 assert.deepEqual(testScripts('{pas du json'),{names:[],readable:false});
 assert.deepEqual(testScripts(null),{names:[],readable:false});
 assert.equal(scriptCommand('test'),'npm test');assert.equal(scriptCommand('test:e2e'),'npm run test:e2e');
});

const task={title:'Ajouter la liste de courses',objective:'Pouvoir cocher des ingrédients.',acceptance:'La liste se garde hors connexion.',proof:'Capture du téléphone.',context:'Page « Courses ».',files_hint:'public/js/courses.js',tests:'npm test',risks:'Données locales',next_action:'Lire courses.js',constraints_text:'Tout gratuit',do_not_touch:'Ne pas changer le KV'};
const input=(over={})=>({projectName:'Livre de recettes',preparedAt:'2026-11-16',level:'short',title:'Ajouter la liste de courses',repo:{full_name:'martinznt/Livre-de-recettes',branch:'main'},
 fields:assembleFields(task),features:[{code:'F-0007',name:'Liste de courses',state:'in_progress'}],decisions:[{id:'12345678-aaaa',title:'Tout gratuit',reason:'Aucune IA payante.',source_ref:'chat'}],
 draft:{source:'assembled',reviewed_at:null},advice:'Sonnet · effort moyen',
 rules:{state:'read',repo:'martinznt/Livre-de-recettes',commit:'c'.repeat(40),files:[{path:'AGENTS.md',sha:'a'.repeat(40)},{path:'CLAUDE.md',sha:'b'.repeat(40)}],
  units:units('martinznt/Livre-de-recettes',[['AGENTS.md',RECETTES_AGENTS],['CLAUDE.md',RECETTES_CLAUDE]]),scripts:{names:['check','test','test:e2e'],readable:true},package_found:true},extras:null,...over});

test('mission courte : toutes les sections demandées sont là, sortie stable',async()=>{
 const a=renderMission(input()),b=renderMission(input());
 assert.equal(a,b);assert.equal(await sha256Hex(a),await sha256Hex(b));
 for(const h of ['## Objectif','## Périmètre','## Interdits','## Fichiers concernés','## Tests exacts à lancer','## Preuves attendues','## Critère « terminé »','## Rappels de méthode','## Règles du dépôt visé','## Liens avec Atelier','## Retour attendu'])assert.ok(a.includes(h),h);
 assert.match(a,/Ne rien déclarer « testé »/);assert.match(a,/\*\*V\*\* = vérifié.*\*\*R\*\* = rapporté.*\*\*H\*\* = hypothèse/);
 assert.match(a,/`npm test`, `npm run test:e2e`|`npm run check`, `npm test`, `npm run test:e2e`/);
 assert.match(a,/Fonctionnalité F-0007/);assert.match(a,/Décision actuelle \[12345678\]/);
 assert.match(a,/Fiabilité : brouillon assemblé par Atelier sans IA/);assert.doesNotMatch(a,/Contexte complet/);
});

test('règles du dépôt : toutes les règles conservées sont citées, les lignes Codex listées à part et signalées',()=>{
 const a=renderMission(input()),u=input().rules.units;
 for(const x of u.filter(y=>y.status==='kept'))assert.ok(a.includes(x.text),'règle absente : '+x.text);
 assert.match(a,/Lignes ignorées \(partage Codex\/Claude/);assert.match(a,/RECETTES_KV/);assert.match(a,/node scripts\/build-sw\.mjs/);
 assert.match(a,/une mention de Codex \(variante de branche « codex\/<n°>-<sujet> » ou remarque entre parenthèses\) a été retirée/);assert.match(a,/docs\/agents\/\*` cités plus haut peuvent encore parler du partage Codex\/Claude/);
 assert.doesNotMatch(a.split('### Lignes ignorées')[0],/codex\/</i);
});

test('isolation : la mission de Sport ne contient aucune règle de Recettes ; règles d\'un autre dépôt refusées',()=>{
 const sport=input({projectName:'Sport',title:'Séance libre',repo:{full_name:'martinznt/Sport',branch:'main'},fields:assembleFields({title:'Séance libre',objective:'Ajouter une séance libre',acceptance:'La séance se voit',files_hint:'pages/seance.js'}),features:[],decisions:[],
  rules:{state:'no_rule_files',repo:'martinznt/Sport',commit:'d'.repeat(40),files:[],units:[],scripts:{names:['check','test','test:e2e','test:audit'],readable:true},package_found:true}});
 const a=renderMission(sport);
 assert.match(a,/Aucun `CLAUDE\.md` ni `AGENTS\.md`/);assert.match(a,/celles d’un autre dépôt ne s’appliquent pas/);
 for(const leak of ['RECETTES_KV','build-sw','Livre de recettes','Tout gratuit','claude/<n°>'])assert.ok(!a.includes(leak),'fuite : '+leak);
 assert.match(a,/`npm run check`, `npm test`, `npm run test:e2e`, `npm run test:audit`/);
 assert.throws(()=>renderMission({...sport,rules:{...input().rules}}),/autre dépôt/);
 const rec=renderMission(input());assert.ok(!rec.includes('test:audit'));
});

test('règles non lues : la mission le dit en toutes lettres et ne cite aucune règle',()=>{
 const a=renderMission(input({rules:{state:'not_read',commit:null,files:[],units:[],scripts:null,package_found:false}}));
 assert.match(a,/RÈGLES DU DÉPÔT NON LUES/);assert.doesNotMatch(a,/RECETTES_KV/);assert.match(a,/Aucun `package\.json` lu/);
});

test('texte reformulé par une IA : Hypothèse tant que Martin n\'a pas relu',()=>{
 assert.match(renderMission(input({draft:{source:'ai',reviewed_at:null,ai_label:'mistral · m'}})),/HYPOTHÈSE — reformulé par une IA gratuite, pas encore relu/);
 const ok=renderMission(input({draft:{source:'ai',reviewed_at:'2026-11-16',ai_label:'mistral · m'}}));
 assert.match(ok,/relu et confirmé par Martin le 2026-11-16/);assert.doesNotMatch(ok,/HYPOTHÈSE/);
});

test('dossier complet : ajoute le contexte sans retirer rien du niveau court',()=>{
 const short=renderMission(input()),full=renderMission(input({level:'full',extras:{dependencies:[{title:'Écran Courses',status:'done'}],previous:{worked_at:'2026-11-10',outcome:'partial',results:'Écran fait',unresolved:'hors connexion',tests_run:'npm test'},checkpoint:{title:'Reprise',next_action:'Brancher le stockage',remaining:'tests'},task_context:'Contexte',already_verified:'npm test OK',difficulties:'Cache',advice_reasons:['Tâche simple']}}));
 assert.match(full,/## Contexte complet/);assert.match(full,/Écran Courses \(done\)/);assert.match(full,/Brancher le stockage/);assert.match(full,/Déjà vérifié \(à ne pas refaire\)/);
 for(const line of short.split('\n').filter(l=>l.startsWith('- ')&&!l.includes('Niveau')))assert.ok(full.includes(line),'perdu au niveau complet : '+line);
});

test('manques : sans objectif, critère « terminé » et périmètre, la mission est incomplète',()=>{
 assert.deepEqual(missionGaps(emptyFields()),['l’objectif','le critère « terminé »','le périmètre ou les fichiers concernés']);
 assert.deepEqual(missionGaps(assembleFields(task)),[]);
 assert.deepEqual(missionGaps({...emptyFields(),objective:'x',done:'y',files:'a.js'}),[]);
 assert.deepEqual(assembleFields(null),emptyFields());
 assert.equal(cleanFields({objective:42,junk:'x'}).objective,'42');
});

test('retour : état des tests GitHub — une PR sans tests verts n\'a aucune valeur',()=>{
 const ok={name:'a',status:'completed',conclusion:'success'};
 assert.equal(checksState(null),'unread');assert.equal(checksState([]),'none');assert.equal(checksState([ok]),'green');
 assert.equal(checksState([ok,{name:'b',status:'completed',conclusion:'failure'}]),'red');assert.equal(checksState([ok,{name:'b',status:'in_progress',conclusion:null}]),'pending');
 assert.equal(checksState([ok],true),'pending');assert.equal(checksState([{name:'a',status:'completed',conclusion:'skipped'}]),'none');
});

test('retour : la revue Atelier n\'est reliée que pour le SHA courant ; les anciens SHA sont ignorés',()=>{
 const runs=[{pr_number:7,head_sha:'a'.repeat(40),status:'completed'},{pr_number:7,head_sha:'b'.repeat(40),status:'completed'},{pr_number:8,head_sha:'b'.repeat(40),status:'completed'}];
 const cur=reviewForSha(runs,7,'b'.repeat(40));assert.equal(cur.current.head_sha,'b'.repeat(40));assert.equal(cur.older,1);
 const none=reviewForSha(runs,7,'c'.repeat(40));assert.equal(none.current,null);assert.equal(none.older,2);assert.match(none.label,/2 revue\(s\) d’anciens commits ignorée/);
 assert.equal(reviewForSha(runs,7,null).current,null);
 assert.equal(reviewForSha([{pr_number:7,head_sha:'b'.repeat(40),status:'running'}],7,'b'.repeat(40)).current,null);
});

test('verdict : accepter sans tests verts exige une raison ; une reformulation IA non relue bloque',()=>{
 assert.match(verdictProblem('accepted','red','',false),/écrivez pourquoi/);assert.equal(verdictProblem('accepted','red','Correctif livré à part',false),null);
 assert.equal(verdictProblem('accepted','green','',false),null);assert.equal(verdictProblem('redo','red','',false),null);assert.equal(verdictProblem('abandoned','unread','',false),null);
 assert.match(verdictProblem('accepted','green','',true),/jamais été relue/);
});

test('reformulation IA : réponse JSON stricte, trois champs seulement',()=>{
 assert.deepEqual(parseRephrase('Voici : {"objective":"A","perimeter":"B","done":"C"} fin'),{objective:'A',perimeter:'B',done:'C'});
 assert.equal(parseRephrase('pas de json'),null);assert.equal(parseRephrase('{"objective":"A"}'),null);assert.equal(parseRephrase('{"objective":1,"perimeter":"B","done":"C"}'),null);
 const p=rephrasePrompt(assembleFields(task));assert.match(p,/"objective"/);assert.doesNotMatch(p,/RECETTES_KV/);
});
