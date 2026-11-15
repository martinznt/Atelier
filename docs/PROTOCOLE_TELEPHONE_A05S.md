# Essai sur le Galaxy A05s — protocole pas à pas (15 novembre 2026)

**État : téléphone non essayé.** Je n'ai pas de téléphone. Ce protocole est à faire par Martin. Tant que vous n'avez pas répondu, tout rapport écrit « téléphone non essayé ».
Pour chaque étape : faites le geste, regardez ce qui doit apparaître, répondez **OK** ou **PAS OK**. Si PAS OK : faites une **capture d'écran** (boutons Volume bas + Marche/Arrêt), notez le numéro de l'étape et ce que vous voyez, et passez à la suite sans insister. N'essayez rien d'autre.
Avant de commencer : batterie > 50 %, Wi-Fi, Chrome à jour, une seule application ouverte.

| N° | Geste | Ce que vous devez voir | Si ce n'est pas le cas |
|---|---|---|---|
| 1 | Ouvrir **Chrome**, taper dans la barre d'adresse : `https://atelier.martin-zannet22.workers.dev` (adresse lue dans `cloudflare.production.json` ; si elle ne répond pas, dites-le : je ne peux pas la vérifier d'ici) | La page d'Atelier se charge en moins de ~10 s, en blanc (ou noir si votre téléphone est en mode sombre), sans message d'erreur | PAS OK + capture. Noter : page blanche, erreur, cadenas barré |
| 2 | **Se connecter** (e-mail + mot de passe d'au moins 8 caractères) | Vous arrivez sur l'accueil, avec une carte par projet | Noter le texte exact du message d'erreur |
| 3 | Menu Chrome (⋮ en haut à droite) → **Installer l'application** (ou « Ajouter à l'écran d'accueil ») → Installer | Une icône noire et blanche « Atelier » apparaît sur l'écran d'accueil ; elle s'ouvre en plein écran | Si le choix « Installer » est absent : noter ce que propose le menu |
| 4 | Ouvrir l'application par son icône, puis toucher **Accueil**, puis **À traiter**, puis **Mémoire** | Chaque écran s'ouvre sans texte coupé ni défilement horizontal ; les boutons se touchent facilement | Noter l'écran et ce qui déborde |
| 5 | Toucher la **loupe**, taper un mot (ex. « recette ») | Des résultats apparaissent en quelques secondes ; toucher un résultat l'ouvre | Noter le mot et le temps d'attente |
| 6 | Mode avion 10 s, puis le retirer ; rouvrir l'application | L'application s'ouvre quand même (mode hors connexion) ; elle revient normalement | Noter ce qui s'affiche hors connexion |
| 7 | **(Seulement après la fusion de la PR 40 et la sauvegarde)** Mémoire → Export ChatGPT → choisir un **petit** fichier JSON de test, pas l'archive de 97 Mo | L'inventaire se termine ; l'écran reste allumé ; le bilan s'affiche | Noter à quel moment l'onglet se recharge ou plante (la mémoire du téléphone est la grande inconnue) |
| 8 | Envoyer le bilan : « Étape N : OK / PAS OK » + captures | | |

À savoir : l'import de l'archive complète sur ce téléphone est **déconseillé** pour un premier essai : le lecteur lit un fichier de conversations de ~21 Mo en mémoire (limite fixée à 160 Mo, jamais validée sur ce modèle). Faites-le d'abord sur ordinateur.
Mesures déjà faites (sur ordinateur, **pas** sur le téléphone) : inventaire 3 s, indexation 2,5 s, import des messages 5 s.
