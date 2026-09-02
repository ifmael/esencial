// Essential API — Hono app for Cloudflare Workers (CM1).
// Mounts the 13 E1 routes under /api/*; healthcheck at /api/health.
// Central onError emits the E1 envelope { error, field? } (design D2).
import { Hono } from "hono";
import type { Env } from "./db";
import { json, dbFailure } from "./http";
import { recipes } from "./routes/recipes";
import { exercises } from "./routes/exercises";
import { templates } from "./routes/templates";
import { mealPlan } from "./routes/meal-plan";
import { planSessions } from "./routes/plan-sessions";
import { workoutLogs } from "./routes/workout-logs";
import { notes } from "./routes/notes";
import { shoppingList } from "./routes/shopping-list";
import { day } from "./routes/day";

export const api = new Hono<{ Bindings: Env }>()
  .get("/health", (c) => json({ ok: true }))
  .route("/recipes", recipes)
  .route("/exercises", exercises)
  .route("/templates", templates)
  .route("/meal-plan", mealPlan)
  .route("/plan-sessions", planSessions)
  .route("/workout-logs", workoutLogs)
  .route("/notes", notes)
  .route("/shopping-list", shoppingList)
  .route("/day", day);

const app = new Hono<{ Bindings: Env }>()
  .route("/api", api)
  // Non-API paths (deep links) fall through to SPA assets; API keeps the JSON 404.
  .notFound((c) =>
    c.req.path.startsWith("/api") ? json({ error: "Not found" }, 404) : c.env.ASSETS.fetch(c.req.raw),
  )
  .onError((err, c) => dbFailure(err));

export default app;
