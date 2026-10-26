-- Plafond de protection : une configuration ne peut pas déclencher un nombre illimité de requêtes externes.
ALTER TABLE review_configs ADD COLUMN daily_limit INTEGER NOT NULL DEFAULT 2 CHECK(daily_limit BETWEEN 1 AND 4);
