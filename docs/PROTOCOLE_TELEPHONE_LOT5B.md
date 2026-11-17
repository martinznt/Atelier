# Protocole d'essai sur le Galaxy A05s — lot 5B, étape 5B-1 (maquette : capture, blocs, affichage)

**État : téléphone non essayé.** Ce protocole est à faire par Martin. À chaque étape, répondez **OK** ou **pas OK** (avec une capture d'écran si pas OK). Atelier n'écrit jamais « validé sur téléphone » à votre place.
Prérequis : la PR du lot 5B (étape 5B-1) est **fusionnée et en ligne** (la fusion applique la migration 0025 ; faites d'abord une sauvegarde). Rappel : à cette étape, on **ne peut ni déplacer, ni grouper après coup, ni colorier** : ces gestes arrivent aux étapes suivantes.

1. Sur le téléphone, ouvrez le site de Livre de recettes (ou de Sport), allez sur **une page** (ex. l'accueil) et faites une **capture d'écran** avec les boutons du téléphone. *Vous voyez :* la capture dans la galerie.
2. Ouvrez **Chrome**, allez à https://atelier.martin-zannet22.workers.dev et connectez-vous. *Vous voyez :* l'accueil d'Atelier et la barre du bas.
3. Ouvrez ensuite **l'application installée** (icône d'Atelier). *Vous voyez :* la même chose, sans barre d'adresse. Sinon notez « pas installée ».
4. **Projets → Pilotage → Livre de recettes → « Maquettes d'écran » → « Nouvelle maquette ».** Écrivez un nom (ex. « Accueil ») et touchez **Créer la maquette**. *Vous voyez :* « 1. La capture de départ ».
5. Touchez **Choisir la capture**, prenez celle de l'étape 1. *Vous voyez :* un message « Capture enregistrée : … Ko (limite 180,0 Ko) » puis la capture affichée. Si un message d'erreur apparaît : capture d'écran de ce message.
6. Descendez à **Ajouter un bloc**. Posez **3 blocs** qui recouvrent des éléments de la page (ex. le titre, un bouton, la barre du bas) : type, nom, distance depuis la gauche et le haut, largeur, hauteur (en pixels d'écran, l'écran fait 360 de large). *Vous voyez :* des cadres numérotés sur la capture. **Dites si ce réglage par chiffres est trop pénible** (c'est précisément ce que l'étape 5B-2 doit remplacer).
7. Touchez un cadre, puis une ligne de la liste sous la capture. *Vous voyez :* le détail du bloc (type, position, taille, groupe, couleur).
8. Créez un bloc avec un **nouveau groupe** et une **fonctionnalité liée**. *Vous voyez :* le groupe et la fonctionnalité dans le détail du bloc.
9. Essayez un bloc qui dépasse à droite (ex. départ 100, largeur 300). *Vous voyez :* « Le bloc dépasse à droite… ». Rien n'est ajouté.
10. Descendez à **3. Ce qu'Atelier sait déjà** : *vous voyez :* les décisions « actuelles » avec leur niveau de fiabilité.
11. Notez : texte lisible sans zoom ? rien ne dépasse à droite ? les boutons se touchent facilement ? le temps de réduction de la capture (moins de 5 secondes ?).
12. **Ne touchez pas** à « Fixer l'écran de départ » sauf si cette maquette est un essai : après cela, on ne peut plus rien ajouter à cette étape.

Réponse attendue : une ligne par étape (« 5 OK », « 6 pas OK : trop long à régler »…).

## Étape 5B-2 — modifier (après la fusion de la PR de l'étape 5B-2)
13. Ouvrez votre maquette. Touchez un bloc : il s'entoure d'un double cadre et le panneau « Déplacer » apparaît. *Sinon : capture.*
14. **Au doigt** : posez le doigt sur ce bloc déjà choisi et faites-le glisser. *Vous voyez :* il suit le doigt, puis reste à sa nouvelle place. Dites si c'est précis ou difficile.
15. **Par les boutons** : touchez → puis ↓. *Vous voyez :* les chiffres au centre du pavé changent de 8 (par défaut).
16. Touchez **Annuler**, puis **Rétablir**. *Vous voyez :* le bloc revient, puis repart.
17. Cochez « Choisir plusieurs blocs », touchez un deuxième bloc, écrivez un nom de groupe et touchez **Grouper le choix**. *Vous voyez :* « groupe « … » » sous les deux blocs dans la liste.
18. Choisissez « Palette du site : Livre de recettes » puis touchez une couleur pour le **Fond**. *Vous voyez :* le bloc prend cette couleur sur la capture.
19. Notez : la page défile-t-elle bien quand votre doigt commence sur un bloc **non** choisi ? les boutons se touchent-ils sans erreur ?

## Étape 5B-3 — fiche et mission (après la fusion de la PR de l'étape 5B-3) — c'est aussi l'**essai décisif**
20. Prenez une **vraie page** de Livre de recettes ou de Sport, faites sa maquette (capture, blocs), **fixez l'écran de départ**, puis faites vos changements.
21. Touchez **Préparer la fiche**. *Vous voyez :* les consignes (« Déplace … juste sous … »), la liste de contrôle, les fichiers en Hypothèse. Dites si une consigne est fausse ou floue.
22. Touchez **Télécharger l'image** puis **Télécharger la fiche** : les deux fichiers arrivent dans « Téléchargements ».
23. Choisissez le dépôt et touchez **Créer la mission**. Ouvrez « Missions pour Claude Code », lisez les règles du dépôt, figez, copiez, puis donnez le texte (avec l'image et la fiche) à Claude Code.
24. Quand la PR existe, comparez le résultat sur votre téléphone avec la **liste de contrôle**, point par point. Notez : conforme en une passe ? sinon, combien d'allers-retours.

## Étape 5B-4 — conseils (après la fusion de la PR de l'étape 5B-4)
25. Dans votre maquette, touchez **Vérifier la maquette** (section « 3. Conseils d'ergonomie »). *Vous voyez :* des conseils avec « ✔ Vérifié », « ◐ Rapporté » ou « ? Hypothèse » et la règle d'où ils viennent.
26. **Refusez** un conseil. *Vous voyez :* il disparaît, et « 1 refusé(s), masqué(s) ». Rechargez : il ne revient pas.
27. **Acceptez** un conseil, puis touchez **Préparer la fiche** : le conseil accepté y figure.
28. Dites si un conseil vous paraît faux ou inutile (capture).

## Étape 5B-5 — discussion (après la fusion de la PR de l'étape 5B-5)
29. Dans « 4. Discussion », choisissez un bloc, écrivez une question (« si je mets ça ici, est-ce bien ? »), touchez **Demander à Atelier**. *Vous voyez :* une réponse « Atelier (sans IA) » avec des lignes [Vérifié], [Rapporté], [Hypothèse] ou [Confirmé par vous].
30. Si vous avez une connexion Mistral, Groq ou Gemini avec votre clé : touchez **Demander l'avis d'une IA**. *Vous voyez :* une réponse « IA … Hypothèse ». Sinon, notez « pas de clé ».
31. Touchez **Confirmer une conclusion**, écrivez-la, confirmez. *Vous voyez :* « ✔ Confirmé par vous ». Préparez la fiche : la conclusion y est.
