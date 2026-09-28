// E2 libro (pantalla-5) + detalle (pantalla-2). El libro vive en /recetario;
// /plan-recetas queda para la rejilla semanal de E3 (tab del shell intacto).
// La tarjeta y la cabecera del detalle comparten `view-transition-name`
// (`recipe-<id>`): al navegar, la tarjeta crece hasta la cabecera. El aviso de
// «Receta eliminada» va por el snackbar del shell, que sobrevive a la ruta.
import { type CSSProperties, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { EmptyState, Loader, Monogram, Shape } from "../components/expressive";
import { AddIcon, BackIcon, DeleteIcon, EditIcon } from "../components/icons";
import { Dialog, useSnackbar } from "../components/overlay";
import { filterRecipes } from "../components/recipes/filter";
import { RecipeEditor } from "../components/recipes/recipe-editor";
import { type Recipe, useRecipes } from "../components/recipes/use-recipes";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Checkbox,
  cardClass,
  cx,
  SearchBar,
} from "../components/ui";
import { photoSrc } from "../lib/api";
import { useRecipeColor } from "../lib/recipe-color";
import type { ShapeName } from "../lib/shapes";

const morph = (id: number): CSSProperties => ({
  viewTransitionName: `recipe-${id}`,
});

/** Foto de la receta o, sin ella, su monograma (forma estable por nombre). */
function Thumb({ recipe, hero }: { recipe: Recipe; hero?: boolean }) {
  const box = hero
    ? "absolute inset-0 size-full"
    : "aspect-square w-full rounded-m";
  return recipe.photo_path ? (
    <img
      crossOrigin="use-credentials"
      src={photoSrc(recipe.photo_path)}
      alt=""
      style={morph(recipe.id)}
      className={cx(box, "object-cover")}
    />
  ) : (
    <span
      aria-hidden="true"
      style={morph(recipe.id)}
      className={cx(
        box,
        "grid place-items-center bg-surface-container-high",
        hero && "items-start pt-6 md:items-center md:pt-0 md:pb-28",
      )}
    >
      <Monogram name={recipe.name} size={hero ? 160 : 88} />
      <span className="sr-only">Sin foto</span>
    </span>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <li key={t}>
          <Badge tone="accent">{t}</Badge>
        </li>
      ))}
    </ul>
  );
}

/** La primera receta: 2×2 en md+, foto a sangre con el título sobre velo. */
function HeroCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      to={`/recetario/${recipe.id}`}
      viewTransition
      className="state card-interactive relative flex min-h-80 w-full overflow-hidden rounded-xl rounded-tr-xxl bg-surface-container"
    >
      <Thumb recipe={recipe} hero />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-photo-veil p-5 text-on-photo">
        <span className="text-label-l">Destacada</span>
        <span className="line-clamp-2 text-headline-m text-e">
          {recipe.name}
        </span>
        <Tags tags={recipe.tags} />
      </span>
    </Link>
  );
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      to={`/recetario/${recipe.id}`}
      viewTransition
      className={cardClass(
        "tonal",
        "state card-interactive flex w-full flex-col gap-3 p-2 pb-4",
      )}
    >
      <Thumb recipe={recipe} />
      <span className="flex min-w-0 flex-col gap-2 px-2">
        <span className="line-clamp-2 text-title-m text-e">{recipe.name}</span>
        <Tags tags={recipe.tags} />
      </span>
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
    <Alert tone="error">
      <p>{message}</p>
      <Button variant="outlined" onClick={onRetry}>
        Reintentar
      </Button>
    </Alert>
  );
}

export function RecetarioPage() {
  const api = useRecipes();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const visible = filterRecipes(api.list, query);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline-l text-e">Recetario</h1>
          {!api.loading && !api.error && (
            <p className="text-body-m text-on-surface-variant tabular">
              {api.list.length === 1
                ? "1 receta"
                : `${api.list.length} recetas`}
            </p>
          )}
        </div>
        <Button
          onClick={() => navigate("/recetario/nueva", { viewTransition: true })}
        >
          <AddIcon />
          Nueva receta
        </Button>
      </header>

      <SearchBar
        aria-label="Buscar recetas"
        placeholder="Buscar por nombre o etiqueta…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {api.loading ? (
        <Loader label="Cargando recetario…" />
      ) : api.error ? (
        <ErrorBanner message={api.error} onRetry={api.retry} />
      ) : api.list.length === 0 ? (
        <EmptyState title="Aún no hay recetas. ¡Crea la primera!">
          <Link
            to="/recetario/nueva"
            viewTransition
            className={buttonClass({ variant: "tonal" })}
          >
            Crear receta
          </Link>
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState
          title="Ninguna receta coincide con la búsqueda."
          shapes={["soft-diamond", "cookie-4", "clover"]}
        >
          <Button variant="text" onClick={() => setQuery("")}>
            Limpiar búsqueda
          </Button>
        </EmptyState>
      ) : (
        <ul className="stagger grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {visible.map((r, i) => (
            <li
              key={r.id}
              className={cx("flex", i === 0 && "col-span-2 md:row-span-2")}
              style={{ ["--i" as string]: i }}
            >
              {i === 0 ? <HeroCard recipe={r} /> : <RecipeCard recipe={r} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STEP_SHAPES: ShapeName[] = [
  "cookie-9",
  "flower",
  "soft-diamond",
  "sunny",
  "clover",
  "cookie-4",
];

export function RecetarioDetallePage() {
  const { id } = useParams();
  const api = useRecipes();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const recipe = api.list.find((r) => String(r.id) === id);
  const color = useRecipeColor(
    recipe?.photo_path ? photoSrc(recipe.photo_path) : null,
  );

  if (api.loading) return <Loader label="Cargando recetario…" />;
  if (api.error) return <ErrorBanner message={api.error} onRetry={api.retry} />;

  if (!recipe)
    return (
      <EmptyState
        title="Receta no encontrada"
        shapes={["clover", "pill", "cookie-7"]}
      >
        <Link
          to="/recetario"
          viewTransition
          className={buttonClass({ variant: "tonal" })}
        >
          Volver al recetario
        </Link>
      </EmptyState>
    );

  const remove = async () => {
    if (await api.remove(recipe.id)) {
      snackbar({ message: "Receta eliminada" });
      navigate("/recetario", { viewTransition: true });
    }
    setConfirming(false);
  };

  const photo = recipe.photo_path;

  return (
    <div
      data-dynamic-color={color ? "on" : undefined}
      style={color}
      className="flex flex-col gap-6"
    >
      <header
        style={morph(recipe.id)}
        className="relative overflow-hidden rounded-xl rounded-b-xxl bg-surface-container-high text-on-surface"
      >
        {photo ? (
          <img
            crossOrigin="use-credentials"
            src={photoSrc(photo)}
            alt=""
            className="h-72 w-full object-cover md:h-96"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-56 place-items-center md:h-72"
          >
            <Monogram name={recipe.name} size={176} />
          </span>
        )}
        <div className="absolute inset-x-3 top-3 flex justify-between">
          <Link
            to="/recetario"
            viewTransition
            aria-label="Volver al recetario"
            className={buttonClass({ variant: "tonal", size: "icon" })}
          >
            <BackIcon />
          </Link>
          <Button
            variant="tonal"
            size="icon"
            aria-label="Editar receta"
            onClick={() => setEditing(true)}
          >
            <EditIcon />
          </Button>
        </div>
        <div
          className={cx(
            "flex flex-col gap-3 p-6 md:px-8",
            photo && "absolute inset-x-0 bottom-0 bg-photo-veil text-on-photo",
          )}
        >
          <h1 className="text-headline-l text-e md:text-display-s">
            {recipe.name}
          </h1>
          {recipe.servings !== null && (
            <p className="text-title-m tabular">{recipe.servings} comensales</p>
          )}
        </div>
      </header>

      {(recipe.description || recipe.tags.length > 0) && (
        <div className="flex flex-col gap-3 px-2">
          {recipe.description && (
            <p className="text-body-l text-on-surface-variant">
              {recipe.description}
            </p>
          )}
          <Tags tags={recipe.tags} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className="flex flex-col gap-2 rounded-xl bg-surface-container-low p-5">
            <h2 className="text-title-l text-e">Ingredientes</h2>
            <ul className="flex flex-col">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id}>
                  <label
                    htmlFor={`ing-${ing.id}`}
                    className="flex min-h-12 cursor-pointer items-center gap-2 has-checked:text-on-surface-variant has-checked:line-through"
                  >
                    <Checkbox id={`ing-${ing.id}`} />
                    <span className="w-24 shrink-0 text-right text-title-m text-accent tabular">
                      {ing.quantity !== null && `${ing.quantity} `}
                      {ing.unit && `${ing.unit} `}
                    </span>
                    <span className="text-body-l">{ing.food}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {recipe.materials.length > 0 && (
            <section className="flex flex-col gap-3 rounded-xl bg-surface-container-low p-5">
              <h2 className="text-title-l text-e">Materiales</h2>
              <ul className="flex flex-wrap gap-2">
                {recipe.materials.map((m) => (
                  <li
                    key={m}
                    className="rounded-full bg-secondary-container px-4 py-1 text-label-l text-on-secondary-container"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="flex flex-col gap-4 rounded-xl rounded-tl-xxl bg-surface-container p-5 lg:col-span-3 md:p-6">
          <h2 className="text-title-l text-e">Elaboración</h2>
          <ol className="stagger flex flex-col gap-4">
            {recipe.steps.map((s, i) => (
              <li
                key={s.id}
                aria-label={`paso ${s.step}`}
                className="flex items-start gap-4"
                style={{ ["--i" as string]: i }}
              >
                <Shape
                  name={STEP_SHAPES[i % STEP_SHAPES.length]}
                  size={48}
                  className="text-accent"
                >
                  <span className="text-title-l text-e text-on-accent tabular">
                    {s.step}
                  </span>
                </Shape>
                <span className="sr-only">. </span>
                <p className="pt-3 text-body-l">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="flex justify-end border-t border-outline-variant pt-4">
        <Button
          variant="text"
          className="text-error"
          onClick={() => setConfirming(true)}
        >
          <DeleteIcon />
          Eliminar
        </Button>
      </div>

      {confirming && (
        <Dialog
          onClose={() => setConfirming(false)}
          label="Confirmar eliminación"
          mobile="center"
          className="max-w-sm gap-4 p-6"
        >
          <Shape name="cookie-9" size={40} className="self-center text-error">
            <DeleteIcon width={20} height={20} className="text-on-error" />
          </Shape>
          <p className="text-center text-body-l">
            ¿Seguro que quieres eliminar «{recipe.name}»?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="text" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={api.saving} onClick={remove}>
              {api.saving ? "Eliminando…" : "Eliminar receta"}
            </Button>
          </div>
        </Dialog>
      )}

      {editing && (
        <RecipeEditor
          api={api}
          recipe={recipe}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
