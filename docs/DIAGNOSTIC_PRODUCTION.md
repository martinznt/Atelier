# Diagnostic et validation des fonctions essentielles d’Atelier

Dernière préparation : 26 octobre 2026. **Ne pas confondre tests CI et validation des ressources Cloudflare de production.**

## Accès rapide, sans modification dangereuse

1. Dans Atelier, ouvrir **Réglages → Connexions → Vérifier Atelier**.
2. Le contrôle examine uniquement la forme de `MASTER_KEY`, l’origine HTTPS, les bindings `DB` / `TASKS` / `ASSETS`, la présence des tables et la colonne `review_configs.daily_limit`. Il ne lit ni ne renvoie les contenus de clés ou de conversations.
3. Si `MASTER_KEY` manque : créer un secret Cloudflare *seulement s’il n’existe pas déjà*. **Ne jamais régénérer la clé d’une installation ayant déjà des connexions chiffrées** ; cela rendrait ces dernières illisibles. Conserver l’ancienne clé dans un coffre sûr.
4. Si des tables ou `daily_limit` manquent : **exporter/sauvegarder D1**, puis appliquer uniquement les migrations manquantes, sur la D1 existante. Ne pas purger D1 ni recréer de compte.
5. Si un binding est absent : restaurer la configuration du Worker prévue dans `cloudflare.production.json` et `scripts/configure-cloudflare.mjs`, sans effacer les secrets du Worker.
6. Après correction des prérequis, tester séparément **GitHub** en utilisant le bouton `Tester l’accès` : l’API GitHub distante doit répondre. Un diagnostic Worker vert n’atteste pas un jeton GitHub valide.
7. En cas d’échec, conserver le jeton, relever **uniquement le code HTTP** ou le message d’erreur (jamais la clé), puis vérifier les journaux Cloudflare `Workers & Pages → atelier → Observability → Logs`, et l’état du fournisseur.

## Matrice de vérification avant une publication

| Fonction indispensable | Vérification déterministe | Vérification distante |
|---|---|---|
| Comptes/sessions | Vitest Hono/Miniflare et Playwright | Connexion / reconnexion sur ordinateur et mobile |
| Deux comptes séparés | Tests d’isolation dans `tests/integration.test.ts` | Deux comptes de test avec ressources distinctes |
| Connexions GitHub/API | Tests de stockage chiffré, erreurs HTTP, readiness | Jeton autorisé, `Tester l’accès`, dépôt visible |
| Projets/mémoires | Tests d’intégration API et interface | Création, lecture et rechargement sur le compte réel |
| Discussions et collaboration | Tests de tâche, consentement, quotas et rôles | Modèle accessible et générateur **autorisé sans frais supplémentaires** |
| Historique, fichiers et exports | Tests D1, intégrité, ZIP, relecture et suppression | Import/export et téléchargement d’un fichier de test |
| PR et contrôle IA | Déduplication SHA, quotas par jour, isolation, CI | Lire une PR autorisée puis choisir une analyse volontaire |
| Mode hors connexion | Tests de session/cache/IndexedDB/manifest | PWA installée : lecture en mode avion, pas d’appels externes |
| Tâches en arrière-plan | Tests Queue et simulation Miniflare | Queue + consommateur + cron en état correct dans Cloudflare |
| Sécurité et données | Origin strict, secrets chiffrés, validations d’accès | Logs Cloudflare sans secrets et limites Free confirmées |

## Classification des erreurs

- `MISSING_MASTER_KEY` : configuration serveur Cloudflare à corriger sans remplacer un secret existant.
- `D1_MIGRATION_REQUIRED` : problème de schéma ; sauvegarder D1 avant migration.
- `D1_TEMPORARILY_UNAVAILABLE` : disponibilité D1 à vérifier.
- `UNEXPECTED_SERVER_ERROR` : consulter le diagnostic et les journaux du Worker.
- `HTTP 401/403` du fournisseur : droits du jeton/clé ; n’ajouter aucun droit d’écriture inutile.
- `HTTP 404` : ressource ou point d’accès non trouvé, ce n’est pas une preuve de jeton invalide.
- `HTTP 429` : limite API, pas de tentative automatique ni contournement.
- `HTTP 5xx` : fournisseur/passerelle en erreur, ne pas relancer une action d’écriture à résultat incertain.
- `network` : connexion sortante non confirmée, voir logs et état du service.

## Validation de mise en production

1. Sur la branche de travail : TypeScript, tests natifs, Miniflare, compilation, Playwright Chrome bureau et Android.
2. Avant la fusion : comparer les migrations avec la base existante, conserver `MASTER_KEY`, les bindings et `APP_ORIGIN`, vérifier l’offre gratuite et l’absence de R2 requis.
3. Après publication : consulter `/api/health`. La présence de `features.private_readiness: 'v1'` prouve que la version incluant le diagnostic a été déployée ; **cela ne prouve pas que tous les composants externes fonctionnent**.
4. Dans Atelier : `Vérifier Atelier`, puis `Tester l’accès` GitHub, consulter la liste de dépôts, ouvrir une PR et sa CI. Faire un petit test de fichier, export et rechargement.
5. Ne pas activer le mode IA périodique avant le test manuel, la vérification des limites d’usage chez le fournisseur et le consentement.
6. Après chaque future migration ou changement de bindings, refaire le diagnostic sans réinitialiser les données.

## État des limites connues

- Aucun jeton de l’utilisateur n’est accessible depuis GitHub ni l’assistant : les tests automatisés utilisent uniquement de fausses clés.
- Un succès GitHub Actions ne valide **pas** le vrai GitHub, D1 distante, le Worker publié, la PWA sur appareil réel, ni la facturation fournisseur.
- Codex App Server et Claude Code nécessitent toujours un environnement d’exécution isolé non disponible dans cette version ; ils ne sont pas simulés comme connectés.
- Une panne externe reste possible ; la priorité est d’en donner la cause, de préserver les données et de rendre sa correction réversible.
