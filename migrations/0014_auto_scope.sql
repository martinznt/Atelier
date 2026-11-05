-- Portée de l'analyse automatique : toutes les PR (défaut, comportement antérieur) ou seulement le travail de Claude Code (additif).
ALTER TABLE review_configs ADD COLUMN auto_scope TEXT NOT NULL DEFAULT 'all' CHECK(auto_scope IN ('all','claude_code'));
