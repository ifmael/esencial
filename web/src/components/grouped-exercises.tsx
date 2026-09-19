// Grupos de ejercicios por músculo (primer tag), con cabeceras plegables y
// conteo. Compartido por el selector del día y el de la modal de plantilla.
import { type ReactNode, useState } from "react";
import type { Exercise } from "../lib/exercises";

export const GROUP_LABELS: Record<string, string> = {
  pecho: "Pecho",
  espalda: "Espalda",
  hombro: "Hombro",
  bíceps: "Bíceps",
  tríceps: "Tríceps",
  pierna: "Pierna",
  glúteo: "Glúteo",
  core: "Core",
  antebrazo: "Antebrazo",
  gemelo: "Gemelo",
};

/** Cotejador alfabético español (acentos y mayúsculas sin peso). */
const collator = new Intl.Collator("es", { sensitivity: "base" });

/** Grupos por primer tag (músculo): grupos y ejercicios en orden alfabético;
 *  los ejercicios sin tag caen en «otro». */
function groupByMuscle(list: Exercise[]): [string, Exercise[]][] {
  const groups: Record<string, Exercise[]> = {};
  for (const e of list) {
    const tag = e.tags[0] ?? "otro";
    groups[tag] ??= [];
    groups[tag].push(e);
  }
  const entries = Object.entries(groups);
  for (const [, items] of entries) {
    items.sort((a, b) => collator.compare(a.name, b.name));
  }
  return entries.sort(([a], [b]) =>
    collator.compare(GROUP_LABELS[a] ?? a, GROUP_LABELS[b] ?? b),
  );
}

/** Grupos plegables: cabecera con nombre y conteo. Cerrados por defecto; si la
 *  lista viene forzada (búsqueda o filtro activos) salen desplegados, y el
 *  usuario puede plegarlos igualmente. */
export function GroupedExercises({
  exercises,
  forceOpen,
  listClassName,
  renderItem,
}: {
  exercises: Exercise[];
  forceOpen: boolean;
  listClassName: string;
  renderItem: (e: Exercise) => ReactNode;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <>
      {groupByMuscle(exercises).map(([tag, list]) => {
        const isOpen = forceOpen ? open[tag] !== false : open[tag] === true;
        return (
          <section key={tag} className="flex flex-col gap-1">
            <h4 className="font-semibold uppercase tracking-wide text-text-secondary">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [tag]: !isOpen }))}
              >
                {GROUP_LABELS[tag] ?? tag} ({list.length})
                <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
              </button>
            </h4>
            {isOpen ? (
              <ul className={listClassName}>{list.map(renderItem)}</ul>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
