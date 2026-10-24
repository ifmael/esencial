import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function readEnv(
  file = path.join(os.homedir(), ".config", "orquestator", "env"),
) {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  const env = {};
  for (const line of text.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

export function linearKey(env = process.env, file) {
  const key = env.LINEAR_API_KEY ?? readEnv(file).LINEAR_API_KEY;
  if (!key) {
    throw new Error(
      "Falta LINEAR_API_KEY (en el entorno o en ~/.config/orquestator/env)",
    );
  }
  return key;
}
