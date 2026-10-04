// Essential API — Hono app for Cloudflare Workers (CM1).
// Mounts the 13 E1 routes under /api/*; healthcheck at /api/health.
// Central onError emits the E1 envelope { error, field? } (design D2).
// E7: security headers on every response y el 401 gate en /api/*. El guard del
// HTML (302 → /login) vive en el Worker del frontal (B', dos despliegues).
import { Hono } from "hono";
import type { AppContext } from "./db";
import { dbFailure, json } from "./http";
import { cors, identifyUser, securityHeaders } from "./middleware";
import { authRoutes } from "./routes/auth";
import { day } from "./routes/day";
import { exercises } from "./routes/exercises";
import { foods } from "./routes/foods";
import { me } from "./routes/me";
import { mealPlan } from "./routes/meal-plan";
import { notes } from "./routes/notes";
import { planSessions } from "./routes/plan-sessions";
import { recipes } from "./routes/recipes";
import { shoppingList } from "./routes/shopping-list";
import { templates } from "./routes/templates";
import { uploads } from "./routes/uploads";
import { workoutLogs } from "./routes/workout-logs";

export const api = new Hono<AppContext>()
  // TEMP debug: env presence probe (no value disclosure).
  .get("/health", () => json({ ok: true }))
  .route("/auth", authRoutes())
  .route("/recipes", recipes)
  .route("/exercises", exercises)
  .route("/foods", foods)
  .route("/templates", templates)
  .route("/meal-plan", mealPlan)
  .route("/me", me)
  .route("/plan-sessions", planSessions)
  .route("/workout-logs", workoutLogs)
  .route("/notes", notes)
  .route("/shopping-list", shoppingList)
  .route("/day", day)
  .route("/uploads", uploads);

const app = new Hono<AppContext>()
  .use(securityHeaders)
  .use(cors)
  .use(identifyUser)
  .route("/api", api)
  // B': este Worker solo sirve /api/*; el SPA (y su guard) vive en el Worker
  // del frontal, así que cualquier otra ruta es un 404 JSON.
  .notFound(() => json({ error: "Not found" }, 404))
  .onError((err) => dbFailure(err));

export default app;
