-- Lot 5B, étape 5B-4 — Guidage par règles : ce que Martin a décidé pour chaque suggestion (additif, une table nouvelle).
-- Une suggestion refusée ne revient pas : sa clé (règle + blocs + valeurs en jeu) est gardée ici. Rien n'est supprimé ailleurs.
CREATE TABLE mockup_suggestion_decisions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 mockup_id TEXT NOT NULL REFERENCES mockups(id) ON DELETE CASCADE,
 rule TEXT NOT NULL,
 target_key TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('accepted','refused')),
 summary TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(mockup_id,rule,target_key)
);
CREATE INDEX mockup_suggestion_decisions_mockup ON mockup_suggestion_decisions(user_id,mockup_id);
