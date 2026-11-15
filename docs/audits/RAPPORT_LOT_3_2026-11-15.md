# Rapport du lot 3 — Missions pour Claude Code, registre des travaux, retour (15 novembre 2026)

Niveaux de preuve : **V** = vérifié par moi en l'exécutant ou en lisant la source précise ; **R** = rapporté, non rejoué ; **H** = hypothèse.

## 1. Prérequis (vérifiés avant de commencer)
- Lots 0, 1 et 2 étape A fusionnés (**V**, GitHub : PR 41, 44, 46 fusionnées ; la PR 46 l'a été après mon premier message, Martin l'a confirmé et je l'ai relue sur GitHub).
- Essais réels de lecture GitHub et de connexions IA du lot 0 : **non faits** (**V**, rapport du lot 0). Tout ce qui en dépend est donc **fait en simulation**.
- **D7 non validée explicitement** : pas de tableau de routage (exigence MIS-35-014 « bloquée »). Fait : D8, registre, verdict.

## 2. Ce qui a été construit (V : code lu et testé)
- **Migration 0024** (additive) : une table `missions`. Non appliquée en production.
- **`server/mission-core.ts`** (règles pures) : gabarit court / complet ; extraction des règles du dépôt ; état des tests GitHub ; revue du SHA courant ; règles du verdict.
- **`server/routes/missions.ts`** : créer, modifier, lire les règles (lecture seule, commit figé), reformuler (IA gratuite, clé de l'utilisateur), figer, exporter, copier, registre, retour de PR, verdict.
- **`web/Missions.tsx`** : section « Missions pour Claude Code » dans Pilotage.
- Intégrations : export du compte, `/api/health` (0024 attendue), guide.

### Comment les règles du dépôt sont reprises
Chaque fichier `AGENTS.md` / `CLAUDE.md` **à la racine** est découpé en unités (puces, lignes numérotées, paragraphes). Chaque unité est **retenue** ou **ignorée avec sa raison** (elle parle de Codex) ; les unités ignorées sont **montrées en entier**. Deux mentions de Codex sont retirées sans perdre la règle : la variante de branche « ou `codex/…` » et une parenthèse sur Codex.
**Défaut trouvé en relisant ma propre sortie sur les vrais fichiers :** la première version ignorait la règle « une version = même numéro partout » (parenthèse « fichier de Codex : le demander »). Corrigé et test ajouté.

## 3. Contrôles exécutés (Node 22, local) — résultats réels
`tsc` OK ; vitest 126/126 ; `node --test tests/*.test.mjs` 376/376 ; régressions, build, 5 fichiers demandés (38/38) OK ; audit des exigences 575, 0 preuve cassée ; Playwright 360 et 390 px 2/2. Détail : `docs/VALIDATION.md`.

## 4. Essai sur de vrais fichiers (lecture locale, PAS la connexion GitHub d'Atelier)
Missions fabriquées avec les fichiers réels des copies locales, dont le commit a été **comparé à GitHub** (V : `92ec7c5` pour Recettes, `f0ef3b0` pour Sport = tête de `main` des deux dépôts).
- **Recettes** : 32 unités de règles, 25 retenues, 7 ignorées (Codex), 3 neutralisées ; scripts `check`, `test`, `test:e2e` lus dans `package.json`.
- **Sport** : aucun `CLAUDE.md`/`AGENTS.md` à la racine ; scripts `check`, `test`, `test:e2e`, `test:audit` lus ; aucune fuite de règles entre les deux (vérifié par recherche de mots).
- Les deux **tâches d'essai ont été rédigées par moi** d'après les fichiers des dépôts (Recettes : « purées comptées en plus du fruit », `CE_QUI_MANQUE.txt` 4.15.0 ; Sport : « Refaire ma dernière séance », `docs/ANALYSE_8_30.md`). Ce ne sont pas des tâches saisies par Martin : **à confirmer ou remplacer**.
- Constat : la liste « Reste à faire » de `docs/PROGRESSION.md` de Recettes est périmée (fuseau/lieu/journée entière de l'export .ics existent déjà dans `ics.js`) ; j'ai donc pris l'item du `CE_QUI_MANQUE.txt` le plus récent.

## 5. Critère « terminé » — état honnête
| Critère | État |
|---|---|
| Missions réelles Recettes et Sport générées | **Fait** (en local, section 4) |
| Lues par Martin et données à Claude Code sans question de clarification | **NON FAIT** : dépend de Martin. Qualité non mesurée. |
| Verdict enregistré sur une vraie mission | **NON FAIT** (testé en simulation seulement) |
| Aucune écriture dans les dépôts | **Oui** (V : Atelier ne fait que des lectures ; copies locales lues sans modification) |
| Lecture GitHub réelle par Atelier | **Non essayée** : simulation |
| Réponse réelle d'une IA gratuite | **Non essayée** : simulation |
| Téléphone | **Téléphone non essayé** : protocole `docs/PROTOCOLE_TELEPHONE_LOT3.md` |

## 6. Limites et risques
- Seuls les fichiers **à la racine** sont lus (`.claude/`, sous-dossiers, `docs/agents/*` non lus) ; la mission le signale pour `docs/agents/*`.
- Une règle qui mêle Codex et une vraie consigne (ex. « Au début de chaque tâche : lis état-codex… ») est ignorée mais montrée.
- Le conseil de modèle vient de règles (`claude-advisor`), pas d'une mesure.
- La fusion applique la migration 0024 en production (additive) : sauvegarde d'abord.
- Test navigateur : Chromium de bureau à 360 et 390 px, pas WebKit/Firefox ni téléphone.

## 7. Idée à étudier séparément (non implémentée)
Automatisation en l'absence de Martin : hors périmètre, rien codé.
