// /sesion/:date — estado A (borrador editable sobre la sesión del día: fuerza
// con series/peso/reps y cardio con distancia/tiempo opcionales) y estado B
// (solo lectura desde GET /api/workout-logs/:date).

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
      position: 0,
      targetSets: 3,
      targetRepsMin: 6,
      targetRepsMax: 8,
      targetDistanceKm: null,
      targetDurationMin: null,
    },
    {
      id: SE_ROW,
      exerciseId: 22,
      exerciseName: "Remo con barra",
      kind: "strength",
      position: 1,
      targetSets: null,
      targetRepsMin: null,
      targetRepsMax: null,
      targetDistanceKm: null,
      targetDurationMin: null,
    },
    {
      id: SE_RUN,
      exerciseId: 23,
      exerciseName: "Running",
      kind: "running",
      position: 2,
      targetSets: null,
      targetRepsMin: null,
      targetRepsMax: null,
      targetDistanceKm: 5,
      targetDurationMin: 30,
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
      exerciseName:
        s.planSessionExerciseId === SE_BENCH ? "Press banca" : "Remo con barra",
    })),
    cardio: cardio.map((c) => ({ ...c, exerciseName: "Running" })),
  };
}

type Mock = {
  posts: unknown[];
  fetchCount: () => number;
};

function mockApi(opts: {
  sessions?: {
    id: number;
    date: string;
    name: string | null;
    status: string;
  }[];
  last?: Record<
    number,
    { weightKg: number; reps: number; date: string } | null
  >;
  log?: unknown; // GET /api/workout-logs response when logged
  lastFails?: boolean;
  postReply?: { status: number; body: unknown };
}): Mock {
  let count = 0;
  const posts: unknown[] = [];
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      // E7 guard probe: answer without counting it as app traffic.
      if (String(url).includes("/api/auth/status"))
        return reply(200, { authenticated: true });
      count += 1;
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
        return reply(200, SESSION_DETAIL);
      const last = /^\/api\/exercises\/(\d+)\/last$/.exec(url);
      if (last) {
        if (opts.lastFails) return reply(500, { error: "boom" });
        const id = Number(last[1]);
        return reply(200, { exerciseId: id, last: opts.last?.[id] ?? null });
      }
      if (url === "/api/workout-logs/2026-09-02") return reply(200, opts.log);
      return reply(404, { error: "Not found" });
    }),
  );
  return { posts, fetchCount: () => count };
}

function primaryClose(): Promise<HTMLButtonElement> {
  return waitFor(() => {
    const candidate = [...document.querySelectorAll("button")].find((x) => {
      const el = x as HTMLButtonElement;
      return (
        el.className?.includes("btn-primary") &&
        /cerrar sesión/i.test(el.textContent ?? "")
      );
    });
    if (!candidate) throw new Error("primary close button not found");
    return candidate as HTMLButtonElement;
  });
}
function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const LOGGED = [
  { id: 1, date: "2026-09-02", name: "Empuje A", status: "logged" },
];

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
      /^press banca serie 1 \(kg\)$/i,
    );
    const before = api.fetchCount();
    fireEvent.click(
      screen.getByRole("button", {
        name: /aumentar press banca serie 1 \(kg\)/i,
      }),
    );
    expect((weight as HTMLInputElement).value).toBe("60"); // 57.5 → 60 (2.5kg steps)
    expect(api.fetchCount()).toBe(before);
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
          /^press banca serie 1 \(kg\)$/i,
        ) as HTMLInputElement
      ).value,
    ).toBe("57.5");
    expect(
      (
        screen.getByLabelText(
          /^press banca serie 1 \(reps\)$/i,
        ) as HTMLInputElement
      ).value,
    ).toBe("8");
    fireEvent.click(
      screen.getByRole("button", { name: /series de remo con barra/i }),
    );
    await screen.findByLabelText(/^remo con barra serie 1 \(kg\)$/i);
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
      await screen.findByLabelText(/^press banca serie 1 \(kg\)$/i),
    ).toBeDefined();
    expect(screen.queryAllByText(/última/).length).toBe(0);
  });

  it("cardio: marcas opcionales; escribir distancia implica hecho", async () => {
    const api = mockApi({});
    renderAt("/sesion/2026-09-02");
    const distance = await screen.findByLabelText(
      /^running distancia \(km\)$/i,
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
    // No primary (workout) close button in read-only state; the shell logout
    // (desktop, text-secondary) is unrelated.
    const closeBtns = [...document.querySelectorAll("button")].filter(
      (x) =>
        (x as HTMLButtonElement).className?.includes("btn-primary") &&
        /cerrar sesión/i.test(x.textContent ?? ""),
    );
    expect(closeBtns).toHaveLength(0);
    // effort 2 of 5 filled
    const dots = screen.getAllByTestId("effort-dot");
    expect(
      dots.filter((d) => d.getAttribute("data-filled") === "true").length,
    ).toBe(2);
  });
});
