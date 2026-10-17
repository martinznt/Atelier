# Sauvegardes, export et restauration

## Ce qui existe

Les exports utilisateur contiennent les données propres au compte et toutes les
versions de ses fichiers, avec un manifeste SHA-256. Ils excluent secrets, mots de
passe, codes et sessions. Le ZIP intégré est plafonné à 25 Mo ; pour un volume plus
grand, exporter les métadonnées et les fichiers par lots. Un dépassement est
signalé, jamais présenté comme un export complet. L’export reprenable de gros
comptes reste à réaliser.

Le test `tests/schema_test.py` effectue réellement une sauvegarde SQLite et une
restauration dans une base séparée, puis `PRAGMA integrity_check` et une lecture de
projet. Il ne valide pas une restauration Cloudflare D1/R2.

## Développement local

Arrêter `wrangler dev` pour figer simultanément la base locale et R2.

```sh
npm run backup:local -- --stopped
```

Le script copie `.wrangler/state` vers `backups/DATE/state` et calcule les SHA-256.
Conserver `.dev.vars` séparément dans un coffre chiffré. Le script ne copie aucun
secret. Pour restaurer : sauvegarder puis déplacer l’ancien `.wrangler/state` ;
la destination doit être absente ou vide.

```sh
npm run restore:local -- backups/DATE --stopped
```

Le script refuse les chemins suspects, vérifie les empreintes et n’écrase pas un
volume existant. Restaurer la même MASTER_KEY pour retrouver les connexions.

## Cloudflare

Avant mise en service, choisir fréquence, rétention, destination chiffrée et
responsable. Exemple de politique à faire valider : sauvegarde quotidienne,
rétention limitée, copie hors compte Cloudflare et exercice de restauration mensuel.
Cette politique n’est pas activée automatiquement.

D1 : exporter avec `wrangler d1 export atelier-db --remote --output ...` ou employer
Time Travel si disponible sur le plan. R2 : copier **tous les objets privés** avec
un outil S3 compatible et une identité limitée au bucket. Exporter un inventaire
des objets et vérifier les empreintes SHA-256 contre `file_versions`.

Mettre les écritures en maintenance durant le point de cohérence D1/R2, ou employer
un protocole de snapshot conçu pour une sauvegarde en ligne. Une simple copie D1
pendant les téléversements ne suffit pas. Les clés de chiffrement se sauvegardent
à part et ne doivent pas être imprimées dans les commandes ou journaux.

Test de restauration réel encore à faire : restaurer dans une base et un bucket
isolés, vérifier toutes les références R2, ouvrir les comptes de test, télécharger
chaque version et comparer les empreintes. Ne jamais tester en écrasant la production.

Une suppression de compte enlève les données actives ; les sauvegardes existantes
expirent à la fin de leur rétention. Documenter cette durée dans l’interface avant
ouverture publique. Les dépôts et déploiements externes ne sont pas supprimés.

## Mémoire entre assistants

Les tables `bridge_*` appartiennent à la même base D1 et doivent être comprises dans
les sauvegardes administrateur. L’export utilisateur inclut contexte, historique,
conversations importées, messages et relais ; il exclut les secrets et jetons OAuth.
L’export JSONL de chaque mémoire convient aux grands ensembles textuels dans les
limites documentées dans PASSERELLE.md. Son import ne restaure pas une base D1 ni
les connexions OAuth : ces accès doivent être réautorisés. Les fichiers sources
importés restent dans R2 et nécessitent sa sauvegarde correspondante.
