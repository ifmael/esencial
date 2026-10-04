// GET /api/me: quién soy para el SPA ({id, email, role, familyId}). El usuario
// lo deja el gate (identidad de Access, o la cookie de sesión como puente), y
// la primera petición autenticada de un email autoprovisiona su cuenta.
import { Hono } from "hono";
import type { AppContext } from "../db";
import { json } from "../http";

export const me = new Hono<AppContext>().get("/", (c) => {
  const user = c.get("user");
  return json({
    id: user.id,
    email: user.email,
    role: user.role,
    familyId: user.family_id,
  });
});
