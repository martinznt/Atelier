-- Analyse de l'historique importé par les IA déjà connectées (Gemini, Groq, Mistral). Additif.
-- Le découpage est local et déterministe. Chaque réponse d'IA est conservée telle quelle, même inexploitable.
-- Rien n'est supprimé parce qu'une IA n'a pas su l'interpréter : l'unité reste « à reprendre ».
ALTER TABLE export_batches ADD COLUMN ai_consent_at TEXT;

CREATE TABLE analysis_units (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
 conversation_id TEXT NOT NULL REFERENCES export_conversations(id) ON DELETE CASCADE,
 bridge_conversation_id TEXT NOT NULL,
 lot TEXT NOT NULL DEFAULT '',
 chunk_index INTEGER NOT NULL, chunk_count INTEGER NOT NULL,
 first_seq INTEGER NOT NULL, last_seq INTEGER NOT NULL,
 message_count INTEGER NOT NULL, chars INTEGER NOT NULL,
 truncated INTEGER NOT NULL DEFAULT 0 CHECK(truncated IN (0,1)),
 content_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','analysed','failed','superseded')),
 second_status TEXT NOT NULL DEFAULT 'none' CHECK(second_status IN ('none','wanted','done','failed')),
 fail_count INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(user_id,batch_id,conversation_id,chunk_index,content_hash)
);
CREATE INDEX analysis_units_todo ON analysis_units(user_id,batch_id,status,second_status,lot,conversation_id,chunk_index);

CREATE TABLE analysis_results (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 unit_id TEXT NOT NULL REFERENCES analysis_units(id) ON DELETE CASCADE,
 pass TEXT NOT NULL CHECK(pass IN ('first','second')),
 connection_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
 prompt_version TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ok','invalid')),
 raw TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 input_tokens INTEGER, output_tokens INTEGER,
 created_at TEXT NOT NULL
);
CREATE INDEX analysis_results_unit ON analysis_results(user_id,unit_id,pass,created_at);

CREATE TABLE analysis_items (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
 unit_id TEXT NOT NULL REFERENCES analysis_units(id) ON DELETE CASCADE,
 result_id TEXT NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
 pass TEXT NOT NULL CHECK(pass IN ('first','second')),
 kind TEXT NOT NULL CHECK(kind IN ('demand','conditional_demand','question','preference','refusal','decision','assistant_proposal','hypothesis','correction','reported_result','other')),
 text TEXT NOT NULL,
 source_keys TEXT NOT NULL,
 quote TEXT NOT NULL DEFAULT '',
 quote_verified INTEGER NOT NULL DEFAULT 0 CHECK(quote_verified IN (0,1)),
 reclassified INTEGER NOT NULL DEFAULT 0 CHECK(reclassified IN (0,1)),
 project_hint TEXT NOT NULL DEFAULT '',
 important INTEGER NOT NULL DEFAULT 0 CHECK(important IN (0,1)),
 agreement TEXT NOT NULL DEFAULT 'unchecked' CHECK(agreement IN ('unchecked','single','agree','differ')),
 review_status TEXT NOT NULL DEFAULT 'candidate' CHECK(review_status IN ('candidate','accepted','rejected')),
 review_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE INDEX analysis_items_batch ON analysis_items(user_id,batch_id,review_status,kind,created_at);
CREATE INDEX analysis_items_unit ON analysis_items(user_id,unit_id,pass);
