// Recetas de Nutrirutina → SQL de Esencial (genera 0012_recetas_nutrirutina.sql).
// Puro, sin E/S: lo usan el CLI (import-nutrirutina.ts) y el test.

export type NrRecipe = {
  name: string;
  description: string | null;
  servings: number;
  photo_path: string | null;
  /** quantity ≤ 0 es «al gusto» en Nutrirutina (-1). */
  ingredients: { food: string; quantity: number; unit: string }[];
  steps: string[];
  materials: string[];
};

/** Key R2 estable por id de Nutrirutina (formato de POST /api/uploads). */
export async function photoKey(nutrirutinaId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(nutrirutinaId),
  );
  const h = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `recipe-${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}.jpg`;
}

const lit = (v: string | number | null): string =>
  v === null
    ? "NULL"
    : typeof v === "number"
      ? String(v)
      : `'${v.replaceAll("'", "''")}'`;

// El desplegable del editor ofrece gr/ml/ud; Nutrirutina guarda «g».
const UNIT: Record<string, string> = { g: "gr" };

/** Una sentencia por línea. Las recetas cuyo nombre ya exista se saltan
 *  enteras (nombre UNIQUE): la lista de nombres previos vive en una tabla
 *  auxiliar que se borra al final. */
export function toMigrationSql(recipes: NrRecipe[]): string {
  const out = ["CREATE TABLE _nutrirutina_skip AS SELECT name FROM recipes;"];
  for (const r of recipes) {
    const from = `FROM recipes WHERE name = ${lit(r.name)} AND name NOT IN (SELECT name FROM _nutrirutina_skip)`;
    out.push(
      `INSERT OR IGNORE INTO recipes (name, description, servings, photo_path) VALUES (${lit(r.name)}, ${lit(r.description)}, ${r.servings}, ${lit(r.photo_path)});`,
      ...r.ingredients.map((i, pos) => {
        const q = i.quantity > 0 ? i.quantity : null;
        const unit = q === null ? null : (UNIT[i.unit] ?? i.unit);
        return `INSERT INTO recipe_ingredients (recipe_id, position, food, quantity, unit) SELECT id, ${pos}, ${lit(i.food)}, ${lit(q)}, ${lit(unit)} ${from};`;
      }),
      ...r.steps.map(
        (text, pos) =>
          `INSERT INTO recipe_steps (recipe_id, position, text) SELECT id, ${pos}, ${lit(text)} ${from};`,
      ),
      ...r.materials.map(
        (m) =>
          `INSERT INTO recipe_materials (recipe_id, name) SELECT id, ${lit(m)} ${from};`,
      ),
    );
  }
  out.push("DROP TABLE _nutrirutina_skip;");
  return `${out.join("\n")}\n`;
}
