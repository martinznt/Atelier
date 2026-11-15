# Rapport du lot 4 — Atelier dans Atelier (banc d’essai), 15 novembre 2026

Niveaux de preuve : **V** = exécuté ou lu à la source par moi ; **R** = rapporté, non rejoué ; **H** = hypothèse.
Environnement : Node 22 (le dépôt demande Node 24), Chromium préinstallé piloté par Playwright. **Aucun accès à la production, aucun secret, aucun appel réel à GitHub ou à une IA.** Rien fusionné, rien appliqué en production, **aucune migration**, aucun autre dépôt touché.

## 1. Prérequis
- Lots 0 à 3 fusionnés : **V** (`git log` : PR 41, 44, 46, 47/49 ; `origin/main` = `fb195ce`). Rapports lus : lots 0 à 3.
- Essais réels de Martin (lecture GitHub avec son jeton, clés IA, téléphone) : **non faits** (V, rapport du lot 3 §5). Tout ce qui en dépend est **fait en simulation**.
- Noms d’écrans, de routes et de champs : repris du code des lots 1 et 3, aucun inventé.

## 2. Livrable
| Élément | Où | État |
|---|---|---|
| Fichier de départ (94 fonctionnalités, 12 décisions) | `docs/atelier-dans-atelier/atelier-depart.json`, fabriqué par `scripts/build-atelier-seed.mjs` | V : valide, à jour (test), sources citées |
| Import (aperçu, ajout, sans doublon, sans suppression, sans migration) | `server/seed-core.ts`, `POST /api/model/:projet/import`, `web/ProjectModel.tsx` | V en local |
| Guide pour Martin | `docs/atelier-dans-atelier/GUIDE_MARTIN.md` | écrit |
| Protocole téléphone | `docs/PROTOCOLE_TELEPHONE_LOT4.md` | écrit ; **téléphone non essayé** |
| Mission du lot 5A générée (non envoyée) | `docs/atelier-dans-atelier/MISSION_LOT_5A_generee.md` | V en local, GitHub simulé avec les vrais fichiers d’Atelier au commit `fb195ce` |

### Contenu du fichier de départ (aucun état inventé)
- **Un groupe d’exigences = une fonctionnalité** (27 sections du cahier, 24 « RF », 8 groupes de missions) : état déduit des statuts **déclarés** dans `EXIGENCES.json`, niveau **« Rapporté »**, source = identifiants d’exigences. 69 fonctionnalités au total sont « Rapporté ».
- **11 fonctionnalités « Vérifié »** (lots 1 à 3 et import) : chacune cite un **test existant** (le fichier est contrôlé par le script) ; ces tests ont tous réussi dans mon exécution complète (§3).
- Lots 0 à 3 et lot 2 étape B (fusionnée pendant ce lot, PR 48) « Fait » (Rapporté, source = rapport ou avancement), lot 5A, lot 5B, studio « À concevoir » ; D7 « Bloqué ».
- **Aucune** fonctionnalité « Vérifié sur téléphone » (l’import le refuse).
- **14 constats** de ce banc d’essai (§5), en « À concevoir ».
- **12 décisions « Proposées »** (pas « actuelles ») : D1 à D12 comme données par Martin. Seuls les sens retrouvés dans le dépôt sont écrits (D2, D3, D4, D5, D6, D8). Pour D1, D9, D10, D10 bis, D11, D12, **le texte de la question n’existe nulle part dans le dépôt** (V, recherche) : le fichier le dit au lieu de l’inventer.

### Choix de conception à connaître
- **Sans migration** : l’identifiant de chaque élément est dérivé (SHA-256) de l’utilisateur, du projet et d’une clé du fichier → importer deux fois retombe sur les mêmes identifiants. Conséquence : un élément déjà présent n’est **jamais mis à jour** par un nouvel import (même s’il a changé dans le fichier).
- Les fonctionnalités importées arrivent « Actuelles » avec le niveau **déclaré par le fichier** (Rapporté ou Vérifié) et une trace d’historique qui dit « importé par vous, rédigé par Claude, à relire ». Les décisions arrivent « Proposées » (auteur IA) : seul Martin les valide.
- Le dépôt `martinznt/Atelier` ne se lie pas par l’import : cela exige la connexion GitHub réelle de Martin (jamais essayée). Le commit de référence (`fb195ce`) est noté dans le fichier ; Atelier fige lui-même le commit lu à chaque mission.

## 3. Contrôles exécutés (V, résultats réels, après tous les changements)
| Commande | Résultat |
|---|---|
| `npm run check` | OK |
| `npm test` (vitest) | **146/146** (126 existants + 20 nouveaux, `tests/lot4-parcours.test.ts`) |
| `npm run build` | OK (compilation + simulation de publication) |
| `npm run test:regressions` | OK (tous les fichiers, 0 échec) |
| `npm run test:storage` | 11/11 |
| 5 fichiers demandés (workbench, claude-advisor, history-analysis, zip-reader, requirements-audit) | 38/38 |
| `node --test tests/*.test.mjs` | **376/376** (le test `wrangler-previews`, rouge au lot 1, passe maintenant) |
| `node scripts/requirements-audit.mjs` | 582 exigences (+7 `ADA-36`), preuves cassées : 0 ; 91 VALIDÉ (mécanique) |
| Playwright 360 et 390 px, `tests/e2e/lot4.spec.ts` | **2/2** : import (aperçu puis ajout puis « déjà présent »), loupe, source et niveau, validation d’une décision, mission, figeage refusé sans périmètre, figeage, verdict ; aucun débordement horizontal, aucun texte sous 12 px |
Non lancés : audit multi-appareils de 40 min, Firefox/WebKit, `test:bridge`, anciens parcours `flow`/`lot1-3` (inchangés).

## 4. Défauts trouvés et corrigés (un test chacun)
1. **Clés de décisions trop courtes refusées** (`d1`… rejetées par ma propre règle de 3 signes) — trouvé par le test du fichier réel ; règle assouplie à 1 signe ; couvert par `lot4-parcours` (« est valable »).
2. **Rechoisir le même fichier ne faisait rien** (le navigateur n’envoie pas d’événement si le fichier est identique : impossible de refaire l’aperçu ou de constater « déjà présent ») — trouvé par le test navigateur ; champ remis à zéro après lecture ; couvert par `lot4.spec.ts`.
3. **Les tests navigateur ne pouvaient plus créer de compte en local** (V : `ALLOW_REGISTRATION` est `false` dans `wrangler.jsonc` depuis la PR 43, donc « Les inscriptions sont fermées ») — `playwright.config.ts` démarre maintenant le serveur local avec `--var ALLOW_REGISTRATION:true`. `wrangler.jsonc` **non touché**. Vérifié : lot4.spec.ts passe ; non rejoué : lot1 à lot3 (même mécanisme d’inscription).
4. **La CI échouait dès le 11ᵉ parcours navigateur** (V : journal GitHub du 15 novembre, 10 réussis puis 22 échecs, tous à l’étape « créer un compte » : limite de 10 inscriptions par quart d’heure et par adresse, `server/auth.ts`). Chaque test annonce maintenant sa propre adresse (`tests/e2e/fixtures.ts`). Vérifié : les 16 parcours de Chromium bureau (flow, lots 1 à 4) passent en une seule série en local ; le projet Android de la CI n’a pas été rejoué en local. Aucun code serveur modifié.

## 5. Manques constatés (liste = vrai produit du lot ; chacun est une fonctionnalité « À concevoir » du fichier de départ, aucun n’est codé)
1. Mission : liste de **80 cases** pour choisir les fonctionnalités ; page de 14 944 px à 360 px (V, capture `test-results/lot4-nouvelle-mission-360.png`).
2. Liste des fonctionnalités : ni recherche ni filtre dans la liste (V, `web/ProjectModel.tsx`).
3. Liste des fonctionnalités : **deux requêtes par ligne** (V à la lecture de `featureView`) ; lenteur en production **H**, non mesurée.
4. Mission : seuls `check`, `test`, `test:e2e` sont repris du `package.json` ; pour Atelier `build`, `test:regressions`, `test:storage` manquent (V, texte de la mission).
5. Mission : règles du dépôt ≈ 20 Ko dont des paragraphes historiques ; mission entière 24 102 octets ; aucun choix par règle (V). Coût en quota : non mesuré.
6. Mission : les fonctionnalités citées n’affichent ni source ni niveau (V).
7. Mission : décisions en ordre inverse (D8 d’abord) ; date brute « 2026-11-15T22:48:37.733Z » (V).
8. Mission : Atelier est écrit « (Autre dépôt) » (V).
9. Décisions D1, D9–D12 : question d’origine introuvable (V).
10. Lot 5B et studio non définis ; lot 5A défini seulement par deux documents (V, recherche).
11. Statuts de `EXIGENCES.json` peut-être périmés : §10 (27 « à faire ») et §13 (31) alors que du code hors connexion existe (**H** : fichiers présents, rien reclassé).
12. Une tâche du Plan n’a ni périmètre ni fichiers : il faut les saisir dans la mission (V, test navigateur).
13. La section « Décisions et À trancher » s’ouvre seule ; la toucher la ferme (V, test navigateur).
14. Création du projet, gabarit, liaison du dépôt et import = plusieurs étapes manuelles ; la liaison GitHub réelle reste non essayée.
Mineur (non listé comme fonctionnalité) : relancer l’inscription plusieurs fois de suite en local déclenche « Trop de tentatives » (V ; j’ai vidé la table locale `auth_limits`).

## 6. Mission du lot 5A (premier vrai essai du lot 3)
Générée en local (V) avec : la tâche, 3 fonctionnalités, 6 décisions validées, niveau « Complet », et les **vraies règles d’Atelier** lues dans Git (`AGENTS.md`, `CLAUDE.md`, commit `fb195ce`) puis servies par un GitHub **simulé** (le contrat de l’API réelle a été vérifié au lot 3, pas la lecture avec le jeton de Martin). Elle a été figée, exportée à l’identique, marquée « copiée » ; jamais « envoyée ». Les champs Périmètre, Interdits, Fichiers, Tests, Critère ont été écrits par **moi** à partir de ce que disent `docs/CORRESPONDANCE_STATUTS.md`, `docs/OU_VIT_QUOI.md` et le rapport du lot 1. **Point ouvert : le périmètre exact du lot 5A n’est écrit nulle part ; Martin doit le confirmer.** Qualité non mesurée : je ne l’ai pas donnée à Claude Code.

## 7. Critère « terminé » — état honnête
| Critère | État |
|---|---|
| Fichier de départ + guide | **Fait** |
| Parcours testé en local avec preuves | **Fait** (Miniflare + Chromium 360/390 px ; GitHub simulé) |
| Liste des manques | **Faite** (§5) |
| Défauts bloquants corrigés avec tests | **Fait** (§4) |
| Mission 5A générée localement | **Fait** |
| Import réel dans la production | **NON FAIT : étape de Martin** |
| Téléphone | **Téléphone non essayé** |
| « Cette mission est-elle meilleure que celles écrites à la main ? » | **Réponse de Martin attendue** ; je ne la donne pas à sa place |

## 8. Risques
- Un élément déjà importé n’est jamais mis à jour par un nouvel import ; corriger le fichier ne corrige pas Atelier (il faudrait modifier l’élément à la main ou ajouter une règle de mise à jour : à décider).
- Les niveaux « Vérifié » du fichier sont déclarés par le fichier, que j’ai écrit ; chacun cite un test que j’ai exécuté, mais je n’ai pas relu chaque test pour confirmer qu’il couvre bien la fonctionnalité.
- Les statuts « Rapporté » viennent de `EXIGENCES.json`, non rejoués par Atelier (certains sont peut-être périmés, §5.11).
