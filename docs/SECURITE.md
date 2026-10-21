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
