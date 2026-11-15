-- Import fiable : structure des conversations (nœuds), annexes de l'archive, correspondance de fichiers, preuve de persistance par segment (additif).
-- Aucune donnée existante n'est modifiée ni supprimée. L'archive d'origine reste sur l'appareil de l'utilisateur : Atelier garde la structure,
-- les métadonnées scalaires utiles, le texte des annexes (≤ 1 Mo chacune) et des empreintes. Il ne garde PAS le contenu des fichiers de l'archive.
ALTER TABLE export_conversations ADD COLUMN meta TEXT NOT NULL DEFAULT '{}';
ALTER TABLE export_conversations ADD COLUMN source_index INTEGER;
ALTER TABLE export_files ADD COLUMN group_name TEXT NOT NULL DEFAULT '';
ALTER TABLE export_attachment_refs ADD COLUMN link_source TEXT NOT NULL DEFAULT '';
ALTER TABLE export_attachment_refs ADD COLUMN note TEXT NOT NULL DEFAULT '';
-- Preuve de persistance : un segment n'est « inventorié » que si le serveur a recompté ce qu'il a réellement enregistré.
ALTER TABLE export_segments ADD COLUMN rows_stored INTEGER NOT NULL DEFAULT 0;
ALTER TABLE export_segments ADD COLUMN nodes_stored INTEGER NOT NULL DEFAULT 0;
ALTER TABLE export_segments ADD COLUMN dropped_fields TEXT NOT NULL DEFAULT '{}';
ALTER TABLE export_segments ADD COLUMN issues TEXT NOT NULL DEFAULT '[]';
ALTER TABLE export_segments ADD COLUMN wrapper TEXT NOT NULL DEFAULT '';
ALTER TABLE export_segments ADD COLUMN reason_code TEXT NOT NULL DEFAULT '';

CREATE TABLE export_nodes (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
 conversation_id TEXT NOT NULL REFERENCES export_conversations(id) ON DELETE CASCADE,
 node_id TEXT NOT NULL,
 parent_id TEXT,
 children TEXT NOT NULL DEFAULT '[]',
 role TEXT NOT NULL DEFAULT '', content_type TEXT NOT NULL DEFAULT '',
 create_time TEXT,
 has_text INTEGER NOT NULL DEFAULT 0 CHECK(has_text IN (0,1)),
 text_chars INTEGER NOT NULL DEFAULT 0,
 attachment_refs INTEGER NOT NULL DEFAULT 0,
 meta TEXT NOT NULL DEFAULT '{}',
 UNIQUE(batch_id,conversation_id,node_id)
);
CREATE INDEX export_nodes_conv ON export_nodes(user_id,batch_id,conversation_id);

CREATE TABLE export_annexes (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('correspondance','inventaire','verification','exclusions','lisez_moi')),
 size INTEGER NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 status TEXT NOT NULL CHECK(status IN ('stored','too_large','invalid_json','unrecognized_shape')),
 shape TEXT NOT NULL DEFAULT '{}',
 content TEXT,
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(batch_id,name)
);

CREATE TABLE export_links (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
 ref_key TEXT NOT NULL, declared_path TEXT NOT NULL,
 file_id TEXT REFERENCES export_files(id) ON DELETE SET NULL,
 status TEXT NOT NULL CHECK(status IN ('present','path_missing')),
 UNIQUE(batch_id,ref_key,declared_path)
);
CREATE INDEX export_links_batch ON export_links(user_id,batch_id,status);
