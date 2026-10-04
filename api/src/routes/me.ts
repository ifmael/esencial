// GET /api/me: quién soy para el SPA ({id, email, role, familyId, name}) y si
// quien autenticó la petición fue Cloudflare Access (para saber si hay una
// sesión que cerrar: en local no la hay). El usuario lo deja el gate, y su
// primera petición autenticada autoprovisiona la cuenta.
//
// PATCH /api/me: el nombre de perfil. Access solo prueba el email (el IdP de
// One-time PIN no aporta `name`), así que el nombre lo teclea la persona.
import { Hono } from "hono";
import { z } from "zod";
import { type AppContext, getDb, type User } from "../db";
import { fail, guard, json } from "../http";
import { accessContext } from "../identity";
import { zBody } from "../validation";

/** Tope del nombre, en caracteres y ya normalizado. */
export const NAME_MAX = 60;

/** Nombre normalizado: sin espacios de sobra (trim y colapso de los internos).
 *  Vacío o solo espacios → `null`, que es «borrar el nombre». */
export function normalizeName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name === "" ? null : name;
}

const nameSchema = z.object({ name: z.string() });

/** Cuerpo de `/api/me` — la misma forma para el GET y para el PATCH. */
const meBody = (user: User, name: string | null, access: boolean) =>
  json({
    id: user.id,
    email: user.email,
    role: user.role,
    familyId: user.family_id,
    name,
    access,
  });

export const me = new Hono<AppContext>()
  .get("/", (c) => {
    const user = c.get("user");
    // Cerrar sesión es cosa de Access: solo tiene sentido si Access está delante.
    return meBody(user, user.name, Boolean(accessContext(c)));
  })
  .patch("/", zBody(nameSchema), (c) => {
    const name = normalizeName(c.get("validated").name);
    if (name !== null && name.length > NAME_MAX)
      return fail(
        `El nombre no puede superar los ${NAME_MAX} caracteres`,
        "name",
      );
    return guard(async () => {
      const user = c.get("user");
      await getDb(c.env)
        .prepare("UPDATE users SET name = ? WHERE id = ?")
        .bind(name, user.id)
        .run();
      return meBody(user, name, Boolean(accessContext(c)));
    });
  });
