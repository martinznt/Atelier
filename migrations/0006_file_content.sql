-- Additive: keep all historical versions and their legacy object references.
-- Unmapped legacy versions remain visible and explicitly unavailable until imported.
CREATE TABLE file_contents (
 version_id TEXT PRIMARY KEY REFERENCES file_versions(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 content TEXT NOT NULL,
 bytes INTEGER NOT NULL CHECK(bytes >= 0 AND bytes <= 262144),
 CHECK(length(CAST(content AS BLOB)) = bytes)
);
CREATE INDEX file_contents_owner ON file_contents(user_id);
CREATE TABLE file_storage_usage (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 bytes INTEGER NOT NULL DEFAULT 0 CHECK(bytes >= 0)
);
CREATE TRIGGER file_content_validate BEFORE INSERT ON file_contents BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM file_versions v JOIN files f ON f.id=v.file_id JOIN users u ON u.id=v.user_id
  WHERE v.id=NEW.version_id AND v.user_id=NEW.user_id AND f.user_id=NEW.user_id
  AND u.deleted_at IS NULL AND v.size=NEW.bytes
 ) THEN RAISE(ABORT,'file_owner_or_size') END;
 SELECT CASE WHEN COALESCE((SELECT SUM(bytes) FROM file_storage_usage),0)+NEW.bytes>104857600
  THEN RAISE(ABORT,'file_storage_full') END;
END;
CREATE TRIGGER file_content_usage_insert AFTER INSERT ON file_contents BEGIN
 INSERT INTO file_storage_usage(user_id,bytes) VALUES(NEW.user_id,NEW.bytes)
 ON CONFLICT(user_id) DO UPDATE SET bytes=bytes+excluded.bytes;
END;
CREATE TRIGGER file_content_usage_delete AFTER DELETE ON file_contents BEGIN
 UPDATE file_storage_usage SET bytes=MAX(0,bytes-OLD.bytes) WHERE user_id=OLD.user_id;
END;
CREATE TRIGGER file_content_immutable BEFORE UPDATE ON file_contents BEGIN
 SELECT RAISE(ABORT,'immutable file content');
END;
