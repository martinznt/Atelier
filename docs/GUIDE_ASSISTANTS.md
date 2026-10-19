# Préparer une équipe dans Atelier

Parcours actualisé le 19 octobre : les réglages détaillés sont dans **Mes assistants**,
pour laisser la place à la discussion. Le build précédent a réussi chez Cloudflare ;
ce nouvel écran, le navigateur et les connexions réelles restent à valider.

1. Ouvrir **Réglages → Connexions → Ajouter**. Choisir un service pris en charge.
2. Donner un nom au compte, par exemple « Personnel » ou « Travail ». Ajouter son
   accès officiel et sélectionner les droits. Pour une API IA, accepter séparément
   sa facturation éventuelle. Tester l’accès, puis terminer. Répéter pour un second
   compte du même service si souhaité ; chaque secret reste séparé côté serveur.
3. Dans un projet, ouvrir **Discussions**, puis **Choisir mes assistants** (ou
   **Mes assistants** si une équipe est déjà choisie). Choisir une réponse, une comparaison,
   une réalisation suivie d’une relecture, ou une collaboration limitée en tours.
4. Choisir jusqu’à trois connexions, les modèles et leurs missions. Les rôles
   sont modifiables ; aucune marque n’est désignée comme toujours meilleure.
5. Ouvrir **Adapter selon mes priorités**. Pour chaque mission, classer ses candidats
   et remplaçants. Choisir démarrage rapide, priorité aux choix préférés, ou attente
   maximale. La proposition affiche le choix, sa raison et les données inconnues.
6. Autoriser le partage aux connexions affichées, puis **Revenir à la discussion**.
   Le bouton **Contexte** permet de choisir et vérifier les sources. Les comptes et
   modèles sont résumés près du message ; un problème d’équipe reste visible dans
   le fil. Préparer une équipe ne lance aucune génération : l’envoi reste distinct.
7. Si une attente est proposée, autoriser explicitement le lancement différé, puis
   programmer l’envoi. La tâche est conservée côté serveur et peut être annulée.
   Le cron reprend les tâches dues, avec une précision d’environ cinq minutes,
   sous réserve de l’état de Queues et du serveur. Aucune durée totale n’est garantie.

Une limite inconnue reste inconnue. `Retry-After` indique un prochain essai conseillé,
pas une garantie de réinitialisation d’un abonnement. Si la date limite absolue est
dépassée avant la prise de tâche, celle-ci s’arrête sans appel IA. Si un autre refus
survient pendant le travail, les fichiers déjà enregistrés restent disponibles et
**Préparer un relais** conserve l’objectif et les références de contexte ; il faut
choisir et autoriser la nouvelle connexion avant d’envoyer.

Dans une connexion IA, on peut autoriser l’actualisation quotidienne du catalogue.
Elle lit des métadonnées officielles, sans génération payante ni benchmark. La date
et la révision sont affichées. Une modification du catalogue impose de réexaminer
la proposition avant envoi ; une tâche acceptée ne change pas de modèle silencieusement.

Le « meilleur choix » actuel est celui des préférences classées par mission, compatible
avec les disponibilités connues. Un classement automatique basé sur des évaluations
datées de qualité, vitesse et coût n’est pas encore intégré. La nouveauté d’un modèle
ne prouve pas qu’il est meilleur pour chaque tâche.

Le connecteur Claude présent utilise l’API Anthropic. Il ne connecte pas un compte
Claude Pro ou gratuit par son mot de passe. Les runtimes officiels Claude Code et
Codex, leur hébergement isolé et leurs authentifications restent à intégrer.
