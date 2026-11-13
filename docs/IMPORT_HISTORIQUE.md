# Importer un historique (ChatGPT, Claude) dans Atelier

Version du 13 novembre 2026. Tout ce qui est décrit ici a été testé en local ; **rien n'a été essayé avec votre véritable export** (il n'était pas disponible), ni sur votre téléphone.

## Principe

L'archive reste sur votre appareil. Atelier lit sa table des matières, puis une entrée à la fois, par petits morceaux. Il n'enregistre que : l'empreinte SHA-256 de l'archive, le manifeste des conversations (identifiants, dates, nombres), l'index des fichiers (nom, taille, type réel, empreinte) et, si vous le demandez, les messages texte des conversations choisies. Les originaux ne sont ni envoyés, ni modifiés, ni supprimés.

Trois couches : 1) sources originales (votre archive) ; 2) index (conversations, messages importés avec identifiant, date, auteur, branche d'origine) ; 3) mémoire structurée (décisions, tâches… créées par vous). La troisième ne remplace jamais la première.

## Formats reconnus

`conversations.json` ou segments `conversations-000.json`, `conversations-001.json`… (dans un ZIP ou un fichier JSON seul) ; export ChatGPT (`mapping`, branches conservées) ; export Claude (`chat_messages`). Les autres fichiers de l'archive sont indexés comme « fichiers ». Un fichier d'un format différent du premier segment est signalé, pas importé.

## Pas à pas

1. **Mémoire → Export ChatGPT → Choisir le fichier.** Barre de progression et bouton « Annuler » (reprise possible). L'écran doit rester ouvert : l'opération ne continue pas en arrière-plan.
2. **Bilan chiffré et périodes** : dates réelles (première et dernière conversation, avant/après une date de coupure — 1er septembre par défaut), conversations par mois, doublons, recoupement avec d'autres exports. Atelier ne filtre rien : il montre ce que l'export contient.
3. **Archive : segments et pièces jointes** : liste des segments (statut, nombre), puis « Indexer les fichiers » (calcule l'empreinte et lit le type réel dans le contenu de chaque fichier, y compris les fichiers sans extension ou `.dat`).
4. **Conversations et lots** : cochez, confirmez le projet, « Aperçu de l'import » (nombres, période, embranchements, pièces jointes référencées), puis « Confirmer et importer ». Un message importé garde son identifiant, sa date et son auteur d'origine ; réimporter ne crée pas de doublon.
5. La recherche (loupe) retrouve ensuite le message exact.

## Pièces jointes

Trois états distincts : **présente dans l'archive** (un fichier porte l'identifiant cité — rapprochement par nom, à vérifier), **ambiguë** (plusieurs fichiers possibles, rien n'est choisi), **référencée seulement** (aucun fichier trouvé). Aucun fichier n'est copié dans Atelier. Les pièces jointes d'un export Claude (nom, type) sont référencées ; leur texte extrait n'est **pas** importé.

## Protections et limites

Archive malformée, tronquée, chiffrée, à taille annoncée fausse ou à taux de compression suspect : refusée ou signalée, jamais exécutée. Limites : 200 000 entrées, table des matières de 96 Mo, **160 Mo par fichier de conversations** lu en mémoire (au-delà : « trop volumineux », à extraire sur un ordinateur ; le reste de l'archive reste importable). Ce chiffre n'a pas été validé sur le Galaxy A05s : sur un téléphone modeste, un segment de cette taille peut saturer la mémoire.

## Mesures (machine de développement, pas un téléphone)

Archive de 96 Mo (1 200 conversations, 12 000 messages) : inventaire en 1,4 à 1,9 s, indexation de 96 Mo de fichiers en 1,3 s, mémoire du processus navigateur 452 → 532 Mo. Recherche sur 150 000 messages : environ 100 ms en local. **Sur D1 en production**, chaque recherche lit toutes les lignes parcourues : à mesurer avant de charger un très gros historique.

## Reprise après interruption

Le serveur retient les segments et fichiers déjà traités (nom et empreinte). Rechoisissez la même archive : les segments inventoriés sont sautés. Un segment de même nom mais de contenu différent est refusé (ce n'est pas le même export).
