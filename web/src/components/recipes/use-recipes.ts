// E2 D1: one hook owns all recipe data access against same-origin /api/recipes.
// GET list returns fully hydrated recipes, so detail reads from `list`.
import { useCallback, useEffect, useState } from "react";
import { apiFetchRaw, apiGetCached } from "../../lib/api";

export type Ingredient = {
  id: number;
  food: string;
  quantity: number | null;
  unit: string | null;
  /** Alimento del catálogo: con él, el ingrediente cuenta en los macros. */
  foodId: number | null;
  /** Lo opcional no cuenta en los macros. */
  optional: boolean;
};
export type Step = { id: number; position: number; step: number; text: string };

/** Macros por ración que calcula la API al leer la receta. */
export type Nutrition = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  /** Algún ingrediente con cantidad no se pudo contar. */
  approximate: boolean;
};

export type Recipe = {
  id: number;
  name: string;
  description: string | null;
  servings: number | null;
  photo_path: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  materials: string[];
  tags: string[];
  nutrition: Nutrition;
};

/** What the API accepts on POST/PUT (children without ids; PUT replaces them
 *  wholesale). Mirrors api/src/api-validation.ts recipeSchema. */
export type RecipeInput = {
  name: string;
  description?: string | null;
  servings?: number | null;
  photo_path?: string | null;
  ingredients?: {
    food: string;
    quantity?: number | null;
    unit?: string | null;
    foodId?: number | null;
    optional?: boolean;
  }[];
  steps?: string[];
  materials?: string[];
  tags?: string[];
};

export type FieldError = { field: string; message: string };

const jsonHeaders = { "content-type": "application/json" };

/** GET list "returns fully hydrated recipes" — enforce the contract so a recipe
 *  missing an array field (ingredients/steps/materials/tags) degrades to empty
 *  instead of crashing the detail render. */
const normalizeRecipe = (r: Recipe): Recipe => ({
  ...r,
  ingredients: r.ingredients ?? [],
  steps: r.steps ?? [],
  materials: r.materials ?? [],
  tags: r.tags ?? [],
});

export function useRecipes() {
  const [list, setList] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    apiGetCached<Recipe[]>("/api/recipes")
      .then((data) => alive && setList(data.map(normalizeRecipe)))
      .catch(() => alive && setError("No se pudo cargar el recetario."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  /** Run a mutation; return true on success. false leaves error/fieldError set. */
  const mutate = useCallback(
    async (run: () => Promise<Response>): Promise<boolean> => {
      setSaving(true);
      setFieldError(null);
      try {
        const res = await run();
        if (res.ok) {
          refresh();
          return true;
        }
        const body = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const message =
          typeof body.error === "string" ? body.error : "No se pudo guardar.";
        if (typeof body.field === "string")
          setFieldError({ field: body.field, message });
        else setError(message);
        return false;
      } catch {
        setError("No se pudo conectar con el servidor.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [refresh],
  );

  return {
    list,
    loading,
    saving,
    error,
    fieldError,
    retry: refresh,
    clearFieldError: () => setFieldError(null),
    create: (input: RecipeInput) =>
      mutate(() =>
        apiFetchRaw("/api/recipes", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(input),
        }),
      ),
    update: (id: number, input: RecipeInput) =>
      mutate(() =>
        apiFetchRaw(`/api/recipes/${id}`, {
          method: "PUT",
          headers: jsonHeaders,
          body: JSON.stringify(input),
        }),
      ),
    remove: (id: number) =>
      mutate(() => apiFetchRaw(`/api/recipes/${id}`, { method: "DELETE" })),
  };
}

export type RecipesApi = ReturnType<typeof useRecipes>;
