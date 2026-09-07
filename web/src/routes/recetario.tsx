// E2 libro (pantalla-5) + detalle (pantalla-2). El libro vive en /recetario;
// /plan-recetas queda para la rejilla semanal de E3 (tab del shell intacto).
// El flash de "receta eliminada" cruza la navegación en un módulo-único porque
// el detalle y el libro son rutas distintas sin estado compartido.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { filterRecipes } from "../components/recipes/filter";
import { RecipeEditor } from "../components/recipes/recipe-editor";
import { type Recipe, useRecipes } from "../components/recipes/use-recipes";

let flashMessage: string | null = null;
const setFlash = (m: string) => (flashMessage = m);
const takeFlash = () => {
  const m = flashMessage;
  flashMessage = null;
  return m;
};
export function Thumb({ recipe, big }: { recipe: Recipe; big?: boolean }) {
  const box = big
    ? "h-20 w-20 shrink-0 rounded-lg md:h-40 md:w-full"
    : "h-20 w-20 shrink-0 rounded-lg";
  return recipe.photo_path ? (
    <img src={recipe.photo_path} alt="" className={`${box} object-cover`} />
  ) : (
    <div
      aria-hidden
      className={`${box} flex items-center justify-center bg-surface-muted text-xs text-text-secondary`}
    >
      Sin foto
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      to={`/recetario/${recipe.id}`}
      className="card flex items-center gap-4 md:flex-col md:items-stretch"
    >
      <Thumb recipe={recipe} big />
      <div className="min-w-0">
        <div className="truncate font-semibold">{recipe.name}</div>
        <ul className="mt-1 flex flex-wrap gap-1">
          {recipe.tags.map((t) => (
            <li key={t} className="badge-done">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </Link>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="card text-error" role="alert">
      <p>{message}</p>
      <button type="button" className="btn-secondary mt-2" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

export function RecetarioPage() {
  const api = useRecipes();
  const [query, setQuery] = useState("");
  const [flash] = useState(takeFlash);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [creating, setCreating] = useState(false);
  const visible = filterRecipes(api.list, query);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Recetario</h1>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setCreating(true)}
        >
          + Nueva receta
        </button>
      </header>
      <input
        aria-label="Buscar recetas"
        type="search"
        placeholder="Buscar por nombre o etiqueta…"
        className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {flash && (
        <div
          className="mb-4 rounded-lg bg-done-bg p-3 text-done-text"
          role="status"
        >
          {flash}
        </div>
      )}

      {api.loading ? (
        <div className="card bg-pending-bg text-pending-text" role="status">
          Cargando recetario…
        </div>
      ) : api.error ? (
        <ErrorBanner message={api.error} onRetry={api.retry} />
      ) : api.list.length === 0 ? (
        <div className="card text-text-secondary">
          Aún no hay recetas. ¡Crea la primera!
        </div>
      ) : visible.length === 0 ? (
        <div className="card text-text-secondary">
          Ninguna receta coincide con la búsqueda.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {visible.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <RecipeEditor
          api={api}
          recipe={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

export function RecetarioDetallePage() {
  const { id } = useParams();
  const api = useRecipes();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (api.loading)
    return (
      <div className="card bg-pending-bg text-pending-text" role="status">
        Cargando recetario…
      </div>
    );
  if (api.error) return <ErrorBanner message={api.error} onRetry={api.retry} />;

  const recipe = api.list.find((r) => String(r.id) === id);
  if (!recipe)
    return (
      <div className="card">
        <h1 className="mb-2 text-2xl font-bold">Receta no encontrada</h1>
        <Link to="/recetario" className="btn-secondary">
          Volver al recetario
        </Link>
      </div>
    );

  const remove = async () => {
    if (await api.remove(recipe.id)) {
      setFlash("Receta eliminada");
      navigate("/recetario");
    }
    setConfirming(false);
  };

  return (
    <>
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{recipe.name}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Editar receta"
            className="btn-secondary"
            onClick={() => setEditing(true)}
          >
            ✏️
          </button>
          <button
            type="button"
            className="btn-secondary text-error"
            onClick={() => setConfirming(true)}
          >
            Eliminar
          </button>
        </div>
      </header>

      {confirming && (
        <div
          className="card mb-4 border-error"
          role="alertdialog"
          aria-label="Confirmar eliminación"
        >
          <p className="mb-2">¿Seguro que quieres eliminar «{recipe.name}»?</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary bg-error"
              disabled={api.saving}
              onClick={remove}
            >
              {api.saving ? "Eliminando…" : "Eliminar receta"}
            </button>
          </div>
        </div>
      )}

      <Thumb recipe={recipe} big />
      {recipe.description && (
        <p className="mt-4 text-text-secondary">{recipe.description}</p>
      )}
      {recipe.servings !== null && (
        <p className="mt-2 font-medium">{recipe.servings} comensales</p>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Ingredientes</h2>
        <ul className="card flex flex-col gap-1">
          {recipe.ingredients.map((ing) => (
            <li key={ing.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`ing-${ing.id}`}
                className="h-4 w-4 accent-primary"
              />
              <label htmlFor={`ing-${ing.id}`}>
                {ing.quantity !== null && `${ing.quantity} `}
                {ing.unit && `${ing.unit} `}
                {ing.food}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Pasos</h2>
        <ol className="card flex flex-col gap-2">
          {recipe.steps.map((s) => (
            <li key={s.id} aria-label={`paso ${s.step}`}>
              {s.step}. {s.text}
            </li>
          ))}
        </ol>
      </section>

      {recipe.materials.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">Materiales</h2>
          <ul className="flex flex-wrap gap-2">
            {recipe.materials.map((m) => (
              <li
                key={m}
                className="rounded-full bg-surface-muted px-3 py-1 text-sm"
              >
                {m}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recipe.tags.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2">
          {recipe.tags.map((t) => (
            <li key={t} className="badge-done">
              {t}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RecipeEditor
          api={api}
          recipe={recipe}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
