-- Publication facultative du dossier de revue en commentaire de PR (désactivée par défaut, additive).
ALTER TABLE review_configs ADD COLUMN post_comment INTEGER NOT NULL DEFAULT 0 CHECK(post_comment IN (0,1));
