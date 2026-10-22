# Déploiement Cloudflare — refonte sans R2

La branche feat/stockage-gratuit-outils est en développement. Ne pas la publier
comme version entièrement validée. Les cinq migrations existantes sont conservées ;
0006 est additive. Aucun bucket, plan payant, carte bancaire ou nouvelle base requis.

## Après validation et intégration sur main

1. Dans Workers et Pages → atelier → Paramètres → Builds, garder martinznt/Atelier,
   branche main. Désactiver les déploiements de branches non configurées.
2. Compilation : `npm run build`. Déploiement : `npm run deploy:cloudflare`.
3. Les paramètres non secrets sont déjà dans cloudflare.production.json : D1 fournie
   et origine https://atelier.martin-zannet22.workers.dev. Ne pas recréer la D1.
4. Vérifier le plan Workers Free, le D1 existant et la Queue atelier-tasks créée
   précédemment. Ne pas créer de bucket R2. Le script retire aussi l’ancien binding
   d’une copie de production existante.
5. Jeton Workers Builds : droits Worker, D1 migrations et Queues sur ce seul compte.
   Le conserver dans Cloudflare ; aucune valeur à envoyer dans le chat ou GitHub.
6. Secret d’exécution `MASTER_KEY` dans Paramètres → Variables et secrets du Worker :
   32 octets aléatoires encodés en base64, à conserver séparément dans un coffre.
   Conserver la clé existante si des connexions chiffrées existent déjà. Changer sa
   valeur sans procédure rendrait ces connexions illisibles.
7. Sauvegarder la D1 avant migration. Relancer le build de main uniquement après
   validations ; le script vérifie la branche avant migration/publication. Les
   migrations déjà appliquées ne sont pas rejouées, la base n’est pas purgée.
8. Vérifier le succès effectif du Worker, l’URL, /api/health, inscription/connexion,
   deux comptes isolés, fichier texte/versions/export et tâches. Le dry-run ne prouve
   jamais la réussite en production.

## Développement et contrôles

Node 24, npm, Python 3 pour les tests SQLite. `npm install`, puis commandes du README.
`npm run configure:cloudflare` génère wrangler.production.jsonc ignoré par Git, sans
réseau ni migration. Les variables de build ATELIER_D1_DATABASE_ID,
CLOUDFLARE_ACCOUNT_ID, ATELIER_PUBLIC_ORIGIN remplacent les paramètres suivis. Aucun
secret dans ces fichiers. La configuration locale wrangler.jsonc reste locale.

```sh
npm run test:core
npm run test:bridge
npm run test:regressions
npm run check
npm test
npm run build
npm run test:e2e
```

## Blocages à résoudre avant mise en service gratuite

Le scrypt actuel reste sûr mais son CPU sur Workers Free (10 ms) n’a pas été mesuré.
Aucune garantie de fonctionnement des comptes sur ce plan avant ce contrôle et,
si nécessaire, une migration sûre du mécanisme. Le remplacer par un hash faible ou
imposer Workers Paid serait contraire à la mission.

L’environnement de l’assistant n’a ni dépendances npm installées ni accès Cloudflare.
Les derniers essais check/test/build s’arrêtent sur tsc/vitest absents ; voir VALIDATION.
Le proxy terminal est inaccessible et la demande réseau précédente a été interrompue.
Aucun test navigateur ou déploiement de ce lot n’a été déclaré réussi.

Sources : https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
(WORKERS_CI_BRANCH et séparation build/exécution), LIMITES_GRATUITES.md.
Codex/Claude Code isolés restent indisponibles ; publier le Worker ne les active pas.
