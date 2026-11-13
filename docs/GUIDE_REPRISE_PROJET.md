# Comment utiliser Atelier pour reprendre un projet

1. **Accueil** : lisez la carte du projet. Elle donne l’avancement, ce qui bloque et la prochaine action.
2. **À traiter** : faites d’abord ce qui est marqué bloquant, puis répondez aux questions. Chaque question dit pourquoi elle est posée et ce qui se passe sans réponse.
3. **Pilotage → le projet** :
   - « Synthèse de reprise » : copiez-la pour redonner le contexte à une IA. Elle est assemblée à partir de ce qui est enregistré, sans résumé inventé.
   - « Dossier documentaire » : le cahier des charges, l’architecture, les audits du projet, avec leur fiabilité.
   - Dans une tâche, « Consigne de développement et validation » : remplissez contexte, fichiers, tests, risques, puis « Préparer une consigne pour Claude Code ».
4. **Mémoire → Prompts** : relisez la consigne, « Copier le texte exact », donnez-la vous-même à l’IA, puis confirmez la transmission avec la date réelle. Atelier n’envoie rien à votre place.
5. Quand l’IA a répondu : enregistrez la réponse sur la fiche du prompt, mettez la tâche à « terminée » avec une preuve, puis « Je valide ce résultat » seulement si vous l’avez constaté vous-même.
6. **Discussions** : classez un fil avec « Organiser » ; retrouvez un échange avec la recherche, qui ouvre le message exact.
7. **Audit de référence** (dans Pilotage) : liste tous les fichiers du dépôt à un commit précis. « Intégral » n’apparaît que si tout le code est marqué lu intégralement.

Ce qu’Atelier ne fait pas : écrire du code, fusionner, décider à votre place, envoyer un prompt tout seul.

## Retrouver, importer, réfléchir (13 novembre 2026)

- **Retrouver** : la loupe de l'en-tête cherche partout (chat, historique importé, décisions, tâches, prompts, documents, fichiers, pièces jointes, questions). Les filtres sont repliés sous « Filtres ». Un message de l'historique importé s'ouvre dans son contexte.
- **Importer un export ChatGPT** : Mémoire → Export ChatGPT → choisir le ZIP (même découpé en plusieurs fichiers). Gardez l'écran ouvert ; vous pouvez annuler et reprendre. Puis « Bilan chiffré » pour vérifier les dates, « Archive » pour indexer les pièces jointes, « Conversations et lots » pour choisir le projet, voir l'aperçu et importer. Détail : `docs/IMPORT_HISTORIQUE.md`.
- **Réfléchir** : Discussions → « Contexte utile pour réfléchir ». Décrivez le sujet : Atelier liste ce que le projet sait déjà (décisions confirmées, propositions, anciennes discussions) avec la fiabilité de chaque ligne ; vous copiez ce que vous voulez avec ses sources. Aucune IA n'est consultée.
