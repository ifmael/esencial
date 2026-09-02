// 1.1/1.3 RED: lib/db.ts creates the DB file (WAL), applies schema idempotently,
// and a second open preserves existing data.
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { useTempDb } from "../helpers";
import { getDb } from "@/lib/db";

const cleanup = useTempDb();
afterAll(cleanup);

const TABLES = [
  "recipes",
  "recipe_ingredients",
  "recipe_steps",
  "recipe_materials",
  "exercises",
  "exercise_tags",
  "session_templates",
  "template_exercises",
  "week_plans",
  "meal_slots",
  "plan_sessions",
  "workout_logs",
  "set_logs",
  "day_notes",
];

function tableNames(): string[] {
  const rows = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  return rows.map((r) => {
    if (r && typeof r === "object" && "name" in r) return String(r.name);
    return "";
  });
}

describe("database bootstrap", () => {
  it("creates the DB file with all schema tables on first use", () => {
    getDb();
    expect(fs.existsSync(process.env.ESSENTIAL_DB_PATH!)).toBe(true);
    const names = tableNames();
    for (const t of TABLES) expect(names).toContain(t);
  });

  it("runs in WAL mode with foreign_keys ON", () => {
    const db = getDb();
    expect(String(db.pragma("journal_mode", { simple: true })).toLowerCase()).toBe("wal");
    expect(Number(db.pragma("foreign_keys", { simple: true }))).toBe(1);
  });

  it("second open is a no-op preserving data", () => {
    const db = getDb();
    db.prepare("INSERT INTO recipes (name, servings) VALUES ('Sopa', 2)").run();
    const again = getDb(); // singleton; schema re-application must not wipe data
    const rows = again.prepare("SELECT name FROM recipes WHERE name='Sopa'").all();
    expect(rows.length).toBe(1);
    again.prepare("DELETE FROM recipes").run();
  });

  it("enforces UNIQUE recipe name and FK cascade wiring", () => {
    const db = getDb();
    const r = db.prepare("INSERT INTO recipes (name) VALUES ('Unica')").run();
    expect(() => db.prepare("INSERT INTO recipes (name) VALUES ('Unica')").run()).toThrow();
    const id = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO recipe_ingredients (recipe_id, position, food) VALUES (?, 0, 'ajo')").run(id);
    db.prepare("DELETE FROM recipes WHERE id=?").run(id);
    const left = db
      .prepare("SELECT COUNT(*) AS c FROM recipe_ingredients WHERE recipe_id=?")
      .get(id);
    expect(left && typeof left === "object" && "c" in left ? Number(left.c) : -1).toBe(0);
  });
});
