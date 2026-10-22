import { listArtifacts, readArtifact } from "./artifacts.mjs";
import { runGh, viewArgs } from "./github.mjs";
import { guardTask } from "./guard.mjs";
import { home, load } from "./state.mjs";

export function inspect(
  key,
  { base = home(), main = process.cwd(), ghRun = runGh } = {},
) {
  const state = load(key, base);
  if (!state) throw new Error(`La tarea ${key} no existe`);
  const out = [
    `${key} — ${state.issueTitle ?? "(sin título)"}`,
    `estado: ${state.state}`,
    `rama: ${state.branch ?? "-"}`,
  ];
  if (state.pr) out.push(`PR #${state.pr.number}: ${state.pr.url ?? ""}`);
  if (state.question) out.push(`pregunta: ${state.question}`);

  const artifacts = listArtifacts(key, base);
  out.push(
    "",
    "Artefactos:",
    ...artifacts.map((a) => `  ${a.filled ? "●" : "○"} ${a.name}`),
  );
  if (artifacts.some((a) => a.name === "brief.md" && a.filled)) {
    const brief = readArtifact(key, "brief.md", base)
      .trim()
      .split("\n")
      .slice(0, 20)
      .join("\n");
    out.push("", "Brief:", brief);
  }

  try {
    const guard = guardTask(key, { base, main });
    out.push(
      "",
      `diff: ${guard.files.length} fichero(s); protegidos: ${
        guard.touched.length ? guard.touched.join(", ") : "ninguno"
      }; ${guard.approval ? "aprobado" : "sin aprobar"}`,
    );
  } catch (error) {
    out.push("", `diff: no disponible (${error.message})`);
  }

  if (state.pr?.number) {
    try {
      const pr = JSON.parse(ghRun(viewArgs(String(state.pr.number))));
      const checks = (pr.statusCheckRollup ?? [])
        .map((c) => `${c.name ?? c.context}:${c.conclusion ?? c.state}`)
        .join(" ");
      out.push(
        "",
        `CI: ${checks || "sin datos"}; mergeable: ${pr.mergeable ?? "?"}`,
      );
    } catch (error) {
      out.push("", `CI: no disponible (${error.message})`);
    }
  }
  return out.join("\n");
}
