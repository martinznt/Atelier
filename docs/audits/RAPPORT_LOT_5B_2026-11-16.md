# Rapport du lot 5B — étape 5B-1 : modèle de maquette, capture de départ, enregistrement, affichage (16 novembre 2026)

Niveaux : **V** = exécuté ou lu à la source par moi ; **R** = rapporté (écrit ailleurs, non rejoué) ; **H** = hypothèse.
Environnement : Node 22.23 (le dépôt demande 24), `npm ci` réussi, Chromium préinstallé (configuration Playwright **temporaire hors dépôt** pour pointer vers lui).
**Rien fusionné, rien appliqué en production. Une migration additive (0025), non appliquée. Aucun secret, aucun appel réseau réel, aucune IA, aucune écriture dans Livre-de-recettes, Sport, Outil-image ni Memoire-Projets.**
Étape exécutée : **5B-1 seulement** (aucune étape n'était précisée). Les étapes 5B-2 à 5B-5 ne sont **pas** commencées.

## 1. Prérequis
| Prérequis | État |
|---|---|
| Lots 1, 3 et 5A fusionnés | **V** : `git log` (PR 44, 47, 51 ; HEAD est ancêtre de `origin/main` à `30b29ce`), rapports lus |
| Lot 5A « terminé » | **Non au sens de sa propre consigne** (rapport 5A §10) : import réel, lecture GitHub réelle, lecture des missions et téléphone restent à Martin. Les projets Sport/Recettes ne sont donc remplis qu'**en fichiers de départ** (120 et 36 fonctionnalités), pas vérifiés en production. Cela ne bloque pas 5B-1 (le lien vers les fonctionnalités marche sur ce qui est importé) mais Martin doit importer pour s'en servir. |

## 2. Décisions que je devais trancher (et pourquoi)
1. **Stockage de la capture — table dédiée `mockup_images`, texte base64 dans D1, sans R2.** `server/storage-store.ts` (V, lu) est un stockage de **fichiers texte UTF-8 à versions** (refuse tout binaire, 256 Kio, quota par compte) : y glisser du base64 mélangerait des captures avec la bibliothèque de fichiers de Martin et fausserait ses quotas. Choix : une table à part, **180 000 octets au plus avant codage** (≈ 240 000 caractères, sous les 262 144 de la règle « 256 Kio » de `docs/LIMITES_GRATUITES.md`), 20 Mo de captures par compte. Les contraintes de la base répètent ces limites (testées).
2. **Compression côté navigateur** : WebP (JPEG si le navigateur ne sait pas encoder en WebP), largeur 720 px puis 540 puis 360, qualité de 0,82 à 0,30 ; on garde la première combinaison qui tient. Le serveur **ne croit pas le navigateur** : il relit l'en-tête réel du fichier (format et dimensions) et compare avec le type annoncé.
3. **Une maquette = 4 tables** : `mockups` (écran 360 px de large, hauteur déduite de la capture, `palette` JSON, copie figée de l'écran de départ), `mockup_images`, `mockup_groups`, `mockup_blocks` (neuf types, x/y/w/h entiers, groupe, couleurs `#rrggbb`, lien optionnel vers une fonctionnalité du lot 1 par son identifiant, comportement). Chaque ligne porte `user_id` et `project_id` (l'export du compte filtre par projet).
4. **Pas de suppression ni de modification de bloc à cette étape** (la consigne dit « pas de modification »). Conséquence assumée : un bloc ajouté par erreur reste jusqu'à 5B-2 ; une maquette ne peut pas encore être supprimée. À dire à Martin.
5. **« Fixer l'écran de départ »** : copie figée des blocs, une seule fois. Elle sert de base aux « écarts » de la fiche (5B-3). Après elle, plus d'ajout ni de nouvelle capture à cette étape.
6. **Palette du site** : la colonne existe, mais les jetons de couleur des dépôts ne sont **pas encore lus** (couleurs libres `#rrggbb`). Prévu en 5B-2, quand on modifie les couleurs.
7. **Passages utiles de l'export ChatGPT** : **non branchés** (l'export n'est pas importé en production, rapport 5A). Affichés comme « pas encore branchés », prévus en 5B-5. Les décisions actuelles et les fonctionnalités sont affichées (lecture seule, avec niveau de fiabilité).

## 3. Ce qui a été construit (V : code lu et testé)
`migrations/0025_mockups.sql` ; `server/mockup-core.ts` (règles pures) ; `server/routes/mockups.ts` (`/api/mockups` : liste, création, capture, groupes, blocs, fixer l'écran de départ, lecture) ; `web/Mockups.tsx` (section « Maquettes d'écran » dans Pilotage) ; `web/mockup-image.ts` (compression) ; intégrations : export du compte, `/api/health` (0025 attendue), propriétaire des tables (`core.ts`).

## 4. Mesures réelles (V, Chromium de bureau 360 et 390 px, `tests/e2e/lot5b.spec.ts`, `test-results/lot5b-mesures.jsonl`)
| Cas | Avant | Après (WebP) |
|---|---|---|
| Vraie capture d'écran d'Atelier à 360 px, double densité (720 × 1560) | PNG 102,5 Ko | **39,9 Ko**, 720 × 1560 |
| Vraie capture à 390 px (780 × 1560) | PNG 103,5 Ko | **34,9 Ko**, réduite à 720 × 1440 |
| Pire cas : bruit pur d'un écran (720 × 1560, incompressible) | PNG 3,87 Mo | **145,6 Ko**, réduite à 360 × 780 (tient sous la limite) |
| Page entière très longue en bruit pur (540 × 4680) | PNG 8,7 Mo | **refusée** (« dépasse 180 Ko… un seul écran »), capture précédente intacte |
Limite honnête : ce sont des captures **d'Atelier lui-même** et du bruit, pas une capture de Livre de recettes ou de Sport sur le Galaxy A05s. Une capture du vrai site sera mesurée par Martin (protocole). Un défaut trouvé en mesurant : le message affichait « 175,8 Ko » (division par 1024) alors que la limite est 180 000 octets ; corrigé (1 Ko = 1 000 octets).
Autres limites mesurées (tests) : 100 blocs et 30 groupes par maquette, 40 maquettes par projet, 20 Mo de captures par compte (la limite est exacte à l'octet près ; remplacer une capture compte la différence).

## 5. Contrôles exécutés (V, résultats réels)
| Commande | Résultat |
|---|---|
| `npm run check` | OK |
| `npm test` (vitest) | **185/185** (168 existants + 16 `mockups.test.ts` + 1 `migration-0025.test.ts`) |
| `npm run build` | OK (compilation + simulation de publication) |
| `npm run test:regressions` | code de sortie 0 |
| `npm run test:storage` | 11/11 |
| 5 fichiers demandés | 38/38 |
| `node --test tests/*.test.mjs` | **396/396** (376 + 19 `mockup-core` + 1 `schema-status`) |
| `node scripts/requirements-audit.mjs` | voir §8 |
| Playwright `tests/e2e/lot5b.spec.ts`, 360 et 390 px | **3/3** : parcours complet (capture réelle, 3 blocs, lecture, refus, fixation) ; aucun débordement horizontal, aucun texte sous 12 px, cibles de liste ≥ 44 px ; pire cas mesuré |
Non lancés : `test:e2e` des lots 1 à 5A (inchangés), audit multi-appareils (40 min), Firefox/WebKit, `test:bridge`.
Les tests de défaut ont été vérifiés par mutation : en cassant volontairement la limite de bord, la limite de poids et le filtre par utilisateur, les tests concernés échouent (puis code restauré).

## 6. Isolation A contre B (V, `tests/mockups.test.ts`)
B reçoit 404 sur toute lecture, capture, ajout de bloc ou de groupe et fixation sur la maquette de A, sans fuite de contenu ; B ne peut ni lister ni créer dans le projet de A ; un bloc ne peut pas citer la fonctionnalité d'un autre compte ni le groupe d'une autre maquette ; l'export du compte de A contient ses maquettes, celui de B aucune de A.

## 7. Ce qui n'est PAS vérifié
- **Téléphone non essayé** : protocole `docs/PROTOCOLE_TELEPHONE_LOT5B.md`. Aucun test sur Chrome du Galaxy A05s ; l'encodage WebP du téléphone n'est pas mesuré.
- Migration **non appliquée** en production ; D1 réelle non essayée (D1 locale seulement).
- Aucune capture du vrai site ; la qualité de calque « à la main par chiffres » sur téléphone est **probablement pénible** (H) : c'est ce que 5B-2 doit résoudre. À confirmer par Martin.
- Pas de glisser-déposer, pas de boutons monter/descendre/grouper, pas d'annuler/rétablir, pas de suppression (étape 5B-2).
- Pas de fiche, de texte de mission, de guidage ni de discussion (5B-3 à 5B-5). **L'essai décisif de Martin n'a pas eu lieu : le lot n'est pas terminé.**
- Le sélecteur de fichier affiche « Choose File » en anglais dans le Chromium de test ; sur un téléphone en français il est dans la langue de Chrome (H, non vérifié).

## 8. Exigences
`docs/EXIGENCES.json` : 14 entrées `MAQ-38-001` à `014` (9 « réalisé » avec test cité, 5 « à faire » : 5B-2 à 5B-5 et téléphone). Audit : voir `docs/VALIDATION.md`.

## 9. Risques
- La fusion applique la migration 0025 (additive, 4 tables vides) : sauvegarde d'abord, décision de Martin.
- Les captures de Martin sont du contenu privé : stockées dans sa base, jamais envoyées ailleurs, incluses dans l'export du compte (jusqu'à 20 Mo ; l'export intégré peut donc grossir).
- Limites 100/30/40/20 Mo choisies par moi (H).

## 10. Critère « terminé » (pour 5B-1)
Tests de l'étape verts : **oui** ; limites mesurées écrites : **oui** ; rapport écrit : **oui** ; PR brouillon : voir la PR. Téléphone : **non essayé**. Lot 5B entier : **non terminé** (étapes 5B-2 à 5B-5 et essai décisif).
