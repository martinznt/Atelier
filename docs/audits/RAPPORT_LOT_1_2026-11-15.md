# Rapport du lot 1 — Modèle de projet (15 novembre 2026)

Branche `ccr-10660c75-ywk6y7`, PR n°44 (brouillon). **Rien fusionné, rien appliqué en production, aucun secret utilisé, aucun autre dépôt modifié.**
Niveaux de preuve : **V** = exécuté ou lu à la source par moi ; **R** = rapporté (écrit ailleurs, non rejoué) ; **H** = hypothèse.
Environnement : Node 22 (le dépôt demande Node 24), `npm ci` réussi.

## 0. Prérequis (rapport du lot 0, lu — V)
(a) PR #40 fusionnée (`69a4158`), migration 0022 appliquée → la mienne est **0023** ; (b) procédure `backup:local`/`restore:local` ; (c) Cloudflare applique les migrations à chaque fusion dans `main` ; (d) tailles mesurées (≈ 16 Mio pour un import). Le lot 1 ajoute des tables vides : impact de taille nul à la migration.

## 1. Ce qui a été fait
| Demande | Réalisation | Fichiers |
|---|---|---|
| D5 où vit quoi | table de répartition (doc + code), recherche unique avec « Source : Atelier / Git », copie Git marquée (dépôt, commit, date), index reconstructible, **écriture Git interdite** | `docs/OU_VIT_QUOI.md`, `server/info-placement.ts`, `server/routes/workbench.ts` (`/find`) |
| D6 cycle de vie | états proposée / actuelle / remplacée (lien) / abandonnée / rejetée / hypothèse ; raison obligatoire ; date, source, auteur gardés ; aucune route de suppression ; « actuelle » seule par défaut (recherche **et** contexte IA) ; une IA ne valide jamais | `server/lifecycle-core.ts`, `server/routes/model.ts`, `migrations/0023_project_model.sql` |
| Correspondance des statuts | décisions, documents, notes, **Memoire-Projets** (10 libellés) | `docs/CORRESPONDANCE_STATUTS.md` |
| D3 fiabilité | 5 niveaux, un composant (pastille + mot) ; « Vérifié » refusé sans source précise **et** sans « adapté à ma demande » (ou test réussi + source pour une fonctionnalité) ; contenu d'IA = Hypothèse | `web/Lifecycle.tsx`, `server/lifecycle-core.ts` |
| D4 noyau + modules | 3 modules (Code et déploiement ; Suivi des fonctionnalités ; Parcours pédagogique = **squelette vide**), gabarits (Recettes, Sport, Atelier, libre) = point de départ modifiable ; contrainte à 2 types **non touchée** (gabarit dans `project_setup`) | `web/ProjectModel.tsx`, `server/routes/model.ts` |
| Suivi des fonctionnalités | nom, description, état (à concevoir / en cours / fait / vérifié sur téléphone / bloqué), source, fiabilité, groupe, liens tâches/décisions, **identifiant stable F-0001** (compteur par projet, jamais réutilisé, pas de suppression) | idem |
| Projets existants | aucune ligne réécrite : l'état se **déduit** des anciennes colonnes | `tests/migration-0023.test.ts` |

Choix de conception à connaître : voie « table annexe » plutôt que reconstruire `project_profiles` (en SQLite, modifier une contrainte exige de reconstruire la table : **H confirmée par la doc SQLite non relue ici** ; la voie choisie évite de toucher aux données). Les décisions gardent leur ancienne colonne `status` comme **miroir** (actuelle→validée, remplacée et abandonnée→remplacée) pour que les prompts et anciens écrans restent justes.

## 2. Contrôles exécutés (V, résultats réels)
| Commande | Résultat |
|---|---|
| `npm run check` | OK |
| `npm test` (vitest) | **113/113** (dont 8 nouveaux scénarios du lot 1 + migration sur base remplie) |
| `npm run build` | OK |
| `npm run test:regressions` | OK |
| `npm run test:storage` | OK |
| `npm run test:core` | OK |
| `node --test tests/*.test.mjs` | **356/357 : 1 échec**, `wrangler-previews` (déjà rouge sur `main`, décision de Martin en attente ; je n'y ai pas touché) |
| 5 fichiers demandés (workbench, claude-advisor, history-analysis, zip-reader, requirements-audit) | 38/38 |
| `node scripts/requirements-audit.mjs` | 553 exigences (+18 `SIT-33`), 0 preuve cassée |
| Playwright (Chromium) à **360 et 390 px**, `tests/e2e/lot1.spec.ts` | 2/2 : modèle, fonctionnalité, « Vérifié » refusé puis accepté, recherche, **aucun débordement horizontal** |
Non lancés : audit multi-appareils de 40 min (non demandé hors vérification finale), Firefox/WebKit, parcours existant `flow.spec.ts`, `test:bridge`.

## 3. Preuves des critères « terminé »
- (a) **Projets identiques avant/après** — V : `tests/migration-0023.test.ts` (base à 22 migrations remplie : 2 comptes, 3 projets, décisions dans 4 états, 8 documents, 3 notes, tâche) : **chaque ancienne table identique ligne par ligne**, 6 nouvelles tables vides, `foreign_key_check` vide, réponses de 6 écrans de lecture identiques. Rejoué aussi avec la procédure du lot 0 sur la base locale de wrangler : sauvegarde `backup:local` → migration 0023 → mêmes comptes (1 utilisateur, 2 projets, 2 profils, 2 décisions, 1 note). *Limite :* `PRAGMA integrity_check` est refusé par D1 (SQLITE_AUTH) ; le contrôle d'intégrité fichier du lot 0 n'a pas été rejoué ; la **restauration** n'a pas été rejouée pour ce lot.
- (b) **Rien supprimé** — V : aucune instruction `DELETE`/`DROP` dans la migration ; aucune route de suppression d'information (une requête `DELETE` sur une fonctionnalité répond 404 : testé). Seule exception volontaire : on peut retirer un *lien* fonctionnalité↔tâche (un lien n'est pas une information).
- (c) **« Vérifié » refusé sans source** — V : 6 combinaisons refusées par le test unitaire, 5 par l'API, 1 par le navigateur ; message : « Pour passer à « Vérifié », indiquez une source précise… ».
- (d) Tables de correspondance et de répartition — écrites (§1).
- (e) **Isolation A/B** — V : 9 routes (lecture, création, modification, liens, changement d'état, historique, modules) renvoient 404 pour l'autre compte ; compteur F-0001 propre à chaque projet ; l'export du compte ne contient que ses données. *Limite :* la requête de recherche unifiée de l'autre compte ne renvoie rien (testé) ; la sélection du contexte pour IA n'a pas de test A/B propre au lot (le test existant couvre le cloisonnement).
- (f) Contrôles et rapport — ce document. **Essai téléphone : à Martin** (`docs/PROTOCOLE_TELEPHONE_LOT1.md`) → **téléphone non essayé**.

## 4. Ce qui change de comportement (à savoir)
1. **Recherche et contexte IA : seul « actuelle » par défaut.** Les anciennes notes dont la source ne commence pas par « Saisie » (donc non saisies par Martin) deviennent « proposées » et sont **masquées par défaut** (visibles avec « Tout afficher » ; le nombre de masqués est indiqué). Les décisions « proposées » ou « remplacées » ne remontent plus dans le contexte par défaut. J'ai adapté **un** test existant (contexte, `all=1`) sans rien en retirer et ajouté le test du nouveau défaut.
2. L'ancien « vérifié » des documents s'affiche **« Rapporté »** (aucune source ni contrôle n'était conservé). La création d'un document n'offre plus « Vérifié ».
3. Une décision « actuelle » ne peut plus devenir « rejetée » ni repasser « proposée » (même par l'ancien écran : erreur 422 claire).
4. « Vérifié » à propos des dépôts devient « existe chez GitHub ».

## 5. Non fait, limites, risques (honnête)
- **Tâches** : fiabilité déduite déjà existante conservée ; **pas d'éditeur d'état** pour les tâches (« commencer par décisions et documents » : étendu aux notes et fonctionnalités seulement). Les notes n'ont pas encore d'écran d'état (l'API le permet).
- Correspondance **Memoire-Projets** : codée et testée, **pas branchée** à la lecture des documents Git (lot 5A) ; la recherche ne fait pas confiance au statut écrit dans un document Git (affiché « non interprété »).
- Décisions créées par le questionnaire ou « depuis un message » : pas de ligne d'historique tant qu'on ne les modifie pas (état déduit, correct).
- Le module « Code et déploiement » ne fait que s'activer : aucune fonction nouvelle.
- Contraste ≥ 3:1 : badges en `var(--ink)` sur fond de page (même couleur que le texte courant, trait plein/tireté/pointillé) ; **non mesuré** automatiquement, sombre non contrôlé en captures.
- **Production non touchée** : la fusion applique 0023. **Sauvegarde de production à faire avant** (`docs/SAUVEGARDES.md`) — jamais essayée en réel (hérité du lot 0).
- Le test `wrangler-previews` reste rouge sur `main` ; le contrôle GitHub peut donc rester rouge indépendamment de ce lot (H, non vu).
- Aucune clé d'IA ni appel fournisseur/GitHub réel.
