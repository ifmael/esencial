// GET /api/me: quién soy para el SPA ({id, email, role, familyId}). La identidad
// la prueba Access en el borde; la primera petición autenticada autoprovisiona
// la cuenta (el admin se designa con ADMIN_EMAIL o cae en el primer usuario).
import { Hono } from "hono";
import type { Env } from "../db";
import { json } from "../http";
import { requestIdentity } from "../identity";
import { ensureUser } from "../repo";

export const me = new Hono<{ Bindings: Env }>().get("/", async (c) => {
  const email = await requestIdentity(c);
  if (!email) return json({ error: "Unauthorized" }, 401);
  const user = await ensureUser(c.env.DB, email, c.env.ADMIN_EMAIL);
  return json({
    id: user.id,
    email: user.email,
    role: user.role,
    familyId: user.family_id,
  });
});
