// E5 tasks 2.1-2.5: GET /api/day/:date aggregation, seeded through the public
// endpoints so the join runs against real rows (design D7).
import { beforeEach, describe, expect, it } from "vitest";
import { freshDb, get, post, put, del } from "./helpers";

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function makeRecipe(name: string): Promise<number> {
  const res = await post("/api/recipes", { name });
  expect(res.status).toBe(201);
  return Number((await body(res)).id);
}

const W36 = "2026-W36"; // lunes 2026-08-31 … domingo 2026-09-06

type MealRow = { meal: string; recipeId: number | null; recipeName: string | null };
type SessionBox = {
  id: number;
  templateId: number;
  templateName: string;
  status: string;
  summary: { effort: number; exercises: number; sets: number } | null;
};

describe("GET /api/day/:date", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("happy path: meals ordered, planned session, note", async () => {
    const tortilla = await makeRecipe("Tortilla");
    const sopa = await makeRecipe("Sopa");
    const ensalada = await makeRecipe("Ensalada");
    // miércoles de W36: desayuno/almuerzo/cena; otro día no debe aparecer
    await put(`/api/meal-plan/${W36}`, {
      slots: [
        { day: 2, meal: "desayuno", recipeId: tortilla },
        { day: 2, meal: "almuerzo", recipeId: sopa },
        { day: 2, meal: "cena", recipeId: ensalada },
        { day: 3, meal: "desayuno", recipeId: sopa },
      ],
    });
    const bench = await post("/api/exercises", { name: "Press banca", tags: ["pecho"] });
    const template = await post("/api/templates", {
      name: "Empuje A",
      exercises: [{ exerciseId: Number((await body(bench)).id), target_sets: 3 }],
    });
    const templateId = Number((await body(template)).id);
    await post("/api/plan-sessions", { date: "2026-09-02", templateId });
    await put("/api/notes/2026-09-02", { text: "Buen día" });

    const res = await get("/api/day/2026-09-02");
    expect(res.status).toBe(200);
    const day = await body(res);
    expect(day.date).toBe("2026-09-02");
    expect(day.isoWeek).toBe(W36);
    expect(day.dayIndex).toBe(2);
    expect(day.meals as MealRow[]).toEqual([
      { meal: "desayuno", recipeId: tortilla, recipeName: "Tortilla" },
      { meal: "almuerzo", recipeId: sopa, recipeName: "Sopa" },
      { meal: "cena", recipeId: ensalada, recipeName: "Ensalada" },
    ]);
    expect(day.session as SessionBox).toMatchObject({
      templateId,
      templateName: "Empuje A",
      status: "planned",
      summary: null,
    });
    expect(day.note).toEqual({ text: "Buen día" });
  });

  it("día vacío: sin plan, sin sesión, sin nota → 200 con datos vacíos", async () => {
    const res = await get("/api/day/2026-09-02");
    expect(res.status).toBe(200);
    const day = await body(res);
    expect(day.isoWeek).toBe("2026-W36");
    expect(day.dayIndex).toBe(2);
    expect(day.meals).toEqual([]);
    expect(day.session).toBeNull();
    expect(day.note).toEqual({ text: "" });
  });

  it("receta borrada → slot con recipeId/recipeName null, sigue 200", async () => {
    const id = await makeRecipe("Temporera");
    await put(`/api/meal-plan/${W36}`, { slots: [{ day: 2, meal: "almuerzo", recipeId: id }] });
    expect((await del(`/api/recipes/${id}`)).status).toBe(204);
    const day = await body(await get("/api/day/2026-09-02"));
    expect(day.meals as MealRow[]).toEqual([{ meal: "almuerzo", recipeId: null, recipeName: null }]);
  });

  it("sesión logged → summary { effort, exercises, sets } desde set_logs", async () => {
    const bench = await post("/api/exercises", { name: "Press banca", tags: ["pecho"] });
    const curl = await post("/api/exercises", { name: "Curl", tags: ["bíceps"] });
    const template = await post("/api/templates", {
      name: "Empuje B",
      exercises: [
        { exerciseId: Number((await body(bench)).id), target_sets: 4 },
        { exerciseId: Number((await body(curl)).id), target_sets: 4 },
      ],
    });
    const templateId = Number((await body(template)).id);
    const tmpl = (await body(await get(`/api/templates/${templateId}`))) as {
      exercises: { id: number }[];
    };
    const [teBench, teCurl] = tmpl.exercises.map((e) => e.id);
    await post("/api/plan-sessions", { date: "2026-09-02", templateId });
    // 3 series banca + 2 curl = 5 sets, 2 ejercicios, esfuerzo 3
    const log = await post("/api/workout-logs/2026-09-02", {
      effort: 3,
      sets: [
        { templateExerciseId: teBench, setIndex: 0, weightKg: 60, reps: 8, done: true },
        { templateExerciseId: teBench, setIndex: 1, weightKg: 60, reps: 7, done: true },
        { templateExerciseId: teBench, setIndex: 2, weightKg: 62, reps: 6, done: true },
        { templateExerciseId: teCurl, setIndex: 0, weightKg: 10, reps: 12, done: true },
        { templateExerciseId: teCurl, setIndex: 1, weightKg: 10, reps: 10, done: true },
      ],
    });
    expect(log.status).toBe(201);
    const day = await body(await get("/api/day/2026-09-02"));
    const session = day.session as SessionBox;
    expect(session.status).toBe("logged");
    expect(session.summary).toEqual({ effort: 3, exercises: 2, sets: 5 });
  });

  it("domingo mapea a la semana del lunes (edge ISO)", async () => {
    const id = await makeRecipe("Cena domingera");
    await put(`/api/meal-plan/${W36}`, { slots: [{ day: 6, meal: "cena", recipeId: id }] });
    const day = await body(await get("/api/day/2026-09-06"));
    expect(day.isoWeek).toBe("2026-W36");
    expect(day.dayIndex).toBe(6);
    expect((day.meals as MealRow[])[0].recipeName).toBe("Cena domingera");
  });

  it("2027-01-01 cae en 2026-W53", async () => {
    const day = await body(await get("/api/day/2027-01-01"));
    expect(day.isoWeek).toBe("2026-W53");
    expect(day.dayIndex).toBe(4);
  });

  for (const bad of ["2026-9-2", "not-a-date", "2026-13-01", "2026-02-30"]) {
    it(`400 { error, field: "date" } para ${bad}`, async () => {
      const res = await get(`/api/day/${bad}`);
      expect(res.status).toBe(400);
      const e = await body(res);
      expect(typeof e.error).toBe("string");
      expect(e.field).toBe("date");
    });
  }

  it("400 con date vacía", async () => {
    const res = await get("/api/day/");
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("date");
  });

  it("no tapa rutas existentes", async () => {
    expect((await get("/api/health")).status).toBe(200);
    expect((await get("/api/recipes")).status).toBe(200);
    expect((await get("/api/notes/2026-09-02")).status).toBe(200);
  });
});
