# Rapport du lot 5B — étapes 5B-2 à 5B-5 (17 novembre 2026)

Niveaux : **V** = prouvé (j'ai lancé l'application et utilisé la fonction ; capture ou trace jointe) ; **R** = rapporté, sans preuve rejouée ; **H** = hypothèse.
**Où j'ai « utilisé en vrai »** : l'application Atelier lancée en local (`wrangler dev`, le même code que la production, base D1 locale) dans un vrai navigateur Chromium, à 360 et 390 px de large, avec souris et vrais événements tactiles. **Pas** sur la production (aucun compte d'essai : les inscriptions y sont fermées, et je ne me connecte pas à votre compte), **pas** sur le Galaxy A05s : tout cela est **NON PROUVÉ**.
Les captures sont dans `docs/audits/preuves/lot5b/` (données d'essai uniquement).

## 0. Avant de commencer — sauvegarde
- **Export SQL indépendant : NON FAIT.** L'API Cloudflare n'était pas joignable d'ici et Martin a choisi de ne pas donner de jeton (décision de Martin, 17 novembre). (V : refus du proxy 403, puis refus du formulaire de jeton)
- **Point de restauration Cloudflare Time Travel** relevé : `2026-11-17T15:52:54Z`. Time Travel est toujours actif, restauration à la minute, 7 jours sur l'offre gratuite (R : documentation officielle https://developers.cloudflare.com/d1/reference/time-travel/ ; la restauration elle-même n'a pas été essayée). Commande, à lancer par Martin seulement : `npx wrangler d1 time-travel restore atelier-db --timestamp=2026-11-17T15:52:54Z` (destructive : elle remplace la base).
- **État de la base relevé avant les migrations** (lecture seule, V) : users 1, projects 5, conversations 5, messages 6, files 14, file_versions 17, file_contents 17, tasks 3, repositories 1, connections 4, project_decisions 1, project_features 1, item_lifecycle 2, lifecycle_events 3, events 17, mockups 0, d1_migrations 25. Après chaque fusion, ces nombres sont relus pour prouver que rien n'a été perdu.
- Le fichier `consignes/lot5b_prompt_claude_code.md` cité par Martin **n'existe dans aucun dépôt accessible** (V : recherche dans Atelier, Livre-de-recettes, Sport, Memoire-Projets et sur la machine). J'ai suivi la consigne complète du lot 5B reçue le 16 novembre (même contenu attendu : H).

## 1. Étape 5B-2 — modifier la maquette (aucune migration)
### Ce qui a été construit
- `POST /api/mockups/:id/ops` : un lot de 12 opérations au plus (ajouter, modifier, supprimer un bloc ; grouper, séparer, déplacer un groupe, supprimer un groupe), **validé en mémoire puis écrit en une transaction**, protégé par le numéro de version de la maquette.
- `GET /api/mockups/palettes`, `PUT /api/mockups/:id/palette` : couleurs **lues dans les dépôts des sites** (script `scripts/build-palettes.mjs`, lecture seule, commit épinglé) : Livre de recettes 22 couleurs (`public/css/app.css`, lignes 39–73, commit 92ec7c5), Sport 14 couleurs (`public/style.css`, lignes 3, 4 et 161, commit f0ef3b0).
- Écran (`web/MockupEditor.tsx`) : choisir un ou plusieurs blocs, **glisser au doigt ou à la souris**, **pavé de flèches** avec pas de 1, 4, 8, 16 ou 32 px, « Placer ce bloc juste sous… », plus large / moins large / plus haut / moins haut, grouper / séparer / supprimer un groupe, déplacer tout le groupe, couleurs de fond et de texte (palette du site, « aucune », ou autre couleur signalée « hors palette »), détails (nom, type, position, taille, fonctionnalité, comportement), supprimer, **Annuler / Rétablir**.
- Après « Fixer l'écran de départ », la capture ne change plus mais les blocs restent modifiables ; la copie de départ reste intacte (c'est la base des écarts de 5B-3).

### Preuves (application lancée en local, Chromium, 360 px)
| Fonction | Ce que j'ai vu | Preuve |
|---|---|---|
| Trois blocs posés sur une vraie capture | cadres numérotés 1, 2, 3 sur la capture | V `5b2-01-trois-blocs-avant.png` |
| Déplacer par boutons | position affichée `24 · 108` après → puis ↓ ; relue côté serveur x=24, y=108 | V `5b2-02b-boutons-position-24-108.png` |
| Annuler disponible | bouton « Annuler : Déplacer le bloc » actif, « Rétablir » grisé | V `5b2-02a-annuler-disponible.png` |
| Grouper | « 1. Bouton A — groupe « Haut » », « 2. Carte B — groupe « Haut » » | V `5b2-03-groupe-haut-liste.png` |
| Couleur de la palette | carte remplie en #d39a62 (--accent du Livre de recettes) | V `5b2-04a-carte-coloree.png`, `5b2-04b-palette-recettes.png` |
| Supprimer puis annuler | 2 blocs, puis 3 blocs à nouveau, même position et même taille | V `5b2-05a-bloc-supprime.png`, `5b2-05b-suppression-annulee.png` |
| Glisser à la souris | bloc déplacé pendant le geste, puis enregistré (x≈70, y≈220 ; écart ≤ 2 px) | V `5b2-06a-glisser-souris-pendant.png`, `5b2-06b-glisser-souris-apres.png` |
| Glisser au doigt | vrais événements tactiles (touchStart/Move/End) : bloc enregistré ~24 px à gauche et ~36 px plus bas (écart ≤ 3 px) | V `5b2-07-glisser-doigt-apres.png` |
| Deux écrans en même temps | message « La maquette a changé… Rechargez-la : rien n'a été modifié » ; la valeur de l'autre écran est conservée | V `5b2-08-conflit-deux-ecrans.png` |
| Ergonomie | boutons du pavé, couleurs, Annuler : au moins 44 × 44 px ; aucun débordement à 360 et 390 px ; aucun texte sous 12 px | V (mesuré par le navigateur dans `tests/e2e/lot5b-edit.spec.ts`) |

### Contrôles (exécutés, résultats réels)
`tsc` OK · vitest **195/195** · `node --test tests/*.test.mjs` **443/443** (dont 29 `mockup-ops`, 18 `mockup-edit`) · régressions OK · `test:storage` 11/11 · `test:core` OK · `test:bridge` 7/7 · build OK · palettes et fichier de départ à jour · Playwright `lot5b-edit` 5/5 (Android **et** ordinateur) et `lot5b` 3/3 · audit des exigences 616, 0 preuve cassée.
Les nouveaux tests ont été vérifiés par mutation (en cassant volontairement la garde « sortirait de l'écran » et la compression des écritures, ils échouent).

### NON PROUVÉ / limites
- **Galaxy A05s : NON PROUVÉ.** Le geste au doigt est simulé par Chromium (vrais événements tactiles), pas un vrai doigt sur un vrai écran.
- **Production : NON PROUVÉ** pour l'usage (seul `/api/health` est relu).
- Annuler / Rétablir se perd au rechargement de la page (historique gardé dans l'écran, 50 gestes au plus).
- Un bloc non choisi ne se glisse pas : il faut d'abord le toucher (choix voulu, pour que la page puisse défiler au doigt).
- Seul le thème sombre par défaut de chaque site est repris dans les palettes.

## 2. Étape 5B-2 — mise en ligne (V)
- PR #53 fusionnée (`cc49346`) après CI verte (`check` et build Cloudflare). `/api/health` relu : `release_sha` = `cc49346…`, migrations 0007 à 0025, aucune manquante.
- Base de production relue après la fusion : **mêmes nombres de lignes** qu'au relevé de départ (users 1, projects 5, conversations 5, messages 6, files 14, file_versions 17, file_contents 17, tasks 3, repositories 1, connections 4, project_decisions 1, project_features 1, item_lifecycle 2, lifecycle_events 3, events 17, mockups 0, d1_migrations 25).

## 3. Étape 5B-3 — fiche, mission, export (aucune migration)
### Ce qui a été construit
- `server/mockup-sheet.ts` : règles fixes, sans IA. Ordre de lecture (haut → bas, gauche → droite, même ligne à 8 px près) ; écarts avec l'écran de départ (ajouté, retiré, déplacé — « juste sous » si un bloc est au-dessus à 24 px au plus et le chevauche —, redimensionné, regroupé, séparé, recoloré, renommé, changé de type, comportement, fonctionnalité) ; couleurs nommées par le jeton du site (ex. `--accent (#d39a62)`), sinon « hors palette » ; liste de contrôle « maquette / résultat » ; fichiers probablement concernés **(Hypothèse)** d'après la liste des fichiers du dépôt au commit épinglé, jamais leur contenu.
- `GET /api/mockups/:id/sheet` : fiche + champs de mission + empreinte.
- Écran « 3. Fiche de mise en page et mission » : Préparer la fiche, Copier, Télécharger la fiche (.md), Télécharger l'image (.png), Créer la mission (générateur du lot 3 : ensuite lire les règles du dépôt, figer, copier dans « Missions pour Claude Code »).
### Défauts trouvés en utilisant l'application, et corrigés
1. Les titres de la fiche faisaient 11,6 px (sous la règle des 12 px) : corrigés à 14 px. (V : mesure du navigateur avant/après)
2. Une mission créée depuis la maquette n'apparaissait pas dans « Missions pour Claude Code » sans recharger la page : la liste se met maintenant à jour aussitôt. (V)
### Preuves (application lancée en local, Chromium, 360 px)
| Fonction | Ce que j'ai vu | Preuve |
|---|---|---|
| Fiche à l'écran | 4 consignes exactes (dont « Déplace « Recherche » juste sous « Titre » »), liste de contrôle, fichiers `public/css/app.css`, `public/index.html` marqués Hypothèse | V `5b3-01-fiche-ecarts-controle.png` |
| Fiche téléchargée | fichier `fiche-accueil-du-livre.md`, mêmes consignes, cases à cocher | V `5b3-02-fiche-telechargee.md` |
| Image de la maquette | PNG 720 × (2 × hauteur), capture en fond, blocs numérotés, bloc 3 coloré `--accent` | V `5b3-03-image-maquette.png` |
| Mission (générateur du lot 3) | créée, visible tout de suite dans « Missions », figée, téléchargée ; contient consignes, mise en page visée, fichiers en Hypothèse, liste de contrôle | V `5b3-04-mission-telechargee.md`, `5b3-05-mission-figee.png` |
### Contrôles (exécutés, résultats réels)
`tsc` OK · vitest **197/197** · `node --test tests/*.test.mjs` **472/472** (dont 29 `mockup-sheet`) · régressions OK · `test:storage` 11/11 · `test:core` OK · `test:bridge` OK · build OK · Playwright `lot5b-sheet` 2/2, `lot5b` 3/3, `lot5b-edit` 5/5, `lot3` 2/2 (Android et ordinateur) · audit des exigences 619, 0 preuve cassée. Un test trop faible (ordre de lecture) a été renforcé après une mutation non détectée.
### NON PROUVÉ / limites
- **Lecture des règles réelles du dépôt** par la mission : NON PROUVÉ (aucun jeton GitHub ici ; la mission a été figée « sans les règles », et le texte le dit).
- **Copier dans le presse-papiers** : non essayé automatiquement (permission du navigateur) ; « Télécharger » essayé.
- **Essai décisif** (une vraie page de Recettes ou Sport, mission donnée à Claude Code, résultat comparé sur le téléphone) : **à faire par Martin** — le lot 5B n'est pas terminé sans lui.
- Galaxy A05s et production : NON PROUVÉ.

## 4. Étape 5B-3 — mise en ligne (V)
PR #54 fusionnée (`a922a8d`) après CI verte. `/api/health` relu : `release_sha` = `a922a8d…`, migrations 0007 à 0025, aucune manquante. Base de production relue : mêmes nombres de lignes qu'au départ (et `missions` 0).

## 5. Étape 5B-4 — guidage par règles vérifiables (migration 0026, additive)
### Sources vérifiées (V)
WCAG 2.2, **W3C Recommendation 12 December 2024**, lue le 17 novembre 2026 sur https://www.w3.org/TR/WCAG22/ (accès à `www.w3.org` ajouté à l'environnement avec l'accord de Martin). Extrait gardé : `docs/audits/preuves/lot5b/5b4-sources-w3c.txt`.
- 2.5.8 Target Size (Minimum), **AA : 24 × 24 px CSS**, avec exceptions (espacement, équivalent, en ligne, navigateur, essentiel) ;
- 2.5.5 Target Size (Enhanced), **AAA : 44 × 44 px CSS** ;
- 1.4.3 Contrast (Minimum), **AA : 4,5:1**, gros texte (18 pt, ou 14 pt gras) **3:1** ;
- 1.4.11 Non-text Contrast, **AA : 3:1** (non utilisé : la couleur de la page derrière un bloc n'est pas connue) ;
- formules « contrast ratio » et « relative luminance » (seuil 0,04045), recopiées dans `server/mockup-guide.ts` et contrôlées : noir/blanc = 21:1, #767676 sur blanc = 4,54:1.
### Les huit règles
| Règle | Niveau | Source |
|---|---|---|
| Bouton, champ ou barre < 24 px | Vérifié | WCAG 2.5.8 (AA) |
| Bouton, champ ou barre < 44 px | Vérifié | WCAG 2.5.5 (AAA) |
| Texte/fond < 4,5:1 | Vérifié | WCAG 1.4.3 (AA) |
| Une seule des deux couleurs choisie | Hypothèse | WCAG, définition « contrast ratio », note 4 |
| Couleur hors palette du site | Vérifié | palette lue dans le dépôt |
| Fonctionnalité liée abandonnée, rejetée, remplacée ou bloquée | Rapporté | suivi des fonctionnalités |
| Une décision actuelle cite le bloc | Hypothèse | Atelier ne comprend pas le sens de la décision |
| Deux blocs se chevauchent (hors même groupe) | Vérifié | géométrie de la maquette |
| Plus de 8 blocs sans groupe | Hypothèse | repère d'Atelier, **sans source officielle** |
### Preuves (application lancée en local, Chromium 360 px)
| Fonction | Ce que j'ai vu | Preuve |
|---|---|---|
| Vérifier la maquette | 5 conseils : « Fermer » trop petit (20 × 20, lien WCAG 2.5.8), texte « Astuce du jour » à 2,84:1, deux couleurs hors palette, « Recette A » et « Recette B » se chevauchent (66 × 40 px) | V `5b4-01-conseils-trouves.png` |
| Refuser / accepter | après refus : 4 conseils et « 1 refusé(s), masqué(s) » ; le conseil accepté porte « ✔ Accepté » ; rien ne change après rechargement | V `5b4-02-accepte-et-refuse.png` |
| Conseil accepté dans la fiche | « Agrandis « Fermer » à au moins 24 × 24 px (WCAG 2.2, critère 2.5.8). » | V `5b4-03-fiche-avec-conseil-accepte.png` |
| Correction | après avoir agrandi « Fermer » à 44 × 44, son conseil disparaît | V (parcours `lot5b-guide`) |
### Contrôles (exécutés, résultats réels)
`tsc` OK · vitest **199/199** (dont migration 0026 sur base remplie) · `node --test tests/*.test.mjs` **485/485** (dont 12 `mockup-guide`) · régressions OK · storage OK · core OK · bridge OK · build OK · Playwright lot5b-guide, lot5b, lot5b-edit, lot5b-sheet, lot3 : 28/28 (Android et ordinateur) · audit des exigences 621, 0 preuve cassée.
### NON PROUVÉ / limites
- Contraste d'un bloc avec la page derrière lui (1.4.11) : non calculé (Atelier ne lit pas les couleurs de la capture).
- Exceptions de 2.5.8 (espacement suffisant, etc.) : non vérifiées, le conseil le dit.
- Galaxy A05s, production : NON PROUVÉ.

## 6. Étape 5B-4 — mise en ligne
Voir §8 (relevé final de la production).

## 7. Étape 5B-5 — discussion liée à la maquette (migration 0027, additive)
### Ce qui a été construit
- Table `mockup_messages` (migration 0027, testée sur base remplie). Routes : lire la discussion ; poser une question (sur un bloc ou la page) ; demander l'avis d'une IA ; confirmer une conclusion.
- **Réponse d'Atelier sans IA** (`server/mockup-chat.ts`) : faits du bloc [Vérifié], conseils qui le visent (avec leur niveau), fonctionnalité liée [Rapporté], décisions actuelles qui le citent (avec leur niveau), passages de l'historique importé [Rapporté], conclusions déjà confirmées [Confirmé par vous]. Si rien ne le concerne, Atelier le dit.
- **IA facultative** : votre propre clé (Mistral, Groq ou Gemini ; une IA payante est refusée), texte seulement (la capture n'est jamais envoyée), une seule demande par question, jamais rejouée ; réponse marquée **Hypothèse** ; en cas d'échec, rien n'est ajouté.
- **Conclusion** : « Confirmé par vous » seulement quand vous l'écrivez et la confirmez ; elle entre dans la fiche et dans la mission.
### Preuves (application lancée en local, Chromium 360 px)
| Fonction | Ce que j'ai vu | Preuve |
|---|---|---|
| Question sur un bloc, réponse sans IA | faits du bloc [Vérifié], règle WCAG 2.5.5 [Vérifié], « une décision parle de Recherche » [Hypothèse], décision « La recherche reste en haut » [Confirmé par vous] | V `5b5-01-reponse-sans-ia.png` |
| IA avec une clé factice | message « L'IA n'a pas répondu correctement. Rien n'a été ajouté et la demande n'est pas rejouée automatiquement. » ; nombre de messages inchangé | V `5b5-02-ia-cle-factice-echec-propre.png` |
| Conclusion confirmée | message encadré « ✔ Confirmé par vous » | V `5b5-03-conclusion-confirmee.png` |
| Conclusion dans la fiche | section « Conclusions confirmées par vous (discussion) » | V `5b5-04-fiche-avec-conclusion.png` |
| Réponse d'une IA | Mistral **simulé** (réponse marquée Hypothèse, une seule demande, 2ᵉ demande refusée, panne → rien d'ajouté) | `tests/mockup-chat.test.ts` (simulation) |
### Contrôles (exécutés, résultats réels)
`tsc` OK · vitest **206/206** (dont migrations 0026 et 0027 sur base remplie, discussion avec Mistral simulé) · `node --test tests/*.test.mjs` **492/492** · régressions OK · storage OK · core OK · bridge OK · build OK · Playwright lot5b-chat, lot5b-guide, lot5b-sheet, lot5b-edit, lot5b, lot3 : **32/32** (Android et ordinateur) · audit des exigences 624, 0 preuve cassée.
### NON PROUVÉ / limites
- **Réponse d'une vraie IA : NON PROUVÉ** (aucune clé ici, et vous gardez vos clés : c'est voulu).
- Passages de l'export ChatGPT : la recherche existe, mais l'export n'est pas importé en production, donc 0 passage aujourd'hui (R : rapport 5A).
- Galaxy A05s, production : NON PROUVÉ.

## 8. Relevé final de la production (V, 17 novembre 2026)
| Étape | PR | Commit de fusion | Migration | `/api/health` relu |
|---|---|---|---|---|
| 5B-2 | #53 | `cc49346` | aucune | 0007–0025, aucune manquante |
| 5B-3 | #54 | `a922a8d` | aucune | 0007–0025, aucune manquante |
| 5B-4 | #55 | `8ebf360` | 0026 (additive) | 0007–0026, aucune manquante |
| 5B-5 | #56 | `9f01aac` | 0027 (additive) | 0007–0027, aucune manquante |
Base relue après la dernière fusion (lecture seule) : users 1, projects 5, conversations 5, messages 6, files 14, file_versions 17, file_contents 17, tasks 3, repositories 1, connections 4, project_decisions 1, project_features 1, item_lifecycle 2, lifecycle_events 3, events 17 — **identiques au relevé de départ** ; mockups 0, mockup_suggestion_decisions 0, mockup_messages 0 ; d1_migrations 25 → 27 (les deux nouvelles migrations).
Point de restauration Time Travel noté avant tout : `2026-11-17T15:52:54Z` (7 jours sur l'offre gratuite).

## 9. Ce que Martin doit tester lui-même (NON PROUVÉ par moi)
- Toutes les étapes sur le **Galaxy A05s** : `docs/PROTOCOLE_TELEPHONE_LOT5B.md` (étapes 1 à 31).
- **L'essai décisif** : une vraie page de Livre de recettes ou de Sport, mission donnée à Claude Code, résultat comparé sur le téléphone ; noter « conforme en une passe » ou le nombre d'allers-retours.
- Lecture des **vraies règles du dépôt** par la mission (jeton GitHub enregistré dans Atelier).
- **Avis d'une vraie IA** dans la discussion (votre clé Mistral, Groq ou Gemini).
- Si vous voulez une sauvegarde indépendante : `npx wrangler d1 export atelier-db --remote --output=sauvegarde.sql` sur votre ordinateur (je n'ai pas eu de jeton, c'était votre choix).
