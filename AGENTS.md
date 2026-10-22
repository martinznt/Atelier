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

Lot du 18 octobre : rôles et planification dans `server/collaboration.ts` et
`server/planning.ts`, migrations 0004/0005. Les modèles proviennent des catalogues
officiels ; leur présence ne prouve pas leur supériorité. Les préférences sont
réexaminées avant l’envoi et figées pour la tâche acceptée. Ne jamais inventer un
reset, contourner l’accord de partage ou rejouer une tâche à issue incertaine.
Conserver le contrôle atomique de date, propriétaire et statut dans la prise de
tâche. Une réponse de test ancienne ou d’un secret remplacé ne doit pas écraser
les informations récentes. Lire `docs/GUIDE_ASSISTANTS.md` et le rapport actualisé.

Reprise du 19 octobre : les identifiants Cloudflare non secrets sont dans
`cloudflare.production.json`. Ne pas déployer directement `wrangler.jsonc`, qui
reste local. Lire INSTALLATION_CLOUDFLARE.md et utiliser `npm run deploy:cloudflare` :
configuration validée, migrations distantes, puis Worker. L’origine HTTPS réelle
reste à fournir ; aucune réussite distante n’est déduite des tests de configuration.
La section 25 du cahier des charges précise la référence Open Chat. Dans Discussions,
« Mes assistants » ouvre les réglages ; préserver choix, brouillons et consentements.

## Refonte gratuite demandée le 19 octobre (reprise du 21)

Lire aussi `docs/REFONTE_GRATUITE.md`, suivi RF dans EXIGENCES.json. L’origine
réelle est maintenant connue et conservée dans cloudflare.production.json. Branches
dédiées Atelier et Outil-image ; préparer l’intégration main après validation.
Le propriétaire autorise explicitement l’intégration sur une branche Outil-image.
R2 est refusé, pas de nouvelle carte ou offre payante obligatoire. Les cinq premières
migrations sont déjà appliquées selon le propriétaire : uniquement migrations
additives. Exécuter `npm run test:storage` en plus des contrôles précédents.
Ne pas rejouer les longues demandes réseau interrompues ; documenter la compilation
bloquée et poursuivre les tests disponibles. Les secrets Cloudflare sont absents
de cet environnement ; ne pas utiliser le connecteur GitHub comme jeton applicatif.
