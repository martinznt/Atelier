# Mission P0 — Fiabilité de l'import historique et intégrité des données (13 novembre 2026)

Branche `fix/import-p0-integrite` (depuis `main` = `1e27b01`). **Rien n'a été déployé, aucune migration n'a été exécutée en production, aucun import réel n'a été lancé.**
La vraie archive (≈ 97,55 Mo) n'est pas présente dans cet environnement : tout ce qui suit est prouvé sur des **archives synthétiques** uniquement.

## 1. Problèmes corrigés
- **Cause principale** : l'expression `conversations(-\d+)?\.json` ne reconnaissait pas `conversations_filtrees.json` → « aucune conversation » alors que le fichier existait. Détection refaite dans `server/archive-entries.ts` : nom (`conversations.json`, `_1`, `-2`, `_filtrees`, `_filtered`) **et** structure JSON validée **et** emplacement (rien sous `sites/`, `pieces_jointes/`, `bibliotheque_non_rattachee/` n'est un segment ; les dossiers non plus).
- Un fichier invalide n'est plus ignoré : il est enregistré avec son motif (`invalid_structure`, profondeur excessive, JSON illisible…).
- Structure conservée : nœuds (parent, enfants dans l'ordre, rôle, type, date, texte oui/non, références de fichiers), branches, nœud courant, métadonnées utiles, **comptage des champs non conservés**.
- Annexes (`correspondance_fichiers.json`, `inventaire_complet.json`, `verification.json`, `EXCLUSIONS_IMAGES.json`, `LISEZMOI_ALLEGE.txt`) : lues de façon tolérante, forme inconnue signalée, aucun schéma inventé ; un lien de correspondance n'est créé que si le fichier cible existe réellement dans l'archive.
- Groupes `sites/`, `pieces_jointes/`, `bibliotheque_non_rattachee/` distingués (comptes, empreintes), sans rattachement arbitraire.
- **Preuve de persistance** : un segment n'est « inventorié » qu'après un recomptage côté serveur (conversations et nœuds) ; sinon HTTP 409.
- Enregistrement concurrent sans doublon (`ON CONFLICT DO NOTHING`), reprise idempotente.
- **Rapport d'intégrité** `/api/exports/:id/integrity` + panneau dans « Mémoire → Export » : annoncé / enregistré, manques classés (absent de l'archive / invalide / non importé / écart).
- Sécurité : jokers `%` `_` des recherches `LIKE` échappés (`/api/search`, projets, fichiers) ; noms de fichiers dangereux (`..`, absolus) jamais cibles de lien.
- L'export du compte déclare ce qu'il ne restitue pas (`import_scope.not_included`) et n'exporte pas `export_nodes` (limite de 20 000 lignes) pour ne pas casser la sauvegarde.

## 2. Fichiers modifiés / créés
Créés : `server/archive-entries.ts`, `migrations/0022_import_integrity.sql`, `tests/archive-entries.test.mjs`, ce rapport.
Modifiés : `server/export-inventory.ts`, `server/routes/exports.ts`, `server/routes/account.ts`, `server/routes/projects.ts`, `server/routes/files.ts`, `server/index.ts`, `server/schema-status.ts`, `web/archive-import.ts`, `web/ArchiveInfo.tsx`, `tests/integration.test.ts`, `tests/schema-status.test.mjs`, `.github/workflows/reviews-check.yml`, `docs/EXIGENCES.json`.

## 3. Migration
`0022_import_integrity.sql` : **additive** (colonnes + tables `export_nodes`, `export_annexes`, `export_links`). Créée, **non exécutée en production** ; appliquée en test sur la base Miniflare. `/api/health` signale `0022` manquante tant qu'elle n'est pas appliquée.

## 4. Tests exécutés (13 novembre, environnement de développement)
- `npx tsc --noEmit` : aucune erreur.
- `npx vitest run` : **97/97** (dont 13 nouveaux « import P0 »).
- `node --experimental-strip-types --test tests/*.test.mjs` : **323/323**.
- `npm run build` (dry-run wrangler) : réussi. `git diff --check` : propre.
Les 13 tests P0 couvrent : A/B détection et validation (faux positifs, archives vides, tronquées, profondeur 300, mauvais schéma, mélange valide/invalide) ; C structure nœud par nœud ; D interruption à 6 moments + reprise = mêmes totaux, imports simultanés ×3, refus 409 d'un segment non persisté, atomicité d'un lot D1 ; E annexes et groupes ; F séparation entre comptes sur chaque nouvelle route, jokers SQL, noms dangereux ; fichier de ≈ 3 Mo / 9 000 nœuds sur 2 segments.

## 5. Ce qui n'a PAS pu être testé
Vraie archive de 97,55 Mo ; **Galaxy A05s** (aucun téléphone ici) ; fournisseurs IA et GitHub réels ; coût réel en lignes lues D1 ; migration 0022 sur la base de production ; simulation d'erreurs D1/R2 autrement que par coupure côté client (aucune erreur D1 injectée dans le serveur).

## 6. Risques résiduels
- **`ALLOW_REGISTRATION: "true"`** dans `wrangler.jsonc` : les inscriptions sont ouvertes en production. Je ne l'ai pas modifié (décision de Martin) ; recommandation : le passer à `false` une fois son compte créé.
- Le quota de texte (50 Mo/compte) fait échouer tout un lot atomique : l'historique complet peut ne pas tenir ; l'inventaire (index + nœuds) tient mais les messages au-delà du quota restent dans l'archive d'origine. Aucune architecture de remplacement n'a été imposée ; R2 reste refusé. La structure des nœuds n'est pas exportable par `/api/account/export` : une restauration depuis cet export ne la restitue pas (déclaré dans `import_scope`).
- Rapprochement annoncé/enregistré : heuristique sur les noms de clés, marquée « à vérifier ».
- Le contenu binaire des fichiers de l'archive n'est jamais copié : seuls nom, taille, type réel et empreinte sont gardés.

## 7. À tester avec la vraie archive
Choisir `archive-…zip` dans Mémoire → Export ; attendre l'inventaire ; ouvrir « Intégrité de l'import » : attendu 137 conversations, 6 508 messages, 6 723 nœuds, 16 / 109 / 46 fichiers par groupe, 169 images exclues, 42 références manquantes, 49 fichiers de bibliothèque absents. Tout écart doit apparaître dans « Manques et anomalies ».

## 8. À tester sur Galaxy A05s (méthode)
Navigateur Chrome, archive sur le stockage interne, mode avion coupé ; lancer l'inventaire écran allumé, couper le réseau à mi-parcours, rouvrir la page, rechoisir la même archive : la reprise doit sauter les segments terminés. Noter durée et éventuel rechargement de l'onglet. **Non fait.**

## 9. Commandes de vérification
```bash
npx tsc --noEmit
npx vitest run
node --experimental-strip-types --test tests/*.test.mjs
npm run build
```
