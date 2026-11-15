-- Lot 1 — Modèle de projet (additif, un seul fichier). Aucune table ni colonne existante n'est modifiée ;
-- aucune ligne existante n'est lue, réécrite ni supprimée. Les projets, décisions, documents et notes existants
-- n'ont AUCUNE ligne ici : leur état se déduit de leurs anciennes colonnes (voir server/lifecycle-core.ts).
-- La contrainte à deux types de project_profiles.space_key (0017) n'est pas touchée : le « gabarit » vit dans project_setup.

-- 1. Gabarit de départ et modules activables par projet.
CREATE TABLE project_setup (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 template TEXT NOT NULL DEFAULT 'vide',
 feature_seq INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE project_modules (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 module_key TEXT NOT NULL CHECK(module_key IN ('code_deploy','features','learning_path')),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(project_id,module_key)
);

-- 2. Cycle de vie et fiabilité : une ligne par information dont l'état a été posé explicitement.
-- Sans ligne, l'état est déduit des anciennes colonnes. Rien n'est jamais supprimé : on change d'état, avec une trace.
CREATE TABLE item_lifecycle (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('decision','document','memory','feature')),
 item_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('proposed','current','replaced','abandoned','rejected','hypothesis')),
 reliability TEXT NOT NULL CHECK(reliability IN ('verified','confirmed','reported','hypothesis')),
 source_ref TEXT NOT NULL DEFAULT '',
 proof_kind TEXT NOT NULL DEFAULT '' CHECK(proof_kind IN ('','fit','test')),
 fit_confirmed_at TEXT,
 replaced_by_id TEXT,
 author_kind TEXT NOT NULL DEFAULT 'martin' CHECK(author_kind IN ('martin','ai')),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,kind,item_id)
);
CREATE INDEX item_lifecycle_project ON item_lifecycle(user_id,project_id,kind,status);

CREATE TABLE lifecycle_events (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('decision','document','memory','feature')),
 item_id TEXT NOT NULL,
 from_status TEXT, to_status TEXT NOT NULL,
 from_reliability TEXT, to_reliability TEXT NOT NULL,
 reason TEXT NOT NULL, source_ref TEXT NOT NULL DEFAULT '',
 replaced_by_id TEXT,
 author_kind TEXT NOT NULL CHECK(author_kind IN ('martin','ai')),
 created_at TEXT NOT NULL
);
CREATE INDEX lifecycle_events_item ON lifecycle_events(user_id,kind,item_id,created_at);

-- 3. Module « Suivi des fonctionnalités » (distinct des tâches du plan). `code` est l'identifiant stable (F-0001…), jamais réutilisé.
CREATE TABLE project_features (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 code TEXT NOT NULL,
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT 'to_design' CHECK(state IN ('to_design','in_progress','done','phone_verified','blocked')),
 source_kind TEXT NOT NULL DEFAULT 'other' CHECK(source_kind IN ('conversation','request','repo_file','other')),
 source_ref TEXT NOT NULL DEFAULT '',
 group_name TEXT NOT NULL DEFAULT '',
 position INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(project_id,code)
);
CREATE INDEX project_features_project ON project_features(user_id,project_id,group_name,position);
CREATE TABLE feature_links (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 feature_id TEXT NOT NULL REFERENCES project_features(id) ON DELETE CASCADE,
 target_kind TEXT NOT NULL CHECK(target_kind IN ('task','decision')),
 target_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(feature_id,target_kind,target_id)
);
