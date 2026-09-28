// Lista de la compra: el set manual se guarda siempre completo (PUT). Añadir y
// quitar calculan aquí el set nuevo desde las secciones que pinta la hoja.

export type ListItem = {
  id: number | null;
  source: "recipe" | "manual";
  food: string;
  quantity: number | null;
  unit: string | null;
  checked?: boolean;
  section?: string;
};
export type ListSection = { section: string; items: ListItem[] };

/** Fila del cuerpo de `PUT /api/shopping-list/:week/items`. */
export type ManualItem = {
  food: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  section: string;
};

/** Manuales de la lista (en orden, con su sección), sin `drop` (por id) y con
 * `add` al final, sin marcar. */
export function manualSet(
  sections: ListSection[],
  {
    drop,
    add,
  }: { drop?: number; add?: { food: string; section: string } } = {},
): ManualItem[] {
  const manuals = sections.flatMap((s) =>
    s.items
      .filter(
        (i) => i.source === "manual" && (drop === undefined || i.id !== drop),
      )
      .map((i) => ({
        food: i.food,
        quantity: i.quantity,
        unit: i.unit,
        checked: i.checked ?? false,
        section: s.section,
      })),
  );
  return add
    ? [...manuals, { ...add, quantity: null, unit: null, checked: false }]
    : manuals;
}
