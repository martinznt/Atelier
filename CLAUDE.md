# Reprise par Claude Code

Lire et appliquer `AGENTS.md`. Sources communes obligatoires :
`docs/CAHIER_DES_CHARGES.md`, `docs/AVANCEMENT.md`, `docs/ARCHITECTURE.md`,
`docs/CONNECTEURS.md`, `docs/VALIDATION.md`, `docs/EXIGENCES.json`.
Le premier lot n'est pas la livraison complète. Examiner la branche, les changements
et les preuves de test avant de reprendre. Ne jamais inventer une validation fournisseur.

La section 20 du cahier des charges rétablit le périmètre complet avec la passerelle.
Lire aussi `docs/PASSERELLE.md`. Le déploiement automatique est autorisé depuis le
14 octobre 2026 : préparer et valider le résultat, ne pas redemander cette autorisation.
Une création Sites existe sans version publiée ; conserver son identifiant exact.

Pour les corrections de fiabilité, lancer aussi `npm run test:regressions` et lire
le rapport du 16 octobre. Conserver les protections des réponses tardives, la clé
persistée des envois et la comparaison du compte attendu avec la session serveur.

Reprise du lot du 18 octobre : appliquer les cinq migrations dans l’ordre et lire
`docs/GUIDE_ASSISTANTS.md`. Les nouvelles régressions couvrent rôles, propositions,
planification et catalogues ; elles ne prouvent pas une intégration fournisseur.
L’évaluation automatique du meilleur modèle par mission reste à réaliser. Conserver
les préférences explicites et ne pas remplacer ce manque par un classement inventé.

Lot du 19 octobre : appliquer aussi les instructions de configuration Cloudflare
ajoutées dans AGENTS.md. La compilation du lot précédent a réussi chez Cloudflare,
mais la publication a échoué sur l’identifiant D1 nul. Lire le dernier état dans
AVANCEMENT.md et VALIDATION.md ; ne pas réutiliser les anciens constats comme état actuel.
La référence Open Chat du propriétaire est conservée en section 25 ; les réglages
de l’équipe sont maintenant accessibles depuis « Mes assistants » dans la discussion.

## Refonte gratuite demandée le 19 octobre (reprise du 21)

Lire aussi `docs/REFONTE_GRATUITE.md`, suivi RF dans EXIGENCES.json. L’origine
réelle est maintenant connue et conservée dans cloudflare.production.json. Branches
dédiées Atelier et Outil-image ; préparer l’intégration main après validation.
Le propriétaire autorise explicitement l’intégration sur une branche Outil-image.
R2 est refusé, pas de nouvelle carte ou offre payante obligatoire. Les cinq premières
migrations sont déjà appliquées selon le propriétaire : uniquement migrations
additives. Exécuter `npm run test:storage` en plus des contrôles précédents.
Ne pas rejouer les longues demandes réseau interrompues ; documenter la compilation
bloquée et poursuivre les tests disponibles. Les secrets Cloudflare sont absents
de cet environnement ; ne pas utiliser le connecteur GitHub comme jeton applicatif.

Reprise du 24 octobre : lire docs/REPRISE_CODEX.md et docs/COMPTES.md. La nouvelle
demande utilisateur exige email et mots de passe de 8 caractères minimum ; elle
remplace les anciennes consignes sans email. Ne pas fusionner/récupérer sur une
adresse non vérifiée. 0007_email_identity.sql est additive ; conserver IDs et données.
Branche feat/email-password-eight. Tests natifs passent ; typage/build/HTTP/browser
restent bloqués par les dépendances absentes. Le workspace local est un snapshot
SHA-vérifié de main 31c8172, l’historique Git distant doit rester parent des commits
publiés. Ne pas pousser le root-commit local en remplaçant l’historique du dépôt.

Reprise du 5 novembre 2026 : l'état actuel est la section « Mise en service » de docs/AVANCEMENT.md et docs/REVUE_IA.md (relais, modes, reprise, rapport, `/api/health`
avec migrations). Les constats plus anciens de ces fichiers sont historiques. Ne jamais déclarer testé ce qui ne l'a pas été avec de vraies connexions.

Reprise du 13 novembre 2026 (HISTORIQUE, dépassé par l'« État de référence — mission P0 » en fin de fichier pour `main`, la production et la finalisation ; le reste de ce paragraphe reste valable) : l'état d'alors était le haut de docs/AVANCEMENT.md et docs/audits/RAPPORT_FINAL_2026-11-13.md. À ce moment `main` = `aa05aca` (PR 36 et 38 fusionnées ; la PR 37 l'a été dans la branche de la PR 36 seulement), production sur `aa05aca`, migrations 0007 à 0020. La branche `feat/atelier-finalisation` (migration 0021) n'était alors pas fusionnée : elle l'a été depuis par la PR #39 (voir l'état de référence). Les anciens constats « non fusionné » des rapports du 12 novembre sont historiques. Lancer aussi `node --test tests/workbench-core.test.mjs`. Les appels GitHub du référentiel et de l'audit ne sont testés qu'en simulation : ne pas les déclarer validés. Exigences nouvelles : préfixe PIL-28 ; ne pas renuméroter les 465 historiques.
Reprise du 15 novembre 2026 (lot 0, mise à jour documentaire) : la branche `feat/atelier-finalisation` (migration 0021) **est fusionnée** dans `main` par la PR 39 (`1e27b01`, vérifié par `git log`). `main` = `4353342` (deux petits commits de configuration D1 après la PR 39). Le déploiement de `4353342` et les migrations 0001 à 0021 appliquées sont **rapportés, non revérifiés** (lire `/api/health`). Une seule PR ouverte : la 40 (brouillon, migration 0022 non appliquée). Les anciens constats « non fusionné » des rapports du 12 et 13 novembre sont historiques. Il n'y a plus qu'un seul agent de code (Claude Code) : les consignes de répartition avec Codex ne s'appliquent plus. Lancer aussi `node --test tests/workbench-core.test.mjs`. Les appels GitHub du référentiel et de l'audit ne sont testés qu'en simulation : ne pas les déclarer validés. Exigences nouvelles : préfixe PIL-28 ; ne pas renuméroter les 465 historiques.

## Économie des quotas (demande de Martin du 12 novembre 2026)

- Modèle par défaut : Sonnet 5.5, effort moyen. Effort élevé seulement si la complexité le justifie ; jamais d’effort maximal par habitude.
- Opus : vérification indépendante d’un travail important, audit, architecture complexe. Fable : blocage réel après analyse de l’échec. Ne pas utiliser Fable pour auditer ce qu’un test vérifie.
- Tests automatisés avant toute nouvelle analyse par un modèle. Pas de sous-agent sans bénéfice expliqué.
- Lire seulement les fichiers de la tâche ; ne pas relire le dépôt entier pour une modification localisée ; ne pas refaire une analyse notée dans docs/ ou dans le dossier de la tâche.
- Session longue : écrire un point de reprise (objectif, terminé, reste, décisions, fichiers, erreurs, tests, prochaine action) et repartir dans une session neuve.
- Ne jamais inventer un état de quota. Détail : docs/QUOTAS_CLAUDE.md. Lancer aussi `node --test tests/claude-advisor.test.mjs`.

Analyse de l'historique (12 novembre 2026) : docs/ANALYSE_HISTORIQUE.md. Elle n'utilise que Gemini, Groq et Mistral ; ne pas y ajouter Claude. Les capacités réelles des fournisseurs n'ont pas été vérifiées : ne pas supposer un mode JSON natif, un grand contexte ou une interface de lots. Lancer aussi `node --test tests/history-analysis.test.mjs`.

Finalisation (13 novembre 2026) : lire docs/IMPORT_HISTORIQUE.md avant de toucher à l'import ou à la recherche. Lancer aussi `node --test tests/zip-reader.test.mjs tests/requirements-audit.test.mjs` et `node scripts/requirements-audit.mjs` (relie chaque exigence à ses preuves : « VALIDÉ » exige un test cité et aucune limite de simulation). Aucun appel réel à Gemini, Groq, Mistral ou GitHub n'a été fait : ne rien déclarer vérifié en réel. Exigences nouvelles : préfixe FIN-31.

## État de référence — mission P0 (mis à jour le 15 novembre 2026, après la fusion de la PR #40)

- **PR #39** (finalisation, migration 0021) : fusionnée. **PR #40** (import historique fiable, migration 0022) : **fusionnée par Martin le 15 novembre 2026 à 19 h 32 UTC** (commit de fusion `69a4158`), après avoir été sortie du brouillon par lui. Ne les recréez pas.
- **Production** : relu sur `/api/health` le 15 novembre vers 19 h 35 UTC : `release_sha` = `69a4158…`, migrations **0007 à 0022 appliquées, aucune manquante**. La fusion a donc déclenché la migration et le déploiement, comme le prévoient `package.json` (`deploy:cloudflare`) et `scripts/deploy-guard.mjs`. À relire (`/api/health`) avant de s'y fier : ce paragraphe n'est qu'une photo.
- **Règle durable** : toute fusion dans `main` d'une PR qui contient une migration **applique cette migration en production**. Ne fusionner qu'avec l'autorisation explicite de Martin (un « Fusionne » de sa part, sur le SHA exact, contrôles verts) et lui rappeler que c'est aussi la décision de migration.
- **Tests** : synthétiques (archives fabriquées par les tests). Au moment de la fusion : `npx vitest run` 104/104, `tsc` propre, build à blanc réussi, `node --experimental-strip-types --test tests/*.test.mjs` 339 réussis et **1 échec** : `tests/wrangler-previews.test.mjs` (« previews n'est branché à AUCUNE ressource »), à cause de la base D1 de test `atelier-db-test` ajoutée par Martin dans `previews` de `wrangler.jsonc`. La PR a été fusionnée avec ce test en échec. **Décision de Martin du 15 novembre (PR 44) : garder cette base** ; le test n'accepte plus que celle-ci (nom et identifiant exacts) et refuse toute autre ressource ou la base de production. Non vérifié : que l'identifiant `098e53fe-…` désigne bien une base distincte de la production.
- **Vraie archive et téléphone** : le rapport `docs/audits/RAPPORT_LOT_0_2026-11-15.md` et le commit `9b55308` (annexes de 300 Ko à 1 Mo) décrivent un import de la vraie archive fait par une autre session, en local : **non reproduit ni vérifié par la session qui a écrit cette note**. Aucun essai de la vraie archive sur la production, ni sur le Samsung Galaxy A05s, n'est documenté. Aucun fournisseur IA ni GitHub réel n'a été testé.
- **Encore ouvert** : `ALLOW_REGISTRATION` vaut `"true"` en production (`wrangler.jsonc`, non modifiée, décision de Martin). Le garde-fou de quota de texte (50 Mo par compte) peut empêcher d'importer tout l'historique.
- Lire `docs/IMPORT_HISTORIQUE.md` (fonctionnement, quota de 50 Mo, annexes, reprise, limites de l'export de compte), `docs/audits/RAPPORT_P0_IMPORT_2026-11-13.md` et `docs/GUIDE_IMPORT_REEL.md` avant de toucher à l'import. Exigences nouvelles : préfixe P0-32 (8 entrées, limites déclarées). Ne pas déclarer vérifié en réel ce qui ne l'est qu'en synthétique.
- Si ce paragraphe contredit une note plus ancienne de ce fichier sur `main`, la production ou la finalisation, c'est celui-ci qui fait foi.
