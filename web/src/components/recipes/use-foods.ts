// Catálogo de alimentos (/api/foods) para enlazar ingredientes y contar sus
// macros. Unos cientos de filas: se carga entero y el editor filtra en local.
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "../../lib/api";

/** Valores por 100 g (o 100 ml); gramsPerUnit convierte «ud» a gramos. */
export type Food = {
  id: number;
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  gramsPerUnit: number | null;
};

export type FoodInput = Omit<Food, "id">;

export function useFoods() {
  const [foods, setFoods] = useState<Food[]>([]);

  useEffect(() => {
    let alive = true;
    // Sin catálogo el editor sigue funcionando: solo no sugiere ni enlaza.
    apiGet<Food[]>("/api/foods")
      .then((list) => alive && setFoods(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /** POST /api/foods; lanza ApiError (field «name» si ya existe). */
  const create = useCallback(async (input: FoodInput): Promise<Food> => {
    const food = await apiSend<Food>("/api/foods", "POST", input);
    setFoods((list) =>
      [...list, food].sort((a, b) => a.name.localeCompare(b.name, "es")),
    );
    return food;
  }, []);

  return { foods, create };
}
