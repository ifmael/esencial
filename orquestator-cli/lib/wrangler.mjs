import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Binario fijado al del repo; nunca `wrangler login`. */
export function runWrangler(args, { cwd, env, main = process.cwd() }) {
  const local = path.join(main, "node_modules", ".bin", "wrangler");
  const bin = fs.existsSync(local) ? local : "wrangler";
  try {
    return execFileSync(bin, args, {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = String(error.stderr ?? "").trim();
    throw new Error(
      `wrangler ${args.join(" ")} falló${detail ? `: ${detail}` : ""}`,
    );
  }
}
