# Modules de mémoire partagée d’Atelier

Ce dossier n’est **pas un second site** : il contient les modules sans dépendance
externe utilisés par le serveur et l’interface de l’application complète.

- `server/` : imports, recherche, contexte versionné, relais, MCP HTTP et OAuth.
- `public/importers.mjs` : analyse des exports dans un Web Worker de l’interface.
- `scripts/sqlite.mjs` : adaptateur SQLite local pour tester les mêmes requêtes SQL ;
  il n’est jamais utilisé en production à la place de D1.
- `tests/` : tests exécutables avec Node 24, sans installation npm.
- `migrations/0001_bridge.sql` : schéma autonome des tests. Le déploiement complet
  utilise les migrations `../migrations/0002_shared_memory.sql` et `0003_bridge_integration.sql`.

Exécuter : `npm test --prefix passerelle` depuis la racine du dépôt.
Les tests locaux ne prouvent pas la compatibilité réelle d’un compte fournisseur.
Voir `../docs/PASSERELLE.md` pour les capacités, limites, connexions et preuves.

La création Sites initiale, avant rétablissement du périmètre complet, est conservée
dans `.openai/hosting.json`. Réutiliser son identifiant, ne pas créer un autre Site.
Aucune version n’y est publiée pour le moment. Cette déclaration provisoire ne
prouve pas que D1, R2, Queues et les migrations de l’application complète sont configurés.
