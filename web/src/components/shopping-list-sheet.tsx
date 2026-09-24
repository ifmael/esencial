// E3: hoja "Lista de la compra". El servidor compone GET /api/shopping-list/:week
// (líneas de receta derivadas del plan + manuales persistidos). Las recetas no se
// marcan; los manuales se checkboxean con PATCH y se editan con PUT completo.
import { useCallback, useEffect, useState } from "react";
import { apiFetchRaw } from "../lib/api";
import { Button, Card } from "./ui";

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

function qtyLabel(item: ListItem): string {
  if (item.quantity == null) return item.food;
  return item.unit
    ? `${item.food} ${item.quantity} ${item.unit}`
    : `${item.food} ${item.quantity}`;
}

export function ShoppingListSheet({
  isoWeek,
  open,
  onClose,
}: {
  isoWeek: string;
  open: boolean;
  onClose: () => void;
}) {
  const [sections, setSections] = useState<ListSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const reload = useCallback(() => {
    setError(null);
    apiFetchRaw(`/api/shopping-list/${isoWeek}`)
      .then(async (res) => {
        const data: { sections: ListSection[]; error?: string } =
          await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error");
        setSections(data.sections);
      })
      .catch(() => {
        setSections(null);
        setError("No se pudo cargar la lista de la compra.");
      });
  }, [isoWeek]);

  useEffect(() => {
    if (open) reload();
  }, [open, attempt, reload]);

  if (!open) return null;

  const toggle = async (item: ListItem) => {
    if (item.id === null) return;
    const res = await apiFetchRaw(
      `/api/shopping-list/${isoWeek}/items/${item.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checked: !item.checked }),
      },
    ).catch(() => null);
    if (!res?.ok) return setError("No se pudo actualizar el artículo.");
    const fresh: ListItem = await res.json();
    setSections((prev) =>
      (prev ?? []).map((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === fresh.id ? { ...i, ...fresh } : i)),
      })),
    );
  };

  // Añadir = reemplazar el set manual completo (existentes + nuevo), luego recargar.
  const addItem = async (section: string) => {
    const food = (drafts[section] ?? "").trim();
    if (!food) return;
    const manuals = (sections ?? []).flatMap((s) =>
      s.items
        .filter((i) => i.source === "manual")
        .map((i) => ({
          food: i.food,
          quantity: i.quantity,
          unit: i.unit,
          checked: i.checked ?? false,
          section: s.section,
        })),
    );
    const res = await apiFetchRaw(`/api/shopping-list/${isoWeek}/items`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [
          ...manuals,
          { food, quantity: null, unit: null, checked: false, section },
        ],
      }),
    }).catch(() => null);
    if (!res?.ok) return setError("No se pudo guardar el artículo.");
    setDrafts((d) => ({ ...d, [section]: "" }));
    reload();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex max-h-[75vh] flex-col gap-3 overflow-y-auto rounded-t-card border border-border bg-surface p-4 shadow-raised md:inset-y-0 md:left-auto md:w-96 md:rounded-none">
      <div className="flex items-center justify-between">
        <h2 className="text-title font-bold">Lista de la compra</h2>
        <button
          aria-label="Cerrar lista"
          className="min-h-11 px-3 text-text-secondary"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {error ? (
        <Card role="alert" className="border-error/40 text-error">
          <p>{error}</p>
          <Button
            variant="secondary"
            className="mt-2"
            onClick={() => setAttempt((a) => a + 1)}
          >
            Reintentar
          </Button>
        </Card>
      ) : null}

      {sections === null && !error ? (
        <p className="text-text-secondary">Cargando…</p>
      ) : null}

      {sections?.map((s) => (
        <section key={s.section} className="flex flex-col gap-1">
          <h3 className="font-semibold uppercase tracking-wide text-text-secondary">
            {s.section}
          </h3>
          {s.items.map((item, idx) => (
            <div
              key={`${item.source}-${item.id ?? idx}`}
              className="flex min-h-11 items-center gap-2"
            >
              {item.source === "manual" ? (
                <input
                  type="checkbox"
                  aria-label={item.food}
                  checked={Boolean(item.checked)}
                  onChange={() => void toggle(item)}
                  className="size-5"
                />
              ) : null}
              <span className={item.checked ? "text-done line-through" : ""}>
                {qtyLabel(item)}
              </span>
            </div>
          ))}
          <input
            type="text"
            aria-label={`Añadir artículo en ${s.section}`}
            placeholder="+ añadir artículo"
            value={drafts[s.section] ?? ""}
            onChange={(e) =>
              setDrafts((d) => ({ ...d, [s.section]: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") void addItem(s.section);
            }}
            className="min-h-11 rounded-control border border-dashed border-border px-2 text-caption"
          />
        </section>
      ))}
    </div>
  );
}
