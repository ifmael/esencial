// E3: rejilla semanal 7×3 (Lunes→Domingo × desayuno/almuerzo/cena) para la
// semana ISO de ?week=, picker de recetas, y acceso a la lista de la compra.
// Diseño D6: sin optimismo — todo cambio se persiste con PUT semanal completo
// y el estado local se reemplaza con la respuesta del servidor.
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Loader, Monogram } from "../components/expressive";
import { AddIcon, CartIcon, CloseIcon } from "../components/icons";
import { Dialog, OverlayHeader, useTooltip } from "../components/overlay";
import { filterRecipes } from "../components/recipes/filter";
import type { Nutrition } from "../components/recipes/use-recipes";
import { ShoppingListSheet } from "../components/shopping-list-sheet";
import { Button, ripple, SearchBar } from "../components/ui";
import { WeekGrid } from "../components/week-grid";
import { apiFetchRaw, apiGetCached, photoSrc } from "../lib/api";
import { currentIsoWeek, shiftIsoWeek } from "../lib/iso-week";

export const MEALS = ["desayuno", "almuerzo", "cena"] as const;

export type Slot = {
  day: number;
  meal: string;
  recipeId: number | null;
  recipeName: string | null;
  recipePhoto: string | null;
};
export type RecipeSummary = {
  id: number;
  name: string;
  photo: string | null;
  tags: string[];
};

const slotKey = (day: number, meal: string) => `${day}|${meal}`;

/** Totales por día de la semana (0 = lunes); null en los días sin recetas. */
type DayTotals = (Nutrition | null)[];

/** Total del día al pie de su columna: kcal y, en pequeño, los macros. */
function DayTotal({ n }: { n: Nutrition }) {
  const macros = `${n.protein} g de proteínas, ${n.fat} g de grasas y ${n.carbs} g de carbohidratos`;
  return (
    <p className="mt-auto flex flex-col rounded-m bg-surface-container-low px-2 py-1 tabular">
      <span className="sr-only">
        {n.approximate ? "Total aproximado del día" : "Total del día"}: {n.kcal}{" "}
        kcal, {macros}
      </span>
      <span aria-hidden="true" className="text-title-s">
        {n.approximate ? "≈ " : ""}
        {n.kcal} kcal
      </span>
      <span aria-hidden="true" className="text-label-s text-on-surface-variant">
        P {n.protein} · G {n.fat} · C {n.carbs}
      </span>
    </p>
  );
}

/** GET/PUT de la semana completa; PUT fallido recarga el estado del servidor. */
export function useMealPlan(isoWeek: string) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [totals, setTotals] = useState<DayTotals>([]);
  // Semana a la que pertenecen `slots` (al navegar, las de la anterior siguen
  // pintadas hasta que llega la nueva: la rejilla espera con `busy`).
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiFetchRaw(`/api/meal-plan/${isoWeek}`)
      .then(async (res) => {
        const data: { slots: Slot[]; totals?: DayTotals; error?: string } =
          await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error");
        if (!cancelled) {
          setSlots(data.slots);
          setTotals(data.totals ?? []);
          setLoadedWeek(isoWeek);
        }
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
      const data: { slots: Slot[]; totals?: DayTotals } = await res.json();
      setSlots(data.slots);
      setTotals(data.totals ?? []);
      setError(null);
      return true;
    },
    [isoWeek],
  );

  return {
    slots,
    totals,
    busy: loadedWeek !== isoWeek && !error,
    error,
    save,
    retry: () => setAttempt((a) => a + 1),
  };
}

/** Miniatura de receta: su foto o, sin ella, el monograma M3E de su nombre. */
function RecipeThumb({
  name,
  photo,
  size,
}: {
  name: string;
  photo: string | null;
  size: number;
}) {
  return photo ? (
    <img
      crossOrigin="use-credentials"
      loading="lazy"
      decoding="async"
      src={photoSrc(photo)}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-s object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <Monogram name={name} size={size} />
  );
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
    apiGetCached<
      {
        id: number;
        name: string;
        photo_path?: string | null;
        tags?: string[];
      }[]
    >("/api/recipes")
      .then((all) => {
        // El backend devuelve recetas completas; solo se necesita id, nombre,
        // foto y etiquetas (las etiquetas las mira `filterRecipes`).
        setRecipes(
          all.map((r) => ({
            id: r.id,
            name: r.name,
            photo: r.photo_path ?? null,
            tags: r.tags ?? [],
          })),
        );
      })
      .catch(() => setRecipes([]));
  }, []);

  const shown = recipes ? filterRecipes(recipes, query) : [];

  // A pantalla completa en móvil: la búsqueda convive con el teclado.
  return (
    <Dialog
      onClose={onClose}
      label="Elegir receta"
      className="md:max-h-[80vh] md:max-w-md"
    >
      <OverlayHeader title="Elegir receta" onClose={onClose} />
      <SearchBar
        tone="high"
        className="mx-4 md:mx-6"
        autoFocus
        placeholder="Buscar por nombre o etiqueta…"
        aria-label="Buscar receta"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {recipes !== null && recipes.length > 0 && (
        <p
          aria-live="polite"
          className="mx-4 px-2 py-1 tabular text-body-m text-on-surface-variant md:mx-6"
        >
          {shown.length === recipes.length
            ? recipes.length === 1
              ? "1 receta"
              : `${recipes.length} recetas`
            : `${shown.length} de ${recipes.length}`}
        </p>
      )}
      <ul className="stagger flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 pb-4 md:px-4">
        {recipes === null ? (
          <li>
            <Loader label="Cargando recetas…" className="mx-auto my-6" />
          </li>
        ) : null}
        {shown.map((r, i) => (
          <li key={r.id} style={{ ["--i" as string]: i }}>
            <button
              type="button"
              onPointerDown={ripple}
              className="state list-row min-h-12 w-full px-3 py-1 text-left text-on-surface"
              onClick={() => onPick(r)}
            >
              <RecipeThumb name={r.name} photo={r.photo} size={40} />
              <span className="min-w-0 flex-1 truncate text-title-m">
                {r.name}
              </span>
            </button>
          </li>
        ))}
        {recipes !== null && shown.length === 0 ? (
          <li className="px-4 py-6 text-center text-body-m text-on-surface-variant">
            Sin resultados.
          </li>
        ) : null}
      </ul>
    </Dialog>
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
  const name = slot?.recipeName ?? "Receta";
  // El nombre se recorta a dos líneas en la columna: el tooltip lo da entero.
  const { triggerProps, tooltip } = useTooltip(
    <>
      <RecipeThumb name={name} photo={slot?.recipePhoto ?? null} size={208} />
      <span className="px-1 text-title-s text-e">{name}</span>
    </>,
  );
  if (!slot?.recipeId) {
    return (
      <Button
        variant="text"
        aria-label="+ añadir"
        onClick={onAdd}
        className="w-full justify-start px-3"
      >
        <AddIcon width={20} height={20} />
        añadir
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-m bg-surface-container-high p-1">
      <div className="flex items-center">
        <Link
          to={`/recetario/${slot.recipeId}`}
          onPointerDown={ripple}
          {...triggerProps}
          className="state flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-s p-1 text-on-surface"
        >
          <RecipeThumb name={name} photo={slot.recipePhoto} size={32} />
          <span className="line-clamp-2 min-w-0 text-title-s text-e">
            {name}
          </span>
        </Link>
        {tooltip}
        {/* 40 px: fila densa dentro de una columna estrecha (guía de migración). */}
        <Button
          variant="text"
          size="icon-sm"
          aria-label={`Quitar ${name}`}
          onClick={() => setConfirming((c) => !c)}
          className="text-on-surface-variant"
        >
          <CloseIcon width={20} height={20} />
        </Button>
      </div>
      {confirming ? (
        <Button
          variant="danger"
          size="sm"
          className="animate-pop"
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
  const { slots, totals, busy, error, save, retry } = useMealPlan(isoWeek);
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <WeekGrid
        isoWeek={isoWeek}
        loading={slots === null && !error}
        busy={busy}
        error={error}
        onRetry={retry}
        onShiftWeek={(d) => gotoWeek(shiftIsoWeek(isoWeek, d))}
        aside={
          <Button variant="tonal" onClick={() => setSheetOpen(true)}>
            <CartIcon width={20} height={20} />
            Lista de la compra
          </Button>
        }
      >
        {({ index }) => {
          const total = totals[index];
          return (
            <>
              {MEALS.map((meal) => (
                <div key={meal} className="flex flex-col gap-1">
                  <span className="section-label px-1">{meal}</span>
                  <SlotCell
                    slot={bySlot.get(slotKey(index, meal))}
                    onAdd={() => setPicker({ day: index, meal })}
                    onRemove={() => write(index, meal, null)}
                  />
                </div>
              ))}
              {total && <DayTotal n={total} />}
            </>
          );
        }}
      </WeekGrid>

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
