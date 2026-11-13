# Analyse de l’historique par les IA déjà connectées

Version du 12 novembre 2026. Objectif : exploiter Gemini, Groq et Mistral pour la migration de l’historique, et ne pas consommer Claude.

## Ce qui a été vérifié, et ce qui ne l’a pas été

- **Vérifié dans le code d’Atelier** : le relais entre fournisseurs, la mémorisation des limites renvoyées par les API (code 429, délai de reprise, en-têtes), le suivi des appels par fournisseur (`ai_usage`) et la liste des modèles lue chez chaque fournisseur lors du test d’une connexion existaient déjà. L’analyse les réutilise.
- **Non vérifié** : la documentation officielle de Gemini, Groq et Mistral n’est pas joignable depuis l’environnement de développement (hôtes non autorisés), et aucune clé n’y est disponible. Les modèles réellement disponibles, leurs tailles de contexte, leurs sorties structurées natives, leurs quotas gratuits et leurs interfaces de traitement par lots **n’ont donc pas été inventoriés ni testés**.
- Conséquences de conception, pour ne dépendre d’aucune capacité non vérifiée :
  - unités courtes (9 000 caractères au plus), donc compatibles avec un petit contexte ;
  - JSON demandé dans la consigne et **validé localement** ; aucune dépendance à un mode « sortie structurée » ;
  - traitement par lots fait par Atelier (une unité par appel), pas par l’interface de lots d’un fournisseur ;
  - quotas : seuls ceux que le fournisseur renvoie sont affichés.

## Répartition du travail

| Étape | Qui |
|---|---|
| Inventaire, empreintes, découpage, cache, contrôle des sources et des citations, comparaison des deux lectures | Atelier, sans IA |
| Première lecture d’une unité courte | Groq d’abord, puis Mistral, puis Gemini |
| Première lecture d’une unité ordinaire | Mistral, puis Groq, puis Gemini |
| Unité longue ou conversation en six parties et plus | Gemini, puis Mistral, puis Groq |
| Seconde lecture des éléments sensibles (décision, refus, condition, correction) | un **autre** fournisseur que la première |
| Claude, Claude Code, fournisseurs facturés | jamais utilisés par cette analyse |

L’ordre est une préférence : si le premier est en limite, le suivant prend le relais.

## Garanties

- Rien n’est envoyé sans votre accord, donné export par export.
- Une unité déjà analysée n’est jamais renvoyée (empreinte du contenu et de la consigne).
- Chaque réponse brute est conservée, même inexploitable. Après trois réponses inexploitables, l’unité est « en échec » et peut être reprise ; le texte d’origine n’est jamais supprimé.
- Limite atteinte partout : pause, avec l’heure donnée par le fournisseur quand elle existe.
- Un élément sans message source réel est écarté et compté. Une « décision » qui ne cite que l’assistant devient « proposition d’un assistant ». Une citation introuvable est signalée.
- Deux IA d’accord : « indice, pas une preuve ». Rien ne devient une décision sans vous.

## Utilisation

Mémoire → Export ChatGPT → l’export → « Analyse par vos IA » : donner l’accord, « Préparer les unités », « Lancer l’analyse ». L’écran doit rester ouvert : l’analyse avance unité par unité et s’arrête proprement si vous le fermez.

## Limites

- Pas d’exécution en arrière-plan : l’analyse n’avance que lorsque l’écran est ouvert.
- Le rapprochement avec le dépôt GitHub (souhait → code → test → mise en ligne) n’est pas automatisé : il reste à faire à la main avec l’audit de référence.
- Un message de plus de 8 600 caractères est abrégé pour l’analyse ; l’unité est marquée et comptée.
- Testé seulement avec des réponses simulées des trois fournisseurs.
