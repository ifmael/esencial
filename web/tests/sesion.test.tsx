// /sesion/:date — estado A (borrador editable sobre la sesión del día: fuerza
// con series/peso/reps y cardio con distancia/tiempo opcionales) y estado B
// (solo lectura desde GET /api/workout-logs/:date).

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { createFakeAudio } from "./audio-fake";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // El autoguardado del borrador escribe aquí: que no lo vea el caso siguiente.
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

type SetItem = {
  planSessionExerciseId: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  done: boolean;
};

const SE_BENCH = 11; // plan_session_exercise id for "Press banca"
const SE_ROW = 12; // plan_session_exercise id for "Remo con barra"
const SE_RUN = 13; // plan_session_exercise id for "Running"

const SESSION_DETAIL = {
  id: 1,
  date: "2026-09-02",
  name: "Empuje A",
  status: "planned",
  exercises: [
    {
      id: SE_BENCH,
      exerciseId: 21,
      exerciseName: "Press banca",
      kind: "strength",
      metric: "weight_reps",
      position: 0,
      targetSets: 3,
      targetRepsMin: 6,
      targetRepsMax: 8,
      targetDistanceKm: null,
      targetDurationMin: null,
      restSecs: 90,
      restAfterSecs: 120,
    },
    {
      id: SE_ROW,
      exerciseId: 22,
      exerciseName: "Remo con barra",
      kind: "strength",
      metric: "weight_reps",
      position: 1,
      targetSets: null,
      targetRepsMin: null,
      targetRepsMax: null,
      targetDistanceKm: null,
      targetDurationMin: null,
      restSecs: null,
      restAfterSecs: null,
    },
    {
      id: SE_RUN,
      exerciseId: 23,
      exerciseName: "Running",
      kind: "running",
      metric: "weight_reps",
      position: 2,
      targetSets: null,
      targetRepsMin: null,
      targetRepsMax: null,
      targetDistanceKm: 5,
      targetDurationMin: 30,
      restSecs: null,
      restAfterSecs: 120,
    },
  ],
};

function loggedPayload(
  sets: SetItem[],
  effort = 2,
  note: string | null = null,
  cardio: {
    planSessionExerciseId: number;
    distanceKm: number | null;
    durationMin: number | null;
    done: boolean;
  }[] = [],
) {
  return {
    date: "2026-09-02",
    status: "logged",
    readOnly: true,
    effort,
    note,
    session: { id: 1, name: "Empuje A" },
    sets: sets.map((s) => ({
      ...s,
      exerciseId: s.planSessionExerciseId === SE_BENCH ? 21 : 22,
      exerciseName:
        s.planSessionExerciseId === SE_BENCH ? "Press banca" : "Remo con barra",
    })),
    cardio: cardio.map((c) => ({ ...c, exerciseName: "Running" })),
  };
}

type Mock = {
  posts: unknown[];
  puts: unknown[];
  planPuts: unknown[];
  calls: string[];
  fetchCount: () => number;
  urls: string[];
};

function mockApi(opts: {
  sessions?: {
    id: number;
    date: string;
    name: string | null;
    status: string;
    /** El plan del día con sus ejercicios: la vista del registro lee de aquí
     *  qué iba encadenado (el log no lo guarda). */
    exercises?: unknown[];
  }[];
  last?: Record<
    number,
    {
      weightKg: number | null;
      reps: number | null;
      durationSecs?: number | null;
      date: string;
    } | null
  >;
  log?: unknown; // GET /api/workout-logs response when logged
  logs?: Record<string, unknown>; // otros días registrados (sesión anterior)
  lastFails?: boolean;
  postReply?: { status: number; body: unknown };
  /** Detalle alternativo del día (GET /api/plan-sessions/:id). */
  detail?: unknown;
}): Mock {
  let count = 0;
  const posts: unknown[] = [];
  const puts: unknown[] = [];
  const planPuts: unknown[] = [];
  const calls: string[] = [];
  const urls: string[] = [];
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      count += 1;
      urls.push(String(url));
      const method = init?.method ?? "GET";
      if (method !== "GET") calls.push(`${method} ${url}`);
      if (init?.method === "PUT") {
        const b = JSON.parse(init.body ?? "{}");
        if (/^\/api\/plan-sessions\/\d+$/.test(String(url))) {
          planPuts.push(b);
          return reply(200, SESSION_DETAIL);
        }
        puts.push(b);
        return reply(200, loggedPayload(b.sets, b.effort, b.note, b.cardio));
      }
      if (init?.method === "POST") {
        posts.push(JSON.parse(init.body ?? "null"));
        const r = opts.postReply ?? {
          status: 201,
          body: loggedPayload(
            (JSON.parse(init.body ?? "{}").sets ?? []) as SetItem[],
            JSON.parse(init.body ?? "{}").effort,
            null,
            JSON.parse(init.body ?? "{}").cardio ?? [],
          ),
        };
        return reply(r.status, r.body);
      }
      if (url === "/api/plan-sessions")
        return reply(
          200,
          opts.sessions ?? [
            { id: 1, date: "2026-09-02", name: "Empuje A", status: "planned" },
          ],
        );
      if (/^\/api\/plan-sessions\/\d+$/.test(url))
        return reply(200, opts.detail ?? SESSION_DETAIL);
      const last = /^\/api\/exercises\/(\d+)\/last(\?.*)?$/.exec(url);
      if (last) {
        if (opts.lastFails) return reply(500, { error: "boom" });
        const id = Number(last[1]);
        return reply(200, { exerciseId: id, last: opts.last?.[id] ?? null });
      }
      if (url === "/api/workout-logs/2026-09-02") return reply(200, opts.log);
      const other = /^\/api\/workout-logs\/(.+)$/.exec(url);
      if (other && opts.logs?.[other[1]])
        return reply(200, opts.logs[other[1]]);
      return reply(404, { error: "Not found" });
    }),
  );
  return { posts, puts, planPuts, calls, urls, fetchCount: () => count };
}

/** El botón «Cerrar sesión» de la barra flotante de la sesión. */
function primaryClose(): Promise<HTMLButtonElement> {
  return waitFor(
    () =>
      within(
        screen.getByRole("toolbar", { name: /acciones de la sesión/i }),
      ).getByRole("button", { name: /cerrar sesión/i }) as HTMLButtonElement,
  );
}
function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const LOGGED = [
  { id: 1, date: "2026-09-02", name: "Empuje A", status: "logged" },
];

describe("autoguardado del borrador", () => {
  const DRAFT_KEY = "esencial.borrador.2026-09-02";
  const savedDraft = () =>
    JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null");

  it("guarda lo escrito en cada cambio y lo recupera al volver a la pantalla", async () => {
    mockApi({ last: { 21: { weightKg: 60, reps: 8, date: "2026-08-30" } } });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    fireEvent.change(screen.getByLabelText(/^reps · press banca serie 1$/i), {
      target: { value: "10" },
    });
    // Lo escrito viaja al almacén, atado al ejercicio del plan.
    await waitFor(() =>
      expect(savedDraft().exercises[0].sets[0]).toMatchObject({
        weightKg: 60,
        reps: 10,
        done: true,
        touched: true,
      }),
    );
    expect(savedDraft().exercises[0].id).toBe(SE_BENCH);

    // Otro montaje, como un refresco: el borrador vuelve tal cual.
    cleanup();
    mockApi({ last: { 21: { weightKg: 60, reps: 8, date: "2026-08-30" } } });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    expect(
      (
        screen.getByLabelText(
          /^reps · press banca serie 1$/i,
        ) as HTMLInputElement
      ).value,
    ).toBe("10");
    expect(boxOf("press banca", 1).checked).toBe(true);
  });

  it("al cerrar la sesión se borra el borrador guardado", async () => {
    const api = mockApi({
      last: { 21: { weightKg: 60, reps: 8, date: "2026-08-30" } },
    });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    fireEvent.click(boxOf("press banca", 1));
    await waitFor(() =>
      expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull(),
    );

    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: /esfuerzo percibido/i }),
      ).getByRole("radio", { name: /^esfuerzo 3:/i }),
    );
    fireEvent.click(await primaryClose());
    await waitFor(() => expect(api.posts).toHaveLength(1));
    await screen.findByRole("button", { name: /^editar$/i });
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe("route states", () => {
  it("header shows Spanish date + session name", async () => {
    mockApi({});
    renderAt("/sesion/2026-09-02");
    await screen.findByText("Empuje A");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /miércoles, 2 de septiembre/,
    );
  });

  it("no session scheduled → empty state with a way back", async () => {
    mockApi({ sessions: [] });
    renderAt("/sesion/2026-09-02");
    const empty = await screen.findByText(/sin sesión/i);
    expect(empty).toBeDefined();
    expect(screen.getByRole("link", { name: /volver al día$/i })).toBeDefined();
  });

  it("malformed date → invalid state, zero fetches", async () => {
    const api = mockApi({});
    renderAt("/sesion/hola");
    await screen.findByText(/fecha no válida/i);
    expect(api.fetchCount()).toBe(0);
  });
});

describe("state A: editable", () => {
  it("exercise rows in session order with per-set checkboxes (null → 3)", async () => {
    mockApi({ last: { 21: { weightKg: 57.5, reps: 8, date: "2026-08-30" } } });
    renderAt("/sesion/2026-09-02");
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes.length).toBe(7); // 3 + 3 series + 1 checkbox de cardio
    const rows = screen.getAllByRole("link", {
      name: /press banca|remo con barra|running/i,
    });
    expect(rows.map((r) => r.textContent)).toEqual([
      "Press banca",
      "Remo con barra",
      "Running",
    ]);
    expect(rows[0].getAttribute("href")).toBe("/ejercicios/21");
  });

  it("expanding shows steppers; increment is draft-only (no fetch)", async () => {
    const api = mockApi({
      last: { 21: { weightKg: 57.5, reps: 8, date: "2026-08-30" } },
    });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    const weight = await screen.findByLabelText(
      /^peso \(kg\) · press banca serie 1$/i,
    );
    const before = api.fetchCount();
    fireEvent.click(
      screen.getByRole("button", {
        name: /aumentar peso \(kg\) · press banca serie 1/i,
      }),
    );
    expect((weight as HTMLInputElement).value).toBe("60"); // 57.5 → 60 (2.5kg steps)
    expect(api.fetchCount()).toBe(before);
  });

  it("cada campo numérico lleva su nombre visible", async () => {
    mockApi({});
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /series de remo con barra/i }),
    );
    expect(screen.getAllByText("Peso (kg)").length).toBe(6); // 3 series × 2 ejercicios
    expect(screen.getAllByText("Reps").length).toBe(6);
    expect(screen.getByText("Distancia (km)")).toBeDefined();
    expect(screen.getByText("Tiempo (min)")).toBeDefined();
  });

  it("prefill: última helper + starting values; never-logged exercise has no helper", async () => {
    mockApi({ last: { 21: { weightKg: 57.5, reps: 8, date: "2026-08-30" } } });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    await screen.findByText("última: 57.5×8");
    expect(
      (
        screen.getByLabelText(
          /^peso \(kg\) · press banca serie 1$/i,
        ) as HTMLInputElement
      ).value,
    ).toBe("57.5");
    expect(
      (
        screen.getByLabelText(
          /^reps · press banca serie 1$/i,
        ) as HTMLInputElement
      ).value,
    ).toBe("8");
    fireEvent.click(
      screen.getByRole("button", { name: /series de remo con barra/i }),
    );
    await screen.findByLabelText(/^peso \(kg\) · remo con barra serie 1$/i);
    expect(screen.queryAllByText(/última/).length).toBe(1);
  });

  it("last-endpoint failure is non-blocking: warning + manual logging still possible", async () => {
    mockApi({ lastFails: true });
    renderAt("/sesion/2026-09-02");
    await screen.findByText(/no se pudo cargar el histórico/i);
    fireEvent.click(
      screen.getByRole("button", { name: /series de press banca/i }),
    );
    expect(
      await screen.findByLabelText(/^peso \(kg\) · press banca serie 1$/i),
    ).toBeDefined();
    expect(screen.queryAllByText(/última/).length).toBe(0);
  });

  it("cardio: marcas opcionales; escribir distancia implica hecho", async () => {
    const api = mockApi({});
    renderAt("/sesion/2026-09-02");
    const distance = await screen.findByLabelText(
      /^distancia \(km\) · running$/i,
    );
    const done = screen.getByRole("checkbox", { name: /running hecho/i });
    expect((distance as HTMLInputElement).value).toBe("");
    expect((done as HTMLInputElement).checked).toBe(false);

    fireEvent.change(distance, { target: { value: "8.5" } });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("checkbox", {
            name: /running hecho/i,
          }) as HTMLInputElement
        ).checked,
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole("radio", { name: /4/ }));
    const close = (await primaryClose()) as HTMLButtonElement;
    await waitFor(() => expect(close.disabled).toBe(false));
    fireEvent.click(close);
    await waitFor(() => expect(api.posts.length).toBe(1));
    const body = api.posts[0] as { cardio: unknown[] };
    expect(body.cardio).toEqual([
      {
        planSessionExerciseId: SE_RUN,
        distanceKm: 8.5,
        durationMin: null,
        done: true,
      },
    ]);
  });

  it("cardio hecho sin marcas se envía con números null", async () => {
    const api = mockApi({});
    renderAt("/sesion/2026-09-02");
    const done = await screen.findByRole("checkbox", {
      name: /running hecho/i,
    });
    fireEvent.click(done);
    fireEvent.click(screen.getByRole("radio", { name: /4/ }));
    const close = (await primaryClose()) as HTMLButtonElement;
    await waitFor(() => expect(close.disabled).toBe(false));
    fireEvent.click(close);
    await waitFor(() => expect(api.posts.length).toBe(1));
    const body = api.posts[0] as { cardio: unknown[] };
    expect(body.cardio).toEqual([
      {
        planSessionExerciseId: SE_RUN,
        distanceKm: null,
        durationMin: null,
        done: true,
      },
    ]);
  });

  it("Cerrar sesión disabled until effort; picking dot 4 posts effort 4 with camelCase sets", async () => {
    const api = mockApi({});
    renderAt("/sesion/2026-09-02");
    const close = (await primaryClose()) as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /4/ }));
    await waitFor(() => expect(close.disabled).toBe(false));
    fireEvent.click(close);
    await waitFor(() => expect(api.posts.length).toBe(1));
    const body = api.posts[0] as {
      effort: number;
      note?: string | null;
      sets: SetItem[];
      cardio: unknown[];
    };
    expect(body.effort).toBe(4);
    expect(body.note ?? null).toBeNull(); // blank note never sent as ""
    expect(body.sets.length).toBe(6);
    expect(body.sets[0]).toEqual({
      planSessionExerciseId: SE_BENCH,
      setIndex: 0,
      weightKg: null,
      reps: 6, // objetivo de reps del plan cuando no hay histórico
      durationSecs: null,
      done: false,
    });
    expect(body.sets[0]).not.toHaveProperty("set_index");
    expect(body.cardio).toEqual([]); // cardio sin tocar no viaja
  });

  it("double click sends exactly one POST; 201 flips to state B with badge", async () => {
    const api = mockApi({});
    renderAt("/sesion/2026-09-02");
    const close = (await primaryClose()) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("radio", { name: /3/ }));
    await waitFor(() => expect(close.disabled).toBe(false));
    fireEvent.click(close);
    fireEvent.click(close);
    await waitFor(() => expect(screen.getByText("Registrado")).toBeDefined());
    expect(api.posts.length).toBe(1);
  });

  it("400 with field → banner names the field, draft stays editable", async () => {
    mockApi({
      last: { 21: { weightKg: 60, reps: 8, date: "2026-08-30" } },
      postReply: {
        status: 400,
        body: { error: "Required", field: "sets.0.setIndex" },
      },
    });
    renderAt("/sesion/2026-09-02");
    const close = (await primaryClose()) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("radio", { name: /3/ }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: /press banca serie 1/i }),
    );
    await waitFor(() => expect(close.disabled).toBe(false));
    fireEvent.click(close);
    await screen.findByText(/sets\.0\.setIndex/);
    // draft preserved: checkbox still checked, still interactive
    expect(
      (
        screen.getByRole("checkbox", {
          name: /press banca serie 1/i,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("marcar todas las series y el cardio muestra el sello; desmarcar una lo retira", async () => {
    mockApi({
      last: {
        21: { weightKg: 60, reps: 8, date: "2026-08-30" },
        22: { weightKg: 40, reps: 10, date: "2026-08-30" },
      },
    });
    renderAt("/sesion/2026-09-02");
    const seal = () =>
      screen
        .queryAllByRole("status")
        .find((el) => /sesión completa/i.test(el.textContent ?? ""));
    const boxes = await screen.findAllByRole("checkbox");
    for (const box of boxes.slice(0, -1)) fireEvent.click(box);
    expect(seal()).toBeUndefined(); // falta el cardio
    fireEvent.click(boxes[boxes.length - 1]);
    await waitFor(() => expect(seal()).toBeDefined());
    fireEvent.click(
      screen.getByRole("checkbox", { name: /press banca serie 2/i }),
    );
    await waitFor(() => expect(seal()).toBeUndefined());
  });

  it("409 → reload into read-only state B with persisted data", async () => {
    mockApi({
      postReply: {
        status: 409,
        body: { error: "This day is already logged and read-only" },
      },
      log: loggedPayload(
        [
          {
            planSessionExerciseId: SE_BENCH,
            setIndex: 0,
            weightKg: 60,
            reps: 8,
            done: true,
          },
        ],
        2,
        "fuerte",
      ),
    });
    renderAt("/sesion/2026-09-02");
    const close = (await primaryClose()) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("radio", { name: /3/ }));
    await waitFor(() => expect(close.disabled).toBe(false));
    fireEvent.click(close);
    await screen.findByText("Registrado");
    expect(screen.getByText(/60×8/)).toBeDefined();
    expect(screen.getByText("fuerte")).toBeDefined();
  });
});

describe("state B: read-only", () => {
  it("renders from GET workout-logs: sets, cardio, dots, note, no inputs", async () => {
    mockApi({
      sessions: LOGGED,
      log: loggedPayload(
        [
          {
            planSessionExerciseId: SE_BENCH,
            setIndex: 0,
            weightKg: 60,
            reps: 8,
            done: true,
          },
          {
            planSessionExerciseId: SE_BENCH,
            setIndex: 1,
            weightKg: null,
            reps: null,
            done: false,
          },
        ],
        2,
        "sesión floja",
        [
          {
            planSessionExerciseId: SE_RUN,
            distanceKm: 5.2,
            durationMin: 32,
            done: true,
          },
        ],
      ),
    });
    const { container } = renderAt("/sesion/2026-09-02");
    await screen.findByText("Registrado");
    expect(screen.getByText(/60×8/)).toBeDefined();
    expect(screen.getByText("sesión floja")).toBeDefined();
    expect(screen.getByText(/—/)).toBeDefined();
    expect(screen.getByText("Running")).toBeDefined();
    expect(screen.getByText(/5\.2 km · 32 min/)).toBeDefined();
    expect(container.querySelectorAll("input, textarea, select").length).toBe(
      0,
    );
    // Sin barra de acciones ni botón de cerrar la sesión de entreno (el de
    // salir del shell no está en main).
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(
      within(screen.getByRole("main")).queryByRole("button", {
        name: /cerrar sesión/i,
      }),
    ).toBeNull();
    // effort 2 of 5 filled
    const dots = screen.getAllByTestId("effort-dot");
    expect(
      dots.filter((d) => d.getAttribute("data-filled") === "true").length,
    ).toBe(2);
  });
});

const weightOf = (ex: string, n: number) =>
  screen.getByLabelText(
    new RegExp(`^peso \\(kg\\) · ${ex} serie ${n}$`, "i"),
  ) as HTMLInputElement;
const repsOf = (ex: string, n: number) =>
  screen.getByLabelText(
    new RegExp(`^reps · ${ex} serie ${n}$`, "i"),
  ) as HTMLInputElement;
const boxOf = (ex: string, n: number) =>
  screen.getByRole("checkbox", {
    name: new RegExp(`^${ex} serie ${n}$`, "i"),
  }) as HTMLInputElement;

describe("auto-marcar la serie al escribir sus marcas", () => {
  it("la precarga no marca; completar kilos y reps marca; vaciar desmarca", async () => {
    mockApi({ last: { 21: { weightKg: 60, reps: 8, date: "2026-08-30" } } });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    await screen.findByLabelText(/^peso \(kg\) · press banca serie 1$/i);
    expect(boxOf("press banca", 1).checked).toBe(false); // precarga ≠ hecho

    fireEvent.change(repsOf("press banca", 1), { target: { value: "10" } });
    await waitFor(() => expect(boxOf("press banca", 1).checked).toBe(true));

    fireEvent.change(weightOf("press banca", 1), { target: { value: "" } });
    await waitFor(() => expect(boxOf("press banca", 1).checked).toBe(false));

    // stepper también cuenta como edición
    fireEvent.click(
      screen.getByRole("button", {
        name: /aumentar peso \(kg\) · press banca serie 1/i,
      }),
    );
    await waitFor(() => expect(boxOf("press banca", 1).checked).toBe(true));
  });

  it("sin histórico: con solo reps no se marca hasta poner kilos", async () => {
    mockApi({});
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de remo con barra/i }),
    );
    await screen.findByLabelText(/^reps · remo con barra serie 1$/i);
    fireEvent.change(repsOf("remo con barra", 1), { target: { value: "8" } });
    expect(boxOf("remo con barra", 1).checked).toBe(false);
    fireEvent.change(weightOf("remo con barra", 1), {
      target: { value: "40" },
    });
    await waitFor(() => expect(boxOf("remo con barra", 1).checked).toBe(true));
  });

  it("una serie sin kilos no se marca a mano; con «sin peso» sí", async () => {
    mockApi({}); // reps del objetivo (6), kilos vacíos
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    await screen.findByLabelText(/^reps · press banca serie 1$/i);
    expect(boxOf("press banca", 1).disabled).toBe(true);
    fireEvent.click(boxOf("press banca", 1));
    expect(boxOf("press banca", 1).checked).toBe(false);

    fireEvent.click(
      screen.getByRole("switch", { name: /sin peso · press banca/i }),
    );
    await waitFor(() => expect(boxOf("press banca", 1).disabled).toBe(false));
    fireEvent.click(boxOf("press banca", 1));
    await waitFor(() => expect(boxOf("press banca", 1).checked).toBe(true));
  });

  it("marcar todas solo marca las series completas", async () => {
    mockApi({ last: { 21: { weightKg: 60, reps: 8, date: "2026-08-30" } } });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    await screen.findByLabelText(/^peso \(kg\) · press banca serie 2$/i);
    fireEvent.change(weightOf("press banca", 2), { target: { value: "" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: /marcar todas las series de press banca/i,
      }),
    );
    await waitFor(() => expect(boxOf("press banca", 1).checked).toBe(true));
    expect(boxOf("press banca", 2).checked).toBe(false);
    expect(boxOf("press banca", 3).checked).toBe(true);
  });
});

describe("ejercicio sin peso", () => {
  it("el conmutador oculta los kilos, basta con reps y se envía weightKg null", async () => {
    const api = mockApi({
      last: { 21: { weightKg: 60, reps: 8, date: "2026-08-30" } },
    });
    renderAt("/sesion/2026-09-02");
    const sw = (await screen.findByRole("switch", {
      name: /sin peso · press banca/i,
    })) as HTMLInputElement;
    expect(sw.checked).toBe(false);
    fireEvent.click(sw);
    fireEvent.click(
      screen.getByRole("button", { name: /series de press banca/i }),
    );
    await screen.findByLabelText(/^reps · press banca serie 1$/i);
    expect(
      screen.queryByLabelText(/^peso \(kg\) · press banca serie 1$/i),
    ).toBeNull();
    fireEvent.change(repsOf("press banca", 1), { target: { value: "12" } });
    await waitFor(() => expect(boxOf("press banca", 1).checked).toBe(true));

    fireEvent.click(screen.getByRole("radio", { name: /3/ }));
    const close = await primaryClose();
    await waitFor(() => expect(close.disabled).toBe(false));
    fireEvent.click(close);
    await waitFor(() => expect(api.posts.length).toBe(1));
    const sets = (api.posts[0] as { sets: SetItem[] }).sets.filter(
      (s) => s.planSessionExerciseId === SE_BENCH,
    );
    expect(sets.every((s) => s.weightKg === null)).toBe(true);
    expect(sets[0]).toMatchObject({ reps: 12, done: true });
  });

  it("empieza activado si lo último registrado no llevaba peso", async () => {
    mockApi({ last: { 21: { weightKg: null, reps: 10, date: "2026-08-30" } } });
    renderAt("/sesion/2026-09-02");
    const sw = (await screen.findByRole("switch", {
      name: /sin peso · press banca/i,
    })) as HTMLInputElement;
    expect(sw.checked).toBe(true);
    expect(screen.getByText("última: 10 reps")).toBeDefined();
  });

  it("cambiar el conmutador recalcula las series editadas, no las precargadas", async () => {
    mockApi({}); // sin histórico: reps precargadas del objetivo (6), kilos vacíos
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    await screen.findByLabelText(/^reps · press banca serie 1$/i);
    fireEvent.change(repsOf("press banca", 1), { target: { value: "10" } });
    expect(boxOf("press banca", 1).checked).toBe(false); // faltan los kilos

    const sw = screen.getByRole("switch", { name: /sin peso · press banca/i });
    fireEvent.click(sw);
    await waitFor(() => expect(boxOf("press banca", 1).checked).toBe(true));
    expect(boxOf("press banca", 2).checked).toBe(false); // precargada: intacta

    fireEvent.click(sw);
    await waitFor(() => expect(boxOf("press banca", 1).checked).toBe(false));
  });
});

describe("registrar y después corregir en la misma visita", () => {
  it("Editar abre el borrador plegado aunque antes se desplegara un ejercicio", async () => {
    mockApi({});
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    await screen.findByLabelText(/^reps · press banca serie 1$/i);
    fireEvent.click(screen.getByRole("radio", { name: /3/ }));
    const close = await primaryClose();
    await waitFor(() => expect(close.disabled).toBe(false));
    fireEvent.click(close);
    fireEvent.click(await screen.findByRole("button", { name: /^editar$/i }));
    const toggle = await screen.findByRole("button", {
      name: /series de press banca/i,
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(
      await screen.findByLabelText(/^reps · press banca serie 1$/i),
    ).toBeDefined();
  });
});

describe("marcas de la sesión anterior con el mismo nombre", () => {
  const prevLog = (date: string, weight: number) => ({
    ...loggedPayload([
      {
        planSessionExerciseId: SE_BENCH,
        setIndex: 0,
        weightKg: weight,
        reps: 10,
        done: true,
      },
      {
        planSessionExerciseId: SE_BENCH,
        setIndex: 1,
        weightKg: weight,
        reps: 8,
        done: true,
      },
    ]),
    date,
  });

  it("coge la registrada más reciente anterior y sustituye a «última»", async () => {
    const api = mockApi({
      sessions: [
        { id: 7, date: "2026-08-21", name: "Empuje A", status: "logged" },
        { id: 8, date: "2026-08-28", name: "Empuje A", status: "logged" },
        { id: 9, date: "2026-08-29", name: "Tirón", status: "logged" },
        { id: 1, date: "2026-09-02", name: "Empuje A", status: "planned" },
      ],
      last: { 21: { weightKg: 50, reps: 5, date: "2026-08-29" } },
      logs: {
        "2026-08-21": prevLog("2026-08-21", 50),
        "2026-08-28": prevLog("2026-08-28", 60),
      },
    });
    renderAt("/sesion/2026-09-02");
    await screen.findByText("vie, 28/08: 60×10 · 60×8");
    expect(screen.queryByText(/última: 50×5/)).toBeNull();
    expect(api.urls).not.toContain("/api/workout-logs/2026-08-21");
    // el ejercicio que no estaba en la anterior conserva su pista normal
    expect(screen.queryAllByText(/vie, 28\/08/).length).toBe(1);
  });

  it("una sesión sin nombre no busca anterior", async () => {
    const api = mockApi({
      sessions: [
        { id: 8, date: "2026-08-28", name: null, status: "logged" },
        { id: 1, date: "2026-09-02", name: null, status: "planned" },
      ],
      logs: { "2026-08-28": prevLog("2026-08-28", 60) },
    });
    renderAt("/sesion/2026-09-02");
    await screen.findByRole("button", { name: /series de press banca/i });
    expect(api.urls).not.toContain("/api/workout-logs/2026-08-28");
    expect(screen.queryByText(/28\/08/)).toBeNull();
  });
});

describe("copiar la serie homóloga de la sesión anterior", () => {
  /** Registro previo del mismo nombre con las marcas [kilos, reps] por serie. */
  const prevPayload = (sets: [number | null, number][], date: string) => ({
    ...loggedPayload(
      sets.map(([weightKg, reps], setIndex) => ({
        planSessionExerciseId: SE_BENCH,
        setIndex,
        weightKg,
        reps,
        done: true,
      })),
    ),
    date,
  });

  const prevSessions = [
    { id: 8, date: "2026-08-28", name: "Empuje A", status: "logged" },
    { id: 1, date: "2026-09-02", name: "Empuje A", status: "planned" },
  ];

  const expandBench = async () => {
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    await screen.findByLabelText(/^peso \(kg\) · press banca serie 1$/i);
  };

  const chip = (n: number, value: string) =>
    screen.getByRole("button", {
      name: new RegExp(
        `^copiar ${value} de la sesión anterior a press banca serie ${n}$`,
        "i",
      ),
    });

  it("muestra el valor de cada serie homóloga y solo donde la hay", async () => {
    mockApi({
      sessions: prevSessions,
      logs: {
        "2026-08-28": prevPayload(
          [
            [60, 10],
            [55, 8],
          ],
          "2026-08-28",
        ),
      },
    });
    renderAt("/sesion/2026-09-02");
    await expandBench();
    expect(chip(1, "60×10")).toBeDefined();
    expect(chip(2, "55×8")).toBeDefined();
    // el borrador tiene 3 series y la anterior solo 2: la tercera no copia nada
    expect(
      screen.queryByRole("button", {
        name: /de la sesión anterior a press banca serie 3/i,
      }),
    ).toBeNull();
  });

  it("copiar rellena reps y kilos sin marcar la serie, y así viaja al registro", async () => {
    const api = mockApi({
      sessions: prevSessions,
      // /last distinto: lo copiado es la serie homóloga, no «última».
      last: { 21: { weightKg: 40, reps: 6, date: "2026-08-29" } },
      logs: {
        "2026-08-28": prevPayload(
          [
            [60, 10],
            [55, 8],
          ],
          "2026-08-28",
        ),
      },
    });
    renderAt("/sesion/2026-09-02");
    await expandBench();
    expect(boxOf("press banca", 1).checked).toBe(false);

    fireEvent.click(chip(1, "60×10"));
    await waitFor(() => expect(weightOf("press banca", 1).value).toBe("60"));
    expect(repsOf("press banca", 1).value).toBe("10");
    expect(boxOf("press banca", 1).checked).toBe(false); // copiar no marca
    // solo esa serie: la 2 conserva la precarga de /last
    expect(weightOf("press banca", 2).value).toBe("40");
    expect(repsOf("press banca", 2).value).toBe("6");

    fireEvent.click(screen.getByRole("radio", { name: /3/ }));
    const close = await primaryClose();
    await waitFor(() => expect(close.disabled).toBe(false));
    fireEvent.click(close);
    await waitFor(() => expect(api.posts.length).toBe(1));
    const sets = (api.posts[0] as { sets: SetItem[] }).sets.filter(
      (s) => s.planSessionExerciseId === SE_BENCH,
    );
    expect(sets[0]).toMatchObject({
      setIndex: 0,
      weightKg: 60,
      reps: 10,
      done: false,
    });
    expect(sets[1]).toMatchObject({ setIndex: 1, weightKg: 40, reps: 6 });
  });

  it("origen sin kilos: copia solo las reps y no conmuta «Sin peso»", async () => {
    mockApi({
      sessions: prevSessions,
      last: { 21: { weightKg: 40, reps: 6, date: "2026-08-29" } },
      logs: { "2026-08-28": prevPayload([[null, 12]], "2026-08-28") },
    });
    renderAt("/sesion/2026-09-02");
    await expandBench();
    const sw = () =>
      screen.getByRole("switch", {
        name: /sin peso · press banca/i,
      }) as HTMLInputElement;
    expect(sw().checked).toBe(false);

    fireEvent.click(chip(1, "12 reps"));
    await waitFor(() => expect(repsOf("press banca", 1).value).toBe("12"));
    expect(weightOf("press banca", 1).value).toBe("40"); // kilos intactos
    expect(boxOf("press banca", 1).checked).toBe(false);
    expect(sw().checked).toBe(false);
  });
});

const logged = loggedPayload(
  [
    {
      planSessionExerciseId: SE_BENCH,
      setIndex: 0,
      weightKg: 60,
      reps: 8,
      done: true,
    },
    {
      planSessionExerciseId: SE_BENCH,
      setIndex: 1,
      weightKg: 60,
      reps: 6,
      done: true,
    },
    {
      planSessionExerciseId: SE_ROW,
      setIndex: 0,
      weightKg: null,
      reps: 12,
      done: true,
    },
  ],
  3,
  "bien",
  [
    {
      planSessionExerciseId: SE_RUN,
      distanceKm: 5,
      durationMin: 30,
      done: true,
    },
  ],
);

describe("corregir una sesión registrada", () => {
  it("Editar precarga el registro (series, sin peso, esfuerzo, nota) y Guardar hace PUT", async () => {
    const api = mockApi({
      sessions: LOGGED,
      log: logged,
      // /last más reciente con peso: la edición NO debe usarlo
      last: { 22: { weightKg: 80, reps: 5, date: "2026-09-20" } },
    });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(await screen.findByRole("button", { name: /^editar$/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    expect(weightOf("press banca", 2).value).toBe("60");
    expect(repsOf("press banca", 2).value).toBe("6");
    expect(
      (
        screen.getByRole("switch", {
          name: /sin peso · remo con barra/i,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/nota de la sesión/i) as HTMLTextAreaElement)
        .value,
    ).toBe("bien");
    expect(
      (
        screen.getByLabelText(
          /^distancia \(km\) · running$/i,
        ) as HTMLInputElement
      ).value,
    ).toBe("5");

    fireEvent.change(repsOf("press banca", 2), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("radio", { name: /4/ }));
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
    await waitFor(() => expect(api.puts.length).toBe(1));
    expect(api.posts.length).toBe(0);
    const body = api.puts[0] as {
      effort: number;
      note: string;
      sets: SetItem[];
      cardio: unknown[];
    };
    expect(body.effort).toBe(4);
    expect(body.note).toBe("bien");
    expect(body.sets.length).toBe(3); // mismo número de series que el registro
    expect(body.sets[1]).toMatchObject({ weightKg: 60, reps: 7, done: true });
    expect(body.sets[2]).toMatchObject({ weightKg: null, reps: 12 });
    expect(body.cardio.length).toBe(1);
    await screen.findByText("Registrado");
    expect(screen.getByText("60×7")).toBeDefined();
  });

  it("una serie registrada como hecha sin marcas se precarga sin marcar", async () => {
    const api = mockApi({
      sessions: LOGGED,
      log: loggedPayload([
        ...logged.sets.slice(0, 2),
        {
          planSessionExerciseId: SE_BENCH,
          setIndex: 2,
          weightKg: null,
          reps: null,
          done: true,
        },
      ]),
    });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(await screen.findByRole("button", { name: /^editar$/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    expect(boxOf("press banca", 3).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
    await waitFor(() => expect(api.puts.length).toBe(1));
    expect((api.puts[0] as { sets: SetItem[] }).sets[2].done).toBe(false);
  });

  it("Cancelar vuelve al registro sin llamar a la API", async () => {
    const api = mockApi({ sessions: LOGGED, log: logged });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(await screen.findByRole("button", { name: /^editar$/i }));
    const cancel = await screen.findByRole("button", { name: /^cancelar$/i });
    const before = api.fetchCount();
    fireEvent.click(cancel);
    await screen.findByText("Registrado");
    expect(api.fetchCount()).toBe(before);
    expect(api.puts.length).toBe(0);
  });
});

describe("añadir y quitar series", () => {
  const openBench = async () => {
    fireEvent.click(
      await screen.findByRole("button", { name: /series de press banca/i }),
    );
    return {
      add: screen.getByRole("button", {
        name: /añadir serie a press banca/i,
      }),
      remove: screen.getByRole("button", {
        name: /quitar serie a press banca/i,
      }) as HTMLButtonElement,
    };
  };

  it("las series van en una sola tira (no sueltan la línea del encabezado)", async () => {
    mockApi({});
    renderAt("/sesion/2026-09-02");
    await screen.findByRole("button", { name: /series de press banca/i });

    const first = boxOf("press banca", 1);
    const last = boxOf("press banca", 3);
    const strip = first.closest("[data-edge]");
    expect(strip).not.toBeNull();
    expect(last.closest("[data-edge]")).toBe(strip);
  });

  it("el ➕ se apaga al llegar a 20 series", async () => {
    mockApi({});
    renderAt("/sesion/2026-09-02");
    await openBench();
    const addNow = () =>
      screen.getByRole("button", {
        name: /añadir serie a press banca/i,
      }) as HTMLButtonElement;
    // 3 por defecto; el 18.º sobra si el tope no corta.
    for (let i = 0; i < 30 && !addNow().disabled; i++)
      fireEvent.click(addNow());

    expect(addNow().disabled).toBe(true);
    expect(screen.queryByLabelText(/press banca serie 21$/i)).toBeNull();
  });

  it("el ➕ copia las marcas de la última serie y el ➖ quita la última (suelo 1)", async () => {
    mockApi({ last: { 21: { weightKg: 57.5, reps: 8, date: "2026-08-30" } } });
    renderAt("/sesion/2026-09-02");
    const { add, remove } = await openBench();

    fireEvent.click(add);
    expect(weightOf("press banca", 4).value).toBe("57.5");
    expect(repsOf("press banca", 4).value).toBe("8");
    expect(boxOf("press banca", 4).checked).toBe(false);

    fireEvent.click(remove);
    fireEvent.click(remove);
    fireEvent.click(remove);
    expect(screen.queryByLabelText(/press banca serie 2$/i)).toBeNull();
    const last = screen.getByRole("button", {
      name: /quitar serie a press banca/i,
    }) as HTMLButtonElement;
    expect(last.disabled).toBe(true);
  });

  it("Guardar reescribe el plan con las series del borrador y después cierra la sesión", async () => {
    const api = mockApi({});
    renderAt("/sesion/2026-09-02");
    const { add } = await openBench();
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("radio", { name: /3/ }));
    fireEvent.click(await primaryClose());

    await waitFor(() => expect(api.posts.length).toBe(1));
    expect(api.planPuts).toEqual([
      {
        name: "Empuje A",
        items: [
          {
            exerciseId: 21,
            targetSets: 5,
            targetRepsMin: 6,
            targetRepsMax: 8,
            targetDistanceKm: null,
            targetDurationMin: null,
            restSecs: 90,
            restAfterSecs: 120,
          },
          {
            exerciseId: 22,
            targetSets: 3,
            targetRepsMin: null,
            targetRepsMax: null,
            targetDistanceKm: null,
            targetDurationMin: null,
            restSecs: null,
            restAfterSecs: null,
          },
          {
            exerciseId: 23,
            targetSets: null,
            targetRepsMin: null,
            targetRepsMax: null,
            targetDistanceKm: 5,
            targetDurationMin: 30,
            restSecs: null,
            restAfterSecs: 120,
          },
        ],
      },
    ]);
    expect(api.calls).toEqual([
      "PUT /api/plan-sessions/1",
      "POST /api/workout-logs/2026-09-02",
    ]);
  });

  it("corregir un registro reescribe el plan antes del PUT del registro", async () => {
    const api = mockApi({ sessions: LOGGED, log: logged });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(await screen.findByRole("button", { name: /^editar$/i }));
    const { remove } = await openBench();
    fireEvent.click(remove);
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => expect(api.puts.length).toBe(1));
    const planPut = api.planPuts[0] as {
      items: { exerciseId: number; targetSets: number }[];
    };
    expect(planPut.items[0]).toMatchObject({ exerciseId: 21, targetSets: 1 });
    expect(api.calls).toEqual([
      "PUT /api/plan-sessions/1",
      "PUT /api/workout-logs/2026-09-02",
    ]);
  });
});

describe("modo interactivo", () => {
  // El doble de Web Audio: registra keep-alive y pitidos sin sonar (jsdom no
  // trae AudioContext).
  const audio = createFakeAudio();

  beforeEach(() => {
    audio.reset();
    vi.stubGlobal("AudioContext", audio.Ctor);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Marcas de la última sesión: sin ellas las casillas nacen incompletas y no
  // se pueden marcar (como en el borrador normal).
  const benchLast = { weightKg: 60, reps: 8, date: "2026-08-30" };
  const rowLast = { weightKg: 40, reps: 10, date: "2026-08-30" };

  async function enterMode(
    opts: Parameters<typeof mockApi>[0] = {},
  ): Promise<HTMLElement> {
    mockApi(opts);
    renderAt("/sesion/2026-09-02");
    fireEvent.click(await screen.findByRole("button", { name: /^empezar$/i }));
    return await screen.findByRole("dialog", { name: /modo sesión/i });
  }

  /** El aspa pregunta antes de salir: aquí se confirma. */
  function exitMode(mode: HTMLElement) {
    fireEvent.click(
      within(mode).getByRole("button", { name: /salir del modo/i }),
    );
    const confirm = screen.getByRole("dialog", {
      name: /¿salir del modo sesión\?/i,
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Salir" }));
  }

  it("«Empezar» abre el modo con el primer ejercicio; el aspa pide confirmación", async () => {
    const mode = await enterMode();
    expect(
      within(mode).getByRole("heading", { name: "Press banca" }),
    ).toBeDefined();
    expect(within(mode).getByText("0 / 3")).toBeDefined();
    // El aro del encabezado cuenta ejercicios hechos: empieza en 0.
    expect(
      within(mode).getByRole("progressbar", {
        name: "0 de 3 ejercicios hechos",
      }),
    ).toBeDefined();

    // El aspa no sale a la primera: pregunta; «Cancelar» deja el modo abierto.
    fireEvent.click(
      within(mode).getByRole("button", { name: /salir del modo/i }),
    );
    const confirm = screen.getByRole("dialog", {
      name: /¿salir del modo sesión\?/i,
    });
    fireEvent.click(
      within(confirm).getByRole("button", { name: /^cancelar$/i }),
    );
    expect(screen.getByRole("dialog", { name: /modo sesión/i })).toBeDefined();

    // «Salir» sí: vuelve al borrador.
    exitMode(mode);
    expect(screen.queryByRole("dialog", { name: /modo sesión/i })).toBeNull();
    expect(screen.getByText("Esfuerzo percibido")).toBeDefined();
  });

  it("la cabecera del ejercicio va en una fila: «Sin peso» junto a las casillas", async () => {
    const mode = await enterMode({ last: { 21: benchLast } });
    // El recuento no se repite: las casillas ya dicen cuántas series hay (y
    // cada fila de la lista lleva su «Serie N»).
    expect(within(mode).queryByText("3 series")).toBeNull();
    // «Sin peso» y la tira de las casillas comparten contenedor, así que caen
    // en la misma fila.
    const noWeight = within(mode).getByRole("switch", { name: /sin peso/i });
    const strip = within(mode)
      .getByRole("checkbox", { name: "Press banca serie 1" })
      .closest("[data-edge]");
    expect(strip).not.toBeNull();
    expect(noWeight.closest("[data-edge]")).toBeNull();
    expect(noWeight.parentElement?.parentElement).toBe(strip?.parentElement);
  });

  it("en cardio el objetivo y «Hecho» van en la misma fila", async () => {
    const mode = await enterMode({ last: { 21: benchLast, 22: rowLast } });
    for (let i = 0; i < 2; i++)
      fireEvent.click(
        within(mode).getByRole("button", { name: /^siguiente$/i }),
      );
    const hecho = within(mode).getByRole("checkbox", {
      name: "Running hecho",
    });
    const objetivo = within(mode).getByText("5 km · 30 min");
    // El objetivo y el «Hecho» (con su casilla) cuelgan de la misma fila, y de
    // esa fila no cuelga nada más: en el encabezado no queda una línea por
    // cosa.
    const fila = objetivo.parentElement;
    expect(fila?.contains(hecho)).toBe(true);
    expect(fila?.children).toHaveLength(2);
  });

  it("marcar una serie intermedia arranca la pausa entre series; al agotarse pita", async () => {
    const mode = await enterMode({ last: { 21: benchLast } });
    fireEvent.click(
      within(mode).getByRole("checkbox", { name: "Press banca serie 1" }),
    );
    expect(
      within(mode).getByRole("progressbar", {
        name: /pausa entre series de press banca/i,
      }),
    ).toBeDefined();
    expect(within(mode).getByText("1:30")).toBeDefined();
    // Keep-alive: la pestaña «suena» mientras corre la pausa.
    expect(
      audio.oscillators.some(
        (o) => o.frequency.value === 60 && o.started && !o.stopped,
      ),
    ).toBe(true);

    // El reloj salta más allá del final: el siguiente tic cierra la pausa.
    const real = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(real() + 5 * 60_000);
    await waitFor(() =>
      expect(
        within(mode).queryByRole("progressbar", {
          name: /pausa entre series/i,
        }),
      ).toBeNull(),
    );
    expect(audio.oscillators.some((o) => o.frequency.value === 880)).toBe(true);
    expect(within(mode).getByText("0 / 3")).toBeDefined();
  });

  it("la última serie arranca la pausa al terminar y deja activo el siguiente", async () => {
    const mode = await enterMode({ last: { 21: benchLast } });
    fireEvent.click(
      within(mode).getByRole("checkbox", { name: "Press banca serie 3" }),
    );
    expect(
      within(mode).getByRole("progressbar", {
        name: /pausa al terminar press banca/i,
      }),
    ).toBeDefined();
    expect(within(mode).getByText("2:00")).toBeDefined();
    const real = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(real() + 5 * 60_000);
    await waitFor(() =>
      expect(
        within(mode).getByRole("heading", { name: "Remo con barra" }),
      ).toBeDefined(),
    );
  });

  it("sin descansos programados no arranca pausa ni suena", async () => {
    const mode = await enterMode({ last: { 21: benchLast, 22: rowLast } });
    fireEvent.click(within(mode).getByRole("button", { name: /^siguiente$/i }));
    expect(
      within(mode).getByRole("heading", { name: "Remo con barra" }),
    ).toBeDefined();
    const before = audio.oscillators.length;
    fireEvent.click(
      within(mode).getByRole("checkbox", { name: "Remo con barra serie 1" }),
    );
    expect(
      within(mode).queryByRole("progressbar", { name: /pausa/i }),
    ).toBeNull();
    expect(within(mode).getByText("Sin descansos programados")).toBeDefined();
    expect(audio.oscillators.length).toBe(before);
  });

  it("«Descanso» la arranca a mano y «Saltar» la corta sin pitido", async () => {
    const mode = await enterMode();
    fireEvent.click(within(mode).getByRole("button", { name: /^descanso$/i }));
    expect(
      within(mode).getByRole("progressbar", {
        name: /pausa entre series de press banca/i,
      }),
    ).toBeDefined();
    expect(within(mode).getByText("1:30")).toBeDefined();
    fireEvent.click(within(mode).getByRole("button", { name: /^saltar$/i }));
    expect(
      within(mode).queryByRole("progressbar", { name: /pausa/i }),
    ).toBeNull();
    expect(audio.oscillators.some((o) => o.frequency.value === 880)).toBe(
      false,
    );
    expect(
      audio.oscillators.some((o) => o.frequency.value === 60 && o.stopped),
    ).toBe(true);
  });

  it("al volver a la pestaña la pausa se resincroniza: terminada y con pitido", async () => {
    const mode = await enterMode({ last: { 21: benchLast } });
    fireEvent.click(
      within(mode).getByRole("checkbox", { name: "Press banca serie 1" }),
    );
    expect(
      within(mode).getByRole("progressbar", {
        name: /pausa entre series de press banca/i,
      }),
    ).toBeDefined();

    const real = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(real() + 5 * 60_000);
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    fireEvent(document, new Event("visibilitychange"));
    expect(
      within(mode).getByRole("progressbar", { name: /pausa/i }), // oculta: nada cambia
    ).toBeDefined();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    fireEvent(document, new Event("visibilitychange"));
    expect(
      within(mode).queryByRole("progressbar", { name: /pausa/i }),
    ).toBeNull();
    expect(audio.oscillators.some((o) => o.frequency.value === 880)).toBe(true);
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("pide la Wake Lock al entrar y la suelta al salir", async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ release }));
    Object.defineProperty(navigator, "wakeLock", {
      value: { request },
      configurable: true,
    });
    const mode = await enterMode();
    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
    exitMode(mode);
    await waitFor(() => expect(release).toHaveBeenCalled());
    Reflect.deleteProperty(navigator, "wakeLock");
  });

  it("dentro del modo se registran las marcas de las series y la pausa arranca al completarlas", async () => {
    const mode = await enterMode();
    // Sin histórico, la serie nace incompleta y la casilla no se puede marcar.
    expect(
      within(mode).getByRole("checkbox", { name: "Press banca serie 1" }),
    ).toHaveProperty("disabled", true);
    const reps = within(mode).getByLabelText(/^reps · press banca serie 1$/i);
    fireEvent.change(reps, { target: { value: "8" } });
    fireEvent.change(
      within(mode).getByLabelText(/^peso \(kg\) · press banca serie 1$/i),
      { target: { value: "60" } },
    );
    // Completarla la marca sola y arranca la pausa entre series (90 s).
    expect(
      within(mode).getByRole("checkbox", { name: "Press banca serie 1" }),
    ).toHaveProperty("checked", true);
    expect(
      within(mode).getByRole("progressbar", {
        name: /pausa entre series de press banca/i,
      }),
    ).toBeDefined();

    // Las marcas van al borrador subyacente: al salir, la serie queda hecha.
    exitMode(mode);
    expect(boxOf("press banca", 1)).toHaveProperty("checked", true);
  });

  it("completar la sesión muestra el esfuerzo; la última marca no arranca cuenta atrás", async () => {
    const api = mockApi({ last: { 21: benchLast, 22: rowLast } });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(await screen.findByRole("button", { name: /^empezar$/i }));
    const mode = await screen.findByRole("dialog", { name: /modo sesión/i });
    // Mientras queda faena, el esfuerzo no aparece.
    expect(
      within(mode).queryByRole("radiogroup", { name: /esfuerzo percibido/i }),
    ).toBeNull();
    for (const n of [1, 2, 3])
      fireEvent.click(
        within(mode).getByRole("checkbox", { name: `Press banca serie ${n}` }),
      );
    // La pausa de fin de ejercicio se salta para pasar al siguiente.
    fireEvent.click(within(mode).getByRole("button", { name: /^saltar$/i }));
    for (const n of [1, 2, 3])
      fireEvent.click(
        within(mode).getByRole("checkbox", {
          name: `Remo con barra serie ${n}`,
        }),
      );
    expect(within(mode).getByText("2 / 3")).toBeDefined();
    // El cardio cierra la sesión: marcarlo no arranca cuenta atrás.
    fireEvent.click(
      within(mode).getByRole("checkbox", { name: "Running hecho" }),
    );
    expect(
      within(mode).queryByRole("progressbar", { name: /pausa/i }),
    ).toBeNull();
    expect(within(mode).getByText("3 / 3")).toBeDefined();
    // Sesión completa: aparece el esfuerzo; sin él, «Terminar» no cierra.
    expect(
      within(mode).getByRole("radiogroup", { name: /esfuerzo percibido/i }),
    ).toBeDefined();
    const terminar = within(mode).getByRole("button", {
      name: /^terminar$/i,
    });
    // Sin esfuerzo no se cierra, igual que «Guardar» en el borrador.
    expect(terminar).toHaveProperty("disabled", true);
    fireEvent.click(within(mode).getByRole("radio", { name: /^esfuerzo 3:/i }));
    fireEvent.click(terminar);
    await waitFor(() => expect(api.posts).toHaveLength(1));
    expect(api.posts[0]).toMatchObject({ effort: 3 });
    expect(screen.queryByRole("dialog", { name: /modo sesión/i })).toBeNull();
    // Ya en el registro (solo lectura): está el «Editar» de la vista logged.
    await screen.findByRole("button", { name: /^editar$/i });
  });

  it("terminar el último ejercicio corta la pausa que corría y no arranca cuenta atrás", async () => {
    // Sesión con el cardio en medio y Remo (fuerza) al final, con descansos.
    const strengthLast = {
      ...SESSION_DETAIL,
      exercises: [
        { ...SESSION_DETAIL.exercises[0], position: 0 },
        { ...SESSION_DETAIL.exercises[2], position: 1 },
        {
          ...SESSION_DETAIL.exercises[1],
          position: 2,
          restSecs: 90,
          restAfterSecs: 120,
        },
      ],
    };
    const mode = await enterMode({
      detail: strengthLast,
      last: { 21: benchLast, 22: rowLast },
    });
    // Press banca completa: la pausa de fin se salta para seguir.
    for (const n of [1, 2, 3])
      fireEvent.click(
        within(mode).getByRole("checkbox", { name: `Press banca serie ${n}` }),
      );
    fireEvent.click(within(mode).getByRole("button", { name: /^saltar$/i }));
    // El cardio del medio: se marca y su pausa también se salta.
    fireEvent.click(
      within(mode).getByRole("checkbox", { name: "Running hecho" }),
    );
    fireEvent.click(within(mode).getByRole("button", { name: /^saltar$/i }));
    // En Remo (el último), marcar una serie corre su pausa…
    fireEvent.click(
      within(mode).getByRole("checkbox", { name: "Remo con barra serie 1" }),
    );
    expect(
      within(mode).getByRole("progressbar", {
        name: /pausa entre series de remo con barra/i,
      }),
    ).toBeDefined();
    // …y al terminarlo se corta sin pitido: ya no hay nada que descansar.
    for (const n of [2, 3])
      fireEvent.click(
        within(mode).getByRole("checkbox", {
          name: `Remo con barra serie ${n}`,
        }),
      );
    expect(
      within(mode).queryByRole("progressbar", { name: /pausa/i }),
    ).toBeNull();
    expect(audio.oscillators.some((o) => o.frequency.value === 880)).toBe(
      false,
    );
    expect(
      audio.oscillators.some((o) => o.frequency.value === 60 && o.stopped),
    ).toBe(true);
    expect(within(mode).getByText("3 / 3")).toBeDefined();
    expect(
      within(mode).getByRole("radiogroup", { name: /esfuerzo percibido/i }),
    ).toBeDefined();
  });

  it("el encabezado lleva el ejercicio activo y su lista salta al elegido", async () => {
    const mode = await enterMode({ last: { 21: benchLast, 22: rowLast } });
    // El botón del encabezado dice el ejercicio activo y abre la lista.
    const opener = (name: string) => within(mode).getByRole("button", { name });
    const list = () => screen.getByRole("dialog", { name: /^ejercicios$/i });
    // Cada fila añade su estado al nombre: «, pendiente» o «, hecho».
    const row = (name: string, done = false) =>
      within(list()).getByRole("button", {
        name: `${name}, ${done ? "hecho" : "pendiente"}`,
      });

    fireEvent.click(opener("Press banca"));
    expect(row("Press banca")).toBeDefined();
    expect(row("Remo con barra")).toBeDefined();
    expect(row("Running")).toBeDefined();

    // Pulsar una fila cierra la lista y deja ese ejercicio activo.
    fireEvent.click(row("Remo con barra"));
    expect(screen.queryByRole("dialog", { name: /^ejercicios$/i })).toBeNull();
    expect(opener("Remo con barra")).toBeDefined();
    expect(
      within(mode).getByRole("checkbox", { name: "Remo con barra serie 1" }),
    ).toBeDefined();

    // Volver a Press banca por la lista y arrancar su pausa entre series.
    fireEvent.click(opener("Remo con barra"));
    fireEvent.click(row("Press banca"));
    fireEvent.click(
      within(mode).getByRole("checkbox", { name: "Press banca serie 1" }),
    );
    const pause = () =>
      within(mode).getByRole("progressbar", {
        name: /pausa entre series de press banca/i,
      });
    expect(pause()).toBeDefined();
    expect(within(mode).getByText("1:30")).toBeDefined();

    // Con la pausa corriendo, el salto no la toca: sigue siendo la misma (su
    // nombre no pasa a ser el del ejercicio nuevo) y al agotarse pita.
    fireEvent.click(opener("Press banca"));
    fireEvent.click(row("Remo con barra"));
    expect(screen.queryByRole("dialog", { name: /^ejercicios$/i })).toBeNull();
    expect(opener("Remo con barra")).toBeDefined();
    expect(pause()).toBeDefined();

    const real = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(real() + 5 * 60_000);
    await waitFor(() =>
      expect(
        within(mode).queryByRole("progressbar", { name: /pausa/i }),
      ).toBeNull(),
    );
    expect(audio.oscillators.some((o) => o.frequency.value === 880)).toBe(true);
    // Era «entre series»: al acabar no cambia de ejercicio.
    expect(opener("Remo con barra")).toBeDefined();
  });
});

// Press banca encadenado con Remo con barra: los descansos los lleva Remo.
const BLOCK_DETAIL = {
  ...SESSION_DETAIL,
  name: "Superserie de empuje",
  exercises: [
    {
      ...SESSION_DETAIL.exercises[0],
      superset: true,
      restSecs: null,
      restAfterSecs: null,
    },
    {
      ...SESSION_DETAIL.exercises[1],
      superset: false,
      restSecs: 90,
      restAfterSecs: 120,
    },
    SESSION_DETAIL.exercises[2],
  ],
};

describe("bloques (superseries) en el modo sesión", () => {
  async function enterBlockMode(): Promise<HTMLElement> {
    mockApi({
      last: {
        21: { weightKg: 60, reps: 8, date: "2026-08-30" },
        22: { weightKg: 40, reps: 10, date: "2026-08-30" },
      },
      detail: BLOCK_DETAIL,
    });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(await screen.findByRole("button", { name: /^empezar$/i }));
    return await screen.findByRole("dialog", { name: /modo sesión/i });
  }

  it("el encabezado nombra la superserie y el primer miembro avisa de su pareja", async () => {
    const mode = await enterBlockMode();
    expect(within(mode).getByText(/superserie/i)).toBeDefined();
    expect(
      within(mode).getByText(/encadenado con «Remo con barra»/i),
    ).toBeDefined();
  });

  it("a mitad de vuelta salta al segundo miembro sin pausa", async () => {
    const mode = await enterBlockMode();
    fireEvent.click(
      within(mode).getByRole("checkbox", { name: "Press banca serie 1" }),
    );
    expect(
      within(mode).getByRole("heading", { name: "Remo con barra" }),
    ).toBeDefined();
    expect(
      within(mode).queryByRole("progressbar", { name: /pausa/i }),
    ).toBeNull();
  });

  it("cerrar la vuelta arranca el descanso y vuelve al primer miembro", async () => {
    const mode = await enterBlockMode();
    fireEvent.click(within(mode).getByRole("button", { name: /^siguiente$/i }));
    fireEvent.click(
      within(mode).getByRole("checkbox", { name: "Remo con barra serie 1" }),
    );
    expect(
      within(mode).getByRole("progressbar", {
        name: /pausa entre series de remo con barra/i,
      }),
    ).toBeDefined();

    const real = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(real() + 5 * 60_000);
    await waitFor(() =>
      expect(
        within(mode).getByRole("heading", { name: "Press banca" }),
      ).toBeDefined(),
    );
  });

  it("el listado del modo sesión enseña el bloque dentro de su caja", async () => {
    const mode = await enterBlockMode();
    fireEvent.click(
      within(mode).getByRole("button", { name: /^press banca$/i }),
    );
    const listing = await screen.findByRole("dialog", {
      name: /^ejercicios$/i,
    });
    const box = within(listing).getByRole("list", { name: "Superserie" });
    expect(within(box).getAllByRole("listitem")).toHaveLength(2);
    expect(within(box).getByText("Press banca")).toBeDefined();
    expect(within(box).queryByText("Running")).toBeNull();
    expect(
      within(listing).getByRole("button", { name: /^Running/ }),
    ).toBeDefined();
  });
});

describe("bloques (superseries) en la página del día", () => {
  it("el borrador agrupa el bloque en su caja y deja fuera lo suelto", async () => {
    mockApi({ detail: BLOCK_DETAIL });
    renderAt("/sesion/2026-09-02");
    const box = await screen.findByRole("list", { name: "Superserie" });
    expect(within(box).getAllByRole("listitem")).toHaveLength(2);
    expect(within(box).getByText("Press banca")).toBeDefined();
    expect(within(box).getByText("Remo con barra")).toBeDefined();
    expect(within(box).queryByText("Running")).toBeNull();
    expect(screen.getByText("Running")).toBeDefined();
  });

  it("el registro también: la cadena la trae el plan del día", async () => {
    mockApi({
      sessions: [
        {
          id: 1,
          date: "2026-09-02",
          name: "Empuje A",
          status: "logged",
          exercises: BLOCK_DETAIL.exercises,
        },
      ],
      log: loggedPayload([
        {
          planSessionExerciseId: SE_BENCH,
          setIndex: 0,
          weightKg: 60,
          reps: 8,
          done: true,
        },
        {
          planSessionExerciseId: SE_ROW,
          setIndex: 0,
          weightKg: 40,
          reps: 10,
          done: true,
        },
      ]),
    });
    renderAt("/sesion/2026-09-02");
    const box = await screen.findByRole("list", { name: "Superserie" });
    // Los miembros de la caja son las dos tarjetas (sus series son listas
    // propias dentro de cada una).
    expect(box.children).toHaveLength(2);
    expect(within(box).getByText("Press banca")).toBeDefined();
    expect(within(box).getByText("Remo con barra")).toBeDefined();
  });
});

describe("ejercicio por tiempo (metric: time)", () => {
  const CORE = {
    id: 1,
    date: "2026-09-02",
    name: "Core",
    status: "planned",
    exercises: [
      {
        id: 31,
        exerciseId: 41,
        exerciseName: "Plancha",
        kind: "strength",
        metric: "time",
        position: 0,
        targetSets: 2,
        targetRepsMin: null,
        targetRepsMax: null,
        targetDistanceKm: null,
        targetDurationMin: null,
        restSecs: null,
        restAfterSecs: null,
      },
    ],
  };

  it("pide segundos (ni kilos ni reps) y los manda al cerrar la sesión", async () => {
    const api = mockApi({
      detail: CORE,
      sessions: [
        { id: 1, date: "2026-09-02", name: "Core", status: "planned" },
      ],
    });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de plancha/i }),
    );

    expect((await screen.findAllByText("Segundos")).length).toBe(2);
    expect(screen.queryAllByText("Peso (kg)")).toHaveLength(0);
    expect(screen.queryAllByText("Reps")).toHaveLength(0);
    // Sin kg no hay conmutador «Sin peso».
    expect(screen.queryByRole("switch")).toBeNull();

    // Escribir los segundos de la primera serie la marca sola.
    fireEvent.change(screen.getByLabelText(/^segundos · plancha serie 1$/i), {
      target: { value: "45" },
    });
    const first = screen.getByRole("checkbox", { name: "Plancha serie 1" });
    await waitFor(() => expect((first as HTMLInputElement).checked).toBe(true));

    fireEvent.click(screen.getByRole("radio", { name: /3/ }));
    fireEvent.click(await primaryClose());
    await waitFor(() => expect(api.posts.length).toBe(1));
    const body = api.posts[0] as { sets: SetItem[] };
    expect(body.sets[0]).toEqual({
      planSessionExerciseId: 31,
      setIndex: 0,
      weightKg: null,
      reps: null,
      durationSecs: 45,
      done: true,
    });
  });

  it("la sesión anterior por tiempo rellena los segundos homólogos", async () => {
    mockApi({
      detail: CORE,
      sessions: [
        { id: 1, date: "2026-09-02", name: "Core", status: "planned" },
        { id: 9, date: "2026-08-26", name: "Core", status: "logged" },
      ],
      logs: {
        "2026-08-26": {
          date: "2026-08-26",
          status: "logged",
          readOnly: true,
          effort: 3,
          note: null,
          session: { id: 9, name: "Core" },
          sets: [
            {
              planSessionExerciseId: 99,
              setIndex: 0,
              weightKg: null,
              reps: null,
              durationSecs: 60,
              done: true,
              exerciseId: 41,
              exerciseName: "Plancha",
            },
          ],
          cardio: [],
        },
      },
    });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(
      await screen.findByRole("button", { name: /series de plancha/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: /copiar 60 s de la sesión anterior a plancha serie 1/i,
      }),
    );
    expect(
      (
        screen.getByLabelText(
          /^segundos · plancha serie 1$/i,
        ) as HTMLInputElement
      ).value,
    ).toBe("60");
  });
});
