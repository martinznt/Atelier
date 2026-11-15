# Rapport du lot 2 — étape B : 4 entrées par intention (15 novembre 2026)

Suite de `RAPPORT_LOT_2_2026-11-15.md` (étape A, fusionnée : PR n°46, `5e196d4`, en ligne). Branche `claude/atelier-lot2-interface-bgvx58` refaite à partir de `main`, PR en brouillon.
**Rien fusionné, rien appliqué en production, aucune migration, aucune route serveur ni donnée modifiée, aucun autre dépôt touché, aucun secret utilisé.**
Niveaux de preuve : **V** = exécuté ou lu à la source par moi ; **R** = rapporté ; **H** = hypothèse. Environnement : Node 22, Chromium de bureau (Playwright) contre le Worker local. **Téléphone non essayé.**

## 0. Déclenchement — à lire
Martin a écrit « Lance b … fais tout ce que tu dois faire ». Ce n'est pas la phrase exacte « étape A validée, lance B » demandée au départ ; je l'ai prise comme **l'ordre explicite de lancer l'étape B** (V : l'étape A était fusionnée par Martin). **L'essai sur le Galaxy A05s de l'étape A n'a pas eu lieu et les choix sur les doublons n'ont pas reçu de réponse** : je n'ai donc fait que des déplacements d'écrans et gardé tous les raccourcis de l'étape A, sans retirer aucune fonction.

## 1. Ce qui a été fait
| Demande | Réalisation (V) | Fichiers |
|---|---|---|
| 4 entrées par intention | **Aujourd'hui** (Accueil, À traiter) · **Projets** (Mes projets, Pilotage, Discussions, Fichiers, Activité) · **Savoir** (Mémoire : Référentiel, Prompts, Export ChatGPT) · **Réglages et aide** (Réglages, Quotas Claude Code, Aide) | `web/App.tsx` |
| Barre du bas sans élément caché | 4 entrées + « Recherche » = 5 boutons, plus de « Plus » ; chaque bouton dans l'écran et d'au moins 44 px (mesuré à 360 et 390 px) | `web/App.tsx`, `web/styles.css` |
| Onglets visibles | une rangée d'onglets au-dessus de chaque écran d'une entrée, qui revient à la ligne (aucun défilement caché) ; l'entrée rouvre le **dernier écran utilisé** | `web/App.tsx`, `web/styles.css` |
| Textes d'aide | chemins du guide (G1/G2) et des raccourcis réécrits avec les nouveaux noms (« Projets → Pilotage », « Savoir → Prompts », « Réglages et aide → Quotas Claude Code ») ; la page d'aide explique les 4 entrées | `web/Guide.tsx` et écrans |
| Aucun changement de données ni de routes | **Les identifiants d'écran internes ne changent pas** : seule la navigation les regroupe. `git diff --stat` : uniquement `web/`, `tests/e2e/`, `docs/` | — |

Où est passé chaque ancien module : Accueil, À traiter → Aujourd'hui ; Pilotage, Discussions, Projets (« Mes projets »), Fichiers, Activité → Projets ; Mémoire → Savoir ; Claude (« Quotas Claude Code »), Réglages, Aide → Réglages et aide. Les modules du lot 1 (modèle de projet, fonctionnalités) restent dans « Projets → Pilotage ».

Écarts avec la demande, à connaître : (1) la **recherche** est le bouton « Recherche » de la barre (et la loupe en haut), pas un écran de « Savoir » ; (2) la **mémoire du projet** (« Ce qu'il faut garder en tête ») reste dans « Projets → Mes projets » et dans « Réglages » : je ne l'ai pas déplacée ; (3) « Savoir » n'a qu'un écran (Mémoire) : pas de rangée d'onglets au-dessus, ses 3 onglets internes (Référentiel, Prompts, Export ChatGPT) sont inchangés.

## 2. Observation : « par intention » ou « par projet » ? (H — à vous de trancher)
Vos deux sites sont deux projets, et l'essentiel du travail est « un projet à la fois ». Or dans « Projets », le projet courant se choisit à deux endroits : « Mes projets » (qui sert à Discussions et Fichiers) et les onglets de projet de « Pilotage ». **Je n'ai pas changé de modèle seul.** Une piste, à décider avec vous : un sélecteur de projet unique, visible en haut de « Projets », qui s'applique à tous ses onglets. Non vérifié : je n'ai pas observé comment vous naviguez réellement.

## 3. Mesures (V — `tests/e2e/lot2-audit.spec.ts`, 11 écrans × 360 / 390 / 1280 px + 360 px sombre)
| Mesure | Départ (avant A) | Après A | Après B |
|---|---|---|---|
| Textes visibles sous 12 px | 369 | 0 | **0** |
| Textes sous 3:1 de contraste | 21 | 0 | **0** |
| Cases sous 24 px | 36 | 0 | **0** |
| Écrans avec débordement horizontal | 0 | 0 | **0** |
| Barre du bas sur téléphone | 4 + « Plus » (6 modules cachés) | idem | **5 boutons, rien de caché** |
Limites des mesures : voir le rapport de l'étape A (§3), en particulier les seuils WCAG **non relus à la source** (w3.org injoignable) et le contraste calculé simplement.

## 4. Contrôles exécutés (V, résultats réels)
| Commande | Résultat |
|---|---|
| `npm run check` | OK |
| `npm test` (vitest) | **113/113** |
| `npm run build` | OK |
| `npm run test:regressions` / `test:storage` / `test:core` | 16 fichiers 0 échec ; 11/11 ; OK |
| `node --test tests/*.test.mjs` | **358/358** |
| 5 fichiers demandés | 38/38 |
| `node scripts/requirements-audit.mjs` | 567 exigences (+14 `INT-34`), **0 preuve cassée** |
| Playwright (Chromium bureau **et** Android 360 px) : `flow`, `lot1`, `lot2` | **11 tests par projet, tous verts** (deux séries : la limite d'inscriptions du serveur local a fait échouer un 11ᵉ test, relancé : vert) |
Tests de navigation adaptés (aucun supprimé ni affaibli) : `flow.spec.ts` (plus de clic sur « Plus »), `lot1.spec.ts` (Projets → Pilotage). Nouveaux : barre du bas à 360/390/1280 px (5 boutons, tailles, recherche, onglets visibles, dernier écran gardé) et parcours tâche → consigne → « Savoir » → « Prompts ».
Non lancés : audit multi-appareils de 40 min, `test:bridge`, Firefox, WebKit.
Pour tester en local j'ai ajouté `ALLOW_REGISTRATION=true` dans `.dev.vars` (fichier local, non versionné) car les inscriptions sont fermées dans `wrangler.jsonc` (décision de Martin, PR n°43) ; **la configuration de production n'est pas touchée**.

## 5. Parcours : tableau avant / après
Comme à l'étape A, **les scripts de 28 des 38 parcours ne sont pas versionnés** : je ne peux pas tous les rejouer. Rejoués sous la nouvelle navigation (V) :
| N° | Parcours | Résultat |
|---|---|---|
| 1, 2, 3 | ouverture, accès aux projets, navigation entre **tous les écrans** (11 écrans par 4 entrées) | réussis |
| 11 | création d'une tâche (formulaire du plan, puis tâche retrouvée) | réussi (était PARTIEL : formulaire non rejoué ; proposé **VALIDÉ**) |
| 12 | préparation d'une consigne Claude Code, puis « Savoir → Prompts » | réussi |
| 29, 31, 32, 33, 34 | rechargement, écran étroit, navigation au téléphone, formulaires, loupe | réussis |
| 38 | bandeau hors connexion | même résultat (reste PARTIEL : envoi hors connexion non couvert) |
| lot 1 | modèle de projet, fonctionnalité, « Vérifié » refusé puis accepté, recherche (360 et 390 px) | réussis |
Décompte : 26 VALIDÉ au 13/11 → **jamais moins** ; **27** si l'on retient le 11. Les autres VALIDÉ (4, 5, 13–21, 27, 28, 30, 35–37) : **non rejoués** ; aucun fichier serveur n'a changé et les 113 + 358 tests serveur passent (H : pas de recul, mais non prouvé). Échecs 8 et 10 et blocage 22 : inchangés, hors périmètre (nouvelles fonctions ou clés d'IA réelles).

## 6. Essai sur le Galaxy A05s
**Téléphone non essayé.** Protocole numéroté mis à jour : `docs/PROTOCOLE_TELEPHONE_LOT2.md` (5 boutons de la barre, onglets visibles, dernier écran gardé, recherche, texte sans zoom, aide, 5 parcours). Seul vous pouvez répondre OK / pas OK ; **aucun document ne dit « validé sur téléphone »**.

## 7. Non vérifié, limites, risques
- Téléphone réel ; Firefox/WebKit ; seuils WCAG à la source ; zoom du texte ; 28 parcours non rejoués.
- « Réglages et aide » est un libellé long : sur 360 px il passe sur deux lignes dans la barre (mesuré : bouton dans l'écran, taille suffisante) ; **à juger à l'œil sur le A05s**.
- L'entrée « Savoir » n'a qu'un écran, et « Projets » en a 5 : l'équilibre est discutable (§2).
- Les doublons de l'étape A (import de la passerelle, « Transmissions aux IA » contre « Prompts », « Mémoire personnelle ») restent **non tranchés** : aucune fonction retirée.
- Production non touchée : la fusion met en ligne automatiquement (sans migration).
