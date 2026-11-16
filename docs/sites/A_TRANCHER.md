# À trancher par Martin — contradictions entre documents (lot 5A, 16 novembre 2026)

Atelier **ne tranche pas**. Niveaux : **V** = vérifié par lecture (Git ou GitHub), **R** = rapporté, **H** = hypothèse.
Commits lus : Livre-de-recettes `92ec7c5` (main, V : tête de main sur GitHub le 16/11) ; Sport `f0ef3b0` (main, V).

## Sport
1. **Le README et `DELIVERY_8_35.md` disent que la 8.35.0 n'est « pas fusionnée » et que `main` reste en 8.34.1 ; Git dit le contraire.**
   V : la PR n°26 est fusionnée le 11 octobre (`b4afb9f`), `worker.js` de `main` contient `APP_VERSION = '8.35.0'`, et `docs/DEMANDES_8_35.md` est dans `main`.
   Ce qui n'est PAS vérifié : si le site en ligne sert bien la 8.35.0 (aucun accès au site). *Question :* le README et DELIVERY sont-ils simplement périmés ?
2. **Branche citée introuvable.** Le README cite `claude/new-session-wi9olv` ; GitHub ne liste que `main` et `Sauvegarde` (V, 16/11). La branche a été supprimée ou renommée.
3. **Étape « Publier : PR vers main »** de DELIVERY_8_35.md : sans objet si le point 1 est vrai.
4. **Aucun `CLAUDE.md` ni `AGENTS.md`** (V). Atelier n'invente aucune règle ; la seule source de règles est la section « Toujours valables » de `DEMANDES_8_35.md` (proposée comme décision, à valider par vous).
5. **Deux états mixtes** dans `DEMANDES_8_35.md` : ligne 61 « ✅ (sauf une ligne) » et ligne 72 « ✅ / ⚠️ ». Atelier a suivi le premier symbole (Fait) et le dit dans la fiche : à corriger si vous préférez « En cours » ou « Bloqué ».

## Livre de recettes
6. **Le même symbole ⏳ n'a pas le même sens dans les deux sites** : « à faire » dans `DEMANDES_4_0.md`, « en cours » dans `DEMANDES_8_35.md`. Atelier traduit ⏳ en « À concevoir » pour Recettes et « En cours » pour Sport (table fixe dans `scripts/build-sites-seed.mjs`). Aucune ligne ⏳ n'existe aujourd'hui dans les deux fichiers (le sens n'a donc pas d'effet pour l'instant), mais la règle est écrite.
7. **⚠️ « limite » est traduit en « Bloqué »** (seul état proche d'Atelier) : 3 lignes de Recettes, 1 de Sport. C'est une lecture d'Atelier, pas une phrase du document.
8. **`AGENTS.md` et `CLAUDE.md` de Recettes se contredisent et sont périmés** : `AGENTS.md` dit que Codex reprend tout, sans Claude Pro ; `CLAUDE.md` fait de Claude Code « l'intégrateur » et renvoie à `docs/agents/CLAUDE_CODE.md` (tableau de propriétaires Codex/Claude). Vous dites que Codex n'est plus utilisé (R). Signalé, non corrigé (Atelier est en lecture seule sur ce dépôt).
   *Effet sur la mission :* le générateur a ignoré 7 lignes liées à Codex, **dont `CLAUDE.md` ligne 5** (« lis `docs/agents/CLAUDE_CODE.md` en entier »). Une session Claude Code lira de toute façon `CLAUDE.md` dans le dépôt ; à vous de dire si ce fichier doit être cité dans la mission.
9. **`CE_QUI_MANQUE.txt` mêle plusieurs époques.** Son titre dit « Mis à jour le 6 novembre » et que « les états datés plus haut sont historiques », mais §2 s'intitule « 4.4.1 en ligne » alors que `main` est en 4.33 (R : message de la PR n°141). Atelier n'a repris comme « faits » que les lignes explicitement datées (§2 « Version … », lots 4.9 à 4.19 du 6 novembre) et les points ouverts §3/§4 ; **ces §3/§4 datent d'octobre** et certains sont peut-être résolus depuis (H).
10. **`etat-claude.md` « Pour reprendre » (6 novembre) est périmé** : il dit de fusionner #126 puis #127 ; GitHub montre #127 fusionnée le 6 novembre (V). Il cite aussi « sept fiches originales » encore attendues (R).
11. **Anciennes PR ouvertes (V : 8 + la n°139)** : #61 « EN PAUSE… ne pas intégrer » ; #69 contrats proposés à relire ; #81 passation Claude→Codex (obsolète si Codex n'est plus utilisé, H) ; #94 brouillon moules ; #96 et #97 empilées (la base de #97 est la branche de #96) ; #98 non brouillon, annonce des conflits avec main ; #107 branche `chatgpt/…` (hors du schéma `claude/`) ; #139 brouillon : document pour Atelier, dont l'écriture GitHub « n'a pas été testée ». *Question pour chacune :* garder, fermer ou refaire sur `main` ? Atelier n'y touche pas.
12. **Branches `claude/*` et `codex/*` très nombreuses** (plus de 80 branches, V : liste GitHub) dont beaucoup sont probablement déjà fusionnées : non triées.
13. **Une ligne de `DEMANDES_4_0.md` mélange deux choses** (ligne 184 « ✅ 18 propositions… sauf ce qui demande un accès que je n'ai pas ») : état mixte, suivi le premier symbole (Fait).

## Ce qui n'a pas pu être repris (voir `EXTRACTION.json`)
- Recettes : 26 lignes de tableaux sans colonne « État » (relevés d'inspection « Relevé | Fait ») et 1 ligne sans symbole (ligne 199, « La suite ») : **non reprises**, parce qu'aucun état d'origine n'y est écrit.
- Sport : 8 lignes du tableau « Ce qui manquait | Où c'est maintenant » (même raison).
- `CE_QUI_MANQUE.txt` : les blocs d'octobre (C1 à C6, notes « CODEX — … ») ne sont pas repris : paragraphes sans structure fiable.
