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
