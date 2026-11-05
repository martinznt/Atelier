-- Mode de revue par dépôt (additif). 'equilibre' reproduit le comportement antérieur.
ALTER TABLE review_configs ADD COLUMN review_mode TEXT NOT NULL DEFAULT 'equilibre' CHECK(review_mode IN ('economique','equilibre','approfondi'));
