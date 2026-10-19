# Installation et déploiement Cloudflare

Le déploiement automatique est autorisé depuis le 14 octobre 2026. Aucun frais
supplémentaire n’est autorisé implicitement. État du 19 octobre : le build précédent
a réussi, mais le Worker n’a pas été publié (D1 introuvable, code 10181).
Le site exige Workers, D1, R2 privé et Queues. Codex/Claude Code isolés restent un
chantier distinct ; la publication ne les rendra pas opérationnels.

## Depuis le tableau de bord, y compris sur téléphone

1. Ouvrir **Workers et Pages → atelier → Paramètres → Builds** (ou « Build »).
   Garder le dépôt `martinznt/Atelier` et la branche de production **main**.
2. Dans la configuration du build, conserver **`npm run build`** comme commande
   de compilation. Remplacer la commande de déploiement **`npx wrangler deploy`**
   par **`npm run deploy:cloudflare`**. Enregistrer.
3. Renseigner la vraie adresse dans `cloudflare.production.json`, champ `origin`,
   ou ajouter la variable de **build** `ATELIER_PUBLIC_ORIGIN` avec cette adresse
   HTTPS complète, sans slash final. La trouver dans **Workers et Pages → Votre
   sous-domaine**, ou **atelier → Paramètres → Domaines et routes**. Le sous-domaine
   du compte n’est pas forcément son nom ni son identifiant. Ne pas deviner l’URL.
4. Les identifiants D1 et compte de ce dépôt sont déjà renseignés. Le D1 vient du
   propriétaire ; il doit encore être vérifié par Cloudflare. La Queue `atelier-tasks`
   a été créée lors du build précédent : ne pas la recréer. Vérifier que le bucket
   R2 **privé** `atelier-private-files` existe. Ne pas activer son accès public.
5. Vérifier les droits du jeton utilisé par Workers Builds : publication du Worker,
   modifications D1 pour les migrations, R2 et Queues du compte concerné. Un jeton
   généré pour un simple Worker n’a pas forcément les droits D1. Modifier ce jeton
   dans Cloudflare si nécessaire, sans copier sa valeur dans le chat ou GitHub.
6. Configurer **MASTER_KEY** comme **secret d’exécution du Worker**, dans
   **Paramètres → Variables et secrets**, selon la section dédiée ci-dessous.
   Un secret placé seulement dans les paramètres du build n’est pas accessible à
   l’application. Les identifiants D1/compte ne sont pas des clés de chiffrement.
7. Relancer le dernier build de **main** une fois ces paramètres prêts. Contrôler
   l’application des cinq migrations, la réussite du déploiement et l’URL retournée.
   Un résultat de dry-run ou d’envoi d’assets ne suffit pas.

Si l’interface ne permet pas encore de régler le secret d’exécution, conserver ce
point comme blocage de mise en service des connexions ; ne pas prétendre que tous
les services fonctionnent après le seul déploiement du Worker. Donner les étapes
utiles au propriétaire directement dans la conversation, une fois le point atteint.

Source officielle du parcours et de la séparation build/exécution :
https://developers.cloudflare.com/workers/ci-cd/builds/configuration/.
Sous-domaine : https://developers.cloudflare.com/workers/configuration/routing/workers-dev/.

## Configuration de production préparée par le dépôt

`cloudflare.production.json` contient uniquement `databaseId`, `accountId`, `origin`.
Le D1 reçu est `eea113c4-a194-4567-a15c-d1b61d9c6867`. L’origine reste `null` en
attendant la vraie adresse. Aucun token ou MASTER_KEY ne doit figurer dans ce fichier.

`npm run configure:cloudflare` lit les paramètres et crée `wrangler.production.jsonc`,
ignoré par Git. Le modèle `wrangler.jsonc` reste adapté au développement local.
Priorité des valeurs : variable de build explicite, copie de production existante,
paramètres suivis pour un checkout neuf, puis modèle local. Les variables possibles
sont `ATELIER_D1_DATABASE_ID`, `CLOUDFLARE_ACCOUNT_ID`, `ATELIER_PUBLIC_ORIGIN`.
L’adresse workers.dev du bon Worker active sa route ; un domaine personnalisé exige
une route explicitement préparée dans la copie de production. Aucune route n’est
inventée. La configuration locale/incomplète et les secrets en clair sont refusés.

La commande **`npm run deploy:cloudflare`** enchaîne configuration, migrations D1
**distantes**, puis publication avec la même copie. Elle s’arrête au premier échec.
Le script ne crée pas lui-même de ressource ; Wrangler peut proposer leur création
si elles manquent. Vérifier leur existence et les coûts avant d’accepter une création.
Conserver la base et ses sauvegardes : ne pas la supprimer pour relancer un build.

## Installation depuis un ordinateur

## 1. Préparer le dépôt

Installer Node 24 ; cloner le dépôt privé et consulter la branche de livraison.
Exécuter les commandes du README. Commiter le verrou produit par `npm install`.
Vérifier les dépendances, puis `npm run check`, `npm test`, `npm run build` et E2E.
Les tests locaux ne prouvent pas le bon fonctionnement d’une connexion distante.

Après avoir renseigné les paramètres non secrets ci-dessus, exécuter
`npm run configure:cloudflare`. Pour un autre compte, utiliser les variables de
build ou adapter les paramètres suivis avant la première génération. Une copie
existante de production est conservée sauf remplacement explicite par une variable.

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

Pour une nouvelle installation uniquement : examiner d’abord les ressources du
compte. Ne pas recréer le D1 ou la Queue déjà identifiés pour ce déploiement. Les
commandes suivantes créent des ressources et peuvent entraîner une facturation ;
elles n’ont pas été exécutées par l’assistant.

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
npm run build
npm run configure:cloudflare
npx wrangler deploy --dry-run --config wrangler.production.jsonc
npm run deploy:cloudflare
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

Le propriétaire a déjà activé Workers Builds sur `main` : un nouveau commit peut
déclencher une compilation et une publication. Désactiver les builds de prévisualisation
non configurés ; ne pas appliquer les migrations de production depuis une branche
de test. Les déploiements des projets gérés dans Atelier restent des actions explicites.

Les environnements Codex/Claude Code sont un chantier séparé. Ne pas monter la
base D1 ou une clé maître dans un agent ; ne pas exposer un socket Docker au Worker.

## Mémoire partagée et clients MCP

Appliquer **toutes** les migrations numérotées, de 0001 à 0005. 0004 conserve les
rôles historiques ; 0005 ajoute les tâches différées et les catalogues versionnés.
Les routes
`/mcp`, `/oauth/*` et `/.well-known/*` doivent passer par le Worker ; elles figurent
dans `assets.run_worker_first`. Garder `SITES_AUTHENTICATION` absent sur un Worker
Cloudflare autonome : un en-tête du navigateur ne prouve pas une identité Sites.
L’adresse MCP est `APP_ORIGIN/mcp`. L’autorisation OAuth donne accès aux seuls projets
partagés du compte. Les essais réels avec les quatre clients restent à effectuer.

## Vérifier le lot des équipes et catalogues

Après migration et validation du build, vérifier deux connexions nommées d’un même
service avec des accès de test autorisés, puis un refus de lecture par un autre
compte. Faire un essai de proposition sans lancer d’inférence, puis une tâche réelle
avec consentement à l’API. Lancer le test de planification uniquement avec l’accord
de lancement différé : fermer l’interface, vérifier l’état à la réouverture et
l’annulation avant départ. Vérifier le cron ; ne pas promettre une exécution pendant
sa désactivation. L’actualisation quotidienne des catalogues est désactivée par défaut.
Les modèles nouvellement listés ne sont jamais ajoutés seuls aux tâches en cours.
