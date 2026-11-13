-- Import d'archives par segments, index des fichiers de l'archive et références de pièces jointes (additif).
-- L'archive d'origine reste sur l'appareil de l'utilisateur : Atelier ne garde que des métadonnées et des empreintes.
-- Une pièce jointe n'est jamais « conservée » ici : son état (présente dans l'archive, référencée seulement) est enregistré tel quel.
ALTER TABLE export_conversations ADD COLUMN segment TEXT NOT NULL DEFAULT '';
ALTER TABLE export_batches ADD COLUMN duplicate_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE export_segments (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 size INTEGER NOT NULL, sha256 TEXT NOT NULL,
 conversation_count INTEGER NOT NULL DEFAULT 0,
 duplicate_count INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN ('inventoried','too_large','unreadable','invalid_json')),
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(batch_id,name)
);

CREATE TABLE export_files (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
 entry_name TEXT NOT NULL,
 size INTEGER NOT NULL, compressed_size INTEGER NOT NULL,
 sniff_kind TEXT NOT NULL DEFAULT '', sniff_mime TEXT NOT NULL DEFAULT '',
 sha256 TEXT CHECK(sha256 IS NULL OR length(sha256)=64),
 status TEXT NOT NULL CHECK(status IN ('hashed','indexed','unsafe_name','encrypted','unsupported','suspicious','failed')),
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(batch_id,entry_name)
);
CREATE INDEX export_files_batch ON export_files(user_id,batch_id,status,sniff_kind);

CREATE TABLE export_attachment_refs (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
 conversation_id TEXT NOT NULL REFERENCES export_conversations(id) ON DELETE CASCADE,
 ref_key TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL DEFAULT '', size INTEGER,
 message_key TEXT NOT NULL DEFAULT '',
 link_status TEXT NOT NULL DEFAULT 'unlinked' CHECK(link_status IN ('unlinked','in_archive','ambiguous','referenced_only')),
 file_id TEXT REFERENCES export_files(id) ON DELETE SET NULL,
 UNIQUE(batch_id,conversation_id,ref_key)
);
CREATE INDEX export_attachment_refs_batch ON export_attachment_refs(user_id,batch_id,link_status);

-- Prompts : « Copié » est une information distincte de « Transmis » (copier n'est pas donner), et « Remplacé » garde le lien vers son successeur.
ALTER TABLE prompts ADD COLUMN copied_at TEXT;
ALTER TABLE prompts ADD COLUMN copied_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE prompts ADD COLUMN superseded_by TEXT REFERENCES prompts(id) ON DELETE SET NULL;
