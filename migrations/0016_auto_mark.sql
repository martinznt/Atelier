-- Analyse automatique limitée aux PR dont le titre commence par une marque (ex. « EN VÉRIFICATION »), additif.
ALTER TABLE review_configs ADD COLUMN auto_mark TEXT CHECK(auto_mark IS NULL OR length(auto_mark) BETWEEN 1 AND 40);
