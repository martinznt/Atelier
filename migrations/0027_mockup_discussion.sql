-- Lot 5B, étape 5B-5 — Discussion liée à une maquette (additif, une table nouvelle ; aucune table existante modifiée).
-- Martin pose une question (sur un bloc ou sur la page) ; Atelier répond d'abord SANS IA avec ce qui existe déjà (sources citées).
-- Une IA peut compléter avec la clé de Martin : sa réponse reste une « hypothesis ». Une conclusion n'est « confirmed » que si Martin la confirme.
CREATE TABLE mockup_messages (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 mockup_id TEXT NOT NULL REFERENCES mockups(id) ON DELETE CASCADE,
 block_id TEXT REFERENCES mockup_blocks(id) ON DELETE SET NULL,
 block_label TEXT NOT NULL DEFAULT '',
 author TEXT NOT NULL CHECK(author IN ('martin','atelier','ai')),
 kind TEXT NOT NULL DEFAULT 'message' CHECK(kind IN ('question','answer','conclusion')),
 body TEXT NOT NULL CHECK(length(body)<=12000),
 sources TEXT NOT NULL DEFAULT '[]',
 level TEXT NOT NULL DEFAULT '' CHECK(level IN ('','verified','reported','hypothesis','confirmed')),
 ai_provider TEXT NOT NULL DEFAULT '',
 ai_model TEXT NOT NULL DEFAULT '',
 reply_to TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX mockup_messages_mockup ON mockup_messages(user_id,mockup_id,created_at);
