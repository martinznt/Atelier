-- Relais automatique entre IA et historique de consommation (additif ; aucune donnée existante modifiée).
-- ai_usage : un appel IA réel par ligne (refusé, interrompu ou terminé), par connexion, fournisseur et modèle.
-- Les jetons ne sont renseignés que lorsque le fournisseur les a renvoyés ; sinon NULL (inconnu).
CREATE TABLE IF NOT EXISTS ai_usage (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 connection_id TEXT NOT NULL,
 provider TEXT NOT NULL,
 model TEXT NOT NULL,
 task_kind TEXT NOT NULL,
 task_id TEXT,
 role TEXT,
 outcome TEXT NOT NULL CHECK(outcome IN ('completed','refused','interrupted')),
 failure_kind TEXT,
 input_tokens INTEGER,
 output_tokens INTEGER,
 started_at TEXT NOT NULL,
 ended_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_user_recent ON ai_usage(user_id,started_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_connection_recent ON ai_usage(connection_id,started_at DESC);
ALTER TABLE review_configs ADD COLUMN relay INTEGER NOT NULL DEFAULT 1 CHECK(relay IN (0,1));
ALTER TABLE review_configs ADD COLUMN relay_max_attempts INTEGER NOT NULL DEFAULT 3 CHECK(relay_max_attempts BETWEEN 1 AND 5);
-- Reprise automatique après réinitialisation d'une limite : date de reprise et état déjà acquis (rapports terminés).
ALTER TABLE review_runs ADD COLUMN resume_at TEXT;
ALTER TABLE review_runs ADD COLUMN resume_state TEXT;
