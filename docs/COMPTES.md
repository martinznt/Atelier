# Comptes par email — lot du 24 octobre 2026

État : implémenté et tests de logique/transactions exécutés. Routes complètes,
compilation, navigateur et production restent à valider. Voir VALIDATION.md.

## Règles

- Nouvelle inscription : adresse email obligatoire et mot de passe 8 caractères
  minimum, 128 maximum. Même seuil au changement et à la récupération. Les espaces
  du mot de passe ne sont jamais supprimés ; Unicode est compté par points de code.
- Email nettoyé aux extrémités et mis en minuscules comme identifiant de connexion.
  Syntaxe conservatrice ASCII ; domaines internationaux possibles en punycode.
- Aucune validation email obligatoire ni service de mail payant ajouté. L’adresse
  est **non vérifiée**, ne prouve pas une identité et n’autorise pas de fusion.
- Récupération : code à usage unique, jamais l’adresse seule. Aucun mail de reset
  envoyé. Conserver les codes ; l’absence de moyen conservé peut rendre le compte
  irrécupérable. Hachage scrypt et limitations de tentatives conservés.
- Le coffre hors connexion a son mot de passe local distinct (minimum 10) ; le seuil
  8 concerne le compte serveur. Aucune donnée locale n’est fusionnée sur l’email.

## Ancien compte sans email

0007 ajoute une colonne nullable et un index unique sans toucher aux IDs, hashes,
codes, projets, fichiers ou données existantes. Aucun email déduit de l’identifiant.
L’utilisateur choisit « J’avais un compte sans email ». Son mot de passe, ou son code
via la récupération ancienne, établit la session. Il doit ensuite fournir son email
et son mot de passe actuel. Attribution et rotation des sessions sont atomiques.
Une adresse déjà attribuée est refusée sans fusion. Un changement concurrent de
mot de passe, un compte désactivé et les opérations anciennes tardives sont refusés.

Jusqu’à l’ajout, les API de travail demandent l’enrôlement. La session permet encore
me, email, changement de mot de passe, déconnexion, export et suppression du compte.
Un export est proposé dans le formulaire avant le choix d’adresse. Les données
restent attachées au même user_id. Après ajout, seul le login email est proposé et
l’ancien mode n’autorise plus de nouvelle session. Pas de changement d’email en
libre service livré dans ce lot.

## API

| Route | Corps JSON | Résultat |
| --- | --- | --- |
| POST /api/auth/register | email, password | Compte, cookie sécurisé et codes affichés une fois |
| POST /api/auth/login | email, password | Session du compte exact |
| POST /api/auth/recover | email, password (nouveau), code | Code consommé, hash changé, sessions révoquées atomiquement |
| POST /api/auth/legacy-login | username, password | Seulement si email encore NULL ; needs_email=true |
| POST /api/auth/legacy-recover | username, password (nouveau), code | Récupération de l’ancien compte puis enrôlement |
| POST /api/auth/email | email, password (actuel) | Session existante exigée, email attribué, autres sessions fermées |
| POST /api/auth/password | currentPassword, newPassword | Nouveau mot de passe 8–128, rotation de session |

Les réponses utilisateur ajoutent email et needs_email. Les nouveaux comptes gardent
username=email pour la compatibilité d’affichage ; les anciens usernames ne sont pas
renommés. Les permissions proviennent toujours de la session serveur, jamais d’un
user_id ou d’une adresse fournie par le client. Les détails des secrets ne changent pas.
