# Guide pas à pas — Sport et Livre de recettes dans Atelier (lot 5A)

À faire par **vous**. Rien n'est envoyé nulle part ; Atelier lit, prépare, suit. **Aucune migration dans ce lot** : fusionner la PR ne change pas la base de production.
Fichiers : `docs/sites/recettes-depart.json` et `docs/sites/sport-depart.json` (dans le dépôt Atelier, branche de la PR du lot 5A). Pour les avoir sur le téléphone, ouvrez-les depuis GitHub (bouton « Raw », puis « Télécharger »).

## A. Créer les deux projets et importer
1. Atelier → **Projets** → **Pilotage** → créez « Livre de recettes » et « Sport » (s'ils n'existent pas).
2. Ouvrez chacun → **Modèle du projet** → « Gabarit de départ » : **Livre de recettes** puis **Sport / Mes séances**. *Vous voyez :* « Suivi des fonctionnalités ».
3. **Importer un fichier de départ** → choisissez le bon fichier. *Vous voyez un aperçu* : Recettes 120 fonctionnalités et 4 décisions ; Sport 36 et 1 ; « rien n'est encore écrit ». Touchez **Ajouter…**.
4. Rechoisissez le même fichier : « Tout est déjà présent » (pas de doublon, rien n'est modifié).
5. *(Facultatif, jamais essayé en réel)* **Dépôt GitHub** : reliez `martinznt/Livre-de-recettes` et `martinznt/Sport` **en lecture seule**. Sans cela, pas de mission.

## B. Contrôler
- La loupe : cherchez « PR n°94 » (Recettes) et « endroits liés » (Sport) : chaque résultat dit sa **source** (fichier, ligne, commit) et son niveau **Rapporté**. Rien n'est « Vérifié » : Atelier n'a rien rejoué.
- Lisez `docs/sites/A_TRANCHER.md` et répondez point par point (garder / corriger).
- Les 4 + 1 décisions sont **Proposées** : seul vous les validez.

## C. Trier les conversations de l'export (quand l'export sera importé)
*État : « conversations de l'export : non importées » (l'import réel est à faire par vous ; Atelier n'a lu aucune conversation).*
1. Menu **Mémoire → Export ChatGPT** → importez l'archive (voir `docs/GUIDE_IMPORT_REEL.md`).
2. Ouvrez **Conversations et lots**. Utilisez la zone « Rechercher une conversation » avec des mots que **vous** reconnaissez. Pistes tirées des documents des dépôts (pas de vos conversations) : Recettes : recette, livre, cuisine, courses, planning, fraisier, brownie, A05s ; Sport : séance, escalade, étirement, phase, objectif, Strava, chrono.
3. Cochez les conversations qui concernent **un seul** site, choisissez **Projet** = « Livre de recettes » ou « Sport », touchez **Confirmer ce projet pour la sélection**. Atelier ne devine jamais.
4. Touchez **Aperçu de l'import…** : lisez le nombre de conversations et de messages ; seulement ensuite importez. Une conversation écartée demande une raison.
5. Tout ce contenu est **Rapporté**, jamais Vérifié. Ne collez aucune conversation dans une PR ou un rapport.

## D. Lire les deux missions
`docs/sites/MISSION_RECETTES_generee.md` (point 4.9 : téléphone à l'horizontale) et `docs/sites/MISSION_SPORT_generee.md` (« Les mettre à tous les endroits liés »). **Lisez-les en entier**, puis répondez « OK / pas OK » avec la raison. Ne les donnez à Claude Code qu'après lecture : Atelier ne les a pas envoyées.
