// Autoguardado del borrador del día: las piezas puras (serializar, validar y
// volver a aplicar lo guardado) sin pasar por el DOM más que para el almacén.
import { afterEach, describe, expect, it } from "vitest";
import {
  clearDraft,
  draftHasWork,
  draftKey,
  hasRealDraft,
  parseSnapshot,
  readDraft,
  restoreCardio,
  restoreExercises,
  snapshotOf,
  writeDraft,
} from "../src/lib/day-draft";

afterEach(() => window.localStorage.clear());

describe("snapshotOf", () => {
  it("serializa los ids del plan con sus series, cardio, esfuerzo y nota", () => {
    expect(
      snapshotOf(
        [
          {
            se: { id: 11 },
            noWeight: true,
            sets: [
              {
                weightKg: 60,
                reps: 8,
                durationSecs: null,
                done: true,
                touched: true,
              },
              {
                weightKg: 60,
                reps: 6,
                durationSecs: null,
                done: false,
                touched: false,
              },
            ],
          },
        ],
        [{ se: { id: 13 }, distanceKm: 5, durationMin: 30, done: true }],
        4,
        "buena",
      ),
    ).toEqual({
      version: 2,
      exercises: [
        {
          id: 11,
          noWeight: true,
          sets: [
            {
              weightKg: 60,
              reps: 8,
              durationSecs: null,
              done: true,
              touched: true,
            },
            {
              weightKg: 60,
              reps: 6,
              durationSecs: null,
              done: false,
              touched: false,
            },
          ],
        },
      ],
      cardio: [{ id: 13, distanceKm: 5, durationMin: 30, done: true }],
      effort: 4,
      note: "buena",
    });
  });
});

describe("parseSnapshot", () => {
  it("sin nada guardado o con basura no hay borrador", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot("")).toBeNull();
    expect(parseSnapshot("{")).toBeNull();
    expect(parseSnapshot('"hola"')).toBeNull();
    expect(parseSnapshot("[]")).toBeNull();
    // Versión distinta (lo de una app futura no se interpreta a la ligera).
    expect(
      parseSnapshot(
        JSON.stringify({
          version: 3,
          exercises: [],
          cardio: [],
          effort: null,
          note: "",
        }),
      ),
    ).toBeNull();
  });

  it("una forma incompleta se descarta (series sin campos, esfuerzo no numérico)", () => {
    const empty = {
      version: 2,
      exercises: [],
      cardio: [],
      effort: null,
      note: "",
    };
    expect(
      parseSnapshot(
        JSON.stringify({
          ...empty,
          exercises: [{ id: 11, noWeight: false, sets: [{ weightKg: 60 }] }],
        }),
      ),
    ).toBeNull();
    expect(
      parseSnapshot(JSON.stringify({ ...empty, effort: "mucho" })),
    ).toBeNull();
    expect(
      parseSnapshot(JSON.stringify({ ...empty, cardio: [{}] })),
    ).toBeNull();
  });

  it("un borrador válido vuelve tal cual", () => {
    const snapshot = snapshotOf(
      [
        {
          se: { id: 11 },
          noWeight: false,
          sets: [
            {
              weightKg: 60,
              reps: 8,
              durationSecs: null,
              done: false,
              touched: false,
            },
          ],
        },
      ],
      [],
      3,
      "",
    );
    expect(parseSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});

describe("restoreExercises", () => {
  const current = () => [
    {
      se: { id: 11 },
      noWeight: false,
      sets: [
        {
          weightKg: 50,
          reps: 6,
          durationSecs: null,
          done: false,
          touched: false,
        },
        {
          weightKg: 50,
          reps: 6,
          durationSecs: null,
          done: false,
          touched: false,
        },
      ],
    },
    {
      se: { id: 12 },
      noWeight: false,
      sets: [
        {
          weightKg: null,
          reps: null,
          durationSecs: null,
          done: false,
          touched: false,
        },
      ],
    },
  ];

  it("restaura las marcas, «sin peso» y el toque de la misma serie y recuento", () => {
    const restored = restoreExercises(current(), [
      {
        id: 11,
        noWeight: true,
        sets: [
          {
            weightKg: 60,
            reps: 8,
            durationSecs: null,
            done: true,
            touched: true,
          },
          {
            weightKg: 62.5,
            reps: 6,
            durationSecs: null,
            done: false,
            touched: true,
          },
        ],
      },
    ]);
    expect(restored[0].noWeight).toBe(true);
    expect(restored[0].sets).toEqual([
      { weightKg: 60, reps: 8, durationSecs: null, done: true, touched: true },
      {
        weightKg: 62.5,
        reps: 6,
        durationSecs: null,
        done: false,
        touched: true,
      },
    ]);
    // La del ejercicio sin nada guardado sigue igual.
    expect(restored[1].sets).toEqual([
      {
        weightKg: null,
        reps: null,
        durationSecs: null,
        done: false,
        touched: false,
      },
    ]);
  });

  it("restaura los segundos de un ejercicio por tiempo", () => {
    const restored = restoreExercises(current(), [
      {
        id: 12,
        noWeight: false,
        sets: [
          {
            weightKg: null,
            reps: null,
            durationSecs: 45,
            done: true,
            touched: true,
          },
        ],
      },
    ]);
    expect(restored[1].sets).toEqual([
      {
        weightKg: null,
        reps: null,
        durationSecs: 45,
        done: true,
        touched: true,
      },
    ]);
  });

  it("si el recuento de series cambió (el plan se editó), no toca la fila", () => {
    const restored = restoreExercises(current(), [
      {
        id: 11,
        noWeight: true,
        sets: [
          {
            weightKg: 60,
            reps: 8,
            durationSecs: null,
            done: true,
            touched: true,
          },
        ],
      },
    ]);
    expect(restored[0].noWeight).toBe(false);
    expect(restored[0].sets).toEqual([
      {
        weightKg: 50,
        reps: 6,
        durationSecs: null,
        done: false,
        touched: false,
      },
      {
        weightKg: 50,
        reps: 6,
        durationSecs: null,
        done: false,
        touched: false,
      },
    ]);
  });

  it("sin nada guardado devuelve el mismo borrador", () => {
    const before = current();
    expect(restoreExercises(before, undefined)).toBe(before);
  });
});

describe("restoreCardio", () => {
  it("restaura distancia, tiempo y hecho del mismo ejercicio", () => {
    const restored = restoreCardio(
      [
        { se: { id: 13 }, distanceKm: null, durationMin: null, done: false },
        { se: { id: 14 }, distanceKm: null, durationMin: null, done: false },
      ],
      [{ id: 13, distanceKm: 5, durationMin: 30, done: true }],
    );
    expect(restored[0]).toMatchObject({
      distanceKm: 5,
      durationMin: 30,
      done: true,
    });
    expect(restored[1].done).toBe(false);
  });

  it("sin nada guardado devuelve la misma lista", () => {
    const before = [
      { se: { id: 13 }, distanceKm: null, durationMin: null, done: false },
    ];
    expect(restoreCardio(before, undefined)).toBe(before);
  });
});

describe("draftHasWork", () => {
  /** El borrador que deja abrir un día planificado: las series del plan, sin
   *  marcar ni tocar, y sin cardio, esfuerzo ni nota. */
  const opened = () =>
    snapshotOf(
      [
        {
          se: { id: 11 },
          noWeight: false,
          sets: [
            {
              weightKg: null,
              reps: null,
              durationSecs: null,
              done: false,
              touched: false,
            },
            {
              weightKg: null,
              reps: null,
              durationSecs: null,
              done: false,
              touched: false,
            },
          ],
        },
      ],
      [{ se: { id: 13 }, distanceKm: null, durationMin: null, done: false }],
      null,
      "",
    );

  it("un borrador recién abierto no es trabajo que perder", () => {
    expect(draftHasWork(opened())).toBe(false);
  });

  it("una serie marcada o editada ya lo es", () => {
    const done = opened();
    done.exercises[0].sets[1].done = true;
    expect(draftHasWork(done)).toBe(true);

    const touched = opened();
    touched.exercises[0].sets[0].touched = true;
    expect(draftHasWork(touched)).toBe(true);
  });

  it("el cardio hecho, el esfuerzo o la nota también", () => {
    const cardio = opened();
    cardio.cardio[0].done = true;
    expect(draftHasWork(cardio)).toBe(true);

    const effort = opened();
    effort.effort = 3;
    expect(draftHasWork(effort)).toBe(true);

    const note = opened();
    note.note = "buena sesión";
    expect(draftHasWork(note)).toBe(true);
    // Una nota en blanco no es nada escrito.
    note.note = "   ";
    expect(draftHasWork(note)).toBe(false);
  });
});

describe("hasRealDraft", () => {
  it("sin borrador guardado, o con uno recién abierto, no hay trabajo que perder", () => {
    expect(hasRealDraft("2026-09-02")).toBe(false);
    writeDraft("2026-09-02", snapshotOf([], [], null, ""));
    expect(hasRealDraft("2026-09-02")).toBe(false);
  });

  it("con una marca guardada, sí", () => {
    writeDraft(
      "2026-09-02",
      snapshotOf(
        [
          {
            se: { id: 11 },
            noWeight: false,
            sets: [
              {
                weightKg: 60,
                reps: 8,
                durationSecs: null,
                done: true,
                touched: true,
              },
            ],
          },
        ],
        [],
        null,
        "",
      ),
    );
    expect(hasRealDraft("2026-09-02")).toBe(true);
  });
});

describe("almacén", () => {
  it("guarda, lee y borra el borrador de una fecha", () => {
    const snapshot = snapshotOf([], [], 2, "nota");
    expect(readDraft("2026-09-02")).toBeNull();
    writeDraft("2026-09-02", snapshot);
    expect(readDraft("2026-09-02")).toEqual(snapshot);
    expect(window.localStorage.getItem(draftKey("2026-09-02"))).toContain(
      '"version":2',
    );
    clearDraft("2026-09-02");
    expect(readDraft("2026-09-02")).toBeNull();
  });

  it("con algo ilegible guardado, se lee como si no hubiera nada", () => {
    window.localStorage.setItem(draftKey("2026-09-02"), "no es json");
    expect(readDraft("2026-09-02")).toBeNull();
  });
});
