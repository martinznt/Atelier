# Matrice des exigences — contrôle mécanique des preuves

Généré par `node scripts/requirements-audit.mjs --write` le 2026-11-13. 527 exigences, identifiants conservés.

**Règles (aucune n’est un jugement) :** VALIDÉ = au moins un fichier de test cité existe, tous les fichiers cités existent, aucune limite ne déclare une simulation, une absence de test ou un blocage. PARTIEL = preuve cassée ou limite déclarée. NON VÉRIFIÉ = réalisé sans preuve ou sans test cité. BLOQUÉ / À FAIRE = repris du statut déclaré.
**Ce que « VALIDÉ » ne veut pas dire :** le test cité couvre réellement l’exigence (non relu un par un) ; l’intégration a été essayée avec un vrai fournisseur ; la production a été vérifiée.

| Niveau | Nombre |
|---|---|
| À FAIRE | 165 |
| NON VÉRIFIÉ | 247 |
| BLOQUÉ | 45 |
| PARTIEL | 17 |
| VALIDÉ | 53 |

Preuves citées mais introuvables : **0**.

| ID | Section | Statut déclaré | Niveau retenu | Contrôle |
|---|---|---|---|---|
| REQ-00-001 | 0 | à faire | À FAIRE |  |
| REQ-00-002 | 0 | à faire | À FAIRE |  |
| REQ-00-003 | 0 | à faire | À FAIRE |  |
| REQ-00-004 | 0 | à faire | À FAIRE |  |
| REQ-01-001 | 1 | à faire | À FAIRE |  |
| REQ-01-002 | 1 | à faire | À FAIRE |  |
| REQ-01-003 | 1 | à faire | À FAIRE |  |
| REQ-01-004 | 1 | à faire | À FAIRE |  |
| REQ-01-005 | 1 | à faire | À FAIRE |  |
| REQ-01-006 | 1 | à faire | À FAIRE |  |
| REQ-01-007 | 1 | à faire | À FAIRE |  |
| REQ-01-008 | 1 | à faire | À FAIRE |  |
| REQ-01-009 | 1 | à faire | À FAIRE |  |
| REQ-01-010 | 1 | à faire | À FAIRE |  |
| REQ-01-011 | 1 | à faire | À FAIRE |  |
| REQ-01-012 | 1 | à faire | À FAIRE |  |
| REQ-01-013 | 1 | à faire | À FAIRE |  |
| REQ-01-014 | 1 | à faire | À FAIRE |  |
| REQ-01-015 | 1 | à faire | À FAIRE |  |
| REQ-01-016 | 1 | à faire | À FAIRE |  |
| REQ-01-017 | 1 | à faire | À FAIRE |  |
| REQ-01-018 | 1 | à faire | À FAIRE |  |
| REQ-01-019 | 1 | à faire | À FAIRE |  |
| REQ-02-001 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-002 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-003 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-004 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-005 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-006 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-007 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-008 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-009 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-010 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-011 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-012 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-02-013 | 2 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-03-001 | 3 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-03-002 | 3 | à faire | À FAIRE |  |
| REQ-03-003 | 3 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-03-004 | 3 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-03-005 | 3 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-03-006 | 3 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-03-007 | 3 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-03-008 | 3 | bloqué | BLOQUÉ |  |
| REQ-03-009 | 3 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-03-010 | 3 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-03-011 | 3 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-03-012 | 3 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-03-013 | 3 | réalisé | PARTIEL | limite déclarée : Création et reprises locales idempotentes vérifiées ; effets externes et crash Cloudflare non testés. |
| REQ-04-001 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-002 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-003 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-004 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-005 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-006 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-007 | 4 | à faire | À FAIRE |  |
| REQ-04-008 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-009 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-010 | 4 | à faire | À FAIRE |  |
| REQ-04-011 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-012 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-013 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-014 | 4 | réalisé | VALIDÉ | test(s) : tests/auth-store.test.mjs |
| REQ-04-015 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-016 | 4 | réalisé | PARTIEL | limite déclarée : Consommation atomique et refus de réutilisation vérifiés ; affichage navigateur non testé. |
| REQ-04-017 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-018 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-019 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-020 | 4 | réalisé | PARTIEL | limite déclarée : Tests SQLite/propriétaires et contrôleurs passerelle exécutés ; matrice HTTP complète non exécutée. Le compte attendu n’ |
| REQ-04-021 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-04-022 | 4 | bloqué | BLOQUÉ |  |
| REQ-04-023 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-001 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-002 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-003 | 5 | à faire | À FAIRE |  |
| REQ-05-004 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-005 | 5 | bloqué | BLOQUÉ |  |
| REQ-05-006 | 5 | bloqué | BLOQUÉ |  |
| REQ-05-007 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-008 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-009 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-010 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-011 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-012 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-013 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-014 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-015 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-016 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-017 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-018 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-019 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-020 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-021 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-022 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-023 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-024 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-025 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-026 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-027 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-05-028 | 5 | à faire | À FAIRE |  |
| REQ-05-029 | 5 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-001 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-002 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-003 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-004 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-005 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-006 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-007 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-008 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-009 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-010 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-011 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-012 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-013 | 6 | à faire | À FAIRE |  |
| REQ-06-014 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-015 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-016 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-017 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-018 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-06-019 | 6 | à faire | À FAIRE |  |
| REQ-06-020 | 6 | bloqué | BLOQUÉ |  |
| REQ-06-021 | 6 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-001 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-002 | 7 | bloqué | BLOQUÉ |  |
| REQ-07-003 | 7 | bloqué | BLOQUÉ |  |
| REQ-07-004 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-005 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-006 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-007 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-008 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-009 | 7 | à faire | À FAIRE |  |
| REQ-07-010 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-011 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-012 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-013 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-014 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-015 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-016 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-017 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-018 | 7 | bloqué | BLOQUÉ |  |
| REQ-07-019 | 7 | à faire | À FAIRE |  |
| REQ-07-020 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-021 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-022 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-023 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-024 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-025 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-07-026 | 7 | à faire | À FAIRE |  |
| REQ-07-027 | 7 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-001 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-002 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-003 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-004 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-005 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-006 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-007 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-008 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-009 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-010 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-011 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-012 | 8 | à faire | À FAIRE |  |
| REQ-08-013 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-014 | 8 | à faire | À FAIRE |  |
| REQ-08-015 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-016 | 8 | à faire | À FAIRE |  |
| REQ-08-017 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-018 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-019 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-020 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-021 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-022 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-023 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-08-024 | 8 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-001 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-002 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-003 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-004 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-005 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-006 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-007 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-008 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-009 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-010 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-011 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-012 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-013 | 9 | à faire | À FAIRE |  |
| REQ-09-014 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-015 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-016 | 9 | à faire | À FAIRE |  |
| REQ-09-017 | 9 | à faire | À FAIRE |  |
| REQ-09-018 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-019 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-020 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-021 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-022 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-023 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-024 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-025 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-026 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-027 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-028 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-029 | 9 | à faire | À FAIRE |  |
| REQ-09-030 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-09-031 | 9 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-10-001 | 10 | à faire | À FAIRE |  |
| REQ-10-002 | 10 | à faire | À FAIRE |  |
| REQ-10-003 | 10 | à faire | À FAIRE |  |
| REQ-10-004 | 10 | à faire | À FAIRE |  |
| REQ-10-005 | 10 | à faire | À FAIRE |  |
| REQ-10-006 | 10 | à faire | À FAIRE |  |
| REQ-10-007 | 10 | à faire | À FAIRE |  |
| REQ-10-008 | 10 | à faire | À FAIRE |  |
| REQ-10-009 | 10 | à faire | À FAIRE |  |
| REQ-10-010 | 10 | à faire | À FAIRE |  |
| REQ-10-011 | 10 | à faire | À FAIRE |  |
| REQ-10-012 | 10 | à faire | À FAIRE |  |
| REQ-10-013 | 10 | à faire | À FAIRE |  |
| REQ-10-014 | 10 | à faire | À FAIRE |  |
| REQ-10-015 | 10 | à faire | À FAIRE |  |
| REQ-10-016 | 10 | à faire | À FAIRE |  |
| REQ-10-017 | 10 | à faire | À FAIRE |  |
| REQ-10-018 | 10 | à faire | À FAIRE |  |
| REQ-10-019 | 10 | à faire | À FAIRE |  |
| REQ-10-020 | 10 | à faire | À FAIRE |  |
| REQ-10-021 | 10 | à faire | À FAIRE |  |
| REQ-10-022 | 10 | à faire | À FAIRE |  |
| REQ-10-023 | 10 | à faire | À FAIRE |  |
| REQ-10-024 | 10 | à faire | À FAIRE |  |
| REQ-10-025 | 10 | à faire | À FAIRE |  |
| REQ-10-026 | 10 | à faire | À FAIRE |  |
| REQ-10-027 | 10 | à faire | À FAIRE |  |
| REQ-11-001 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-002 | 11 | à faire | À FAIRE |  |
| REQ-11-003 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-004 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-005 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-006 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-007 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-008 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-009 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-010 | 11 | à faire | À FAIRE |  |
| REQ-11-011 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-012 | 11 | à faire | À FAIRE |  |
| REQ-11-013 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-014 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-015 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-016 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-11-017 | 11 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-12-001 | 12 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-12-002 | 12 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-12-003 | 12 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-12-004 | 12 | bloqué | BLOQUÉ |  |
| REQ-12-005 | 12 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-12-006 | 12 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-12-007 | 12 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-12-008 | 12 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-12-009 | 12 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-12-010 | 12 | à faire | À FAIRE |  |
| REQ-13-001 | 13 | à faire | À FAIRE |  |
| REQ-13-002 | 13 | à faire | À FAIRE |  |
| REQ-13-003 | 13 | à faire | À FAIRE |  |
| REQ-13-004 | 13 | à faire | À FAIRE |  |
| REQ-13-005 | 13 | à faire | À FAIRE |  |
| REQ-13-006 | 13 | à faire | À FAIRE |  |
| REQ-13-007 | 13 | à faire | À FAIRE |  |
| REQ-13-008 | 13 | à faire | À FAIRE |  |
| REQ-13-009 | 13 | à faire | À FAIRE |  |
| REQ-13-010 | 13 | à faire | À FAIRE |  |
| REQ-13-011 | 13 | à faire | À FAIRE |  |
| REQ-13-012 | 13 | à faire | À FAIRE |  |
| REQ-13-013 | 13 | à faire | À FAIRE |  |
| REQ-13-014 | 13 | à faire | À FAIRE |  |
| REQ-13-015 | 13 | à faire | À FAIRE |  |
| REQ-13-016 | 13 | à faire | À FAIRE |  |
| REQ-13-017 | 13 | à faire | À FAIRE |  |
| REQ-13-018 | 13 | à faire | À FAIRE |  |
| REQ-13-019 | 13 | à faire | À FAIRE |  |
| REQ-13-020 | 13 | à faire | À FAIRE |  |
| REQ-13-021 | 13 | à faire | À FAIRE |  |
| REQ-13-022 | 13 | à faire | À FAIRE |  |
| REQ-13-023 | 13 | à faire | À FAIRE |  |
| REQ-13-024 | 13 | à faire | À FAIRE |  |
| REQ-13-025 | 13 | à faire | À FAIRE |  |
| REQ-13-026 | 13 | à faire | À FAIRE |  |
| REQ-13-027 | 13 | réalisé | VALIDÉ | test(s) : tests/submission.test.mjs |
| REQ-13-028 | 13 | à faire | À FAIRE |  |
| REQ-13-029 | 13 | à faire | À FAIRE |  |
| REQ-13-030 | 13 | à faire | À FAIRE |  |
| REQ-13-031 | 13 | à faire | À FAIRE |  |
| REQ-13-032 | 13 | réalisé | VALIDÉ | test(s) : tests/transport.test.mjs, tests/vault.test.mjs |
| REQ-13-033 | 13 | à faire | À FAIRE |  |
| REQ-14-001 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-002 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-003 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-004 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-005 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-006 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-007 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-008 | 14 | à faire | À FAIRE |  |
| REQ-14-009 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-010 | 14 | réalisé | VALIDÉ | test(s) : tests/submission.test.mjs |
| REQ-14-011 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-012 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-013 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-014 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-015 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-016 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-017 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-018 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-019 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-020 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-021 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-14-022 | 14 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-15-001 | 15 | bloqué | BLOQUÉ |  |
| REQ-15-002 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-003 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-004 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-005 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-006 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-007 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-008 | 15 | à faire | À FAIRE |  |
| REQ-15-009 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-010 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-011 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-012 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-013 | 15 | à faire | À FAIRE |  |
| REQ-15-014 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-015 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-15-016 | 15 | vérifié | VALIDÉ | test(s) : tests/schema_test.py |
| REQ-15-017 | 15 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-16-001 | 16 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-16-002 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-003 | 16 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-16-004 | 16 | vérifié | VALIDÉ | test(s) : tests/core.test.mjs, tests/schema_test.py |
| REQ-16-005 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-006 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-007 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-008 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-009 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-010 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-011 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-012 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-013 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-014 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-015 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-016 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-017 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-018 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-019 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-020 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-021 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-022 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-023 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-024 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-025 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-026 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-027 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-028 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-029 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-030 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-031 | 16 | bloqué | BLOQUÉ |  |
| REQ-16-032 | 16 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-17-001 | 17 | à faire | À FAIRE |  |
| REQ-17-002 | 17 | à faire | À FAIRE |  |
| REQ-17-003 | 17 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-17-004 | 17 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-17-005 | 17 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-17-006 | 17 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-17-007 | 17 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-17-008 | 17 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-17-009 | 17 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-17-010 | 17 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-17-011 | 17 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-17-012 | 17 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-17-013 | 17 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-17-014 | 17 | à faire | À FAIRE |  |
| REQ-17-015 | 17 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-17-016 | 17 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-17-017 | 17 | réalisé | NON VÉRIFIÉ | aucune preuve citée |
| REQ-18-001 | 18 | à faire | À FAIRE |  |
| REQ-18-002 | 18 | à faire | À FAIRE |  |
| REQ-19-001 | 19 | à faire | À FAIRE |  |
| REQ-19-002 | 19 | à faire | À FAIRE |  |
| REQ-19-003 | 19 | vérifié | NON VÉRIFIÉ | aucune preuve citée |
| REQ-19-004 | 19 | à faire | À FAIRE |  |
| REQ-19-005 | 19 | à faire | À FAIRE |  |
| REQ-20-001 | 20 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-20-002 | 20 | bloqué | BLOQUÉ |  |
| REQ-20-003 | 20 | bloqué | BLOQUÉ |  |
| REQ-20-004 | 20 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-20-005 | 20 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-20-006 | 20 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-20-007 | 20 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-21-001 | 21 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-21-002 | 21 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-22-001 | 22 | vérifié | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-22-002 | 22 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-22-003 | 22 | à faire | À FAIRE |  |
| REQ-23-001 | 23 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-23-002 | 23 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-23-003 | 23 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-24-001 | 24 | réalisé | VALIDÉ | test(s) : tests/collaboration.test.mjs |
| REQ-24-002 | 24 | réalisé | VALIDÉ | test(s) : tests/planning.test.mjs |
| REQ-24-003 | 24 | réalisé | VALIDÉ | test(s) : tests/planning.test.mjs |
| REQ-25-001 | 25 | à faire | À FAIRE |  |
| REQ-25-002 | 25 | à faire | À FAIRE |  |
| REQ-25-003 | 25 | à faire | À FAIRE |  |
| REQ-26-001 | 26 | à faire | À FAIRE |  |
| REQ-27-001 | 27 | réalisé | PARTIEL | limite déclarée : 11 tests identité et un transport exécutés sur helpers/politiques ; compilation, routes HTTP et navigateur non exécutés. |
| REQ-27-002 | 27 | réalisé | PARTIEL | limite déclarée : 11 tests identité et un transport exécutés sur helpers/politiques ; compilation, routes HTTP et navigateur non exécutés. |
| RF-00-001 | 0 | à faire | À FAIRE |  |
| RF-01-001 | 1 | à faire | À FAIRE |  |
| RF-01-002 | 1 | à faire | À FAIRE |  |
| RF-02-001 | 2 | à faire | À FAIRE |  |
| RF-02-002 | 2 | à faire | À FAIRE |  |
| RF-03-001 | 3 | réalisé | PARTIEL | limite déclarée : Partiellement réalisée : code sans R2 et 11 tests SQLite réussis ; anciens contenus externes non récupérés, compilation/ |
| RF-03-002 | 3 | réalisé | PARTIEL | limite déclarée : Partiellement réalisée : code sans R2 et 11 tests SQLite réussis ; anciens contenus externes non récupérés, compilation/ |
| RF-04-001 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| RF-04-002 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| RF-04-003 | 4 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| RF-05-001 | 5 | à faire | À FAIRE |  |
| RF-05-002 | 5 | à faire | À FAIRE |  |
| RF-05-003 | 5 | à faire | À FAIRE |  |
| RF-06-001 | 6 | à faire | À FAIRE |  |
| RF-06-002 | 6 | à faire | À FAIRE |  |
| RF-07-001 | 7 | à faire | À FAIRE |  |
| RF-07-002 | 7 | à faire | À FAIRE |  |
| RF-08-001 | 8 | à faire | À FAIRE |  |
| RF-08-002 | 8 | à faire | À FAIRE |  |
| RF-08-003 | 8 | à faire | À FAIRE |  |
| RF-08-004 | 8 | à faire | À FAIRE |  |
| RF-09-001 | 9 | à faire | À FAIRE |  |
| RF-09-002 | 9 | à faire | À FAIRE |  |
| RF-09-003 | 9 | à faire | À FAIRE |  |
| RF-09-004 | 9 | à faire | À FAIRE |  |
| RF-10-001 | 10 | à faire | À FAIRE |  |
| RF-11-001 | 11 | à faire | À FAIRE |  |
| RF-11-002 | 11 | à faire | À FAIRE |  |
| RF-12-001 | 12 | à faire | À FAIRE |  |
| RF-12-002 | 12 | à faire | À FAIRE |  |
| RF-13-001 | 13 | à faire | À FAIRE |  |
| RF-13-002 | 13 | à faire | À FAIRE |  |
| RF-14-001 | 14 | à faire | À FAIRE |  |
| RF-15-001 | 15 | à faire | À FAIRE |  |
| RF-16-001 | 16 | à faire | À FAIRE |  |
| RF-17-001 | 17 | à faire | À FAIRE |  |
| RF-18-001 | 18 | à faire | À FAIRE |  |
| RF-18-002 | 18 | à faire | À FAIRE |  |
| RF-18-003 | 18 | à faire | À FAIRE |  |
| RF-18-004 | 18 | à faire | À FAIRE |  |
| RF-19-001 | 19 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| RF-20-001 | 20 | à faire | À FAIRE |  |
| RF-21-001 | 21 | à faire | À FAIRE |  |
| RF-22-001 | 22 | à faire | À FAIRE |  |
| RF-23-001 | 23 | à faire | À FAIRE |  |
| REQ-23-004 | 23 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-23-005 | 23 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-23-006 | 23 | bloqué | BLOQUÉ |  |
| REQ-23-007 | 23 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| REQ-23-008 | 23 | à faire | À FAIRE |  |
| REQ-24-004 | 24 | réalisé | VALIDÉ | test(s) : tests/task-persistence.test.mjs |
| REQ-24-005 | 24 | réalisé | VALIDÉ | test(s) : tests/model-catalog.test.mjs, tests/model-list.test.mjs |
| REQ-24-006 | 24 | à faire | À FAIRE |  |
| REQ-24-007 | 24 | réalisé | VALIDÉ | test(s) : tests/planning.test.mjs |
| REQ-24-008 | 24 | réalisé | PARTIEL | limite déclarée : Proposition confirmée avant la tâche, accord de partage et clé d’idempotence ; relais pendant une tâche encore manuel. |
| PIL-28-001 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-002 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-003 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-004 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-005 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-006 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-007 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-008 | 28 | réalisé | PARTIEL | limite déclarée : Parcours hors connexion non rejoué dans un navigateur réellement coupé du réseau. |
| PIL-28-009 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-010 | 28 | réalisé | PARTIEL | limite déclarée : Testé avec des réponses GitHub simulées ; aucune synchronisation réelle exécutée avec le jeton de Martin. |
| PIL-28-011 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-012 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-013 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-014 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-015 | 28 | réalisé | PARTIEL | limite déclarée : Réalisé le 12 novembre 2026 par la branche feat/atelier-analyse-historique : lecture automatique et seconde lecture indé |
| PIL-28-016 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-017 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-018 | 28 | réalisé | PARTIEL | limite déclarée : Testé avec des réponses GitHub simulées ; l’analyse par outil ne remplace pas une lecture. |
| PIL-28-019 | 28 | réalisé | PARTIEL | limite déclarée : Simulé uniquement. |
| PIL-28-020 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-021 | 28 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts, tests/workbench-core.test.mjs |
| PIL-28-022 | 28 | réalisé | VALIDÉ | test(s) : tests/e2e/flow.spec.ts |
| PIL-28-023 | 28 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| PIL-28-024 | 28 | à faire | À FAIRE |  |
| PIL-28-025 | 28 | bloqué | BLOQUÉ |  |
| QCL-29-001 | 29 | réalisé | VALIDÉ | test(s) : tests/claude-advisor.test.mjs, tests/integration.test.ts |
| QCL-29-002 | 29 | réalisé | VALIDÉ | test(s) : tests/claude-advisor.test.mjs, tests/integration.test.ts |
| QCL-29-003 | 29 | réalisé | VALIDÉ | test(s) : tests/claude-advisor.test.mjs, tests/integration.test.ts |
| QCL-29-004 | 29 | réalisé | VALIDÉ | test(s) : tests/claude-advisor.test.mjs, tests/integration.test.ts |
| QCL-29-005 | 29 | réalisé | VALIDÉ | test(s) : tests/claude-advisor.test.mjs, tests/integration.test.ts |
| QCL-29-006 | 29 | réalisé | VALIDÉ | test(s) : tests/claude-advisor.test.mjs, tests/integration.test.ts |
| QCL-29-007 | 29 | réalisé | VALIDÉ | test(s) : tests/claude-advisor.test.mjs, tests/integration.test.ts |
| QCL-29-008 | 29 | réalisé | VALIDÉ | test(s) : tests/claude-advisor.test.mjs, tests/integration.test.ts |
| QCL-29-009 | 29 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| QCL-29-010 | 29 | réalisé | VALIDÉ | test(s) : tests/claude-advisor.test.mjs, tests/integration.test.ts |
| QCL-29-011 | 29 | réalisé | VALIDÉ | test(s) : tests/claude-advisor.test.mjs, tests/integration.test.ts |
| QCL-29-012 | 29 | à faire | À FAIRE |  |
| HIS-30-001 | 30 | réalisé | PARTIEL | limite déclarée : Simulé : aucun appel réel à un fournisseur. |
| HIS-30-002 | 30 | réalisé | VALIDÉ | test(s) : tests/history-analysis.test.mjs, tests/integration.test.ts |
| HIS-30-003 | 30 | réalisé | VALIDÉ | test(s) : tests/history-analysis.test.mjs, tests/integration.test.ts |
| HIS-30-004 | 30 | réalisé | VALIDÉ | test(s) : tests/history-analysis.test.mjs, tests/integration.test.ts |
| HIS-30-005 | 30 | réalisé | VALIDÉ | test(s) : tests/history-analysis.test.mjs, tests/integration.test.ts |
| HIS-30-006 | 30 | réalisé | VALIDÉ | test(s) : tests/history-analysis.test.mjs, tests/integration.test.ts |
| HIS-30-007 | 30 | réalisé | VALIDÉ | test(s) : tests/history-analysis.test.mjs, tests/integration.test.ts |
| HIS-30-008 | 30 | bloqué | BLOQUÉ |  |
| HIS-30-009 | 30 | à faire | À FAIRE |  |
| HIS-30-010 | 30 | réalisé | NON VÉRIFIÉ | code cité, aucun test cité |
| FIN-31-001 | 31 | réalisé | PARTIEL | limite déclarée : Mesuré sur Chromium de bureau (96 Mo : mémoire du processus +80 Mo environ) ; non vérifié sur le Galaxy A05s réel. |
| FIN-31-002 | 31 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts |
| FIN-31-003 | 31 | réalisé | VALIDÉ | test(s) : tests/zip-reader.test.mjs, tests/integration.test.ts |
| FIN-31-004 | 31 | réalisé | VALIDÉ | test(s) : tests/zip-reader.test.mjs, tests/integration.test.ts |
| FIN-31-005 | 31 | réalisé | VALIDÉ | test(s) : tests/zip-reader.test.mjs, tests/integration.test.ts |
| FIN-31-006 | 31 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts |
| FIN-31-007 | 31 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts |
| FIN-31-008 | 31 | réalisé | PARTIEL | limite déclarée : Recherche par texte exact (LIKE), sans pertinence ni FTS ; sur D1 en production chaque recherche lit toutes les lignes c |
| FIN-31-009 | 31 | réalisé | VALIDÉ | test(s) : tests/workbench-core.test.mjs, tests/integration.test.ts |
| FIN-31-010 | 31 | à faire | À FAIRE |  |
| FIN-31-011 | 31 | réalisé | VALIDÉ | test(s) : tests/integration.test.ts |
| FIN-31-012 | 31 | réalisé | PARTIEL | limite déclarée : Chromium uniquement : non vérifié sur le téléphone réel, ni WebKit, ni Firefox. |
| FIN-31-013 | 31 | bloqué | BLOQUÉ |  |
| FIN-31-014 | 31 | bloqué | BLOQUÉ |  |
| FIN-31-015 | 31 | à faire | À FAIRE |  |
