# Instructions de continuité

Projet neuf et dédié : Atelier. Ne pas modifier un autre site, notamment Sport.
Lire avant tout travail `docs/CAHIER_DES_CHARGES.md`, `docs/AVANCEMENT.md`,
`docs/ARCHITECTURE.md`, `docs/CONNECTEURS.md`, `docs/VALIDATION.md` et
`docs/EXIGENCES.json`. Ces documents sont aussi la référence de Claude Code.

- Préserver les modifications existantes ; examiner git status et les migrations.
- Français, accessible, responsive Android / iOS / tablette / ordinateur.
- Chaque requête privée doit utiliser l'utilisateur de la session serveur ; tester A contre B.
- Pas de secret en journal, dépôt, export ou cache hors ligne.
- Pas d'exécution de code fournisseur sur le serveur applicatif.
- Le 14 octobre 2026, l’utilisateur a autorisé le déploiement automatique. Préparer et
  valider l’application complète avant publication ; ne pas redemander cette autorisation.
  Aucun frais supplémentaire ou exposition publique de contenus privés n’est autorisé.
- Une API n'est pas l'abonnement grand public, Codex ou Claude Code.
- Ne pas appeler vérifié ce qui dépend d'un fournisseur simulé. Conserver les blocages précis.
- Commits par lots ; maintenir les documents et les statuts individuels après validation.
- `npm run check`, `npm test`, `npm run build` ; E2E selon le changement et l'environnement.
- Ne pas réessayer automatiquement une requête distante à issue incertaine.

Le périmètre complet a été confirmé après une réduction temporaire à une passerelle.
La passerelle fait partie d’Atelier : voir `docs/PASSERELLE.md`. La seule identité Sites
créée est conservée dans `passerelle/.openai/hosting.json` ; elle n’est pas publiée.
Ne pas créer un deuxième Site et ne pas confondre création et déploiement.
`npm run test:bridge` ne nécessite aucune dépendance npm externe (Node 24).

Lot de fiabilité du 16 octobre : exécuter aussi `npm run test:regressions` (Node 24,
sans dépendances téléchargées). Les adaptateurs SQLite/WebCrypto testent le code de
production ; les doubles de stockage/réseau sont explicitement limités aux tests.
Ils ne remplacent pas Miniflare, le navigateur ou un fournisseur réel.
Le header `X-Atelier-Account` détecte une divergence d’onglet/cookie ; il ne peut
jamais autoriser l’accès. L’identité de session reste la seule autorité des routes API.
