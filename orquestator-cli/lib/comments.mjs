/** Marca invisible y cabecera visible de los comentarios de la IA. */
export const AI_MARKER = "<!-- orquestator-cli:ai -->";

export function markComment(body, label = "Orquestator (IA)") {
  const text = String(body ?? "").trim();
  if (text.startsWith(AI_MARKER)) return text;
  return `${AI_MARKER}\n**${label}**\n\n${text}\n`;
}
