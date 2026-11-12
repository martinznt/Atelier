import test from 'node:test';import assert from 'node:assert/strict';
import {recommend,adviceLine,parseStatusline,readingState,triggeredAlerts,parseWorkReport,checkpointText,checkpointGaps,REPORT_TEMPLATE} from '../server/claude-advisor.ts';
import {devPrompt} from '../server/workbench-core.ts';

test('le travail courant va à Sonnet en effort moyen, et les valeurs absentes sont déclarées supposées',()=>{
 const a=recommend({});assert.equal(a.model,'sonnet');assert.equal(a.effort,'medium');assert.equal(a.assumed.length,3);assert.equal(a.verification,'automated_tests');
 assert.equal(recommend({kind:'fix',complexity:'simple',importance:'normal'}).effort,'low');
 const c=recommend({kind:'development',complexity:'complex',importance:'normal'});assert.equal(c.model,'sonnet');assert.equal(c.effort,'high');
});
test('une vérification mécanique ne consomme aucun modèle',()=>{
 const a=recommend({kind:'mechanical_check',complexity:'hard',importance:'critical'});assert.equal(a.model,'none');assert.equal(a.effort,null);assert.equal(a.cost_risk,'low');assert.equal(a.verification,'automated_tests');
 assert.match(adviceLine(a),/test automatisé/);
});
test('Haiku seulement pour le classement simple à faible enjeu ; repli Sonnet faible s’il est indisponible',()=>{
 assert.equal(recommend({kind:'classification',complexity:'simple',importance:'low'}).model,'haiku');
 const s=recommend({kind:'classification',complexity:'simple',importance:'low',haiku_available:false});assert.equal(s.model,'sonnet');assert.equal(s.effort,'low');
 assert.equal(recommend({kind:'classification',complexity:'simple',importance:'high'}).model,'sonnet');
});
test('Opus est réservé aux vérifications importantes, pas aux relectures ordinaires ni aux modifications simples',()=>{
 assert.equal(recommend({kind:'review',complexity:'ordinary',importance:'normal'}).model,'sonnet');
 assert.equal(recommend({kind:'audit',complexity:'ordinary',importance:'high'}).model,'opus');
 assert.equal(recommend({kind:'fix',complexity:'simple',importance:'critical'}).model,'sonnet');
 assert.equal(recommend({kind:'fix',complexity:'simple',importance:'critical'}).verification,'tests_then_independent_review');
});
test('Fable seulement pour un blocage réel ; un échec non analysé ne fait pas monter en gamme',()=>{
 assert.equal(recommend({kind:'development',complexity:'hard',importance:'high'}).model,'opus');
 assert.equal(recommend({kind:'architecture',complexity:'hard',importance:'high'}).model,'fable');
 const raw=recommend({kind:'blocker',complexity:'hard',importance:'high',failed_attempts:2,failure_analysed:false});
 assert.equal(raw.model,'sonnet');assert.ok(raw.warnings.some(w=>/sans analyse/.test(w)));
 assert.equal(recommend({kind:'development',complexity:'hard',importance:'high',failed_attempts:2,failure_analysed:true}).model,'fable');
});
test('le risque de coût et les économies sont expliqués',()=>{
 const a=recommend({kind:'development',complexity:'ordinary',importance:'normal',whole_repo:true,has_files:false,has_tests:false,has_objective:false,has_acceptance:false});
 assert.equal(a.cost_risk,'high');assert.ok(a.warnings.some(w=>/tout le dépôt/.test(w)));assert.ok(a.savings.length>=3);
 assert.equal(recommend({kind:'development',complexity:'ordinary',importance:'normal',files_count:3}).cost_risk,'low');
 assert.equal(recommend({kind:'development',complexity:'ordinary',importance:'normal',files_count:20}).cost_risk,'high');
});
test('ligne d’état : seules les limites présentes sont lues, rien n’est complété',()=>{
 const at='2026-11-12T20:00:00.000Z';
 const ok=parseStatusline(JSON.stringify({model:{display_name:'Sonnet 5.5'},cost:{total_cost_usd:1.25},rate_limits:{five_hour:{used_percentage:23.54,resets_at:1794532200},seven_day:{used_percentage:41.2}}}),at);
 assert.equal(ok.error,null);assert.equal(ok.readings.length,2);assert.equal(ok.readings[0].scope,'session_5h');assert.equal(ok.readings[0].used_percent,23.5);
 assert.equal(ok.readings[0].resets_at,new Date(1794532200*1000).toISOString());assert.equal(ok.readings[1].resets_at,null);assert.equal(ok.model,'Sonnet 5.5');assert.equal(ok.cost_usd,1.25);
 assert.match(parseStatusline('{"model":{"id":"x"}}',at).error,/aucune limite/);
 assert.match(parseStatusline('pas du json',at).error,/JSON valide/);
 assert.equal(parseStatusline(JSON.stringify({rate_limits:{five_hour:{used_percentage:140}}}),at).readings.length,0);
});
test('un relevé dont la fenêtre est passée est périmé et ne déclenche plus d’alerte',()=>{
 const r={scope:'session_5h',model_family:'all',used_percent:92,resets_at:'2026-11-12T21:00:00.000Z',observed_at:'2026-11-12T19:00:00.000Z',source:'usage_screen'};
 const live=readingState(r,'2026-11-12T20:00:00.000Z'),old=readingState(r,'2026-11-12T22:00:00.000Z');
 assert.equal(live.state,'current');assert.equal(old.state,'expired');assert.match(old.label,/inconnue/);
 assert.equal(readingState({...r,resets_at:null},'2026-11-12T20:00:00.000Z').state,'no_reset');
 const rules=[{scope:'session_5h',model_family:'all',threshold:80,enabled:true}];
 assert.equal(triggeredAlerts([live],rules).length,1);assert.equal(triggeredAlerts([old],rules).length,0);
 assert.equal(triggeredAlerts([live],[{...rules[0],enabled:false}]).length,0);assert.equal(triggeredAlerts([live],[{...rules[0],threshold:95}]).length,0);
 assert.equal(triggeredAlerts([{...live,used_percent:null}],rules).length,0);
});
test('le retour de Claude Code est classé par titre ; le reste est conservé à part',()=>{
 const p=parseWorkReport('Bonjour\n## Modifications effectuées\n- a.ts corrigé\n## Fichiers modifiés\nweb/a.ts\n## Tests réellement exécutés\nnpm test : 62/62\n## Résultats\nOK\n## Problèmes non résolus\nSafari non testé\n## Décisions prises\naucune\n## Prochaines étapes\nPR à relire\n## Divers\nautre');
 assert.equal(p.found,7);assert.equal(p.fields.changes,'- a.ts corrigé');assert.equal(p.fields.files_modified,'web/a.ts');assert.equal(p.fields.tests_run,'npm test : 62/62');
 assert.equal(p.fields.unresolved,'Safari non testé');assert.equal(p.fields.next_steps,'PR à relire');assert.match(p.unmatched,/Bonjour/);assert.match(p.unmatched,/autre/);
 assert.equal(parseWorkReport('texte libre sans titre').found,0);
 assert.equal(parseWorkReport(REPORT_TEMPLATE).found,7);
 assert.equal(parseWorkReport('**Tests exécutés** :\nnode --test').fields.tests_run,'node --test');
});
test('point de reprise : texte complet, manques signalés, aucun test supposé',()=>{
 const c={title:'Quotas',project:'Atelier',objective:'Suivre les quotas',done:'Migration',remaining:'Interface',decisions:'',files_modified:'server/x.ts',errors:'',tests:'',next_action:'Écrire la route'};
 const t=checkpointText(c);for(const h of ['Objectif','Terminé','Reste à faire','Décisions importantes','Fichiers modifiés','Erreurs rencontrées','Tests effectués','Prochaine action exacte'])assert.ok(t.includes('## '+h),h);
 assert.match(t,/ne rien supposer testé/);assert.deepEqual(checkpointGaps(c),[]);
 assert.deepEqual(checkpointGaps({...c,objective:'',next_action:'',done:'',remaining:''}),['objectif','prochaine action exacte','ce qui est terminé ou ce qui reste']);
});
test('le dossier de travail porte contraintes, interdits, déjà vérifié, travail précédent et format de retour',()=>{
 const p=devPrompt({project:'Atelier',task:{title:'T',objective:'O',acceptance:'A',context:'',files_hint:'server/a.ts',tests:'npm test',risks:'',next_action:'',owner:'claude_code',constraints_text:'Migrations additives',do_not_touch:'worker.js',already_verified:'tsc propre',difficulties:'D1 local'},
  repository:null,decisions:[],dependencies:[],advice:{line:'Sonnet 5.5 · effort moyen',verification:'Tests automatisés',reasons:['Travail courant'],warnings:[]},
  previous:{worked_at:'2026-11-12T10:00:00Z',outcome:'partial',results:'route écrite',unresolved:'tests manquants',tests_run:'',files_modified:'server/a.ts'},checkpoint:{title:'CP',next_action:'écrire le test',remaining:'tests'}});
 for(const s of ['Sonnet 5.5 · effort moyen','Migrations additives','## Fichiers à ne surtout pas modifier','worker.js','## Déjà vérifié (ne pas refaire)','route écrite','ne pas refaire ces analyses','écrire le test','D1 local','Ne pas relire tout le dépôt','## Tests réellement exécutés'])assert.ok(p.includes(s),s);
 assert.equal(parseWorkReport(p.slice(p.indexOf('## Modifications effectuées'))).found,7);
});
