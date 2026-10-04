-- 0021: el nombre de perfil (aditiva).
-- La identidad la prueba Cloudflare Access y solo entrega el email (el único
-- IdP es One-time PIN, que no aporta `name`), así que el nombre lo teclea la
-- persona en Ajustes. Admite NULL a propósito: así se puede aplicar antes del
-- deploy y el `users` que ya existe se queda sin nombre hasta que cada uno
-- ponga el suyo.
ALTER TABLE users ADD COLUMN name TEXT;
