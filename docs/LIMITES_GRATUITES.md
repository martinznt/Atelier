# Limites gratuites et coûts — vérification documentaire du 19–21 octobre 2026

Ces plafonds officiels ne décrivent pas la consommation réelle du compte. Les
quotas peuvent évoluer ; leur date de consultation doit rester visible. Aucune
carte, inscription payante, opération LFS, runner ou facturation n’a été activé.

| Produit | Plafond documenté | Choix Atelier / réserve |
| --- | --- | --- |
| Workers Free | 100000 requêtes/jour, 10 ms CPU/requête, 128 Mo RAM, 50 sous-requêtes | Streaming pour les gros fichiers ; scrypt actuel nécessite mesure et correction sûre si incompatible |
| D1 Free | 5 millions lignes lues/jour, 100000 écrites/jour, 5 Go total compte | 500 Mo maximum/base ; base existante conservée |
| D1 limites | ligne/texte/BLOB ≤2000000 octets, 100 paramètres/requête, 50 requêtes/invocation Free | Petits textes limités à 256 Kio ; pas de binaires massifs |
| D1 Time Travel | 7 jours en Free | Ne remplace pas l’export indépendant et l’exercice de restauration |
| Queues Free | 10000 opérations/jour, rétention 24 h | Une livraison utilise habituellement 3 opérations ; état durable dans D1, pas de rejeu incertain |
| GitHub REST authentifiée | généralement 5000 requêtes/heure, limites secondaires | Lire les vrais en-têtes ; pas un compteur global inventé |
| GitHub fichiers classiques | avertissement au-delà de 50 Mio, blocage au-delà de 100 Mio ; navigateur 25 Mio | Ne pas activer LFS automatiquement ; dépôts recommandés petits |
| GitHub Actions Free | 2000 minutes/mois, stockage artefacts 500 Mo | Workflow manuel existant, aucun déclenchement nouveau ; consommation du compte non connue |
| Releases GitHub | documentation consultée : fichier inférieur à 2 Gio, contraintes propres au service | Ne pas confondre absence de limite totale annoncée et stockage illimité garanti ; aucune Release générée |
| KV / Durable Objects | Non utilisés par cette refonte | Aucun binding, aucune activation ; étude détaillée nécessaire si ajout ultérieur |
| R2 | Refusé par le propriétaire | Aucun binding ou accès nécessaire au serveur |

Sources officielles consultées :

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/queues/platform/pricing/
- https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/
- https://developers.cloudflare.com/labs/workers (compte gratuit sans carte)
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
- https://docs.github.com/en/billing/reference/product-usage-included
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases

L’accès documentaire n’est pas un test du plan ou des droits réels du propriétaire.
Aucune nouvelle dépense n’est autorisée par cette mission. Les API IA restent
séparément facturables : le consentement explicite existant est conservé. Les
comptes et le cycle complet du Worker Free restent à valider réellement.

## API IA — vérification documentaire du 5 novembre 2026
| Fournisseur | Constat officiel | Réserve Atelier |
| --- | --- | --- |
| Groq | Limites par organisation (RPM, RPD, TPM, TPD) ; en-têtes `x-ratelimit-*` : « requêtes » = par jour, « jetons » = par minute ; `retry-after` (secondes) seulement sur un 429 | Atelier lit ces en-têtes tels quels ; la liste des modèles et des limites de VOTRE compte n'est connue que dans votre console |
| Gemini | Limites par **projet** (pas par clé) : RPM, TPM (entrée), RPD (réinitialisé à minuit heure du Pacifique) ; offre gratuite : **contenu utilisé pour améliorer les produits de Google** ; offre payante : non ; certains modèles ne sont pas disponibles en gratuit ; la France figure dans la liste des régions disponibles | Deux clés d'un même projet partagent le quota ; ne pas envoyer de code privé sur l'offre gratuite si ce partage est inacceptable ; conditions d'âge non vérifiées ici |
| OpenRouter | Non intégré dans Atelier. Un solde négatif peut produire des erreurs (402) même sur les modèles gratuits | Pas de connecteur tant qu'une valeur ajoutée n'est pas démontrée |
| Mistral, OpenAI, Anthropic | Voir leurs consoles ; non revérifié ici | Atelier lit les en-têtes renvoyés, jamais un quota inventé |

Aucun de ces constats ne prouve la gratuité ou les droits réels de votre compte : réglez les plafonds de facturation chez chaque fournisseur.
Sources : https://console.groq.com/docs/rate-limits , https://ai.google.dev/gemini-api/docs/rate-limits , https://ai.google.dev/gemini-api/docs/pricing ,
https://ai.google.dev/gemini-api/docs/available-regions , https://openrouter.ai/docs/api-reference/limits .
