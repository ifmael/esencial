// E2 libro (pantalla-5) + detalle (pantalla-2). El libro vive en /recetario;
// /plan-recetas queda para la rejilla semanal de E3 (tab del shell intacto).
// El flash de "receta eliminada" cruza la navegación en un módulo-único porque
// el detalle y el libro son rutas distintas sin estado compartido.
import { useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router";
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
/** Portada de receta: la foto o, sin ella, un papel tostado con la inicial en
 * la serif. La usan la tarjeta y la cabecera del detalle, así que las dos
 * piezas que se transforman una en otra son la misma. */
function Cover({ recipe, className }: { recipe: Recipe; className: string }) {
  return recipe.photo_path ? (
    <img
      src={photoSrc(recipe.photo_path)}
      alt=""
      className={`${className} object-cover`}
    />
  ) : (
    <div
      aria-hidden
      className={`${className} flex flex-col items-center justify-center gap-1 bg-surface-muted text-text-secondary`}
    >
      <span className="font-display text-hero text-border-strong">
        {recipe.name.charAt(0)}
      </span>
      <span className="caption-editorial">Sin foto</span>
    </div>
  );
}

/** Nombres de la transición tarjeta → cabecera. Fijos: solo los lleva la
 * tarjeta que se pulsa y la cabecera del detalle, nunca dos a la vez (dos
 * elementos con el mismo nombre cancelan la transición entera). El CSS de
 * `globals.css` apunta a estos nombres. */
const COVER = { viewTransitionName: "recipe-cover" };
const TITLE = { viewTransitionName: "recipe-title" };

/** La receta viaja con la navegación (`state`) para que el detalle pinte su
 * cabecera en el primer render —el que fotografía la transición— sin esperar
 * a la API. */
type DetailHandoff = { recipe: Recipe };

function RecipeCard({
  recipe,
  index,
  feature,
}: {
  recipe: Recipe;
  index: number;
  /** La primera de la rejilla: portada a doble ancho, como una apertura. */
  feature: boolean;
}) {
  const [leaving, setLeaving] = useState(false);
  return (
    <Link
      to={`/recetario/${recipe.id}`}
      state={{ recipe } satisfies DetailHandoff}
      viewTransition
      // Síncrono: los nombres tienen que estar en el DOM antes de que el
      // router pida la foto «antes», que ocurre en este mismo clic.
      onClick={() => flushSync(() => setLeaving(true))}
      style={{ "--i": index } as React.CSSProperties}
      className={`group flex flex-col gap-3 ${feature ? "md:col-span-2 md:row-span-2" : ""}`}
    >
      <div
        style={leaving ? COVER : undefined}
        className="overflow-hidden rounded-card shadow-card transition-shadow duration-base group-hover:shadow-raised"
      >
        <Cover
          recipe={recipe}
          className={`w-full transition-transform duration-page ease-out-quart group-hover:scale-105 ${
            feature
              ? "aspect-4/3 md:aspect-auto md:h-full md:min-h-96"
              : "aspect-4/3"
          }`}
        />
      </div>
      <div className="flex flex-col gap-1">
        {recipe.tags.length > 0 && (
          <ul className="flex flex-wrap gap-x-2 section-label text-accent">
            {recipe.tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        <h2
          style={leaving ? TITLE : undefined}
          className={`${feature ? "text-display" : "text-title"} group-hover:text-primary`}
        >
          {recipe.name}
        </h2>
        {recipe.description && (
          <p className="line-clamp-2 text-caption text-text-secondary">
            {recipe.description}
          </p>
        )}
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
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <span className="section-label">Nutrición</span>
          <h1 className="text-hero">Recetario</h1>
          <span className="rule-accent" />
        </div>
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
          className="mb-4 rounded-panel bg-done-bg p-3 text-done-text"
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
        // Rejilla de revista: la primera receta abre a doble ancho y alto; el
        // resto cae en columnas. Entrada escalonada suave (`.stagger`).
        <div className="stagger grid grid-cols-1 gap-x-gutter gap-y-section sm:grid-cols-2 md:grid-cols-3">
          {visible.map((r, i) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              index={i}
              feature={i === 0 && visible.length > 2}
            />
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

/** Cabecera del detalle: portada a sangre y título grande en la serif. Es el
 * destino de la transición desde la tarjeta (mismos nombres). */
function DetailHeader({
  recipe,
  onEdit,
}: {
  recipe: Recipe;
  onEdit?: () => void;
}) {
  return (
    <header className="flex flex-col gap-4">
      <Link
        to="/recetario"
        viewTransition
        aria-label="Volver al recetario"
        className={buttonClass({ variant: "ghost", size: "icon" })}
      >
        ←
      </Link>
      <figure className="flex flex-col gap-2">
        <div
          style={COVER}
          className="relative overflow-hidden rounded-card shadow-raised"
        >
          <Cover recipe={recipe} className="aspect-4/3 w-full md:aspect-21/9" />
          {onEdit && (
            <Button
              variant="secondary"
              size="icon"
              aria-label="Editar receta"
              className="absolute right-3 top-3"
              onClick={onEdit}
            >
              ✏️
            </Button>
          )}
        </div>
        {recipe.servings !== null && (
          <figcaption className="caption-editorial">
            Para {recipe.servings} comensales
          </figcaption>
        )}
      </figure>
      <h1 style={TITLE} className="max-w-3xl text-hero">
        {recipe.name}
      </h1>
    </header>
  );
}

export function RecetarioDetallePage() {
  const { id } = useParams();
  const api = useRecipes();
  const navigate = useNavigate();
  const handoff = (useLocation().state as DetailHandoff | null)?.recipe;
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (api.loading) {
    // Viniendo de la tarjeta, la cabecera ya se puede pintar: es lo que la
    // transición necesita en su primer fotograma.
    if (handoff && String(handoff.id) === id)
      return (
        <>
          <DetailHeader recipe={handoff} />
          <div className="skeleton mt-section h-40" role="status">
            <span className="sr-only">Cargando receta…</span>
          </div>
        </>
      );
    return (
      <Card className="bg-pending-bg text-pending-text" role="status">
        Cargando recetario…
      </Card>
    );
  }
  if (api.error) return <ErrorBanner message={api.error} onRetry={api.retry} />;

  const recipe = api.list.find((r) => String(r.id) === id);
  if (!recipe)
    return (
      <Card>
        <h1 className="mb-2 text-display">Receta no encontrada</h1>
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
    <article className="flex flex-col gap-section">
      <DetailHeader recipe={recipe} onEdit={() => setEditing(true)} />

      {recipe.description && (
        <p className="animate-rise max-w-2xl font-display text-lead italic text-text-secondary">
          {recipe.description}
        </p>
      )}

      <div className="stagger grid gap-section lg:grid-cols-5">
        <div
          style={{ "--i": 0 } as React.CSSProperties}
          className="flex flex-col gap-section lg:col-span-2"
        >
          <section className="flex flex-col gap-stack">
            <h2 className="text-title">Ingredientes</h2>
            <span className="rule-accent" />
            <ul
              className={cardClass("flex flex-col divide-y divide-border py-2")}
            >
              {recipe.ingredients.map((ing) => (
                <li key={ing.id} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    id={`ing-${ing.id}`}
                    className="size-5 shrink-0 accent-primary"
                  />
                  <label
                    htmlFor={`ing-${ing.id}`}
                    className="flex-1 py-2 has-checked:line-through"
                  >
                    {ing.quantity !== null && (
                      <span className="font-semibold tabular-nums">
                        {`${ing.quantity} `}
                      </span>
                    )}
                    {ing.unit && `${ing.unit} `}
                    {ing.food}
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {recipe.materials.length > 0 && (
            <section className="flex flex-col gap-stack">
              <h2 className="text-title">Materiales</h2>
              <ul className="flex flex-wrap gap-2">
                {recipe.materials.map((m) => (
                  <li key={m}>
                    <Badge>{m}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section
          style={{ "--i": 1 } as React.CSSProperties}
          className="flex flex-col gap-stack lg:col-span-3"
        >
          <h2 className="text-title">Elaboración</h2>
          <span className="rule-accent" />
          <ol className="flex flex-col gap-gutter">
            {recipe.steps.map((s) => (
              // El numeral grande es un marcador de lista (CSS); el texto sigue
              // siendo «1. Sofreír» para el lector y para copiar.
              <li
                key={s.id}
                aria-label={`paso ${s.step}`}
                className="max-w-prose border-l-2 border-accent-soft pl-4 first-letter:font-display first-letter:text-title first-letter:text-accent"
              >
                {`${s.step}. ${s.text}`}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {recipe.tags.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {recipe.tags.map((t) => (
            <li key={t}>
              <Badge tone="accent">{t}</Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border pt-4">
        <Button
          variant="ghost"
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
    </article>
  );
}
