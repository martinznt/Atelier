# Guide pas à pas — Atelier dans Atelier (lot 4)

À faire par **vous**. Rien n’est envoyé nulle part : Atelier prépare, vous décidez. Le fichier à importer est `docs/atelier-dans-atelier/atelier-depart.json` (dans le dépôt Atelier, branche de la PR du lot 4).

**Avant tout :** la PR du lot 4 doit être **fusionnée et en ligne**. Elle n’ajoute **aucune migration** : la fusion ne change donc pas la base de production. (Les lots 1 et 3 avaient des migrations ; elles doivent déjà être appliquées. Vérifiez sur `/api/health` : migrations 0007 à 0024, aucune manquante.)

## 1. Créer le projet
1. Ouvrez Atelier → **Pilotage** → créez un projet nommé **Atelier** (si « Atelier » existe déjà, ouvrez-le).
2. Ouvrez le projet → **Modèle du projet** → « Gabarit de départ » : **Atelier lui-même**. *Vous voyez :* « Suivi des fonctionnalités » coché.
3. *(Facultatif, jamais essayé en réel)* **Dépôt GitHub** : associez `martinznt/Atelier`, en lecture seule. Sans cela, vous ne pourrez pas créer de mission (étape 5).

## 2. Importer le fichier
4. Section **Importer un fichier de départ** → choisissez `atelier-depart.json`.
5. *Vous voyez un aperçu* : « Fonctionnalités à ajouter : 94 · Décisions à ajouter : 12 », et « rien n’est encore écrit ».
6. Touchez **Ajouter 94 fonctionnalité(s) et 12 décision(s)**. *Vous voyez :* « Importé… ».
7. Rechoisissez le même fichier : *vous voyez* « Tout est déjà présent » (preuve qu’il n’y a pas de doublon). Rien n’est modifié ni supprimé.

## 3. Vérifier 5 éléments
- **A.** Touchez la loupe, cherchez « Migration 0023 » : une fonctionnalité sort, avec « Source : Atelier ».
- **B.** Ouvrez-la dans **Suivi des fonctionnalités** : elle dit sa **source** (un rapport) et son niveau **« Vérifié »** (un test est cité).
- **C.** Ouvrez « §13 — Mode hors connexion » : niveau **« Rapporté »** (écrit dans EXIGENCES.json, jamais rejoué par Atelier). Aucune fonctionnalité n’est « Vérifié sur téléphone » : c’est à vous de le noter.
- **D.** Ouvrez « Lot 5A » et « Lot 5B » : **« À concevoir »**. Le contenu du 5B n’est écrit nulle part : complétez-le si vous le connaissez.
- **E.** **Décisions et À trancher** : 12 décisions **« Proposées »**. Pour D2, D3, D4, D5, D6, D8, ouvrez-la, « Nouvel état : Actuelle », écrivez pourquoi, cochez « Je valide ». Pour D1, D9, D10, D10 bis, D11, D12, le texte de la question manque : écrivez-le, puis validez (ou laissez « Proposée »). **Seules vos validations les rendent « actuelles ».**

## 4. Créer la tâche du lot 5A
8. **Plan** → nouvelle tâche « Lot 5A — Relier Sport et Livre de recettes en lecture seule », avec objectif et critère « terminé » (texte proposé dans `MISSION_LOT_5A_generee.md`).

## 5. Générer la mission
9. **Missions pour Claude Code** → **Nouvelle mission** : tâche = celle du lot 5A, niveau **Complet**, cochez la fonctionnalité « Lot 5A » et les décisions validées. **Créer le brouillon.**
10. Ouvrez-la : remplissez **Périmètre** et **Fichiers concernés** (Atelier refuse sinon), **Enregistrer le brouillon**, puis **Lire les règles du dépôt (lecture seule)**, puis **Préparer la mission**.
11. **Copier le texte exact** et collez-le dans une note pour le lire **en entier**.

## 6. Comparer et juger (vous seul)
Mettez à côté : (a) la mission générée, (b) la mission de 5A que vous aviez écrite ou fait écrire à la main, (c) `docs/atelier-dans-atelier/MISSION_LOT_5A_generee.md` (version préparée en local par Claude). Répondez : **la mission d’Atelier est-elle meilleure ? oui / non, et pourquoi.** Notez : combien de questions Claude Code pose-t-il si vous la lui donnez telle quelle ?

## Si quelque chose ne va pas
Notez le message exact + capture d’écran. Message « Les inscriptions sont fermées » : normal (décision du 15 novembre), n’en créez pas. Message « Le module… n’est pas activé » : refaites l’étape 2 de la partie 1.
