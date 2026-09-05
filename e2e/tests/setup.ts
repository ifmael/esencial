import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// playwright.config reads storageState from e2e/.auth/state.json.
const STATE = path.join(__dirname, "..", ".auth", "state.json");

setup("login", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { password: "hola" },
  });
  expect(res.ok()).toBeTruthy();
  const cookies = (await res.headersArray()).length ? undefined : undefined;
  // request context stores cookies internally; serialize via storageState
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  await request.storageState({ path: STATE });
  void cookies;
  expect(fs.existsSync(STATE)).toBe(true);
});
