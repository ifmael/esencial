// Shared test helpers: fresh temp-file DB per suite + fetch-style request builders.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDb } from "@/lib/db";

export function useTempDb(): () => void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "essential-test-"));
  process.env.ESSENTIAL_DB_PATH = path.join(dir, "test.db");
  return () => {
    closeDb();
    delete process.env.ESSENTIAL_DB_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  };
}

/** Call a Next route handler directly (no HTTP server); P is the route's params shape. */
export function call<P = Record<string, never>>(
  handler: (req: Request, ctx: { params: Promise<P> }) => Promise<Response>,
  req: Request,
  params?: P,
): Promise<Response> {
  return handler(req, { params: Promise.resolve(params as P) });
}

export function get(url: string): Request {
  return new Request(`http://localhost${url}`);
}

export function send(url: string, method: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const post = (url: string, body: unknown) => send(url, "POST", body);
export const put = (url: string, body: unknown) => send(url, "PUT", body);
export const del = (url: string) => new Request(`http://localhost${url}`, { method: "DELETE" });
