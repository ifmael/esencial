// /historial — índice de días registrados: lista del más nuevo al más viejo
// agrupada por mes, resumen de lo hecho, enlace al día registrado y paginación
// por cursor («Cargar más»).

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { type HistoryDay, useWorkoutHistory } from "../src/lib/history";

const day = (over: Partial<HistoryDay> = {}): HistoryDay => ({
  date: "2026-09-03",
  sessionName: "Empuje A",
  effort: 4,
  note: null,
  exercises: 2,
  sets: 6,
  cardio: 1,
  ...over,
});

type Page = { days: HistoryDay[]; next: string | null };

/** Stub de fetch: la sonda de sesión del guard + el índice por cursor. */
function stubHistory(pages: Record<string, Page> | (() => Response)) {
  const mock = vi.fn(async (url: string) => {
    const path = String(url);
    if (path.includes("/api/auth/status"))
      return Response.json({ authenticated: true });
    if (typeof pages === "function") return pages();
    return Response.json(pages[path] ?? { days: [], next: null });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useWorkoutHistory (hook)", () => {
  /** Promesa que resuelve a mano: para dejar una petición en vuelo. */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  const page = (dates: string[], next: string | null) => ({
    days: dates.map((date) => day({ date, sessionName: `Sesión ${date}` })),
    next,
  });

  it("pide `limit` primero y pagina con `before`", async () => {
    const urls: string[] = [];
    const second = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        if (String(url).includes("before=")) return second.promise;
        return Response.json(page(["2026-09-03"], "2026-09-03"));
      }),
    );

    const { result } = renderHook(() => useWorkoutHistory());
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(urls).toEqual(["/api/workout-logs?limit=20"]);

    act(() => result.current.loadMore());
    expect(urls[1]).toBe("/api/workout-logs?limit=20&before=2026-09-03");

    await act(async () => {
      second.resolve(Response.json(page(["2026-08-30"], null)));
      await second.promise;
    });
    expect(result.current.items.map((d) => d.date)).toEqual([
      "2026-09-03",
      "2026-08-30",
    ]);
    expect(result.current.next).toBeNull();
  });

  it("una página que llega después de recargar se descarta (no pisa la lista)", async () => {
    const slow = deferred<Response>();
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        urls.push(path);
        // El «Ver más» se queda en vuelo; la recarga responde al momento.
        if (path.includes("before=")) return slow.promise;
        return Response.json(
          path.includes("limit=20") && urls.length > 1
            ? page(["2026-09-03"], null)
            : page(["2026-09-03"], "2026-09-03"),
        );
      }),
    );

    const { result } = renderHook(() => useWorkoutHistory());
    await waitFor(() => expect(result.current.pending).toBe(false));

    act(() => result.current.loadMore());
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.next).toBeNull();

    // La página vieja llega tarde: ni se añade ni resucita su cursor.
    await act(async () => {
      slow.resolve(Response.json(page(["2026-08-30"], "2026-08-30")));
      await slow.promise;
    });
    expect(result.current.items.map((d) => d.date)).toEqual(["2026-09-03"]);
    expect(result.current.next).toBeNull();
    expect(result.current.loadingMore).toBe(false);
  });
});

describe("/historial", () => {
  it("lista los días por mes, resume lo hecho y enlaza al día registrado", async () => {
    stubHistory({
      "/api/workout-logs?limit=20": {
        days: [
          day(),
          day({
            date: "2026-09-01",
            sessionName: "Pierna",
            exercises: 1,
            sets: 4,
            cardio: 0,
          }),
          day({
            date: "2026-08-30",
            sessionName: null,
            note: "sin fuerza",
            exercises: 0,
            sets: 0,
            cardio: 0,
          }),
        ],
        next: null,
      },
    });

    renderAt("/historial");

    const first = await screen.findByRole("link", { name: /Empuje A/ });
    expect(first.getAttribute("href")).toBe("/sesion/2026-09-03");
    expect(first.textContent).toContain("2 ejercicios · 6 series · 1 cardio");
    expect(first.textContent).toContain("Esfuerzo 4/5");

    // Dos meses, en el orden recibido (el más reciente primero).
    const months = screen.getAllByRole("heading", { level: 2 });
    expect(months.map((m) => m.textContent)).toEqual([
      expect.stringMatching(/septiembre de 2026/i),
      expect.stringMatching(/agosto de 2026/i),
    ]);

    // Un día sin marcas se dice, no se deja en blanco.
    expect(screen.getByText(/Sin marcas/)).toBeDefined();
    expect(
      screen.getByRole("link", { name: /sin fuerza/ }).getAttribute("href"),
    ).toBe("/sesion/2026-08-30");
  });

  it("sin días registrados explica cómo llegar al primero", async () => {
    stubHistory({ "/api/workout-logs?limit=20": { days: [], next: null } });

    renderAt("/historial");

    expect(
      await screen.findByText("Aún no hay días registrados"),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: /Ir al calendario/ })
        .getAttribute("href"),
    ).toBe("/plan-fuerza");
  });

  it("«Cargar más» pide la página siguiente con before y la añade", async () => {
    const mock = stubHistory({
      "/api/workout-logs?limit=20": { days: [day()], next: "2026-09-03" },
      "/api/workout-logs?limit=20&before=2026-09-03": {
        days: [day({ date: "2026-08-20", sessionName: "Tirón" })],
        next: null,
      },
    });

    renderAt("/historial");
    const more = await screen.findByRole("button", { name: "Cargar más" });
    fireEvent.click(more);

    expect(await screen.findByRole("link", { name: /Tirón/ })).toBeDefined();
    expect(mock.mock.calls.map((c) => String(c[0]))).toContain(
      "/api/workout-logs?limit=20&before=2026-09-03",
    );
    // Ya no hay más: el botón desaparece.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull(),
    );
  });

  it("un fallo de red se avisa y «Reintentar» vuelve a pedir", async () => {
    let fail = true;
    const mock = stubHistory(() =>
      fail
        ? Response.json({ error: "boom" }, { status: 500 })
        : Response.json({ days: [day()], next: null }),
    );

    renderAt("/historial");
    const retry = await screen.findByRole("button", { name: "Reintentar" });
    fail = false;
    fireEvent.click(retry);

    expect(await screen.findByRole("link", { name: /Empuje A/ })).toBeDefined();
    expect(
      mock.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/workout-logs?"),
      ).length,
    ).toBe(2);
  });

  it("el raíl de Deporte lleva a Historial y marca la sección activa", async () => {
    stubHistory({ "/api/workout-logs?limit=20": { days: [], next: null } });

    renderAt("/historial");

    const link = await screen.findByRole("link", { name: "Historial" });
    expect(link.getAttribute("href")).toBe("/historial");
    expect(link.getAttribute("aria-current")).toBe("page");
  });
});
