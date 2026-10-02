// Pure draft logic (E4 tasks 1.3 + 1.4): reducer helpers, payload builder, copy names.
import { describe, expect, it } from "vitest";
import {
  addEntry,
  buildTemplatePayload,
  type Draft,
  type DraftEntry,
  moveItem,
  nextCopyName,
  removeEntry,
  restAt,
  setTargets,
} from "../src/lib/template-draft";

const ex = (id: number, name: string): DraftEntry => ({
  key: `e${id}`,
  exerciseId: id,
  exerciseName: name,
  kind: "strength",
  targetSets: null,
  targetRepsMin: null,
  targetRepsMax: null,
  targetDistanceKm: null,
  targetDurationMin: null,
  restSecs: null,
  restAfterSecs: null,
});

const cardio = (id: number, name: string): DraftEntry => ({
  ...ex(id, name),
  kind: "running",
});

const draft = (...entries: DraftEntry[]): Draft => ({
  name: "A — Empuje",
  entries,
});

describe("moveItem", () => {
  it("moves an item down, preserving relative order of the rest", () => {
    const list = ["a", "b", "c"];
    expect(moveItem(list, 0, 1)).toEqual(["b", "a", "c"]);
    expect(list).toEqual(["a", "b", "c"]); // pure
  });
  it("moves an item up", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
  it("is a no-op for out-of-range or equal indexes", () => {
    expect(moveItem(["a", "b"], 1, 5)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], -1, 0)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("draft reducer", () => {
  it("addEntry appends with a stable unique key", () => {
    const d = draft(ex(1, "Press"));
    const with2 = addEntry(d, ex(2, "Remo"));
    expect(with2.entries.map((e) => e.exerciseName)).toEqual(["Press", "Remo"]);
    const with3 = addEntry(d, ex(2, "Remo"));
    expect(with3.entries[1].key).not.toBe(with2.entries[1].key); // keys don't collide on duplicates
    expect(with2.entries[1].key).not.toBe(with2.entries[0].key);
    expect(d.entries).toHaveLength(1); // original untouched
  });

  it("removeEntry removes by key and keeps relative order", () => {
    const d = draft(ex(1, "a"), ex(2, "b"), ex(3, "c"));
    const r = removeEntry(d, "e2");
    expect(r.entries.map((e) => e.exerciseName)).toEqual(["a", "c"]);
  });

  it("setTargets updates one entry by key (fuerza y cardio)", () => {
    const d = draft(ex(1, "a"), ex(2, "b"));
    const s = setTargets(d, "e2", {
      targetSets: 4,
      targetRepsMin: 6,
      targetRepsMax: 8,
    });
    expect(s.entries[1].targetSets).toBe(4);
    expect(s.entries[1].targetRepsMin).toBe(6);
    expect(s.entries[1].targetRepsMax).toBe(8);
    expect(s.entries[0].targetSets).toBeNull();
    expect(d.entries[1].targetSets).toBeNull();

    const c = setTargets(d, "e1", {
      targetDistanceKm: 10,
      targetDurationMin: 45,
    });
    expect(c.entries[0].targetDistanceKm).toBe(10);
    expect(c.entries[0].targetDurationMin).toBe(45);
    expect(c.entries[0].targetSets).toBeNull();
  });

  it("descansos: setTargets los guarda y el payload los envía", () => {
    const d = setTargets(draft(ex(1, "Press")), "e1", {
      restSecs: 90,
      restAfterSecs: 150,
    });
    expect(d.entries[0]).toMatchObject({ restSecs: 90, restAfterSecs: 150 });
    expect(buildTemplatePayload(d).exercises[0]).toMatchObject({
      restSecs: 90,
      restAfterSecs: 150,
    });
  });
});

describe("buildTemplatePayload", () => {
  it("emits nullable targets 0..n-1 including cardio", () => {
    const a = {
      ...ex(7, "Press"),
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
    };
    const b = ex(9, "Remo");
    const c = { ...cardio(10, "Running"), targetDistanceKm: 10 };
    const payload = buildTemplatePayload(draft(a, b, c));
    expect(payload).toEqual({
      name: "A — Empuje",
      exercises: [
        {
          exerciseId: 7,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 12,
          targetDistanceKm: null,
          targetDurationMin: null,
          restSecs: null,
          restAfterSecs: null,
        },
        {
          exerciseId: 9,
          targetSets: null,
          targetRepsMin: null,
          targetRepsMax: null,
          targetDistanceKm: null,
          targetDurationMin: null,
          restSecs: null,
          restAfterSecs: null,
        },
        {
          exerciseId: 10,
          targetSets: null,
          targetRepsMin: null,
          targetRepsMax: null,
          targetDistanceKm: 10,
          targetDurationMin: null,
          restSecs: null,
          restAfterSecs: null,
        },
      ],
    });
  });
});

describe("restAt", () => {
  it("vacío → null; el resto se recorta al rango 1..3600", () => {
    expect(restAt("")).toBeNull();
    expect(restAt("0")).toBe(1);
    expect(restAt("90")).toBe(90);
    expect(restAt("99999")).toBe(3600);
  });
});

describe("nextCopyName", () => {
  it("adds (copia) suffix", () => {
    expect(nextCopyName("B — Tirón", ["B — Tirón"])).toBe("B — Tirón (copia)");
  });
  it("increments on collision", () => {
    expect(nextCopyName("B — Tirón", ["B — Tirón", "B — Tirón (copia)"])).toBe(
      "B — Tirón (copia 2)",
    );
    expect(
      nextCopyName("B — Tirón", [
        "B — Tirón",
        "B — Tirón (copia)",
        "B — Tirón (copia 2)",
      ]),
    ).toBe("B — Tirón (copia 3)");
  });
});
