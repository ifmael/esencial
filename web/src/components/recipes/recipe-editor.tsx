// E2 editor (D2): create/edit recipe as a modal overlay. Cancel = close, no API
// call; save POSTs/PUTs the whole draft; field errors render beside the field.
import { useId, useRef, useState } from "react";
import { ApiError, apiFetch, photoSrc } from "../../lib/api";
import { Shape } from "../expressive";
import {
  AddIcon,
  ChevronDownIcon,
  CloseIcon,
  PhotoIcon,
  SaveIcon,
} from "../icons";
import { Dialog, OverlayHeader } from "../overlay";
import {
  Alert,
  Button,
  buttonClass,
  cx,
  Field,
  Input,
  ripple,
  Textarea,
} from "../ui";
import type { Recipe, RecipeInput, RecipesApi } from "./use-recipes";

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

function move(items: string[], from: number, to: number): string[] {
  const next = [...items];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

export function RecipeEditor({
  api,
  recipe,
  onClose,
}: {
  api: RecipesApi;
  recipe: Recipe;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => fromRecipe(recipe));
  const draftRef = useRef(draft);
  draftRef.current = draft; // lectura fresca tras cualquier await
  const [nameError, setNameError] = useState<string | null>(null);
  const [material, setMaterial] = useState("");
  const [tag, setTag] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const pendingFileRef = useRef<File | null>(null);
  const saveCancelledRef = useRef(false);
  // Id de la selección activa: "Quitar" lo incrementa y las respuestas de
  // subidas anteriores (en vuelo o retenidas) se descartan.
  const uploadSessionRef = useRef(0);
  const title = "Editar receta";
  const titleId = useId();

  const removePhoto = () => {
    uploadSessionRef.current += 1;
    pendingFileRef.current = null;
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

  /** Reintenta la subida pendiente; sin pendiente devuelve el path actual
   *  (posiblemente null/"" — la receta puede quedarse sin foto a propósito). */
  const ensurePhotoUploaded = async (): Promise<{
    ok: boolean;
    photoPath: string | null;
  }> => {
    const file = pendingFileRef.current;
    if (!file) return { ok: true, photoPath: draft.photo_path.trim() || null };
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
        return { ok: true, photoPath: null }; // invalidada: respetar la eliminación (sin leer draft stale)
      }
      set("photo_path", photo_path);
      pendingFileRef.current = null;
      setUploadError(null);
      return { ok: true, photoPath: photo_path };
    } catch {
      if (session !== uploadSessionRef.current) {
        return { ok: true, photoPath: null }; // invalidada: respetar la eliminación
      }
      setUploadError(
        "No se pudo subir el archivo. Guarda de nuevo para reintentarlo.",
      );
      return { ok: false, photoPath: null };
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const payload = (photoPath: string | null): RecipeInput => ({
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

  const save = async () => {
    if (api.saving || uploading) return;
    if (!draft.name.trim()) {
      setNameError("El nombre es obligatorio");
      return;
    }
    setNameError(null);
    saveCancelledRef.current = false;
    const photo = await ensurePhotoUploaded();
    if (!photo.ok || saveCancelledRef.current) return; // cerrado durante el reintento
    const ok = await api.update(recipe.id, payload(photo.photoPath));
    if (ok) onClose();
  };

  const cancel = () => {
    saveCancelledRef.current = true;
    onClose();
  };

  const serverNameError =
    api.fieldError?.field === "name" ? api.fieldError.message : null;
  const otherFieldError =
    api.fieldError && api.fieldError.field !== "name"
      ? api.fieldError.message
      : null;

  return (
    <Dialog
      onClose={cancel}
      labelledBy={titleId}
      className="md:h-[88vh] md:max-w-2xl"
    >
      <OverlayHeader id={titleId} title={title} onClose={cancel} />

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pt-4 pb-6">
        {(otherFieldError || api.error) && (
          <Alert tone="error">
            <p>{otherFieldError ?? api.error}</p>
            <Button variant="outlined" size="sm" onClick={save}>
              Reintentar
            </Button>
          </Alert>
        )}

        <Field label="Nombre" error={nameError ?? serverNameError}>
          {(a) => (
            <Input
              {...a}
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
            />
          )}
        </Field>

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

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
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
          <div className="flex flex-1 flex-col gap-2">
            {draft.photo_path ? (
              <div className="flex items-center gap-3 rounded-l bg-surface-container-highest p-2">
                <img
                  crossOrigin="use-credentials"
                  src={photoSrc(draft.photo_path)}
                  alt="Foto actual"
                  className="size-12 rounded-m object-cover"
                />
                <span className="flex-1 text-body-m text-on-surface-variant">
                  Foto de la receta
                </span>
                <Button variant="text" onClick={() => set("photo_path", "")}>
                  Quitar
                </Button>
              </div>
            ) : (
              <label
                className={buttonClass({
                  variant: "tonal",
                  className: cx(
                    "cursor-pointer self-start has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent",
                    uploading && "pointer-events-none opacity-50",
                  ),
                })}
              >
                <PhotoIcon />
                {uploading ? "Subiendo…" : "Subir foto"}
                <input
                  id="recipe-photo"
                  aria-label="Foto"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void onFile(f);
                  }}
                />
              </label>
            )}
            {uploadError && (
              <Alert tone="error">
                <p>{uploadError}</p>
                <Button
                  variant="outlined"
                  size="sm"
                  onClick={discardPendingUpload}
                >
                  Descartar
                </Button>
              </Alert>
            )}
          </div>
        </div>

        <section className="flex flex-col gap-3 rounded-xl bg-surface-container p-4">
          <h3 className="text-title-m text-e">Ingredientes</h3>
          <ul className="flex flex-col gap-2">
            {draft.ingredients.map((row, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input
                  aria-label={`Ingrediente ${i + 1} alimento`}
                  className="flex-1"
                  placeholder="alimento"
                  value={row.food}
                  onChange={(e) =>
                    set(
                      "ingredients",
                      draft.ingredients.map((r, j) =>
                        j === i ? { ...r, food: e.target.value } : r,
                      ),
                    )
                  }
                />
                <Input
                  aria-label={`Ingrediente ${i + 1} cantidad`}
                  className="w-20 tabular"
                  type="number"
                  placeholder="cant."
                  value={row.quantity}
                  onChange={(e) =>
                    set(
                      "ingredients",
                      draft.ingredients.map((r, j) =>
                        j === i ? { ...r, quantity: e.target.value } : r,
                      ),
                    )
                  }
                />
                <Input
                  aria-label={`Ingrediente ${i + 1} unidad`}
                  className="w-24"
                  placeholder="unidad"
                  value={row.unit}
                  onChange={(e) =>
                    set(
                      "ingredients",
                      draft.ingredients.map((r, j) =>
                        j === i ? { ...r, unit: e.target.value } : r,
                      ),
                    )
                  }
                />
                <Button
                  variant="text"
                  size="icon-sm"
                  aria-label={`Quitar ingrediente ${i + 1}`}
                  className="text-on-surface-variant"
                  onClick={() =>
                    set(
                      "ingredients",
                      draft.ingredients.filter((_, j) => j !== i),
                    )
                  }
                >
                  <CloseIcon width={20} height={20} />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="text"
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

        <section className="flex flex-col gap-3 rounded-xl bg-surface-container p-4">
          <h3 className="text-title-m text-e">Pasos</h3>
          <ol className="flex flex-col gap-2">
            {draft.steps.map((text, i) => (
              <li key={i} className="flex items-center gap-2">
                <Shape
                  name="cookie-9"
                  size={32}
                  className="text-accent-container"
                >
                  <span className="text-label-l text-on-accent-container tabular">
                    {i + 1}
                  </span>
                </Shape>
                <Input
                  aria-label={`Paso ${i + 1}`}
                  className="flex-1"
                  value={text}
                  onChange={(e) =>
                    set(
                      "steps",
                      draft.steps.map((s, j) => (j === i ? e.target.value : s)),
                    )
                  }
                />
                {i > 0 && (
                  <Button
                    variant="text"
                    size="icon-sm"
                    aria-label={`Subir paso ${i + 1}`}
                    className="text-on-surface-variant"
                    onClick={() => set("steps", move(draft.steps, i, i - 1))}
                  >
                    <ChevronDownIcon
                      width={20}
                      height={20}
                      className="rotate-180"
                    />
                  </Button>
                )}
                {i < draft.steps.length - 1 && (
                  <Button
                    variant="text"
                    size="icon-sm"
                    aria-label={`Bajar paso ${i + 1}`}
                    className="text-on-surface-variant"
                    onClick={() => set("steps", move(draft.steps, i, i + 1))}
                  >
                    <ChevronDownIcon width={20} height={20} />
                  </Button>
                )}
                <Button
                  variant="text"
                  size="icon-sm"
                  aria-label={`Quitar paso ${i + 1}`}
                  className="text-on-surface-variant"
                  onClick={() =>
                    set(
                      "steps",
                      draft.steps.filter((_, j) => j !== i),
                    )
                  }
                >
                  <CloseIcon width={20} height={20} />
                </Button>
              </li>
            ))}
          </ol>
          <Button
            variant="text"
            className="self-start"
            onClick={() => set("steps", [...draft.steps, ""])}
          >
            <AddIcon />
            Añadir paso
          </Button>
        </section>

        <ChipsSection
          title="Materiales"
          items={draft.materials}
          removeLabel={(m) => `Quitar material ${m}`}
          onRemove={(m) =>
            set(
              "materials",
              draft.materials.filter((x) => x !== m),
            )
          }
          inputLabel="Nuevo material"
          value={material}
          onChange={setMaterial}
          addLabel="Añadir material"
          onAdd={() => addChip("materials", material, () => setMaterial(""))}
        />

        <ChipsSection
          title="Etiquetas"
          items={draft.tags}
          removeLabel={(t) => `Quitar etiqueta ${t}`}
          onRemove={(t) =>
            set(
              "tags",
              draft.tags.filter((x) => x !== t),
            )
          }
          inputLabel="Nueva etiqueta"
          value={tag}
          onChange={setTag}
          addLabel="Añadir etiqueta"
          onAdd={() => addChip("tags", tag, () => setTag(""))}
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-outline-variant px-6 py-4">
        <Button variant="text" onClick={cancel}>
          Cancelar
        </Button>
        <Button disabled={api.saving || uploading} onClick={save}>
          <SaveIcon />
          {api.saving || uploading ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </Dialog>
  );
}

/** Materiales y etiquetas: chips de entrada que se quitan + campo para añadir. */
function ChipsSection({
  title,
  items,
  removeLabel,
  onRemove,
  inputLabel,
  value,
  onChange,
  addLabel,
  onAdd,
}: {
  title: string;
  items: string[];
  removeLabel: (item: string) => string;
  onRemove: (item: string) => void;
  inputLabel: string;
  value: string;
  onChange: (v: string) => void;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-title-m text-e">{title}</h3>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item}
              className="flex h-8 items-center gap-1 rounded-s bg-accent-soft pl-3 text-label-l text-on-accent-soft"
            >
              {item}
              <button
                type="button"
                aria-label={removeLabel(item)}
                onClick={() => onRemove(item)}
                onPointerDown={ripple}
                className="state grid size-8 place-items-center rounded-full"
              >
                <CloseIcon width={18} height={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          aria-label={inputLabel}
          className="flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button variant="tonal" onClick={onAdd}>
          {addLabel}
        </Button>
      </div>
    </section>
  );
}
