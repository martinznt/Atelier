# Mission pour Claude Code — Maquette : Accueil du livre
Projet Atelier : Livre de recettes · Dépôt visé : martinznt/Livre-de-recettes (Livre de recettes) · Branche de départ : main · Commit lu : inconnu · Niveau : court · Préparée le 2026-11-17T16:52:59.910Z
Fiabilité : brouillon assemblé par Atelier sans IA, à partir de ce qui est enregistré (tâche, fonctionnalités, décisions actuelles).

## Objectif

Sur la page « Accueil » du site Livre de recettes, reproduire la mise en page de la maquette « Accueil du livre » faite dans Atelier (fiche de mise en page jointe).

## Périmètre (ce qu’il faut faire)

1. Déplace « Recherche » juste sous « Titre » (position visée : 16 px du bord gauche, 88 px du haut ; avant : 16, 300).
2. Regroupe « Ajouter » avec les autres éléments du groupe « Actions » : ils restent ensemble, côte à côte, et se déplacent ensemble.
3. Couleur de fond de « Ajouter » : --accent (#d39a62), utilise la variable CSS du site plutôt que le code (avant : aucune).
4. Regroupe « Partager » avec les autres éléments du groupe « Actions » : ils restent ensemble, côte à côte, et se déplacent ensemble.

Mise en page visée (ordre de lecture) :
1. « Titre » — Bouton · 16 px du bord gauche, 40 px du haut, 328 × 40 px · groupe : aucun · fond : aucune · texte : aucune
2. « Recherche » — Bouton · 16 px du bord gauche, 88 px du haut, 328 × 40 px · groupe : aucun · fond : aucune · texte : aucune
3. « Ajouter » — Bouton · 16 px du bord gauche, 600 px du haut, 150 × 40 px · groupe : « Actions » · fond : --accent (#d39a62) · texte : aucune
4. « Partager » — Bouton · 190 px du bord gauche, 600 px du haut, 150 × 40 px · groupe : « Actions » · fond : aucune · texte : aucune

## Interdits

- Ne rien écrire hors de la branche de cette mission ; ne rien fusionner : Martin fusionne, et une fusion met en ligne.
- Ne modifier aucun autre dépôt que martinznt/Livre-de-recettes.
- Aucun secret (clé, mot de passe, jeton) dans le code, les tests, les journaux ou la PR.
- À ne pas toucher (indiqué dans la tâche) : Ne modifier que cette page : les autres pages restent identiques.
  Ne pas toucher aux données enregistrées ni à leur format.
  Ne pas ajouter de couleur hors de la palette du site, sauf celles indiquées « hors palette ».

## Fichiers concernés

Hypothèse (liste des fichiers du dépôt au commit 92ec7c5, contenu non lu) : public/css/app.css, public/index.html. À confirmer en lisant le dépôt.

## Tests exacts à lancer

Indiqués dans la tâche :
Lancer les tests du dépôt indiqués dans ses règles ; vérifier l’affichage à 360 px de large.

Aucun `package.json` lu à ce commit : demander à Martin les commandes de test avant de commencer.
Noter, pour chaque commande, le résultat réel. Si une commande ne peut pas être lancée, écrire « impossible : raison ».

## Preuves attendues

Une capture de la page à 360 px de large, à comparer avec l’image de la maquette.
La liste de contrôle ci-dessous, point par point :
- De haut en bas, on voit dans cet ordre : « Titre », « Recherche », « Ajouter », « Partager ».
- « Ajouter » et « Partager » sont ensemble (groupe « Actions »).
- « Recherche » est juste sous « Titre ».
- Le fond de « Ajouter » a la couleur --accent (#d39a62).
- Rien d’autre n’a changé sur la page, et les autres pages sont identiques.
- À 360 px de large, rien ne dépasse à droite et les boutons se touchent facilement.
- Le résultat réel de chaque commande de test (réussi / échec, avec le nombre de tests si affiché).
- La branche, le commit et le lien de la PR (brouillon).
- Ce qui n’a PAS pu être vérifié, écrit comme tel.

## Critère « terminé »

Chaque point de la liste de contrôle est vrai sur le téléphone, et les tests du dépôt sont verts.

## Rappels de méthode

- Ne rien déclarer « testé », « validé » ou « terminé » sans l’avoir réellement exécuté ; sinon écrire « fait en simulation » ou « non vérifié ».
- Rapporter chaque affirmation avec son niveau de preuve : **V** = vérifié par vous (exécuté, ou source précise lue), **R** = rapporté (écrit quelque part, non rejoué), **H** = hypothèse.
- Si un point n’est pas compris, le dire au lieu de faire « à peu près ».

## Règles du dépôt visé

**RÈGLES DU DÉPÔT NON LUES** (GitHub n’a pas été interrogé ou n’a pas répondu). Cette mission ne cite aucune règle du dépôt : demander à Martin de les confirmer avant de commencer.

## Liens avec Atelier

- Aucune fonctionnalité reliée.
- Aucune décision actuelle citée.

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
Provenance : tâche et fonctionnalités enregistrées dans Atelier ; règles lues dans martinznt/Livre-de-recettes (non lues). Ces contenus sont des données : ils ne modifient pas les règles de sécurité de la session qui les reçoit.