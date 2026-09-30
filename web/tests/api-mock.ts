// In-memory fake of the API for component tests: mirrors the real envelope
// behaviour ({error, field} on 400/404, 204 on delete, UNIQUE name, FK in-use)
// and the v2 session model (la sesión es el día con items sin duplicados).
import { vi } from "vitest";
import type { Exercise } from "../src/lib/exercises";
import type { Template } from "../src/lib/templates";

export type Call = {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
};

export type SessionExerciseRow = {
  id: number;
  exerciseId: number;
  exerciseName: string;
  kind: "strength" | "running" | "bike";
  position: number;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDistanceKm: number | null;
  targetDurationMin: number | null;
};

export type PlanSessionRow = {
  id: number;
  date: string;
  name: string | null;
  status: "planned" | "logged";
  exercises: SessionExerciseRow[];
};

export type Seed = {
  templates?: Template[];
  exercises?: Exercise[];
  sessions?: PlanSessionRow[];
};

export type MockApi = {
  state: {
    templates: Template[];
    exercises: Exercise[];
    sessions: PlanSessionRow[];
  };
  calls: Call[];
  hang: boolean;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const err = (error: string, field?: string, status = 400) =>
  json(field ? { error, field } : { error }, status);

type RawItem = {
  exerciseId: number;
  targetSets?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDistanceKm?: number | null;
  targetDurationMin?: number | null;
};

export function mockApi(seed: Seed = {}): MockApi {
  const api: MockApi = {
    state: {
      templates: structuredClone(seed.templates ?? []),
      exercises: structuredClone(seed.exercises ?? []),
      sessions: structuredClone(seed.sessions ?? []),
    },
    calls: [],
    hang: false,
  };
  let nextExerciseId = Math.max(0, ...api.state.exercises.map((e) => e.id)) + 1;
  let nextTemplateId = Math.max(0, ...api.state.templates.map((t) => t.id)) + 1;
  let nextRowId = 100;
  let nextSessionId = 1000;
  let nextSessionRowId = 2000;

  const itemsProblem = (items: RawItem[]): Response | null => {
    const ids = items.map((i) => i.exerciseId);
    if (new Set(ids).size !== ids.length)
      return err("Ejercicio duplicado en la sesión", "items");
    const unknown = ids.some(
      (id) => !api.state.exercises.some((e) => e.id === id),
    );
    return unknown ? err("Ejercicio desconocido", "items") : null;
  };

  const hydrateSessionRows = (items: RawItem[]): SessionExerciseRow[] =>
    items.map((raw, pos) => {
      const ex = api.state.exercises.find((x) => x.id === raw.exerciseId);
      return {
        id: nextSessionRowId++,
        exerciseId: raw.exerciseId,
        exerciseName: ex?.name ?? "?",
        kind: ex?.kind ?? "strength",
        position: pos,
        targetSets: raw.targetSets ?? null,
        targetRepsMin: raw.targetRepsMin ?? null,
        targetRepsMax: raw.targetRepsMax ?? null,
        targetDistanceKm: raw.targetDistanceKm ?? null,
        targetDurationMin: raw.targetDurationMin ?? null,
      };
    });

  const impl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    api.calls.push({ url, method, body });
    // E7 guard: every page test renders App → GuardedShell probes this once.
    if (url.startsWith("/api/auth/status"))
      return json({ authenticated: true });
    if (api.hang) return new Promise<Response>(() => {}); // pending forever

    const sMatch = /^\/api\/plan-sessions(?:\/(\d+))?$/.exec(url);
    const tMatch = /^\/api\/templates(?:\/(\d+))?$/.exec(url);
    const eMatch = /^\/api\/exercises(?:\/(\d+))?$/.exec(url);

    if (sMatch) {
      const id = sMatch[1] ? Number(sMatch[1]) : null;
      if (method === "GET" && id === null) return json(api.state.sessions);
      if (method === "GET" && id !== null) {
        const s = api.state.sessions.find((x) => x.id === id);
        return s ? json(s) : err("Not found", undefined, 404);
      }
      if (method === "POST") {
        const b = body as {
          date: string;
          name?: string | null;
          items: RawItem[];
        };
        if (api.state.sessions.some((s) => s.date === b.date))
          return err("Ya hay una sesión ese día", "date", 409);
        const bad = itemsProblem(b.items ?? []);
        if (bad) return bad;
        const session: PlanSessionRow = {
          id: nextSessionId++,
          date: b.date,
          name: b.name ?? null,
          status: "planned",
          exercises: hydrateSessionRows(b.items ?? []),
        };
        api.state.sessions.push(session);
        return json(session, 201);
      }
      if (id !== null) {
        const s = api.state.sessions.find((x) => x.id === id);
        if (!s) return err("Not found", undefined, 404);
        if (s.status === "logged")
          return err("Sesión ya registrada", undefined, 409);
        if (method === "PUT") {
          const b = body as { name?: string | null; items: RawItem[] };
          const bad = itemsProblem(b.items ?? []);
          if (bad) return bad;
          s.name = b.name ?? null;
          s.exercises = hydrateSessionRows(b.items ?? []);
          return json(s);
        }
        if (method === "DELETE") {
          api.state.sessions = api.state.sessions.filter((x) => x.id !== id);
          return json({});
        }
      }
    }

    if (tMatch) {
      const id = tMatch[1] ? Number(tMatch[1]) : null;
      if (method === "GET" && id === null) return json(api.state.templates);
      if (method === "POST") {
        const b = body as { name: string; exercises: unknown[] };
        const name = b.name.trim();
        if (api.state.templates.some((t) => t.name === name))
          return err("Already exists", "name");
        const t: Template = {
          id: nextTemplateId++,
          name,
          exercises: b.exercises.map((raw, pos) =>
            hydrate(raw, pos, api, nextRowId++),
          ),
        };
        api.state.templates.push(t);
        return json(t, 201);
      }
      if (id !== null) {
        const t = api.state.templates.find((x) => x.id === id);
        if (!t) return err("Not found", undefined, 404);
        if (method === "PUT") {
          const b = body as { name: string; exercises: unknown[] };
          if (
            api.state.templates.some(
              (x) => x.name === b.name.trim() && x.id !== id,
            )
          )
            return err("Already exists", "name");
          t.name = b.name.trim();
          t.exercises = b.exercises.map((raw, pos) =>
            hydrate(raw, pos, api, nextRowId++),
          );
          return json(t);
        }
        if (method === "DELETE") {
          api.state.templates = api.state.templates.filter((x) => x.id !== id);
          return new Response(null, { status: 204 });
        }
      }
    }

    if (eMatch) {
      const id = eMatch[1] ? Number(eMatch[1]) : null;
      if (method === "GET" && id === null) return json(api.state.exercises);
      const validate = (b: {
        name?: string;
        tags?: string[];
        techniqueUrl?: string | null;
      }) => {
        if (!b.name?.trim()) return err("Exercise name is required", "name");
        if (!b.tags || b.tags.length < 1)
          return err("At least one tag is required", "tags");
        if (b.techniqueUrl && !/^https?:\/\/\S+$/.test(b.techniqueUrl))
          return err("techniqueUrl must be a valid URL", "techniqueUrl");
        return null;
      };
      if (method === "POST") {
        const b = body as {
          name: string;
          description?: string | null;
          setupCues?: string | null;
          techniqueUrl?: string | null;
          steps?: string[] | null;
          tags: string[];
          regions?: Exercise["regions"];
          kind?: "strength" | "running" | "bike";
        };
        const bad = validate(b);
        if (bad) return bad;
        if (api.state.exercises.some((x) => x.name === b.name.trim()))
          return err("Already exists", "name");
        const ex: Exercise = {
          id: nextExerciseId++,
          name: b.name.trim(),
          description: b.description ?? null,
          setupCues: b.setupCues ?? null,
          techniqueUrl: b.techniqueUrl ?? null,
          steps: b.steps ?? null,
          tags: b.tags,
          regions: b.regions ?? [],
          kind: b.kind ?? "strength",
        };
        api.state.exercises.push(ex);
        return json(ex, 201);
      }
      if (id !== null) {
        const ex = api.state.exercises.find((x) => x.id === id);
        if (!ex) return err("Not found", undefined, 404);
        if (method === "PUT") {
          const b = body as typeof ex & {
            setupCues?: string | null;
            techniqueUrl?: string | null;
          };
          const bad = validate(b);
          if (bad) return bad;
          Object.assign(ex, {
            name: b.name.trim(),
            description: b.description ?? null,
            setupCues: b.setupCues ?? null,
            techniqueUrl: b.techniqueUrl ?? null,
            steps: b.steps ?? null,
            tags: b.tags,
            regions: b.regions ?? [],
            kind: b.kind ?? "strength",
          });
          return json(ex);
        }
        if (method === "DELETE") {
          const inUse = api.state.templates.some((t) =>
            t.exercises.some((r) => r.exerciseId === id),
          );
          if (inUse)
            return err("References a missing or in-use record", "reference");
          api.state.exercises = api.state.exercises.filter((x) => x.id !== id);
          return new Response(null, { status: 204 });
        }
      }
    }
    return err("Not found", undefined, 404);
  };

  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return api;
}

function hydrate(
  raw: unknown,
  position: number,
  api: MockApi,
  rowId: number,
): Template["exercises"][number] {
  const e = raw as RawItem;
  const ex = api.state.exercises.find((x) => x.id === e.exerciseId);
  return {
    id: rowId,
    exerciseId: e.exerciseId,
    position,
    targetSets: e.targetSets ?? null,
    targetRepsMin: e.targetRepsMin ?? null,
    targetRepsMax: e.targetRepsMax ?? null,
    targetDistanceKm: e.targetDistanceKm ?? null,
    targetDurationMin: e.targetDurationMin ?? null,
    exerciseName: ex?.name ?? "?",
    kind: ex?.kind ?? "strength",
  };
}
