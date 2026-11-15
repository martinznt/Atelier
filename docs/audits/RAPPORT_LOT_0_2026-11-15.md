# Rapport du lot 0 — Fiabilité et mesure (15 novembre 2026)

Aucune nouvelle fonction. Rien n'a été fusionné, rien n'a été appliqué en production, aucun secret utilisé.
Niveaux de preuve : **V** = exécuté ou lu à la source par moi ; **R** = rapporté (écrit ailleurs, non rejoué) ; **H** = hypothèse.
Environnement : Node 22.23 (le dépôt demande Node 24 : tout a tout de même fonctionné), `npm ci` réussi.

## 1. Remise à jour documentaire — FAIT (V)
La PR n°39 est bien fusionnée (`git log` : `1e27b01 Merge pull request #39`). `main` = `4353342` (deux commits de configuration D1 faits à la main le 14 novembre, après la PR 39). `CLAUDE.md` corrigé (« n'est pas fusionnée » → « est fusionnée »). `docs/AVANCEMENT.md` : bloc d'état ajouté en tête. Consignes Codex : `CLAUDE.md` et `AGENTS.md` ne contenaient plus que des mentions historiques ; une phrase « un seul agent de code » a été ajoutée. Les anciens rapports restent historiques.

## 2. Contrôles de base sur `main` (V, exécutés)
| Commande | Résultat |
|---|---|
| `npm run check` | OK, aucune erreur |
| `npm test` (84 scénarios Miniflare) | 84/84 |
| `npm run build` (compilation + simulation de publication) | OK |
| `npm run test:regressions` | 15 fichiers, tous OK |
| `npm run test:storage` | 11/11 |
| `node --test` des 5 fichiers demandés | 38/38 |
| `node scripts/requirements-audit.mjs` | 527 exigences ; 53 VALIDÉ, 17 PARTIEL, 247 NON VÉRIFIÉ, 165 À FAIRE, 45 BLOQUÉ ; 0 preuve cassée |
| `node --test tests/*.test.mjs` (tous) | **313/314 : 1 échec**, voir ci-dessous |

**Échec sur `main` (bug de configuration avéré, non corrigé par moi) :** `tests/wrangler-previews.test.mjs` exige que le bloc `previews` de `wrangler.jsonc` n'ait **aucune** base de données (règle : « jamais de données de production dans un aperçu »). Le commit `bf1dd3c` (fait à la main sur GitHub le 14 novembre) y a ajouté une base `atelier-db-test` (`098e53fe…`, différente de la production `eea113c4…`). Ce n'est donc probablement pas une fuite de production (H : je n'ai pas accès à Cloudflare pour confirmer que cette base est bien vide de vraies données), mais la règle écrite et le test sont maintenant contredits. Je n'ai ni modifié la configuration (décision de Martin) ni affaibli le test. **Décision à prendre par Martin** : soit garder la base de test et changer volontairement la règle (et le test, avec accord écrit), soit retirer la base du bloc `previews`. Ce test fait aussi partie du contrôle GitHub `reviews-check.yml` : ce contrôle est donc rouge tant que rien n'est décidé (H, non vu sur GitHub).

## 3. Avis sur la PR n°40 — **À CORRIGER (1 point) puis à fusionner**
Rebasée en local sur `main` (`4353342`) : **sans conflit** (2 commits de la PR sont devenus inutiles car identiques à ceux de `main`). Rien n'a été poussé. Tests après rebase (V) : typage OK ; vitest **103/103** ; `node --test tests/*.test.mjs` 339/340 (même seul échec que `main` : previews) ; régressions OK ; `git diff --check` propre.
Points demandés :
- **Détection de `conversations_filtrees.json` : OK (V).** Sur la **vraie archive** (voir §6) le fichier, rangé dans un dossier racine `Extraction_depuis_…/`, est reconnu ; `sites/…` et `pieces_jointes/…` ne sont jamais pris pour des conversations.
- **Pas de doublon en cas d'enregistrement concurrent : OK (V).** Lecture du code : `ON CONFLICT DO NOTHING` partout, mise à jour conditionnelle des totaux ; test existant « imports simultanés ×3 » passe ; sur la vraie archive, relancer l'import donne 0 nouveau message et 3 545 doublons reconnus.
- **Preuve de persistance par segment : OK avec une réserve (V).** Le serveur recompte conversations et nœuds avant de marquer le segment fini (sinon 409). Réserve P2 : le contrôle n'a lieu que si le client envoie `rows_expected` (champ facultatif) ; le client d'Atelier l'envoie, mais un autre client pourrait l'omettre.
- **Migration 0022 additive : OK (V).** Seulement `ALTER TABLE … ADD COLUMN … DEFAULT` et `CREATE TABLE/INDEX` ; aucun `DROP`/`DELETE`/`UPDATE`/`RENAME`. Testée sur une base remplie (§4). Effet de bord (P2) : les segments déjà inventoriés avant la migration affichent « 0 enregistré » (valeur par défaut) ; sans conséquence tant qu'aucun vrai import n'a eu lieu (R).
- **À CORRIGER — annexe de 300 Ko à 1 Mo refusée (bug avéré, V).** Sur la vraie archive, `inventaire_complet.json` (485 Ko) échoue avec « 413 Contenu trop volumineux » : la route accepte 1 Mo d'annexe, mais l'outil général de lecture (`jsonBody`) coupe à 300 000 caractères. Les autres annexes passent ; le reste de l'import n'est pas bloqué, mais l'annexe est perdue et affichée avec un type « ? ». **Correctif écrit et testé** (test rouge sans, vert avec ; typage OK) : `docs/audits/correctifs/pr40-annexes-300ko.patch` (à appliquer sur la branche de la PR avec `git apply`). Je ne l'ai pas poussé sur la branche de la PR.
- Limite connue (V, pas un bug de la PR) : `correspondance_fichiers.json` (1,6 Mo) dépasse le plafond de 1 Mo d'annexe, donc **seuls son nom et son empreinte sont gardés** : les liens « pièce jointe → fichier » par correspondance ne sont pas créés (0 lien) ; 47 pièces jointes sont retrouvées par leur nom, 116 restent « référencées seulement ». Relever ce plafond est une décision (D1 limite une ligne à 2 000 000 octets, R).
- **Avant de fusionner :** la fusion met en ligne et applique la migration 0022 automatiquement si Cloudflare est réglé comme documenté (§7) : faire d'abord la sauvegarde (guide « sauvegarder avant de migrer »).

## 4. Sauvegarde et restauration (V, base locale)
- **FTS5 : il n'y en a pas.** `grep fts5|virtual table` sur migrations, serveur, web, scripts, docs, tests : aucun résultat. La recherche est faite avec `LIKE` ; la crainte « FTS5 complique l'export » ne s'applique donc pas à cette version.
- Base locale à 21 migrations remplie de **données synthétiques** (68 tables, 1 702 lignes, dont 137 conversations d'export, 171 fichiers, 1 188 messages). `npm run backup:local -- --stopped` → dossier horodaté + `integrite.json` (SHA-256 de chaque fichier). Restauration refusée sur destination non vide (voulu) ; après mise de côté de l'ancienne base, `restore:local` → **base identique ligne par ligne** (empreinte par table), `integrity_check: ok`, 0 violation de clé étrangère, « No migrations to apply ». Une sauvegarde modifiée d'un seul octet est **refusée** (« Intégrité incorrecte »).
- Limite : `backup:local` ne copie que les fichiers de la base **locale** (`.wrangler/state`). **Il ne sauvegarde pas la production.** La sauvegarde de production (`wrangler d1 export … --remote`, voir `docs/SAUVEGARDES.md`) n'a pas été essayée : pas d'accès Cloudflare (R). Time Travel 7 jours est rapporté par la doc du dépôt, non vérifié à la source ici (le site developers.cloudflare.com n'est pas joignable depuis cette session).
- **Migration 0022 sur base déjà remplie (V) :** avant/après, les 1 702 lignes de toutes les tables existantes sont identiques sur leurs anciennes colonnes ; 0 ligne perdue ; 3 tables nouvelles vides ; `integrity_check ok` ; `d1_migrations` contient 0022. Les 137 conversations reçoivent `meta='{}'`.

## 5. Mesures
**(a) Tailles (V, vraie archive importée en local par la PR 40, base sur disque) — total ≈ 16,2 Mio :**
| Table (+ ses index) | Taille | Lignes |
|---|---|---|
| `bridge_messages` (le texte importé) | 10,3 Mio | 3 545 |
| `export_nodes` (structure, PR 40) | 4,4 Mio | 6 723 |
| `export_conversations` | 0,18 Mio | 137 |
| `export_files` | 0,15 Mio | 180 |
| `bridge_conversations` | 0,12 Mio | 135 |
| `export_attachment_refs` | 0,12 Mio | 163 |
Limite D1 gratuite : 5 Go par compte, 500 Mo par base pour Atelier (R, `docs/LIMITES_GRATUITES.md`) : un import occupe ≈ 3 % de 500 Mo.
**Écritures (H, estimation, non mesurée en D1 réel) :** ≈ 14 700 lignes insérées × (1 + 3 index) ≈ **55 000 écritures**, plus ≈ 3 500 mises à jour du compteur de quota, soit **≈ 60 000 sur les 100 000 écritures par jour** de l'offre gratuite (R). **Un seul import complet tient dans une journée ; deux imports le même jour ne tiennent pas.** Ne pas le relancer le même jour. Le décompte exact de Cloudflare (index inclus ou non) n'a pas pu être vérifié à la source officielle.
**Lectures :** l'import lit peu ; la recherche lit toutes les lignes parcourues (5 millions de lectures/jour, R) : ≈ 3 545 messages par recherche sur `LIKE` → très loin de la limite pour un usage normal (H).

**(b) Plafond de 50 Mo — réponse : le texte réel est de 7,62 Mio, soit 15 % du plafond (V).**
- Le plafond est un déclencheur SQL (`message_usage_insert`, migration 0002) sur `bridge_messages` : **52 428 800 octets (50 Mio) de texte par compte**, tous projets confondus. Les fichiers de l'archive (pièces jointes 51,8 Mo, bibliothèque 49,8 Mo, sites 3,7 Mo) **ne comptent pas** : Atelier n'en copie jamais le contenu.
- Mesure sur la vraie archive : 137 conversations, 3 293 messages avec texte (Atelier en compte 3 349 « nœuds avec texte » ; l'écart vient de types de contenu non texte simple, H), **7 987 803 octets** de texte. L'import réel dans Atelier local a enregistré exactement **7 987 803 octets** (V) : la mesure et l'importeur concordent. Plus long message : 109 542 octets ; 3 messages dépassent 60 000 caractères mais sont découpés en parties de 12 000 (donc acceptés).
- **Si le plafond était dépassé :** l'enregistrement du lot en cours est refusé en bloc (HTTP 507, message « Le stockage texte de ce compte est plein (50 Mo). Aucun ancien contenu n’a été effacé. »), les lots déjà importés restent, aucun message n'est coupé ; on peut reprendre sans doublon mais pas continuer tant que de la place n'est pas libérée. Il n'y a pas d'import « par projet » pour contourner : le plafond est par compte. Le plafond n'a **pas été modifié**.
- **« Bilan chiffré » ne donne pas la taille du texte (V : aucune ligne du code web ne l'affiche), et aucun écran n'affiche la place utilisée (`import_bytes` n'est pas montré).** Procédure de mesure pour Martin : voir `docs/GUIDE_IMPORT_REEL.md` §« Mesurer le texte ». J'ai ajouté `scripts/mesure-texte-archive.mjs` (lecture seule, n'affiche que des nombres).
- Pour les prochains exports plus gros : ce plafond sera atteint vers 6,5 fois cette archive (H, extrapolation).

## 6. Essai sur la vraie archive — FAIT en local (V)
Archive récupérée en lecture seule (`git fetch` de la branche `reception-export-chatgpt-2026-11-15`, `git show`) : 97 550 519 octets, **SHA-256 identique à la fiche** (`2b76cc6f…525b`). 181 entrées. Passée dans le lecteur ZIP et l'importeur de la PR 40 rebasée, sur Miniflare local (jamais en production). **Aucun contenu de conversation n'est reproduit ici ni dans la PR.**
| Étape | Résultat |
|---|---|
| Inventaire | 3,0 s ; 1 segment (`conversations_filtrees.json`), 137 conversations, 6 723 nœuds (= `verification.json`), 0 invalide, 0 doublon, 0 branche |
| Index des fichiers | 2,5 s ; 180 fichiers hachés (toutes les entrées sauf le fichier de conversations), 0 problème ; groupes : 109 pièces jointes, 46 bibliothèque, 16 sites, 9 autres (= fiche) |
| Annexes | 3 sur 5 enregistrées ; `correspondance` trop grosse (métadonnées seules) ; `inventaire_complet.json` en échec 413 (bug du §3) |
| Import des messages | 135 conversations sur 137 (2 sans texte), 3 545 parties de messages, 5,3 s, 0 erreur, 0 perte |
| Relance | 0 nouveau, 3 545 doublons reconnus |
| Intégrité | 137 enregistrées, 134 importées, 1 partielle, 2 sans texte ; 0 nœud orphelin, 0 cycle |
Constats : (1) 46 conversations sont « partielles » à l'inventaire (contenu non texte : images exclues, outils) ; (2) la fiche de réception annonce 6 508 messages, Atelier compte 3 349 avec texte et 6 723 nœuds : les trois nombres ne mesurent pas la même chose (H : la fiche compte des nœuds-messages sans filtrer le texte vide) ; (3) la couverture affiche « 3 545 importés » pour « 3 349 annoncés » parce que les longs messages sont découpés (affichage trompeur, P2, non corrigé) ; (4) **dates** : première 2026-09-01, dernière 2026-11-10 ; (5) **pièces jointes** : 47 retrouvées par nom, 116 « référencées seulement », 0 par correspondance (§3) ; (6) **mémoire** : mesurée seulement sur Miniflare, pas sur un téléphone ; (7) le rapprochement automatique avec `verification.json` n'a rien annoncé (0 comparaison exploitée) : la vraie forme (`verifications`, `statistiques`) diffère de celle des tests synthétiques — H : à vérifier ; (8) **téléphone non essayé** (durée sur ordinateur seulement).

## 7. Qui applique les migrations en production (lu dans les fichiers, V pour le code, H pour le réglage Cloudflare)
Le code est prévu pour que **Cloudflare (Workers Builds, relié à GitHub) applique les migrations lui-même à chaque fusion dans `main`** : commande de déploiement `npm run deploy:cloudflare` = `deploy-guard.mjs` (refuse toute autre branche que `main`) → `configure:cloudflare` (fabrique `wrangler.production.jsonc` avec l'identifiant D1) → `wrangler d1 migrations apply atelier-db --remote` → `wrangler deploy`. Personne ne tape de commande si tout est réglé. **Incertain (H)** : je ne peux pas voir le tableau de bord Cloudflare : la commande de déploiement réglée, les variables `ATELIER_D1_DATABASE_ID`…, le jeton, et le fait que `/api/health` annonce 0001-0021 sont rapportés, pas vérifiés. Un échec déjà vu : le 19 octobre, la publication a échoué sur un identifiant D1 nul (le `wrangler.jsonc` du dépôt a toujours `00000000-…`, volontairement). Les builds de **branches** utilisent le bloc `previews` (base de test), et le garde empêche les migrations hors `main`. **Conséquence : fusionner la PR 40 applique 0022 sur la vraie base ; la sauvegarde doit donc être faite avant de cliquer sur « Merge ».**

## 8. Essais que seul Martin peut faire / téléphone
Voir `docs/GUIDE_IMPORT_REEL.md` et `docs/PROTOCOLE_TELEPHONE_A05S.md`. **Téléphone non essayé.** Aucune clé IA réelle, aucun appel réel à Gemini/Groq/Mistral/GitHub : non vérifié.

## 9. Récapitulatif honnête
Fait (V) : étapes 1, 2, 3 (sauf publication), 4 (en local), 5, 6 (en local), documents 7 et 8 écrits. Impossible : sauvegarde/restauration de la **production**, lecture des limites officielles Cloudflare (site injoignable), vérification du réglage Cloudflare, essai téléphone. Non corrigé : test previews rouge (décision de Martin), correctif annexes (patch fourni, à appliquer sur la PR 40), affichage « importés > annoncés ».
