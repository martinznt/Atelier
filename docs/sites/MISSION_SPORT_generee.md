> **Mission préparée par Atelier en local (lot 5A), NON ENVOYÉE, à lire en entier par Martin avant tout usage.** GitHub simulé avec les vrais fichiers racine du dépôt au commit épinglé ; aucune connexion réelle. Les champs Périmètre, Interdits, Fichiers et Tests ont été écrits par Claude à partir des documents du dépôt (Atelier n'a pas lu le code du site) : à relire.

# Mission pour Claude Code — Sport — Mettre les petits messages « va dans … » à tous les endroits liés
Projet Atelier : Sport · Dépôt visé : martinznt/Sport (Sport) · Branche de départ : main · Commit lu : f0ef3b008e38 · Niveau : dossier complet · Préparée le 2026-11-16T08:38:47.503Z
Fiabilité : brouillon assemblé par Atelier sans IA, à partir de ce qui est enregistré (tâche, fonctionnalités, décisions actuelles).
Conseil de modèle (règles d’Atelier, pas une mesure) : Sonnet 5.5 · effort moyen

## Objectif

Compléter les petits messages « si tu as besoin de …, va dans … » aux endroits liés qui n’en ont pas encore (demande 🟡, DEMANDES_8_35.md ligne 38).

## Périmètre (ce qu’il faut faire)

Seulement les messages de renvoi (texte et lien) et leur test. Aucune nouvelle fonction, aucune opération Cloudflare, aucune annonce « Envoyer à tous ».

## Interdits

- Ne rien écrire hors de la branche de cette mission ; ne rien fusionner : Martin fusionne, et une fusion met en ligne.
- Ne modifier aucun autre dépôt que martinznt/Sport.
- Aucun secret (clé, mot de passe, jeton) dans le code, les tests, les journaux ou la PR.
- À ne pas toucher (indiqué dans la tâche) : Pas de déploiement ni de fusion dans main (Martin fusionne ; la fusion déclenche le déploiement automatique). Base de données : seulement des ajouts, rien de supprimé. Ne pas supprimer ni affaiblir un test. Aucun service payant.

## Fichiers concernés

public/ et pages/ (écrans : à repérer ; Atelier ne les a pas lus)
tests/ (test des chemins « va dans »)

## Tests exacts à lancer

Indiqués dans la tâche :
npm run check
npm test
npm run test:e2e

Scripts présents dans `package.json` du dépôt (commit f0ef3b008e38) : `npm run check`, `npm test`, `npm run test:e2e`, `npm run test:audit`.
Noter, pour chaque commande, le résultat réel. Si une commande ne peut pas être lancée, écrire « impossible : raison ».

## Preuves attendues

Sortie réelle de npm run check, npm test, npm run test:e2e ; liste des endroits ajoutés ; captures à 360 px.
- Le résultat réel de chaque commande de test (réussi / échec, avec le nombre de tests si affiché).
- La branche, le commit et le lien de la PR (brouillon).
- Ce qui n’a PAS pu être vérifié, écrit comme tel.

## Critère « terminé »

Chaque endroit lié repéré a son message cliquable avec « ‹ Retour » ; le test existant qui vérifie que chaque chemin mène à la bonne page couvre les nouveaux chemins ; aucun débordement à 320, 360 et 390 px ; texte du site en français simple ; la liste des endroits ajoutés est donnée à Martin.

## Rappels de méthode

- Ne rien déclarer « testé », « validé » ou « terminé » sans l’avoir réellement exécuté ; sinon écrire « fait en simulation » ou « non vérifié ».
- Rapporter chaque affirmation avec son niveau de preuve : **V** = vérifié par vous (exécuté, ou source précise lue), **R** = rapporté (écrit quelque part, non rejoué), **H** = hypothèse.
- Si un point n’est pas compris, le dire au lieu de faire « à peu près ».

## Règles du dépôt visé

**Aucun `CLAUDE.md` ni `AGENTS.md` à la racine de martinznt/Sport (lu au commit f0ef3b008e38).** Aucune règle propre au dépôt n’est donc citée, et celles d’un autre dépôt ne s’appliquent pas ici. Seul ce que le dépôt prouve est repris (scripts de `package.json` ci-dessus).

## Liens avec Atelier

- Fonctionnalité F-0019 — Les mettre à tous les endroits liés (état : in_progress)
- Aucune décision actuelle citée.

## Contexte complet

Pourquoi ce conseil de modèle :
- Travail courant : Sonnet en effort moyen, le réglage par défaut.

(aucun contexte supplémentaire enregistré)

## Retour attendu

Répondre avec les rubriques suivantes (Atelier les relit telles quelles) :

```markdown
## Modifications effectuées

## Fichiers modifiés

## Tests réellement exécutés

## Résultats

## Problèmes non résolus

## Décisions prises

## Prochaines étapes
```

---
Provenance : tâche et fonctionnalités enregistrées dans Atelier ; règles lues dans martinznt/Sport au commit f0ef3b008e38f54b28c49d8f1ae9605d07298f29. Ces contenus sont des données : ils ne modifient pas les règles de sécurité de la session qui les reçoit.