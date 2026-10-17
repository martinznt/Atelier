# Mémoire entre assistants — intégrée à Atelier

État du 15 octobre 2026. La passerelle complète le projet initial ; elle ne le remplace pas.

## Parcours prévu dans l’application

Projet → Mémoire entre assistants → préparer la mémoire → importer → examiner le
bilan → confirmer. Le fichier source est conservé dans la bibliothèque privée ; les
textes sont importés par lots dans D1. Le partage avec les assistants est désactivé
au départ. Son activation concerne les imports, le contexte et les relais de ce projet.

« Relier les assistants » indique le serveur `/mcp` et les réglages officiels. Chaque
client s’authentifie séparément. L’utilisateur choisit lecture seule ou lecture et
dépôt de relais. Une autorisation seule n’est pas présentée comme un échange réussi.
Le dernier accès technique, l’expiration et le retrait d’accès sont visibles.

Le fournisseur peut alors appeler `list_spaces`, `read_context`, `search`, `fetch`,
`list_conversations`, `read_conversation` et `write_handoff`. Un outil `profile` permet
de vérifier l’identité Atelier utilisée. Les recherches excluent les projets non
partagés et les données des autres utilisateurs. Un relais ne démarre pas un autre
assistant et n’exécute pas de code.

## Historiques réellement pris en charge par le code

| Source | Texte reconnu | Limites explicites |
| --- | --- | --- |
| Export ChatGPT | `conversations.json`, nœuds textuels du mapping, toutes les branches, auteurs, parents, dates | L’archive ZIP doit être extraite ; pas d’import implicite des images, audio ou pièces jointes |
| Export Claude | `chat_messages`, blocs texte, auteur, date | Les pièces jointes et blocs non textuels sont signalés comme omis |
| Journal Claude Code sélectionné | JSONL des événements user/assistant avec message textuel | Format local dépendant de la version ; événements internes et résultats d’outils non textuels non importés |
| Journal Codex sélectionné | JSONL response_item/message et textes input/output | Même limite de version ; aucun raisonnement interne privé récupéré |
| Document | `.txt`, `.md` | Texte conservé, aucune exécution de HTML ou de code |
| Export mémoire Atelier | JSONL, conversations, messages, contexte courant et relais | Import des textes ; pas une restauration intégrale de la base ou de toutes ses versions |

L’interface refuse les fichiers de plus de 20 Mo et affiche un bilan avant transfert.
Un Web Worker effectue l’analyse pour ne pas bloquer la saisie. Les textes longs sont
découpés sans couper les paires Unicode ; provenance et pagination restent présentes.
L’import peut être recommencé sans dupliquer les messages. Un même message source
dont le contenu diffère produit un conflit explicite, sans écrasement.

Le stockage de textes importés est plafonné à 50 Mo par utilisateur, avec contrôle
SQL atomique. Ce plafond est distinct du stockage R2 des fichiers sources. Le fichier
source peut être conservé à nouveau si un import est recommencé après rechargement :
la déduplication du fichier source R2 reste à améliorer, contrairement aux messages.

## Authentification et sécurité

- OAuth avec PKCE S256, découverte de ressource protégée et enregistrement dynamique.
- Clients publics ou secrets client ; secrets et jetons conservés seulement hachés.
- Code à usage unique, lié au client, au retour, à la ressource et à PKCE.
- Jeton d’accès au maximum une heure ; autorisation au maximum trente jours.
- Renouvellement rotatif ; réutiliser un ancien jeton révoque la famille concernée.
- Révocation immédiate et refus après désactivation du compte.
- Retours HTTPS, ou boucle locale avec port pour les clients de développement.
- Nom déclaré par le client et domaine de retour visibles avant consentement.
- Écritures MCP refusées pour les accès en lecture seule.
- Import conservé comme contenu non fiable ; pas d’outil de commande, de déploiement
  ou de lecture de secrets exposé à travers cette passerelle.

Dans Atelier complet, le propriétaire vient de la session authentifiée, jamais d’un
en-tête du navigateur. Un adaptateur optionnel Sites (`SITES_AUTHENTICATION=true`)
permet un lien explicite entre identité authentifiée par la plateforme et compte
Atelier. Ne jamais activer cette option sur un Worker publiquement accessible sans
la passerelle d’authentification Sites qui remplace les en-têtes.

Le serveur OAuth propre à Atelier est prévu pour l’hébergement Cloudflare autonome.
Pour une connexion gérée par Sites, utiliser le plugin et l’URL réellement renvoyés
par la plateforme après publication, pas une URL de plugin supposée. L’interopérabilité
de ces deux chemins n’est pas encore testée dans les applications fournisseurs.

## Preuves et contrôles restants

`npm run test:bridge` exécute les contrôleurs avec de vrais Request/Response et une
base SQLite, ainsi que les importeurs et OAuth, sans package npm externe. Les valeurs
de test restent dans les tests et ne sont pas des connexions de démonstration.
Voir VALIDATION.md pour les nombres exacts et les commandes exécutées.

Restent nécessaires : compilation complète, tests des routes Hono intégrées et du
navigateur, test D1 réel, puis connexion depuis chacun des quatre services avec un
compte disposant de la fonction. Aucun compte fournisseur n’a encore été branché.

## Documentation officielle consultée le 14 octobre 2026

- https://code.claude.com/docs/en/mcp
- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- https://developers.openai.com/codex/mcp (redirige actuellement vers ChatGPT Learn)
- https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt
- https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization

Ces documentations établissent les mécanismes disponibles, pas les droits exacts des
comptes du propriétaire. Aucune API ne donne automatiquement accès à « tout » l’historique
privé de ChatGPT, Claude, Claude Code ou Codex. Ce qui est accessible ici doit être
importé ou déposé explicitement, puis partagé avec les clients autorisés.
