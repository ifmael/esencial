// Importa el recetario de Nutrirutina (~/projects/nutrirutina):
//   node api/scripts/import-nutrirutina.ts sql <dir>             → escribe la migración 0012
//   node api/scripts/import-nutrirutina.ts photos <dir> [--remote] → sube las fotos a R2
// Lee el volcado db/data/backup-prod-full.sql (recetas de sistema no borradas)
// y las fotos scripts/generate-recipe-images/output/<id>/landscape.jpg.
// Sin --remote las fotos van al R2 local de dev (.wrangler/state).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type NrRecipe, photoKey, toMigrationSql } from "./nutrirutina.ts";

const [mode, dir, flag] = process.argv.slice(2);
if (!dir || (mode !== "sql" && mode !== "photos")) {
  console.error("uso: import-nutrirutina.ts sql|photos <dir> [--remote]");
  process.exit(1);
}
const photo = (id: string) =>
  join(dir, "scripts/generate-recipe-images/output", id, "landscape.jpg");

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(dir, "db/data/backup-prod-full.sql"), "utf8"));
const recipes = db
  .prepare(
    "SELECT id, name, description, defaultPortions, steps, utensils FROM Recipe WHERE isSystem = 1 AND deletedAt IS NULL ORDER BY name",
  )
  .all() as Record<string, string>[];
const ingredients = db.prepare(
  "SELECT i.name AS food, ri.quantity, ri.unit FROM RecipeIngredient ri JOIN Ingredient i ON i.id = ri.ingredientId WHERE ri.recipeId = ? ORDER BY ri.rowid",
);

if (mode === "sql") {
  const out: NrRecipe[] = [];
  for (const r of recipes)
    out.push({
      name: r.name,
      description: r.description,
      servings: Number(r.defaultPortions),
      photo_path: existsSync(photo(r.id)) ? await photoKey(r.id) : null,
      ingredients: ingredients.all(r.id) as NrRecipe["ingredients"],
      steps: JSON.parse(r.steps ?? "[]"),
      materials: JSON.parse(r.utensils ?? "[]"),
    });
  const file = new URL(
    "../migrations/0012_recetas_nutrirutina.sql",
    import.meta.url,
  );
  writeFileSync(
    file,
    `-- Recetario de Nutrirutina (${out.length} recetas), generado por api/scripts/import-nutrirutina.ts; no editar a mano.\n` +
      `-- Las fotos no viajan en la migración: se suben a R2 con el modo «photos» del mismo script.\n` +
      toMigrationSql(out),
  );
  console.log(`${out.length} recetas → ${file.pathname}`);
} else {
  const target =
    flag === "--remote"
      ? ["--remote"]
      : ["--local", "--persist-to", ".wrangler/state"];
  let n = 0;
  for (const r of recipes) {
    if (!existsSync(photo(r.id))) continue;
    const key = await photoKey(r.id);
    execFileSync(
      "npx",
      [
        "wrangler",
        "r2",
        "object",
        "put",
        `esencial-photos/${key}`,
        "--file",
        photo(r.id),
        "--content-type",
        "image/jpeg",
        "-c",
        "api/wrangler.toml",
        ...target,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    console.log(`${++n} ${key} ← ${r.name}`);
  }
}
