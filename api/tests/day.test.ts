// E5 tasks 2.1-2.5: GET /api/day/:date aggregation, seeded through the public
// endpoints so the join runs against real rows (design D7).
import { beforeEach, describe, expect, it } from "vitest";
import { del, freshDb, get, post, postForm, put } from "./helpers";

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function makeRecipe(name: string): Promise<number> {
  const res = await post("/api/recipes", { name });
  expect(res.status).toBe(201);
  return Number((await body(res)).id);
}

const W36 = "2026-W36"; // lunes 2026-08-31 … domingo 2026-09-06

type MealRow = {
  meal: string;
  recipeId: number | null;
  recipeName: string | null;
  recipePhoto: string | null;
};

// 1x1 PNG real (firma válida) — mismo contrato que api/tests/uploads.test.ts.
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function pngForm(): FormData {
  const form = new FormData();
  form.append("file", new File([PNG], "foto.png", { type: "image/png" }));
  return form;
}

async function uploadPhoto(): Promise<string> {
  const res = await postForm("/api/uploads", pngForm());
  expect(res.status).toBe(200);
  return String((await body(res)).photo_path);
}
type SessionBox = {
  id: number;
  name: string | null;
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
    const bench = await post("/api/exercises", {
      name: "Press banca",
      tags: ["pecho"],
    });
    const benchId = Number((await body(bench)).id);
    await post("/api/plan-sessions", {
      date: "2026-09-02",
      name: "Empuje A",
      items: [{ exerciseId: benchId, targetSets: 3 }],
    });
    await put("/api/notes/2026-09-02", { text: "Buen día" });

    const res = await get("/api/day/2026-09-02");
    expect(res.status).toBe(200);
    const day = await body(res);
    expect(day.date).toBe("2026-09-02");
    expect(day.isoWeek).toBe(W36);
    expect(day.dayIndex).toBe(2);
    expect(day.meals as MealRow[]).toEqual([
      {
        meal: "desayuno",
        recipeId: tortilla,
        recipeName: "Tortilla",
        recipePhoto: null,
      },
      {
        meal: "almuerzo",
        recipeId: sopa,
        recipeName: "Sopa",
        recipePhoto: null,
      },
      {
        meal: "cena",
        recipeId: ensalada,
        recipeName: "Ensalada",
        recipePhoto: null,
      },
    ]);
    expect(day.session as SessionBox).toMatchObject({
      name: "Empuje A",
      status: "planned",
      summary: null,
    });
    expect(day.note).toEqual({ text: "Buen día" });
  });

  it("planned session incluye exercises expandidos (kind y targets) ordenados por position", async () => {
    const r1 = await post("/api/exercises", {
      name: "Press banca",
      tags: ["pecho"],
    });
    const r2 = await post("/api/exercises", {
      name: "Fondos",
      tags: ["tríceps"],
    });
    const r3 = await post("/api/exercises", {
      name: "Remo",
      tags: ["espalda"],
    });
    const r4 = await post("/api/exercises", {
      name: "Running",
      tags: ["cardio"],
      kind: "running",
    });
    const [e1, e2, e3, e4] = await Promise.all([
      body(r1),
      body(r2),
      body(r3),
      body(r4),
    ]).then((rs) => rs.map((r) => Number(r.id)));
    await post("/api/plan-sessions", {
      date: "2026-09-02",
      items: [
        { exerciseId: e3 },
        { exerciseId: e1 },
        { exerciseId: e2 },
        { exerciseId: e4, targetDistanceKm: 6, targetDurationMin: 35 },
      ],
    });

    const res = await get("/api/day/2026-09-02");
    expect(res.status).toBe(200);
    const day = await body(res);
    expect(day.session as SessionBox).toMatchObject({ status: "planned" });
    const session = day.session as SessionBox & { exercises: unknown };
    const empty = {
      kind: "strength",
      targetSets: null,
      targetDistanceKm: null,
      targetDurationMin: null,
    };
    expect(session.exercises).toEqual([
      { ...empty, exerciseId: e3, exerciseName: "Remo", position: 0 },
      { ...empty, exerciseId: e1, exerciseName: "Press banca", position: 1 },
      { ...empty, exerciseId: e2, exerciseName: "Fondos", position: 2 },
      {
        ...empty,
        kind: "running",
        exerciseId: e4,
        exerciseName: "Running",
        position: 3,
        targetDistanceKm: 6,
        targetDurationMin: 35,
      },
    ]);
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
    await put(`/api/meal-plan/${W36}`, {
      slots: [{ day: 2, meal: "almuerzo", recipeId: id }],
    });
    expect((await del(`/api/recipes/${id}`)).status).toBe(204);
    const day = await body(await get("/api/day/2026-09-02"));
    expect(day.meals as MealRow[]).toEqual([
      { meal: "almuerzo", recipeId: null, recipeName: null, recipePhoto: null },
    ]);
  });

  it("slot con receta con foto → recipePhoto es la key R2", async () => {
    const photo = await uploadPhoto();
    const res = await post("/api/recipes", {
      name: "Con foto",
      photo_path: photo,
    });
    expect(res.status).toBe(201);
    const recipeId = Number((await body(res)).id);
    await put(`/api/meal-plan/${W36}`, {
      slots: [{ day: 2, meal: "almuerzo", recipeId }],
    });
    const day = await body(await get("/api/day/2026-09-02"));
    expect(day.meals as MealRow[]).toEqual([
      {
        meal: "almuerzo",
        recipeId,
        recipeName: "Con foto",
        recipePhoto: photo,
      },
    ]);
  });

  it("sesión logged → summary { effort, exercises, sets } desde set_logs", async () => {
    const bench = await post("/api/exercises", {
      name: "Press banca",
      tags: ["pecho"],
    });
    const curl = await post("/api/exercises", {
      name: "Curl",
      tags: ["bíceps"],
    });
    const benchId = Number((await body(bench)).id);
    const curlId = Number((await body(curl)).id);
    const created = await post("/api/plan-sessions", {
      date: "2026-09-02",
      items: [
        { exerciseId: benchId, targetSets: 4 },
        { exerciseId: curlId, targetSets: 4 },
      ],
    });
    const planned = (await body(created)) as {
      exercises: { id: number; exerciseId: number }[];
    };
    const byExercise = new Map(
      planned.exercises.map((e) => [e.exerciseId, e.id]),
    );
    const teBench = Number(byExercise.get(benchId));
    const teCurl = Number(byExercise.get(curlId));
    // 3 series banca + 2 curl = 5 sets, 2 ejercicios, esfuerzo 3
    const log = await post("/api/workout-logs/2026-09-02", {
      effort: 3,
      sets: [
        {
          planSessionExerciseId: teBench,
          setIndex: 0,
          weightKg: 60,
          reps: 8,
          done: true,
        },
        {
          planSessionExerciseId: teBench,
          setIndex: 1,
          weightKg: 60,
          reps: 7,
          done: true,
        },
        {
          planSessionExerciseId: teBench,
          setIndex: 2,
          weightKg: 62,
          reps: 6,
          done: true,
        },
        {
          planSessionExerciseId: teCurl,
          setIndex: 0,
          weightKg: 10,
          reps: 12,
          done: true,
        },
        {
          planSessionExerciseId: teCurl,
          setIndex: 1,
          weightKg: 10,
          reps: 10,
          done: true,
        },
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
    await put(`/api/meal-plan/${W36}`, {
      slots: [{ day: 6, meal: "cena", recipeId: id }],
    });
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
