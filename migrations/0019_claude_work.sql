-- Pilotage du travail avec Claude (additif). Aucune donnée existante n'est modifiée.
-- Règle d'or : un relevé de quota n'existe que s'il a été saisi ou collé par l'utilisateur depuis un écran officiel.
-- Atelier ne mesure rien lui-même et n'invente ni pourcentage ni date de réinitialisation.

-- Dossier de travail d'une tâche : ce qui manquait pour préparer une transmission précise.
ALTER TABLE plan_tasks ADD COLUMN work_kind TEXT NOT NULL DEFAULT '' CHECK(work_kind IN ('','mechanical_check','classification','documentation','development','fix','analysis','review','audit','architecture','blocker'));
ALTER TABLE plan_tasks ADD COLUMN complexity TEXT NOT NULL DEFAULT '' CHECK(complexity IN ('','simple','ordinary','complex','hard'));
ALTER TABLE plan_tasks ADD COLUMN importance TEXT NOT NULL DEFAULT '' CHECK(importance IN ('','low','normal','high','critical'));
ALTER TABLE plan_tasks ADD COLUMN constraints_text TEXT NOT NULL DEFAULT '';
ALTER TABLE plan_tasks ADD COLUMN do_not_touch TEXT NOT NULL DEFAULT '';
ALTER TABLE plan_tasks ADD COLUMN already_verified TEXT NOT NULL DEFAULT '';
ALTER TABLE plan_tasks ADD COLUMN difficulties TEXT NOT NULL DEFAULT '';
ALTER TABLE plan_tasks ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 99);
ALTER TABLE plan_tasks ADD COLUMN failure_analysed INTEGER NOT NULL DEFAULT 0 CHECK(failure_analysed IN (0,1));

-- Relevés de quota : toujours saisis par l'utilisateur. « source » dit d'où il a lu la valeur.
CREATE TABLE quota_readings (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scope TEXT NOT NULL CHECK(scope IN ('session_5h','weekly','weekly_model','spend','other')),
 model_family TEXT NOT NULL DEFAULT 'all' CHECK(model_family IN ('all','haiku','sonnet','opus','fable','other')),
 used_percent REAL CHECK(used_percent IS NULL OR (used_percent>=0 AND used_percent<=100)),
 resets_at TEXT,
 source TEXT NOT NULL CHECK(source IN ('usage_screen','statusline_json','screenshot','declared')),
 -- Capture d'écran : elle reste sur l'appareil (le stockage intégré n'accepte que du texte). Seuls son nom et son empreinte sont gardés.
 evidence_name TEXT,
 evidence_sha256 TEXT CHECK(evidence_sha256 IS NULL OR length(evidence_sha256)=64),
 note TEXT NOT NULL DEFAULT '',
 observed_at TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX quota_readings_recent ON quota_readings(user_id,scope,model_family,observed_at DESC);

CREATE TABLE quota_alerts (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scope TEXT NOT NULL CHECK(scope IN ('session_5h','weekly','weekly_model','spend','other')),
 model_family TEXT NOT NULL CHECK(model_family IN ('all','haiku','sonnet','opus','fable','other')),
 threshold INTEGER NOT NULL CHECK(threshold BETWEEN 1 AND 100),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,scope,model_family)
);

-- Retour structuré après un travail. La consommation n'est renseignée que si l'utilisateur l'a relevée.
CREATE TABLE work_sessions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
 task_id TEXT REFERENCES plan_tasks(id) ON DELETE SET NULL,
 prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
 title TEXT NOT NULL,
 model_family TEXT NOT NULL DEFAULT 'other' CHECK(model_family IN ('haiku','sonnet','opus','fable','other')),
 model_label TEXT NOT NULL DEFAULT '',
 effort TEXT NOT NULL DEFAULT '' CHECK(effort IN ('','low','medium','high','xhigh','max')),
 outcome TEXT NOT NULL DEFAULT 'done' CHECK(outcome IN ('done','partial','failed')),
 changes TEXT NOT NULL DEFAULT '',
 files_modified TEXT NOT NULL DEFAULT '',
 tests_run TEXT NOT NULL DEFAULT '',
 results TEXT NOT NULL DEFAULT '',
 unresolved TEXT NOT NULL DEFAULT '',
 decisions TEXT NOT NULL DEFAULT '',
 next_steps TEXT NOT NULL DEFAULT '',
 usage_source TEXT NOT NULL DEFAULT 'none' CHECK(usage_source IN ('none','usage_screen','declared')),
 cost_usd REAL CHECK(cost_usd IS NULL OR cost_usd>=0),
 input_tokens INTEGER CHECK(input_tokens IS NULL OR input_tokens>=0),
 output_tokens INTEGER CHECK(output_tokens IS NULL OR output_tokens>=0),
 cache_read_tokens INTEGER CHECK(cache_read_tokens IS NULL OR cache_read_tokens>=0),
 worked_at TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX work_sessions_recent ON work_sessions(user_id,project_id,worked_at DESC);
CREATE INDEX work_sessions_task ON work_sessions(user_id,task_id,worked_at DESC);

-- Point de reprise : état concis pour repartir dans une nouvelle session sans retransmettre l'ancienne.
CREATE TABLE checkpoints (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
 task_id TEXT REFERENCES plan_tasks(id) ON DELETE SET NULL,
 conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
 title TEXT NOT NULL,
 objective TEXT NOT NULL DEFAULT '',
 done TEXT NOT NULL DEFAULT '',
 remaining TEXT NOT NULL DEFAULT '',
 decisions TEXT NOT NULL DEFAULT '',
 files_modified TEXT NOT NULL DEFAULT '',
 errors TEXT NOT NULL DEFAULT '',
 tests TEXT NOT NULL DEFAULT '',
 next_action TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX checkpoints_recent ON checkpoints(user_id,project_id,updated_at DESC);
