// /api/families + /api/users — mover gente entre familias, solo para el admin.
// Las dos caras de la misma operación viven aquí: el alta aplica la REGLA DE
// FUSIÓN (si la familia de origen se queda con más gente solo cambia
// `users.family_id`; si era su familia de uno, sus semanas viajan a la destino
// por semana ISO —repuntando las libres y fundiendo las que ya existan, donde
// «el plan de la familia manda en los huecos que ya tenga»—) y la baja deja al
// usuario en una familia nueva vacía. Semanas y recetas se quedan donde estaban:
// la visibilidad de recetas es derivada (`owner_id` ∈ miembros de mi familia),
// así que sus recetas dejan de verse sin tocar nada más.
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { type AppContext, getDb } from "../db";
import { fail, guard, json, parseId } from "../http";
import { normalizeEmail } from "../identity";
import { row, rows } from "../repo";
import { zBody } from "../validation";

/** Los tres endpoints son del admin; un member corta con 403. */
const adminOnly = createMiddleware<AppContext>(async (c, next) => {
  if (c.get("user").role !== "admin") return json({ error: "Forbidden" }, 403);
  await next();
});

const memberSchema = z.object({ email: z.string() });

const notFound = () => fail("Not found", undefined, 404);

/** Statements del alta, para un solo `db.batch` (una transacción). */
async function moveStatements(
  db: D1Database,
  userId: number,
  fromFamilyId: number,
  toFamilyId: number,
): Promise<D1PreparedStatement[]> {
  const move = db
    .prepare("UPDATE users SET family_id = ? WHERE id = ?")
    .bind(toFamilyId, userId);

  const members = await row(
    db,
    "SELECT COUNT(*) AS n FROM users WHERE family_id = ?",
    fromFamilyId,
  );
  // La familia de origen sigue existiendo sin el usuario: no se lleva nada.
  if (Number(members?.n ?? 0) > 1) return [move];

  const statements: D1PreparedStatement[] = [move];
  const weeks = await rows(
    db,
    "SELECT id, iso_week FROM week_plans WHERE family_id = ?",
    fromFamilyId,
  );
  for (const week of weeks) {
    const incomingId = Number(week.id);
    const dest = await row(
      db,
      "SELECT id FROM week_plans WHERE family_id = ? AND iso_week = ?",
      toFamilyId,
      String(week.iso_week),
    );
    if (!dest) {
      // Sin colisión: la semana viaja entera (comidas y compra cuelgan de ella).
      statements.push(
        db
          .prepare("UPDATE week_plans SET family_id = ? WHERE id = ?")
          .bind(toFamilyId, incomingId),
      );
      continue;
    }
    const destId = Number(dest.id);
    // Fundir: el plan de la familia manda en los (day, meal) ya ocupados.
    statements.push(
      db
        .prepare(
          `INSERT INTO meal_slots (week_plan_id, day, meal, recipe_id)
           SELECT ?, ms.day, ms.meal, ms.recipe_id FROM meal_slots ms
            WHERE ms.week_plan_id = ?
              AND NOT EXISTS (SELECT 1 FROM meal_slots d
                               WHERE d.week_plan_id = ? AND d.day = ms.day
                                 AND d.meal = ms.meal)`,
        )
        .bind(destId, incomingId, destId),
    );
    // La compra entra detrás de la de la familia, conservando su orden.
    const tail = await row(
      db,
      "SELECT COALESCE(MAX(position), -1) AS maxPos FROM shopping_items WHERE week_plan_id = ?",
      destId,
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO shopping_items (week_plan_id, position, food, quantity, unit, section, checked)
           SELECT ?, (? + ROW_NUMBER() OVER (ORDER BY position, id)) - 1,
                  food, quantity, unit, section, checked
             FROM shopping_items WHERE week_plan_id = ?`,
        )
        .bind(destId, Number(tail?.maxPos ?? -1) + 1, incomingId),
    );
    // La entrante ya volcó lo suyo: se vacía y se borra (explícito, sin fiarse
    // del ON DELETE CASCADE).
    statements.push(
      db
        .prepare("DELETE FROM meal_slots WHERE week_plan_id = ?")
        .bind(incomingId),
      db
        .prepare("DELETE FROM shopping_items WHERE week_plan_id = ?")
        .bind(incomingId),
      db.prepare("DELETE FROM week_plans WHERE id = ?").bind(incomingId),
    );
  }
  return statements;
}

export const families = new Hono<AppContext>()
  .use("*", adminOnly)
  .post("/:familyId/members", zBody(memberSchema), (c) =>
    guard(async () => {
      const email = normalizeEmail(c.get("validated").email);
      if (email === null) return fail("Invalid email", "email");
      const familyId = parseId(c.req.param("familyId"));
      if (familyId === null) return notFound();
      const db = getDb(c.env);
      const family = await row(
        db,
        "SELECT id FROM families WHERE id = ?",
        familyId,
      );
      if (!family) return notFound();
      const user = await row(
        db,
        "SELECT id, email, role, family_id FROM users WHERE email = ?",
        email,
      );
      if (!user) return notFound();
      const userId = Number(user.id);
      const fromFamilyId = Number(user.family_id);
      if (fromFamilyId === familyId)
        return fail("Already a member", undefined, 409);
      await db.batch(await moveStatements(db, userId, fromFamilyId, familyId));
      return json({
        id: userId,
        email: user.email,
        role: user.role,
        familyId,
      });
    }),
  )
  .delete("/:familyId/members/:userId", (c) =>
    guard(async () => {
      const familyId = parseId(c.req.param("familyId"));
      const userId = parseId(c.req.param("userId"));
      if (familyId === null || userId === null) return notFound();
      const db = getDb(c.env);
      const user = await row(
        db,
        "SELECT id, email FROM users WHERE id = ? AND family_id = ?",
        userId,
        familyId,
      );
      if (!user) return notFound();
      // El admin no se saca de su propia familia: se quedaría sin el menú
      // compartido que él mismo ve.
      if (userId === c.get("user").id)
        return fail("You cannot remove yourself from your family", "userId");
      const created = await db
        .prepare("INSERT INTO families (name) VALUES (?)")
        .bind(user.email)
        .run();
      const newFamilyId = Number(created.meta.last_row_id);
      const { meta } = await db
        .prepare(
          "UPDATE users SET family_id = ? WHERE id = ? AND family_id = ?",
        )
        .bind(newFamilyId, userId, familyId)
        .run();
      if (Number(meta.changes) === 0) {
        // Carrera: alguien lo movió entre la lectura y la escritura.
        await db
          .prepare("DELETE FROM families WHERE id = ?")
          .bind(newFamilyId)
          .run();
        return notFound();
      }
      return new Response(null, { status: 204 });
    }),
  );

export const users = new Hono<AppContext>()
  .use("*", adminOnly)
  .get("/", (c) =>
    guard(async () =>
      json(
        await rows(
          getDb(c.env),
          "SELECT id, email, role, family_id AS familyId FROM users ORDER BY email COLLATE NOCASE",
        ),
      ),
    ),
  );
