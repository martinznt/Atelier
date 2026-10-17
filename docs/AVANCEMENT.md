# Déploiement — reprise du 17 octobre 2026

La demande de mise en ligne complète est conservée. Le contrôle local
`npm run deploy:check` signale cinq prérequis manquants : dépendances, build,
accès Cloudflare (jeton et compte) et configuration production. Aucun déploiement
n’a été effectué. L’accès sécurisé aux paramètres de l’environnement est demandé
pour guider la configuration ; ne demander aucune clé dans la conversation.

Quatre nouveaux tests de préparation du déploiement passent, en complément des
90 tests exécutés pour le lot `ab8f896`. Ils ne valident ni compilation ni hébergement.
Voir DEPLOIEMENT.md pour le résultat exact et les différences entre Cloudflare et Sites.

---

> Demande de mise en ligne réexaminée le 16 octobre : voir [DEPLOIEMENT.md](DEPLOIEMENT.md).
> L’accès réseau du terminal et les accès Cloudflare manquent toujours. Le Site existant
> a été relu : version 0, aucune URL active. Les 90 tests locaux ne remplacent pas
> la compilation, les tests navigateur et les services encore non intégrés.

# Lot de fiabilité — 16 octobre 2026

Le périmètre reste l’application complète et sa mémoire entre assistants. Dernier
commit antérieur : `80ac166`, branche `feat/passerelle-mcp`. Ce lot corrige des erreurs
constatées ; il n’est pas une déclaration de livraison finale ni de « zéro bug ».

## Réalisé

- Authentification : récupération, changement de mot de passe et rotation de session
  atomiques ; ancienne empreinte refusée ; déconnexion idempotente et limitée au
  compte attendu. Le header de cohérence ne remplace jamais la session serveur.
- Tâches : réservation, message utilisateur, conversation et événement groupés dans
  une transaction ; collision concurrente/idempotence traitée sans double envoi Queue.
- Discussions : requête conservée avant envoi, reprise de la même clé après réponse
  perdue ; brouillons versionnés pour protéger une nouvelle saisie contre une ancienne
  réponse ; réponse d’un autre fil/recherche écartée, discussion conservée au rafraîchissement.
- Réseau et coffre : délais bornés sans réenvoi automatique ; réponses invalidées au
  changement de session ; verrouillage invalide aussi les opérations déjà en cours ;
  impossibilité d’écraser silencieusement un coffre déjà créé.
- Passerelle : limites concurrentes, imports malformés/doublons, révocation lors d’un
  renouvellement concurrent et retrait du partage pendant un relais corrigés.
- Téléchargements hors connexion : version précise et empreinte contrôlée avant/après
  stockage ; ancienne vue ignorée. Synchronisation de projet interrompue au changement
  de compte/projet/coffre ; son résultat est explicitement partiel, sans fausse vérification.
- Tests d’intégration Hono étendus ; ils appliquent désormais toutes les migrations.
- Documentation harmonisée avec l’autorisation de déployer donnée le 14 octobre.

## Vérifié / encore bloqué

**90 tests locaux réussis** ; résultats détaillés et commandes dans VALIDATION.md. Les tests SQL et WebCrypto
exécutent les helpers de production ; les tests réseau/stockage simulés sont
explicitement identifiés. Aucun fournisseur n’est déclaré vérifié par ces tests.

`npm install` a encore échoué avec `EPERM` ; la demande d’accès réseau est restée
en attente puis a été interrompue avant résultat. Aucun motif de rejet automatique
n’a été fourni. Ne pas recommencer cette attente en boucle. Le 16 octobre,
`npm run check` échoue toujours avec `tsc: not found` (code 127).
Build, Miniflare, navigateur, installation PWA et services réels restent non validés.

GitHub `main` a été relu le 16 octobre : toujours `60f9b7fe`, README initial seulement.
Les commits applicatifs sont locaux. La synchronisation distante reste à réaliser ;
les précédentes écritures ont été interrompues sans confirmation de réussite.
Aucun site complet n’est publié. Le Site privé existant ne doit pas être recréé.

## Prochaine reprise

1. Lire le commit local du lot et conserver tous les changements ; 395 exigences suivies.
2. Installer les dépendances dans un environnement autorisant effectivement le réseau,
   produire le verrou, exécuter typage/build/Miniflare/navigateurs et corriger leurs erreurs.
3. Synchroniser le dépôt complet puis vérifier son contenu distant avant de l’annoncer livré.
4. Continuer les exigences encore ouvertes ci-dessous, puis valider les connexions réelles
   avec les accès autorisés. Publier la version complète validée sans engager de nouveaux frais.

---

# Mise à jour prioritaire — 15 octobre 2026

Le périmètre **complet** d’Atelier reste demandé. La mémoire commune entre Claude,
Claude Code, ChatGPT et Codex s’y ajoute. La réduction temporaire à un site de liaison
seul est annulée. La section 20 du cahier des charges conserve les dernières consignes.

## Réalisé dans le lot actuel

- Premier lot existant préservé au commit local `1a63164` ; aucun autre dépôt modifié.
- Imports textuels ChatGPT/Claude, journaux locaux choisis, documents et exports Atelier.
- Contexte versionné, recherche, lecture paginée, relais et export progressif dans les projets.
- Partage explicite par projet ; OAuth/PKCE, accès limité, expiration et révocation.
- Serveur MCP HTTP, outils de recherche, lecture et dépôt ; aucun appel IA payant ajouté.
- Interface intégrée aux projets et écran de consentement OAuth ; bibliothèque des fichiers
  sources ; conservation des brouillons. Analyses d’import dans un Web Worker.
- Correction du brouillon de discussion auparavant masqué sans connexion IA.
- Correction du double hachage à la connexion d’un identifiant inconnu.
- Export de compte étendu aux données de mémoire partagée ; nettoyage en cascade.

## Vérifications et limites actuelles

Le rapport VALIDATION.md détaille les tests exécutés. Les contrôles locaux utilisent
SQLite et les mêmes contrôleurs de passerelle, pas un fournisseur simulé. L’interface
TSX a été analysée syntaxiquement avec le parseur Babel déjà installé dans Playwright ;
ce n’est ni une compilation TypeScript ni une validation visuelle.

Les dépendances restent absentes : EPERM sur le réseau du terminal, demandes d’accès
réseau interrompues avant résultat. Ne pas répéter une attente d’autorisation en boucle.
La compilation, Miniflare, le navigateur sur l’application complète et les connexions
réelles restent à vérifier. Aucun résultat de déploiement ne doit être inventé.

Un Site privé a été **créé mais pas publié** : identifiant exact dans
`passerelle/.openai/hosting.json`, version 0, URL live absente au contrôle du 15 octobre.
Sa configuration provisoire ne prouve pas la prise en charge des bindings D1/R2/Queues
du projet complet. Les scripts de publication Sites référencés par le skill ne sont
pas présents dans cet environnement. Réutiliser ce Site si ce chemin est retenu.
Aucun secret Cloudflare n’est disponible pour provisionner l’architecture autonome.

## Prochaines actions

1. Enregistrer/synchroniser ce lot sur le dépôt GitHub Atelier ; vérifier le résultat distant.
2. Installer les dépendances dans un environnement dont l’accès réseau fonctionne,
   produire le verrou, typer/compiler et corriger les erreurs observées.
3. Tester les parcours Hono intégrés, imports/navigateur, OAuth fournisseur et mobile.
4. Compléter les fonctionnalités initiales encore listées ci-dessous et dans EXIGENCES.json.
5. Publier automatiquement la version validée, dans l’autorisation existante et sans
   frais supplémentaires non autorisés ; ne pas publier la passerelle seule comme résultat final.

---

# Avancement — reprise commune Codex / Claude Code

Date de référence du premier lot : 13 octobre 2026. Dépôt privé : https://github.com/martinznt/Atelier.
Branche de travail actuelle : `feat/passerelle-mcp`. Le déploiement est autorisé depuis
le 14 octobre. L’application complète doit être validée avant publication.

**Premier lot développé mais non validé de bout en bout. Il ne constitue pas la
livraison finale demandée.** Les 395 entrées du cahier des charges sont dans
EXIGENCES.json. `réalisé` = code/document disponible, `vérifié` = preuve exécutée,
`bloqué` = accès/outillage manquant, `à faire` = travail non terminé. Les limites
sont attachées à chaque entrée, sans assimiler une simulation à un service réel.

## Réalisé dans le lot

- Inspection et nouveau dépôt ; cahier des charges intégral, demandes ultérieures,
  AGENTS.md/CLAUDE.md et documents communs. Aucun changement dans Sport.
- Architecture Cloudflare Workers / D1 / R2 / Queues après précision utilisateur.
- Authentification sans email, scrypt bibliothèque, sessions, recovery codes,
  changement de mot de passe, filtrage propriétaire, export et suppression différée.
- CRUD projets, favoris/archives, conversations paginées, mémoire éditable/historique.
- API officielles OpenAI, Anthropic, Gemini, catalogue capacités, secrets chiffrés,
  test avant usage, expiration/remplacement manuel et retrait de connexion.
- Contexte choisi et visible, relais autorisé, comparaison/revue/tours limités,
  tâches persistées, flux partiels, statut/arrêt, pas de rejeu automatique incertain.
- R2 privé, fichiers importés/produits, versions/restauration, corbeille, ZIP/integrité.
- GitHub intégré : liste/branches/fichiers/commits/checks/PR en brouillon et écriture
  avec SHA attendu ; capacité de comparaison côté API (UI de diff à compléter).
- Cloudflare Pages suivi/relance/rollback ; Netlify aperçu ZIP et publication explicite.
- Interface française, cinq rubriques, thèmes clair/sombre, responsive ; PWA et
  aide iOS ; coffre local chiffré et fichiers explicitement conservés hors connexion.
- Exemples de configuration sans secrets, migrations, installation, backup/restore,
  tests HTTP et E2E préparés, workflow CI uniquement manuel.

## Vérifié dans la session

- Accès GitHub réel au dépôt privé désigné ; premier commit `60f9b7fe`.
- 3 tests cryptographiques Node et 6 tests de schéma SQLite : réussis.
- Une restauration SQLite réelle dans une base séparée, intégrité et lecture vérifiées.
- Syntaxe TypeScript serveur/scripts et présence des imports relatifs contrôlées.
- Aucun secret réel ajouté au dépôt ; aucune donnée de démonstration en production.

Les résultats complets et leur portée sont dans VALIDATION.md. Les tests SQL ne
prouvent pas le bon cloisonnement HTTP ou navigateur.

## Blocages constatés

1. Dépendances npm non installées : réseau sandbox EPERM ; demandes d’exécution
   réseau interrompues. `npm run check` retourne `tsc: not found`. Compilation,
   verrou npm, Miniflare, navigateur et vérification visuelle restent bloqués.
2. Aucune clé fournisseur configurée **dans Atelier**. L’accès GitHub du connecteur
   de l’assistant n’est pas réutilisable comme PAT applicatif. Aucun test live d’IA,
   relais, quota ou déploiement. Ne pas demander de cookies ni publier de secret.
3. Déploiement automatique autorisé depuis le 14 octobre, mais pas de runtime complet
   validé ni de secrets Cloudflare disponibles. Le Site préparatoire n’est pas publié.
4. Pas de téléphone Android/iOS physique ; aucune garantie « parfait partout ».
5. Aucun runtime isolé Codex App Server / Claude Agent SDK. Ils restent indisponibles
   dans le catalogue ; ne pas les remplacer silencieusement par une API payante.

## Travaux encore réalisables / lots suivants

- Installer et typer/compiler, corriger les défauts observés puis exécuter les tests.
- Compléter les vingt scénarios d’acceptation, particulièrement réseau, cache,
  cancellation/crash, grand historique, quotas, suppression et restauration D1/R2.
- Finaliser la synchronisation exhaustive et paginée des grands projets, estimation
  et progression exactes, dernière synchronisation partout, verrou local temporisé,
  Range/transferts reprenables et export asynchrone de grands comptes.
- Meilleure sélection/recherche des mémoires, mémoire par tâche, remplacement explicite
  d’une décision et imports structurés des formats officiellement exportables.
- Budgets monétaires par tâche/période avec tarifs sourcés, ventilation précise par
  connexion, alertes et attente de réinitialisation ; ne pas inventer les données.
- OAuth/GitHub App avec PKCE/state/refresh/révocation quand une application est
  enregistrée ; panorama complet des branches/conflits/diffs dans l’interface.
- Production vs test comparée, déploiement Cloudflare direct et gros artefacts,
  journaux expurgés, contrôles de publication adaptés à la cible.
- Runtime isolé, authentification officielle, cycles de vie et SDKs d’agents : vrais
  tests de code, sauvegarde continue d’artefacts, limites et permissions minimales.
- Rétention réelle des sauvegardes, tests matériels et suivi de dépendances.

## Prochaine étape concrète

Commencer par `git status` et les documents. L’environnement doit pouvoir installer
les dépendances (`npm install`) sans secret fournisseur. Exécuter ensuite les tests
et le build ; ne pas redévelopper les fichiers existants ni présenter les tests
préparés comme passés. Continuer sur le dépôt Atelier confirmé sans nouvelle demande
sur son nom. Les références des commits de livraison sont accessibles avec `git log`
et sur GitHub lorsque la synchronisation est confirmée ; ne pas confondre commit local
et commit distant, ni publication autorisée et publication réalisée.
