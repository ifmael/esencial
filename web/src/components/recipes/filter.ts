// E2 D3: búsqueda en cliente — nombre o etiqueta, subcadena, sin mayúsculas ni
// tildes. La cifra que anuncia cada pantalla sale de aquí (`length` de lo que
// pinta), nunca de una copia del predicado.
import { fold } from "../../lib/text";
import type { Recipe } from "./use-recipes";

/** Lo mínimo que la búsqueda necesita: vale tanto para `Recipe` como para la
 *  lista ligera del selector del plan (misma forma en nombre y etiquetas). */
export type SearchableRecipe = Pick<Recipe, "name" | "tags">;

export function filterRecipes<T extends SearchableRecipe>(
  list: T[],
  query: string,
): T[] {
  const q = fold(query.trim());
  if (!q) return list;
  return list.filter(
    (r) => fold(r.name).includes(q) || r.tags.some((t) => fold(t).includes(q)),
  );
}
