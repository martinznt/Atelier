-- Option « sans plafond d'analyses par jour » (additif). Les limites réelles des IA arrêtent et reprennent le travail ;
-- un plafond de sécurité du compte (100 par jour) protège seulement contre une boucle.
ALTER TABLE review_configs ADD COLUMN no_daily_cap INTEGER NOT NULL DEFAULT 0 CHECK(no_daily_cap IN (0,1));
