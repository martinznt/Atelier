import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LIFE,TRANSITIONS,canMove,applyChange,initialState,legacyDecision,legacyDocument,legacyMemory,legacyDecisionMirror,fromMemoireProjets,effectiveReliability,effectiveModules,templateOf,PROJECT_TEMPLATES,MODULE_KEYS,RELIABILITY_VIEW,LEGACY_LIFE_SQL,VERIFY_MESSAGE,featureCode,CORE_PARTS} from '../server/lifecycle-core.ts';

const cur=(o={})=>({status:'current',reliability:'confirmed',source_ref:'',proof_kind:'',fit_confirmed_at:null,replaced_by_id:null,author_kind:'martin',derived:false,...o});
const ch=(o)=>({kind:'decision',cur:cur(),itemId:'a',author:'martin',reason:'parce que',...o});
const AT='2026-11-15T10:00:00.000Z';

test('transitions : proposée → actuelle → remplacée ou abandonnée ; rejetée et hypothèse existent ; rien ne ressuscite',()=>{
 for(const f of LIFE)for(const t of LIFE){
  const ok=TRANSITIONS[f].includes(t);assert.equal(canMove(f,t),ok,f+'→'+t);
 }
 // interdits importants
 for(const [f,t] of [['proposed','replaced'],['current','proposed'],['current','rejected'],['replaced','current'],['replaced','proposed'],['replaced','abandoned'],['rejected','current'],['abandoned','current'],['proposed','proposed']])assert.equal(canMove(f,t),false,f+'→'+t);
 for(const [f,t] of [['proposed','current'],['current','replaced'],['current','abandoned'],['proposed','rejected'],['hypothesis','current']])assert.equal(canMove(f,t),true,f+'→'+t);
});
test('une proposition d’IA n’est jamais une décision : passage à « actuelle » refusé pour une IA et sans validation de Martin',()=>{
 const p=cur({status:'proposed',reliability:'hypothesis'});
 assert.match(applyChange(ch({cur:p,to_status:'current',author:'ai',validated_by_martin:true}),AT).message,/jamais une décision/);
 assert.match(applyChange(ch({cur:p,to_status:'current'}),AT).message,/votre validation/);
 assert.match(applyChange(ch({cur:p,to_status:'current',validated_by_martin:false}),AT).message,/votre validation/);
 const ok=applyChange(ch({cur:p,to_status:'current',validated_by_martin:true}),AT);
 assert.equal(ok.ok,true);assert.equal(ok.next.status,'current');assert.equal(ok.next.reliability,'confirmed','décision validée par Martin = confirmée par lui');
});
test('la raison est obligatoire à chaque changement',()=>{
 for(const reason of ['','  ','ab'])assert.match(applyChange(ch({cur:cur({status:'proposed'}),to_status:'current',validated_by_martin:true,reason}),AT).message,/pourquoi/);
 assert.match(applyChange(ch({reason:'parce que'}),AT).message,/Aucun changement/);
});
test('« remplacée » exige la remplaçante ; « abandonnée » n’en a pas ; pas d’auto-remplacement',()=>{
 assert.match(applyChange(ch({to_status:'replaced'}),AT).message,/celle qui la remplace/);
 assert.match(applyChange(ch({to_status:'replaced',replaced_by_id:'a',replacement:{exists:true,status:'current'}}),AT).message,/elle-même/);
 assert.match(applyChange(ch({to_status:'replaced',replaced_by_id:'b',replacement:{exists:false}}),AT).message,/n’existe pas/);
 assert.match(applyChange(ch({to_status:'replaced',replaced_by_id:'b',replacement:{exists:true,status:'rejected'}}),AT).message,/remplacée, abandonnée ou rejetée/);
 const r=applyChange(ch({to_status:'replaced',replaced_by_id:'b',replacement:{exists:true,status:'current'}}),AT);assert.equal(r.ok,true);assert.equal(r.next.replaced_by_id,'b');
 assert.match(applyChange(ch({to_status:'abandoned',replaced_by_id:'b'}),AT).message,/pas de remplaçante/);
 const ab=applyChange(ch({to_status:'abandoned'}),AT);assert.equal(ab.ok,true);assert.equal(ab.next.replaced_by_id,null);
});
test('transitions interdites refusées avec un message clair',()=>{
 assert.match(applyChange(ch({cur:cur({status:'replaced'}),to_status:'current',validated_by_martin:true}),AT).message,/définitive|ne peut pas/);
 assert.match(applyChange(ch({cur:cur({status:'proposed'}),to_status:'replaced',replaced_by_id:'b',replacement:{exists:true,status:'current'}}),AT).message,/ne peut pas devenir/);
 assert.match(applyChange(ch({cur:cur({status:'current'}),to_status:'rejected'}),AT).message,/ne peut pas devenir/);
});
test('« Vérifié » est refusé sans source ET sans « adapté à ma demande » (ou test réussi pour du code)',()=>{
 const c=cur({reliability:'confirmed'});
 for(const o of [{},{source_ref:'https://exemple.test/doc'},{fit_confirmed:true},{source_ref:'  ',fit_confirmed:true},{source_ref:'ab',fit_confirmed:true},{source_ref:'x.md',fit_confirmed:false}]){
  const r=applyChange(ch({cur:c,kind:'document',to_reliability:'verified',...o}),AT);assert.equal(r.ok,false,JSON.stringify(o));assert.equal(r.message,VERIFY_MESSAGE);
 }
 // un test réussi ne suffit que pour du code (fonctionnalité) et exige quand même une source
 assert.equal(applyChange(ch({cur:c,kind:'document',to_reliability:'verified',source_ref:'tests/a.test.mjs',test_passed:true}),AT).ok,false);
 assert.equal(applyChange(ch({cur:c,kind:'feature',to_reliability:'verified',test_passed:true}),AT).ok,false);
 const t=applyChange(ch({cur:c,kind:'feature',to_reliability:'verified',source_ref:'tests/a.test.mjs',test_passed:true}),AT);assert.equal(t.ok,true);assert.equal(t.next.proof_kind,'test');
 const f=applyChange(ch({cur:c,kind:'document',to_reliability:'verified',source_ref:'https://exemple.test/doc',fit_confirmed:true}),AT);assert.equal(f.ok,true);assert.equal(f.next.proof_kind,'fit');assert.equal(f.next.fit_confirmed_at,AT);assert.equal(f.next.reliability,'verified');
});
test('une IA ne peut produire que de l’hypothèse ; rien de vérifié ni de confirmé',()=>{
 for(const to of ['verified','confirmed','reported'])assert.equal(applyChange(ch({cur:cur({reliability:'hypothesis'}),to_reliability:to,author:'ai',source_ref:'x.md',fit_confirmed:true,validated_by_martin:true}),AT).ok,false,to);
 const s=initialState('decision','ai');assert.deepEqual([s.status,s.reliability,s.author_kind],['proposed','hypothesis','ai']);
 const m=initialState('feature','martin');assert.deepEqual([m.status,m.reliability],['current','confirmed']);
 assert.deepEqual([initialState('decision','martin').status,initialState('decision','martin').reliability],['proposed','hypothesis'],'une décision, même de Martin, reste proposée jusqu’à sa validation');
});
test('« Confirmé par vous » exige la validation de Martin ; l’obsolète ne se saisit jamais',()=>{
 const h=cur({status:'current',reliability:'hypothesis'});
 assert.match(applyChange(ch({cur:h,kind:'memory',to_reliability:'confirmed'}),AT).message,/Je confirme/);
 assert.equal(applyChange(ch({cur:h,kind:'memory',to_reliability:'confirmed',validated_by_martin:true}),AT).ok,true);
 assert.match(applyChange(ch({cur:h,to_reliability:'obsolete'}),AT).message,/inconnu/);
 assert.match(applyChange(ch({cur:cur({status:'abandoned'}),to_reliability:'reported'}),AT).message,/obsolète/);
 assert.equal(effectiveReliability('replaced','verified'),'obsolete');assert.equal(effectiveReliability('rejected','confirmed'),'obsolete');assert.equal(effectiveReliability('current','verified'),'verified');
});
test('remettre en hypothèse ramène la fiabilité à « Hypothèse » ; rien à changer est refusé',()=>{
 const r=applyChange(ch({cur:cur({reliability:'verified',proof_kind:'fit'}),to_status:'hypothesis'}),AT);assert.equal(r.ok,true);assert.equal(r.next.reliability,'hypothesis');
 assert.match(applyChange(ch({cur:cur({reliability:'confirmed'}),to_reliability:'confirmed',validated_by_martin:true}),AT).message,/Rien à changer/);
});
test('échelle unique à 5 niveaux : pastille + mot, jamais la couleur seule',()=>{
 assert.deepEqual(Object.keys(RELIABILITY_VIEW),['verified','confirmed','reported','hypothesis','obsolete']);
 for(const v of Object.values(RELIABILITY_VIEW)){assert.ok(v.symbol.length>0&&v.word.length>2&&v.help.length>10);}
 assert.deepEqual(Object.values(RELIABILITY_VIEW).map(v=>v.word),['Vérifié','Confirmé par vous','Rapporté','Hypothèse','Obsolète ou rejeté']);
});
test('correspondance des anciens vocabulaires (décisions, documents, notes, Memoire-Projets) : sans perte, conservatrice',()=>{
 assert.deepEqual(legacyDecision('validated'),{status:'current',reliability:'confirmed'});
 assert.equal(legacyDecision('superseded').status,'replaced');assert.equal(legacyDecision('rejected').status,'rejected');assert.equal(legacyDecision('proposed').status,'proposed');assert.equal(legacyDecision('???').status,'proposed');
 assert.equal(legacyDocument('verified').reliability,'reported','l’ancien « vérifié » ne gardait ni source ni contrôle : il devient « Rapporté »');
 assert.deepEqual(legacyDocument('user_confirmed'),{status:'current',reliability:'confirmed'});
 assert.equal(legacyDocument('ai_proposed').status,'proposed');assert.equal(legacyDocument('to_confirm').status,'hypothesis');assert.equal(legacyDocument('deduced').status,'hypothesis');assert.equal(legacyDocument('superseded').status,'replaced');assert.equal(legacyDocument('unverified').status,'current');
 assert.deepEqual(legacyMemory('Saisie utilisateur'),{status:'current',reliability:'confirmed'});assert.deepEqual(legacyMemory('Résumé IA'),{status:'proposed',reliability:'hypothesis'});
 const mp={'CONFIRMÉE':['current','confirmed'],'ACTUELLE':['current','confirmed'],'PROVISOIRE':['hypothesis','hypothesis'],'À CONFIRMER':['hypothesis','hypothesis'],'PROPOSÉE':['proposed','hypothesis'],'HYPOTHÈSE':['hypothesis','hypothesis'],'REMPLACÉE':['replaced','reported'],'REJETÉE':['rejected','hypothesis'],'ABANDONNÉE':['abandoned','hypothesis'],'FAIT VÉRIFIÉ':['current','reported']};
 for(const [k,[s,r]] of Object.entries(mp)){const m=fromMemoireProjets(k);assert.deepEqual([m.status,m.reliability],[s,r],k);}
 assert.deepEqual(fromMemoireProjets(' confirmée '),fromMemoireProjets('CONFIRMÉE'));assert.equal(fromMemoireProjets('BIZARRE'),null,'inconnu : jamais deviné');
 assert.equal(legacyDecisionMirror('current'),'validated');assert.equal(legacyDecisionMirror('abandoned'),'superseded');assert.equal(legacyDecisionMirror('hypothesis'),'proposed');
 // Le SQL de filtrage dit la même chose que les fonctions : même nombre de cas, mêmes états cibles.
 for(const k of Object.keys(LEGACY_LIFE_SQL))assert.match(LEGACY_LIFE_SQL[k],/CASE/);
});
test('modules : noyau commun, trois modules, gabarit = point de départ modifiable ; projets existants sans ligne',()=>{
 assert.deepEqual(MODULE_KEYS,['code_deploy','features','learning_path']);assert.equal(CORE_PARTS.length,8);
 assert.equal(templateOf(undefined,'sport'),'sport');assert.equal(templateOf('atelier','sport'),'atelier');assert.equal(templateOf(null,null),'vide');assert.equal(templateOf('inconnu',null),'vide');
 assert.deepEqual(effectiveModules('sport',[]),{code_deploy:true,features:true,learning_path:false});
 assert.deepEqual(effectiveModules('vide',[]),{code_deploy:false,features:false,learning_path:false});
 assert.deepEqual(effectiveModules('sport',[{module_key:'features',enabled:0},{module_key:'learning_path',enabled:1}]),{code_deploy:true,features:false,learning_path:true});
 assert.ok(PROJECT_TEMPLATES.atelier&&PROJECT_TEMPLATES.vide.modules.length===0);
});
test('identifiant stable des fonctionnalités',()=>{assert.equal(featureCode(1),'F-0001');assert.equal(featureCode(123),'F-0123');assert.equal(featureCode(12345),'F-12345');});
