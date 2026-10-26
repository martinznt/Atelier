-- Revues de pull requests : aucun secret stocké, accès isolé par utilisateur.
CREATE TABLE IF NOT EXISTS review_configs (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
 primary_connection_id TEXT NOT NULL,
 primary_model TEXT NOT NULL,
 secondary_connection_id TEXT,
 secondary_model TEXT,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 consent INTEGER NOT NULL DEFAULT 0 CHECK(consent IN (0,1)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(user_id,repository_id)
);
CREATE INDEX IF NOT EXISTS review_configs_enabled ON review_configs(enabled,updated_at);
CREATE TABLE IF NOT EXISTS review_runs (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
 pr_number INTEGER NOT NULL,
 head_sha TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','partial','stale','interrupted')),
 report TEXT,
 error TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 completed_at TEXT,
 UNIQUE(user_id,repository_id,pr_number,head_sha)
);
CREATE INDEX IF NOT EXISTS review_runs_recent ON review_runs(user_id,project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS review_runs_queue ON review_runs(status,created_at);
