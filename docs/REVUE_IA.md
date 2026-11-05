# Chaîne de revue IA — Atelier (état du 5 novembre 2026)

**État : déployé** (version `5a54bf3` et suivantes, migrations 0007 à 0013 présentes selon `/api/health`).
**Constaté par le propriétaire** : les clés IA configurées fonctionnent et l'analyse d'une PR fonctionne. Cette information n'a pas été revérifiée par l'agent
(aucun accès à son compte). Les secrets ne sont jamais récupérés depuis un autre service : ils sont saisis une fois dans Atelier. Un abonnement ChatGPT ou
Claude n'est pas une clé API.

## Parcours
1. GitHub (droit lecture, + **Checks** en lecture pour lire les tests) → dépôt associé à un projet.
2. Connexions IA testées et autorisées (Mistral, Gemini, Groq, OpenAI, Anthropic).
3. Projets → Vérifications IA : choisir le mode, la PR, lancer. Rapport enregistré dans D1, retrouvable après fermeture.
4. Copier le dossier pour Claude Code ou ChatGPT (aucun envoi automatique ; le commentaire de PR est facultatif et désactivé par défaut).

## Modes (par dépôt)
- **Économique** : aucune IA si le changement est simple et tous les tests GitHub ont réussi ; sinon une seule IA. Lecture du diff : 12 000 caractères.
- **Équilibré** (défaut) : une IA, plus une relecture indépendante si le changement est fonctionnel ou sensible. 16 000 caractères.
- **Approfondi** : logique, sécurité, qualité des tests, seulement quand le diff le justifie. 28 000 caractères.
Le niveau de réflexion est automatique (risque × mode × rôle) et n'est envoyé que pour les modèles où il est documenté (Groq GPT-OSS).

## Lecture du diff
Priorité code > tests > configuration > documents et fichiers générés ; un diff trop long est tronqué avec une mention explicite ; fichiers sensibles et lignes
manifestement sensibles écartés (**filtrage non garanti**). Le rapport indique la couverture réelle (pourcentage, part du code source, fichiers non lus).
Constat sur la vraie PR #105 de Livre de recettes (19 fichiers, 75 254 caractères) : code source lu 66 % / 89 % / 100 % selon le mode.

## Relais et limites
- Candidats : connexions testées, `api_consent`, accès « chat », non expirées. Ordre : préférences de la configuration, puis autres connexions.
- Une limite est mémorisée **par connexion et par modèle** (`connections.quota`). Classes : requêtes/minute, jetons/minute, quota journalier, mensuel/crédit,
  facturation, authentification, permission, modèle indisponible, erreur temporaire, interrompu. Classées d'après statut HTTP, en-têtes et extrait du message : peut être inexact.
- Date de reprise : uniquement celle du fournisseur (`Retry-After`, en-têtes de réinitialisation) ; sinon pause de prudence **interne**, étiquetée comme telle.
  Quota inconnu = affiché « inconnu ». Authentification/permission/facturation : action de l'utilisateur, jamais re-sondées automatiquement.
- Relais uniquement avant tout flux ; jamais après un timeout ni après le début d'un flux (texte partiel conservé, non présenté comme complet).
- Plafond d'appels : 1 à 5 par vérification (réglable), 6 par analyse. Toutes les IA limitées : analyse mise en attente, reprise automatique des seules
  vérifications non terminées (6 reprises / 24 h au plus). Historique des appels : table `ai_usage` (jetons seulement s'ils sont renvoyés).
- Le relais envoie le code à d'autres fournisseurs que vous avez autorisés (option décochable par dépôt).

## Rapport
Gravités P0–P3 et information ; emplacement, conséquence, reproduction, correction suggérée ; désaccords entre IA ; « ce qui n'a pas été vérifié » (déterministe) ;
IA et modèles utilisés, relais, IA sans résultat. Une anomalie est une **piste à reproduire** ; l'accord de plusieurs IA n'est pas une preuve.

## Limites
- Aucun test n'est exécuté par Atelier ; l'absence d'anomalie ne prouve pas l'absence de bug.
- Relais et reprise testés avec des fournisseurs simulés (vraie base D1 de test), pas en épuisant de vrais quotas.
- Discussions : relais avant le début de la réponse seulement, et uniquement si la tâche a le consentement de partage (le contexte peut partir vers un autre fournisseur) ; jamais vers une connexion déjà utilisée par un autre assistant de la tâche. Pas de reprise automatique : la tâche s'arrête au statut « limite atteinte ».
- Pas de notification poussée sur téléphone (écran Activité + notification du navigateur si Atelier est ouvert).
- Claude Code et Codex ne sont pas lancés par Atelier.
- Atelier ne peut pas connaître la facturation réelle : voir `LIMITES_GRATUITES.md` et régler les plafonds chez chaque fournisseur.

## Validation avant fusion
`npm run check`, `npx vitest run`, `npm run test:regressions`, tests purs (`node --experimental-strip-types tests/<fichier>.test.mjs`),
`npm run build` (avec `ulimit -n 128`), puis contrôle de `/api/health` après déploiement (`release_sha`, `schema`).
Le contrôle Cloudflare des branches de PR échoue à `wrangler preview` (pas de bloc `previews`) : sans effet sur la production.

## Sources (consultées le 5 novembre 2026)
- https://console.groq.com/docs/rate-limits (en-têtes : requêtes = quota par jour, jetons = par minute ; `retry-after` seulement sur 429)
- https://console.groq.com/docs/reasoning (`reasoning_effort` : GPT-OSS 20B/120B)
- https://ai.google.dev/gemini-api/docs/rate-limits (limites par projet, RPD réinitialisé à minuit heure du Pacifique)
- https://ai.google.dev/gemini-api/docs/pricing (offre gratuite : contenu utilisé pour améliorer les produits ; offre payante : non)
- https://ai.google.dev/gemini-api/docs/available-regions
- https://docs.mistral.ai/fr/api
- https://docs.github.com/en/rest/pulls/pulls
