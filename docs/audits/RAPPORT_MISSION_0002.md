# Rapport de mission PROMPT-CLAUDECODE-0002 — 12 novembre 2026

Toutes les affirmations « exécuté » ci-dessous ont réellement tourné dans la session, en local. Rien n’a été fusionné, publié ni migré à distance.

## 1. Commits
- Départ : `main` `9219114240208cc51c65298ceeb9c13ddf9be3df`.
- Branche : `feat/atelier-poste-de-pilotage`. Le commit final est la tête de la PR (ce fichier ne peut pas contenir son propre SHA).

## 2. Manifeste et lecture
`docs/audits/MANIFESTE_2026-11-12.md` : 224 fichiers suivis, liste non tronquée. Lus intégralement : 20 (écrits pendant la mission). Lus par segments : 12. Métadonnées seulement : 2. Analysés par outil : 190. **Ce n’est pas un audit intégral du dépôt** ; l’audit ligne à ligne des fichiers existants reste à faire.
Référentiel `Memoire-Projets` : branche `feat/atelier-workbench-complete-blueprint`, commit `00e453aeee240b22116533fe9039ca7297543ed8`, 115 fichiers ; lus intégralement : les quatre documents de `02_ATELIER` et `00_PILOTAGE/ETAT_GLOBAL.md`. Le reste n’a pas été lu.

## 3. Lots
| Lot | État |
|---|---|
| 0 Audit de départ | **Partiel** : manifeste et réconciliation des exigences faits ; pas de lecture intégrale du code existant |
| 1 Socle (migration 0018, règles pures) | Livré |
| 2 Accueil, À faire par Martin, Questions | Livré |
| 3 Discussions organisées, recherche, liens | Livré ; proposition automatique d’extraction non faite |
| 4 Référentiel mémoire en lecture seule | Livré, **testé en simulation seulement** |
| 5 Bibliothèque de prompts | Livré |
| 6 Import et inventaire d’export ChatGPT | Livré pour l’inventaire, les lots et la couverture ; analyses automatiques croisées **non commencées** |
| 7 Documents de référence, consignes depuis une tâche | Livré |
| 8 Audit de référence | Livré, **testé en simulation seulement** |
| 9 Tests, mobile, documentation | Livré dans les limites du point 7 |
| Quotas et capacités réelles | **Non commencé** |

## 4. Modules, routes, migration
Voir `docs/ARCHITECTURE.md`, section « Poste de pilotage ». Migration unique : `migrations/0018_workbench.sql`, additive.

## 5. Exigences
465 exigences historiques : identifiants et statuts inchangés (160 à faire, 244 réalisé, 20 vérifié, 41 bloqué). 25 nouvelles : `PIL-28-001` à `PIL-28-025` (22 réalisé, 2 à faire, 1 bloqué). Aucune n’est marquée « vérifié » : aucune n’a été constatée par Martin en usage réel.

## 6. Tests réellement exécutés
`tsc --noEmit` ; `npm test` 62/62 ; `node --test tests/*.test.mjs` 286/286 ; `npm run test:regressions` ; `npm run test:core` ; `npm run test:bridge` 27/27 ; `npm run build` ; migration 0018 sur base locale neuve ; parcours navigateur réel 360 et 390 px ; `tests/e2e/flow.spec.ts` en Chromium bureau et 360 px.

## 7. Simulé ou non exécuté
Simulé : tous les appels GitHub. Non exécuté : WebKit, Firefox, Galaxy A05s, hors connexion réel, production, export ChatGPT réel, toute IA réelle. La commande `/usage` n’a pas pu être lancée : un agent ne peut pas exécuter de commande à barre oblique ; l’état des quotas est donc inconnu de ma part.

## 8. Mobile
Aucun débordement horizontal et aucun contrôle de moins de 30 px sur les neuf écrans parcourus à 360 et 390 px (Chromium). La barre du bas a quatre entrées et « Plus ».

## 9. Mémoire synchronisée
Non. Le code existe ; la première synchronisation réelle dépend de l’action 3 du point 12.

## 10. Export ChatGPT
Atelier est prêt à inventorier l’archive. L’archive n’est pas disponible (lien en « Not found » selon l’état global du 11 novembre). Aucune analyse de l’export n’a eu lieu.

## 11. Questions pour Martin
1. Quel est le dépôt exact de Sport / Mes séances ? Je ne l’ai jamais vu confirmé et je ne le devine pas.
2. Voulez-vous fusionner cette PR maintenant (la migration 0018 s’appliquera à la publication), ou la recetter d’abord en lisant les guides ?
3. Le référentiel mémoire doit-il suivre `main` ou la branche `feat/atelier-workbench-complete-blueprint` ?
4. Pour le 17 novembre : quelles fonctions sont indispensables dans Sport et dans Livre de recettes ? Sans cette liste, « terminé » ne peut pas être mesuré.

## 12. Actions de Martin, dans l’ordre
1. Relire la PR et dire « fusionne » si vous l’acceptez.
2. Après publication : ouvrir `/api/health` et vérifier que 0018 est appliquée.
3. Réglages → Connexions : vérifier que le jeton GitHub voit `Memoire-Projets` en lecture ; puis Mémoire → connecter et synchroniser.
4. Pilotage : associer le dépôt de chaque projet ; lancer un audit de référence.
5. Redemander l’export ChatGPT (le lien précédent ne fonctionnait pas) et le charger dans Mémoire → Export ChatGPT.
6. Tester sur le Galaxy A05s et noter ce qui gêne.

## 13. Blocages
Écriture dans `Memoire-Projets` non accordée ; dépôt Sport non confirmé ; export ChatGPT indisponible ; aucune connexion réelle pour valider les appels GitHub.

## 14. Chemin vers le mardi 17 novembre — avis franc
Atelier ne code pas les deux sites : il organise le travail. Il reste cinq jours. D’après l’état global du 10 novembre, Livre de recettes avait 10 PR ouvertes et 89 branches, et Sport attendait encore son audit ligne à ligne et sa recette métier. **Terminer complètement les deux sites pour le 17 n’est pas réaliste si « terminé » inclut un audit intégral et une recette sur téléphone de tout.** Ce qui est réaliste :
- Jeudi 12 – vendredi 13 : fusion de cette PR, synchronisation mémoire, audits de référence des deux dépôts, liste fermée des fonctions indispensables (question 4).
- Samedi 14 – dimanche 15 : Livre de recettes — fermer ou fusionner les PR ouvertes une à une avec la revue Atelier ; création et réalisation des recettes d’abord.
- Lundi 16 : Sport — corrections sur la liste fermée, tests, recette sur téléphone.
- Mardi 17 : recette finale des deux sites par Martin, corrections bloquantes uniquement.
Tout ce qui sort de la liste fermée passe après le 17. Les quotas des IA peuvent décaler ce plan ; je ne les connais pas.

## 15. Reprise
`git fetch origin feat/atelier-poste-de-pilotage` ; lire le haut de `docs/AVANCEMENT.md` ; `npm install` ; `npm run setup && npm run db:migrate` ; contrôles du point 6. Suite logique : `PIL-28-015` (analyses croisées), `PIL-28-024` (quotas), proposition automatique d’extraction, audit ligne à ligne du code existant.

## Texte proposé pour Memoire-Projets (non écrit, faute d’accès)
« 12 novembre 2026 — Atelier : PR du poste de pilotage ouverte, non fusionnée, depuis `main` `9219114`. Livré en code et tests locaux : accueil, actions, questions, discussions organisées, référentiel mémoire en lecture seule, prompts versionnés, inventaire d’export, documents de référence, audit de référence. Non prouvé en réel : appels GitHub, export ChatGPT, téléphone. PROMPT-CLAUDECODE-0002 : transmis par Martin le 12 novembre, réponse reçue sous forme de PR. »
