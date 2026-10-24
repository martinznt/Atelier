-- Additive: existing usernames, passwords, sessions and resource owners are preserved.
-- NULL emails use the explicit legacy enrollment flow; never infer an email address.
ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
