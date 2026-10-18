-- Snapshots belong to the historical answer, independently of connection lifecycle.
-- NULL on old messages means no label/role snapshot was recorded at that time.
ALTER TABLE messages ADD COLUMN assistant_label TEXT;
ALTER TABLE messages ADD COLUMN assistant_role TEXT;
