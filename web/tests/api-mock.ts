// In-memory fake of the E1 API for component tests: mirrors the real envelope
// behaviour ({error, field} on 400/404, 204 on delete, UNIQUE name, FK in-use).
import { vi } from "vitest";
import type { Exercise } from "../src/lib/exercises";
import type { Template } from "../src/lib/templates";

export type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

export type Seed = { templates?: Template[]; exercises?: Exercise[] };

export type MockApi = {
  state: { templates: Template[]; exercises: Exercise[] };
  calls: Call[];
  hang: boolean;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const err = (error: string, field?: string, status = 400) =>
  json(field ? { error, field } : { error }, status);

export function mockApi(seed: Seed = {}): MockApi {
  const api: MockApi = {
    state: { templates: structuredClone(seed.templates ?? []), exercises: structuredClone(seed.exercises ?? []) },
    calls: [],
    hang: false,
  };
  let nextExerciseId = Math.max(0, ...api.state.exercises.map((e) => e.id)) + 1;
  let nextTemplateId = Math.max(0, ...api.state.templates.map((t) => t.id)) + 1;
  let nextRowId = 100;

  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    api.calls.push({ url, method, body });
    // E7 guard: every page test renders App → GuardedShell probes this once.
    if (url.startsWith("/api/auth/status")) return json({ authenticated: true });
    if (api.hang) return new Promise<Response>(() => {}); // pending forever

    const tMatch = /^\/api\/templates(?:\/(\d+))?$/.exec(url);
    const eMatch = /^\/api\/exercises(?:\/(\d+))?$/.exec(url);

    if (tMatch) {
      const id = tMatch[1] ? Number(tMatch[1]) : null;
      if (method === "GET" && id === null) return json(api.state.templates);
      if (method === "POST") {
        const b = body as { name: string; rotation_index: number; exercises: unknown[] };
        const name = b.name.trim();
        if (api.state.templates.some((t) => t.name === name)) return err("Already exists", "name");
        const t: Template = {
          id: nextTemplateId++,
          name,
          rotation_index: b.rotation_index,
          exercises: b.exercises.map((raw, pos) => hydrate(raw, pos, api, nextRowId++)),
        };
        api.state.templates.push(t);
        return json(t, 201);
      }
      if (id !== null) {
        const t = api.state.templates.find((x) => x.id === id);
        if (!t) return err("Not found", undefined, 404);
        if (method === "PUT") {
          const b = body as { name: string; rotation_index?: number; exercises: unknown[] };
          if (api.state.templates.some((x) => x.name === b.name.trim() && x.id !== id))
            return err("Already exists", "name");
          t.name = b.name.trim();
          if (b.rotation_index !== undefined && b.rotation_index !== null) t.rotation_index = b.rotation_index;
          t.exercises = b.exercises.map((raw, pos) => hydrate(raw, pos, api, nextRowId++));
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
      const validate = (b: { name?: string; tags?: string[]; technique_url?: string | null }) => {
        if (!b.name || !b.name.trim()) return err("Exercise name is required", "name");
        if (!b.tags || b.tags.length < 1) return err("At least one tag is required", "tags");
        if (b.technique_url && !/^https?:\/\/\S+$/.test(b.technique_url))
          return err("technique_url must be a valid URL", "technique_url");
        return null;
      };
      if (method === "POST") {
        const b = body as { name: string; description?: string | null; setup_cues?: string | null; technique_url?: string | null; tags: string[] };
        const bad = validate(b);
        if (bad) return bad;
        if (api.state.exercises.some((x) => x.name === b.name.trim())) return err("Already exists", "name");
        const ex: Exercise = {
          id: nextExerciseId++,
          name: b.name.trim(),
          description: b.description ?? null,
          setupCues: b.setup_cues ?? null,
          techniqueUrl: b.technique_url ?? null,
          tags: b.tags,
        };
        api.state.exercises.push(ex);
        return json(ex, 201);
      }
      if (id !== null) {
        const ex = api.state.exercises.find((x) => x.id === id);
        if (!ex) return err("Not found", undefined, 404);
        if (method === "PUT") {
          const b = body as typeof ex & { setup_cues?: string | null; technique_url?: string | null };
          const bad = validate(b);
          if (bad) return bad;
          Object.assign(ex, {
            name: b.name.trim(),
            description: b.description ?? null,
            setupCues: b.setup_cues ?? null,
            techniqueUrl: b.technique_url ?? null,
            tags: b.tags,
          });
          return json(ex);
        }
        if (method === "DELETE") {
          const inUse = api.state.templates.some((t) => t.exercises.some((r) => r.exerciseId === id));
          if (inUse) return err("References a missing or in-use record", "reference");
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
  const e = raw as { exerciseId: number; target_sets?: number | null; target_reps_min?: number | null; target_reps_max?: number | null };
  return {
    id: rowId,
    exerciseId: e.exerciseId,
    position,
    target_sets: e.target_sets ?? null,
    target_reps_min: e.target_reps_min ?? null,
    target_reps_max: e.target_reps_max ?? null,
    exerciseName: api.state.exercises.find((x) => x.id === e.exerciseId)?.name ?? "?",
  };
}
