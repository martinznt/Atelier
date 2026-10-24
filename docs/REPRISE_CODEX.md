# Reprise dans une nouvelle conversation — 24 octobre 2026

## Dépôt et branche à sélectionner

- Dépôt privé : martinznt/Atelier.
- Branche du dernier lot : **feat/email-password-eight**.
- Base main relue : **31c817218a49923c506aca695b860bd4b75aaf63**.
- Branche précédente sans R2 : feat/stockage-gratuit-outils, d4d0dea, intégrée
  depuis par le propriétaire. Préserver sa correction manuelle readVersion.
- Ne pas publier la branche comme version complète sans compilation et tests HTTP.

## Dernières demandes explicites

Le propriétaire veut le mot de passe du compte **8 caractères minimum**, et une
**adresse email obligatoire pour l’inscription et la connexion**. L’email ne devient
pas une preuve vérifiée et ne permet jamais à lui seul une récupération/fusion.
L’absence de validation email obligatoire reste demandée. Conserver codes de
récupération et accès aux anciens comptes. Leur enrôlement est décrit dans COMPTES.md.

Le périmètre complet reste REFONTE_GRATUITE.md : Workers/D1/GitHub/IndexedDB, sans R2,
carte ou offre payante obligatoire ; bibliothèque GitHub, Mes outils universels,
intégration obligatoire **Outil-image** avec vrai aller-retour JSON éditable, versions,
calques/propriétés préservés et éditeur autonome hors connexion. Référence :
https://github.com/martinznt/Outil-image et
https://outil-image.martin-zannet22.workers.dev/. L’audit initial est dans CONNECTEURS.md.
Ne pas livrer un lien simple comme intégration. Les modifications nécessaires dans
Outil-image sont autorisées **sur une branche dédiée**, sans publication automatique.

## Ce que contient le dernier lot

- 0007_email_identity.sql additive, email nullable pour les comptes historiques,
  index unique insensible à la casse. Aucune donnée existante supprimée/recréée.
- Email normalisé côté serveur, inscription/connexion/récupération actualisées.
- Seuil 8 caractères pour inscription/changement/récupération ; scrypt inchangé.
- Ancien compte : lien « J’avais un compte sans email », ancien mot de passe ou
  code de récupération, puis ajout email avec mot de passe ; rotation atomique des
  sessions et même propriétaire/projets. Les opérations anciennes retardées sont
  refusées après enrôlement. Les comptes ne sont jamais fusionnés sur l’email.
- Formulaires français, transport autorisant les routes publiques de transition,
  export de compte incluant son email ; accès offline par coffre conservé.
- 11 tests identité ajoutés et un test transport ; intégration/E2E mis à jour.

## Preuves et blocages précis

173 tests locaux réussis : cœur/schéma 9, passerelle 27, régressions 137. SQLite et
WebCrypto réels, helpers de production ; réseaux/stockages contrôlés explicitement.
Syntaxe 59 TS/TSX valide, pas un typage. Le test des routes complètes et le navigateur
ne sont pas comptés dans ces résultats. Les nouveaux scénarios Miniflare sont écrits.

Le 24 octobre, GitHub est à nouveau lisible et modifiable. Un nouveau workspace
vide a été reconstruit depuis les 133 blobs de main, SHA vérifiés. Les modifications
non sauvegardées de l’ancien explorateur GitHub ne sont pas présentes ; ne pas les
annoncer livrées. L’ancien environnement est devenu inutilisable puis a été remplacé.

Le terminal ne joint pas proxy:8080 ; aucune dépendance npm n’est installée.
`npm run check`, `npm test`, `npm run build` s’arrêtent code 127 sur tsc/vitest absents.
Ne pas répéter une longue attente de permission réseau. Aucun secret Cloudflare dans
l’environnement, aucun déploiement de ce lot ni test de production revendiqué.
Le CPU scrypt Workers Free reste à mesurer/résoudre sans hash faible ni plan payant
imposé. Une connexion API n’est pas ChatGPT/Claude Pro/Codex/Claude Code.

## Prochaines actions

1. Lire AGENTS.md, CLAUDE.md, CAHIER_DES_CHARGES.md, REFONTE_GRATUITE.md,
   AVANCEMENT.md, ARCHITECTURE.md, CONNECTEURS.md, VALIDATION.md et EXIGENCES.json.
2. Vérifier git status et branche ; conserver les changements. Installer les
   dépendances si le nouvel environnement peut réellement joindre npm.
3. Exécuter check/test/build, corriger les erreurs, puis HTTP et Playwright
   Android/iPhone/tablette/ordinateur. Tester inscription 8 vs 7 caractères,
   connexion email, récupération par code, ancien compte et isolation A/B.
4. Préparer l’intégration main du lot validé. Le helper de publication refuse les
   migrations de production depuis une autre branche. Ne pas contourner ce garde.
5. Sauvegarder D1 avant migration ; appliquer toutes les migrations manquantes,
   sans recréer la base existante. Voir INSTALLATION_CLOUDFLARE.md.
6. Continuer bibliothèque GitHub et Outil-image, puis les autres exigences ouvertes.

Les indications destinées au propriétaire doivent être données aussi dans le chat,
en français simple, avec la branche/commit réellement relus. Ne pas promettre zéro
bug ou un travail autonome après la fermeture de la session Codex.
