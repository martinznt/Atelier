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
