// E3: rejilla semanal 7×3 (Lunes→Domingo × desayuno/almuerzo/cena) para la
// semana ISO de ?week=, picker de recetas, y acceso a la lista de la compra.
// Diseño D6: sin optimismo — todo cambio se persiste con PUT semanal completo
// y el estado local se reemplaza con la respuesta del servidor.
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ShoppingListSheet } from "../components/shopping-list-sheet";
import { Button, buttonClass, Card, cardClass } from "../components/ui";
import { apiFetchRaw, photoSrc } from "../lib/api";
import { currentIsoWeek, shiftIsoWeek } from "../lib/iso-week";

export const DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;
export const MEALS = ["desayuno", "almuerzo", "cena"] as const;

export type Slot = {
  day: number;
  meal: string;
  recipeId: number | null;
  recipeName: string | null;
  recipePhoto: string | null;
};
export type RecipeSummary = { id: number; name: string };

const slotKey = (day: number, meal: string) => `${day}|${meal}`;

/** GET/PUT de la semana completa; PUT fallido recarga el estado del servidor. */
export function useMealPlan(isoWeek: string) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiFetchRaw(`/api/meal-plan/${isoWeek}`)
      .then(async (res) => {
        const data: { slots: Slot[]; error?: string } = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error");
        if (!cancelled) setSlots(data.slots);
      })
      .catch(() => {
        if (!cancelled) {
          setSlots(null);
          setError("No se pudo cargar el plan semanal.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isoWeek, attempt]);

  const save = useCallback(
    async (next: Slot[]): Promise<boolean> => {
      const res = await apiFetchRaw(`/api/meal-plan/${isoWeek}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slots: next.map((s) => ({
            day: s.day,
            meal: s.meal,
            recipeId: s.recipeId,
          })),
        }),
      }).catch(() => null);
      if (!res?.ok) {
        const err: { error?: string } = res
          ? await res.json().catch(() => ({}))
          : {};
        setError(
          err.error
            ? `No se pudo guardar: ${err.error}`
            : "No se pudo guardar el plan.",
        );
        setAttempt((a) => a + 1); // recarga server state: la rejilla refleja la verdad
        return false;
      }
      const data: { slots: Slot[] } = await res.json();
      setSlots(data.slots);
      setError(null);
      return true;
    },
    [isoWeek],
  );

  return { slots, error, save, retry: () => setAttempt((a) => a + 1) };
}

function RecipePicker({
  onPick,
  onClose,
}: {
  onPick: (r: RecipeSummary) => void;
  onClose: () => void;
}) {
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    apiFetchRaw("/api/recipes")
      .then(async (res) => {
        const all: RecipeSummary[] = await res.json();
        // El backend devuelve recetas completas; solo se necesita id + nombre.
        setRecipes(all.map((r) => ({ id: r.id, name: r.name })));
      })
      .catch(() => setRecipes([]));
  }, []);

  const needle = query.trim().toLowerCase();
  const shown = recipes
    ? needle
      ? recipes.filter((r) => r.name.toLowerCase().includes(needle))
      : recipes
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center"
      onClick={onClose}
    >
      <Card
        role="dialog"
        aria-label="Elegir receta"
        className="flex max-h-[80vh] w-full max-w-md flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          autoFocus
          placeholder="Buscar receta…"
          aria-label="Buscar receta"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 rounded-lg border border-border px-3"
        />
        <ul className="flex flex-col gap-1 overflow-y-auto">
          {recipes === null ? (
            <li className="text-text-secondary">Cargando…</li>
          ) : null}
          {shown.map((r) => (
            <li key={r.id}>
              <button
                className="min-h-11 w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-surface-muted"
                onClick={() => onPick(r)}
              >
                {r.name}
              </button>
            </li>
          ))}
          {recipes !== null && shown.length === 0 ? (
            <li className="px-3 text-text-secondary">Sin resultados.</li>
          ) : null}
        </ul>
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </Card>
    </div>
  );
}

function SlotCell({
  slot,
  onAdd,
  onRemove,
}: {
  slot: Slot | undefined;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!slot?.recipeId) {
    return (
      <button
        onClick={onAdd}
        className="flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border text-text-secondary hover:border-primary hover:text-primary"
      >
        <span className="text-sm">+ añadir</span>
      </button>
    );
  }
  return (
    <div className="flex min-h-11 flex-1 flex-col gap-1 rounded-lg border border-border bg-surface p-2">
      <div className="flex items-center gap-2">
        {slot.recipePhoto ? (
          <img
            src={photoSrc(slot.recipePhoto)}
            alt=""
            className="size-8 shrink-0 rounded object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="size-8 shrink-0 rounded bg-surface-muted"
          />
        )}
        <Link
          to={`/recetario/${slot.recipeId}`}
          className="min-h-11 flex-1 truncate text-left text-sm font-semibold text-primary"
        >
          {slot.recipeName ?? "Receta"}
        </Link>
        <button
          aria-label={`Quitar ${slot.recipeName ?? "receta"}`}
          onClick={() => setConfirming(true)}
          className="min-h-11 px-2 text-text-secondary hover:text-error"
        >
          ✕
        </button>
      </div>
      {confirming ? (
        <Button
          className="bg-error min-h-11 text-xs"
          onClick={() => {
            setConfirming(false);
            onRemove();
          }}
        >
          Confirmar quitar
        </Button>
      ) : null}
    </div>
  );
}

export function PlanRecetasPage() {
  const [params, setParams] = useSearchParams();
  const isoWeek = params.get("week") ?? currentIsoWeek();
  const { slots, error, save, retry } = useMealPlan(isoWeek);
  const [picker, setPicker] = useState<{ day: number; meal: string } | null>(
    null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  const gotoWeek = (week: string) => setParams({ week });
  const bySlot = new Map(
    (slots ?? [])
      .filter((s) => s.recipeId !== null)
      .map((s) => [slotKey(s.day, s.meal), s]),
  );

  const write = (day: number, meal: string, recipeId: number | null) =>
    save([
      ...(slots ?? []).filter((s) => !(s.day === day && s.meal === meal)),
      ...(recipeId
        ? [{ day, meal, recipeId, recipeName: null, recipePhoto: null }]
        : []),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <header className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            aria-label="Semana anterior"
            onClick={() => gotoWeek(shiftIsoWeek(isoWeek, -1))}
          >
            ‹
          </Button>
          <h1 className="text-2xl font-bold">{isoWeek}</h1>
          <Button
            variant="secondary"
            aria-label="Semana siguiente"
            onClick={() => gotoWeek(shiftIsoWeek(isoWeek, 1))}
          >
            ›
          </Button>
        </header>
        <Link
          to="/recetario"
          className={buttonClass({
            variant: "secondary",
            className: "self-start",
          })}
        >
          Recetario
        </Link>
      </div>

      {error ? (
        <Card role="alert" className="border-error/40 text-error">
          <p>{error}</p>
          <Button variant="secondary" className="mt-2" onClick={retry}>
            Reintentar
          </Button>
        </Card>
      ) : null}

      {slots === null && !error ? (
        <Card className="text-text-secondary">Cargando…</Card>
      ) : (
        <div className="flex flex-col gap-3 md:grid md:grid-flow-col md:auto-cols-fr md:gap-2">
          {DAYS.map((day, di) => (
            <section key={day} className={cardClass("flex flex-col gap-2 p-3")}>
              <h2 className="font-semibold">{day}</h2>
              {MEALS.map((meal) => (
                <div key={meal} className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wide text-text-secondary">
                    {meal}
                  </span>
                  <SlotCell
                    slot={bySlot.get(slotKey(di, meal))}
                    onAdd={() => setPicker({ day: di, meal })}
                    onRemove={() => write(di, meal, null)}
                  />
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <Button
        className="sticky bottom-4 self-start md:self-end"
        onClick={() => setSheetOpen(true)}
      >
        Lista de la compra
      </Button>

      {picker ? (
        <RecipePicker
          onClose={() => setPicker(null)}
          onPick={(recipe) => {
            void write(picker.day, picker.meal, recipe.id).then(() =>
              setPicker(null),
            );
          }}
        />
      ) : null}

      <ShoppingListSheet
        isoWeek={isoWeek}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
