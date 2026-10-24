# Comptes email — 24 octobre 2026

Conserver users.email dans les sauvegardes D1 et son index unique avec la migration
0007. L’export ordinaire du compte inclut sa propre adresse, sans secret. Ne jamais
fusionner les comptes restaurés parce qu’ils indiquent une même adresse non vérifiée.
Les IDs de propriétaire, hashes et codes des anciens comptes ne sont pas remplacés
par la migration. Sauvegarder avant d’appliquer les migrations manquantes.

---

# Sauvegardes et restauration — stockage sans R2

Les exports utilisateur incluent projets, conversations, messages, mémoires,
historiques, tâches et versions accessibles. Les métadonnées contiennent aussi les
références GitHub ; elles seules ne constituent pas une sauvegarde autonome.
Secrets, mots de passe, codes, sessions et autorisations OAuth sont exclus.

Le ZIP intégré est borné à 25 Mio. Chaque fichier y porte taille et SHA-256 ; le
contenu est vérifié avant téléchargement. Une version absente ou un dépassement
interdit d’annoncer une archive complète. Les dépôts GitHub et fichiers uniquement
locaux nécessitent un export séparé. L’export reprenable volumineux reste à réaliser.

## Migration des anciennes versions

0006 est additive et conserve les cinq migrations et toutes les références
file_versions.object_key existantes. Une ancienne référence R2 n’est pas convertie
magiquement en contenu D1. Si un bucket ou une sauvegarde préexistait, conserver sa
copie avant toute manipulation ; ne pas activer R2 pour ce projet. Sans copie des
octets, le contenu ne peut pas être récupéré. L’historique reste visible et le serveur
signale l’absence. L’import guidé de récupération reste à développer. Les nouvelles
versions UTF-8 utilisent D1 ; les binaires et gros fichiers devront être associés
à GitHub ou conservés localement par choix explicite.

## Sauvegarde locale

Arrêter Wrangler, puis :

```sh
npm run backup:local -- --stopped
```

Copie de .wrangler/state et manifeste SHA-256. Aucun secret .dev.vars copié ; conserver
MASTER_KEY séparément dans un coffre chiffré. Une éventuelle ancienne émulation de
bucket présente dans le volume est conservée par la copie, jamais supprimée.

Restaurer dans une destination absente ou vide, après contrôle du manifeste :

```sh
npm run restore:local -- backups/DATE --stopped
```

La clé MASTER_KEY correspondante est nécessaire pour déchiffrer les connexions.

## Production

Exporter la D1 existante avec la configuration réellement validée :

```sh
npx wrangler d1 export atelier-db --remote --config wrangler.production.jsonc --output sauvegarde.sql
```

Conserver le SQL chiffré hors du compte, avec date et empreinte. Cet export contient
aussi les tables bridge_*, les nouvelles versions texte et les secrets chiffrés ;
il est sensible et n’est pas l’export utilisateur ordinaire. Ne pas l’ajouter au dépôt.
Time Travel Free est documenté sur 7 jours ; choisir et afficher une rétention des
copies indépendante. Pas de restauration en écrasant la production pour tester.

Les tests schema_test.py effectuent réellement sauvegarde/restauration SQLite dans
une base séparée, integrity_check et lecture. Les nouveaux tests stockage vérifient
les migrations et versions sur SQLite. Une restauration Cloudflare réelle et une
restauration complète GitHub/IndexedDB restent non effectuées.

Suppression du compte : efface les données actives D1 après désactivation/délai ;
les dépôts et données externes restent inchangés. Les sauvegardes ont leur rétention
propre, à configurer et communiquer avant ouverture publique.
