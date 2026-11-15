# Rapport du lot 2 — Interface lisible, étape A (15 novembre 2026)

Branche `claude/atelier-lot2-interface-bgvx58`, PR en brouillon. **Étape A seulement** : Martin n'a pas écrit « étape A validée, lance B ». **Rien fusionné, rien appliqué en production, aucune migration, aucune route serveur modifiée, aucun autre dépôt touché, aucun secret utilisé.**
Niveaux de preuve : **V** = exécuté ou lu à la source par moi ; **R** = rapporté (écrit ailleurs, non rejoué) ; **H** = hypothèse.
Environnement : Node 22 (le dépôt demande Node 24), Chromium de bureau piloté par Playwright contre le Worker local (`npm run dev`, base D1 locale). **Aucun essai sur téléphone réel.**

## 0. Prérequis
- Lot 1 : PR n°44 fusionnée, rapport `RAPPORT_LOT_1_2026-11-15.md` lu, `/api/health` de production lu (V) : `release_sha` = `bd5aed2…`, migrations 0007 à 0023 appliquées, aucune manquante. (La PR n°45, correctif d'un bouton grisé, est ensuite entrée dans `main` : partie du code de départ.)
- Au premier message, le lot 1 n'était pas fusionné : je m'étais arrêté ; Martin a ensuite dit de continuer, et j'ai revérifié avant de commencer.

## 1. Ce qui a été fait (étape A)
| Demande | Réalisation | Fichiers |
|---|---|---|
| Grossir les petits textes | Toute taille inférieure à 12 px passe à 12 px ; les 12 px passent à 13 px ; cases à cocher de 18 à 24 px ; gris très clairs (#8a–#8d) foncés en #767676 | `web/styles.css` |
| Libellés | « Claude » → « Quotas Claude Code » (menu) et titre de rubrique « QUOTAS ET RETOURS CLAUDE CODE » ; « À faire par Martin » → « À faire par vous » (onglet, recherche, listes, messages) ; « Action de Martin » → « Action pour vous » ; séparateurs décoratifs cachés aux lecteurs d'écran | `web/App.tsx`, `ClaudePilot.tsx`, `Inbox.tsx`, `Find.tsx`, `Discussions.tsx`, `Lifecycle.tsx` |
| Journal unique | « Activité » lit la même table d'événements que l'ancien « Journal du projet » de Pilotage, avec un **filtre par projet** et le nom du projet sur chaque ligne ; dans Pilotage, ce journal devient un raccourci qui ouvre Activité déjà filtrée sur le projet | `web/App.tsx`, `web/ProjectExtras.tsx` |
| Un endroit par fonction + raccourcis | voir §2 | `web/Guide.tsx`, `ProjectSpace.tsx`, `MemoryHub.tsx`, `SharedMemory.tsx`, `Settings.tsx` |
| G1 | Cadre « À quoi ça sert / La suite logique / Aide » en tête de chacun des 10 écrans | `web/Guide.tsx`, `web/App.tsx` |
| G2 | Nouvelle rubrique « Aide » (page « Bien utiliser Atelier ») : « Où trouver quoi » + 5 parcours (démarrer un projet ; transmettre une tâche à Claude Code ; retrouver une ancienne décision ; garder l'historique ChatGPT ; suivre les fonctionnalités d'un site) | `web/Guide.tsx` |

Choix à connaître : **« vous » plutôt que le nom de l'utilisateur** (le « nom » est une adresse email, trop longue pour un onglet) ; la rubrique « Aide » s'ajoute à « Plus » sur téléphone (11 rubriques ; l'étape B les regroupe).

## 2. Un seul endroit par fonction (choix à valider par Martin)
Pour chaque doublon j'ai **choisi l'endroit principal et mis un raccourci ailleurs ; aucune fonction n'a été retirée**. Rien de plus qu'un raccourci sans votre accord.
| Fonction | Endroit principal | Raccourcis ajoutés | Fusion plus poussée possible (à décider) |
|---|---|---|---|
| Journal d'activité | **Activité** (filtre par projet) | Pilotage → « Journal du projet » | fait (c'est la seule vraie fusion) |
| Connexion GitHub | **Réglages → Connexions** | Pilotage et Mémoire (textes devenus boutons) | « Dépôt GitHub / Suivi GitHub » de Pilotage restent : ils associent un dépôt à un projet (autre chose qu'une connexion) |
| Import d'historique ChatGPT | **Mémoire → Export ChatGPT** (bilan chiffré, reprise) | dans l'import de la passerelle (`SharedMemory`, écran « Projets ») | **Surprenant, donc proposé :** retirer l'import de la passerelle ou le garder pour Claude/Codex seulement |
| Passage aux IA | tâche → « Préparer une consigne » puis **Mémoire → Prompts** (le flux « Copié ≠ Transmis » validé aux parcours 12-16) | Pilotage → « Transmissions aux IA » renvoie vers Prompts | **Surprenant, donc proposé :** « Transmissions aux IA » et « Prompts » sont deux objets différents au vocabulaire différent ; les unifier est un choix de fond (étape B ou lot dédié) |
| Mémoire | **Mémoire** (référentiel, prompts, export) | Réglages → « Mémoire personnelle » | « Mémoire personnelle » (= « Ce qu'il faut garder en tête ») reste séparée ; à renommer ou fondre ? |
| Vérifications (3 endroits) | non traité | — | à décider avec l'étape B |

## 3. Mesures avant / après (V — `tests/e2e/lot2-audit.spec.ts`, Chromium, 10 rubriques × 360 / 390 / 1280 px + 360 px sombre)
| Mesure | Avant | Après |
|---|---|---|
| Plus petite taille de texte visible | 9 px | **12 px** |
| Textes visibles sous 12 px (tous écrans) | **369** | **0** |
| Textes sous 3:1 de contraste | 21 (séparateurs « / » et « . » décoratifs) | **0** |
| Cases à cocher sous 24 px | 36 | **0** |
| Rubriques avec débordement horizontal | 0 | 0 |
| Écrans avec ligne « À quoi ça sert » | 0 | 10 sur 10 |
Les chiffres « avant » ont été pris sur le code de départ (sans aucune modification de l'interface). **Limite :** la mesure de contraste est un calcul simple (couleur du texte contre le premier fond opaque) ; ce n'est pas un outil d'accessibilité complet, et elle n'a pas été faite sur un vrai téléphone.
Seuils WCAG : **je n'ai pas pu relire w3.org (hôte non autorisé dans cet environnement)**. Ce que j'ai utilisé (3:1 demandé par vous, cible tactile de 24 px, texte redimensionnable) vient de ma mémoire de WCAG 2.2 (critères 2.5.8, 1.4.3/1.4.11, 1.4.4) : **non vérifié à la source**. Aucune tolérance sur « texte redimensionnable » n'a été testée (zoom du navigateur).

## 4. Contrôles exécutés (V, résultats réels)
| Commande | Résultat |
|---|---|
| `npm run check` (tsc) | OK |
| `npm test` (vitest) | **113/113** |
| `npm run build` | OK (simulation de déploiement) |
| `npm run test:regressions` | 16 fichiers, 0 échec |
| `npm run test:storage` | OK |
| `npm run test:core` | OK (6 tests Python) |
| `node --test tests/*.test.mjs` | **358/358**, 0 échec (`wrangler-previews` est maintenant vert grâce à la PR n°43/44 déjà dans `main`) |
| 5 fichiers demandés (workbench, claude-advisor, history-analysis, zip-reader, requirements-audit) | 38/38 |
| `node scripts/requirements-audit.mjs` | voir §6 |
| Playwright : `flow` (1 parcours), `lot1` (2 largeurs), `lot2` (3 largeurs), projets Chromium bureau **et** Android 360 px | **12/12**, 0 échec (la première série avait 2 échecs : limitation d'inscriptions du serveur local « Trop de tentatives », vidée dans la base **locale** ; rejouées : vertes) |
Non lancés : audit multi-appareils de 40 min (réservé à la vérification finale), `test:bridge`, Firefox, WebKit.

## 5. Parcours : tableau avant / après
**Important : les scripts des 38 parcours du 13 novembre ne sont pas versionnés** (le rapport du 13 le disait). Je **ne peux donc pas** les rejouer tous. Ce qui est rejoué est écrit dans `tests/e2e/lot2.spec.ts` (désormais versionné).
| Statut | Avant (13/11, R) | Après (15/11) |
|---|---|---|
| VALIDÉ | 26 | **26 au plus** : voir ci-dessous. Rejoués et réussis (V) : **1, 2, 3, 29, 31, 32, 33, 34 (loupe)**, soit 8. Les 18 autres VALIDÉ (4, 5, 12–21, 27, 28, 30, 35–37) : **non rejoués** |
| PARTIEL | 9 | 9 (6, 7, 9, 11, 23–26, 38) ; le 38 (bandeau hors connexion) est rejoué avec le même résultat |
| ÉCHEC | 2 | 2 (8 comparaison de propositions ; 10 registre d'exigences) |
| BLOQUÉ | 1 | 1 (22 : fournisseur IA réel) |
| Dégradé | — | **aucun constaté** |
Ce qui permet de **dire « pas dégradé » sans l'avoir rejoué** pour les 18 non rejoués : (a) aucun fichier serveur ni migration n'est modifié (`git diff --stat` : uniquement `web/`, `tests/e2e/`, `docs/`) ; (b) les 113 + 358 tests serveur passent ; (c) les écrans concernés ne changent que par des libellés, des tailles de texte et des raccourcis ajoutés. **Cela reste une inférence (H), pas un rejeu.** Le critère « jamais moins de parcours validés » n'est donc **pas prouvé à 100 %** : à lire comme « aucun recul constaté, 18 parcours non rejoués ».
Les 2 échecs et le blocage : **documentés, non traités** (ce sont de nouvelles fonctions, hors périmètre du lot 2). Recommandation : les inscrire dans un lot dédié (comparaison de propositions, registre d'exigences par projet) ; le blocage 22 exige des clés d'IA réelles de Martin.

## 6. Exigences
Préfixe `INT-34` : 8 exigences ajoutées (`docs/EXIGENCES.json`), anciennes numérotations intactes. Sur ces 8 : 5 « réalisé », 2 « partiel » (doublons ; parcours), 1 « à faire » (essai téléphone).

## 7. Essai sur le Galaxy A05s
**Téléphone non essayé.** Protocole numéroté dans `docs/PROTOCOLE_TELEPHONE_LOT2.md` (ouvrir Chrome, se connecter, l'application installée, 5 parcours, lecture sans zoom, ligne « À quoi ça sert », lien d'aide, case par case OK / pas OK). Il ne pourra être joué qu'**après la fusion** de l'étape A.

## 8. Non vérifié, limites, risques
- Téléphone réel ; Firefox/WebKit ; contraste hors calcul simple ; **seuils WCAG non relus à la source** ; zoom/redimensionnement du texte non testé.
- 18 parcours non rejoués (§5) ; les 5 parcours de la page d'aide ont été rédigés contre les libellés réels mais **pas déroulés un par un de bout en bout**. Une phrase de la page d'aide (« filtrez par statut « validée » ») s'appuie sur le parcours 5 du 13/11 (R), pas sur un nouveau test.
- Le cadre d'aide occupe de la hauteur sur téléphone (5 à 6 lignes en haut de chaque écran) : à juger sur le Galaxy A05s ; on peut le replier si c'est pesant.
- Le menu passe à 11 rubriques (« Aide » dans « Plus ») : provisoire jusqu'à l'étape B.
- Les textes plus grands augmentent la longueur des écrans ; aucun débordement horizontal mesuré, mais des retours à la ligne plus nombreux sont possibles sur des écrans que je n'ai pas peuplés (listes longues).
- Aucune fonctionnalité retirée ; aucune donnée touchée. Production non touchée (fusion = mise en ligne automatique, sans migration).
