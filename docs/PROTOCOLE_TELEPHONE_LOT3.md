# Essai sur le Galaxy A05s — lot 3, missions pour Claude Code (à faire par Martin)

**État : téléphone non essayé.** Tant que Martin n'a pas répondu, aucun document ne dit « validé sur téléphone ».
Pour chaque geste, répondez **OK** ou **pas OK** (avec une capture d'écran si pas OK).
Adresse d'Atelier : https://atelier.martin-zannet22.workers.dev

**Avant de commencer :** la PR du lot 3 doit être **fusionnée et en ligne**, et la migration 0024 appliquée (sinon l'écran « Missions pour Claude Code » n'existe pas : vous verriez seulement « Transmissions aux IA »). Fusionner applique la migration : faire d'abord la sauvegarde (`docs/SAUVEGARDES.md`).

## A. Ouvrir Atelier
1. Ouvrez **Chrome** sur le téléphone. *Vous voyez :* le navigateur.
2. Tapez l'adresse ci-dessus. *Vous voyez :* la page de connexion d'Atelier. *Sinon :* vérifiez le réseau, notez le message, capture.
3. Connectez-vous (email et mot de passe). *Vous voyez :* « Accueil » avec « Où en sont vos projets ».
4. Fermez Chrome, puis ouvrez **l'application Atelier installée** (icône sur l'écran d'accueil). *Vous voyez :* la même chose. *Sinon :* notez « application non installée ».

## B. Préparer une mission (une tâche réelle de Recettes ou de Sport)
5. **(1) Ouvrir une tâche.** Touchez « Pilotage », ouvrez le projet (Livre de recettes ou Sport), section « Plan » : vous voyez la liste des tâches. *Si le projet n'a aucun dépôt :* section « Dépôts », ajoutez-le d'abord.
6. **(2) Préparer la mission.** Ouvrez la section **« Missions pour Claude Code »** (au-dessus de « Transmissions aux IA »), puis « Nouvelle mission ». Choisissez la tâche, le dépôt, laissez « Court », touchez **« Créer le brouillon »**. *Vous voyez :* un message « Brouillon créé » et la mission dans la liste.
   *Remarque :* le bouton « Préparer une consigne pour Claude Code » du Plan existe toujours (il crée une fiche dans Mémoire → Prompts, comme avant) ; la **mission** est la nouvelle manière, avec les règles du dépôt.
7. Ouvrez la mission. *Vous voyez :* sept champs (Objectif, Périmètre…), puis « Lire les règles du dépôt ». Touchez **« Lire les règles du dépôt (lecture seule) »**.
   *Vous voyez :* « Règles lues : N retenue(s), M ignorée(s) » (Recettes) ou « ce dépôt n'a ni CLAUDE.md ni AGENTS.md » (Sport). *Sinon (« Règles non lues ») :* notez le message exact + capture ; c'est le premier vrai essai de lecture GitHub.
8. Touchez **« Préparer la mission (figer le texte) »**. *Vous voyez :* « Texte figé » et le bouton « Copier le texte exact ». *Si un message dit qu'il manque l'objectif ou le critère « terminé » :* complétez le champ, enregistrez, recommencez.

## C. Copier et relire
9. **(3) Touchez « Copier le texte exact ».** *Vous voyez :* « Texte copié. Le statut est « Copiée » ».
10. **(4) Ouvrez une note du téléphone et collez.** Vérifiez : le texte est **complet** (de « # Mission pour Claude Code » jusqu'à « Provenance »), **lisible** (pas de caractères bizarres), et il contient bien les sections Objectif, Périmètre, Interdits, Fichiers, Tests exacts, Preuves, Critère « terminé », Règles du dépôt visé. **Répondez OK / pas OK**, et dites ce qui manque ou gêne.
11. **Qualité (le vrai critère du lot).** Donnez ce texte à Claude Code **tel quel**. Notez : Claude Code a-t-il posé des **questions de clarification** ? Combien ? Lesquelles ? (« aucune » est la réponse cherchée.)

## D. Registre et verdict
12. Dans la mission : « Registre : qui a fait le travail ? » — choisissez l'IA utilisée (ex. Sonnet), écrivez pourquoi, entrez le numéro de la PR si elle existe, touchez « Enregistrer dans le registre ». *Vous voyez :* « Registre enregistré ». Laissez les jetons vides si vous ne les connaissez pas : « Consommation : inconnue » est normal.
13. **(5) Verdict en un clic.** Sans PR : touchez « Lire la PR » (grisé tant qu'aucun numéro n'est saisi). Avec une PR : touchez « Lire la PR #… » : *vous voyez* le lien, l'état des tests GitHub et la revue d'Atelier **du dernier commit seulement**. Touchez **« À refaire »** (ou « Acceptée » si les tests sont verts). *Vous voyez :* « Verdict actuel : … ». *Si les tests ne sont pas verts, « Acceptée » demande d'écrire pourquoi : c'est voulu.*
14. Les boutons et cases se touchent-ils facilement, sans zoomer ? (OK / pas OK)

## E. Après avoir répondu
Envoyez vos réponses (numéros + OK / pas OK), les captures, et le nombre de questions posées par Claude Code (étape 11). Claude écrira alors le résultat dans le rapport. **Ne rien marquer « validé sur téléphone » avant ce retour.**
