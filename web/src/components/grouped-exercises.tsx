// Grupos de ejercicios por músculo (primer tag), con cabeceras plegables y
// conteo. Compartido por el selector del día y el de la modal de plantilla.
import { type ReactNode, useState } from "react";
import type { Exercise } from "../lib/exercises";
import { ChevronDownIcon } from "./icons";
import { cx, ripple } from "./ui";

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

/** Los diez grupos musculares en orden alfabético español (fichas de filtro). */
export const MUSCLE_GROUPS = Object.keys(GROUP_LABELS).sort((a, b) =>
  collator.compare(GROUP_LABELS[a], GROUP_LABELS[b]),
);

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
    <div className="flex flex-col gap-2">
      {groupByMuscle(exercises).map(([tag, list]) => {
        const isOpen = forceOpen ? open[tag] !== false : open[tag] === true;
        return (
          <section
            key={tag}
            className={cx(
              "flex flex-col overflow-hidden rounded-l transition-colors motion-effects",
              isOpen ? "bg-surface-container-high" : "bg-surface-container",
            )}
          >
            <h4 className="section-label">
              <button
                type="button"
                className="state flex min-h-12 w-full items-center gap-2 px-4 text-left"
                aria-expanded={isOpen}
                onPointerDown={ripple}
                onClick={() => setOpen((o) => ({ ...o, [tag]: !isOpen }))}
              >
                <span className="flex-1">
                  {GROUP_LABELS[tag] ?? tag}{" "}
                  <span className="tabular">({list.length})</span>
                </span>
                <ChevronDownIcon
                  className={cx(
                    "transition-transform motion-spatial-fast",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
            </h4>
            {isOpen ? (
              <ul className={cx("px-2 pb-2", listClassName)}>
                {list.map(renderItem)}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
