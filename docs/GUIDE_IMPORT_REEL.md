# Guide pour Martin — importer le vrai export ChatGPT (15 novembre 2026)

Ce guide est écrit pour vous, sans vocabulaire de programmeur. Ce qui est **testé** : l'import de **votre archive** sur un ordinateur de développement, en local (pas en ligne). Ce qui **n'est pas testé** : sur votre Samsung Galaxy A05s, et sur le site en ligne.

## 0. Avant tout : ce que vous devez savoir
- Le vrai import n'a lieu qu'**après la fusion de la PR n°40** (elle apprend à Atelier à reconnaître votre fichier `conversations_filtrees.json`). Sans elle, Atelier répond « aucune conversation ». C'est vous qui fusionnez ; **la fusion met le site en ligne et applique tout seul la migration 0022 à votre vraie base**.
- Un petit défaut reste dans la PR n°40 (une annexe de 485 Ko refusée). Sans gravité : le reste de l'import marche. Un correctif prêt est dans `docs/audits/correctifs/pr40-annexes-300ko.patch`.
- Votre archive (97,55 Mo) contient environ **7,6 Mo de texte**, soit 15 % de la place autorisée (50 Mo). Elle tient.

## 1. Sauvegarder AVANT de fusionner (obligatoire)
1. Sur un ordinateur avec le dépôt Atelier, Node et un accès à votre compte Cloudflare : `npx wrangler d1 export atelier-db --remote --config wrangler.production.jsonc --output sauvegarde-AAAA-MM-JJ.sql` (nécessite d'être connecté à Cloudflare).
2. Notez la date, la taille du fichier et son empreinte : `sha256sum sauvegarde-….sql`.
3. Rangez-le **hors du dépôt GitHub** (il contient des secrets chiffrés et vos messages). Ne l'envoyez à personne.
4. Cloudflare garde aussi 7 jours d'historique (« Time Travel », information du dépôt, non revérifiée) : ce n'est qu'un filet de sécurité.
Si vous ne savez pas faire l'étape 1, **demandez-moi de vous guider avant de fusionner** : ne fusionnez pas sans sauvegarde.
(Test fait : le même principe, en local, a redonné une base identique ligne par ligne. Sur la production réelle : **non essayé**.)

## 2. Télécharger l'archive
Elle est dans le dépôt privé `Memoire-Projets`, branche `reception-export-chatgpt-2026-11-15`, dossier `01_SOURCES_ORIGINALES/CHATGPT/`, fichier `Extraction_depuis_2026-09-01_sans_images_ni_ancien_export.zip` (97 550 519 octets). Après téléchargement, vérifiez l'empreinte (SHA-256) : elle doit être **2b76cc6f006656fcfb9d7e569f301beff23455e2e63aeb611480e0030276525b**. Si elle diffère, ne l'importez pas.
Conseil : faites le premier import sur un **ordinateur** (Wi-Fi, branché), pas sur le téléphone.

## 3. Importer dans Atelier
1. Ouvrez Atelier, connectez-vous. Menu **Mémoire → Export ChatGPT**.
2. **Choisir le fichier d'export** → sélectionnez le ZIP. **Gardez l'écran ouvert et allumé** jusqu'à la fin (l'opération ne continue pas en arrière-plan). Un bouton « Annuler » existe ; vous pouvez ensuite reprendre : ce qui est déjà fait est gardé.
3. Lisez le **Bilan chiffré**. Valeurs attendues (mesurées sur votre archive, en local) : **137 conversations**, première date **1er septembre 2026**, dernière **10 novembre 2026**, **6 723 nœuds**, 181 entrées dans l'archive.
4. Ouvrez **Archive** → « Indexer les fichiers » : attendu 180 fichiers : 109 pièces jointes, 46 bibliothèque non rattachée, 16 sites, 9 autres.
5. Ouvrez **Conversations et lots** : choisissez le projet de chaque conversation (Livre de recettes, Sport, Atelier…) et **confirmez**. Atelier ne devine jamais. (La fiche indique : 40 « probables », 97 « indéterminées » : ce sera surtout à vous de trancher.)
6. **Aperçu de l'import**, puis **Confirmer et importer**.
7. Lisez le **rapport d'intégrité** (« Intégrité de l'import »). Attendu : 137 enregistrées, environ 134 importées, 2 sans texte, 0 problème de structure. Tout écart doit apparaître dans « Manques et anomalies ».
8. En cas de coupure : rouvrez la page, rechoisissez **le même fichier** ; les étapes finies sont sautées. Pour annuler : bouton « Annuler ».
Attention : ne relancez pas **plusieurs imports complets le même jour** : un import écrit environ 60 000 lignes sur les 100 000 autorisées par jour (estimation, non vérifiée chez Cloudflare).

## 4. Ce que vous verrez de « bizarre » (normal)
- « 3 545 importés pour 3 349 annoncés » : les très longs messages sont découpés en parties de 12 000 caractères.
- 46 conversations « partielles » : elles contiennent des images, outils ou fichiers non textuels.
- Environ 116 pièces jointes « référencées seulement » : le fichier n'est pas dans l'archive, ou le fichier de correspondance (1,6 Mo) est trop gros pour être lu en entier.
- Si l'**inventaire complet** (`inventaire_complet.json`) apparaît en erreur « 413 » : défaut connu (voir plus haut), sans perte de conversation.

## 5. Mesurer le texte vous-même (et la place restante)
Atelier **n'affiche pas** la place de texte utilisée (le « Bilan chiffré » compte les messages, pas les octets). Pour un futur export plus gros, sur un ordinateur avec Node : `node scripts/mesure-texte-archive.mjs chemin/archive.zip`. Il affiche seulement des nombres : texte total en Mio et % du plafond de 50 Mio. Si ça dépasse 100 %, prévenez-moi **avant** d'importer : l'import s'arrêterait en plein milieu avec « Le stockage texte de ce compte est plein (50 Mo) », sans rien effacer, et il n'y a pas de mode « un projet à la fois » pour contourner.

## 6. Les essais réels que seul vous pouvez faire (rien de cela n'a été essayé)
1. **Clés gratuites Gemini, Groq, Mistral** : saisir vos propres clés dans Atelier et lancer un petit test (chaque utilisateur utilisera les siennes). Aucun appel réel n'a jamais été fait ; ne mettez pas de clé payante. Ne collez jamais une clé dans un message ou sur GitHub.
2. **Lecture réelle de Memoire-Projets, Livre-de-recettes et Sport par Atelier** : les appels GitHub n'ont été testés qu'en simulation. À essayer : Mémoire → référentiel, lancer la synchronisation, vérifier que l'index apparaît (en lecture seule : Atelier ne doit rien écrire dans ces dépôts).
3. **Essai sur le téléphone** : voir `docs/PROTOCOLE_TELEPHONE_A05S.md`.
4. **Import réel en ligne** (étapes 1 à 3 ci-dessus), après sauvegarde.
5. **Décisions à prendre** : fusionner ou non la PR n°40 (avis : à corriger puis fusionner) ; que faire du test rouge sur la base de test des aperçus (rapport §2) ; le réglage `ALLOW_REGISTRATION: "true"` (inscriptions ouvertes en production) : mettre `false` quand votre compte est créé (recommandé par le rapport de la PR 40).

## 7. Qui applique les migrations ?
Cloudflare, à chaque fusion dans `main`, si la « commande de déploiement » du build est bien `npm run deploy:cloudflare` (documenté dans `docs/DEPLOIEMENT.md` ; je n'ai pas pu le voir sur votre tableau de bord). Vous pouvez le vérifier : Cloudflare → Workers → atelier → Paramètres → Build → « Deploy command ». Si elle vaut `npx wrangler deploy`, les migrations **ne** sont **pas** appliquées : le site peut alors tourner sans la migration 0022 (la page `/api/health` la signale « manquante »). Un échec passé (19 octobre) venait d'un identifiant de base nul.
