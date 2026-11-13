# Identité des comptes — 24 octobre 2026

La section 27 du cahier des charges remplace l’inscription sans email. Voir COMPTES.md.
0007 ajoute users.email nullable et unique pour préserver les comptes historiques.
Normalisation d’adresse, minimum de 8 caractères, garde du hash/sessions inchangée.
Enrôlement avec mot de passe et transaction D1, rotation de session et même user_id.
L’adresse non vérifiée n’autorise aucune récupération/fusion. L’export de compte
contient son propre email ; le coffre hors connexion reste isolé par ID stable.

---

# Architecture de la refonte gratuite — 21 octobre 2026

Le contenu daté ci-dessous décrit les lots précédents et reste historique.
Cette section prévaut sur les anciennes obligations R2 et offres payantes.

- Worker Hono et assets React : inchangés, aucune machine supplémentaire créée.
- D1 existante : migrations 0001–0005 conservées ; 0006 ajoute file_contents et
  file_storage_usage. Les anciennes versions ne sont jamais réécrites ou purgées.
- Frontière de stockage : storage.ts expose writeVersion/readVersion ; les routes,
  contextes, exports et déploiements ne connaissent plus de bucket. Le fournisseur
  actuel conserve les petits textes UTF-8 (JSON/SVG inclus), 262144 octets/version,
  20 Mio/compte et plafond partagé 100 Mio pour la bibliothèque. Ce dernier laisse
  une marge dans les 500 Mo de la base Free, sans garantir les autres tables illimitées.
- Versions et contenu immuables, compteur atomique par triggers, transaction D1
  pour contenu/métadonnées/changement de version ; conflits sans écrasement.
- Une ancienne version dépourvue de contenu D1 reste référencée et visible, mais
  son téléchargement est refusé explicitement. Aucun contenu n’est inventé. Une
  copie externe ou sauvegarde est nécessaire ; récupération guidée encore à développer.
- Messages IA persistés pendant le flux ; snapshots de fichiers espacés de 30 s,
  sauvegarde finale/incomplète séparée. L’échec d’un artefact produit un avertissement
  dans l’activité sans arrêter l’inférence ou effacer le message.
- GitHub est la cible des sources/gros fichiers ; bibliothèque complète et fournisseur
  de références encore à développer. IndexedDB conserve le coffre hors connexion.
- Queues et cron conservés : Queues est disponible sur Workers Free depuis février
  2026 selon la documentation officielle. Aucun passage payant déclenché.
- Publication et migrations distantes gardées sur main ; les branches de refonte
  servent aux validations. WORKERS_CI_BRANCH est contrôlé avant ces mutations.

Le budget CPU Free de 10 ms rend la configuration scrypt actuelle potentiellement
incompatible. Elle n’a pas été affaiblie. Mesure réelle et alternative sûre restent
un blocage avant d’annoncer les comptes opérationnels sur l’hébergement gratuit.
Voir LIMITES_GRATUITES.md et VALIDATION.md. Aucun nouveau déploiement effectué.

---

# Architecture et décisions

## Décisions conservées

Dépôt neuf créé dans `/workspace/atelier`, après inspection du 12 octobre 2026.
Aucun dépôt applicatif, aucune instruction locale et aucun travail préexistant
n’ont été écrasés. La première piste Node/Fastify + SQLite sur hôte persistant a
été remplacée **avant son implémentation** à la demande d’un déploiement Cloudflare
par le propriétaire. Le dépôt privé confirmé est `martinznt/Atelier` ; aucun autre
site ou dépôt, notamment Sport, n’a été modifié.

## Composants actuels

| Composant | Implémentation | Persistance / limites |
| --- | --- | --- |
| Interface | React, TypeScript, Vite, CSS responsive français | Pas de rechargement complet entre les cinq rubriques |
| API | Hono dans Cloudflare Workers, même origine HTTPS | Authentification et autorisations côté serveur |
| Données | D1, schéma relationnel versionné | Propriétaire sur chaque ressource, index et pagination |
| Fichiers | R2 privé, accès via API authentifiée | SHA-256, versions immuables, réservations de quota |
| Tâches | Queues + état D1 + cron de récupération | Continue sans interface si l’infrastructure tourne |
| Événements | Table D1 paginée, interrogation périodique | Connexion authentifiée ; aucun canal public |
| Hors connexion | Shell en service worker ; coffre IndexedDB | AES-GCM, clé du coffre seulement en mémoire |
| Fournisseurs | Modules indépendants `server/connectors` | Origines fixes, capacités explicites, pas de cookies |
| Exécution de code | Non activée | Runtime isolé supplémentaire requis |

Workers sert l’application et traite les appels réseau ; il n’est pas un serveur
avec disque POSIX ni un terminal de développement persistant. D1 et R2 ne sont pas
remplacés par localStorage. Le stockage local Wrangler est seulement une émulation
pour les tests et le développement.

## Authentification et isolation

Inscription identifiant / mot de passe, sans email. Scrypt par `@noble/hashes`
(N=16384, r=8, p=5), sel aléatoire ; cookie HttpOnly / SameSite Strict / Secure sous
HTTPS ; session aléatoire hachée en base, expiration et révocation. Codes de
récupération affichés une fois puis stockés hachés, à usage unique.

Chaque autorisation utilise l’identité issue de la session. Les IDs du navigateur
ne sont pas des preuves d’identité. Les requêtes SQL associent toujours la ressource
et son propriétaire. Les imports et sélections de contexte refusent les fichiers
ou mémoires d’un autre projet. Les secrets sont AES-256-GCM avec données associées
utilisateur/connexion, et une MASTER_KEY hors dépôt.

Le choix initial PBKDF2 600000 natif a été retiré : Workers peut imposer en production
un plafond absent de Node/local workerd. Le coffre navigateur conserve PBKDF2, qui
s’y exécute localement. La validation du scrypt final reste à effectuer après
installation de la bibliothèque. Le budget CPU en production doit être mesuré.

## Tâches, reprise et coûts

Une tâche est réclamée par `UPDATE ... WHERE status='queued' RETURNING`. Une livraison
Queue en double ne l’exécute pas deux fois. Une clé d’idempotence est associée au
compte et au contenu de la demande. Le cron remet en file les demandes encore
`queued`. Un traitement `running` devenu ancien passe à `interrupted`, sans réexécuter
un effet distant dont l’issue est inconnue. Ce n’est pas une garantie universelle
« exactly once » des fournisseurs.

Les réponses sont persistées pendant le flux (messages et versions de fichiers),
puis chaque bloc de code est conservé sans l’exécuter. Le modèle réellement renvoyé
est enregistré ; si absent, l’interface dit que seul le modèle demandé est connu.
Comparaison : propositions indépendantes. Revue/collaboration : réponses précédentes
transmises avec consentement et nombre de tours limité. Les désaccords restent dans
les messages séparés. Aucun raisonnement interne privé n’est partagé.

Le contexte sélectionné est limité, visible et traçable : consignes, mémoires et
fichiers choisis, références dépôt/branche/commit, messages récents. La bibliothèque
n’est jamais entièrement envoyée par défaut. Un relais changeant de fournisseur
nécessite l’autorisation de partage pour la tâche.

Limites locales : durée, nombre de tours, taille du contexte, max tokens de sortie
et plafond mensuel en tokens. Les coûts monétaires vérifiés et alertes ne sont pas
encore implémentés. L’attente explicitement demandée à partir d’un Retry-After est
décrite ci-dessous ; elle n’est pas une réinitialisation garantie. Les données inconnues restent
« indisponibles » ; pas de conversion en pourcentage d’abonnement.

## Fichiers et exports

Un fichier et chaque version ont des IDs distincts. Restaurer crée une version
supplémentaire ; cela ne modifie pas GitHub. L’empreinte de chaque contenu figure
dans les métadonnées et dans les archives. La corbeille ne libère pas le quota,
seule une suppression explicite retire les versions. Aucun historique n’est purgé
pour faire de la place. Téléversement : 20 Mo par défaut. ZIP : 25 Mo maximum dans
ce lot, sans prétendre à la reprise de gros exports.

La suppression du compte crée un état désactivé, révoque les sessions et demande
l’arrêt des tâches. Après cinq minutes minimum, le cron supprime les objets R2 par
lots puis les lignes D1. Une panne R2 laisse le compte désactivé et permet la reprise.
Les sauvegardes et les données déjà envoyées aux fournisseurs ont leur propre cycle.

## PWA et appareils

Interface responsive pour Android, iPhone/iPad et ordinateurs. Installation réelle
si l’événement navigateur existe ; sinon aide adaptée, pas de réussite fictive.
Manifest, icônes PNG/SVG, service worker de shell versionné. Mise à jour proposée
sans activation forcée. Les brouillons de discussion survivent au rechargement dans
l’onglet ; les autres formulaires doivent être enregistrés avant une mise à jour.

Les réponses API privées ne vont jamais dans CacheStorage. Le coffre de confiance
chiffre les données consultées et les fichiers téléchargés explicitement. Il se
verrouille lorsque son contexte mémoire disparaît ; une déconnexion efface la copie
locale. Les onglets s’informent du changement de compte. Reconnexion/premier plan
actualisent les vues mais n’envoient pas de message ni déploiement automatiquement.
Restent à renforcer : verrouillage temporisé, synchronisation exhaustive des grandes
bibliothèques, affichage de dernière synchronisation et reprise des gros transferts.

## Futur service d’exécution isolé

Codex App Server et Claude Agent SDK exigent un service dédié (Cloudflare Containers
ou machines/conteneurs séparés à évaluer). Cycle requis : création par compte/projet/
branche/tâche, checkout isolé, identités temporaires limitées, limites CPU/RAM/temps,
réseau autorisé, captation régulière des artefacts, vérifications exécutées,
interruption, export final et destruction. Aucun montage de DB, MASTER_KEY ou socket
Docker général dans un agent. Aucun tel service n’a été provisionné ou simulé.

## Hébergement et dépenses

Aucune publication réussie confirmée. Le journal Cloudflare du 18 octobre prouve la
création de la Queue atelier-tasks ; aucune facture ne permet d’en déduire son coût.
Workers, D1, R2, Queues, sauvegardes et
machines d’agents éventuelles ont des coûts distincts. Une formule Workers payante
peut être nécessaire au CPU de scrypt. Les API IA sont facturées selon leurs comptes,
séparément des abonnements grand public ; les méthodes d’abonnement des agents
restent à valider pour le mode multi-utilisateur choisi. Voir CONNECTEURS.md et la
procédure de déploiement ; l’exécution automatique est autorisée depuis le 14 octobre,
mais les accès et la validation complète restent nécessaires.

## Extension du 15 octobre : mémoire entre assistants

La passerelle est intégrée à l’application complète. Les modules ESM sans dépendance
`passerelle/server` sont appelés par les routes Hono après authentification de session.
Le propriétaire transmis aux modules vient de la session, jamais du navigateur.
Tables `bridge_*`, migrations 0002/0003, relation avec les projets, nettoyage en cascade,
imports immuables, quota SQL atomique et outils MCP contrôlés. Voir PASSERELLE.md.
Le schéma autonome du module sert uniquement aux tests ; aucun second site n’est livré.
Le déploiement est désormais autorisé. Un Site privé a été créé pendant la demande
intermédiaire de passerelle seule, mais n’a pas de version publiée. Les besoins Queues,
R2 et D1 du site complet restent à valider avec l’hébergeur choisi.

## Corrections de fiabilité du 16 octobre

Les créations de tâches groupent désormais réservation, message utilisateur, date
de conversation et événement dans une transaction D1. Une collision d’idempotence
relit la tâche existante ; seul le créateur envoie le travail à Queue. Une panne
après commit ne rejoue pas la modification. La requête exacte est conservée dans
l’onglet avant son envoi, pour réutiliser la clé après réponse perdue/rechargement.
Le navigateur ne transmet jamais automatiquement une demande préparée hors ligne.

Récupération et changement de mot de passe, consommation du code, révocation et
création de session utilisent un batch atomique. La connexion vérifie encore la
version du mot de passe lors de la création de session. La déconnexion est
idempotente, y compris pour une session expirée.

Le client HTTP prend un instantané du compte affiché, et le coffre un instantané
de sa clé et de son propriétaire. Verrouillage/changement d’identité invalident
les réponses et opérations encore en cours. Une copie ouverte hors ligne ne peut
synchroniser qu’après vérification de la même identité par le serveur. Les délais
HTTP sont bornés sans nouvel envoi automatique ; un échec de réponse après écriture
est signalé comme résultat potentiellement enregistré. Tests locaux détaillés dans
VALIDATION.md ; les scénarios multi-onglets réels restent à exécuter en navigateur.

## Rôles, préférences et mises à jour du 18 octobre

Les connexions sont nommées indépendamment du fournisseur. Les réponses conservent
un instantané du libellé et du rôle (migration 0004), ainsi que le modèle réellement
renvoyé. La suppression ou le renommage d’une connexion ne réécrit pas cet historique.
La comparaison ne transmet pas les réponses de la tâche aux autres assistants ;
revue et collaboration transmettent seulement leurs réponses publiques utiles.

Le moteur pur `planning.ts` choisit une connexion distincte pour chaque mission,
parmi les candidats explicitement classés par l’utilisateur. Il tient compte des
permissions, modèles, expiration, refus HTTP 429 connus et de trois priorités.
Il ne mesure pas la qualité d’un modèle et ne prétend pas lire les abonnements.
La proposition est recalculée côté serveur et son empreinte comparée avant création.
Une modification des rôles, modèles, disponibilité attendue ou révision de catalogue
impose une nouvelle proposition. Changer seulement le consentement ne l’efface pas.

La migration 0005 ajoute `not_before` aux tâches. L’accord de lancement différé est
stocké dans la demande. D1 conserve la tâche, la réservation et l’état après fermeture
du navigateur. Le cron envoie les tâches dues ; une prise atomique protège contre
livraison précoce, doublon, annulation et compte désactivé. La date limite absolue
est contrôlée avant le premier appel. Une réservation encore ouverte compte aussi
après changement de mois. Aucune nouvelle tentative d’inférence à issue inconnue
n’est ajoutée ; une limite imprévue conserve les fichiers et demande une reprise.

Chaque catalogue a une date de lecture et une révision, incrémentée lorsque l’ensemble
des identifiants change. Le renouvellement du secret invalide aussi les propositions.
Un test de modèle réussi ne supprime pas une observation 429 de discussion. Les
résultats anciens ou liés à un secret remplacé ne peuvent écraser les résultats récents.
Un opt-in par connexion autorise le cron à lire les métadonnées après 24 heures,
au maximum deux connexions par passage, avec une heure entre tentatives en échec.
Cette limite borne la charge ; une actualisation quotidienne exacte n’est pas garantie.
Les appels de catalogue sont paginés et bornés (10 pages, 5000 entrées, 20 secondes
pour les appels IA). Un résultat incomplet ne remplace pas le catalogue précédent.

Restent : évaluations comparables et datées pour recommander automatiquement le
meilleur modèle par mission, mesures de latence/coût, consommation ventilée par appel,
authentification officielle et exécution isolée des agents Codex/Claude Code.

## Configuration et interface du 19 octobre

Les identifiants de ressources non secrets sont séparés du modèle local dans
`cloudflare.production.json`. Le générateur contrôle leur forme, l’origine HTTPS
et les bindings, puis écrit une copie privée de production. Il ne vérifie pas
l’existence distante des ressources. Les migrations sont appliquées à la base
configurée avant le déploiement du Worker, sans recréer ni purger cette base.
La chaîne s’arrête avant les mutations quand la configuration manque.

L’écran de discussion résume les comptes et modèles choisis. Les réglages d’équipe
sont dans une fenêtre « Mes assistants » ; les erreurs bloquantes et les actions
Contexte/Envoyer restent près du message. Le déplacement de ces contrôles conserve
le même état React et la même sauvegarde de brouillon/équipe, sans modifier les
permissions serveur. La référence d’usage est décrite en section 25 du cahier des
charges ; aucun appel aux services d’Open Chat n’est ajouté.

## Espaces projet (migration 0017)
Routes `/api/spaces/*` (profil, dépôt vérifié, plan, décisions, vue d'ensemble, suivi GitHub) et `/api/handoffs/*` (dossiers de transmission). Tables : `project_profiles`, `plan_phases`, `plan_tasks` (tâches métier, sans lien avec `tasks`), `project_decisions`, `handoff_packages`, colonnes additives de `repositories`. Chaque requête filtre par `user_id` ET `project_id`. Modules purs : `plan-core`, `handoff-core`, `project-guide`, `github-tracking`.

## Poste de pilotage (12 novembre 2026)

Migration `0018_workbench.sql` (additive). Règles pures, testables sans réseau : `server/workbench-core.ts`, `prompt-core.ts`, `memory-index.ts`, `export-inventory.ts`, `audit-core.ts`. Lecture GitHub d’un fichier : `server/github-blob.ts`.

| Route | Fichier | Rôle |
|---|---|---|
| `/api/workbench` | `server/routes/workbench.ts` | accueil, actions, questions, discussions organisées, recherche, liens, documents, journal, synthèse de reprise |
| `/api/memory-repo` | `server/routes/memory-repo.ts` | référentiel mémoire en lecture seule (commit et arbre épinglés, cache par empreinte) |
| `/api/prompts` | `server/routes/prompts.ts` | fiches de prompt versionnées, transmission confirmée, réponses |
| `/api/exports` | `server/routes/exports.ts` | inventaire d’export, lots, analyses, couverture |
| `/api/ref-audits` | `server/routes/ref-audit.ts` | audit de référence à commit figé |

Tables : `conversation_links`, `object_links`, `martin_actions`, `atelier_questions`, `memory_repos`, `memory_docs`, `prompts`, `prompt_versions`, `prompt_responses`, `export_batches`, `export_conversations`, `export_analyses`, `project_documents`, `ref_audits`, `ref_audit_files`, `ref_audit_findings` ; colonnes ajoutées à `conversations`, `plan_tasks`, `handoff_packages`.

Interface : `web/Home.tsx`, `Inbox.tsx`, `MemoryHub.tsx`, `Prompts.tsx`, `ExportImport.tsx`, `Discussions.tsx`, `ProjectExtras.tsx`. L’archive d’export est lue dans le navigateur ; seul l’inventaire (identifiants, titres, compteurs, empreinte) est envoyé au serveur, et les messages uniquement si Martin les importe par la passerelle existante.

## Pilotage du travail avec Claude (12 novembre 2026)

`migrations/0019_claude_work.sql` : colonnes de dossier sur `plan_tasks` ; tables `quota_readings`, `quota_alerts`, `work_sessions`, `checkpoints`. Règles pures : `server/claude-advisor.ts`. Routes `/api/claude` (`server/routes/claude.ts`) : `/advise`, `/tasks/:id/advice`, `/tasks/:id/brief`, `/quotas`, `/quotas/import-statusline`, `/alerts`, `/sessions`, `/sessions/parse`, `/checkpoints`, `/checkpoints/draft`. Interface : `web/ClaudePilot.tsx`. Aucun appel réseau vers Anthropic n’est ajouté.

## Analyse de l’historique (12 novembre 2026)

`migrations/0020_history_analysis.sql` : `analysis_units`, `analysis_results`, `analysis_items`, colonne `export_batches.ai_consent_at`. Règles pures : `server/history-analysis.ts`. Moteur : `server/history-run.ts` (réutilise `ai-relay`, `ai-availability`, `ai-persist`, `connectors/ai`). Routes sous `/api/exports/:id/analysis` (`/consent`, `/prepare`, `/step`, `/retry-failed`, `/items`) et `/api/exports/analysis/items/:item`. Interface : `web/HistoryAnalysis.tsx`.
