# Mission de refonte — reçue le 19 octobre 2026

Cette référence conserve le périmètre de la nouvelle mission, avec les exigences
initiales de CAHIER_DES_CHARGES.md. Les paragraphes sont suivis individuellement
dans EXIGENCES.json (préfixe RF). Aucun état « réalisé » ne vaut test fournisseur.
Le travail se poursuit par lots ; ce document ne déclare pas la mission achevée.

## 1. Mission générale

Améliorer l’application existante martinznt/Atelier, branche principale main,
production prévue https://atelier.martin-zannet22.workers.dev. Application personnelle
et quelques autres comptes isolés pour centraliser projets, fichiers, outils de
création, assistants IA et déploiements. Implémenter code, migrations, interfaces,
tests et configuration, sans présenter une maquette ou une simulation comme un
service connecté.

Aucune offre de stockage payante, formule Cloudflare payante, carte bancaire
supplémentaire ou frais obligatoire ne doit être nécessaire aux fonctions
principales. Préserver les fonctions compatibles et remplacer leurs dépendances
payantes intelligemment. Une limite impossible à respecter gratuitement doit être
expliquée avec une alternative qui conserve les fonctions essentielles.

## 2. Audit et conservation

Examiner les fichiers importants, AGENTS.md, CLAUDE.md, tous les documents docs/,
les migrations D1 et les services Workers, D1, Queues, R2, GitHub et API IA. Vérifier
les fonctions existantes et problèmes ouverts avant de changer le code. Consulter
les limites et conditions actuelles dans les documentations officielles.

Ne pas reconstruire inutilement une fonction opérationnelle. Préserver données,
paramètres et compatibilité. Travailler sur des branches dédiées, commits cohérents,
puis préparer l’intégration sur main après vérification. Aucune fusion risquée,
publication en production ou modification d’un autre site sans validation appropriée.

## 3. Suppression de la dépendance obligatoire à R2

Le déploiement échoue avec « R2 bucket 'atelier-private-files' not found [10085] ».
Le propriétaire refuse d’activer R2. Supprimer entièrement son obligation dans
wrangler.jsonc, production, storage.ts, types.ts, routes fichiers, context.ts,
worker.ts, comptes/suppressions, sauvegardes, imports/exports, tests et autres usages.
Toutes les fonctions remplacées doivent disposer d’un chemin effectif, pas seulement
d’un binding supprimé. Les réponses IA sont aussi des fichiers intermédiaires ;
leur échec de sauvegarde ne doit pas interrompre une conversation conservée en base.

La D1 de production existe et ses cinq migrations initiales sont déjà appliquées
(information fournie par le propriétaire). Migrations additives et reprise seulement ;
aucune recréation de base, suppression automatique, perte de versions ou reset destructif.

## 4. Architecture de stockage

GitHub conserve sources, dossiers, branches, commits, versions publiées, archives
et fichiers IA explicitement sauvegardés dans un dépôt autorisé. D1 conserve comptes,
connexions, projets, conversations/messages, mémoire, paramètres, métadonnées,
références GitHub, tâches, synchronisation, événements et autorisations. D1 peut
conserver des contenus textuels raisonnablement petits selon ses limites.

IndexedDB conserve données/projets choisis hors connexion, brouillons, fichiers
explicitement téléchargés, éditions non synchronisées, consultation et opérations
locales autorisées. Pas de duplication inutile de gros fichiers ou stockage massif
de binaires D1. Aucun stockage cloud gratuit illimité promis.

Créer une abstraction extensible de stockage. Limites visibles, export sans fournisseur
unique, pas d’effacement silencieux ni fausse réussite de synchronisation. KV et
Durable Objects SQLite ne sont envisageables qu’après vérification de leurs quotas
gratuits et si un avantage concret justifie cette dépendance.

## 5. GitHub — bibliothèque centrale prioritaire

Pour chaque dépôt : nom/description, propriétaire, branche, dossiers et fichiers,
arborescence complète, recherche de noms, filtres de types, tailles, date et commit
de dernière modification lorsqu’ils sont disponibles, historique, changements et
dernier déploiement. Navigation comme un explorateur de fichiers.

Détecter un commit externe, actualiser et identifier les fichiers modifiés selon
l’historique réel. Webhook authentifié si possible, récupération manuelle et à
l’ouverture/premier plan, interrogation périodique raisonnable sinon. Réduire les
appels API et respecter les quotas ; gérer les réponses paginées ou tronquées.

Créer/modifier un texte, ajouter dossier, renommer, déplacer, supprimer après
confirmation, comparer, restaurer une ancienne version, créer branche, sauvegarder
et préparer une pull request. Vérifier branche, SHA attendu et conflits pour chaque
écriture. Si distant modifié, proposer la comparaison sans écrasement. Distinguer
modifications locales, brouillons et changements effectivement envoyés.

## 6. Téléchargements

Télécharger individuellement les fichiers compatibles, sélectionner plusieurs
fichiers ou un dossier en ZIP en préservant noms et arborescence. Projet : sources
complètes GitHub par branche/commit, ancienne version par commit/tag/Release, version
compilée finale uniquement quand un véritable artefact existe. Source ZIP ne signifie
pas site prêt à déployer.

Gérer code, images, icônes, documents et archives au-delà de 20 Mo. Streaming ou
accès direct autorisé pour les gros téléchargements ; jamais un gros ZIP entièrement
en mémoire du Worker. Lots si nécessaire, limites exactes, intégrité quand possible,
dépôts privés et aucune fuite de jeton au navigateur. Pour les fichiers incompatibles
avec GitHub classique, proposer fournisseur adapté ou conservation locale. Ne pas
activer automatiquement Git LFS, GitHub Actions payants ou dépenses annexes.

## 7. Historique des productions IA

Chaque fichier réellement produit/modifié porte nom, format, projet, assistant,
conversation/tâche, date, taille, version, état de sauvegarde et dépôt/branche/commit
éventuels. Détecter les fichiers de code produits, proposer aperçu puis sauvegarde
explicite dans le dépôt choisi, sans publication automatique.

Fichiers non associés à GitHub : petits textes temporaires D1, stockage local ou
dépôt privé de brouillons/archives explicitement choisi. Conversations conservées
même si fichier indisponible ; versions, comparaison, téléchargement et restauration
adaptés au fournisseur. Capturer l’avancement pendant les tâches.

## 8. Connexions universelles — priorité majeure

Créer « Mes outils » extensible, sans liste limitée à cinq services codés en dur.
Applications web personnelles, création d’images, sport, recettes, documents, notes,
gestion, IA, Git, stockage, hébergeurs, API, MCP et futurs outils sont enregistrables.
Nom, URL, icône, catégorie, description, favoris, personnalisation, plusieurs projets,
capacités autorisées, test, état, paramètres, déconnexion et suppression de la seule
référence Atelier sans détruire les données externes.

Parcours simple Ajouter → service ou URL → analyse → autorisations → connexion → test.
Identifier sûrement les informations publiques, intégrations documentées, OpenAPI,
MCP, OAuth et échanges de fichiers possibles. Ne pas exécuter de code distant.
Une URL ne donne aucun accès aux données privées. Afficher précisément les limites.

Prévoir les modes lien externe, import/export de fichiers, API REST officielle ou
configurable, description OpenAPI validée, OAuth 2.0 PKCE, MCP contrôlé, webhooks
authentifiés, connexion approfondie des applications personnelles et interface de
connecteur versionnée documentée. Les modes non implémentés restent explicitement
indisponibles ; un lien n’est jamais présenté comme une connexion complète.

Protéger SSRF, adresses privées/locales, redirections malveillantes, jetons,
instructions importées, permissions excessives et fuites entre comptes. Pas de
JavaScript arbitraire fourni par URL. Capacités/permis explicites et révocables ;
différencier lien, lecture, écriture, import/export, sync, actions, testé/non testé.

## 9. Outil-image — intégration obligatoire

Analyser le code de martinznt/Outil-image et le site
https://outil-image.martin-zannet22.workers.dev/ avant l’intégration. Application
statique, IndexedDB par origine, exports JSON, SVG, PNG, WebP et ZIP, sans sync cloud
complète. Le propriétaire autorise les changements nécessaires sur une branche
dédiée de ce dépôt, en conservant ses fonctions existantes.

Ajouter l’outil, l’associer à plusieurs projets, l’ouvrir, importer les créations
explicitement transférées, retrouver/télécharger leurs fichiers, préserver le format
éditable, rouvrir dans l’éditeur, enregistrer de nouvelles versions, éviter les
doublons, détecter les conflits et réutiliser les exports dans plusieurs projets.

Échange réel Atelier → éditeur et éditeur → bibliothèque choisie, avec GitHub autorisé
pour historique/récupération. Mécanisme officiel, authentifié, résistant aux changements
de domaine. Import explicite des anciens projets IndexedDB ; aucune lecture du
stockage privé d’une autre origine. Préserver calques, propriétés et éléments éditables.
L’éditeur reste autonome et utilisable hors connexion.

Livraison progressive autorisée : d’abord échange JSON export/import fonctionnel,
puis synchronisation autorisée. Critère obligatoire : projet éditable exporté de
l’outil vers Atelier et rouvert dans l’éditeur avec tous ses éléments conservés.

## 10. Autres applications

Préparer Sport/Mes séances, Livre de recettes, Outfit et futurs sites du compte GitHub.
Enregistrement, ouverture, source, versions/mises à jour, téléchargement, déploiements
et échange quand un protocole existe. Manifestes/capacités/permissions génériques,
ajouts ultérieurs sans réécriture du cœur. Ne pas fusionner toutes les applications
ni supposer qu’un iframe donne accès à leurs fonctions privées.

## 11. Assistants IA existants

Conserver OpenAI, Anthropic, Gemini, GitHub, Cloudflare, Netlify et les chemins
réellement officiels Codex/Claude Code. Plusieurs comptes par fournisseur, rôles,
préférences, modèles, limites, relais, discussions/historique/recherche, mémoires,
contexte consenti, comparaison/collaboration/répartition, résultats/fichiers, choix
selon capacités réelles, erreurs, reprise et arrêt. Quotas seulement connus.

ChatGPT/Claude Pro ne donnent pas accès illimité à leurs API. Ne pas présenter Codex
ou Claude Code comme intégrés sans exécution réelle. Aucun contournement, cookie ou
récupération de sessions. Ni fournisseur payant, essai payant, bascule API ou facture
silencieux. Prévenir du coût, proposer site officiel ou alternative gratuite ; une
intégration indisponible est affichée honnêtement.

## 12. Simplicité et appareils

Français, rapide, clair, accessible Samsung A05s, autres Android, iPhone, tablettes,
ordinateurs. Navigation cohérente : Accueil, Projets, Discussions IA, Fichiers, Mes
outils, Activité/tâches, Réglages ; barre compacte et menus adaptés sur téléphone.
Accueil : projets récents, outils favoris, tâches, derniers fichiers et déploiements.

Mode simple par défaut, avancé facultatif. Éviter formulaires interminables, étapes
inutiles, jargon obligatoire, erreurs incompréhensibles, boutons inactifs, synchronisation
invisible et lenteurs excessives. Préserver brouillons et pagination des historiques.

## 13. Comptes indépendants

Conserver comptes existants, projets/outils/dépôts/conversations/mémoires/fichiers,
autorisations/paramètres/historiques privés par utilisateur. Aucun accès aux jetons
ou fichiers d’un autre. Chaque utilisateur connecte son GitHub ou un partage explicite ;
ne jamais mutualiser silencieusement le jeton du propriétaire. Lecture et écriture
séparées, authentification sûre, sessions révocables et contrôles serveur.

Mesurer CPU scrypt sur Workers Free. Si dépassement réellement confirmé, rechercher
une alternative sûre et éprouvée avec migration compatible des comptes, sans affaiblir
les mots de passe. Ne pas imposer un plan payant comme solution par défaut.

## 14. Hors connexion

Conserver PWA : ouverture après installation/synchronisation, projets, conversations,
mémoire et fichiers réellement locaux, notes/brouillons, modifications préparées et
export des éléments disponibles. Au retour : actualiser, sync autorisée, conflits,
échecs visibles et aucun brouillon effacé. Pas de publication ou requête payante sans
accord préalable. Dernière sync et contenu local réel visibles ; jamais de faux accès
hors connexion. Isolation des caches et effacement au changement de compte.

## 15. Déploiements et finales

Gérer plusieurs sites ; conserver Cloudflare, Netlify, fournisseurs futurs extensibles.
Afficher états/commit/erreurs/journaux, relance autorisée, comparaison production/test,
site final, sources, véritable build disponible et rollback selon fournisseur.
Build réel si nécessaire. Actions : runners et quotas gratuits surveillés, pas de
service payant activé ni artefacts temporaires inutilement gros. Validation adaptée
avant publication/merge/changement d’un autre site.

## 16. Ressources gratuites

Vérifier précisément documentation actuelle Workers Free, D1, Queues, KV/DO si
retenus, GitHub Free, Actions, Releases et API. Peu de comptes n’exige pas une
infrastructure coûteuse. Objectif nominal 0 € supplémentaire et aucune carte
obligatoire ; alternative aux besoins impossibles gratuitement, aucune dépense
automatique. Page espace/fichiers/ressources connus/limites/dernières sync/blocages
par quota/actions de libération. Aucun chiffre inventé quand absent de l’API.

## 17. Prévention des pertes

Exports projets, conversations, mémoires, fichiers ou références, ZIP quand possible,
manifestes/intégrité, sauvegardes GitHub et restauration documentée. Confirmation de
suppression, échecs de sync traités. Métadonnées/liens seuls ne constituent pas une
sauvegarde autonome. Fichier absent interdit d’annoncer une sauvegarde complète.
Aucune suppression d’historique pour gagner de l’espace sans décision du propriétaire.

## 18. Tests obligatoires

Exécuter TypeScript, tests unitaires, intégration/régression existants, ajouter les
cas pertinents pour chaque modification. Une compilation seule ne suffit pas.
Simulations explicitement distinguées des vérifications réelles fournisseurs.

GitHub : dépôt autorisé, arbre complet, dossiers, lecture/modification, branche de
test, commit externe/détection/actualisation, comparaison, fichier/ZIP, restauration,
conflit, privé et isolation des comptes. Pas d’écriture risquée sur production.

Stockage : routes sans R2, réponses IA D1, code GitHub, saturation visible, versions
préservées, suppressions sûres, exports cohérents, gros téléchargements sans saturation
mémoire. Outils : URL, lien externe, API, refus non autorisé, déconnexion/révocation,
indisponibilité/changement de compte et protection privée.

Icônes : ouverture du vrai site, export éditable, import/bibliothèque autorisée,
téléchargement/réouverture, calques/propriétés, nouvelle version/conflit et éditeur
indépendant hors connexion. Playwright Android/iPhone/tablette/ordinateur, petits
écrans, tactile, téléchargements, réseau lent et accessibilité. Accès manquants et
scénarios non effectués précisément documentés.

## 19. Déploiement

Commandes actuelles npm run build puis npm run deploy:cloudflare. Adapter scripts,
config et bindings ; D1 existante cinq migrations préservée, aucune obligation bucket
R2 atelier-private-files. Compilation et tests avant livraison ; dry-run ne prouve
pas production. Déploiement autorisé/disponible : HTTP/auth/fichiers/tâches/sécurité
réels. Secret manquant : nom et procédure Cloudflare, jamais sa valeur dans le dépôt,
le chat ou un log.

## 20. Phases et travail automatique

Ordre : audit des deux applications → architecture gratuite → suppression R2 →
bibliothèque GitHub → connexions universelles → Outil-image → autres outils →
sécurité/performances/mobile/PWA/hors connexion/conflits/sauvegardes → tests réels et
configuration → commits/documentation/bilan/mise en service. Continuer les phases
réalisables automatiquement ; ne pas s’arrêter à la description d’un plan.

## 21. Documentation et continuité

Actualiser README, AGENTS, CLAUDE, ARCHITECTURE, CONNECTEURS, AVANCEMENT, VALIDATION,
DEPLOIEMENT, SAUVEGARDES et matrice d’exigences. Documenter toutes les nouvelles API,
interfaces et points de reprise. États explicites : réalisée, testée, partiellement
réalisée, bloquée, non disponible chez fournisseur. Correspondance historique :
« réalisé » = code présent ; « vérifié » = preuves exécutées ; les vérifications
locales ne prouvent jamais une connexion réelle fournisseur.

## 22. Critères de réussite

1. Déploiement possible sans R2.
2. Aucune nouvelle offre payante pour les fonctions essentielles.
3. Création de compte et connexion.
4. Projets retrouvables.
5. GitHub propre connecté.
6. Dossiers et fichiers des sites visibles.
7. Changements GitHub détectés.
8. Consultation et téléchargement des fichiers.
9. Projet complet ZIP.
10. Anciennes versions retrouvées et comparées.
11. Réponses/conversations IA sans R2.
12. Espace Mes outils.
13. Ajout simple d’outil externe.
14. Connexion du site Outil-image.
15. Aller-retour de projet d’icône éditable.
16. Nouveaux connecteurs via architecture modulaire.
17. Isolation stricte multi-utilisateur.
18. Hors connexion préservé.
19. Sécurité des opérations et permissions.
20. Limites réelles honnêtes.
21. Tests exécutés et documentés.
22. Utilisation mobile pratique et rapide.
23. Fonctions existantes compatibles préservées.

## 23. Livraison et contraintes finales

Code maintenable, intégrations officielles et expérience simple ; aucune suppression
artificielle de fonctions importantes ni infrastructure complexe inutile. Ne pas
promettre connexion parfaite d’un service sans interface technique. Aucun détournement
de session/abonnement/fichiers privés. Revue complète du code modifié et des parcours
critiques avant d’annoncer mission terminée. Expliquer précisément les impossibilités
techniques/gratuites et leurs alternatives, conserver le maximum de fonctions.
Résultat attendu : application utilisable, code sur GitHub, validations documentées,
étapes simples de déploiement. Le développement est exigé, pas seulement un rapport.
