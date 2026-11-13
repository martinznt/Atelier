# Email de connexion — 24 octobre 2026

Email obligatoire mais non vérifié ; aucune authentification, récupération ou fusion
sur possession alléguée de l’adresse. Le code de récupération reste indispensable.
Minimum 8 demandé par le propriétaire, scrypt et rate limits conservés. La transition
des anciens comptes vérifie le mot de passe et son hash actuel dans la transaction,
refuse un email déjà pris, fait tourner la session et conserve le propriétaire.
Le vieux parcours est refusé après ajout, y compris ses requêtes retardées. 11 tests
identité SQLite + un test transport ajoutés ; HTTP/navigateur restent non exécutés.

---

# Refonte du stockage — 21 octobre 2026

Le serveur n’a plus de binding R2. Les versions texte D1 sont immuables et
transactionnelles ; quotas par compte/plafond partagé, UTF-8 strict et SHA-256
contrôlé en lecture. Une panne d’artefact ne fait pas perdre le message IA.
Les anciennes références sont préservées ; contenu absent = erreur explicite.
Le script de déploiement refuse les branches autres que main avant les migrations.

Les 11 tests nouveaux passent sur SQLite et les régressions existantes sont
préservées. Cela ne prouve pas les routes Hono/Miniflare, le navigateur ou la
production. Scrypt n’est pas affaibli ; son coût sur Workers Free reste à mesurer.
Les anciennes mentions R2 ci-dessous décrivent les lots historiques, pas un prérequis
actuel. Les nouveaux connecteurs URL et échange d’icônes restent à implémenter et auditer.

---

# Sécurité et limites à valider

## Mesures implémentées

- Propriétaire provenant exclusivement de la session serveur. Requêtes SQL paramétrées,
  filtre user_id sur ressources, téléchargements, événements, tâches et export.
- Scrypt par `@noble/hashes`, N=16384, r=8, p=5, sel aléatoire de 16 octets ; cette
  variante figure dans les paramètres recommandés OWASP. Le code limite à trois
  dérivations simultanées par isolate. Mesurer le CPU de production avant ouverture.
- Cookie HttpOnly, SameSite Strict, Secure sur origine HTTPS ; jetons de session
  aléatoires 256 bits hachés en base ; expiration et révocation. Codes de récupération
  aléatoires hachés et supprimés à l’usage. Pas de récupération par email non vérifié.
- Limitation persistante des essais d’authentification par compte et IP ; origine
  exacte requise pour les mutations. Aucune route CORS publique.
- Secrets AES-256-GCM liés au couple utilisateur/connexion. Pas de cookies fournisseur,
  pas de secrets dans les réponses de liste, exports, coffre hors connexion ou logs.
- Fournisseurs sur origines fixes, pas de redirection HTTP, temps maximal d’appel.
- Fichiers R2 privés : noms neutralisés, identités de stockage aléatoires, taille
  maximale, quota réservé avant écriture, empreinte SHA-256 et versions immuables.
- Pas d’extraction d’archives importées, pas d’exécution HTML. Les aperçus sont du
  texte ; CSP, nosniff, frame-ancestors none. Aucun shell ni exécution de code agent.
- Tâches à clé d’idempotence ; pas de reprise automatique d’une action distante
  dont le résultat est incertain. Partage explicite entre fournisseurs.
- Coffre IndexedDB chiffré AES-GCM, clé dérivée localement PBKDF2-SHA256 600000 ;
  clé uniquement en mémoire. Ce PBKDF2 s’exécute **dans le navigateur**, pas Workers.

## Pourquoi ne pas utiliser PBKDF2 natif pour les comptes Workers

Le code initial utilisait 600000 itérations. La recherche de compatibilité a mis
en évidence un plafond de production Workers absent des essais Node locaux ; ce
choix a donc été remplacé par une bibliothèque scrypt. Le succès du test Node
PBKDF2 initial ne fait pas partie de la validation du hachage final.

Sources : https://github.com/cloudflare/workerd/blob/main/src/workerd/io/limit-enforcer.h,
https://github.com/cloudflare/workerd/blob/main/src/workerd/api/crypto/pbkdf2.c++,
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html,
https://github.com/paulmillr/noble-hashes.

## Avant production

Exécuter les tests HTTP A/B et navigateur, un audit des dépendances, les mesures
CPU/mémoire, les tests multi-onglets et une restauration D1/R2. Les tests indépendants
du schéma ne remplacent pas ces vérifications.

Restent à compléter : limitation globale des routes coûteuses, téléchargement HTTP
Range/reprise, exports volumineux asynchrones, validation de la suppression reprise après défaillance
R2, verrouillage local temporisé, durées de rétention visibles, renouvellement OAuth
automatique et redirections OAuth/PKCE (aucun OAuth n’est encore proposé).

Les protections de permissions sont applicatives : les agents futurs ne recevront
aucun accès direct général aux bindings DB/R2/MASTER_KEY. L’environnement isolé et
la validation des artefacts avant leur exécution ne sont pas encore implémentés.

## Audit ciblé du 5 novembre 2026 (relais, rapports, santé publique)
Vérifié dans le code : CSP stricte (`script-src 'self'`), `nosniff`, `X-Frame-Options: DENY`, HSTS en HTTPS, `Cache-Control: no-store` sur l'API ; contrôle d'origine exact sur toute requête
modifiante (CSRF) ; `/api/*` derrière `requireAuth` sauf `/api/auth` et la page de santé ; limitation des tentatives de connexion ; aucune écriture `console.*` ; aucune injection HTML
(`innerHTML`, `eval`) dans l'interface ; toutes les requêtes des nouvelles routes (`runs/:id/retry`, `runs/:id/resume`, `usage`, relais, `ai_usage`) filtrent par `user_id` ;
un extrait d'erreur de fournisseur est nettoyé (séquences de 24 caractères ou plus masquées, 240 caractères au plus) avant d'être conservé ; les liens de commentaire sont limités à
`github.com` ; la suppression d'un compte efface son historique `ai_usage` (cascade, testée sur D1) ; `npm audit --omit=dev` : 0 vulnérabilité.
Points d'attention (non corrigés, acceptés) : la page de santé publique expose la version et le numéro des migrations (aucune donnée de compte) ; `style-src 'unsafe-inline'` (styles React) ;
le relais peut envoyer des extraits de code à d'autres fournisseurs autorisés par l'utilisateur (option décochable) ; Gemini gratuit peut utiliser le contenu pour améliorer les produits de Google.
Non fait : audit complet de tout le projet par un outil dédié, test d'intrusion, revue du code du Livre de recettes.

## Poste de pilotage (12 novembre 2026)

- Le jeton GitHub ne quitte jamais le serveur ; le navigateur ne reçoit que des métadonnées et du texte déjà mis en cache.
- Le référentiel mémoire est en lecture seule : aucune route n’écrit vers GitHub. Il ne peut pas être associé comme dépôt de code d’un projet.
- Les documents du référentiel, les conversations importées et les réponses d’IA sont des données : ils ne sont jamais exécutés ni interprétés comme consignes.
- Les prompts et les réponses enregistrés passent par la détection de secrets existante ; un texte qui ressemble à une clé est refusé.
- L’archive d’export ChatGPT reste sur l’appareil ; elle n’est jamais publiée sur GitHub.
- Chaque requête filtre par compte et par projet ; les modifications concurrentes sont refusées par numéro de révision.

## Quotas Claude (12 novembre 2026)

Aucun identifiant, cookie ou session Claude n’est lu ni demandé. Les relevés sont saisis par l’utilisateur. Une capture d’écran n’est jamais envoyée au serveur : seuls son nom et son empreinte SHA-256 sont enregistrés. Les textes de dossier, de retour et de reprise passent par la détection de secrets.

## Analyse de l’historique (12 novembre 2026)

Les messages importés ne sont envoyés à Gemini, Groq ou Mistral qu’après un accord enregistré pour l’export concerné, révocable. Le texte des conversations est présenté au modèle comme une donnée ; la réponse est une donnée non fiable, validée contre les messages réels. Aucune clé n’atteint le navigateur. Claude n’est pas appelé.
