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
