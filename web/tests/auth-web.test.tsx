// E7 web tests: login card, client session guard, logout button.
// fetch is mocked per test (jsdom has no backend); App is the real router.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

/** Stub window.fetch: status endpoint + login/logout responses per scenario. */
function mockFetch({
  authenticated = false,
  login = { status: 200, body: { ok: true } as unknown },
}: { authenticated?: boolean; login?: { status: number; body: unknown } } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const u = String(url);
    if (u.startsWith("/api/auth/status")) return Response.json({ authenticated });
    if (u.startsWith("/api/auth/login")) return Response.json(login.body, { status: login.status });
    if (u.startsWith("/api/auth/logout")) return Response.json({ ok: true });
    if (u.startsWith("/api/day/"))
      return Response.json({ date: "2026-09-02", isoWeek: "2026-W36", dayIndex: 2, meals: [], session: null, note: { text: "" } });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("/login screen", () => {
  it("renders centered card with title, required password field and Entrar", () => {
    mockFetch({ authenticated: true });
    renderAt("/login");
    expect(screen.getByRole("heading", { name: "Esencial" })).toBeDefined();
    const input = screen.getByLabelText("Contraseña");
    expect(input.getAttribute("type")).toBe("password");
    expect((input as HTMLInputElement).required).toBe(true);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDefined();
  });

  it("submits JSON, disables the button while pending, navigates to next", async () => {
    // status=true: after login the guard lets /plan-recetas render.
    const { calls } = mockFetch({ authenticated: true });
    renderAt("/login?next=%2Fplan-recetas");
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "s3creta" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    // pending state: button disabled while the request is in flight
    expect((screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(window.location.pathname).toBe("/plan-recetas"));
    const login = calls.find((c) => c.url.startsWith("/api/auth/login"));
    expect(login?.init.method).toBe("POST");
    expect(JSON.parse(String(login?.init.body))).toEqual({ password: "s3creta" });
  });

  it("401 shows inline error tied to the field; no navigation", async () => {
    mockFetch({
      authenticated: false,
      login: { status: 401, body: { error: "Invalid credentials", field: "password" } },
    });
    renderAt("/login");
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "mala" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByText("Contraseña incorrecta")).toBeDefined());
    expect(screen.getByLabelText("Contraseña").getAttribute("aria-invalid")).toBe("true");
    expect(window.location.pathname).toBe("/login");
  });

  it("429 shows a wait message", async () => {
    mockFetch({
      authenticated: false,
      login: { status: 429, body: { error: "Too many attempts", field: "login" } },
    });
    renderAt("/login");
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByText(/espera un momento/i)).toBeDefined());
  });
});

describe("client session guard", () => {
  it("unauthenticated on /plan-fuerza redirects to /login?next= and renders no data", async () => {
    mockFetch({ authenticated: false });
    renderAt("/plan-fuerza");
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(window.location.search).toBe("?next=%2Fplan-fuerza");
  });

  it("authenticated user sees the shell directly", async () => {
    mockFetch({ authenticated: true });
    renderAt("/");
    await waitFor(() => expect(screen.getByText("FUERZA")).toBeDefined());
    expect(window.location.pathname).toBe("/");
  });
});

describe("logout", () => {
  it("logout button posts and returns to /login", async () => {
    const { calls } = mockFetch({ authenticated: true });
    renderAt("/");
    await waitFor(() => expect(screen.getByText("FUERZA")).toBeDefined());
    fireEvent.click(screen.getAllByRole("button", { name: "Cerrar sesión" })[0]);
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(calls.some((c) => c.url.startsWith("/api/auth/logout"))).toBe(true);
  });
});
