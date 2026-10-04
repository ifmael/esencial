-- 0019: cuentas, familias y subidas (multi-usuario, aditiva).
-- La identidad la prueba Cloudflare Access en el borde, así que no hay
-- password_hash ni reset. El catálogo sigue siendo global: lo privado y lo de
-- familia se repunta en 0020, que además rellena el usuario 1.
CREATE TABLE IF NOT EXISTS families (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  family_id  INTEGER NOT NULL REFERENCES families(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uploads (
  key           TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
