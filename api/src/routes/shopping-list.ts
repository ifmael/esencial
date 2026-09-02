// /api/shopping-list/:week — E3 (design D4/D5). Composed GET aggregates the
// week's planned recipe ingredients server-side (never stored) and mixes in
// manual shopping_items rows; PUT/GET .../items replace/read manual rows;
// PATCH .../items/:id updates one. Aggregation lines cannot drift from the
// plan: deleting a recipe removes its ingredients on the next read.
import { Hono } from "hono";
import { getDb, type Env } from "../db";
import { guard, json, fail, parseId } from "../http";
import { ISO_WEEK, shoppingItemsSchema, shoppingItemPatchSchema } from "../api-validation";
import { row, rows, type Row } from "../repo";
import { zBody } from "../validation";

// Keyword default map (design D3): only consulted when the ingredient row has
// no explicit section. Spanish nouns; first match wins on the lowercased food.
const DEFAULT_SECTION_ORDER = ["Frutas y verduras", "Carnes", "Lácteos", "Despensa"];
const KEYWORD_SECTIONS: [RegExp, string][] = [
  [/tomate|lechuga|pimiento|cebolla|ajo|zanahoria|calabac|espinaca|manzana|pera|plátano|platano|naranja|fresa|limón|limon|uvas?|aguacate|brócoli|brocoli|patata|judía|judia|guisante|champiñón|champinon|pepino|berenjena|piña|pina|sandía|sandia|melón|melon/i, "Frutas y verduras"],
  [/pollo|carne|cerdo|ternera|cordero|pavo|jamón|jamon|tocino|salchich|pescado|merluza|salmón|salmon|atún|atun|sardina|marisco|gamba|mejillón|mejillon|calamar|huevo|huevos|filete|costilla|chuleta|chorizo|salami|butifarra/i, "Carnes"],
  [/leche|queso|yogur|mató|mato|nata|mantequilla|requesón|requeson|helado/i, "Lácteos"],
];

function defaultSection(food: string): string {
  for (const [re, section] of KEYWORD_SECTIONS) if (re.test(food)) return section;
  return "Despensa";
}

// Fixed buckets first, unknown sections after, alphabetically (case-insensitive).
function orderSections(keys: string[]): string[] {
  const known = DEFAULT_SECTION_ORDER.filter((s) => keys.includes(s));
  const rest = keys.filter((s) => !DEFAULT_SECTION_ORDER.includes(s)).sort((a, b) => a.localeCompare(b, "es"));
  return [...known, ...rest];
}

const manualRow = (r: Row) => ({
  id: Number(r.id),
  position: Number(r.position),
  source: "manual" as const,
  food: String(r.food),
  quantity: r.quantity === null ? null : Number(r.quantity),
  unit: r.unit === null ? null : String(r.unit),
  section: r.section === null ? null : String(r.section),
  checked: Number(r.checked) === 1,
});
const WEEK_PLAN_ID = "(SELECT id FROM week_plans WHERE iso_week = ?)";

async function serializeItems(db: D1Database, week: string): Promise<Response> {
  const items = await rows(
    db,
    `SELECT id, position, food, quantity, unit, section, checked FROM shopping_items
     WHERE week_plan_id = ${WEEK_PLAN_ID} ORDER BY position, id`,
    week,
  );
  return json({ isoWeek: week, items: items.map(manualRow) });
}

/** Group items ({section?, food, ...}) into ordered section buckets. */
function groupSections<T extends { food: string; section?: string | null }>(items: T[]) {
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const key = it.section?.trim() || defaultSection(it.food);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(it);
    else buckets.set(key, [it]);
  }
  return orderSections([...buckets.keys()]).map((section) => ({ section, items: buckets.get(section)! }));
}

function validWeek(week: string): Response | null {
  return ISO_WEEK.test(week) ? null : fail("week must match YYYY-Www (ISO)", "week");
}

export const shoppingList = new Hono<{ Bindings: Env }>()
  .get("/:week", (c) =>
    guard(async () => {
      const week = c.req.param("week");
      const bad = validWeek(week);
      if (bad) return bad;
      const db = getDb(c.env);
      const plan = await row(db, "SELECT id FROM week_plans WHERE iso_week = ?", week);
      if (!plan) return json({ isoWeek: week, sections: [] });
      const weekPlanId = Number(plan.id);
      // One join query; aggregation in JS so slot count becomes the multiplier
      // (a recipe planned N times contributes its ingredients N times).
      const ingredientRows = await rows(
        db,
        `SELECT ri.food, ri.quantity, ri.unit, ri.section, ms.recipe_id AS recipeId
         FROM meal_slots ms JOIN recipe_ingredients ri ON ri.recipe_id = ms.recipe_id
         WHERE ms.week_plan_id = ? ORDER BY ri.id`,
        weekPlanId,
      );
      const agg = new Map<string, { food: string; quantity: number | null; unit: string | null; section: string | null; recipeIds: Set<number>; slots: number }>();
      for (const r of ingredientRows) {
        const food = String(r.food);
        const unit = r.unit === null ? null : String(r.unit);
        const key = `${food.toLowerCase()}|${(unit ?? "").toLowerCase()}`;
        const q = r.quantity === null ? null : Number(r.quantity);
        let line = agg.get(key);
        if (!line) {
          line = { food, quantity: 0, unit, section: r.section === null ? null : String(r.section), recipeIds: new Set(), slots: 0 };
          agg.set(key, line);
        }
        line.slots += 1;
        line.recipeIds.add(Number(r.recipeId));
        // NULL + number → NULL (an unquantified line stays unquantified)
        if (q !== null && line.quantity !== null) line.quantity += q;
        else if (q === null) line.quantity = null;
      }
      const manual = await rows(
        db,
        `SELECT id, position, food, quantity, unit, section, checked FROM shopping_items
         WHERE week_plan_id = ? ORDER BY position, id`,
        weekPlanId,
      );
      const recipeItems = [...agg.values()].map((l) => ({
        source: "recipe" as const,
        food: l.food,
        quantity: l.quantity,
        unit: l.unit,
        section: l.section,
        recipeIds: [...l.recipeIds],
        count: l.slots,
      }));
      const manualItems = manual.map(manualRow);
      // Bucket together, then split recipe/manual per section so recipe lines
      // lead and manual lines keep insertion order inside each section.
      const grouped = groupSections([...recipeItems, ...manualItems]);
      return json({
        isoWeek: week,
        sections: grouped.map((g) => ({
          section: g.section,
          items: [
            ...g.items.filter((i) => "count" in i),
            ...g.items.filter((i) => "id" in i),
          ],
        })),
      });
    }),
  )
  .get("/:week/items", (c) =>
    guard(async () => {
      const week = c.req.param("week");
      const bad = validWeek(week);
      if (bad) return bad;
      return serializeItems(getDb(c.env), week);
    }),
  )
  // Replace-all PUT mirrors meal-plan.ts: lazy week_plans row + delete/reinsert
  // in one batch, so validation failures never touch stored items.
  .put("/:week/items", zBody(shoppingItemsSchema), (c) =>
    guard(async () => {
      const week = c.req.param("week");
      const bad = validWeek(week);
      if (bad) return bad;
      const input = c.get("validated");
      const db = getDb(c.env);
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO week_plans (iso_week) VALUES (?)").bind(week),
        db.prepare(`DELETE FROM shopping_items WHERE week_plan_id = ${WEEK_PLAN_ID}`).bind(week),
        ...input.items.map((i, pos) =>
          db
            .prepare(`INSERT INTO shopping_items (week_plan_id, position, food, quantity, unit, section, checked) VALUES (${WEEK_PLAN_ID}, ?, ?, ?, ?, ?, ?)`)
            .bind(week, pos, i.food, i.quantity ?? null, i.unit ?? null, i.section ?? null, i.checked ? 1 : 0),
        ),
      ]);
      return serializeItems(db, week);
    }),
  )
  .patch("/:week/items/:id", zBody(shoppingItemPatchSchema), (c) =>
    guard(async () => {
      const week = c.req.param("week");
      const bad = validWeek(week);
      if (bad) return bad;
      const id = parseId(c.req.param("id"));
      if (id === null) return fail("id must be a positive integer", "id");
      const input = c.get("validated");
      const db = getDb(c.env);
      const existing = await row(
        db,
        `SELECT id FROM shopping_items WHERE id = ? AND week_plan_id = ${WEEK_PLAN_ID}`,
        id,
        week,
      );
      if (!existing) return fail("Not found", undefined, 404);
      // Only the given columns are updated; `checked` arrives as boolean.
      const cols: string[] = [];
      const vals: unknown[] = [];
      for (const key of ["food", "quantity", "unit", "section", "checked"] as const) {
        if (input[key] !== undefined) {
          cols.push(`${key} = ?`);
          vals.push(key === "checked" ? (input.checked ? 1 : 0) : input[key] ?? null);
        }
      }
      await db.prepare(`UPDATE shopping_items SET ${cols.join(", ")} WHERE id = ?`).bind(...(vals as never[]), id).run();
      const updated = await row(
        db,
        `SELECT id, position, food, quantity, unit, section, checked FROM shopping_items WHERE id = ?`,
        id,
      );
      return json(manualRow(updated!));
    }),
  );
