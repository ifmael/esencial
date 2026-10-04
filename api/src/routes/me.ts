// GET /api/me: quién soy para el SPA ({id, email, role, familyId}) y si quien
// autenticó la petición fue Cloudflare Access (para saber si hay una sesión que
// cerrar: en local no la hay). El usuario lo deja el gate, y su primera petición
// autenticada autoprovisiona la cuenta.
import { Hono } from "hono";
import type { AppContext } from "../db";
import { json } from "../http";
import { accessContext } from "../identity";

export const me = new Hono<AppContext>().get("/", (c) => {
  const user = c.get("user");
  return json({
    id: user.id,
    email: user.email,
    role: user.role,
    familyId: user.family_id,
    // Cerrar sesión es cosa de Access: solo tiene sentido si Access está delante.
    access: Boolean(accessContext(c)),
  });
});
