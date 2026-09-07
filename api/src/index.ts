// Essential API — Hono app for Cloudflare Workers (CM1).
// Mounts the 13 E1 routes under /api/*; healthcheck at /api/health.
// Central onError emits the E1 envelope { error, field? } (design D2).
// E7: security headers on every response, 401 gate on /api/*, page guard →
// /login (run_worker_first makes the Worker see asset requests too).
import { Hono } from "hono";
import type { Env } from "./db";
import { dbFailure, json } from "./http";
import { authGuard, pageGuard, securityHeaders } from "./middleware";
import { authRoutes } from "./routes/auth";
import { day } from "./routes/day";
import { exercises } from "./routes/exercises";
import { mealPlan } from "./routes/meal-plan";
import { notes } from "./routes/notes";
import { planSessions } from "./routes/plan-sessions";
import { recipes } from "./routes/recipes";
import { shoppingList } from "./routes/shopping-list";
import { templates } from "./routes/templates";
import { workoutLogs } from "./routes/workout-logs";

export const api = new Hono<{ Bindings: Env }>()
  // TEMP debug: env presence probe (no value disclosure).
  .get("/health", () => json({ ok: true }))
  .route("/auth", authRoutes())
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
  .use(securityHeaders)
  .use(authGuard)
  .use(pageGuard)
  .route("/api", api)
  // Non-API paths (deep links) fall through to SPA assets; API keeps the JSON 404.
  // The asset Response has immutable headers; re-wrap so securityHeaders can set.
  .notFound(async (c) => {
    if (c.req.path.startsWith("/api")) return json({ error: "Not found" }, 404);
    const asset = await c.env.ASSETS.fetch(c.req.raw);
    return new Response(asset.body, asset);
  })
  .onError((err) => dbFailure(err));

export default app;
