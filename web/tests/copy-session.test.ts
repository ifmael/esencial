// copy-session: copiar el PLAN de una sesión (día → día y semana → semana).
// Se copia lo guardado —ejercicios, orden, objetivos, descansos, cadenas y
// nombre—, nunca el registro (marcas, esfuerzo, nota) ni el borrador local.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCopyOps,
  CopyError,
  type CopyOp,
  copyFailureMessage,
  copyPayload,
  dayBlockedMessage,
  dayCopyMessage,
  dayCopyOp,
  daySources,
  replaceNotice,
  sourceWeeks,
  type UndoStep,
  undoCopy,
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
      session(2, "2026-08-26", "Nueva", "planned", [row(12, 8, 0)]),
      session(3, "2026-09-01", "Registrada", "logged"),
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

  it("un día que no se va a escribir (sin sesión en el origen ni en el destino) no bloquea", () => {
    const days = weekCopyDays(W36, W35, [
      session(1, "2026-08-24", "Empuje", "planned", [row(11, 7, 0)]),
    ]);
    // El viernes 4 no se toca: da igual que tenga un borrador abierto (abrir
    // el día ya escribe uno), la copia no lo pisa.
    expect(days.find((d) => d.date === "2026-09-04")?.action).toBe("none");
    expect(weekCopyBlockers(days, (date) => date === "2026-09-04")).toEqual([]);
  });
});

describe("undoCopy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("deshace en orden inverso y devuelve los pasos que el servidor rechazó", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push(`${method} ${String(input)}`);
        // El PUT de vuelta del día sustituido es el que ya no se puede hacer.
        return method === "PUT"
          ? new Response(JSON.stringify({ error: "Sesión ya registrada" }), {
              status: 409,
              headers: { "content-type": "application/json" },
            })
          : new Response("{}", { status: 200 });
      },
    );

    const steps: UndoStep[] = [
      { action: "delete", id: 5 },
      { action: "put", id: 6, payload: { name: null, items: [] } },
    ];
    expect(await undoCopy(steps)).toEqual([steps[1]]);
    // Del último al primero, y un fallo no corta los demás.
    expect(calls).toEqual([
      "PUT /api/plan-sessions/6",
      "DELETE /api/plan-sessions/5",
    ]);
  });
});

describe("applyCopyOps", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("si una escritura falla, deshace lo aplicado y dice si el deshacer quedó a medias", async () => {
    let posts = 0;
    vi.stubGlobal(
      "fetch",
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          posts += 1;
          return posts === 1
            ? new Response(JSON.stringify({ id: 900 }), { status: 201 })
            : new Response(JSON.stringify({ error: "Ya hay una sesión" }), {
                status: 409,
              });
        }
        // El deshacer no consigue borrar lo creado.
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      },
    );

    const source = session(1, "2026-08-24", "Empuje", "planned", [
      row(11, 7, 0),
    ]);
    const failure = await applyCopyOps([
      { kind: "create", date: "2026-08-31", source },
      { kind: "create", date: "2026-09-01", source },
    ]).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(CopyError);
    expect((failure as CopyError).undoFailed).toBe(1);
  });
});

describe("copyFailureMessage", () => {
  it("dice si se deshizo, y no lo promete cuando el deshacer quedó a medias", () => {
    expect(copyFailureMessage("la semana", 0)).toBe(
      "No se pudo copiar la semana; se deshizo lo aplicado y la rejilla se ha recargado.",
    );
    expect(copyFailureMessage("la sesión", 2)).toBe(
      "No se pudo copiar la sesión y no se pudo deshacer todo; la rejilla se ha recargado.",
    );
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
