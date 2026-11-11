-- Pilotage de deux projets (additif, un seul fichier). Les tâches du plan (plan_tasks) sont des tâches MÉTIER,
-- distinctes de la table `tasks` (jobs asynchrones techniques). Aucune donnée existante n'est modifiée.
-- Aucun dépôt n'est associé par la migration : une association exige une sélection explicite et une vérification GitHub.

CREATE TABLE project_profiles (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 space_key TEXT CHECK(space_key IS NULL OR space_key IN ('livre_recettes','sport')),
 objective TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','paused','blocked','done')),
 current_phase_id TEXT,
 site_url TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(user_id,space_key)
);

-- Vérification et traçabilité de l'association d'un dépôt (colonnes additives, lignes existantes : NULL / 0).
ALTER TABLE repositories ADD COLUMN verified_at TEXT;
ALTER TABLE repositories ADD COLUMN default_branch TEXT;
ALTER TABLE repositories ADD COLUMN can_push INTEGER;
ALTER TABLE repositories ADD COLUMN shared_ack INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repositories ADD COLUMN shared_ack_at TEXT;

CREATE TABLE plan_phases (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 title TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX plan_phases_project ON plan_phases(user_id,project_id,position);

CREATE TABLE plan_tasks (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 phase_id TEXT REFERENCES plan_phases(id) ON DELETE SET NULL,
 parent_id TEXT REFERENCES plan_tasks(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 objective TEXT NOT NULL DEFAULT '', acceptance TEXT NOT NULL DEFAULT '',
 priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3),
 owner TEXT NOT NULL DEFAULT 'user' CHECK(owner IN ('user','chatgpt','claude_code','codex','gemini','mistral','other_ai','automation')),
 status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','ready','in_progress','waiting','blocked','to_verify','done','abandoned')),
 depends_on TEXT NOT NULL DEFAULT '[]',
 conversation_id TEXT, file_ids TEXT NOT NULL DEFAULT '[]',
 branch TEXT, commit_sha TEXT, pr_number INTEGER,
 proof TEXT NOT NULL DEFAULT '', next_action TEXT NOT NULL DEFAULT '', blocking_question TEXT NOT NULL DEFAULT '',
 position INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX plan_tasks_project ON plan_tasks(user_id,project_id,status,priority,position);

CREATE TABLE project_decisions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 title TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','validated','rejected','superseded')),
 source_kind TEXT NOT NULL DEFAULT 'other' CHECK(source_kind IN ('conversation','message','report','pr','other')),
 source_ref TEXT NOT NULL DEFAULT '',
 supersedes_id TEXT REFERENCES project_decisions(id) ON DELETE SET NULL,
 decided_at TEXT, revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX project_decisions_project ON project_decisions(user_id,project_id,status,updated_at DESC);

-- Dossiers de transmission aux IA. Le texte transmis (rendered) est figé à l'état « Prêt à copier » : aperçu = export.
-- Les statuts « Copié » / « Exporté » ne sont posés que par une action locale explicite ; « Envoyé » n'existe pas ici
-- (aucun service externe ne confirme un envoi) : la contrainte l'interdit.
CREATE TABLE handoff_packages (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 task_id TEXT REFERENCES plan_tasks(id) ON DELETE SET NULL,
 parent_id TEXT, version INTEGER NOT NULL DEFAULT 1,
 title TEXT NOT NULL,
 destination TEXT NOT NULL CHECK(destination IN ('claude_code','chatgpt','codex','gemini','mistral','other')),
 objective TEXT NOT NULL DEFAULT '', instruction TEXT NOT NULL DEFAULT '',
 constraints TEXT NOT NULL DEFAULT '', success_criteria TEXT NOT NULL DEFAULT '',
 repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL,
 branch TEXT, base_sha TEXT, pr_number INTEGER,
 items TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','copied','exported','response_received','done')),
 rendered TEXT, content_hash TEXT, frozen_at TEXT,
 transfer_mode TEXT CHECK(transfer_mode IS NULL OR transfer_mode IN ('clipboard','download')), transferred_at TEXT,
 response_text TEXT NOT NULL DEFAULT '', response_url TEXT,
 result_branch TEXT, result_commit TEXT, result_pr INTEGER, result_verified INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX handoff_packages_project ON handoff_packages(user_id,project_id,updated_at DESC);
