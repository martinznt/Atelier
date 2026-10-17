PRAGMA foreign_keys = ON;
CREATE TABLE users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL,
 storage_used INTEGER NOT NULL DEFAULT 0 CHECK(storage_used >= 0),
 monthly_tokens INTEGER NOT NULL DEFAULT 100000, deleted_at TEXT
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX sessions_owner ON sessions(user_id);
CREATE TABLE recovery_codes (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, code_hash TEXT NOT NULL,
 PRIMARY KEY(user_id,code_hash)
);
CREATE TABLE auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE projects (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '',
 color TEXT NOT NULL DEFAULT 'sage', archived INTEGER NOT NULL DEFAULT 0, favorite INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX projects_owner ON projects(user_id,updated_at DESC,id);
CREATE TABLE connections (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider TEXT NOT NULL, label TEXT NOT NULL, secret TEXT NOT NULL, scopes TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'untested', models TEXT NOT NULL DEFAULT '[]',
 account_label TEXT, quota TEXT, tested_at TEXT, expires_at TEXT, created_at TEXT NOT NULL,
 api_consent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX connections_owner ON connections(user_id);
CREATE TABLE conversations (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 title TEXT NOT NULL, parent_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX conversations_owner ON conversations(user_id,project_id,updated_at DESC);
CREATE TABLE messages (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('user','assistant','note')), content TEXT NOT NULL,
 provider TEXT, model TEXT, task_id TEXT, status TEXT NOT NULL DEFAULT 'final',
 created_at TEXT NOT NULL
);
CREATE INDEX messages_page ON messages(user_id,conversation_id,seq DESC);
CREATE TABLE memory (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, task_id TEXT,
 kind TEXT NOT NULL DEFAULT 'note', title TEXT NOT NULL, content TEXT NOT NULL,
 source TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, supersedes TEXT,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX memory_owner ON memory(user_id,project_id);
CREATE TABLE memory_history (
 id TEXT PRIMARY KEY, memory_id TEXT NOT NULL REFERENCES memory(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 content TEXT NOT NULL, title TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE files (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 name TEXT NOT NULL, mime TEXT NOT NULL, collection TEXT NOT NULL DEFAULT '',
 author TEXT NOT NULL, conversation_id TEXT, task_id TEXT, repository TEXT, branch TEXT, commit_sha TEXT,
 current_version INTEGER NOT NULL DEFAULT 0, trashed INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX files_owner ON files(user_id,project_id,updated_at DESC,id);
CREATE TABLE file_versions (
 id TEXT PRIMARY KEY, file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 version INTEGER NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('draft','final','incomplete')), created_at TEXT NOT NULL,
 UNIQUE(file_id,version)
);
CREATE TRIGGER immutable_versions BEFORE UPDATE ON file_versions BEGIN SELECT RAISE(ABORT,'immutable version'); END;
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
 idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'chat',
 status TEXT NOT NULL DEFAULT 'queued', payload TEXT NOT NULL, context TEXT NOT NULL,
 error TEXT, cancel_requested INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER, output_tokens INTEGER,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, started_at TEXT, completed_at TEXT,
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX tasks_owner ON tasks(user_id,updated_at DESC,id);
CREATE INDEX tasks_status ON tasks(status,updated_at);
CREATE TABLE events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT, task_id TEXT, kind TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX events_owner ON events(user_id,seq DESC);
CREATE TABLE repositories (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
 full_name TEXT NOT NULL, branch TEXT NOT NULL, head_sha TEXT NOT NULL,
 auto_deploy TEXT NOT NULL DEFAULT 'unknown', created_at TEXT NOT NULL,
 UNIQUE(project_id,connection_id,full_name,branch)
);
CREATE TABLE deployment_targets (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
 name TEXT NOT NULL, remote_id TEXT NOT NULL, account_id TEXT,
 environment TEXT NOT NULL CHECK(environment IN ('preview','production')), created_at TEXT NOT NULL
);
CREATE TABLE deployments (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 target_id TEXT NOT NULL REFERENCES deployment_targets(id) ON DELETE CASCADE,
 task_id TEXT, remote_id TEXT, status TEXT NOT NULL, url TEXT, branch TEXT, commit_sha TEXT,
 detail TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
