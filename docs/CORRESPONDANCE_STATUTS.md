# Correspondance des statuts (lot 1 — décisions D6 et D3)

Deux axes séparés. L'**état** dit si l'information s'applique ; la **fiabilité** dit ce qu'on sait de sa vérité.
Code : `server/lifecycle-core.ts` (testé par `tests/lifecycle-core.test.mjs`). **Rien n'est supprimé** : on change d'état,
avec date, raison, source et auteur (table `lifecycle_events`).

## 1. États (D6)
`proposée → actuelle (validée par Martin) → remplacée (lien vers la remplaçante) ou abandonnée (sans remplaçante)`,
plus `rejetée` et `hypothèse / à vérifier`.

| De \ Vers | proposée | actuelle | remplacée | abandonnée | rejetée | hypothèse |
|---|---|---|---|---|---|---|
| proposée | — | oui* | non | oui | oui | oui |
| hypothèse | oui | oui* | non | oui | oui | — |
| actuelle | non | — | oui (+ remplaçante) | oui | non | oui |
| remplacée | non | non | — | non | non | non |
| abandonnée | oui | non | non | — | non | non |
| rejetée | oui | non | non | non | — | non |

\* exige la **validation de Martin** (case « Je valide ») ; une IA ne peut jamais valider : une proposition d'IA n'est jamais une décision.
La recherche et le contexte envoyé aux IA ne montrent que l'état **actuelle** par défaut ; le reste s'obtient avec « Tout afficher ».

## 2. Fiabilité (D3) — un seul composant d'affichage (pastille + mot)
| Niveau | Condition |
|---|---|
| ✔ **Vérifié** | une **source précise** (lien, fichier, test, commit) **ET** la case « adapté à ma demande » cochée par Martin (ou un test réussi pour du code, avec sa source). Sinon : refusé, l'élément reste « Rapporté ». |
| ✔ **Confirmé par vous** | Martin l'a décidé ou constaté (case « Je confirme ») |
| ◐ **Rapporté** | source tierce non reproduite |
| ? **Hypothèse** | déduit ou proposé par une IA ; le contenu d'une IA reste « Hypothèse » jusqu'à relecture |
| ⛔ **Obsolète ou rejeté** | se **déduit** d'un état remplacé, abandonné ou rejeté ; jamais saisi |

## 3. Anciens vocabulaires → nouveau modèle (lecture sans perte, aucune ligne réécrite)
Une information sans ligne `item_lifecycle` prend l'état déduit ci-dessous ; la première modification écrit la ligne.

**Décisions** (`project_decisions.status`)
| Ancien | État | Fiabilité |
|---|---|---|
| validated | actuelle | Confirmé par vous |
| proposed | proposée | Hypothèse |
| rejected | rejetée | (obsolète/rejeté) |
| superseded | remplacée | (obsolète/rejeté) |

Miroir inverse (pour que les anciens écrans et les prompts restent justes) : actuelle→validated ; remplacée **et abandonnée**→superseded ; rejetée→rejected ; proposée et hypothèse→proposed.

**Documents** (`project_documents.reliability`)
| Ancien | État | Fiabilité | Remarque |
|---|---|---|---|
| user_confirmed | actuelle | Confirmé par vous | |
| verified | actuelle | **Rapporté** | l'ancienne case ne gardait ni source précise ni contrôle « adapté à ma demande » : dégradée par prudence, à re-vérifier |
| reported, unverified | actuelle | Rapporté | |
| deduced, to_confirm | hypothèse | Hypothèse | |
| ai_proposed | proposée | Hypothèse | |
| superseded | remplacée | (obsolète) | |

**Notes de mémoire** (`memory.source`) : source commençant par « Saisie » → actuelle / Confirmé par vous ; toute autre origine → proposée / Hypothèse.
La colonne `memory.supersedes` n'a jamais été utilisée : elle reste intacte.

**Memoire-Projets** (texte des documents Git ; vocabulaire lu dans `00_PILOTAGE/REGISTRE_DECISIONS.md` et `08_DECISIONS_ET_EVOLUTION/README.md`)
| Statut Git | État | Fiabilité |
|---|---|---|
| CONFIRMÉE, ACTUELLE | actuelle | Confirmé par vous |
| PROVISOIRE, À CONFIRMER, HYPOTHÈSE | hypothèse | Hypothèse |
| PROPOSÉE | proposée | Hypothèse |
| REMPLACÉE | remplacée | (obsolète) |
| REJETÉE | rejetée | (obsolète) |
| ABANDONNÉE | abandonnée | (obsolète) |
| FAIT VÉRIFIÉ | actuelle | **Rapporté** (jamais « Vérifié » tant que Martin n'a pas fourni source + contrôle dans Atelier) |
Un statut inconnu renvoie « aucune correspondance » : rien n'est deviné. Cette table est codée (`fromMemoireProjets`) et testée, mais **pas encore branchée** à la lecture des documents Git (lot 5A).

## 4. Autres usages du mot « vérifié » (renommés)
Dépôt : « vérifié » → « existe chez GitHub (contrôlé le … ) » / « pas encore contrôlé chez GitHub ». Les « tâches vérifiées » (terminées avec preuve) gardent leur sens propre et leur nom.
