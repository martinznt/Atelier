# 26 octobre 2026 — Chaîne de revue IA des PR (branche, non déployée)

Branche `feature/chaine-revue-ia`, PR #3 (brouillon). Une première version en lecture seule a été ajoutée : migration D1 0008, API de configurations et rapports, revue par IA connectée, déclenchement Queue/cron, panneau « Vérifications IA » et connecteur Mistral. Chaque analyse est rattachée à un SHA de PR. Les alertes ne sont pas des tests exécutés. Aucune écriture GitHub du dépôt inspecté n'est ajoutée.

**Non validé :** compilation TypeScript, exécution des tests dans les dépendances complètes, navigateur, D1/Cloudflare distant, conditions financières des clés, fournisseur réel et captation mobile. Ne pas fusionner/déployer en l'état. Vérifier la CI et les parcours décrits dans [REVUE_IA.md](REVUE_IA.md). Aucun secret n'a été lu ou transféré de Livre de recettes vers Atelier.

---

# Connexion email et mot de passe de huit caractères — 24 octobre 2026

Branche dédiée : feat/email-password-eight, base distante main 31c8172. La correction
readVersion ajoutée manuellement par le propriétaire est conservée sans modification.
Nouvelle demande section 27 du cahier des charges. Reprise complète : REPRISE_CODEX.md.

Réalisé : email obligatoire, mot de passe 8–128 à création/changement/récupération,
formulaires français, migration additive 0007, enrôlement authentifié des comptes
historiques, sessions atomiques et ancienne connexion refusée après ajout. Email
jamais utilisé comme preuve vérifiée, aucun reset/fusion par email. Même user_id,
projets, fichiers et codes conservés. Export utilisateur inclut son propre email.

Vérifié localement : 173 tests (9 cœur/schéma, 27 passerelle, 137 régressions), dont
11 identité et un nouveau transport. Syntaxe 59 sources TS/TSX et diff contrôlés.
Ces contrôles exécutent les helpers de production sur SQLite et les politiques de
validation ; ils ne valident ni le hachage scrypt réel ni le parcours Hono/navigateur.

Bloqué : proxy npm inaccessible, dépendances absentes. Check/build : tsc absent,
test Vitest : vitest absent, code 127. Pas de déploiement de ce lot. GitHub fonctionne
à nouveau, workspace recréé depuis 133 blobs vérifiés ; anciennes modifications non
commitées de l’explorateur absentes. Aucun accès Cloudflare configuré ici.

Prochaine étape : compilation/tests HTTP/E2E sur la branche, puis intégration main.
Poursuivre ensuite GitHub/Mes outils/Outil-image et les exigences ouvertes. Le projet
complet n’est pas livré ; la nouvelle conversation doit lire REPRISE_CODEX.md.

---

# Refonte gratuite — lot stockage du 21 octobre 2026

Branche locale et GitHub : feat/stockage-gratuit-outils. Main distante de référence
79a5e1a ; sa modification d’origine de production a été conservée. Nouvelle mission
REFONTE_GRATUITE.md suivie dans la même matrice, sans retirer les exigences historiques.

Réalisé : suppression des accès/bindings R2 dans serveur, contexte, fichiers,
exports, comptes/suppressions et déploiements ; migration additive 0006 ; versions
texte UTF-8 privées, intégrité et transactions ; limites visibles ; panne d’artefact
IA indépendante du message ; garde des migrations/publication sur main.

Testé localement : 11 nouveaux tests stockage, cœur/schéma 9, passerelle 27,
régressions existantes 111 puis nouveau test configuration et 2 gardes. Configuration
production générée sans R2 ; analyse syntaxique et diff contrôlés. Ces preuves ne
valident pas le fournisseur ni une installation de production.

Bloqué : dépendances absentes (tsc/vitest), proxy terminal inaccessible, aucun accès
Cloudflare. Scrypt Free reste non mesuré. Anciens contenus R2 préservés en références,
mais non récupérables sans copie externe ; import de récupération encore à développer.

Restant : bibliothèque GitHub complète/streaming/sync, stockage GitHub/local de
binaires, Mes outils extensible, vrai aller-retour Outil-image et branche associée,
accueil/navigation, sécurité/performances, tests navigateur Android/iOS/tablette/PC,
restauration distante et validation du plan gratuit. Ce lot n’est pas la mission finale.
Prochaine étape : terminer la revue, enregistrer le lot sur sa branche GitHub, puis
bibliothèque GitHub et protocole d’échange éditable.

---

# Configuration Cloudflare et discussion simplifiée — 19 octobre 2026

**Périmètre complet conservé ; 414 exigences suivies.** La référence d’usage Open Chat
(AceTools Team) est enregistrée en section 25. Ce lot n’est pas la livraison finale.
Branche locale : `feat/passerelle-mcp` ; les sources sont livrées sur GitHub `main`.
Le SHA du lot est celui du commit contenant ces changements, à contrôler avec Git.

Livraison applicative confirmée : GitHub `main` au commit
`b79fe702d1f7801c2900407ad78f68da2dc80923`, arbre `13cb294e5c1ee625c9f85bc67ec264011f995b26`,
identique au commit local `42466f8`. **125 fichiers comparés, aucune différence.**
Le contrôle Workers Builds de ce commit s’est terminé en échec le 19 octobre à
09:00:34 UTC. GitHub ne fournit ni journal détaillé ni annotation : ne pas déduire
l’étape exacte de cet échec. Origine HTTPS toujours attendue ; ne pas relancer
sans sélectionner la nouvelle commande et compléter la configuration.

## Réalisé

- Identifiant D1 fourni par le propriétaire conservé dans `cloudflare.production.json` :
  `eea113c4-a194-4567-a15c-d1b61d9c6867`. Compte Cloudflare issu du journal réel.
  Ce fichier contient seulement des paramètres non secrets ; l’origine reste `null`
  tant que le vrai sous-domaine n’a pas été communiqué.
- `npm run configure:cloudflare` construit une copie de production après contrôle de
  l’origine HTTPS, des ressources déclarées et de l’absence de secret en clair.
  Les variables de build peuvent remplacer les valeurs suivies. Une copie locale
  de production existante et ses routes sont préservées, sauf remplacement explicite.
- `npm run deploy:cloudflare` applique les migrations distantes avant de publier.
  La commande Cloudflare actuelle `npx wrangler deploy` doit être remplacée : elle
  utilise encore le modèle local. Un paramètre manquant arrête la nouvelle chaîne
  avant toute migration ou publication. Voir INSTALLATION_CLOUDFLARE.md.
- Discussion allégée : compte et modèle résumés près du message ; « Mes assistants »
  ouvre méthodes, rôles, limites et consentements. Les problèmes bloquants restent
  visibles dans le fil. Les aides alimentent le brouillon sans envoyer de requête.
  Le focus entre dans les fenêtres et revient au contrôle précédent s’il existe.

## Vérifié

- GitHub `main` relu : `35d5d2a10d087900eb7636be35deee76a94c2844`, arbre
  `56792076bc468e53ec75051217d4cc6624a16783`, identique au lot local `fd32197`.
  Les 122 fichiers du transfert précédent avaient été comparés sans différence.
- Journal Cloudflare du 18 octobre 21:00–21:01 UTC fourni par le propriétaire :
  typage, Vite, shell PWA et bundle Worker en dry-run réussis. TS2783 corrigé.
  Assets téléversés ; Queue `atelier-tasks` créée. Publication du Worker **échouée**
  avec le code 10181 : la configuration employait l’identifiant D1 nul.
- 111 tests de régression exécutés dans ce lot, tous réussis, dont 10 nouveaux tests
  de configuration. Syntaxe des 59 sources TS/TSX et scripts de configuration valide.
  Ces contrôles ne sont pas une vérification réelle du compte Cloudflare.

## Restant et prochaine étape

1. Obtenir le véritable sous-domaine workers.dev ou l’origine HTTPS ; une question
   courte est en attente dans la conversation. Ne pas deviner un domaine.
2. Renseigner cette origine, choisir `npm run deploy:cloudflare` dans Workers Builds,
   puis vérifier les droits D1, le bucket privé R2 et le secret d’exécution MASTER_KEY.
   Le jeton du build n’est pas le secret de chiffrement de l’application.
3. Relire le nouveau journal, confirmer les cinq migrations et le commit publié,
   puis contrôler les parcours compte/projet/fichier et le navigateur. Les nouvelles
   modifications d’interface n’ont pas encore de build ou test navigateur vérifié.
4. Poursuivre les fonctions ouvertes : runtimes Codex/Claude Code, évaluations datées
   des modèles, budgets monétaires, synchronisation étendue et critères d’acceptation.

Aucun accès Cloudflare n’est disponible dans l’environnement de l’assistant. Le D1
fourni n’a pas encore été interrogé ; R2, MASTER_KEY, CPU de scrypt et comportement
mobile restent à vérifier. Ne pas présenter un build réussi comme un site opérationnel.
Les sections suivantes sont l’historique daté ; les blocages de compilation du lot
précédent sont levés par le journal Cloudflare décrit ci-dessus.

---

# Équipes, délais et catalogues — lot du 18 octobre 2026

Périmètre complet conservé, avec les précisions des sections 23/24 du cahier des
charges. **413 exigences suivies**. Ce lot ne constitue pas la livraison finale.
Branche locale : `feat/passerelle-mcp`. Correctif TS2783 conservé séparément au commit
`aa9b5b2`. Les sections suivantes constituent l’historique des contrôles précédents.

## Réalisé

- Connexions nommées multiples, ajout guidé, renommage et remplacement d’un accès,
  états de limites datés et relus au premier plan, modèle/compte/rôle dans les réponses.
- Missions personnalisées, comparaison indépendante, réalisation/relecture et
  collaboration jusqu’à trois assistants et trois tours ; consentement au partage.
- Proposition selon priorité rapidité, préférences de qualité ou attente bornée,
  avec raisons et informations inconnues. Pas de classement universel inventé.
- Tâches différées conservées en D1, accord explicite, prise atomique après la date
  prévue, annulation, contrôle de date limite, réservations de budget conservées
  au changement de mois. Les relivraisons Queue ne créent pas de deuxième exécution.
- Catalogue daté et versionné ; actualisation sur accord par connexion, pagination
  Anthropic/Gemini, limites explicites. Résultat ancien ou jeton remplacé protégés.
- Nouvelle proposition exigée si les choix ou le catalogue changent avant l’envoi.
  La case de consentement ne supprime plus une proposition acceptée.
- Relais manuel avec objectif et références conservés ; aides de rédaction modifiables.
  Migrations 0004/0005, guide et tests de permissions Hono préparés.

## Vérifié

**137 tests locaux réussis** : 9 cœur/schéma, 27 passerelle, 101 régressions.
59 sources TS/TSX syntaxiquement valides ; `git diff --check` réussi. Les tests SQLite
utilisent les cinq migrations et les helpers de production. Les réponses fournisseur
de tests sont des fixtures explicites ; aucun service réel n’est déclaré connecté.

## Bloqué / restant

`npm run check` et `npm run build` s’arrêtent sur `tsc: not found`, `npm test` sur
`vitest: not found`, code 127 : dépendances toujours absentes. Aucun nouveau cycle
de demande réseau longue n’a été lancé. Miniflare, navigateur, visuel mobile et
déploiement réel restent non validés, y compris le correctif TS2783 chez Cloudflare.

Le classement autonome des meilleurs modèles par mission reste **à faire** : il
faut des évaluations comparables, pertinentes et datées. Le moteur actuel respecte
les préférences classées par l’utilisateur et la disponibilité observée. Il ne
peut pas affirmer que Codex ou Claude Code est meilleur sans données correspondantes.
Ces runtimes isolés, leurs abonnements officiels, les coûts vérifiés et la ventilation
de consommation par appel ne sont pas intégrés par ce lot. Claude Pro et gratuit
ne se connectent pas via le connecteur API comme s’il s’agissait du même produit.

## Prochaine étape et livraison Git

Au début de cette reprise, GitHub `main` pointait sur `d3598d5a` ; le correctif isolé
existait comme objet Git distant `99e310ea`, sans mise à jour confirmée de la branche.
Transférer le lot complet avec mise à jour conditionnelle de `main`, puis comparer
l’arbre distant au commit local. Le résultat de cette opération doit être annoncé
avec son commit réel, sans assimiler ce transfert à un déploiement.

Ensuite : exécuter le workflow manuel **Vérifications Atelier** sur `main` dans un
environnement ayant les dépendances, puis corriger toute erreur effective. Vérifier
la configuration Cloudflare réelle (D1, R2, Queues, secret serveur, origine HTTPS),
les migrations et les parcours avant publication. Les étapes destinées au propriétaire
doivent aussi être données directement dans la conversation.

---

# Correctif de compilation Cloudflare — 18 octobre 2026

Le journal fourni par le propriétaire confirme le clonage GitHub, l’installation
réussie chez Cloudflare puis l’échec TypeScript TS2783 dans server/storage.ts:22.
Le champ id du fichier était écrasé par celui de sa version. newFile renvoie désormais
id/file_id pour le fichier et version_id pour sa version immuable. Les lecteurs
existants de file_id sont préservés ; un test d’intégration dédié est ajouté.

94 tests locaux existants repassent. La syntaxe des deux fichiers modifiés est valide.
Le nouveau test Miniflare, le typage et le build restent non exécutables localement :
dépendances absentes, EPERM réseau puis demande de permission interrompue sans
résultat d’installation. Aucun motif de rejet automatique n’a été fourni.
Ne pas répéter cette attente. Ne pas présenter ce correctif comme un déploiement réussi.

Le propriétaire demande aussi un parcours guidé avec plusieurs comptes IA, rôles par
assistant et limites actualisées : lot suivant en cours, distinct de ce correctif.

---

# Sources sur GitHub main — 17 octobre 2026

Le propriétaire a explicitement demandé le transfert du site sur `main` et des
instructions de configuration simples, étape par étape, directement dans la conversation.
La copie applicative locale `3d49fd6` est maintenant conservée sur GitHub au commit
`ecc78e892ffdef9103a5f371d0be1d9052ebe098`, enfant du README initial `60f9b7fe`.
Les 106 fichiers distants ont été relus : chemins, modes et empreintes des blobs
identiques à la copie locale ; aucune entrée tronquée ou manquante. La mise à jour
n’a pas forcé la branche et protégeait le SHA attendu. Le dépôt reste privé.
Les constats « README uniquement » ci-dessous sont donc désormais historiques.

Le transfert ne constitue pas un déploiement ni une validation de production.
Les accès Cloudflare, l’installation des dépendances, le typage, le build, les tests
navigateur et les fonctions encore ouvertes restent à traiter. La compilation n’a
pas été relancée pour ce transfert de sources. Le terminal ne joint toujours pas
le proxy ; le connecteur GitHub a, lui, confirmé les écritures.

Prochaine étape : accompagner la configuration sécurisée de CLOUDFLARE_API_TOKEN
et CLOUDFLARE_ACCOUNT_ID, puis reprendre les validations dès que les accès nécessaires
sont réellement disponibles. Donner les consignes dans le chat, sans renvoyer le
propriétaire à la seule lecture des documents et sans demander d’envoyer un secret.

---

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

## Reprise du 4 novembre 2026 (Claude Code) — lot 1

- Sonde GitHub : `Accept: application/vnd.github+json` (au lieu de `text/plain`). Le HTTP 415 n'a PAS pu être reproduit
  depuis l'environnement de développement (proxy 403) ; la correction est probable, à confirmer via « Tester le réseau GitHub ».
- Revues : migration additive `0010_review_diagnostics.sql` (`stage`, `diagnostic` JSON sans secret). Étape, dernière étape réussie,
  catégorie, fournisseur, état de l'appel IA (aucun / inconnu) et autorisation de reprise sont enregistrés (`server/review-diagnostics.ts`).
- Les check-runs refusés (jeton sans droit Checks) n'interrompent plus la revue ; le rapport l'indique.
- Reprise manuelle `POST /api/reviews/runs/:id/retry` : uniquement si aucun résultat IA incertain, hors 401/403/429, 3 tentatives max.
- Cause réelle des interruptions de la PR #105 : NON confirmée (Observability était désactivé). Après déploiement, relancer
  l'analyse une fois : le diagnostic affichera l'étape exacte.
- Reste à faire : Groq, évaluation Gemini/OpenRouter (conditions officielles), modes économique/équilibré/approfondi, dossier ChatGPT.

## Connecteur Groq (4 novembre 2026)
- Ajouté : `groq` (API compatible OpenAI sous `https://api.groq.com/openai/v1`) : test de clé et catalogue réel, flux de revue,
  usage lu dans `usage` ou `x_groq.usage`, coupure par longueur = erreur, 429 + Retry-After = arrêt (quota enregistré),
  en-têtes `x-ratelimit-*` affichés tels quels, sans extrapolation. Aucun basculement automatique vers un autre modèle/offre.
- NON vérifié : conditions et limites officielles de l'offre gratuite Groq (domaine bloqué dans l'environnement de développement)
  et fonctionnement avec une vraie clé. L'utilisateur indique avoir déjà utilisé Groq/Gemini ; il saisit sa propre clé dans Atelier.
- Gemini : connecteur existant, conditions (région, âge, tarification) non vérifiées ; ne pas l'activer automatiquement.

## État de reprise au 4 novembre 2026 (fin du lot Claude Code)
**Fusionné dans main (PR #7 à #13) et déployé** : diagnostic par étape des revues (migration additive 0010, tolérée si absente et signalée par « Vérifier Atelier »),
reprise manuelle confirmée, sonde GitHub corrigée (415 → 200 constaté en production), lecture des checks non bloquante,
connecteur Groq, builds Cloudflare réparés (lockfile multi-plateformes, `maxParallelFileOps` pour EMFILE), dossier de transmission ChatGPT / Claude Code.

**Constaté en production** : revue de la PR #105 terminée ; cause des anciennes interruptions = HTTP 403 sur les check-runs (jeton sans droit « Checks »).
Le propriétaire indique que les vérifications IA fonctionnent avec Mistral, Groq et Gemini ajoutés par lui-même (non revérifié ici).

**Connu, sans lien avec le code** : le contrôle Cloudflare des branches de PR échoue à `wrangler preview` (bloc `previews` absent de la configuration).
Ne pas y brancher de ressources de production ; option : désactiver les builds de branches dans Cloudflare (Settings → Builds).

**Non fait** : modes économique / équilibré / approfondi ; sélection automatique du modèle selon quota et mission ; évaluation réelle de Gemini/OpenRouter
(conditions officielles non lues : domaines bloqués dans l'environnement de développement) ; activation automatique des revues (à faire par le propriétaire après validation).
**À ne pas faire** : remplacer MASTER_KEY, recréer D1, copier une clé d'un autre projet, présenter une estimation comme un quota officiel.
Tests : `tsc --noEmit`, `npx vitest run` (32), `npm run test:regressions`, `node --experimental-strip-types tests/<fichier>.test.mjs`.

## Modes de revue et réflexion automatique (5 novembre 2026)
- Migration additive `0012_review_mode.sql` : `review_configs.review_mode` (`economique` | `equilibre` | `approfondi`, défaut `equilibre` = comportement antérieur).
  Enregistrement tolérant si 0011/0012 manquent ; une option qui exige la colonne absente renvoie un 409 explicite.
- `server/review-plan.ts` (pur, testé) : économique = aucune IA si changement simple et tests GitHub tous verts, sinon une seule IA ;
  équilibré = IA 1 + relecture indépendante si non simple ; approfondi = logique + sécurité + tests, uniquement si le diff le justifie.
  Une IA qui a signalé une limite n'est pas appelée et rien n'est substitué automatiquement. Chaque choix a une raison affichée dans le rapport.
- `server/review-effort.ts` (pur, testé) : niveau de réflexion automatique (risque × mode × rôle). `reasoning_effort` n'est envoyé que pour
  Groq `openai/gpt-oss-20b|120b` (source : console.groq.com/docs/reasoning, lue le 5/11/2026 : low|medium|high). Autres modèles : défaut du fournisseur.
  Le budget de sortie grandit avec le niveau (les jetons de réflexion font partie des jetons de sortie d'après la même page).
- Non fait : sélection automatique du modèle selon les quotas réels ; niveaux de réflexion pour Gemini/OpenAI/Anthropic/Mistral (paramètres non vérifiés) ;
  niveaux automatiques pour les discussions hors revue.

## Relais automatique entre IA, quotas et reprise (novembre 2026)
**Fichiers** : `server/ai-availability.ts` (classification des échecs, état par connexion et par modèle, jamais de date inventée), `server/ai-relay.ts`
(sélection des candidats parmi toutes les connexions autorisées + orchestrateur), `server/ai-persist.ts` (D1 : observations avec contrôle optimiste, historique),
intégration dans `server/reviews.ts`. Migration additive `0013_ai_relay.sql` (`ai_usage`, `review_configs.relay|relay_max_attempts`, `review_runs.resume_at|resume_state`).
**Règles** : seules les connexions testées + `api_consent` + accès « chat » + non expirées sont candidates ; ordre = préférences de la configuration, puis autres connexions
(Mistral, Gemini, Groq, OpenAI, Anthropic, départagées par appels récents) ; une limite se mémorise par connexion ET par modèle ; pause = date fournisseur (`Retry-After`,
en-têtes de réinitialisation) sinon pause de prudence interne étiquetée comme telle ; auth/permission/facturation = action utilisateur requise, jamais re-sondées automatiquement ;
relais seulement avant tout flux (refus HTTP explicite ou erreur réseau avant réponse) ; jamais après timeout ni après le début d'un flux (texte partiel conservé, non présenté
comme complet) ; plafond d'appels par vérification (réglable 1–5) et par analyse (6) ; relais désactivable par dépôt.
**Reprise** : une analyse dont toutes les IA sont limitées passe en attente avec `resume_at` (date fournisseur ou pause interne) ; reprise automatique par la file (délai) et le
planificateur, uniquement des vérifications non terminées ; 6 reprises / 24 h maximum. « À faire de votre part » (accès refusé) : l'analyse reste partielle, les autres continuent,
bouton « J'ai validé, reprendre ». Alertes persistantes dans Activité (`review_waiting`, `needs_user`) + notification du navigateur si Atelier est ouvert.
**Limites réelles** : revues uniquement (les tâches de discussion `worker.ts` ne relaient pas et finissent toujours au statut `quota`) ; pas de notification poussée sur téléphone
(Web Push exige des clés VAPID et un abonnement, non fait) ; les classes de limite sont déduites des messages/en-têtes renvoyés (peuvent être inexactes selon les fournisseurs) ;
un seul échec mémorisé par modèle ; aucun test avec de vraies clés ; le relais envoie le code à d'autres fournisseurs autorisés (case décochable par dépôt).

## Mise en service (5 novembre 2026, soir)
- **Faits vérifiés** : `main` = `8a877a4` déployé (page de santé `release_sha` identique, contrôles « Workers Builds » et « production » verts). L'échec « Workers Builds » sur `8db3aff`
  (tête de la PR #18) est le build de BRANCHE : `wrangler preview` exige un bloc `previews` ; sans effet sur la production (même échec sur toutes les PR).
- **Migrations lisibles sans session** : `/api/health` renvoie `schema:{complete,applied,missing}` (numéros seulement). Le contrôle « production » de GitHub l'affiche.
- **Sélection du diff corrigée** (constat sur la vraie PR #105 : le fichier de code principal `cook.js` était écarté au profit de documents, 0 % du code principal lu) :
  priorité code > tests > configuration > documents/fichiers générés, troncature explicite, budget de lecture par mode (12 000 / 16 000 / 28 000 caractères).
  Sur la PR #105 : code source lu 66 % (économique), 89 % (équilibré), 100 % (approfondi). Les fichiers non lus sont nommés dans le rapport.
- **Rapport** : gravités P0–P3 + information, emplacement, conséquence, reproduction, correction suggérée, désaccords entre IA, « ce qui n'a pas été vérifié », couverture réelle.
  Textes de transmission distincts pour Claude Code (reproduire, correction ciblée, tests, rien hors périmètre) et ChatGPT (avis indépendant, incertitudes).
- **Interface** : plus de débordement horizontal à 360, 390, 820 et 1280 px (un bouton de la configuration dépassait de 10 px à 360 px).
- **Non testé avec le vrai Worker et de vraies connexions** : GitHub OAuth/jeton, clés IA, analyse réelle (aucun accès au compte de l'utilisateur ; aucune clé en session).

## Constat du propriétaire (5 novembre 2026, soir)
Le propriétaire indique que ses clés IA fonctionnent et que l'analyse des PR fonctionne (non revérifié par l'agent : aucun accès à son compte).
Conditions officielles lues le 5/11/2026 (Groq : en-têtes « requêtes » = quota par jour ; Gemini : limites par projet, offre gratuite = contenu utilisé pour améliorer les produits) :
voir `docs/REVUE_IA.md` et `docs/LIMITES_GRATUITES.md`. Le relais traite maintenant les en-têtes Groq selon cette documentation.
Les 14 branches d'Atelier sont toutes entièrement fusionnées (0 commit d'avance sur `main`) ; leur suppression est refusée par le proxy GitHub de l'agent : à supprimer depuis GitHub.

## Relais pour les discussions (5 novembre 2026)
`worker.ts` : relais avant le début de la réponse (même orchestrateur que les revues), avec `share_consent` obligatoire, sans reprise automatique (l'état d'une discussion en cours n'est pas reprenable sans doublon). Observations de limites fusionnées par modèle (plus d'écrasement de l'état d'une connexion), historique `ai_usage` (`task_kind='chat'`), événement `relay` dans Activité. Test D1 : Mistral refuse → Gemini répond ; sans consentement → statut `quota`, aucun autre fournisseur appelé.

## Publication automatique par rôle et analyses du travail de Claude Code (5 novembre 2026)
Migration additive `0014_auto_scope.sql` (`review_configs.auto_scope` : `all` | `claude_code`). `server/review-roles.ts` (rôles, consignes, détection du travail de Claude Code),
`postRoleComments` (deux commentaires), planificateur filtré par portée. Tests D1 : analyse automatique limitée aux PR de Claude Code, publication des deux commentaires avec les bons rôles.
Limites : vérification toutes les 5 minutes (pas de webhook), détection par convention de nom, plafonds journaliers, aucun agent lancé par les commentaires, publication exigeant des droits d'écriture non testés avec le vrai GitHub.

## Lecture des tests avec un jeton personnel (5 novembre 2026)

Les « check-runs » GitHub exigent le droit Checks, absent des jetons à permissions fines personnels
(docs.github.com/en/rest/checks/runs : jetons d'application seulement). Atelier lit désormais, en repli, les exécutions
GitHub Actions du commit (droit « Actions : lecture »). Limite : les contrôles d'autres services ne sont pas vus par ce repli.
Testé : `tests/github-checks.test.mjs` (3 cas) et les 42 tests d'intégration. Non testé : un vrai jeton sur Livre-de-recettes.

## Sans plafond d'analyses et pause avec heure de reprise (5 novembre 2026)

Migration additive `0015_no_daily_cap.sql` (`review_configs.no_daily_cap`), à appliquer par `npm run deploy:cloudflare` comme les précédentes ; `/api/health` signale `0015` tant qu'elle manque.
Option « Sans plafond » dans les réglages : plus de plafond par dépôt ni de limite de 8 ; seules les limites réelles des IA arrêtent le travail. Un plafond de sécurité du compte (100 par jour) protège contre une boucle.
Une demande manuelle n'est plus bornée par le plafond du dépôt (ni les 8 du compte : 100 de sécurité). Quand toutes les IA sont à leur limite : l'automatique n'ouvre rien et attend (état affiché dans « Surveillance automatique » avec l'heure de reprise connue), une demande manuelle est créée en pause (`resume_at`) et démarre à la première réinitialisation connue.
Limite : si aucun fournisseur ne donne d'heure, Atelier affiche sa pause de prudence ; sans heure connue du tout, une demande manuelle n'est pas mise en pause.
Testé : tests purs (`watch-status`, `schema-status`) et scénarios D1 (sans plafond, sécurité à 100, pause manuelle). Non testé : un vrai épuisement de quota chez un fournisseur.
