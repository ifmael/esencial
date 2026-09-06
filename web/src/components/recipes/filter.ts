// E2 D3: client-side search — name substring (case-insensitive) or tag match.
import type { Recipe } from "./use-recipes";

export function filterRecipes(list: Recipe[], query: string): Recipe[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.tags.some((t) => t.toLowerCase().includes(q)),
  );
}
