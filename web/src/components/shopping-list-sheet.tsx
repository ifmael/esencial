// E3: hoja "Lista de la compra". El servidor compone GET /api/shopping-list/:week
// (líneas de receta derivadas del plan + manuales persistidos). Las recetas no se
// marcan; los manuales se checkboxean con PATCH y se añaden/quitan con PUT del
// set completo (quitar ofrece «Deshacer», que vuelve a mandar el set anterior).
//
// Hoja M3 modal (velo + asa en móvil); desde `md` el velo no existe y queda
// como panel lateral junto a la rejilla, así que no hace falta `modal={false}`.
import { useCallback, useEffect, useState } from "react";
import { apiFetchRaw } from "../lib/api";
import {
  type ListItem,
  type ListSection,
  type ManualItem,
  manualSet,
} from "../lib/shopping-list";
import { EmptyState, Loader } from "./expressive";
import { DeleteIcon, UtensilsIcon } from "./icons";
import { OverlayHeader, Sheet, useSnackbar } from "./overlay";
import { Alert, Button, Checkbox, cx, Input } from "./ui";

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
  const snackbar = useSnackbar();

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

  // Reemplaza el set manual completo y recarga; false si el servidor lo rechaza.
  const putManuals = async (
    items: ManualItem[],
    failure: string,
  ): Promise<boolean> => {
    const res = await apiFetchRaw(`/api/shopping-list/${isoWeek}/items`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(failure);
      return false;
    }
    reload();
    return true;
  };

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

  const addItem = async (section: string) => {
    const food = (drafts[section] ?? "").trim();
    if (!food) return;
    if (
      await putManuals(
        manualSet(sections ?? [], { add: { food, section } }),
        "No se pudo guardar el artículo.",
      )
    ) {
      setDrafts((d) => ({ ...d, [section]: "" }));
    }
  };

  const removeItem = async (item: ListItem) => {
    if (item.id === null) return;
    const before = manualSet(sections ?? []);
    if (
      !(await putManuals(
        manualSet(sections ?? [], { drop: item.id }),
        "No se pudo quitar el artículo.",
      ))
    )
      return;
    snackbar({
      message: `${item.food} quitado`,
      onUndo: () =>
        void putManuals(before, "No se pudo recuperar el artículo."),
    });
  };

  return (
    <Sheet label="Lista de la compra" onClose={onClose}>
      <OverlayHeader
        title="Lista de la compra"
        onClose={onClose}
        closeLabel="Cerrar lista"
      />
      <div className="stagger flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-2 pb-8 md:px-6">
        {error ? (
          <Alert>
            <p>{error}</p>
            <Button variant="outlined" onClick={() => setAttempt((a) => a + 1)}>
              Reintentar
            </Button>
          </Alert>
        ) : null}

        {sections === null && !error ? (
          <Loader label="Cargando lista…" />
        ) : null}

        {sections?.length === 0 ? (
          <EmptyState
            title="Lista vacía"
            shapes={["flower", "pill", "cookie-4"]}
          >
            <p className="text-body-m text-on-surface-variant">
              Planifica recetas en la semana y sus ingredientes aparecerán aquí.
            </p>
          </EmptyState>
        ) : null}

        {sections?.map((s, si) => (
          <section
            key={s.section}
            className="flex flex-col gap-1"
            style={{ ["--i" as string]: si }}
          >
            <h3 className="section-label px-2 pb-1">{s.section}</h3>
            <ul className="flex flex-col overflow-hidden rounded-l bg-surface-container">
              {s.items.map((item, idx) => (
                <li
                  key={`${item.source}-${item.id ?? idx}`}
                  className="list-row min-h-12 gap-0 pr-1"
                >
                  {item.source === "manual" ? (
                    <>
                      <Checkbox
                        aria-label={item.food}
                        checked={Boolean(item.checked)}
                        onChange={() => void toggle(item)}
                      />
                      <span
                        className={cx(
                          "min-w-0 flex-1 py-3 text-body-l transition-colors motion-effects",
                          item.checked
                            ? "text-on-surface-variant line-through"
                            : "text-on-surface",
                        )}
                      >
                        {qtyLabel(item)}
                      </span>
                      <Button
                        variant="text"
                        size="icon"
                        aria-label={`Quitar ${item.food}`}
                        className="text-on-surface-variant"
                        onClick={() => void removeItem(item)}
                      >
                        <DeleteIcon />
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* Misma columna que la casilla: las líneas de receta se leen alineadas. */}
                      <span
                        className="grid size-12 shrink-0 place-items-center text-accent"
                        title="De una receta del plan"
                      >
                        <UtensilsIcon width={20} height={20} />
                      </span>
                      <span className="min-w-0 flex-1 py-3 pr-3 text-body-l text-on-surface">
                        {qtyLabel(item)}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <Input
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
              className="mt-1 rounded-m"
            />
          </section>
        ))}
      </div>
    </Sheet>
  );
}
