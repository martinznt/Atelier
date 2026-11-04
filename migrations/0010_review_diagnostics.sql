-- Diagnostic structuré des revues (additif, aucune donnée existante modifiée).
-- diagnostic : JSON sans secret (étape, catégorie, fournisseur, état de l'appel IA, reprise).
ALTER TABLE review_runs ADD COLUMN stage TEXT;
ALTER TABLE review_runs ADD COLUMN diagnostic TEXT;
