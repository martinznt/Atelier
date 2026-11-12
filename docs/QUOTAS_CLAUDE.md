# Travailler avec Claude sans gaspiller les quotas

Version du 12 novembre 2026. Stratégie demandée par Martin ; ce document dit aussi ce qu’Atelier **ne peut pas** savoir.

## 1. Ce qui est mesurable, et par qui

| Information | Qui la connaît réellement | Atelier |
|---|---|---|
| Pourcentage utilisé des fenêtres de 5 heures et de 7 jours, heure de réinitialisation | Claude Code : écran `/usage` et champ `rate_limits` du JSON de la ligne d’état | **Ne la mesure pas.** Vous la recopiez ou vous collez le JSON |
| Coût estimé et jetons d’une session | Claude Code : bloc « Session » de `/usage` (estimation au prix catalogue, pas une facture) | Saisie par vous dans un retour de travail |
| Limite par modèle (Opus, Sonnet…) | Messages et écran de Claude | Saisie par vous |
| Quota **restant** d’un abonnement, lu par une application tierce | Aucune interface officielle | **Impossible** : jamais affiché |
| Jetons des appels faits par Atelier à l’API (revues) | Réponses de l’API | Déjà enregistrés dans `ai_usage` (migration 0013) |

Sources officielles consultées le 12 novembre 2026 : [coûts et `/usage`](https://code.claude.com/docs/en/costs), [ligne d’état](https://code.claude.com/docs/en/statusline), [suivi OpenTelemetry](https://code.claude.com/docs/en/monitoring-usage), [modèle et effort](https://code.claude.com/docs/en/model-config).

Non retenu : l’export OpenTelemetry (il faut un serveur collecteur, et il ne donne pas le quota restant) ; l’API d’administration d’Anthropic (réservée aux comptes API facturés, pas à un abonnement) ; toute lecture de cookie, de session ou de fichier privé de Claude.

## 2. Quel modèle

| Cas | Modèle | Effort |
|---|---|---|
| Vérification mécanique | aucun : test automatisé | — |
| Classement, extraction simple, faible enjeu | Haiku (sinon Sonnet) | faible |
| Développement, correction, documentation, analyse ordinaire | Sonnet 5.5 | moyen ; élevé si complexe ; faible si simple |
| Relecture indépendante d’un travail important, audit, architecture complexe | Opus | moyen à élevé |
| Blocage réel après analyse de l’échec, architecture très difficile | Fable 5.2 | élevé |

Un échec non analysé ne fait jamais monter en gamme. Ces règles sont dans `server/claude-advisor.ts` ; c’est votre stratégie, pas une mesure des modèles.

## 3. Dans Atelier

- **Plus → Claude → Quel modèle** : conseil immédiat, avec la raison, le risque de coût et les économies possibles.
- **Pilotage → une tâche → Consigne de développement** : type, complexité, importance, contraintes, fichiers interdits, déjà vérifié, difficultés. La consigne préparée reprend tout cela, le modèle conseillé, le dernier retour de travail et le dernier point de reprise.
- **Claude → Quotas** : relevés saisis, périmés signalés, alertes, répartition par modèle, travaux coûteux.
- **Claude → Reprise** : point de reprise à copier dans une session neuve.
- **Claude → Retours** : collez la réponse de Claude Code ; elle est classée par rubrique.

## 4. Gestes qui économisent le plus (documentation officielle)

1. `/clear` entre deux tâches sans rapport ; un long historique est renvoyé à chaque message.
2. Point de reprise puis session neuve, plutôt qu’une session de plusieurs jours.
3. Demandes précises avec les fichiers nommés.
4. Sonnet par défaut ; pas d’effort maximal par habitude.
5. Pas de sous-agents sans besoin : chacun a son propre contexte.
6. `CLAUDE.md` court : il est chargé à chaque session.

## 5. Relever ses quotas

Dans Claude Code : `/usage`. Recopiez les pourcentages et l’heure de réinitialisation dans **Claude → Quotas**. Pour une capture d’écran, l’image reste sur votre appareil : Atelier garde seulement son nom et son empreinte, et ne lit pas l’image (pas de reconnaissance de texte).
