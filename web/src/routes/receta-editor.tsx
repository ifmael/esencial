// Editor de receta (crear y editar) como página propia: /recetario/nueva y
// /recetario/:id/editar. Antes editar abría la modal recipe-editor (D2) sobre la
// ficha; ahora la ficha se desmonta al entrar, como en plantillas y ejercicios.
// Una columna en móvil y dos en lg, con subida a /api/uploads (contrato
// fail-closed: 200 {photo_path}, 400 {error, field:"file"}) y preview por
// photo_path. descripción y comensales solo se editan (al crear salen null, E8).
// Guardar manda un único POST (crear) o PUT (editar) y vuelve a /recetario o a
// la ficha; Cancelar y Escape vuelven sin llamadas a la API.
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Loader, Shape } from "../components/expressive";
import {
  AddIcon,
  BookIcon,
  CheckIcon,
  CloseIcon,
  PhotoIcon,
  SaveIcon,
} from "../components/icons";
import {
  type FieldError,
  type Recipe,
  type RecipeInput,
  useRecipes,
} from "../components/recipes/use-recipes";
import { StepsEditor } from "../components/steps-editor";
import {
  Alert,
  Button,
  Card,
  Chip,
  Field,
  Input,
  Select,
  Textarea,
} from "../components/ui";
import { ApiError, apiFetch, photoSrc } from "../lib/api";
import { pushEscape } from "../lib/escape-stack";
import { useCreateMorph } from "../lib/view-transition";

type IngRow = { food: string; quantity: string; unit: string };

type Draft = {
  name: string;
  description: string;
  servings: string;
  photo_path: string;
  ingredients: IngRow[];
  steps: string[];
  materials: string[];
  tags: string[];
};

const blank = (): Draft => ({
  name: "",
  description: "",
  servings: "",
  photo_path: "",
  ingredients: [{ food: "", quantity: "", unit: "" }],
  steps: [""],
  materials: [],
  tags: [],
});

/** Borrador de partida al editar: la receta hidratada tal cual. El PUT
 *  reemplaza el registro entero, así que nada puede quedarse fuera. */
const fromRecipe = (r: Recipe): Draft => ({
  name: r.name,
  description: r.description ?? "",
  servings: r.servings === null ? "" : String(r.servings),
  photo_path: r.photo_path ?? "",
  ingredients: r.ingredients.length
    ? r.ingredients.map((i) => ({
        food: i.food,
        quantity: i.quantity === null ? "" : String(i.quantity),
        unit: i.unit ?? "",
      }))
    : [{ food: "", quantity: "", unit: "" }],
  steps: r.steps.length ? r.steps.map((s) => s.text) : [""],
  materials: [...r.materials],
  tags: [...r.tags],
});

const BASE_TAGS = ["Desayuno", "Almuerzo", "Cena", "Snack"];

/** Unidades del desplegable. La API acepta texto libre, así que una unidad que
 *  no esté aquí se añade como opción propia (nunca se pierde al editar). */
const UNITS = ["gr", "ml", "ud"];

/** Posición en la entrada escalonada (`.stagger`). */
const at = (i: number) => ({ ["--i" as string]: i });

const setRow = (rows: IngRow[], i: number, patch: Partial<IngRow>): IngRow[] =>
  rows.map((r, j) => (j === i ? { ...r, ...patch } : r));

/** Página del editor: la ruta decide si es crear (`/recetario/nueva`) o editar
 *  (`/recetario/:id/editar`). Al editar espera al listado —el borrador sale de
 *  la receta ya hidratada— y, si la del enlace ya no existe, vuelve al
 *  recetario. */
export function RecetaEditorPage() {
  const { id } = useParams();
  const api = useRecipes();
  const navigate = useNavigate();
  const recipe =
    id === undefined ? undefined : api.list.find((r) => String(r.id) === id);
  const back = recipe ? `/recetario/${recipe.id}` : "/recetario";
  // `replace`: la URL del editor no se apila, así que «atrás» desde la ficha o
  // el recetario no reabre el formulario que se acaba de cerrar.
  const close = useCallback(
    () => navigate(back, { replace: true }),
    [navigate, back],
  );

  if (id !== undefined && api.loading)
    return <Loader label="Cargando recetario…" />;
  if (id !== undefined && !recipe) return <Navigate to="/recetario" replace />;

  const save = async (input: RecipeInput) => {
    const ok = recipe
      ? await api.update(recipe.id, input)
      : await api.create(input);
    if (ok) navigate(back, { replace: true });
  };

  return (
    <RecipeEditor
      key={recipe ? `r${recipe.id}` : "nueva"}
      recipe={recipe}
      submitting={api.saving}
      fieldError={api.fieldError}
      error={api.error}
      onSave={save}
      onCancel={close}
    />
  );
}

/** El borrador entero en tarjetas, con la cabecera de sección: la foto en una,
 *  nombre (y, al editar, descripción y comensales) con las categorías en otra,
 *  ingredientes, materiales y pasos debajo. */
function RecipeEditor({
  recipe,
  submitting,
  fieldError,
  error,
  onSave,
  onCancel,
}: {
  recipe?: Recipe;
  submitting: boolean;
  fieldError: FieldError | null;
  error: string | null;
  onSave: (input: RecipeInput) => Promise<void>;
  onCancel: () => void;
}) {
  const editing = recipe !== undefined;
  const [draft, setDraft] = useState<Draft>(() =>
    recipe ? fromRecipe(recipe) : blank(),
  );
  const draftRef = useRef(draft);
  draftRef.current = draft; // lectura fresca tras cualquier await
  const [nameError, setNameError] = useState<string | null>(null);
  const [material, setMaterial] = useState("");
  const [tag, setTag] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const pendingFileRef = useRef<File | null>(null);
  // Id de la selección activa: cualquier invalidación lo incrementa y las
  // respuestas de subidas anteriores (en vuelo o retenidas) se descartan.
  const uploadSessionRef = useRef(0);
  // Distingue la ELIMINACIÓN explícita (Quitar foto) del mero descarte del
  // reintento: solo la primera vacía la foto.
  const photoRemovedRef = useRef(false);

  // Solo crear anima: lo pulsado (FAB, «Nueva receta») se transforma en la
  // página. Carga directa y editar no.
  const morph = useCreateMorph(!editing);
  // Escape vuelve sin guardar, como Cancelar.
  useEffect(() => pushEscape(onCancel), [onCancel]);

  const removePhoto = () => {
    uploadSessionRef.current += 1;
    pendingFileRef.current = null;
    photoRemovedRef.current = true;
    setUploadError(null);
    set("photo_path", "");
  };

  const discardPendingUpload = () => {
    uploadSessionRef.current += 1;
    pendingFileRef.current = null;
    setUploadError(null);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const toggleTag = (t: string) =>
    set(
      "tags",
      draft.tags.includes(t)
        ? draft.tags.filter((x) => x !== t)
        : [...draft.tags, t],
    );

  const addChip = (
    key: "materials" | "tags",
    value: string,
    clear: () => void,
  ) => {
    const v = value.trim();
    if (v && !draft[key].includes(v)) set(key, [...draft[key], v]);
    clear();
  };

  const onFile = async (file: File) => {
    if (uploadingRef.current) return;
    const session = ++uploadSessionRef.current;
    photoRemovedRef.current = false; // nueva selección: la eliminación previa ya no aplica
    uploadingRef.current = true;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { photo_path } = await apiFetch<{ photo_path: string }>(
        "/api/uploads",
        {
          method: "POST",
          body: fd,
        },
      );
      if (session !== uploadSessionRef.current) return; // la foto fue quitada mientras subía
      set("photo_path", photo_path);
      // Una selección resuelta invalida cualquier reintento pendiente.
      pendingFileRef.current = null;
    } catch (e) {
      if (session !== uploadSessionRef.current) return;
      // 400 (tipo) y 413 (tamaño) son rechazos deterministas del server:
      // reintentar no los cura. Cualquier otro fallo (red/5xx) es transitorio.
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 400 || status === 413) {
        pendingFileRef.current = null;
        setUploadError("Archivo no válido (tipo o tamaño). Elige otra imagen.");
      } else {
        pendingFileRef.current = file;
        setUploadError(
          "No se pudo conectar con el servidor. Se reintentará al guardar.",
        );
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const ensurePhotoUploaded = async (): Promise<string | null> => {
    const file = pendingFileRef.current;
    if (!file) return draft.photo_path;
    const session = uploadSessionRef.current;
    uploadingRef.current = true;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { photo_path } = await apiFetch<{ photo_path: string }>(
        "/api/uploads",
        {
          method: "POST",
          body: fd,
        },
      );
      if (session !== uploadSessionRef.current) {
        // Invalidada. Si fue ELIMINACIÓN explícita, "" (sin foto).
        // Si solo se descartó el reintento, conservar la foto actual.
        return photoRemovedRef.current ? "" : draft.photo_path;
      }
      set("photo_path", photo_path);
      pendingFileRef.current = null;
      setUploadError(null);
      return photo_path;
    } catch {
      if (session !== uploadSessionRef.current) {
        return photoRemovedRef.current ? "" : draft.photo_path;
      }
      setUploadError("No se pudo subir el archivo. Inténtalo de nuevo.");
      return null;
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const payload = (photoPath: string): RecipeInput => ({
    name: draftRef.current.name.trim(),
    description: draftRef.current.description.trim() || null,
    servings: draftRef.current.servings.trim()
      ? Number(draftRef.current.servings)
      : null,
    photo_path: photoPath || null,
    ingredients: draftRef.current.ingredients
      .filter((i) => i.food.trim())
      .map((i) => ({
        food: i.food.trim(),
        quantity: i.quantity.trim() ? Number(i.quantity) : null,
        unit: i.unit.trim() || null,
      })),
    steps: draftRef.current.steps.map((s) => s.trim()).filter(Boolean),
    materials: draftRef.current.materials,
    tags: draftRef.current.tags,
  });

  const busy = submitting || uploading;

  /** Un solo POST o PUT; al terminar la página vuelve sola. */
  const save = async () => {
    if (busy) return;
    if (!draft.name.trim()) {
      setNameError("El nombre es obligatorio");
      nameInput.current?.focus();
      return;
    }
    setNameError(null);
    const photoKey = await ensurePhotoUploaded();
    if (photoKey === null) return;
    await onSave(payload(photoKey));
  };

  const serverNameError =
    fieldError?.field === "name" ? fieldError.message : null;
  const otherFieldError =
    fieldError && fieldError.field !== "name" ? fieldError.message : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4" style={morph}>
      <header className="relative flex flex-col items-start gap-5 rounded-xl rounded-tr-xxl bg-accent-container p-6 text-on-accent-container sm:flex-row sm:items-end sm:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl rounded-tr-xxl"
        >
          <Shape
            name="cookie-9"
            size={176}
            className="absolute -top-14 -right-12 text-accent opacity-15"
          />
          <Shape
            name="flower"
            size={72}
            className="absolute right-36 -bottom-8 rotate-12 text-accent opacity-10"
          />
        </div>
        <div className="relative flex min-w-0 items-center gap-4">
          <Shape name="cookie-4" size={56} className="text-accent">
            <BookIcon className="text-on-accent" />
          </Shape>
          <div className="min-w-0">
            <h1 className="text-headline-l text-e">
              {editing ? "Editar receta" : "Nueva receta"}
            </h1>
            <p className="text-body-m">
              Foto, ingredientes y pasos en una sola página.
            </p>
          </div>
        </div>
        <div className="relative flex flex-wrap gap-2">
          <Button
            variant="text"
            className="text-on-accent-container"
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button disabled={busy} onClick={() => save()}>
            <SaveIcon width={20} height={20} />
            {busy ? "Guardando…" : editing ? "Guardar" : "Guardar receta"}
          </Button>
        </div>
      </header>

      {(otherFieldError || error) && (
        <Alert tone="error">
          <p className="text-body-m">{otherFieldError ?? error}</p>
          <Button
            variant="text"
            className="-mx-3 text-on-error-container"
            onClick={() => save()}
          >
            Reintentar
          </Button>
        </Alert>
      )}

      <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0 rounded-xl" style={at(0)}>
          <section className="flex flex-col gap-4">
            <h2 className="text-title-m">Foto principal</h2>
            {draft.photo_path ? (
              <img
                crossOrigin="use-credentials"
                src={photoSrc(draft.photo_path)}
                alt="Vista previa de la foto"
                className="h-48 w-full rounded-l object-cover"
              />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-l bg-surface-container-high text-body-m text-on-surface-variant">
                <Shape
                  name="cookie-9"
                  size={72}
                  className="text-accent-container"
                >
                  <PhotoIcon
                    className="text-on-accent-container"
                    width={32}
                    height={32}
                  />
                </Shape>
                Sin foto
              </div>
            )}
            {uploading && <Loader label="Subiendo…" size={32} />}
            {uploadError && (
              <Alert tone="error">
                <p className="text-body-m">{uploadError}</p>
                <Button
                  variant="text"
                  className="-mx-3 text-on-error-container"
                  onClick={discardPendingUpload}
                >
                  Descartar
                </Button>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="tonal"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <PhotoIcon />
                {draft.photo_path ? "Cambiar foto" : "Elegir foto"}
              </Button>
              {draft.photo_path && (
                <Button variant="outlined" onClick={removePhoto}>
                  Quitar foto
                </Button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onFile(f);
              }}
            />
          </section>
        </Card>

        <Card className="flex min-w-0 flex-col gap-6 rounded-xl" style={at(1)}>
          <Field
            label="Nombre"
            support="Así aparecerá en el recetario"
            error={nameError ?? serverNameError}
          >
            {(a) => (
              <Input
                {...a}
                ref={nameInput}
                className="text-title-m"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
              />
            )}
          </Field>
          {editing && (
            <>
              <Field label="Descripción">
                {(a) => (
                  <Textarea
                    {...a}
                    rows={3}
                    value={draft.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Comensales" className="sm:w-40">
                {(a) => (
                  <Input
                    {...a}
                    type="number"
                    min={1}
                    className="tabular"
                    value={draft.servings}
                    onChange={(e) => set("servings", e.target.value)}
                  />
                )}
              </Field>
            </>
          )}
          <section className="flex flex-col gap-3">
            <h2 className="text-title-m">Categorías</h2>
            <ul className="flex flex-wrap gap-2">
              {[
                ...BASE_TAGS,
                ...draft.tags.filter((t) => !BASE_TAGS.includes(t)),
              ].map((t) => {
                const on = draft.tags.includes(t);
                return (
                  <li key={t}>
                    <Chip pressed={on} onClick={() => toggleTag(t)}>
                      {on && <CheckIcon width={18} height={18} />}
                      {t}
                    </Chip>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-start gap-2">
              <Field label="Nueva categoría" className="flex-1">
                {(a) => (
                  <Input
                    {...a}
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                  />
                )}
              </Field>
              <Button
                variant="tonal"
                size="icon"
                aria-label="Añadir categoría"
                onClick={() => addChip("tags", tag, () => setTag(""))}
              >
                <AddIcon />
              </Button>
            </div>
          </section>
        </Card>

        <Card className="min-w-0 rounded-xl" style={at(2)}>
          <section className="flex flex-col gap-3">
            <h2 className="text-title-m">Ingredientes</h2>
            <ul className="flex flex-col gap-3">
              {draft.ingredients.map((row, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`Ingrediente ${i + 1} alimento`}
                    className="basis-full sm:basis-0 sm:flex-1"
                    placeholder="Alimento"
                    value={row.food}
                    onChange={(e) =>
                      set(
                        "ingredients",
                        setRow(draft.ingredients, i, { food: e.target.value }),
                      )
                    }
                  />
                  <Input
                    aria-label={`Ingrediente ${i + 1} cantidad`}
                    className="flex-1 tabular sm:w-24 sm:flex-none"
                    type="number"
                    placeholder="Cant."
                    value={row.quantity}
                    onChange={(e) =>
                      set(
                        "ingredients",
                        setRow(draft.ingredients, i, {
                          quantity: e.target.value,
                        }),
                      )
                    }
                  />
                  <Select
                    aria-label={`Ingrediente ${i + 1} unidad`}
                    className="w-24"
                    value={row.unit}
                    onChange={(e) =>
                      set(
                        "ingredients",
                        setRow(draft.ingredients, i, { unit: e.target.value }),
                      )
                    }
                  >
                    <option value="">—</option>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                    {/* La API acepta cualquier unidad: la receta que trae una
                        fuera del enum («g», «pechuga») la conserva y se ve. */}
                    {row.unit && !UNITS.includes(row.unit) && (
                      <option value={row.unit}>{row.unit}</option>
                    )}
                  </Select>
                  <Button
                    variant="text"
                    size="icon"
                    aria-label={`Quitar ingrediente ${i + 1}`}
                    onClick={() =>
                      set(
                        "ingredients",
                        draft.ingredients.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <CloseIcon />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="outlined"
              className="self-start"
              onClick={() =>
                set("ingredients", [
                  ...draft.ingredients,
                  { food: "", quantity: "", unit: "" },
                ])
              }
            >
              <AddIcon />
              Añadir ingrediente
            </Button>
          </section>
        </Card>

        <Card className="min-w-0 rounded-xl" style={at(3)}>
          <section className="flex flex-col gap-3">
            <h2 className="text-title-m">Materiales</h2>
            {draft.materials.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {draft.materials.map((m) => (
                  <li key={m}>
                    <Chip
                      aria-label={`Quitar material ${m}`}
                      onClick={() =>
                        set(
                          "materials",
                          draft.materials.filter((x) => x !== m),
                        )
                      }
                    >
                      {m}
                      <CloseIcon width={18} height={18} />
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-start gap-2">
              <Field label="Nuevo material" className="flex-1">
                {(a) => (
                  <Input
                    {...a}
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                  />
                )}
              </Field>
              <Button
                variant="tonal"
                size="icon"
                aria-label="Añadir material"
                onClick={() =>
                  addChip("materials", material, () => setMaterial(""))
                }
              >
                <AddIcon />
              </Button>
            </div>
          </section>
        </Card>

        <Card className="min-w-0 rounded-xl lg:col-span-2" style={at(4)}>
          <section className="flex flex-col gap-3">
            <h2 className="text-title-m">Pasos</h2>
            <StepsEditor
              steps={draft.steps}
              onChange={(steps) => set("steps", steps)}
            />
          </section>
        </Card>
      </div>
    </div>
  );
}
