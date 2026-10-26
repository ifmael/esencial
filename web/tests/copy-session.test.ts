// copy-session: copiar el PLAN de una sesión (día → día y semana → semana).
// Se copia lo guardado —ejercicios, orden, objetivos, descansos, cadenas y
// nombre—, nunca el registro (marcas, esfuerzo, nota) ni el borrador local.
import { describe, expect, it } from "vitest";
import {
  type CopyOp,
  copyPayload,
  dayBlockedMessage,
  dayCopyMessage,
  dayCopyOp,
  dayLabel,
  daySources,
  replaceNotice,
  sourceWeeks,
  weekCopyBlockers,
  weekCopyDays,
  weekCopyLines,
  weekCopyMessage,
  weekCopyOps,
  weekCopySummary,
} from "../src/lib/copy-session";
import type { PlanSession, SessionExercise } from "../src/lib/plan-week";

/** Fila de `plan_session_exercises` tal como la devuelve la API. */
const row = (
  id: number,
  exerciseId: number,
  position: number,
  extra: Partial<SessionExercise> = {},
): SessionExercise => ({
  id,
  exerciseId,
  exerciseName: `E${exerciseId}`,
  kind: "strength",
  metric: "weight_reps",
  position,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 10,
  targetDistanceKm: null,
  targetDurationMin: null,
  restSecs: 120,
  restAfterSecs: 90,
  superset: false,
  ...extra,
});

const session = (
  id: number,
  date: string,
  name: string | null,
  status: "planned" | "logged",
  exercises: SessionExercise[] = [],
): PlanSession => ({ id, date, name, status, exercises });

// Semana 2026-W36: lun 31 ago … dom 6 sept. La anterior, 2026-W35: 24–30 ago.
const W36 = [
  "2026-08-31",
  "2026-09-01",
  "2026-09-02",
  "2026-09-03",
  "2026-09-04",
  "2026-09-05",
  "2026-09-06",
];
const W35 = [
  "2026-08-24",
  "2026-08-25",
  "2026-08-26",
  "2026-08-27",
  "2026-08-28",
  "2026-08-29",
  "2026-08-30",
];

describe("dayLabel", () => {
  it("rótulo corto de la fecha (UTC, sin reloj)", () => {
    expect(dayLabel("2026-08-31")).toBe("lun 31 ago");
    expect(dayLabel("2026-09-06")).toBe("dom 6 sept");
    expect(dayLabel("2026-01-01")).toBe("jue 1 ene");
  });
});

describe("copyPayload", () => {
  it("copia el nombre y el plan entero: orden, objetivos, descansos y cadenas", () => {
    const source = session(1, "2026-08-31", "Empuje A", "logged", [
      row(11, 7, 0, { superset: true, restSecs: null, restAfterSecs: null }),
      row(12, 8, 1, { restSecs: 45, restAfterSecs: 150, superset: false }),
      row(13, 10, 2, {
        kind: "running",
        targetSets: null,
        targetRepsMin: null,
        targetRepsMax: null,
        targetDistanceKm: 10,
        targetDurationMin: 45,
        restSecs: null,
      }),
    ]);
    expect(copyPayload(source)).toEqual({
      name: "Empuje A",
      items: [
        {
          exerciseId: 7,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 10,
          targetDistanceKm: null,
          targetDurationMin: null,
          restSecs: null,
          restAfterSecs: null,
          superset: true,
        },
        {
          exerciseId: 8,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 10,
          targetDistanceKm: null,
          targetDurationMin: null,
          restSecs: 45,
          restAfterSecs: 150,
          superset: false,
        },
        {
          exerciseId: 10,
          targetSets: null,
          targetRepsMin: null,
          targetRepsMax: null,
          targetDistanceKm: 10,
          targetDurationMin: 45,
          restSecs: null,
          restAfterSecs: 90,
          superset: false,
        },
      ],
    });
  });
});

describe("daySources", () => {
  it("ofrece todo día con sesión guardada menos el destino, del más reciente al más antiguo", () => {
    const sessions = [
      session(1, "2026-08-31", "A", "planned"),
      session(2, "2026-09-01", "B", "planned"), // el destino
      session(3, "2026-08-24", "C", "logged"),
      session(4, "2026-09-10", "D", "planned"),
    ];
    expect(daySources(sessions, "2026-09-01").map((s) => s.date)).toEqual([
      "2026-09-10",
      "2026-08-31",
      "2026-08-24",
    ]);
  });

  it("sin sesiones no hay orígenes", () => {
    expect(daySources([], "2026-09-01")).toEqual([]);
  });
});

describe("dayBlockedMessage", () => {
  it("un destino registrado no admite la copia encima", () => {
    expect(
      dayBlockedMessage(
        session(1, "2026-09-01", "B", "logged"),
        false,
        "2026-09-01",
      ),
    ).toBe("El mar 1 sept ya está registrado: no se puede copiar encima.");
  });

  it("un destino con borrador sin registrar tampoco", () => {
    expect(
      dayBlockedMessage(
        session(1, "2026-09-02", "B", "planned"),
        true,
        "2026-09-02",
      ),
    ).toBe(
      "El mié 2 sept tiene un borrador sin registrar: no se puede copiar encima.",
    );
  });

  it("un día vacío o planificado sí (el planificado se sustituye)", () => {
    expect(dayBlockedMessage(undefined, false, "2026-09-03")).toBeNull();
    expect(
      dayBlockedMessage(
        session(1, "2026-09-03", "B", "planned"),
        false,
        "2026-09-03",
      ),
    ).toBeNull();
  });
});

describe("dayCopyOp", () => {
  const source = session(1, "2026-08-31", "Empuje A", "planned", [
    row(11, 7, 0),
  ]);

  it("día vacío: se crea", () => {
    expect(dayCopyOp("2026-09-01", source, undefined)).toEqual({
      kind: "create",
      date: "2026-09-01",
      source,
      target: undefined,
    });
  });

  it("día planificado: se sustituye su sesión", () => {
    const target = session(2, "2026-09-01", "Viejo", "planned");
    expect(dayCopyOp("2026-09-01", source, target)).toEqual({
      kind: "replace",
      date: "2026-09-01",
      source,
      target,
    });
  });
});

describe("replaceNotice", () => {
  it("dice cuántos ejercicios se pierden", () => {
    expect(replaceNotice(3)).toBe(
      "El día ya tiene 3 ejercicios: se sustituirán.",
    );
    expect(replaceNotice(1)).toBe(
      "El día ya tiene 1 ejercicio: se sustituirá.",
    );
  });
});

describe("weekCopyDays", () => {
  const source = (date: string, name: string, n = 2) =>
    session(
      Number(date.slice(8)),
      date,
      name,
      "planned",
      Array.from({ length: n }, (_, i) => row(100 + i, 7 + i, i)),
    );

  it("empareja día a día (lunes con lunes) con la acción de cada fecha", () => {
    const days = weekCopyDays(W36, W35, [
      source("2026-08-24", "Empuje"), // lun origen
      source("2026-08-26", "Cardio", 1), // mié origen
      source("2026-09-01", "Viejo", 3), // mar destino
      source("2026-09-03", "Otro", 1), // jue destino
    ]);
    expect(days.map((d) => [d.date, d.action])).toEqual([
      ["2026-08-31", "create"],
      ["2026-09-01", "delete"],
      ["2026-09-02", "create"],
      ["2026-09-03", "delete"],
      ["2026-09-04", "none"],
      ["2026-09-05", "none"],
      ["2026-09-06", "none"],
    ]);

    const days2 = weekCopyDays(W36, W35, [
      source("2026-08-25", "Pierna"),
      source("2026-09-01", "Viejo"),
    ]);
    expect(days2[1]).toMatchObject({
      date: "2026-09-01",
      action: "replace",
      source: { name: "Pierna" },
      target: { name: "Viejo" },
    });
  });

  it("las acciones son las que pide la copia: crear, sustituir y borrar", () => {
    const ops = weekCopyOps(
      weekCopyDays(W36, W35, [
        source("2026-08-24", "Empuje"),
        source("2026-08-26", "Cardio", 1),
        source("2026-08-25", "Pierna"),
        source("2026-09-01", "Viejo", 3),
        source("2026-09-03", "Otro", 1),
      ]),
    );
    expect(ops.map((op) => [op.kind, op.date])).toEqual([
      ["create", "2026-08-31"],
      ["replace", "2026-09-01"],
      ["create", "2026-09-02"],
      ["delete", "2026-09-03"],
    ]);
  });

  it("las líneas del aviso global listan lo que pasará, día a día", () => {
    const lines = weekCopyLines(
      weekCopyDays(W36, W35, [
        source("2026-08-24", "Empuje"),
        source("2026-08-25", "Pierna"),
        source("2026-08-26", "Cardio", 1),
        source("2026-09-01", "Viejo", 3),
        source("2026-09-03", "Otro", 2),
      ]),
    );
    expect(lines).toEqual([
      "Lun 31 ago: se copia «Empuje» (2 ejercicios)",
      "Mar 1 sept: se sustituye por «Pierna» (2 ejercicios)",
      "Mié 2 sept: se copia «Cardio» (1 ejercicio)",
      "Jue 3 sept: se borra «Otro» (2 ejercicios)",
    ]);
  });

  it("resume los días creados / sustituidos / borrados y los ejercicios copiados", () => {
    const days = weekCopyDays(W36, W35, [
      source("2026-08-24", "Empuje", 3),
      source("2026-08-25", "Pierna", 2),
      source("2026-08-26", "Cardio", 1),
      source("2026-09-01", "Viejo", 3),
      source("2026-09-03", "Otro", 2),
    ]);
    expect(weekCopySummary(days)).toEqual({
      created: 2,
      replaced: 1,
      deleted: 1,
      exercises: 6,
    });
    expect(weekCopyMessage(weekCopySummary(days))).toBe(
      "Semana copiada · 2 creados · 1 sustituido · 1 borrado · 6 ejercicios",
    );
  });
});

describe("weekCopyBlockers", () => {
  it("nombra los días destino que no se pueden escribir, sin ofrecer quitarlos", () => {
    const days = weekCopyDays(W36, W35, [
      session(1, "2026-08-24", "Empuje", "planned", [row(11, 7, 0)]),
      session(2, "2026-09-01", "Registrada", "logged"),
    ]);
    expect(weekCopyBlockers(days, (date) => date === "2026-09-02")).toEqual([
      "El mar 1 sept ya está registrado: no se puede copiar la semana.",
      "El mié 2 sept tiene un borrador sin registrar: no se puede copiar la semana.",
    ]);
  });

  it("sin destinos bloqueados no hay nada que decir", () => {
    const days = weekCopyDays(W36, W35, [
      session(1, "2026-08-24", "Empuje", "planned", [row(11, 7, 0)]),
      session(2, "2026-09-01", "Vieja", "planned", [row(12, 8, 0)]),
    ]);
    expect(weekCopyBlockers(days, () => false)).toEqual([]);
  });

  it("un día que se borraría estando registrado también bloquea", () => {
    const days = weekCopyDays(W36, W35, [
      session(1, "2026-09-04", "Registrada", "logged"),
    ]);
    expect(weekCopyBlockers(days, () => false)).toEqual([
      "El vie 4 sept ya está registrado: no se puede copiar la semana.",
    ]);
  });
});

describe("sourceWeeks", () => {
  it("solo semanas anteriores a la vista, con sesiones, de la más reciente a la más antigua", () => {
    const weeks = sourceWeeks(
      [
        session(1, "2026-08-31", "A", "planned"), // W36, la vista
        session(2, "2026-08-24", "B", "planned"), // W35
        session(3, "2026-08-26", "C", "logged"), // W35
        session(4, "2026-08-19", "D", "planned"), // W34
        session(5, "2026-09-07", "E", "planned"), // W37, posterior
      ],
      "2026-W36",
    );
    expect(weeks).toEqual([
      { week: "2026-W35", count: 2 },
      { week: "2026-W34", count: 1 },
    ]);
  });
});

describe("dayCopyMessage", () => {
  it("dice qué se copió", () => {
    expect(dayCopyMessage("2026-09-01", 4)).toBe(
      "Sesión copiada al mar 1 sept · 4 ejercicios",
    );
    expect(dayCopyMessage("2026-09-01", 1)).toBe(
      "Sesión copiada al mar 1 sept · 1 ejercicio",
    );
  });
});

describe("CopyOp", () => {
  it("nunca lleva marcas, esfuerzo ni nota: solo el plan", () => {
    const op = dayCopyOp(
      "2026-09-01",
      session(1, "2026-08-31", "A", "logged", [row(11, 7, 0)]),
      undefined,
    ) as CopyOp;
    expect(Object.keys(op).sort()).toEqual([
      "date",
      "kind",
      "source",
      "target",
    ]);
  });
});
