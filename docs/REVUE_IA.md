# Configuration simplifiée de la chaîne IA — 26 octobre 2026

**État : code en PR brouillon, non déployé.** L'assistant dans « Projets → Vérifications IA »
détecte les connexions déjà testées, propose une équipe selon les modèles réellement
accessibles, permet de lier automatiquement Livre-de-recettes lorsqu'il est présent
dans la liste GitHub autorisée, et accepte une clé Mistral autorisée depuis la même
page. Les secrets ne sont jamais récupérés automatiquement depuis un autre site,
une autre application ou ChatGPT : ils doivent être saisis dans Atelier une fois.
Un compte gratuit ChatGPT n'est pas une connexion API gratuite.

Le moteur exécute un raisonnement en **trois étapes**, pour éviter les appels inutiles :
1. Résultats GitHub Actions, identification du risque, récupération contrôlée du diff.
2. Analyse IA « justesse/tests », puis, si le changement est significatif et qu'une
   **autre API autorisée** est configurée, contre-analyse « sécurité/données ».
3. Déduplication et tri des constats, production sans IA supplémentaire d'un
   **rapport pour Codex** avec erreurs GitHub, chemins, gravité et reproduction.
   La synthèse ne valide pas les erreurs : Codex doit les reproduire.

**Coûts et quotas :** toute génération IA est bloquée sans le consentement
explicite et les connexions préalablement testées. Automatisation désactivée par
défaut. Plafond par dépôt configurable de 1, 2 (défaut) ou 4 analyses par jour
UTC ; plafond absolu de 8 par compte. Les requêtes HTTP 429 marquent la connexion
comme limitée et la sélection automatique l'exclut jusqu'à une vérification
explicite. Cela borne le nombre d'appels, **pas leur coût** : aucune API payante
n'est autorisée à l'insu de l'utilisateur et le compte fournisseur doit imposer
ses propres plafonds de facturation à 0 €.

La sélection automatique est indicative : les identifiants de modèle contenant
« mini », « flash », etc. sont *présumés* plus économes, sans benchmark de qualité
ni preuve de gratuité. Une seconde IA ne partage pas la réponse de la première.
Les API sont utilisées selon leurs conditions d'âge et d'utilisation : aucun
contournement d'inscription, de vérification d'âge ou de quota.

Ce parcours réduit les interventions manuelles, mais **ne fusionne jamais de PR,
n'écrit pas de correctifs et ne déploie pas automatiquement**. Les tests de
l'interface et de Cloudflare doivent réussir avant publication.

---

# Chaîne de revue IA — Atelier

## Statut
Livrée **sur une branche**, pas activée automatiquement en production.
Un branchement et une compilation réussie ne remplacent ni un test HTTP/D1 réel
ni une analyse d'une vraie PR avec clé autorisée.

## But
Lire les PR GitHub, récupérer leurs tests et soumettre un extrait filtré du diff
à une ou deux connexions API autorisées par l'utilisateur. Les constats sont
enregistrés dans D1 et affichés dans Projets > Vérifications IA. Aucune écriture
sur le dépôt inspecté ; aucun commentaire PR, fusion ou déploiement automatique.

## Démarrage
1. Appliquer les migrations, dont 0008_pr_reviews.sql, dans le processus
   habituel de publication d'Atelier, après sauvegarde de D1.
2. Configurer et tester GitHub (droit read), associer un dépôt à un projet.
3. Configurer au moins une connexion IA autorisée pour ce compte dans Réglages.
   Mistral Studio dispose d'un mode gratuit limité, mais la gratuité ne doit
   jamais être supposée pour une clé ou un modèle non vérifié dans Studio.
4. Dans le projet, ouvrir « Vérifications IA », choisir un dépôt, le modèle
   principal et, facultativement, une connexion indépendante.
5. Lire l'avertissement de partage de code et cocher le consentement.
6. Laisser « Automatique » désactivé pour un premier essai ; enregistrer,
   choisir une PR ouverte et lancer une revue manuelle.
7. Examiner les tests et les rapports. Vérifier les constats en reproduisant
   les problèmes avant de les transmettre à Codex.
8. Activer l'automatisation seulement si les limites API ont été vérifiées
   et qu'aucun paiement n'est possible ou autorisé.

## Fonctionnement
- L'API /api/reviews est accessible uniquement après authentification.
- GET /configs?project=, /runs?project=, /pulls?repository_id=.
- POST /configs : modèle(s), consentement et activation.
- POST /start : PR existante ; déduplication par dépôt, PR et SHA Git.
- Une seule tâche est créée par commit d'une PR. Les queues ne contiennent
  qu'un identifiant ; le détail reste en D1.
- Le cron (toutes les 5 minutes) surveille au plus deux configurations et
  déclenche au plus deux nouvelles analyses par passage.
- Une PR issue d'un fork externe est exclue.
- Les tâches incomplètes ne sont jamais relancées automatiquement après un appel
  IA incertain. Les résultats partiels restent disponibles.
- Les deux IA reçoivent le même diff séparément, sans la réponse de l'autre.
  La seconde est économisée sur les changements classés simples.
- Le diff est plafonné ; les fichiers sensibles et lignes manifestement
  sensibles sont écartés. **Ce filtrage n'est pas une garantie de confidentialité**.
- Les contrôles GitHub sont affichés séparément des interprétations IA.
- Aucun système de signature de webhook n'est nécessaire : polling borné et
  authentifié via la connexion GitHub existante.

## Limites documentées
- Aucune clé fournie par le Livre de recettes n'est copiée depuis son Worker.
  Les connexions d'Atelier sont séparées.
- Le plan gratuit de Mistral a des limites RPS, TPM et mensuelles.
  HTTP 429 interrompt l'appel ; aucune promesse de renouvellement de quota.
- Les abonnements ChatGPT gratuits/Plus ne sont pas des clés API OpenAI gratuites.
- Claude Code et Codex ne sont pas lancés par cette fonctionnalité.
- La relecture automatique n'écrit pas encore de tests ou de correctifs sur
  GitHub : elle donne les éléments probants nécessaires à Codex.
- Les PR volumineuses ou les diffs sans patch sont signalés comme partiels.
- La conclusion d'une IA n'est pas une preuve. Les tests GitHub n'enregistrent
  qu'un sous-ensemble de l'état d'une application.
- Aucun test de fournisseur réel, de stockage distant D1, de Cloudflare ou
  sur le téléphone physique n'est attesté par ce document.

## Validation attendue avant fusion
- npm install --no-audit --no-fund
- node --test tests/review-core.test.mjs
- npm run check && npm test && npm run build
- npm run test:e2e (avec migrations D1)
- Tests de permissions A contre B, idempotence, stale SHA, quota/429,
  réponse tronquée, erreur API, secrets masqués et rechargement des rapports.
- Essai à blanc sur PR non sensible ; revue des captures et de la console.

## Sources
- https://docs.mistral.ai/fr/api
- https://help.mistral.ai/fr/articles/698531-pourquoi-est-ce-que-j-atteins-mes-limites-d-usage-api-et-comment-les-augmenter
- https://developers.cloudflare.com/queues/platform/pricing/
- https://docs.github.com/en/rest/pulls/pulls
