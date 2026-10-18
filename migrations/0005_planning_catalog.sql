ALTER TABLE tasks ADD COLUMN not_before TEXT;
CREATE INDEX tasks_scheduled ON tasks(status,not_before,created_at);
ALTER TABLE connections ADD COLUMN models_checked_at TEXT;
ALTER TABLE connections ADD COLUMN models_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE connections ADD COLUMN auto_refresh_models INTEGER NOT NULL DEFAULT 0 CHECK(auto_refresh_models IN (0,1));
ALTER TABLE connections ADD COLUMN models_refresh_attempted_at TEXT;
