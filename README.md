> Refonte gratuite en cours sur `feat/stockage-gratuit-outils` (21 octobre 2026).
> R2 retiré du serveur et de la configuration ; petits textes privés dans D1,
> versions préservées. Bibliothèque GitHub complète et Mes outils/Outil-image encore
> à développer. Ce lot n’est pas une livraison complète validée. Voir
> [mission](docs/REFONTE_GRATUITE.md), [avancement](docs/AVANCEMENT.md),
> [limites gratuites](docs/LIMITES_GRATUITES.md) et [validation](docs/VALIDATION.md).

# Atelier

Un espace personnel, en français, pour retrouver ses projets, passer d’un assistant à l’autre avec un contexte choisi et conserver ses fichiers. Interface responsive Android, iPhone/iPad et ordinateur ; installation progressive en PWA.

**État : application en développement ; aucune publication réussie confirmée. Ce n’est pas la livraison finale du cahier des charges.** Le lot précédent a passé TypeScript et le build chez Cloudflare. Les tests HTTP D1, navigateur et connecteurs réels restent à effectuer ; les changements du 19 octobre nécessitent une nouvelle compilation.

Le dépôt privé est [martinznt/Atelier](https://github.com/martinznt/Atelier), branche `main`. Le déploiement automatique est autorisé depuis le 14 octobre. La discussion garde les échanges au centre ; « Mes assistants » regroupe comptes, modèles, rôles et limites, selon la demande d’une expérience simple inspirée d’Open Chat.

## Ce que contient le lot

- Comptes sans email, mots de passe scrypt, sessions révocables, codes de récupération et autorisations serveur par propriétaire.
- Projets, conversations persistantes et paginées, mémoire éditable avec historique et provenance.
- Connecteurs API officiels OpenAI, Anthropic et Gemini ; passage de relais, comparaison et revue avec consentement explicite.
- Connexions nommées, rôles personnalisés, choix selon délai et préférences, catalogue actualisable avec accord. Voir [le guide](docs/GUIDE_ASSISTANTS.md).
- Tâches Cloudflare Queues, statut persistant, arrêt et sauvegardes de réponses intermédiaires. Aucun code généré n’est exécuté dans le serveur.
- Petits fichiers texte D1 privés, versions immuables, restauration, corbeille, téléchargements et ZIP avec manifeste SHA-256.
- GitHub intégré : dépôts autorisés, branches, fichiers, commits, contrôles, sauvegarde avec détection de conflit, pull requests en brouillon.
- Cloudflare Pages : consultation, relance et retour à un déploiement existant. Netlify : aperçu ZIP, consultation et publication explicite.
- PWA, coffre local chiffré sur appareil de confiance, lecture des éléments synchronisés, téléchargement explicite des fichiers et brouillons non envoyés.

**Codex App Server et Claude Code ne sont pas encore opérationnels** : leur service d’exécution isolé reste à construire et héberger. Les API OpenAI et Anthropic ne sont pas leurs abonnements. Aucune conversation, clé, facture ou quota fictif n’est affiché en production.

## Démarrer localement

Prérequis : Node.js 24, npm et Python 3 pour le contrôle SQLite indépendant. Aucun compte Cloudflare nécessaire pour l’émulation locale.

```sh
npm install
npm run setup
npm run db:migrate
npm run dev
```

Ouvrir `http://localhost:8787`. Le serveur local Wrangler émule Workers, D1 et Queues. `npm run setup` crée uniquement une clé locale dans `.dev.vars`, ignorée par Git. Le volume local est `.wrangler/state`.

La première inscription crée un compte vide. Aucun compte de démonstration, aucune clé prédéfinie. Conservez les codes de récupération. Ajoutez vos services dans **Réglages → Connexions → Ajouter**, définissez leurs accès et testez-les. Une clé API peut entraîner une facturation fournisseur : rien n’est envoyé à une IA avant votre action explicite.

Pour développer l’interface avec Vite, lancez aussi `npm run dev:web`, mais utilisez l’origine du serveur pour les tests d’authentification et de PWA. Ne changez pas APP_ORIGIN sans adapter l’origine du navigateur.

## Vérifier

```sh
npm run test:core
npm run test:bridge
npm run test:regressions
npm run check
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

Les tests de connecteurs avec réponses contrôlées, lorsqu’ils seront exécutés, ne vaudront pas validation réelle d’un compte fournisseur. Le workflow GitHub `Vérifications Atelier` est manuel ; vérifiez les minutes et conditions GitHub Actions avant son lancement. Il ne déploie rien.

Le verrou des dépendances doit être généré par le premier `npm install` réussi, vérifié puis commité. Il n’a pas été inventé pendant la session sans accès réseau terminal.

## Déployer sur Cloudflare

Suivre [INSTALLATION_CLOUDFLARE.md](docs/INSTALLATION_CLOUDFLARE.md). Atelier utilise un **Worker avec assets, D1 et Queues**, et ne peut pas être livré comme simple dossier Pages statique. Objectif : fonctions essentielles sur l’offre gratuite sans R2 ni carte supplémentaire. Le CPU scrypt sur Workers Free reste à mesurer ; aucune formule payante ne sera activée silencieusement. Les API IA ont leurs conditions séparées.

Dans Workers Builds, conserver `npm run build` et choisir **`npm run deploy:cloudflare`** comme commande de déploiement. Le script lit les paramètres non secrets de `cloudflare.production.json`, vérifie l’origine HTTPS, génère la copie de production, applique les migrations puis publie. L’origine de production est renseignée : https://atelier.martin-zannet22.workers.dev. `wrangler.jsonc` reste le modèle local ; ne pas le publier directement. Les ressources et le secret serveur doivent être configurés selon le guide.

## Références communes aux assistants

- [Cahier des charges intégral](docs/CAHIER_DES_CHARGES.md), avec toutes les précisions utilisateur.
- [Avancement et prochaine étape](docs/AVANCEMENT.md).
- [Exigences suivies individuellement](docs/EXIGENCES.json).
- [Architecture](docs/ARCHITECTURE.md), [connecteurs](docs/CONNECTEURS.md), [validation](docs/VALIDATION.md).
- [Sécurité](docs/SECURITE.md), [sauvegarde et restauration](docs/SAUVEGARDES.md).
- `AGENTS.md` et `CLAUDE.md` renvoient vers ces mêmes documents.
