# Essai du lot 1 sur le Galaxy A05s — pas à pas

**État : téléphone non essayé.** Je n'ai pas de téléphone : ce protocole est à faire par Martin. Tant que vous n'avez pas répondu, tout rapport écrit « téléphone non essayé » ; il n'écrira jamais « validé sur téléphone » à votre place.

**Avant de commencer (très important)** : cet essai ne peut se faire qu'**après** la fusion de la PR du lot 1 *et* la mise en ligne (la fusion applique la migration 0023 sur la vraie base ; **faites d'abord la sauvegarde** décrite dans `docs/SAUVEGARDES.md` § « Production »). Avant la fusion, ces écrans n'existent pas sur le site en ligne.
Pour chaque étape : faites le geste, regardez, répondez **OK** ou **PAS OK**. Si PAS OK : capture d'écran (Volume bas + Marche/Arrêt), notez le numéro de l'étape et ce que vous voyez, puis passez à la suite.

| N° | Geste | Ce que vous devez voir | Si ce n'est pas le cas |
|---|---|---|---|
| 0 | Ouvrir **Chrome**, aller à `https://atelier.martin-zannet22.workers.dev` (adresse lue dans `cloudflare.production.json`), vous connecter, puis ouvrir l'**application installée** par son icône | L'accueil s'affiche avec une carte par projet | Noter le message d'erreur exact. Si l'application garde l'ancien écran : fermez-la complètement et rouvrez-la |
| 1 | Toucher **Pilotage**, choisir un projet (Sport ou Recettes), toucher **Modèle du projet** | Le gabarit (« Sport / Mes séances » ou « Livre de recettes ») et trois cases : *Code et déploiement*, *Suivi des fonctionnalités*, *Parcours pédagogique (emplacement vide pour l'instant)* ; aucun texte coupé | Noter ce qui manque ou déborde |
| 2 | Toucher **Suivi des fonctionnalités**, remplir « Nom simple » avec **Fonction de test**, toucher **Ajouter la fonctionnalité** | Une ligne « F-000x — Fonction de test » apparaît, avec « À concevoir » et « ✔ Confirmé par vous » | PAS OK + capture |
| 3 | Toucher la ligne, changer **État** en « En cours » | Le résumé de la ligne affiche « En cours » | PAS OK + capture |
| 4 | Toucher la **loupe**, taper `Fonction de test` | La fonctionnalité apparaît, avec « Source : Atelier » ; toucher le résultat ouvre l'écran Pilotage | Noter le temps d'attente |
| 5 | Sur la fonctionnalité : **Niveau de fiabilité** → « ✔ Vérifié », écrire une raison, toucher **Enregistrer le changement** **sans** remplir la source | Un message rouge clair : « Pour passer à « Vérifié », indiquez une source précise… ». La fiabilité reste « Confirmé par vous » | **PAS OK si le changement est accepté** : capture + dites-le moi tout de suite |
| 6 | Remplir « Source précise » (ex. `essai téléphone`), cocher « Adapté à ma demande », enregistrer | La pastille devient « ✔ Vérifié » ; dans « Historique », une ligne avec la date, la raison et la source | PAS OK + capture |
| 7 | Ouvrir **Sport**, puis **Recettes** (Pilotage), regarder leurs sections existantes (Où en est le projet, Plan, Décisions, Documents) | Tout est comme avant : mêmes tâches, mêmes décisions, mêmes documents (la seule nouveauté est « Modèle du projet » et « Suivi des fonctionnalités ») | Noter ce qui a changé ou disparu |
| 8 | Dans **Décisions**, ouvrir une décision : vérifier « Actuelle / Proposée / Remplacée » et la pastille de fiabilité ; cocher « Tout afficher » | Les décisions remplacées sont masquées par défaut puis réapparaissent avec « Tout afficher » | Noter ce qui est étrange |

Répondez : « Étape N : OK / PAS OK » pour chaque ligne + captures. Vous pouvez laisser la « Fonction de test » : rien n'est jamais supprimé (vous pouvez la passer à « Abandonnée »).
