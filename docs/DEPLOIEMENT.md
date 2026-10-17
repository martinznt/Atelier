# État réel du déploiement — 17 octobre 2026

La publication de l’application complète est autorisée. Aucun frais supplémentaire
n’est autorisé implicitement. Aucun site complet n’a encore été publié.

## Sources disponibles sur GitHub

Le 17 octobre, le transfert sur `main` a réussi : commit `ecc78e892ffdef9103a5f371d0be1d9052ebe098`.
Les 106 fichiers applicatifs ont été comparés à la copie locale `3d49fd6` et correspondent.
Cette sauvegarde de code ne publie pas le site. Les accès Cloudflare ne sont pas encore configurés.
Les explications destinées au propriétaire doivent aussi être fournies directement dans le chat,
par petites étapes. Ne jamais demander la valeur d’un jeton dans un message.

## Contrôles effectués après la demande de mise en ligne

- Sources conservées : branche `feat/passerelle-mcp`, commit applicatif `ab8f896`.
- Site existant relu : `appgprj_6acfeb7b61988191a0e2e0f632486116`, version 0,
  aucune URL active. Ne pas créer un deuxième Site.
- Nouvelle installation npm tentée : refus réseau du terminal `EPERM`.
- Configuration de l’environnement relue : aucun secret ou accès Cloudflare configuré.
- Aucun identifiant de ressource, jeton, build ou résultat de déploiement inventé.

## Chemin compatible avec le code existant

Cloudflare Workers natif, avec les bindings `DB` (D1), `FILES` (R2 privé),
`TASKS` (Queues), les assets React et le cron toutes les cinq minutes.
La procédure est dans INSTALLATION_CLOUDFLARE.md. Le compte utilisé, les ressources
existantes et leurs limites doivent être vérifiés avant création de ressources.

La configuration suivie par Git est volontairement locale : identifiant D1 factice,
`APP_ORIGIN` local et aucune route de publication. Elle ne doit pas être envoyée
telle quelle. Il faut une configuration production avec identifiants réels et URL
HTTPS, une nouvelle clé maître serveur, puis compilation, migrations et tests.
Les clés doivent être ajoutées via un mécanisme de secrets ; pas dans la conversation,
le dépôt, les journaux ou une archive de sources.

## Pourquoi le Site préparé ne suffit pas

Les références Sites consultées documentent D1 et R2, mais ne démontrent pas de
prise en charge des bindings Queues et des événements Worker `scheduled` utilisés
par Atelier. Ceux-ci servent aux tâches longues, aux reprises et à la suppression
effective des comptes. Un appel `waitUntil` ne les remplace pas durablement.

Le manifeste sous passerelle/ est provisoire et conserve seulement l’identité du
Site ; son `r2:null` et l’absence d’artefact complet ne constituent pas un déploiement
possible de toute l’application. Les helpers officiels de build/source sont absents
localement. Les migrations Sites documentées et les migrations SQL actuelles avec
triggers nécessitent une compatibilité vérifiée avant un éventuel portage.

## Conditions de reprise

1. Donner au terminal l’accès réseau nécessaire aux dépendances puis exécuter les
   contrôles de VALIDATION.md ; aucune nouvelle autorisation de publication à demander.
2. Configurer un accès Cloudflare sécurisé et identifier le compte et les ressources.
3. Compléter les fonctions encore ouvertes (dont les runtimes isolés Codex/Claude Code)
   et les tests d’acceptation ; un déploiement seul ne les implémente pas.
4. Publier la version validée, vérifier les ressources et les parcours, puis retourner
   l’URL effectivement déployée. Ne pas annoncer le site complet avant ces étapes.

## Reprise du 17 octobre

L’environnement est connecté, mais aucune dépendance npm n’est présente. La dernière
demande de permission réseau a été interrompue sans résultat d’installation. Ne pas
la relancer en boucle. Aucun refus d’approbation automatique motivé n’a été reçu.
La recherche d’une connexion Cloudflare dans le catalogue de plugins n’a retourné
aucun résultat ; cela ne prouve pas qu’aucune autre intégration n’existe ailleurs.

`npm run deploy:check` effectue maintenant un contrôle local sans réseau ni
création de ressource. Exécuté le 17 octobre : **5 prérequis manquants**, sortie 1 :
dépendances, build, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID et configuration
production. Quatre tests du contrôleur sont passés. La présence de ces éléments
ne prouvera pas les permissions distantes, les migrations ou la réussite des tests.

La copie de configuration attendue par ce contrôle utilise le JSON sans commentaires
de l’exemple du dépôt ; le format JSONC complet reste du ressort de Wrangler.
Configurer les accès via les secrets de l’environnement, jamais dans un message.
Une question sur l’accès à ces paramètres a été posée pour pouvoir guider le
propriétaire sans lui demander de transmettre ses clés ici.
