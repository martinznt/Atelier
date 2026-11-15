# Importer un historique (ChatGPT, Claude) dans Atelier

Version du 13 novembre 2026, mission P0 (PR #40, branche `fix/import-p0-integrite`, base `1e27b01e0c8def013ed63e63ae2f8c076a8b7806`).

> **État de vérification : tout ce qui est décrit ici a été testé uniquement sur des archives synthétiques fabriquées par les tests.** Rien n'a été essayé avec la véritable archive (≈ 97,55 Mo, filtrée depuis le 1er septembre 2026), ni sur le Samsung Galaxy A05s, ni avec un fournisseur réel. La PR #40 n'est pas fusionnée et la migration 0022 n'est pas appliquée en production. Voir la section « Ce qui est vérifié, et ce qui ne l'est pas ».

## Ne pas confondre trois choses

| Niveau | Ce que c'est | Ce que cela prouve |
|---|---|---|
| **1. Inventaire** | Atelier lit l'archive et enregistre un manifeste (conversations, structure des nœuds, fichiers, annexes) | Que l'archive a été **lue et décrite**. **Pas** que les messages sont importés. |
| **2. Import des messages** | Étape séparée, par conversation, que vous confirmez (« Aperçu de l'import » puis « Confirmer et importer ») | Que le **texte** de ces conversations est dans la mémoire d'Atelier, dans la limite du quota de 50 Mo. |
| **3. Mémoire structurée** | Décisions, tâches, notes… créées par vous | Rien sur l'archive. Elle ne remplace jamais la source. |

**Un inventaire « complet » ne signifie jamais que tous les messages ont été importés.** Le rapport d'intégrité les compte à part : tant que des conversations ne sont pas importées, elles apparaissent dans « Non importé dans la mémoire ».

## Principe

L'archive reste sur votre appareil. Atelier lit sa table des matières, puis une entrée à la fois, par petits morceaux (lecture par tranches de 64 Kio, empreinte SHA-256 incrémentale). Il enregistre : l'empreinte de l'archive, le manifeste des conversations, la structure des nœuds, l'index des fichiers (nom, taille, type réel, empreinte), les annexes (voir plus bas) et, si vous le demandez, les messages texte des conversations choisies. Les originaux ne sont ni modifiés ni supprimés.

## Fichiers de conversations reconnus

Un fichier est un segment de conversations seulement si **trois conditions** sont réunies (`server/archive-entries.ts`) :

1. **Nom** : `conversations.json`, `conversations_1.json`, `conversations_2.json`, `conversations-1.json`, `conversations-000.json` (1 à 6 chiffres, séparateur `-` ou `_`), `conversations_filtrees.json` ou `conversations_filtered.json` (insensible à la casse).
2. **Emplacement** : à la racine ou au plus un dossier de profondeur. Tout ce qui se trouve sous `sites/`, `pieces_jointes/` ou `bibliotheque_non_rattachee/` est une ressource, jamais un segment (donc `sites/conversations.json` n'est pas pris pour une conversation). Un nom de dossier (terminé par `/`) n'est jamais un segment.
3. **Structure** : le contenu JSON est lu et validé : liste de conversations, `{conversations:[…]}`, ou une seule conversation ; un cas ambigu est refusé. Chaque conversation doit avoir un identifiant et une structure exploitable (ChatGPT : `mapping` ; Claude : `chat_messages`).

Un fichier qui porte le bon nom mais dont la structure est invalide **n'est pas ignoré** : il est enregistré avec un motif (`invalid_structure`, JSON illisible, trop volumineux, imbrication JSON trop profonde — limite 100 niveaux). Une conversation individuelle invalide est comptée dans « invalides » et reste dans votre archive. Si aucune conversation valide n'est trouvée, rien n'est enregistré et le message l'explique.

La relecture des messages (étape 2) applique **la même règle de structure** que l'inventaire : tableau direct, clé `conversations`, ou une unique liste sous une clé personnalisée (signalée « enveloppe non vérifiée »). Si le fichier contient plusieurs listes, rien n'est choisi et l'import est refusé ; si une conversation demandée est introuvable dans le fichier, **tout l'import est refusé** avec les identifiants manquants (aucun résultat partiel), et l'empreinte du fichier doit être identique à celle de l'inventaire.

Le premier segment valide fixe le fournisseur (ChatGPT ou Claude) ; un segment d'un autre format est signalé, pas importé.

## Ce que l'inventaire conserve d'une conversation

Par conversation : identifiant, titre, dates de création et de mise à jour, rang d'origine dans le fichier, fichier d'origine, résumé de structure (racines, parents manquants, cycles, points de branche, nœud courant valide ou non) et quelques réglages scalaires courts (par exemple le modèle par défaut). Les clés non conservées sont **nommées** (`unstored_keys`).

Par **nœud** (table `export_nodes`, une ligne par nœud, y compris les nœuds sans message) : identifiant du nœud, parent, enfants **dans l'ordre**, rôle, type de contenu, date, **indicateur « contient du texte »**, nombre de caractères du texte, nombre de pièces jointes référencées, et un petit ensemble de métadonnées d'une liste autorisée. Les branches (plusieurs enfants) et le nœud courant sont donc conservés.

**Le texte des messages n'est pas stocké dans ces nœuds** : seulement l'indicateur de présence de texte et sa longueur. Le texte arrive dans Atelier uniquement par l'étape 2 (import des messages, par conversation), qui garde les nœuds texte, trie par date, découpe les très longs messages en parties de 12 000 caractères et ne garde que du texte (les parties non texte sont comptées, pas importées). Les champs d'origine absents de la liste autorisée ne sont pas conservés : ils sont **comptés** (`dropped_fields`) et affichés dans « Champs non conservés ».

## Quota de texte de 50 Mo

Le texte importé est limité à **50 Mo par compte** (déclencheur de base de données `storage_limit`, migration 0002). Conséquences :

- un lot d'import de messages qui dépasserait le quota est **refusé en entier** (le lot est atomique) : rien n'est écrit pour ce lot, et ce qui était déjà importé reste ;
- l'historique complet peut donc ne pas tenir ; les messages non importés restent dans votre archive d'origine, qui est la seule copie complète ;
- l'inventaire (conversations, nœuds, fichiers) n'entre pas dans ce quota de texte et peut être complet alors que l'import des messages ne l'est pas.

Aucune solution de stockage supplémentaire n'a été mise en place (le stockage objet R2 est refusé). C'est une limite connue, pas un problème résolu.

## Fichiers de l'archive : jamais copiés

Les fichiers de `sites/`, `pieces_jointes/` et `bibliotheque_non_rattachee/` sont indexés **séparément** (compte, empreinte, type réel lu dans le contenu, y compris pour les fichiers sans extension ou `.dat`). **Leur contenu binaire n'est jamais copié dans Atelier** : seuls le nom, la taille, le type et l'empreinte sont conservés. L'original reste dans votre archive ; si vous la perdez, Atelier ne peut pas restituer ces fichiers. Un nom de fichier dangereux (`..`, chemin absolu) est indexé et signalé, mais ne peut jamais être la cible d'un lien.

Pièces jointes citées dans les conversations — trois états distincts : **présente dans l'archive** (un fichier correspond : par identifiant dans le nom, ou par la correspondance déclarée si le fichier cible existe), **ambiguë** (plusieurs fichiers possibles, rien n'est choisi), **référencée seulement** (aucun fichier). Les pièces jointes d'un export Claude (nom, type) sont référencées ; leur texte extrait n'est pas importé. Aucun fichier n'est rattaché à une conversation par supposition.

## Annexes

Fichiers reconnus (à la racine ou dans un seul dossier, comme les segments) : `correspondance_fichiers.json`, `inventaire_complet.json`, `verification.json`, `EXCLUSIONS_IMAGES.json`, `LISEZMOI_ALLEGE.txt`. Au plus 12 annexes par archive.

- Le texte est conservé s'il fait **1 Mo ou moins** et est du texte valide ; au-delà, seuls le nom, la taille et l'empreinte sont gardés (statut « trop volumineuse »). Le serveur vérifie que l'empreinte correspond au texte reçu.
- Lecture **tolérante** : aucun schéma n'a été inventé, car les vrais formats n'ont pas été vus. Une annexe JSON illisible est conservée comme telle ; une forme non reconnue est signalée « forme non reconnue » et ne produit **aucun lien**.
- `correspondance_fichiers.json` : deux formes sont comprises (dictionnaire identifiant → chemin, ou liste d'enregistrements avec un identifiant et un chemin). Un lien n'est créé que si le fichier cible **existe** dans l'archive indexée ; sinon la ligne reste « chemin déclaré mais absent ». Un chemin déclaré n'est accepté que s'il est **relatif et sûr** (`./` initial toléré) : les chemins absolus Unix ou Windows (`/…`, `C:/…`), les segments `..`, les séparateurs `\\` ou les caractères de contrôle sont **rejetés tels quels**, comptés (« chemins dangereux ») et ne produisent aucun lien ; ils ne sont jamais « réparés » en chemin relatif.
- `verification.json` / `inventaire_complet.json` : on en tire des chiffres « annoncés » (conversations, messages, nœuds) par **heuristique sur les noms de clés**, comparés aux chiffres enregistrés. Résultat « concordant », « écart » ou « non annoncé » : c'est un indice **à vérifier**, pas une preuve.
- Les annexes ne sont pas exécutées ni interprétées au-delà de cela. Leur texte n'est pas inclus dans l'export du compte.

## Rapport d'intégrité

`/api/exports/:id/integrity` et le panneau « Intégrité de l'import » (Mémoire → Export). Chiffres relus sur le serveur, jamais estimés à l'écran : fichiers de conversations détectés / enregistrés, conversations, nœuds (avec et sans texte), pièces jointes, groupes de fichiers, annexes, comparaison annoncé / enregistré, champs non conservés. Les manques sont classés : **absent de l'archive**, **invalide**, **non importé**, **écart**. Statut d'inventaire : complet, incomplet, incohérent ou aucun segment — toujours à lire comme un statut d'**inventaire**, pas d'import.

## Pas à pas

1. **Mémoire → Export → Choisir le fichier.** Barre de progression et bouton « Annuler ». L'écran doit rester ouvert : l'opération ne continue pas en arrière-plan.
2. **Bilan chiffré et périodes** : dates réelles, conversations par mois, doublons. Atelier ne filtre rien : il montre ce que l'export contient.
3. **Intégrité de l'import** puis **Fichiers de conversations** (statut et motif de chaque fichier) et « Indexer les fichiers » (empreinte et type réel).
4. **Conversations et lots** : cochez, confirmez le projet, « Aperçu de l'import », puis « Confirmer et importer ». Un message importé garde son identifiant, sa date et son auteur d'origine ; réimporter ne crée pas de doublon.
5. La recherche (loupe) retrouve ensuite le message exact (les jokers `%` et `_` sont traités comme des caractères ordinaires).

## Reprise après interruption : fonctionnement exact

- **Rechoisissez la même archive** (même empreinte) : l'archive est reconnue, aucune seconde fiche n'est créée, même si plusieurs lancements ont lieu en même temps.
- Un segment déjà « inventorié » avec la **même empreinte** est sauté. Un segment interrompu est refait en entier : l'enregistrement des conversations et des nœuds est idempotent (aucun doublon), donc le refaire est sans danger.
- Un segment n'est déclaré « inventorié » **qu'après** que le serveur a recompté ce qu'il a réellement enregistré (conversations et nœuds). Si le compte ne correspond pas, la réponse est un refus (409) et le segment reste non terminé.
- Un segment de **même nom mais d'empreinte différente** est refusé : ce n'est pas le même export.
- L'indexation des fichiers saute ceux déjà traités. Les annexes sont renvoyées : une annexe de même nom mais de contenu différent est refusée.
- Ce qui est déjà correctement enregistré n'est jamais supprimé par une erreur ultérieure.
- Si la page est rechargée, le suivi vient du serveur ; il faut simplement rechoisir le fichier pour continuer. **Non géré** : un onglet tué par le téléphone en pleine lecture oblige à relancer ; il n'y a pas de reprise « au milieu d'un segment », et l'interface ne bloque pas un second lancement par un autre onglet (le serveur évite seulement les doublons).

## Protections et limites

Archive malformée, tronquée, chiffrée, à taille annoncée fausse ou à taux de compression suspect : refusée ou signalée, jamais exécutée. Limites du lecteur : 200 000 entrées, table des matières de 96 Mo, **160 Mo par entrée** (au-delà : « trop volumineux », à extraire sur ordinateur ; le reste de l'archive reste importable). Côté serveur : 600 nœuds par requête, 1 000 000 de nœuds par archive, 12 annexes, 1 Mo de texte par annexe. Le client envoie les conversations par 200 et les nœuds par 500 au plus. Ces valeurs n'ont **pas** été validées sur le Galaxy A05s : un segment de plusieurs dizaines de Mo peut saturer la mémoire d'un téléphone modeste.

## Migration 0022 (obligatoire)

`migrations/0022_import_integrity.sql` est **additive** : colonnes ajoutées aux tables d'export existantes, et nouvelles tables `export_nodes`, `export_annexes`, `export_links`. Elle est **créée mais non appliquée en production**. Tant qu'elle ne l'est pas, `/api/health` signale `0022` manquante (la vérification contrôle **toutes** les tables créées — `export_nodes`, `export_annexes`, `export_links` — et **toutes** les colonnes ajoutées ; un état partiellement migré est donc déclaré manquant, jamais appliqué), et le nouvel inventaire (nœuds, annexes, rapport d'intégrité) ne peut pas fonctionner. Elle ne supprime ni ne renomme rien.

## Limites de l'export du compte

`/api/account/export` ne restitue **pas** l'intégralité de ce que l'import a produit, et il le déclare dans `import_scope.not_included` :

- la **structure des nœuds** (`export_nodes`) n'est **pas incluse** (le nombre de lignes est indiqué) : il n'existe donc **aucune restauration intégrale** de cette structure à partir de l'export du compte ; la seule source complète reste votre archive ;
- le **texte des annexes** n'est pas inclus (seulement leurs métadonnées) ;
- le **contenu des fichiers** de l'archive n'est jamais copié, donc jamais exporté.

L'export intégré refuse (413) un compte qui dépasse 20 000 lignes sur certaines tables ou 10 000 lignes de messages importés ; il faut alors passer par la procédure d'export par projet. Un export de compte ne doit donc pas être présenté comme une sauvegarde complète de l'historique.

## Ce qui est vérifié, et ce qui ne l'est pas

### A. Testé sur archives synthétiques (tests automatisés, 13 novembre 2026)
Résultats : `npx vitest run` 97/97 (dont 13 tests « import P0 ») ; `node --experimental-strip-types --test tests/*.test.mjs` 323/323 ; `tsc` sans erreur ; build à blanc réussi.
- Détection de `conversations_filtrees.json` et des variantes, faux positifs (`sites/…`), archives vides, tronquées, imbrication excessive, mauvais schéma, mélange valide/invalide.
- Conservation des nœuds, parents, enfants dans l'ordre, branches, nœud courant, dates, références de fichiers, champs non conservés comptés.
- Annexes (formes, JSON illisible, trop volumineuse, empreinte fausse), correspondance vérifiée contre l'archive, noms dangereux jamais liés, groupes de fichiers.
- Reprise après coupure du réseau simulée à six moments (mêmes totaux qu'un import sans coupure, sans doublon), trois imports simultanés, refus d'un segment non persisté, atomicité d'un lot de base de données.
- Fichier d'environ 3 Mo (≈ 9 000 nœuds, deux segments), séparation entre comptes, jokers `%` et `_`, contenu de l'export du compte.

### B. NON vérifié sur l'archive réelle
Formes réelles de `correspondance_fichiers.json`, `inventaire_complet.json`, `verification.json` et `EXCLUSIONS_IMAGES.json` ; les chiffres attendus (137 conversations, 6 508 messages, 6 723 nœuds, 16 / 109 / 46 fichiers par dossier, 169 images exclues, 42 références manquantes, 49 fichiers de bibliothèque absents) ; la fiabilité de la comparaison annoncé / enregistré ; la tenue du quota de 50 Mo sur ce volume ; le coût réel en lectures de base de données.

### C. NON vérifié sur Samsung Galaxy A05s
Mémoire et durée sur un segment volumineux, comportement si le téléphone tue l'onglet, lisibilité du panneau d'intégrité sur petit écran, reprise après coupure réelle du réseau mobile. Aucune mesure sur téléphone n'existe ; les mesures ci-dessous viennent d'un ordinateur de développement.

### D. Nécessite la migration 0022
Tout l'inventaire de structure (nœuds, source des conversations), les annexes, les liens de correspondance, les groupes de fichiers, le rapport d'intégrité et le panneau associé, la preuve de persistance par segment. Le nouveau code d'import écrit dans les nouvelles colonnes dès l'enregistrement des conversations : **sans la migration, tout l'import d'archive est à considérer comme inutilisable**, pas seulement ses nouveautés. Cette dépendance n'a pas été éprouvée sur une base de production ; elle découle du code (colonnes `source_index` et `meta` écrites avec chaque conversation).

### Autres non vérifiés
Pannes de base de données ou de Worker injectées côté serveur en plein traitement (seules des coupures côté client et l'atomicité d'un lot ont été testées) ; appels réels à Gemini, Groq, Mistral ou GitHub.

## Mesures (ordinateur de développement, pas un téléphone)

Archive synthétique de 96 Mo (1 200 conversations, 12 000 messages), mesurée avant la mission P0 : inventaire en 1,4 à 1,9 s, indexation de 96 Mo de fichiers en 1,3 s, mémoire du processus navigateur 452 → 532 Mo. Recherche sur 150 000 messages : environ 100 ms en local. **Sur D1 en production**, chaque recherche lit toutes les lignes parcourues : à mesurer avant de charger un très gros historique. Ces mesures n'ont pas été refaites avec l'enregistrement des nœuds.

## Essai recommandé avec la vraie archive

Mémoire → Export, choisir l'archive filtrée, attendre la fin de l'inventaire, ouvrir « Intégrité de l'import » et comparer avec vos chiffres. Tout écart doit apparaître dans « Manques et anomalies ». Importer ensuite les messages par lots et vérifier le quota. Rapport complet : `docs/audits/RAPPORT_P0_IMPORT_2026-11-13.md`.
