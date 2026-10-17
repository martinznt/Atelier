PRAGMA foreign_keys = ON;
CREATE TABLE bridge_spaces (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  shared INTEGER NOT NULL DEFAULT 0 CHECK (shared IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX spaces_owner ON bridge_spaces(owner_id, updated_at DESC);
CREATE TABLE bridge_context_versions (
  space_id TEXT NOT NULL REFERENCES bridge_spaces(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (space_id, revision)
);
CREATE TABLE bridge_conversations (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES bridge_spaces(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  title TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  missing TEXT NOT NULL DEFAULT '',
  UNIQUE (space_id, source_key)
);
CREATE INDEX conversations_space ON bridge_conversations(space_id, imported_at DESC, id);
CREATE TABLE bridge_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES bridge_conversations(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  original_date TEXT,
  parent_source_key TEXT,
  content_hash TEXT NOT NULL,
  UNIQUE (conversation_id, source_key)
);
CREATE INDEX messages_conversation ON bridge_messages(conversation_id, seq);
CREATE TABLE bridge_handoffs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  space_id TEXT NOT NULL REFERENCES bridge_spaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  recipient TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (space_id, operation_id)
);
CREATE INDEX handoffs_space ON bridge_handoffs(space_id, seq DESC);
CREATE TABLE bridge_access_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX access_log_owner ON bridge_access_log(owner_id, seq DESC);
CREATE TABLE bridge_import_usage (owner_id TEXT PRIMARY KEY, bytes INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER message_usage_insert AFTER INSERT ON bridge_messages BEGIN
  INSERT INTO bridge_import_usage(owner_id,bytes) VALUES(NEW.owner_id,length(CAST(NEW.content AS BLOB)))
    ON CONFLICT(owner_id) DO UPDATE SET bytes=bytes+excluded.bytes;
  SELECT CASE WHEN (SELECT bytes FROM bridge_import_usage WHERE owner_id=NEW.owner_id)>52428800 THEN RAISE(ABORT,'storage_limit') END;
END;
CREATE TRIGGER message_usage_delete AFTER DELETE ON bridge_messages BEGIN
  UPDATE bridge_import_usage SET bytes=bytes-length(CAST(OLD.content AS BLOB)) WHERE owner_id=OLD.owner_id;
END;
CREATE TRIGGER context_snapshot AFTER UPDATE OF revision ON bridge_spaces BEGIN
  INSERT INTO bridge_context_versions(space_id,revision,content,created_at) VALUES(NEW.id,NEW.revision,NEW.context,NEW.updated_at);
END;
CREATE TRIGGER context_immutable BEFORE UPDATE ON bridge_context_versions BEGIN
  SELECT RAISE(ABORT,'immutable_version');
END;
CREATE TRIGGER message_immutable BEFORE UPDATE ON bridge_messages BEGIN
  SELECT RAISE(ABORT,'immutable_message');
END;
