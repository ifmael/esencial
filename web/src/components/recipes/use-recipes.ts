// E2 D1: one hook owns all recipe data access against same-origin /api/recipes.
// GET list returns fully hydrated recipes, so detail reads from `list`.
import { useCallback, useEffect, useState } from "react";

export type Ingredient = { id: number; food: string; quantity: number | null; unit: string | null };
export type Step = { id: number; position: number; step: number; text: string };

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
};

/** What the API accepts on POST/PUT (children without ids; PUT replaces them
 *  wholesale). Mirrors api/src/api-validation.ts recipeSchema. */
export type RecipeInput = {
  name: string;
  description?: string | null;
  servings?: number | null;
  photo_path?: string | null;
  ingredients?: { food: string; quantity?: number | null; unit?: string | null }[];
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
    fetch("/api/recipes")
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET /api/recipes ${res.status}`);
        return (await res.json()) as Recipe[];
      })
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
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const message = typeof body.error === "string" ? body.error : "No se pudo guardar.";
        if (typeof body.field === "string") setFieldError({ field: body.field, message });
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
      mutate(() => fetch("/api/recipes", { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) })),
    update: (id: number, input: RecipeInput) =>
      mutate(() =>
        fetch(`/api/recipes/${id}`, { method: "PUT", headers: jsonHeaders, body: JSON.stringify(input) }),
      ),
    remove: (id: number) => mutate(() => fetch(`/api/recipes/${id}`, { method: "DELETE" })),
  };
}

export type RecipesApi = ReturnType<typeof useRecipes>;
