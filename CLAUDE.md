# Reprise par Claude Code

Lire et appliquer `AGENTS.md`. Sources communes obligatoires :
`docs/CAHIER_DES_CHARGES.md`, `docs/AVANCEMENT.md`, `docs/ARCHITECTURE.md`,
`docs/CONNECTEURS.md`, `docs/VALIDATION.md`, `docs/EXIGENCES.json`.
Le premier lot n'est pas la livraison complète. Examiner la branche, les changements
et les preuves de test avant de reprendre. Ne jamais inventer une validation fournisseur.

La section 20 du cahier des charges rétablit le périmètre complet avec la passerelle.
Lire aussi `docs/PASSERELLE.md`. Le déploiement automatique est autorisé depuis le
14 octobre 2026 : préparer et valider le résultat, ne pas redemander cette autorisation.
Une création Sites existe sans version publiée ; conserver son identifiant exact.

Pour les corrections de fiabilité, lancer aussi `npm run test:regressions` et lire
le rapport du 16 octobre. Conserver les protections des réponses tardives, la clé
persistée des envois et la comparaison du compte attendu avec la session serveur.
