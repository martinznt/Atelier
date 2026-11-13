# Comptes email — contrôles du 24 octobre 2026

- **173 tests locaux réussis** : test:core 9 (3 Node + 6 Python), test:bridge 27,
  test:regressions 137. Les 12 ajouts couvrent minimum exact 8/7, Unicode, adresses
  invalides/normalisation, transition des anciens comptes, adresse unique/casse,
  conflit concurrent, propriétaire incorrect, compte désactivé/hash ancien, rollback,
  session/récupération ancienne après enrôlement et routes publiques de transition.
- Restauration de la copie locale : **133 blobs conformes aux SHA de main 31c8172**,
  y compris icônes binaires et correction storage.ts du propriétaire. Aucun ancien
  workspace applicatif présent ; les changements non enregistrés ne sont pas récupérés.
- Analyse Babel : **59 sources TS/TSX syntaxiquement valides**, aucun typage déduit.
- Nouveaux cas Miniflare écrits : email obligatoire/absent/invalide/dupliqué, 8 vs 7,
  login/changement/récupération, ancien compte/enrôlement, mauvais mot de passe,
  refus du compte B et révocation de l’ancienne session. **Non exécutés**.
- E2E actualisé pour email + mot de passe exactement huit ; **non exécuté**.
- npm run check / npm run build : échec 127, tsc absent. npm test : 127, vitest absent.
  Curl npm échoue sur proxy:8080. Aucune nouvelle longue demande réseau répétée.
- Aucun fournisseur, navigateur, CPU scrypt Free, restauration Cloudflare ou déploiement
  réel validé. La syntaxe et les transactions SQLite ne remplacent pas ces contrôles.

La branche est à vérifier avant intégration. Le journal Cloudflare du 22 octobre
signalait TS2345 sur readVersion ; la correction manuelle est présente sur main,
mais un build distant réussi après cette correction n’a pas été fourni.

---

# Validation de la refonte — 21 octobre 2026

Dernière exécution complète : **161 tests locaux réussis** (9 cœur/schéma,
27 passerelle, 125 régressions incluant stockage et gardes). Aucun test fournisseur
ou navigateur compris dans ce total.

- tests/storage-store.test.mjs : **11 réussis**, statements de production sur SQLite,
  isolation A/B, UTF-8/BOM/limites, versions/restauration, conflit concurrent, quotas,
  rollback, cascade et migration depuis les cinq anciens schémas. Aucun R2 simulé.
- test:core : **9 réussis**, dont sauvegarde/restauration SQLite isolée réelle.
- test:bridge : **27 réussis**, HTTP local Request/Response, pas les fournisseurs.
- Régressions existantes : **111 réussies** après refactorisation. Ajouts ensuite :
  **1 test configuration** (ancienne copie avec binding retiré) et **2 tests garde**
  (refus de branche et priorité WORKERS_CI_BRANCH), tous réussis.
- npm run configure:cloudflare : réussi, fichier privé généré sans r2_buckets et
  sans toucher aux ressources distantes. Origine et D1 réelles du dépôt conservées.
- Syntaxe Babel : 58 TS/TSX valides au contrôle effectué. Ce n’est pas un typage.
- git diff --check : réussi au contrôle effectué.
- npm run check / npm run build : arrêt 127, tsc absent ; npm test : 127, vitest absent.
  Aucun nouveau build/Miniflare/navigateur/visuel/PWA ou test fournisseur réussi.
- Curl terminal vers npm : échec immédiat proxy:8080 ; demande réseau supplémentaire
  du 19 octobre interrompue sans résultat. Ne pas relancer une attente identique.

Les anciens contenus R2 n’ont pas été lus/migrés, seule la conservation des références
est testée. Les réponses IA à saturation sont testées au niveau du helper de capture,
pas par une inférence réelle. Aucun accès Cloudflare configuré et aucune publication
réalisée. CPU scrypt Workers Free et acceptation complète restent non vérifiés.
Les résultats ci-dessous décrivent les lots historiques.


---

# Contrôles du 19 octobre 2026

## Livraison du lot applicatif et dernier contrôle consulté

- GitHub `main` : `b79fe702d1f7801c2900407ad78f68da2dc80923` ; parent de configuration
  `947467c6d0306d69d53640f9728dd62990428ec0`.
- Arbre `13cb294e5c1ee625c9f85bc67ec264011f995b26` identique au local `42466f8`.
  Relecture récursive : 125 blobs, mêmes chemins, modes et SHA ; aucune troncature.
- Mise à jour de `main` sans force, avec contrôle du SHA précédent. Copie locale propre.
- Workers Builds, contrôle `117975116648`, build `6f8de76a-4b95-4791-8f0e-98329c71e708` :
  **failure**, terminé le 19/10/2026 à 09:00:34 UTC. Aucun texte de journal et aucune
  annotation dans la réponse GitHub. La cause exacte de cette nouvelle tentative
  n’est donc pas vérifiée ; ne pas prétendre que ses tests ou son build ont réussi.
- La commande du tableau de bord doit utiliser `deploy:cloudflare` et l’origine
  réelle doit être fournie. Le script de configuration préparé ne peut pas modifier
  les paramètres Workers Builds depuis cet environnement sans accès Cloudflare.

## Preuves distantes reçues

Le transfert précédent vers GitHub `main` est confirmé au commit
`35d5d2a10d087900eb7636be35deee76a94c2844` (arbre identique à `fd32197`, 122 fichiers).
La branche a été relue le 19 octobre avant les nouvelles modifications.

Journal Cloudflare fourni par le propriétaire, 18 octobre 2026, 21:00:18–21:01:04 UTC :

| Étape | Résultat observé |
| --- | --- |
| Installation Bun | Réussie, 161 paquets |
| `tsc --noEmit` | Réussi, sans TS2783 |
| Vite | Réussi, 1599 modules ; JS principal 388,49 kB (120,06 kB gzip) |
| Shell PWA | 8 ressources versionnées ; aucune réponse API mise en cache par ce script |
| Wrangler dry-run | Réussi ; bundle Worker 1071,03 KiB (198,71 KiB gzip) |
| Envoi des assets | 9 fichiers envoyés |
| Provisionnement TASKS | Queue `atelier-tasks` créée |
| Publication du Worker | Échec 10181 : identifiant D1 `00000000-0000-0000-0000-000000000000` introuvable |

Cette preuve valide la compilation du lot précédent, pas les intégrations, l’installation
PWA, l’accès hors ligne ou le fonctionnement en production. Le binding R2 affiché
ne prouve pas l’existence du bucket. Aucun résultat positif du déploiement n’a été reçu.

## Contrôles locaux du nouveau lot

| Contrôle réellement exécuté | Résultat / portée |
| --- | --- |
| `npm run test:regressions` | 111 tests réussis ; 101 précédents + 10 de configuration |
| `node tests/configure-cloudflare.test.mjs` | 10 réussis : origine et ID invalides, bindings, absence de secrets, copie indépendante, priorité des paramètres, conservation du fichier en cas d’échec |
| `node tests/deploy-check.test.mjs` | 4 réussis, inclus dans les 111 |
| `npm run configure:cloudflare` avec les paramètres suivis | Échec attendu, code 1 : origine HTTPS/route manquantes ; aucun fichier de production incomplet écrit, aucun appel réseau |
| Analyse syntaxique Babel | 59 fichiers TS/TSX valides, y compris le panneau « Mes assistants » ; ce n’est pas un contrôle TypeScript |
| `node --check` des deux scripts de configuration | Réussi |
| `git diff --check` | Réussi |
| `npm run check` / `npm run build` | Arrêt 127 : `tsc: not found`, dépendances locales absentes |
| `npm test` | Arrêt 127 : `vitest: not found` ; aucun test Miniflare exécuté |

Les valeurs des tests sont des fixtures. Le D1 réel fourni par le propriétaire est
conservé dans un fichier non secret, mais son existence et ses permissions n’ont pas
été vérifiées par l’assistant. Les 9 tests cœur et 27 tests passerelle du 18 octobre
restent les dernières exécutions de ces suites ; ils n’ont pas été relancés pour ce lot.

Les dépendances locales sont toujours absentes : aucun nouveau typage, build,
Miniflare, navigateur ou visuel mobile n’est déclaré exécuté pour les changements
actuels. Une première tentative d’analyse syntaxique via un sous-processus Git a
rencontré EPERM ; l’analyse a ensuite réussi en lisant directement les fichiers.
Aucune installation npm réseau n’a été répétée.

Parcours à contrôler après le prochain build : ouverture/fermeture de « Mes assistants »
au clavier et sur téléphone, modification des rôles, conservation du brouillon,
autorisation explicite du partage, aides de rédaction, accès au choix selon les priorités.
La fiche publique Open Chat a été consultée ; l’application Android n’a pas été exécutée.

Les sections suivantes conservent l’historique. Leur mention d’un build Cloudflare
non reçu ou encore bloqué ne décrit plus le résultat de `35d5d2a`.

---

# Validation des équipes et catalogues — 18 octobre 2026

Contrôles effectués après les changements de ce lot :

| Commande / contrôle | Résultat | Portée |
| --- | --- | --- |
| `npm run test:core` | 9 réussis | Cryptographie native, schéma, permissions SQL, sauvegarde/restauration SQLite |
| `npm run test:bridge` | 27 réussis | Imports, contrôleurs de passerelle, OAuth/PKCE, isolation et concurrence |
| `npm run test:regressions` | 101 réussis | Helpers de production, SQLite/WebCrypto réels ; stockage/réseau contrôlés et identifiés |
| Analyse Babel de tous les TS/TSX | 59 fichiers valides | Syntaxe uniquement, aucun typage ou bundle validé |
| `git diff --check` | Réussi | Diff sans erreur d’espacement |
| `npm run check` | Échec 127 : `tsc: not found` | Dépendances absentes |
| `npm test` | Échec 127 : `vitest: not found` | Tests Hono/Miniflare non exécutés |
| `npm run build` | Échec 127 lors du typage | Aucun artefact de production produit |
| Navigateur, visuel mobile, PWA, fournisseurs et déploiement | Non exécutés | Build, accès et environnement de test manquants |

**137 tests locaux réussis**, aucune intégration distante déduite de cette somme.
Il n’y a eu ni nouvel essai npm réseau ni nouvelle longue attente de permission.

Les 101 régressions couvrent : comptes (9), persistance des tâches (13), coffre (11),
transport (11), envois/brouillons (9), fichiers hors ligne (5), prérequis déploiement
(4), collaboration (12), propositions (10), catalogue en base (5), guide d’équipe
(6), pagination fournisseur (6).

Nouveaux cas vérifiés : deux comptes du même fournisseur, rôle transmis et historisé,
comparaison indépendante, refus sans date non transformé en reset, choix préféré
attendant une semaine ou remplaçant rapide, attente courte en mode compromis,
connexions distinctes par mission, modèle retiré, expiration, consentement, empreinte
invalide après mise à jour, date limite dépassée, réservation restant ouverte le mois
suivant, prise précoce/doublon/annulation/compte supprimé. La case de partage conserve
la proposition ; changer un rôle ou modèle l’invalide.

Les tests de catalogue contrôlent pages suivantes, curseur encodé/cyclique/manquant,
échec intermédiaire, plafonds de pages/volume, modèles retirés, révision stable après
simple changement d’ordre, résultat ancien et secret renouvelé. Ils utilisent des
fixtures nommées, sans clé ni appel d’inférence. Les documentations de pagination
Anthropic, Gemini et OpenAI ont été consultées ; cela ne valide pas un accès réel.

Tests d’intégration **ajoutés mais non exécutés** : contrats fichier/version du
correctif TS2783 ; connexions nommées et secret absent de la réponse ; refus des
identifiants et URL de connexion/tâche de A pour B ; proposition sans révéler une
connexion étrangère ; accord de programmation, empreinte et idempotence ; annulation.
Les catalogues d’essai sont injectés dans la base du test et explicitement fictifs.

Le dernier journal Cloudflare reçu reste celui qui échoue sur TS2783. Aucun résultat
de build réussi ou URL publiée n’a été reçu pour les nouvelles sources.

---

# Échec Cloudflare observé et correctif — 18 octobre 2026

Preuve externe fournie par le propriétaire : journal Cloudflare du 17 octobre,
21:55:58–21:56:19 UTC. Clone et installation Bun réussis ; npm run build s’arrête
sur TS2783, server/storage.ts(22,92), propriété id déclarée deux fois. Aucun succès
de build ou de déploiement n’est établi par ce journal.

Correction : identité du fichier id/file_id distincte de version_id ; plus de propriété
id écrasée par le spread. Le test ajouté à tests/integration.test.ts vérifie la réponse,
les relations D1, l’historique et le téléchargement avec l’identifiant retourné.

Contrôles exécutés après correction :
- npm run test:core : 9 réussis ; test:bridge : 27 réussis ; test:regressions : 58 réussis.
- Analyse syntaxique Babel : server/storage.ts et tests/integration.test.ts valides.
- npm run check / npm run build : code 127, tsc absent ; npm test : code 127, vitest absent.
- Installation terminal : EPERM ; autorisation réseau interrompue sans installation.

Les 94 tests existants ne valident pas le nouveau test d’intégration, qui reste non
exécuté, ni la compilation complète. Il faut contrôler la nouvelle exécution Cloudflare.

---

# Vérification du transfert GitHub — 17 octobre 2026

- Dépôt privé `martinznt/Atelier`, branche `main`, commit `ecc78e892ffdef9103a5f371d0be1d9052ebe098`.
- Arbre source distant `d8911bc17b18cf127dad656df428e83304c7cff4`, identique à celui du commit local `3d49fd6`.
- Les 106 chemins, modes et SHA de fichiers ont été comparés à la réponse récursive
  GitHub : aucune différence, aucune troncature. Lecture supplémentaire de `server/index.ts` réussie.
- Aucune clé réelle détectée par le contrôle des fichiers suivis ; fichiers de tests
  identifiés comme fixtures. Ce contrôle n’est pas une garantie absolue d’absence de secret.
- Workflow existant manuel, sans déclencheur push ni déploiement. Mise à jour main
  sans force, avec vérification du commit précédent attendu.
- Aucun nouveau test applicatif exécuté : ce lot transfère les sources et documente
  l’accès. Les limites de compilation, navigateur et hébergement ci-dessous subsistent.

---

# Contrôle de préparation du déploiement — 17 octobre 2026

`node tests/deploy-check.test.mjs` : **4 tests réussis**. Ils vérifient le refus de
la configuration locale comme production, la liste des accès manquants, les bindings
durables indispensables, l’origine HTTPS et l’absence de clé en configuration.
Ces tests emploient des configurations fictives explicites, sans appel distant.

`npm run deploy:check` : sortie **1**, cinq prérequis réellement absents : dépendances,
build, jeton Cloudflare, identifiant du compte, configuration production.
Aucun déploiement tenté ou annoncé réussi. Le rapport précédent reste inchangé :
90 autres tests locaux réussis, compilation et navigateur non exécutés.

---

# Validation du lot de fiabilité — 16 octobre 2026

La campagne porte sur les défauts de concurrence, d’identité et de reprise. Les
résultats du lot précédent sont conservés plus bas comme historique. Aucun test
local n’est présenté comme connexion réelle à une IA, à GitHub ou à un hébergeur.

## Contrôles réellement exécutés

| Contrôle | Résultat | Portée |
| --- | --- | --- |
| Crypto Node + schéma SQLite | 9 tests réussis | AES-GCM, intégrité, propriétaires, sauvegarde/restauration locale |
| Imports + contrôleurs de passerelle + OAuth | 27 tests réussis | 6 importeurs, 14 HTTP/SQLite, 7 OAuth ; inclut concurrence et retrait de partage |
| Transactions des comptes | 9 tests réussis | SQLite réel : récupération et sessions atomiques, révocation, divergence compte/cookie ; pas de hachage scrypt exécuté |
| Transactions des tâches | 10 tests réussis | SQLite réel : collision, budgets, propriétaires, rollback après panne injectée |
| Coffre local | 11 tests réussis | WebCrypto réel ; adaptateur mémoire de stockage explicitement simulé, pas IndexedDB en navigateur |
| Client réseau et changements de session | 11 tests réussis | Réponses/délais contrôlés ; absence de rejeu, cache isolé, en-tête du compte attendu ; pas un fournisseur réel |
| Envois et brouillons persistés | 8 tests réussis | Stockage d’onglet contrôlé : clé réutilisée, contenu différent, réponse tardive et nouvelles révisions |
| Fichiers hors connexion | 5 tests réussis | Version explicite, intégrité SHA-256 avant/après stockage, compte/coffre modifié pendant le transfert ; stockage contrôlé |
| TypeScript/TSX via parseur Babel préinstallé | 48 fichiers analysés sans erreur | Syntaxe seulement ; ni typage ni build |
| `git diff --check` | Réussi | Cohérence du diff |
| `npm run check` | Bloqué, code 127 | `tsc: not found`, dépendances absentes |

Commandes exécutées : `npm run test:core`, `npm run test:bridge`,
`npm run test:regressions`. Le dernier script réunit les tests de régression du lot.
**90 tests locaux réussis** au total. Les fichiers hors connexion font partie du script
de régression. Cette somme ne comprend aucun test Hono, navigateur ou fournisseur réel.

## Défauts corrigés et preuves

- Récupération : le code était consommé avant les autres écritures ; un échec de
  session annule maintenant l’ensemble de la transaction. Le code reste utilisable.
- Login : une vérification ancienne du mot de passe ne peut plus créer une session
  après une récupération concurrente. Une déconnexion d’A retardée ne révoque pas B.
- Création de tâche : une panne entre tâche et message pouvait laisser un état incomplet ;
  les écritures sont atomiques. Une collision concurrente donne la même tâche.
- Brouillons : la clé d’envoi disparaissait au rechargement ; elle est maintenant
  conservée avant l’appel. Une nouvelle révision de brouillon survit à une réponse
  ancienne, même si le composant de discussion a été démonté.
- Onglets : le compte attendu est comparé au compte de la session serveur avant
  lecture/mutation. Cet identifiant n’est jamais utilisé pour autoriser l’accès.
- Coffre : une dérivation en cours pouvait réactiver une clé après verrouillage ;
  les tentatives sont invalidées. Recherche, lectures et fichiers changent aussi de
  contexte, sans restituer ou écrire les données dans le nouveau compte.
- MCP/OAuth : limites SQL concurrentes, import malformé (500 auparavant), doublons
  dans un lot, paramètres OAuth ambigus et renouvellements concurrents corrigés.

## Contrôles préparés mais non exécutés

`tests/integration.test.ts` applique toutes les migrations, et couvre désormais la
passerelle intégrée, les en-têtes usurpés, le compte attendu, les refus A/B et les
origines tierces. **Aucun de ces nouveaux tests Hono/Miniflare n’a été exécuté.**
Le parseur syntaxique ne les valide pas fonctionnellement.

La nouvelle installation npm a échoué avec `EPERM`. La demande d’accès réseau
supplémentaire est restée en attente puis a été interrompue sans résultat ; aucun
motif de rejet automatique n’a été reçu. Aucun verrou npm n’est inventé.
La compilation, Vite, Wrangler, les tests navigateur/visuels, l’installation PWA,
les vrais clients MCP et les appels aux fournisseurs restent non vérifiés.
Les 20 critères d’acceptation complets restent à confronter à ces environnements.
Les corrections d’interface relues statiquement ne constituent pas des tests React.
La synchronisation de projet reste partielle (premières pages mémoire/fichiers,
parcours borné des conversations). Son garde de session et son libellé ont été
relus, mais aucun test de synchronisation exhaustive ou de progression navigateur
n’a été effectué.

GitHub `main` relu le 16 octobre : `60f9b7fe40096a1da5607c02c91212982bdea9db`,
README initial uniquement. Les sources applicatives et ce lot ne sont pas encore
synchronisés. Aucune publication du site complet n’a été effectuée.

---

# Mise à jour du 15 octobre 2026

Les contrôles ci-dessous concernent le nouveau lot intégré de mémoire partagée.
Le rapport historique conservé plus bas reste applicable au socle non compilé.

| Contrôle exécuté | Résultat | Limite |
| --- | --- | --- |
| Tests de contrôleurs Request/Response + SQLite de la passerelle | 11 réussis | Isolation A/B, consentement au partage, contexte versionné, idempotence, imports, quota plein, export, suppression, pagination de 65 messages, lecture seule MCP ; pas le middleware Hono final |
| Tests d’importeurs | 6 réussis | Exports avec branches, provenance, limites d’import, lots UTF-8, JSON invalide, Unicode à la frontière de découpage |
| Tests OAuth avec les trois migrations réelles | 5 réussis | PKCE, retour/client/ressource, code unique, lecture seule, refus, rotation, rejeu, révocation, expiration et compte désactivé ; aucun client fournisseur réel |
| Tests crypto Node existants | 3 réussis | Relancés, portée inchangée |
| Tests SQLite existants | 6 réussis | Relancés, sauvegarde/restauration locale incluse |
| Analyse syntaxique Babel de TypeScript/TSX | 41 fichiers analysés sans erreur au contrôle effectué | Parseur préinstallé avec Playwright ; aucun typage ou build |
| Site préparatoire | Création confirmée, non publié | Version 0, URL live absente ; pas un déploiement réussi |

**31 tests locaux réussis**, avec les limites ci-dessus. Commandes :
`npm run test:bridge` et `npm run test:core`. Les tests d’import sont des fixtures
explicites ; ils ne prouvent pas qu’un export réel du propriétaire a été importé.

Échecs corrigés pendant ce lot : échappement SQL de la recherche LIKE et découpage
Unicode des messages. L’export progressif respecte la consommation du flux, possède
des bornes de lecture et un marqueur de fin ; il ne promet pas un instantané transactionnel
si des suppressions sont faites simultanément.

L’installation npm est toujours bloquée. Les demandes de permissions réseau ont été
interrompues avant exécution réussie, sans motif de rejet automatique communiqué.
Le test Hono complet, le build Vite/Worker, le navigateur, l’installation PWA et chaque
connexion fournisseur restent **non exécutés**. Aucun téléphone physique testé.
La publication du site complet reste non réalisée.

---

# Rapport de validation — 13 octobre 2026

**Le premier lot n’est pas validé de bout en bout et n’est pas prêt à être présenté
comme une application de production vérifiée.** Aucun connecteur simulé n’est
comptabilisé comme intégration réelle.

## Contrôles réellement exécutés

| Contrôle | Résultat | Portée exacte |
| --- | --- | --- |
| Inspection dépôt/environnement | Réussi | Espace initial vide, dépôt dédié ; aucun autre projet modifié |
| GitHub | Réussi | Accès réel au dépôt privé martinznt/Atelier et création du commit initial 60f9b7fe |
| Tests crypto Node (`node tests/core.test.mjs`) | 3 réussis | AES-GCM, propriétaire/connexion comme AAD, altération refusée, clé manquante refusée, SHA-256 et 1000 jetons distincts |
| Tests schéma (`python3 tests/schema_test.py`) | 6 réussis | FK/identifiants, filtre propriétaire SQL, conflit de révision, versions immuables, unicité d’idempotence, cascade et sauvegarde/restauration SQLite |
| Restauration SQLite | Réussie | Base distincte, `integrity_check=ok`, projet relu après restauration ; pas une restauration D1/R2 distante |
| Syntaxe TypeScript serveur/scripts via Node stripTypeScriptTypes | Réussie sur les fichiers contrôlés | Analyse syntaxique uniquement ; pas JSX ni typage TypeScript ni résolution de dépendances |
| Imports relatifs | Aucun absent | Vérification des chemins source locaux ; pas de résolution des packages npm |
| Icônes PWA | Générées localement | PNG 192×192 et 512×512, SVG ; installation non testée |
| Génération du suivi | Réussie | 386 entrées du cahier des charges, statuts conservés dans EXIGENCES.json |
| Clé de développement | Générée localement | `.dev.vars` ignoré par Git ; valeur jamais affichée |
| Analyse statique `npm run check` | Bloquée | `tsc: not found` car dépendances absentes |

Un test initial PBKDF2 Node a réussi, mais le choix a été **retiré** après constat
d’un risque de plafond de production Workers. Il ne valide pas le hachage scrypt
actuel. Ne pas le réutiliser comme preuve de compatibilité Cloudflare.

## Installation et compilation bloquées

Les tentatives `npm install` dans le sandbox ont rencontré `EPERM` sur le réseau.
Les demandes d’exécution avec accès réseau supplémentaire, puis d’escalade, ont
été interrompues par l’utilisateur avant résultat. Ce n’est pas un rejet automatique
avec un motif de sécurité connu. Aucune dépendance ni réussite d’installation
n’a été inventée. Après la demande de continuer automatiquement, ces demandes n’ont
plus été relancées ; le développement et les contrôles disponibles ont continué.

Conséquences : pas de package-lock inventé ; aucun résultat de compilation Vite,
wrangler dry-run, test HTTP Miniflare, E2E ni screenshot produit. Le navigateur
Chromium existe, mais aucune application compilée n’a pu être servie pour le tester.
Le workflow GitHub manuel est préparé, non lancé et ne déploie rien.

## Matrice des scénarios d’acceptation

| # | Scénario | Statut de validation | Préparation / blocage |
| --- | --- | --- | --- |
| 1 | Inscription sans email, déconnexion, reconnexion | Bloqué | Routes + tests HTTP/E2E écrits, dépendances absentes |
| 2 | Isolation A/B sur URLs | Bloqué | Contrôle SQL vérifié ; routes HTTP et caches restent à tester |
| 3 | Connexion, expiration, déconnexion fournisseur | Bloqué | Code présent ; aucun secret d’application ni test live |
| 4 | Associer dépôt et branche | Bloqué | API/UI présentes ; pas de PAT dans Atelier |
| 5 | Tâche pendant fermeture du navigateur | Bloqué | Queue, cron et persistance écrits ; runtime non exécuté |
| 6 | Relais entre deux IA | Bloqué | Contexte/consentement/modes écrits ; aucune inférence réelle |
| 7 | Quota atteint sans perdre les fichiers | Bloqué | Code d’erreur, sauvegardes et conservation prévus ; scénario à exécuter |
| 8 | Versions et téléchargement individuel | Bloqué | Immutabilité SQL vérifiée ; R2/HTTP test préparé, non exécuté |
| 9 | ZIP et intégrité de l’archive | Bloqué | Test fflate/D1/R2 écrit ; non exécuté |
| 10 | Conversation longue paginée | Bloqué | Test 35 messages écrit ; navigateur et recherche à vérifier |
| 11 | Installation PWA | Bloqué | Manifest, icônes et mécanismes écrits ; HTTPS/appareil non disponibles |
| 12 | Ouverture hors connexion | Bloqué | Shell/coffre écrits ; E2E spécifique restant à écrire/exécuter |
| 13 | Fichier local et brouillon | Bloqué | Code présent ; stockage navigateur non testé |
| 14 | Reconnexion sans doublon/perte | Bloqué | Idempotence SQL vérifiée ; scénario réseau/browser à tester |
| 15 | Conflit entre appareils | Bloqué | CAS SQLite vérifié ; test HTTP écrit, appareils non testés |
| 16 | Cache après changement de compte | Bloqué | Cloisonnement/chiffrement/effacement codés ; test multi-onglets à exécuter |
| 17 | Déploiement de test et commit correct | Bloqué | Aucun hébergement/accès/consentement de publication réel ; aucune réussite revendiquée |
| 18 | Déploiement échoué | Bloqué | États exposés, aucun échec fournisseur provoqué réellement |
| 19 | Mise à jour sans perte | Bloqué | Activation différée et brouillon de discussion ; autres formulaires à renforcer |
| 20 | Export et suppression de compte | Bloqué | Export et suppression différée reprenable écrits ; test complet manquant |

États absents/lent/erreur/quota plein/révocation : certains sont pris en charge dans
le code, mais la campagne d’intégration et navigateur est à compléter. Aucun état
non exécuté n’est marqué vérifié.

## Compatibilité réelle

| Environnement | Code ciblé | Test exécuté |
| --- | --- | --- |
| Chrome/Edge ordinateur | Oui | Non |
| Firefox ordinateur | Oui, scénario Playwright préparé | Non |
| Android Chromium / Galaxy A05s | Responsive et scénario Android préparés | Non, aucun appareil physique |
| Safari iPhone/iPad | Responsive, aide d’installation, WebKit préparé | Non, aucun appareil physique |
| PWA HTTPS installée | Manifest et service worker | Non |

## Reprendre les vérifications

1. Installer les dépendances avec accès réseau autorisé, générer/commiter le verrou.
2. `npm run check`, corriger les erreurs de types puis `npm test` dans Miniflare.
3. `npm run build`, valider les bindings et l’archive Worker par dry-run.
4. `npm run test:e2e`, captures à 360/390/768/1440 px, clavier et contrastes.
5. Ajouter les scénarios réseau/hors connexion/cache/annulation et les exécuter.
6. Configurer les vrais secrets dans l’interface ou le coffre du runtime approprié,
   puis tests fournisseurs autorisés. Ne lancer aucun appel facturable ni publication
   sans consentement correspondant.
7. Tester D1/R2 et le CPU du hachage sur Cloudflare de test après déploiement par le
   propriétaire ; vérifier la restauration et les coûts avant ouverture aux autres.

## Pilotage de deux projets (11 novembre 2026) — commandes réellement exécutées
- `npx tsc --noEmit` : propre. `npm run build` (tsc + vite + `wrangler deploy --dry-run`, sans publication) : réussi.
- `npx vitest run` : 53 tests d'intégration (D1 + Miniflare, GitHub simulé par `fetchMock`) dont 7 nouveaux scénarios : espaces séparés, association GitHub, plan, décisions, transmission (aperçu = export, « Copié » jamais « Envoyé », contexte du seul projet, SHA obsolète), secrets, suivi GitHub.
- Tests purs (`node --experimental-strip-types tests/<f>.test.mjs`) : `plan-core`, `handoff-core`, `project-guide`, `github-tracking`, `schema-status`, `pr-mark`, `watch-status` : tous passent.
- `npm run test:regressions` (9) et `npm run test:core` (6 tests Python de schéma) : passent.
- Navigateur : aperçu Playwright de l'application construite à 360 px et 390 px avec une API simulée : aucun débordement horizontal, sections repliées lisibles. Pas de test E2E complet.
- **Simulé** : toutes les réponses GitHub. **Réel** : aucun appel à GitHub, aucun fournisseur IA, aucune production.

# Poste de pilotage — contrôles du 12 novembre 2026

Exécutés en local sur la branche `feat/atelier-poste-de-pilotage` :

- `npx tsc --noEmit` : aucune erreur.
- `npm test` : 62 scénarios Miniflare réussis, dont 9 pour le poste de pilotage (cloisonnement par compte et projet, déduplication des questions, prompt immuable après transmission, arbre tronqué → synchronisation partielle, audit repris par commit).
- `node --test tests/*.test.mjs` : 286 réussis, dont `tests/workbench-core.test.mjs`.
- `npm run test:regressions`, `npm run test:core`, `npm run test:bridge` (27) : réussis.
- `npm run build` : compilation et simulation de publication réussies.
- Migration 0018 appliquée sur une base locale neuve ; `/api/health` local : schéma complet 0007→0018.
- Navigateur réel (Chromium, serveur local) à 360 et 390 px sur Accueil, Pilotage, Discussions, À traiter, Mémoire, Prompts, Export, Projets, avec une action, une question et un prompt aux textes longs : aucun débordement horizontal, aucun contrôle de moins de 30 px, aucune erreur de page.
- `tests/e2e/flow.spec.ts` : réussi en Chromium bureau et 360 px (WebKit et Firefox non installés ici : non exécutés).

**Simulé, donc non prouvé en réel :** tous les appels GitHub (référentiel, audit, contrôles, PR). **Non exécuté :** export ChatGPT réel, hors connexion réel, téléphone réel, production.

# Pilotage Claude — contrôles du 12 novembre 2026

Exécutés en local sur `feat/atelier-quotas-claude` : `tsc --noEmit` ; `npm test` 67/67 ; `node --test tests/*.test.mjs` (dont 11 pour `claude-advisor`) ; `npm run test:regressions` ; `npm run test:core` ; `npm run build` ; migration 0019 sur base neuve et `/api/health` local complet 0007→0019 ; navigateur réel (Chromium) à 360 et 390 px sur Accueil, Quel modèle, Quotas, Reprise, Retours, avec ajout d’un relevé sur capture : aucun débordement, aucun contrôle de moins de 30 px, aucune erreur d’API. **Non exécuté :** téléphone réel, WebKit, Firefox, production. **Aucune mesure réelle de quota n’existe dans Atelier.**

# Analyse de l’historique et mode sombre — contrôles du 12 novembre 2026

Exécutés en local sur `feat/atelier-analyse-historique` : `tsc --noEmit` ; `npm test` 72/72 ; `node --test tests/*.test.mjs` ; `npm run test:regressions` ; `npm run test:core` ; `npm run build` ; migration 0020 sur base neuve. Navigateur réel (Chromium, thème sombre du système) à 360 et 390 px : Accueil, À traiter, Claude, Quotas, Export, Pilotage, Discussions, Projets, Fichiers, Activité, Réglages — aucun débordement, aucune erreur d’API, aucun texte de contraste inférieur à 3 (il y en avait sur tous les écrans avant correction). **Simulé :** toutes les réponses de Gemini, Groq et Mistral. **Non exécuté :** appel réel à un fournisseur, téléphone réel, WebKit, Firefox.
