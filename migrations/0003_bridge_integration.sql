CREATE TABLE bridge_project_spaces (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 space_id TEXT NOT NULL UNIQUE REFERENCES bridge_spaces(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE bridge_oauth_clients (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, redirects TEXT NOT NULL, auth_method TEXT NOT NULL,
 secret_hash TEXT, created_at TEXT NOT NULL
);
CREATE TABLE bridge_oauth_grants (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 client_id TEXT NOT NULL REFERENCES bridge_oauth_clients(id) ON DELETE CASCADE,
 assistant TEXT NOT NULL, scope TEXT NOT NULL, resource TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, last_used_at TEXT
);
CREATE INDEX bridge_grants_owner ON bridge_oauth_grants(user_id,created_at DESC);
CREATE TABLE bridge_oauth_codes (
 hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES bridge_oauth_grants(id) ON DELETE CASCADE,
 redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
);
CREATE TABLE bridge_oauth_tokens (
 hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES bridge_oauth_grants(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('access','refresh')), expires_at TEXT NOT NULL, used_at TEXT
);
CREATE INDEX bridge_tokens_grant ON bridge_oauth_tokens(grant_id);
CREATE TABLE bridge_auth_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE bridge_site_links (
 site_user_id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL
);
CREATE TRIGGER bridge_project_cleanup BEFORE DELETE ON projects BEGIN
 DELETE FROM bridge_spaces WHERE id IN (SELECT space_id FROM bridge_project_spaces WHERE project_id=OLD.id);
END;
CREATE TRIGGER bridge_user_cleanup BEFORE DELETE ON users BEGIN
 DELETE FROM bridge_spaces WHERE owner_id=OLD.id;
 DELETE FROM bridge_import_usage WHERE owner_id=OLD.id;
 DELETE FROM bridge_access_log WHERE owner_id=OLD.id;
END;
