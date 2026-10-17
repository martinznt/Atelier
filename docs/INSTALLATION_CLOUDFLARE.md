> Autorisation actualisée : le déploiement automatique est demandé depuis le 14 octobre
> 2026. Les commandes ci-dessous restent la procédure Cloudflare ; aucune ressource
> facturable supplémentaire n’est autorisée implicitement. Les accès Cloudflare et
> la validation complète manquent encore dans cet environnement.

# Installation et déploiement Cloudflare

État : procédure préparée, aucun déploiement effectué. Ne déployer qu’après compilation,
tests HTTP, tests navigateur et revue des blocages dans VALIDATION.md. Un Worker
statique seul ne fournit ni la base, ni les fichiers, ni l’exécution des agents.

## 1. Préparer le dépôt

Installer Node 24 ; cloner le dépôt privé et consulter la branche de livraison.
Exécuter les commandes du README. Commiter le verrou produit par `npm install`.
Vérifier les dépendances, puis `npm run check`, `npm test`, `npm run build` et E2E.
Les tests locaux ne prouvent pas le bon fonctionnement d’une connexion distante.

Le fichier `wrangler.jsonc` est une configuration locale et un exemple pour la
production : il ne contient aucun compte Cloudflare. Copier ce fichier vers
`wrangler.production.jsonc` (ignoré par Git) et modifier cette copie.

Avant toute publication, `npm run deploy:check` liste les prérequis locaux manquants
sans contacter Cloudflare. Il ne vérifie pas les droits des jetons ni les tests.
Il attend une configuration JSON sans commentaires, comme l’exemple du dépôt.
Les ressources et permissions doivent ensuite être contrôlées avec les outils officiels.

## 2. Choisir les ressources et connaître les coûts

- Cloudflare Workers avec static assets et CPU suffisant pour scrypt. Prévoir
  Workers Paid si le budget CPU gratuit ne suffit pas ; vérifier les tarifs actuels.
- D1 pour la base relationnelle, R2 **privé** pour les contenus, Queues pour les tâches.
- Nom DNS ou sous-domaine workers.dev, HTTPS. Ne pas activer un accès public R2.
- Les API IA sont distinctes des abonnements grand public ; leurs dépenses sont
  contrôlées aussi chez le fournisseur. Aucun prix n’est codé comme une garantie.

Sources : https://developers.cloudflare.com/workers/platform/pricing/,
https://developers.cloudflare.com/d1/platform/pricing/,
https://developers.cloudflare.com/r2/pricing/,
https://developers.cloudflare.com/queues/platform/pricing/.

## 3. Créer les ressources dans votre compte

Ces commandes sont données pour votre exécution ultérieure. Elles peuvent créer
des ressources facturables ; elles n’ont pas été exécutées dans cette session.

```sh
npx wrangler login
npx wrangler d1 create atelier-db
npx wrangler r2 bucket create atelier-private-files
npx wrangler queues create atelier-tasks
```

Reporter l’identifiant D1 **retourné** dans la configuration de production. Adapter
les noms de bucket et queue pour éviter une collision avec d’autres applications.
Définir `APP_ORIGIN` à l’URL HTTPS exacte sans slash final. Définir une route/custom
domain ou activer explicitement `workers_dev` dans cette copie lorsque vous êtes
prêt à publier. Conserver `workers_dev:false` dans l’exemple suivi par Git.

Définir une allocation CPU adaptée avec `limits.cpu_ms` selon le plan choisi.
Mesurer l’inscription/connexion sur un environnement Cloudflare de test avant
d’ouvrir les inscriptions. La bibliothèque scrypt consomme 16 MiB par calcul,
au maximum trois calculs simultanés par isolate dans le code.

## 4. Configurer le secret de chiffrement

Générer une clé aléatoire de **32 octets en base64** avec votre gestionnaire de
secrets ou une commande locale. L’entrer par stdin dans Wrangler :

```sh
npx wrangler secret put MASTER_KEY --config wrangler.production.jsonc
```

Ne pas copier la clé locale de développement. Ne pas mettre la clé dans GitHub,
une issue, un log ou un export utilisateur. Conserver une copie chiffrée séparée
des sauvegardes. Sans elle, les connexions chiffrées ne sont pas récupérables.
Les comptes et fichiers n’utilisent pas cette clé comme mot de passe utilisateur.

## 5. Migrer puis publier la version validée

Sauvegarder les ressources existantes avant migration ; pour une base neuve :

```sh
npm run build:web
npx wrangler d1 migrations apply atelier-db --remote --config wrangler.production.jsonc
npx wrangler deploy --dry-run --config wrangler.production.jsonc
npx wrangler deploy --config wrangler.production.jsonc
```

Le dernier appel publie et doit porter sur la version validée. Ne pas confondre un dry-run avec un
déploiement réussi. Vérifier les bindings et l’URL retournée, `/api/health`,
inscription sans email, connexion sur deux comptes, une conversation API autorisée,
un téléchargement, les cookies Secure, les tâches Queues et le cron.

## 6. Exploitation

Configurer les sauvegardes D1/R2 et leur durée de rétention (voir SAUVEGARDES.md).
Après déconnexion, vérifier sur tous les appareils utilisés que les caches privés
sont effacés. Configurer `ALLOW_REGISTRATION=false` si les inscriptions doivent être
fermées. Les comptes existants restent utilisables.

Ne brancher aucun déploiement automatique GitHub/Cloudflare à ce dépôt tant qu’il
n’est pas souhaité. Certains services déploient sur chaque push : le vérifier
avant d’activer l’intégration Git. Aucune fusion ou publication n’est exécutée
automatiquement par l’application.

Les environnements Codex/Claude Code sont un chantier séparé. Ne pas monter la
base D1 ou une clé maître dans un agent ; ne pas exposer un socket Docker au Worker.

## Mémoire partagée et clients MCP

Appliquer **toutes** les migrations numérotées, notamment 0002 et 0003. Les routes
`/mcp`, `/oauth/*` et `/.well-known/*` doivent passer par le Worker ; elles figurent
dans `assets.run_worker_first`. Garder `SITES_AUTHENTICATION` absent sur un Worker
Cloudflare autonome : un en-tête du navigateur ne prouve pas une identité Sites.
L’adresse MCP est `APP_ORIGIN/mcp`. L’autorisation OAuth donne accès aux seuls projets
partagés du compte. Les essais réels avec les quatre clients restent à effectuer.
