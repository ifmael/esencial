/** Marca invisible y cabecera visible de los comentarios de la IA. */
export const AI_MARKER = "<!-- orquestator-cli:ai -->";

export function markComment(body, label = "Orquestator (IA)") {
  const text = String(body ?? "").trim();
  if (text.startsWith(AI_MARKER)) return text;
  return `${AI_MARKER}\n**${label}**\n\n${text}\n`;
}

/** Resumen de checks: resultado, fecha y comando; nunca el log crudo. */
export function checksSummary(artifact) {
  const text = String(artifact ?? "");
  const result = /^Resultado:\s*(.+)$/m.exec(text)?.[1]?.trim();
  const date = /^Fecha:\s*(.+)$/m.exec(text)?.[1]?.trim();
  const command = /^\$ (.+)$/m.exec(text)?.[1]?.trim();
  const lines = ["# Checks"];
  if (result) lines.push(`- Resultado: ${result}`);
  if (date) lines.push(`- Fecha: ${date}`);
  if (command) lines.push("", "```", `$ ${command}`, "```");
  lines.push("", "El log completo queda en el artefacto local de la tarea.");
  return lines.join("\n");
}
