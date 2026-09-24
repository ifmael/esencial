// E2 libro (pantalla-5) + detalle (pantalla-2). El libro vive en /recetario;
// /plan-recetas queda para la rejilla semanal de E3 (tab del shell intacto).
// El flash de "receta eliminada" cruza la navegación en un módulo-único porque
// el detalle y el libro son rutas distintas sin estado compartido.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { filterRecipes } from "../components/recipes/filter";
import { RecipeEditor } from "../components/recipes/recipe-editor";
import { type Recipe, useRecipes } from "../components/recipes/use-recipes";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  cardClass,
  Input,
} from "../components/ui";
import { photoSrc } from "../lib/api";

let flashMessage: string | null = null;
const setFlash = (m: string) => (flashMessage = m);
const takeFlash = () => {
  const m = flashMessage;
  flashMessage = null;
  return m;
};
export function Thumb({ recipe, big }: { recipe: Recipe; big?: boolean }) {
  const box = big
    ? "h-20 w-20 shrink-0 rounded-control md:h-40 md:w-full"
    : "h-20 w-20 shrink-0 rounded-control";
  return recipe.photo_path ? (
    <img
      src={photoSrc(recipe.photo_path)}
      alt=""
      className={`${box} object-cover`}
    />
  ) : (
    <div
      aria-hidden
      className={`${box} flex items-center justify-center bg-surface-muted text-caption text-text-secondary`}
    >
      Sin foto
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      to={`/recetario/${recipe.id}`}
      className={cardClass(
        "flex items-center gap-4 md:flex-col md:items-stretch",
      )}
    >
      <Thumb recipe={recipe} big />
      <div className="min-w-0">
        <div className="truncate font-semibold">{recipe.name}</div>
        <ul className="mt-1 flex flex-wrap gap-1">
          {recipe.tags.map((t) => (
            <li key={t}>
              <Badge tone="done">{t}</Badge>
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
    <Card className="text-error" role="alert">
      <p>{message}</p>
      <Button variant="secondary" className="mt-2" onClick={onRetry}>
        Reintentar
      </Button>
    </Card>
  );
}

export function RecetarioPage() {
  const api = useRecipes();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [flash] = useState(takeFlash);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const visible = filterRecipes(api.list, query);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display font-bold">Recetario</h1>
        <Button onClick={() => navigate("/recetario/nueva")}>
          + Nueva receta
        </Button>
      </header>
      <Input
        aria-label="Buscar recetas"
        type="search"
        placeholder="Buscar por nombre o etiqueta…"
        className="mb-4 w-full"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {flash && (
        <div
          className="mb-4 rounded-control bg-done-bg p-3 text-done-text"
          role="status"
        >
          {flash}
        </div>
      )}

      {api.loading ? (
        <Card className="bg-pending-bg text-pending-text" role="status">
          Cargando recetario…
        </Card>
      ) : api.error ? (
        <ErrorBanner message={api.error} onRetry={api.retry} />
      ) : api.list.length === 0 ? (
        <Card className="text-text-secondary">
          Aún no hay recetas. ¡Crea la primera!
        </Card>
      ) : visible.length === 0 ? (
        <Card className="text-text-secondary">
          Ninguna receta coincide con la búsqueda.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {visible.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}

      {editing && (
        <RecipeEditor
          api={api}
          recipe={editing}
          onClose={() => setEditing(null)}
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
      <Card className="bg-pending-bg text-pending-text" role="status">
        Cargando recetario…
      </Card>
    );
  if (api.error) return <ErrorBanner message={api.error} onRetry={api.retry} />;

  const recipe = api.list.find((r) => String(r.id) === id);
  if (!recipe)
    return (
      <Card>
        <h1 className="mb-2 text-display font-bold">Receta no encontrada</h1>
        <Link to="/recetario" className={buttonClass({ variant: "secondary" })}>
          Volver al recetario
        </Link>
      </Card>
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
      <Link
        to="/recetario"
        aria-label="Volver al recetario"
        className={buttonClass({
          variant: "secondary",
          size: "icon",
          className: "mb-3",
        })}
      >
        ←
      </Link>

      <div className="relative overflow-hidden rounded-panel">
        {recipe.photo_path ? (
          <img
            src={photoSrc(recipe.photo_path)}
            alt=""
            className="h-56 w-full object-cover md:h-72"
          />
        ) : (
          <div className="flex h-56 items-center justify-center bg-surface-muted text-text-secondary md:h-72">
            Sin foto
          </div>
        )}
        <Button
          variant="secondary"
          size="icon"
          aria-label="Editar receta"
          className="absolute right-3 top-3 bg-surface/90"
          onClick={() => setEditing(true)}
        >
          ✏️
        </Button>
        {/* Un solo <h1>: superpuesto a la foto en móvil, bajo ella en desktop. */}
        <h1 className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-scrim to-transparent p-4 text-display font-bold text-on-scrim md:static md:mt-4 md:bg-none md:p-0 md:text-text">
          {recipe.name}
        </h1>
      </div>

      {recipe.description && (
        <p className="mt-4 text-text-secondary">{recipe.description}</p>
      )}
      {recipe.servings !== null && (
        <p className="mt-2 font-medium">{recipe.servings} comensales</p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-2 text-lead font-semibold">Ingredientes</h2>
            <ul className={cardClass("flex flex-col gap-1")}>
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

          {recipe.materials.length > 0 && (
            <section>
              <h2 className="mb-2 text-lead font-semibold">Materiales</h2>
              <ul className="flex flex-wrap gap-2">
                {recipe.materials.map((m) => (
                  <li
                    key={m}
                    className="rounded-chip bg-surface-muted px-3 py-1 text-caption"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section>
          <h2 className="mb-2 text-lead font-semibold">Elaboración</h2>
          <ol className={cardClass("flex flex-col gap-2")}>
            {recipe.steps.map((s) => (
              <li key={s.id} aria-label={`paso ${s.step}`}>
                {s.step}. {s.text}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {recipe.tags.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2">
          {recipe.tags.map((t) => (
            <li key={t}>
              <Badge tone="done">{t}</Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 border-t border-border pt-4">
        <Button
          variant="secondary"
          className="text-error"
          onClick={() => setConfirming(true)}
        >
          Eliminar
        </Button>
        {confirming && (
          <Card
            className="mt-3 border-error"
            role="alertdialog"
            aria-label="Confirmar eliminación"
          >
            <p className="mb-2">
              ¿Seguro que quieres eliminar «{recipe.name}»?
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button variant="danger" disabled={api.saving} onClick={remove}>
                {api.saving ? "Eliminando…" : "Eliminar receta"}
              </Button>
            </div>
          </Card>
        )}
      </div>

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
