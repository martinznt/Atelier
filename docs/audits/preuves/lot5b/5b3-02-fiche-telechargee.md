# Fiche de mise en page — Accueil du livre

- Page du site : « Accueil »
- Écran de travail : 360 × 800 px (capture du téléphone, largeur ramenée à 360 px)
- Palette : Livre de recettes, lue dans public/css/app.css (commit 92ec7c5, lecture seule)
- Fabriquée par Atelier avec des règles fixes, sans IA (version 1).

## Blocs, dans l’ordre de lecture (de haut en bas, puis de gauche à droite)

1. « Titre » — Bouton · 16 px du bord gauche, 40 px du haut, 328 × 40 px · groupe : aucun · fond : aucune · texte : aucune
2. « Recherche » — Bouton · 16 px du bord gauche, 88 px du haut, 328 × 40 px · groupe : aucun · fond : aucune · texte : aucune
3. « Ajouter » — Bouton · 16 px du bord gauche, 600 px du haut, 150 × 40 px · groupe : « Actions » · fond : --accent (#d39a62) · texte : aucune
4. « Partager » — Bouton · 190 px du bord gauche, 600 px du haut, 150 × 40 px · groupe : « Actions » · fond : aucune · texte : aucune

## Groupes

- « Actions » : « Ajouter », « Partager »

## Écarts par rapport à l’écran de départ

Écran de départ fixé le 2026-11-17T16:52:58.758Z.

1. Déplace « Recherche » juste sous « Titre » (position visée : 16 px du bord gauche, 88 px du haut ; avant : 16, 300).
2. Regroupe « Ajouter » avec les autres éléments du groupe « Actions » : ils restent ensemble, côte à côte, et se déplacent ensemble.
3. Couleur de fond de « Ajouter » : --accent (#d39a62), utilise la variable CSS du site plutôt que le code (avant : aucune).
4. Regroupe « Partager » avec les autres éléments du groupe « Actions » : ils restent ensemble, côte à côte, et se déplacent ensemble.

## Fichiers probablement concernés (Hypothèse)

- public/css/app.css
- public/index.html

Déduit de la liste des fichiers du dépôt au commit indiqué, pas de leur contenu : à confirmer en lisant le dépôt.

## Liste de contrôle « maquette / résultat » (à vérifier sur le téléphone)

- [ ] De haut en bas, on voit dans cet ordre : « Titre », « Recherche », « Ajouter », « Partager ».
- [ ] « Ajouter » et « Partager » sont ensemble (groupe « Actions »).
- [ ] « Recherche » est juste sous « Titre ».
- [ ] Le fond de « Ajouter » a la couleur --accent (#d39a62).
- [ ] Rien d’autre n’a changé sur la page, et les autres pages sont identiques.
- [ ] À 360 px de large, rien ne dépasse à droite et les boutons se touchent facilement.

## Limites

- Atelier ne promet pas une reproduction au pixel près : les positions sont en pixels d’écran à 360 px de large, à respecter à quelques pixels près.
- Les noms des blocs sont ceux de la maquette ; sur le site, l’élément peut porter un autre texte.
