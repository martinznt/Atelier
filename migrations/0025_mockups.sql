-- Lot 5B, étape 5B-1 — Maquettes d'écran (additif : quatre tables nouvelles, aucune table existante modifiée ni lue).
-- Une maquette = une page d'écran de téléphone (largeur de travail 360 px) faite de blocs calqués sur une capture.
-- Atelier ne produit aucun code de site : la maquette sert à préparer, plus tard, les instructions pour Claude Code.
-- La capture est gardée en texte (base64) dans D1 : 180 Ko maximum avant encodage, donc moins de 256 Kio de texte
-- (règle de docs/LIMITES_GRATUITES.md : aucun gros binaire, pas de R2).
CREATE TABLE mockups (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 page_name TEXT NOT NULL DEFAULT '',
 screen_width INTEGER NOT NULL DEFAULT 360 CHECK(screen_width BETWEEN 320 AND 480),
 screen_height INTEGER NOT NULL DEFAULT 780 CHECK(screen_height BETWEEN 200 AND 3000),
 palette TEXT NOT NULL DEFAULT '[]',
 start_state TEXT,
 start_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX mockups_project ON mockups(user_id,project_id,updated_at DESC);

CREATE TABLE mockup_images (
 mockup_id TEXT PRIMARY KEY REFERENCES mockups(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 mime TEXT NOT NULL CHECK(mime IN ('image/webp','image/jpeg','image/png')),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 4096),
 height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 20000),
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 180000),
 sha256 TEXT NOT NULL,
 data TEXT NOT NULL CHECK(length(data)<=262144),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX mockup_images_user ON mockup_images(user_id);

CREATE TABLE mockup_groups (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 mockup_id TEXT NOT NULL REFERENCES mockups(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 position INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 UNIQUE(mockup_id,name)
);

CREATE TABLE mockup_blocks (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 mockup_id TEXT NOT NULL REFERENCES mockups(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('title','text','list','card','button','field','bottom_bar','image','other')),
 label TEXT NOT NULL,
 x INTEGER NOT NULL CHECK(x>=0), y INTEGER NOT NULL CHECK(y>=0),
 w INTEGER NOT NULL CHECK(w>=1), h INTEGER NOT NULL CHECK(h>=1),
 position INTEGER NOT NULL DEFAULT 0,
 group_id TEXT REFERENCES mockup_groups(id) ON DELETE SET NULL,
 fill TEXT NOT NULL DEFAULT '',
 text_color TEXT NOT NULL DEFAULT '',
 feature_id TEXT REFERENCES project_features(id) ON DELETE SET NULL,
 behavior TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX mockup_blocks_mockup ON mockup_blocks(user_id,mockup_id,position);
