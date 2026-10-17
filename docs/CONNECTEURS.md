# Connecteurs : capacités implémentées et limites vérifiées

État de la session du 13 octobre 2026 : le connecteur GitHub de l’assistant accède
réellement au dépôt privé `martinznt/Atelier`. **Il n’est pas un jeton injecté dans
l’application.** Aucune clé de fournisseur n’est configurée dans Atelier, aucun
appel d’inférence ou déploiement réel n’y a été validé.

| Service affiché | Authentification dans Atelier | Fonctions écrites | Limites / état réel |
| --- | --- | --- | --- |
| GitHub | PAT finement limité, secret serveur | Test /user, dépôts et branches paginés, fichiers, commits, comparaison, PR en brouillon, checks, sauvegarde avec SHA | Non testé dans l’application ; OAuth/GitHub App à faire ; la connexion doit choisir ses dépôts chez GitHub |
| OpenAI API | Clé API | Modèles réels, Responses API en flux, usage renvoyé, reprise par contexte Atelier | Distinct de ChatGPT et Codex ; aucun abonnement ou ancien historique importé automatiquement |
| Claude · API Anthropic | Clé API | Modèles, Messages API en flux, consommation et en-têtes reçus | Distinct de Claude Code ; liste initiale limitée à 100 modèles, pagination du catalogue à ajouter |
| Gemini API | Clé de projet | Modèles generateContent, flux SSE, modèle renvoyé et usage | Limites selon projet, modèle et niveau ; modèle/prix/quotas globaux non inventés ; catalogue jusqu’à 1000 entrées |
| Codex App Server | Non activée | Déclaration de capacités et indisponibilité explicite | Runtime isolé, authentification officielle, reprise de thread et limites à intégrer |
| Claude Code | Non activée | Déclaration de capacités et indisponibilité explicite | Claude Agent SDK en environnement isolé à intégrer |
| Cloudflare | Token API limité à un compte | Test token, comptes/sites Pages, suivi, relance et rollback d’un déploiement existant | Pas d’envoi direct de fichiers Pages ni de déploiement Workers depuis ce connecteur ; token actif ne prouve pas les droits sur chaque ressource |
| Netlify | Token personnel | Test, sites paginés, historique, ZIP draft explicite, publication/restauration | Sites statiques ; 20 Mo ZIP ; aperçu potentiellement public, frais possibles ; à valider avec un site de test |

Les capacités sont exposées par `/api/connections/catalog`. Aucun service indisponible
n’est affiché « connecté ». Une connexion n’atteint cet état qu’après un appel distant
réussi ; un secret enregistré seul reste « à tester ». Les erreurs 401/403 de test
passent la connexion à un état expiré. Expiration connue, remplacement manuel du
jeton et déconnexion sont prévus. L’OAuth, le refresh automatique et la révocation
chez le fournisseur ne sont pas encore implémentés ; le retrait du secret local ne
révoque pas le token externe.

## Parcours et permissions

Réglages → Connexions → Ajouter → service → secret et accès → test → terminer.
Le secret est chiffré côté serveur ; jamais un cookie de session. L’utilisateur
choisit les droits du token chez le fournisseur puis un sous-ensemble fonctionnel
dans Atelier : lecture, écriture GitHub, chat ou déploiement. Les API IA nécessitent
un consentement à leur utilisation/facturation ; le partage du contexte entre
fournisseurs est contrôlé au lancement de chaque tâche.

GitHub : au minimum Metadata/Contents Read pour lire, Contents Write pour sauvegarder,
Pull requests Write pour créer une PR ; Actions/Checks Read selon les contrôles.
Les droits insuffisants doivent produire une erreur explicite. Ne pas demander
administration ou accès à tous les dépôts par défaut. Les workflows GitHub ne sont
pas éditables via la route de sauvegarde de fichiers de ce lot.

Cloudflare : permissions Pages Read pour consulter et Edit pour agir ; liste des
comptes selon les droits du token. Netlify : token personnel limité autant que
possible à son usage prévu. Tous les endpoints utilisent une origine fixe et
refusent les redirections ; pas d’URL fournisseur libre à saisir.

## Quotas et coûts

Les en-têtes réellement reçus sont stockés avec provenance « officielle API », date,
valeurs et fenêtres telles que renvoyées. L’absence d’information donne
« indisponible ». Une donnée de plus de 15 minutes est affichée ancienne.
La consommation de l’application ne décrit pas l’usage global du compte.
Le cumul actuel d’une tâche multi-assistant n’est pas encore ventilé par fournisseur ;
l’interface le précise. Aucun coût monétaire ni crédit restant n’est inventé.

Codex App Server : la documentation officielle et le protocole source exposent
`account/rateLimits/read` et `account/rateLimits/updated`. Les fenêtres peuvent
manquer. Aucune version exécutable n’a été installée ou validée dans cette session.
Claude SDK : les types/events de limites varient selon la version et certains champs
sont optionnels. Aucun SDK n’est encore activé ici ; épingler et vérifier sa version
avant intégration. Gemini : les limites dépendent du projet/modèle/niveau, et ne sont
pas les limites de l’application grand public.

Les conditions d’usage des abonnements Codex/Claude Code doivent être revalidées
pour une distribution multi-utilisateur et la version utilisée avant activation.
La lecture documentaire ne suffit pas à autoriser l’utilisation ou mutualisation
d’une identité. Les anciens exports peuvent être importés comme fichiers et
synthèses ; aucun accès automatique aux discussions privées n’existe.

## Sources officielles consultées

- OpenAI : https://developers.openai.com/codex/app-server
- Protocole source : https://github.com/openai/codex/tree/main/codex-rs/app-server
- API OpenAI : https://platform.openai.com/docs/api-reference/responses
- Claude SDK : https://platform.claude.com/docs/en/agent-sdk/overview
- Types SDK : https://github.com/anthropics/claude-agent-sdk-typescript
- Usage SDK/abonnement : https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- API Claude : https://platform.claude.com/docs/en/api/overview
- Gemini : https://ai.google.dev/gemini-api/docs/rate-limits
- GitHub : https://docs.github.com/en/rest
- Cloudflare Pages : https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/
- Netlify : https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/
- Schéma Netlify : https://open-api.netlify.com/

La page détaillée Claude SDK TypeScript n’a pas pu être lue par l’outil de recherche
(erreur de lecture). Ne pas la citer comme une version intégrée vérifiée.

## Passerelle MCP ajoutée le 15 octobre 2026

Les assistants peuvent être clients de la mémoire Atelier, séparément des connecteurs
API d’inférence. Le serveur MCP et OAuth/PKCE sont testés localement ; aucune des quatre
applications n’est encore connectée réellement. Les capacités de lecture des imports
et dépôt de relais ne constituent pas un accès aux historiques privés des fournisseurs,
ni un runtime d’exécution Claude Code/Codex. Détails et sources dans PASSERELLE.md.

## Contrôle du 16 octobre

La lecture du dépôt GitHub a confirmé que `main` pointe toujours sur le README
initial (`60f9b7fe`). Les sources locales ne doivent pas être annoncées présentes
sur GitHub avant un envoi confirmé et une relecture. Les tests OAuth/MCP locaux
passent après corrections de concurrence ; aucun client externe n’a été connecté
pour ce lot et aucun quota fournisseur, abonnement ou appel payant n’a été utilisé.
