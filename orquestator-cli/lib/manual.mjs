import fs from "node:fs";
import path from "node:path";
import { runGh, statusArgs, viewArgs } from "./github.mjs";
import { analyze, protectedRules, sha256 } from "./guard.mjs";
import { home } from "./state.mjs";

export function approvePr(
  number,
  {
    base = home(),
    main = process.cwd(),
    isTTY,
    reason,
    dryRun,
    ghRun = runGh,
    out = () => {},
  } = {},
) {
  const pr = JSON.parse(ghRun(viewArgs(String(number))));
  const files = ghRun(["pr", "diff", String(number), "--name-only"])
    .split("\n")
    .filter(Boolean);
  const verdict = analyze(files, protectedRules({ main }));

  if (verdict.noApprove) {
    throw new Error(`Rutas no aprobables: ${verdict.touched.join(", ")}`);
  }
  if (!verdict.needsApproval) {
    ghRun(statusArgs(pr.headRefOid, "success", "sin rutas protegidas"));
    out(`PR #${number}: sin rutas protegidas`);
    return { approved: false, number };
  }
  if (!isTTY)
    throw new Error("approve --pr solo se puede usar desde una terminal");
  const text = String(reason ?? "").trim();
  if (!text) throw new Error("approve --pr necesita un motivo (--motivo)");

  const hash = sha256(ghRun(["pr", "diff", String(number)]));
  if (dryRun) {
    out(`[dry-run] PR #${number}: aprobaría ${hash.slice(0, 12)}`);
    return { dryRun: true, number, hash };
  }
  const dir = path.join(base, "approvals");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `pr-${number}.json`),
    `${JSON.stringify({ hash, reason: text, at: new Date().toISOString(), sha: pr.headRefOid }, null, 2)}\n`,
    { mode: 0o600 },
  );
  ghRun(statusArgs(pr.headRefOid, "success", "aprobado"));
  out(`PR #${number}: aprobada ${hash.slice(0, 12)}`);
  return { approved: true, number, hash };
}
