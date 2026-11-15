# Quelle information vit où (lot 1 — décision D5 = C)

**Règle d'or : un fait = une seule source de vérité.** Toute copie est marquée « copie », avec sa date et son commit.
Le code de référence est `server/info-placement.ts` (testé par `tests/info-placement.test.mjs`).

| Information | Elle vit dans | Pourquoi | Atelier en garde… |
|---|---|---|---|
| Cahiers des charges | **Git** (Memoire-Projets) | rédigé, durable, relisible sans Atelier | une **copie** en lecture seule (commit + date) |
| Décisions **validées** (registre) | **Git** | durable, source de la méthode | une copie en lecture seule |
| Texte des prompts | **Git** | rédigé, versionné | une copie en lecture seule |
| Synthèses d'exports, méthode, sources | **Git** | rédigé, durable | une copie en lecture seule |
| Tâches et leurs états | **Atelier** (D1) | vivant, change tous les jours | l'original |
| Fonctionnalités et leur état | **Atelier** | vivant | l'original |
| Brouillons de décisions (proposées, hypothèses) | **Atelier** | en attente de la validation de Martin | l'original |
| Conversations importées | **Atelier** | volumineuses, cherchées souvent | l'original |
| Relevés (quotas, suivi GitHub), liens | **Atelier** | vivants, datés | l'original |
| États, fiabilité, historique des changements | **Atelier** | propres à Atelier | l'original |

## Recherche unique
La loupe cherche **devant les deux** : chaque résultat dit « Source : Atelier » ou « Source : Git », et un résultat Git
dit « Copie du dépôt … · commit … · lue le … ». L'index est **reconstructible** : il s'agit de `memory_docs` (re-lu depuis
Git à chaque synchronisation) et des tables d'Atelier ; rien n'est stocké en double ailleurs.

## Écriture dans Git : jamais maintenant
Atelier lit Git en lecture seule (`GIT_WRITE_ALLOWED = false`). Une écriture exigera plus tard une validation écrite de Martin.

## Limites (honnêtes)
- Le statut écrit **dans** un document Git (CONFIRMÉE, PROVISOIRE…) n'est **pas interprété** par la recherche : seule la table
  `docs/CORRESPONDANCE_STATUTS.md` le traduit, et son branchement automatique est prévu au lot 5A.
- Une décision « validée » peut exister à la fois dans Git (registre) et dans Atelier : ce n'est pas encore détecté
  automatiquement ; la règle d'or demande que la copie soit marquée comme telle (lot 5A).
