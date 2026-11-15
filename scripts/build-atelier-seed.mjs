/* Lot 4 — fabrique le fichier de départ « Atelier dans Atelier » : docs/atelier-dans-atelier/atelier-depart.json.
   Rien n'est inventé : chaque fonctionnalité vient d'un groupe d'exigences de docs/EXIGENCES.json (statuts DÉCLARÉS, donc « Rapporté »),
   d'un rapport de lot du dépôt, ou d'une liste de constats écrite à la main plus bas (banc d'essai du lot 4).
   « Vérifié » n'est posé que sur une liste courte de fonctionnalités dont un test existant est cité (le fichier du test est contrôlé ici).
   Usage : node scripts/build-atelier-seed.mjs [--commit <sha40>] [--check]   (--check : n'écrit rien, échoue si le fichier diffère) */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {auditAll} from './requirements-audit.mjs';
import {FINDINGS} from './atelier-seed-findings.mjs';

const OUT='docs/atelier-dans-atelier/atelier-depart.json';
const arg=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:undefined;};
const COMMIT=arg('--commit')||'fb195cee390202854a103630a38f8558ccd32f4e';
const list=JSON.parse(readFileSync('docs/EXIGENCES.json','utf8')),audit=auditAll(list);
const cahier=readFileSync('docs/CAHIER_DES_CHARGES.md','utf8');
const heading=new Map([...cahier.matchAll(/^## (\d+)\. (.+)$/gm)].map(m=>[Number(m[1]),m[2].trim()]));
const nice=s=>{const t=s.replace(/\s*—\s*\d+ \w+ 2026\s*$/,'').toLowerCase();return (t.charAt(0).toUpperCase()+t.slice(1)).replace(/\bgithub\b/g,'GitHub').replace(/\bia\b/g,'IA').replace(/\bpwa\b/g,'PWA').replace(/\bd1\b/gi,'D1');};

/* ───── 1. Un groupe d'exigences = une fonctionnalité ───── */
const groups=new Map();
list.forEach((r,i)=>{const k=r.id.replace(/-\d+$/,'');if(!groups.has(k))groups.set(k,[]);groups.get(k).push({r,a:audit[i]});});
const LABEL={'PIL-28':'Poste de pilotage (mission du 12 novembre)','QCL-29':'Quotas Claude Code et conseil de modèle','HIS-30':'Analyse de l’historique par Gemini, Groq et Mistral','FIN-31':'Finalisation : import d’archives, recherche, contexte','P0-32':'Import d’historique fiable (mission P0)','SIT-33':'Modèle de projet (exigences du lot 1)','INT-34':'Interface lisible, étape A (exigences du lot 2)','MIS-35':'Missions pour Claude Code (exigences du lot 3)'};
const GROUPNAME=k=>/^REQ-/.test(k)?'Cahier des charges':/^RF-/.test(k)?'Refonte gratuite':'Missions et lots';
function stateOf(items){
 const c={};for(const {r} of items)c[r.statut]=(c[r.statut]||0)+1;
 const done=(c['réalisé']||0)+(c['vérifié']||0),n=items.length;
 if(c['à faire']===n)return 'to_design';
 if(c['bloqué']===n)return 'blocked';
 if(!done)return c['bloqué']?'blocked':'in_progress';
 return done===n?'done':'in_progress';
}
const features=[];
for(const [k,items] of groups){
 if(k==='REQ-00'||/^ADA-/.test(k))continue; // préambule ; et les exigences du lot 4 lui-même (déjà la fonctionnalité « Lot 4 »)
 const num=/^REQ-(\d+)$/.exec(k);
 const name=num?'§'+Number(num[1])+' — '+nice(heading.get(Number(num[1]))||k):LABEL[k]||('Refonte gratuite '+k+' — '+items[0].r.exigence.replace(/\s+/g,' ').slice(0,70).replace(/\s\S*$/,'')+'…');
 const c={};for(const {r} of items)c[r.statut]=(c[r.statut]||0)+1;
 const lv={};for(const {a} of items)lv[a.level]=(lv[a.level]||0)+1;
 const limit=items.map(x=>String(x.r.limite||'').trim()).find(x=>x&&!/^Code ou document présent/.test(x))||'';
 const state=stateOf(items);
 const desc=`${items.length} exigence(s) : ${Object.entries(c).map(([s,n])=>n+' '+s).join(', ')} (statuts déclarés dans docs/EXIGENCES.json). Contrôle mécanique des preuves : ${Object.entries(lv).map(([s,n])=>n+' '+s).join(', ')}.${limit?' Limite déclarée : '+limit.replace(/\s+/g,' ').slice(0,260):''}`.slice(0,3000);
 features.push({key:k.toLowerCase(),name:name.slice(0,140),description:desc,state,group:GROUPNAME(k),source_kind:'repo_file',source_ref:`docs/EXIGENCES.json (${items[0].r.id} à ${items[items.length-1].r.id})`,reliability:'reported',test_ref:''});
}

/* ───── 2. Fonctionnalités des lots 0 à 3 : « Vérifié » seulement avec un test existant cité ───── */
const L=(key,name,description,state,source_ref,reliability='reported',test_ref='')=>({key,name,description,state,group:'Lots déjà faits',source_kind:'repo_file',source_ref,reliability,test_ref});
const lots=[
 L('lot-0-fiabilite','Lot 0 — Fiabilité et mesure','Contrôles de base, sauvegarde puis restauration locale, essai de l’import sur la vraie archive (en local).','done','docs/audits/RAPPORT_LOT_0_2026-11-15.md'),
 L('lot-1-modele','Lot 1 — Modèle de projet','Cycle de vie, niveaux de fiabilité, modules, suivi des fonctionnalités (migration 0023).','done','docs/audits/RAPPORT_LOT_1_2026-11-15.md'),
 L('lot-2a-interface','Lot 2, étape A — Interface lisible','Textes agrandis, libellés, journal unique, aide intégrée, raccourcis.','done','docs/audits/RAPPORT_LOT_2_2026-11-15.md'),
 L('lot-2b-interface','Lot 2, étape B — Regrouper les rubriques','Non commencée : elle attend l’accord « étape A validée, lance B ».','to_design','docs/audits/RAPPORT_LOT_2_2026-11-15.md'),
 L('lot-3-missions','Lot 3 — Missions pour Claude Code','Missions, registre des travaux, retour de PR, verdict (migration 0024).','done','docs/audits/RAPPORT_LOT_3_2026-11-15.md'),
 L('lot-4-banc-essai','Lot 4 — Atelier dans Atelier (banc d’essai)','Ce lot : fichier de départ, import sans doublon, guide, mission du lot 5A générée en local.','in_progress','docs/audits/RAPPORT_LOT_4_2026-11-15.md'),
 L('lot-5a-liaison','Lot 5A — Relier Sport et Livre de recettes (lecture seule)','Le contenu exact est à confirmer par Martin. Éléments connus : lier les deux dépôts en lecture seule ; brancher la correspondance des statuts de Memoire-Projets à la lecture des documents Git.','to_design','docs/CORRESPONDANCE_STATUTS.md (ligne « lot 5A ») et docs/OU_VIT_QUOI.md'),
 L('lot-5b-a-preciser','Lot 5B — contenu à préciser par Martin','Le contenu du lot 5B n’est écrit dans aucun fichier du dépôt : Atelier ne l’invente pas.','to_design','Message de mission du lot 4 (nom seulement)','reported'),
 L('studio-a-preciser','Studio — contenu à préciser par Martin','Cité comme étape suivante (« Atelier dans Atelier, puis Sport/Recettes, puis studio ») ; aucun cahier des charges écrit.','to_design','Message de mission du lot 4 (nom seulement)'),
 L('d7-routage-modeles','Tableau de routage des modèles par mission (D7)','Bloqué : D7 n’a pas été validée explicitement par Martin ; aucun classement de modèles n’est inventé.','blocked','docs/EXIGENCES.json (MIS-35-014)'),
 L('cycle-de-vie','Cycle de vie des informations sans suppression','États proposée, actuelle, remplacée, abandonnée, rejetée, hypothèse ; raison obligatoire ; une IA ne valide jamais.','done','docs/audits/RAPPORT_LOT_1_2026-11-15.md §1','verified','tests/lifecycle-core.test.mjs'),
 L('verifie-sans-source-refuse','« Vérifié » refusé sans source précise','Passer à « Vérifié » exige une source et soit « adapté à ma demande », soit un test réussi.','done','server/lifecycle-core.ts (VERIFY_MESSAGE) ; docs/audits/RAPPORT_LOT_1_2026-11-15.md §3 (c)','verified','tests/lifecycle-core.test.mjs'),
 L('migration-0023-sans-perte','Migration 0023 : projets existants identiques','Aucune ancienne ligne n’est réécrite ; six tables vides ajoutées.','done','docs/audits/RAPPORT_LOT_1_2026-11-15.md §3 (a)','verified','tests/migration-0023.test.ts'),
 L('suivi-fonctionnalites','Suivi des fonctionnalités (numéro stable F-0001…)','Nom, état, source, niveau de fiabilité, groupe, liens ; le numéro n’est jamais réutilisé.','done','server/routes/model.ts ; docs/audits/RAPPORT_LOT_1_2026-11-15.md §1','verified','tests/integration.test.ts'),
 L('ou-vit-quoi','Où vit quoi : recherche unique, origine Git ou Atelier','Chaque résultat dit d’où il vient ; l’écriture dans Git est interdite.','done','docs/OU_VIT_QUOI.md','verified','tests/info-placement.test.mjs'),
 L('regles-depot-sans-perte','Règles du dépôt reprises sans perte dans une mission','Chaque ligne de AGENTS.md / CLAUDE.md est retenue ou ignorée avec sa raison, jamais perdue.','done','server/mission-core.ts ; docs/audits/RAPPORT_LOT_3_2026-11-15.md §2','verified','tests/mission-core.test.mjs'),
 L('mission-figee-registre-verdict','Mission figée, copie, registre des travaux, verdict','Le texte copié est identique au texte figé ; « Envoyé » n’existe pas ; verdict avec preuve.','done','server/routes/missions.ts ; docs/audits/RAPPORT_LOT_3_2026-11-15.md §2','verified','tests/missions.test.ts'),
 L('migration-0024-sans-perte','Migration 0024 : table des missions, rien d’existant touché','Table vide ajoutée ; anciennes tables identiques.','done','migrations/0024_missions.sql','verified','tests/migration-0024.test.ts'),
 L('conseil-de-modele','Conseil de modèle : Sonnet par défaut, Opus réservé','Règles écrites, pas une mesure de performance.','done','server/claude-advisor.ts ; docs/QUOTAS_CLAUDE.md','verified','tests/claude-advisor.test.mjs'),
 L('archives-hostiles-refusees','Lecture d’archives ZIP : archives hostiles refusées','Archive tronquée, malformée ou aux noms dangereux : refus net.','done','docs/IMPORT_HISTORIQUE.md','verified','tests/zip-reader.test.mjs'),
 L('analyse-historique-sans-perte','Analyse de l’historique : découpage sans perte, citations contrôlées','Le découpage garde l’ordre, rien n’est perdu ; une citation est vérifiée contre le message d’origine.','done','docs/ANALYSE_HISTORIQUE.md','verified','tests/history-analysis.test.mjs')
];
features.push(...lots,...FINDINGS);

/* ───── 3. Décisions : recopiées comme « Proposées ». Martin les valide lui-même. Seuls les sens retrouvés dans le dépôt sont écrits. ───── */
const NOTEXT='Le texte de la question n’est écrit dans aucun fichier du dépôt : à compléter par Martin avant de valider.';
const dec=(key,title,reason,source_ref)=>({key,title,reason,source_ref});
const decisions=[
 dec('d1','D1 — réponse B2',NOTEXT,'Message de mission du lot 4 (« D1 = B2 »)'),
 dec('d2','D2 — tout gratuit, plafond 0 €','Aucun service payant, aucune clé payante, pas de R2. Chaque utilisateur d’IA utilise ses propres clés.','Message de mission du lot 4 ; docs/REFONTE_GRATUITE.md ; AGENTS.md'),
 dec('d3','D3 — réponse B : niveaux de fiabilité','Les cinq niveaux de fiabilité du lot 1 (Vérifié, Confirmé par vous, Rapporté, Hypothèse, Obsolète ou rejeté).','docs/audits/RAPPORT_LOT_1_2026-11-15.md §1 ; message de mission du lot 4 (« D3 = B »)'),
 dec('d4','D4 — réponse B : noyau commun et modules','Un noyau commun à tout projet et des modules activables ; gabarits modifiables.','docs/audits/RAPPORT_LOT_1_2026-11-15.md §1 ; message de mission du lot 4 (« D4 = B »)'),
 dec('d5','D5 — réponse C : où vit quoi','Table « quelle information vit où » (Git = rédigé et durable, Atelier = vivant) ; un fait = une source de vérité.','docs/OU_VIT_QUOI.md ; message de mission du lot 4 (« D5 = C »)'),
 dec('d6','D6 — réponse B : cycle de vie','États proposée, actuelle, remplacée, abandonnée, rejetée, hypothèse ; rien n’est supprimé.','docs/audits/RAPPORT_LOT_1_2026-11-15.md §1 ; message de mission du lot 4 (« D6 = B »)'),
 dec('d8','D8 — réponse C : mission courte par défaut, dossier complet pour un gros travail','Deux niveaux de mission.','docs/EXIGENCES.json (MIS-35) ; message de mission du lot 4 (« D8 = C »)'),
 dec('d9','D9 — réponse B',NOTEXT,'Message de mission du lot 4 (« D9 = B »)'),
 dec('d10','D10 — réponse C',NOTEXT,'Message de mission du lot 4 (« D10 = C »)'),
 dec('d10bis','D10 bis — réponse B',NOTEXT,'Message de mission du lot 4 (« D10bis = B »)'),
 dec('d11','D11 — réponse B',NOTEXT,'Message de mission du lot 4 (« D11 = B »)'),
 dec('d12','D12 — réponse B',NOTEXT,'Message de mission du lot 4 (« D12 = B »)')
];
for(const f of features)if(f.test_ref&&!existsSync(f.test_ref)){console.error('Test cité introuvable :',f.test_ref,'pour',f.key);process.exit(1);}
const seed={format:'atelier-depart',version:1,
 project:{name:'Atelier',repo:'martinznt/Atelier',pinned_commit:COMMIT,note:'Dépôt à relier en LECTURE SEULE (Pilotage → Dépôt). Commit de référence au moment de la préparation du fichier ; Atelier fige lui-même le commit lu à chaque mission.'},
 features,decisions};
const text=JSON.stringify(seed,null,1)+'\n';
if(process.argv.includes('--check')){const cur=existsSync(OUT)?readFileSync(OUT,'utf8'):'';if(cur!==text){console.error('Le fichier de départ n’est pas à jour : relancer node scripts/build-atelier-seed.mjs');process.exit(1);}console.log('Fichier de départ à jour :',features.length,'fonctionnalités,',decisions.length,'décisions');}
else{mkdirSync('docs/atelier-dans-atelier',{recursive:true});writeFileSync(OUT,text);console.log('écrit',OUT,':',features.length,'fonctionnalités,',decisions.length,'décisions,',text.length,'octets');}
