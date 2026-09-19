import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { login } from "./helpers";

// playwright.config reads storageState from e2e/.auth/state.json.
const STATE = path.join(import.meta.dirname, "..", ".auth", "state.json");

setup("login", async ({ request }) => {
  const res = await login(request, "hola");
  expect(res.ok()).toBeTruthy();
  const cookies = (await res.headersArray()).length ? undefined : undefined;
  // request context stores cookies internally; serialize via storageState
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  await request.storageState({ path: STATE });
  void cookies;
  expect(fs.existsSync(STATE)).toBe(true);
});
