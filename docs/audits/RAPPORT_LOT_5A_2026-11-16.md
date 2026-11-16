# Rapport du lot 5A — Sport et Livre de recettes suivis dans Atelier (lecture seule), 16 novembre 2026

Niveaux : **V** = exécuté ou lu à la source par moi ; **R** = rapporté (écrit ailleurs, non rejoué) ; **H** = hypothèse.
Environnement : Node 22.23 (le dépôt demande 24), `npm ci` réussi, Chromium préinstallé. **Rien fusionné, rien appliqué en production, aucune migration, aucun secret, aucun appel réel à GitHub ou à une IA.** Aucune écriture dans les dépôts lus.
Commits lus : Livre-de-recettes `92ec7c54c9987d52fcaa0f838dce01d60c3c7f50` ; Sport `f0ef3b008e38f54b28c49d8f1ae9605d07298f29` (V : ce sont les têtes de `main` sur GitHub le 16 novembre).

## 1. Prérequis
| Prérequis | État |
|---|---|
| Lots 0, 1, 3, 4 terminés et fusionnés | **V** : `git log` d'Atelier (PR 44, 47/49, 50) ; rapports des lots 0 à 4 lus |
| Module « Suivi des fonctionnalités », générateur de missions, guide et fichier de départ | **V** : présents et testés (146 tests vitest du lot 4 toujours verts) |
| Import réel de l'export par Martin (bilan, intégrité, plafond 50 Mo) | **NON FAIT en production.** Le lot 0 a mesuré en **local** (137 conversations, 7,62 Mio de texte sur 50 Mio, R du rapport du lot 0) ; Martin n'a pas importé en réel (R, rapports du lot 4). → écrit : **« conversations de l'export : non importées »**. |
| Lecture GitHub réelle (jeton de Martin) | **NON FAITE** (R, lots 3 et 4). Tout ce qui en dépend est **fait en simulation**. |
Conformément à la consigne, le reste a été fait avec les documents des dépôts.

## 2. Ce qui a été fait
| Tâche | Résultat |
|---|---|
| 1. Relier en lecture seule | **Simulation seulement.** Les règles des deux dépôts sont lues par le générateur du lot 3 dans un GitHub simulé qui sert les **vrais** fichiers racine (arbre, empreintes et contenus lus avec `git show` au commit épinglé). Marche (V) : Recettes → `AGENTS.md` et `CLAUDE.md` retrouvés, mission figée ; Sport → aucun fichier de règles, absence signalée. Non essayé : le jeton réel. |
| 2. Préparer le tri de l'export | Guide `docs/sites/GUIDE_MARTIN_5A.md` §C (outil existant « Conversations et lots » : recherche, cases, projet à confirmer, aperçu, raison d'écarter). **Aucune conversation lue ni copiée.** |
| 3. Suivi des fonctionnalités | `docs/sites/recettes-depart.json` : **120** fonctionnalités + 4 règles proposées ; `sport-depart.json` : **36** + 1. Source = fichier, ligne, commit. Niveau « Rapporté » partout. Fabriqués par `scripts/build-sites-seed.mjs`. |
| 4. Contradictions | `docs/sites/A_TRANCHER.md` (13 points). |
| 5. Missions | `docs/sites/MISSION_RECETTES_generee.md` (point 4.9 de CE_QUI_MANQUE) et `MISSION_SPORT_generee.md` (🟡 « Les mettre à tous les endroits liés »). **Non envoyées. Non lues par Martin.** |
| 6. Relecture de PR de Recettes | §7 ci-dessous. |

### Contenu des fichiers de départ
| Site | Total | Fait | En cours | À concevoir | Bloqué | Sources |
|---|---|---|---|---|---|---|
| Recettes | 120 | 75 | 12 (9 PR + 3 🟡) | 30 | 3 | `DEMANDES_4_0.md` (65), `CE_QUI_MANQUE.txt` §2, §3, §4, mise à jour du 6/11 (46), PR ouvertes GitHub (9) |
| Sport | 36 | 30 | 3 | 2 | 1 | `DEMANDES_8_35.md` (34), `DELIVERY_8_35.md` (2) |
**Table d'états (fixe, dans le script) :** ✅ → Fait · 🟡 → En cours · ⚠️ → Bloqué · ⏳ → À concevoir (Recettes : « à faire ») ou En cours (Sport : « en cours ») · points ouverts de `CE_QUI_MANQUE.txt` → À concevoir (Bloqué si le texte dit BLOQUÉ) · PR ouvertes → En cours. L'étiquette d'origine (symbole ou [testé]/[code]/[non vérifié]) est **recopiée** dans la description. Les niveaux sont tous « Rapporté » : une ligne « ✅ vérifié (audit a17) » est ce que dit le document, pas ce qu'Atelier a rejoué (H pour la table : à valider par Martin, voir `A_TRANCHER.md` 6, 7).
**Non repris :** 27 lignes de Recettes et 8 de Sport (tableaux sans colonne « État ») ; blocs d'octobre de `CE_QUI_MANQUE.txt` (C1 à C6, notes Codex) ; `docs/PROGRESSION.md` (717 lignes, non extrait). Liste exacte : `docs/sites/EXTRACTION.json`.

## 3. Contrôle de 20 fonctionnalités tirées au hasard (10 par site, graine 20261116, rejouable : `node scripts/check-sites-seed.mjs --table`)
Contrôle automatique sur **les 156 lignes** (la ligne citée existe, contient le nom, l'étiquette copiée y figure, l'état suit la table) : **0 écart**. Puis relecture par moi des 20 lignes tirées contre le texte d'origine : **20 exactes, aucune extraction corrigée.**
| # | Site | Fichier:ligne | Fonctionnalité (début) | Étiquette d'origine → état Atelier | Exact ? |
|---|---|---|---|---|---|
| 1 | Recettes | DEMANDES_4_0.md:209 | En plein écran, pour revenir en petit… | ✅ → Fait | oui |
| 2 | Recettes | CE_QUI_MANQUE.txt:487 | Version complète (PR #27, 13 octobre) | [testé] → Fait | oui |
| 3 | Recettes | CE_QUI_MANQUE.txt:551 | 3.2 Vérifier que ton offre Cloudflare accepte les Durable Objects | [non vérifié] (dans le texte) → À concevoir | oui |
| 4 | Recettes | CE_QUI_MANQUE.txt:540 | 3.1 Sauvegarder les données de production AVANT tout déploiement | [testé] sur KV local, « jamais fait » en production → À concevoir | oui |
| 5 | Recettes | DEMANDES_4_0.md:215 | Défauts trouvés en relisant la 4.4.0… | ✅ → Fait | oui |
| 6 | Recettes | DEMANDES_4_0.md:56 | S'inspirer du site sport… | ✅ → Fait | oui |
| 7 | Recettes | CE_QUI_MANQUE.txt:647 | 4.6 Assistant : aucun vrai fournisseur | [testé] pour « sans assistant » → À concevoir | oui |
| 8 | Recettes | DEMANDES_4_0.md:23 | Choisir le temps de réflexion… | ✅ → Fait | oui |
| 9 | Recettes | CE_QUI_MANQUE.txt:1149 | 4.14.0 Import des fiches HTML | [testé] → Fait | oui |
| 10 | Recettes | DEMANDES_4_0.md:45 | Extensions de recettes aux noms modifiables | ✅ → Fait | oui |
| 11 | Sport | DEMANDES_8_35.md:37 | Petits messages en italique « va dans… » | ✅ → Fait | oui |
| 12 | Sport | DEMANDES_8_35.md:63 | Assistant admin aussi efficace… | 🟡 → En cours | oui |
| 13 | Sport | DEMANDES_8_35.md:39 | App bien organisée, boutons rangés… | 🟡 → En cours | oui |
| 14 | Sport | DEMANDES_8_35.md:45 | À l'étape 1, plus de « précis / très précis »… | ✅ → Fait | oui |
| 15 | Sport | DEMANDES_8_35.md:38 | Les mettre à tous les endroits liés | 🟡 → En cours | oui |
| 16 | Sport | DEMANDES_8_35.md:22 | En créant une séance, l'app dit où aller pour les étirements | ✅ → Fait | oui |
| 17 | Sport | DEMANDES_8_35.md:49 | Objectifs beaucoup mieux faits… | ✅ → Fait | oui |
| 18 | Sport | DEMANDES_8_35.md:12 | Simple à programmer | ✅ → Fait | oui |
| 19 | Sport | DEMANDES_8_35.md:71 | Ne rien oublier de tout ce que j'ai dit | ✅ → Fait | oui |
| 20 | Sport | DEMANDES_8_35.md:15 | Une phase sans exercices… | ✅ → Fait | oui |
Réserve (V) : les lignes 3, 4 et 7 sont des **points ouverts** dont le titre est court ; l'étiquette [testé]/[non vérifié] de leur texte porte sur un détail (ex. 4.6 : « le livre fonctionne sans assistant [testé] »), pas sur le point entier. L'état « À concevoir » y est une lecture d'Atelier (point listé comme ouvert), pas une phrase du document.

## 4. Contrôles exécutés (V, résultats réels)
| Commande | Résultat |
|---|---|
| `npm run check` | OK |
| `npm test` (vitest) | **168/168** (146 existants + 22 nouveaux `tests/lot5a-parcours.test.ts`) |
| `npm run build` | OK (compilation + simulation de publication) |
| `npm run test:regressions` | OK (code de sortie 0) |
| `npm run test:storage` | 11/11 |
| 5 fichiers demandés (`workbench-core`, `claude-advisor`, `history-analysis`, `zip-reader`, `requirements-audit`) | 38/38 |
| `node --test tests/*.test.mjs` | 376/376 |
| `node scripts/requirements-audit.mjs` | voir §8 |
| Playwright `tests/e2e/lot5a.spec.ts`, 360 et 390 px (Chromium préinstallé, projet `android`) | **2/2** : import des deux fichiers (aperçu, ajout, « déjà présent »), loupe, source et niveau ; 0 débordement horizontal, 0 texte sous 12 px |
Non lancés : audit multi-appareils (40 min), Firefox/WebKit, `test:bridge`, `test:e2e` des lots 1 à 4 (inchangés). Aucun écran n'a été modifié.
Remarque (V) : le playwright de `npm ci` attend un Chromium plus récent que celui préinstallé ; j'ai lancé avec une configuration **temporaire hors dépôt** pointant vers `/opt/pw-browsers/chromium`. Le dépôt n'est pas modifié pour cela.
Limite (V) : `tests/lot5a-parcours.test.ts` relit les deux clones (`/home/user/Livre-de-recettes`, `/home/user/Sport`) pour quelques tests ; sans ces dossiers (CI GitHub), ces tests sont **ignorés** et seuls les fichiers versionnés sont contrôlés.
Défaut corrigé au passage : ajouter les exigences `SPR-` faisait échouer le test « fichier de départ à jour » du lot 4 (elles devenaient une fonctionnalité d'Atelier) ; `scripts/build-atelier-seed.mjs` ignore désormais `SPR-` comme `ADA-` ; le fichier du lot 4 est inchangé.

## 5. Tests propres au lot
Fichiers valides et sous les limites d'import ; chaque ligne cite fichier, ligne et commit ; niveau « Rapporté » partout, jamais « Vérifié » ni « Vérifié sur téléphone » ; aucun secret ni trace de conversation ; fichiers à jour par rapport à Git ; aperçu sans écriture ; import des deux sites ; second import = 0 ajout, fichier plus court = 0 suppression ; **isolation A/B** (B ne peut ni lire, ni apercevoir, ni importer chez A ; B importe chez lui avec d'autres identifiants ; sa recherche ne voit rien de A ; la mission de A est invisible pour B) ; missions des deux sites avec les vraies règles ; **toutes les requêtes GitHub simulées sont des GET** et les deux clones restent sans modification.

## 6. Preuve qu'aucune écriture n'a eu lieu (V)
- Mes commandes sur les deux clones : uniquement `rev-parse`, `ls-tree`, `cat-file`, `show`, `status` (lecture).
- GitHub, 16 novembre : tête de `main` de Livre-de-recettes = `92ec7c5…` et de Sport = `f0ef3b0…`, **identiques** aux commits épinglés ; la liste des branches de Sport (`main`, `Sauvegarde`) et de Recettes ne contient **aucune** branche de cette session ; aucune PR ouverte par moi. Les 9 PR ouvertes de Recettes sont celles de la liste de départ (dates du 24 octobre au 7 novembre).
- Limite : cette preuve vaut pour le moment de la relecture.
- Information : l'environnement m'avait fixé une branche de développement dans les quatre dépôts ; je ne l'ai créée que dans Atelier, la mission interdisant d'écrire ailleurs.

## 7. Ce qu'Atelier peut utilement faire en relecture sur Recettes (`docs/agents/ATELIER.md`, lu)
1. Analyser les PR de branches `claude/…` (reconnues automatiquement toutes les 5 minutes si Martin a activé l'analyse du dépôt ; plafond de 1, 2 ou 4 analyses par jour et par dépôt, 8 par compte). Une branche `codex/…` ou `chatgpt/…` n'est **pas** reconnue : lancer à la main (Projets → Vérifications IA).
2. Seul compte le commentaire dont le SHA du marqueur est la **tête actuelle** de la PR ; les anomalies sont des **pistes**, pas des faits ; la CI décide. Exemple (V) : la PR n°127 mentionnait « aucune piste reproduite comme défaut » sur son commit exact : le protocole a donc déjà servi.
3. Utile : vérification indépendante des PR qui touchent aux données (KV, sauvegarde, hors connexion) ; peu utile pour un simple changement d'affichage (tests ciblés + CI suffisent, selon `etat-claude.md`).
4. **Écriture** dans Recettes (PR n°139, file de tâches « sûres ») : `docs/CONNECTEURS.md` dit que l'écriture GitHub d'Atelier n'a **jamais été testée** ; hors périmètre de ce lot (lecture seule).

## 8. Exigences
`docs/EXIGENCES.json` : 10 entrées `SPR-37-001` à `010` (6 « réalisé », 4 « à faire » : lecture GitHub réelle, tri de l'export, téléphone, lecture des missions). L'audit des exigences est donné en fin de rapport (§10).

## 9. Risques et limites
- Les fichiers de départ reflètent des documents **datés** (octobre pour DEMANDES_4_0 et §3/§4 de CE_QUI_MANQUE) : certains points sont peut-être résolus depuis (H). Un élément déjà importé n'est **jamais mis à jour** par un nouvel import (règle du lot 4).
- La liste « Suivi des fonctionnalités » de Recettes compte 120 lignes sans recherche ni filtre dans la liste (manque n°2 du lot 4) : sur un téléphone, la page est très longue (V : capture pleine page de 25 458 px de haut à 360 px pour le projet Sport avec Atelier ouvert).
- Les missions : `Périmètre`, `Interdits`, `Fichiers`, `Tests` écrits par moi sans lire le code des sites (les noms de fichiers sous `public/` sont « à repérer ») ; qualité **non mesurée** ; jamais données à Claude Code. Le générateur n'ajoute que `npm run check/test/test:e2e/test:audit` (Sport) ; pour Recettes j'ai écrit les contrôles à la main (`deploy:check`, `build-sw`).
- Mission Recettes : le point 4.9 est une **limite constatée** plutôt qu'un manque franc ; choisi car petit, sans donnée ni KV, testable. Autre choix possible : voir `CE_QUI_MANQUE.txt` « Pas encore fait » (durée/résultat/attention comme champs d'étape).
- Lot 4 §5 : tous les manques restent (liste de 80 cases, pas de source dans la mission, etc.).

## 10. Critère « terminé » — état honnête
| Critère | État |
|---|---|
| Deux projets avec fonctionnalités, sources, niveaux | **Fait en local** (fichiers + import testés) ; **import réel : Martin** |
| 20 contrôles au hasard exacts | **Fait** (20/20 ; 156/156 automatiques) |
| Contradictions listées | **Fait** (13) |
| Une mission par site prête et **lue par Martin** | Prêtes ; **non lues par Martin** |
| Aucune écriture dans les dépôts | **Fait** (§6) |
| Dépend d'une connexion non essayée | **Simulation** (GitHub) |
| Téléphone | **Téléphone non essayé** (`docs/PROTOCOLE_TELEPHONE_LOT5A.md`) |
**Le lot n'est donc pas « terminé » au sens de la consigne** : restent à Martin l'import réel, la lecture GitHub réelle, la lecture des missions et le téléphone.
