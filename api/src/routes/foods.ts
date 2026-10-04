// /api/foods — catálogo de alimentos para los macros: GET lista entera (unos
// cientos, el editor filtra en el cliente), lo lee todo el mundo · POST crea uno
// (nombre UNIQUE → 400) y es solo del admin (403 si no lo es).
import { Hono } from "hono";
import { foodSchema } from "../api-validation";
import type { AppContext } from "../db";
import { guard, json } from "../http";
import { row, rows } from "../repo";
import { zBody } from "../validation";

const COLUMNS =
  "id, name, kcal, protein, fat, carbs, grams_per_unit AS gramsPerUnit";

export const foods = new Hono<AppContext>()
  .get("/", (c) =>
    guard(async () =>
      json(
        await rows(
          c.env.DB,
          `SELECT ${COLUMNS} FROM foods ORDER BY name COLLATE NOCASE`,
        ),
      ),
    ),
  )
  .post("/", zBody(foodSchema), (c) =>
    guard(async () => {
      // El catálogo lo escribe solo el admin: leerlo es de todos, tocarlo no.
      if (c.get("user").role !== "admin")
        return json({ error: "Forbidden" }, 403);
      const f = c.get("validated");
      const { meta } = await c.env.DB.prepare(
        "INSERT INTO foods (name, kcal, protein, fat, carbs, grams_per_unit) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(f.name, f.kcal, f.protein, f.fat, f.carbs, f.gramsPerUnit ?? null)
        .run();
      return json(
        await row(
          c.env.DB,
          `SELECT ${COLUMNS} FROM foods WHERE id = ?`,
          meta.last_row_id,
        ),
        201,
      );
    }),
  );
