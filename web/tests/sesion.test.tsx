// E6 tasks 3.x + 4.1: /sesion/:date screen (state A editable, state B read-only).
// jsdom + mocked fetch: the fake router below serves the exact shapes the real
// API emits (camelCase after the E6 wire normalization).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

type SetItem = {
  templateExerciseId: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  done: boolean;
};

const TE_BENCH = 11; // template_exercise id for "Press banca"
const TE_ROW = 12; // template_exercise id for "Remo con barra"

const TEMPLATE = {
  id: 5,
  name: "Empuje A",
  rotation_index: 0,
  exercises: [
    {
      id: TE_BENCH,
      exerciseId: 21,
      exerciseName: "Press banca",
      position: 0,
      target_sets: 3,
      target_reps_min: 6,
      target_reps_max: 8,
    },
    {
      id: TE_ROW,
      exerciseId: 22,
      exerciseName: "Remo con barra",
      position: 1,
      target_sets: null,
      target_reps_min: null,
      target_reps_max: null,
    },
  ],
};

function loggedPayload(sets: SetItem[], effort = 2, note: string | null = null) {
  return {
    date: "2026-09-02",
    status: "logged",
    readOnly: true,
    effort,
    note,
    template: { id: 5, name: "Empuje A" },
    sets: sets.map((s) => ({ ...s, exerciseName: s.templateExerciseId === TE_BENCH ? "Press banca" : "Remo con barra" })),
  };
}

type Mock = {
  posts: unknown[];
  fetchCount: () => number;
};

function mockApi(opts: {
  sessions?: { id: number; date: string; status: string; templateId: number; templateName: string }[];
  last?: Record<number, { weightKg: number; reps: number; date: string } | null>;
  log?: unknown; // GET /api/workout-logs response when logged
  lastFails?: boolean;
  postReply?: { status: number; body: unknown };
}): Mock {
  let count = 0;
  const posts: unknown[] = [];
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      // E7 guard probe: answer without counting it as app traffic.
      if (String(url).includes("/api/auth/status")) return reply(200, { authenticated: true });
      count += 1;
      if (init?.method === "POST") {
        posts.push(JSON.parse(init.body ?? "null"));
        const r = opts.postReply ?? {
          status: 201,
          body: loggedPayload((JSON.parse(init.body ?? "{}").sets ?? []) as SetItem[], JSON.parse(init.body ?? "{}").effort),
        };
        return reply(r.status, r.body);
      }
      if (url === "/api/plan-sessions")
        return reply(200, opts.sessions ?? [{ id: 1, date: "2026-09-02", status: "planned", templateId: 5, templateName: "Empuje A" }]);
      const tpl = /^\/api\/templates\/(\d+)$/.exec(url);
      if (tpl) return reply(200, TEMPLATE);
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
      return el.className?.includes("btn-primary") && /cerrar sesión/i.test(el.textContent ?? "");
    });
    if (!candidate) throw new Error("primary close button not found");
    return candidate as HTMLButtonElement;
  });
}
function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const PLANNED = [{ id: 1, date: "2026-09-02", status: "planned", templateId: 5, templateName: "Empuje A" }];
const LOGGED = [{ id: 1, date: "2026-09-02", status: "logged", templateId: 5, templateName: "Empuje A" }];

describe("route states", () => {
  it("header shows Spanish date + template name", async () => {
    mockApi({});
    renderAt("/sesion/2026-09-02");
    await screen.findByText("Empuje A");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/miércoles, 2 de septiembre/);
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
  it("exercise rows in template order with per-set checkboxes (null → 3)", async () => {
    mockApi({ last: { 21: { weightKg: 57.5, reps: 8, date: "2026-08-30" } } });
    renderAt("/sesion/2026-09-02");
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes.length).toBe(6); // 3 + 3
    const rows = screen.getAllByRole("link", { name: /press banca|remo con barra/i });
    expect(rows.map((r) => r.textContent)).toEqual(["Press banca", "Remo con barra"]);
    expect(rows[0].getAttribute("href")).toBe("/ejercicio/21");
  });

  it("expanding shows steppers; increment is draft-only (no fetch)", async () => {
    const api = mockApi({ last: { 21: { weightKg: 57.5, reps: 8, date: "2026-08-30" } } });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(await screen.findByRole("button", { name: /series de press banca/i }));
    const weight = await screen.findByLabelText(/^press banca serie 1 \(kg\)$/i);
    const before = api.fetchCount();
    fireEvent.click(screen.getByRole("button", { name: /aumentar press banca serie 1 \(kg\)/i }));
    expect((weight as HTMLInputElement).value).toBe("60"); // 57.5 → 60 (2.5kg steps)
    expect(api.fetchCount()).toBe(before);
  });

  it("prefill: última helper + starting values; never-logged exercise has no helper", async () => {
    mockApi({ last: { 21: { weightKg: 57.5, reps: 8, date: "2026-08-30" } } });
    renderAt("/sesion/2026-09-02");
    fireEvent.click(await screen.findByRole("button", { name: /series de press banca/i }));
    await screen.findByText("última: 57.5×8");
    expect((screen.getByLabelText(/^press banca serie 1 \(kg\)$/i) as HTMLInputElement).value).toBe("57.5");
    expect((screen.getByLabelText(/^press banca serie 1 \(reps\)$/i) as HTMLInputElement).value).toBe("8");
    fireEvent.click(screen.getByRole("button", { name: /series de remo con barra/i }));
    await screen.findByLabelText(/^remo con barra serie 1 \(kg\)$/i);
    expect(screen.queryAllByText(/última/).length).toBe(1);
  });

  it("last-endpoint failure is non-blocking: warning + manual logging still possible", async () => {
    mockApi({ lastFails: true });
    renderAt("/sesion/2026-09-02");
    await screen.findByText(/no se pudo cargar el histórico/i);
    fireEvent.click(screen.getByRole("button", { name: /series de press banca/i }));
    expect(await screen.findByLabelText(/^press banca serie 1 \(kg\)$/i)).toBeDefined();
    expect(screen.queryAllByText(/última/).length).toBe(0);
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
    const body = api.posts[0] as { effort: number; note?: string | null; sets: SetItem[] };
    expect(body.effort).toBe(4);
    expect(body.note ?? null).toBeNull(); // blank note never sent as ""
    expect(body.sets.length).toBe(6);
    expect(body.sets[0]).toEqual({ templateExerciseId: TE_BENCH, setIndex: 0, weightKg: null, reps: null, done: false });
    expect(body.sets[0]).not.toHaveProperty("set_index");
    expect(body.sets[0]).not.toHaveProperty("weight_kg");
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
    mockApi({ postReply: { status: 400, body: { error: "Required", field: "sets.0.setIndex" } } });
    renderAt("/sesion/2026-09-02");
    const close = (await primaryClose()) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("radio", { name: /3/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /press banca serie 1/i }));
    await waitFor(() => expect(close.disabled).toBe(false));
    fireEvent.click(close);
    await screen.findByText(/sets\.0\.setIndex/);
    // draft preserved: checkbox still checked, still interactive
    expect((screen.getByRole("checkbox", { name: /press banca serie 1/i }) as HTMLInputElement).checked).toBe(true);
  });

  it("409 → reload into read-only state B with persisted data", async () => {
    mockApi({
      postReply: { status: 409, body: { error: "This day is already logged and read-only" } },
      log: loggedPayload([{ templateExerciseId: TE_BENCH, setIndex: 0, weightKg: 60, reps: 8, done: true }], 2, "fuerte"),
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
  it("renders from GET workout-logs: text values, —, filled dots, note, no inputs", async () => {
    mockApi({
      sessions: LOGGED,
      log: loggedPayload(
        [
          { templateExerciseId: TE_BENCH, setIndex: 0, weightKg: 60, reps: 8, done: true },
          { templateExerciseId: TE_BENCH, setIndex: 1, weightKg: null, reps: null, done: false },
        ],
        2,
        "sesión floja",
      ),
    });
    const { container } = renderAt("/sesion/2026-09-02");
    await screen.findByText("Registrado");
    expect(screen.getByText(/60×8/)).toBeDefined();
    expect(screen.getByText("sesión floja")).toBeDefined();
    expect(screen.getByText(/—/)).toBeDefined();
    expect(container.querySelectorAll("input, textarea, select").length).toBe(0);
    // No primary (workout) close button in read-only state; the shell logout
    // (desktop, text-secondary) is unrelated.
    const closeBtns = [...document.querySelectorAll("button")].filter(
      (x) => (x as HTMLButtonElement).className?.includes("btn-primary") && /cerrar sesión/i.test(x.textContent ?? ""),
    );
    expect(closeBtns).toHaveLength(0);
    // effort 2 of 5 filled
    const dots = screen.getAllByTestId("effort-dot");
    expect(dots.filter((d) => d.getAttribute("data-filled") === "true").length).toBe(2);
  });
});
