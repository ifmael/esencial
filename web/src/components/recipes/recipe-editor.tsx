// E2 editor (D2): create/edit recipe as a modal overlay. Cancel = close, no API
// call; save POSTs/PUTs the whole draft; field errors render beside the field.
import { useRef, useState } from "react";
import { ApiError, apiFetch, photoSrc } from "../../lib/api";
import { Alert, Button, buttonClass, Card, Input, Textarea } from "../ui";
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

const small = "rounded-control border border-border bg-surface px-2 py-1";
const label = "mb-1 block text-body font-medium text-text-secondary";

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
  const title = recipe ? "Editar receta" : "Nueva receta";

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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto scrim p-4"
      onClick={cancel}
    >
      <Card
        role="dialog"
        aria-label={title}
        className="my-8 w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-title font-semibold">{title}</h2>

        {(otherFieldError || api.error) && (
          <Alert className="mb-4">
            {otherFieldError ?? api.error}{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={save}
            >
              Reintentar
            </button>
          </Alert>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <label className={label} htmlFor="recipe-name">
              Nombre
            </label>
            <Input
              id="recipe-name"
              aria-label="Nombre"
              className="w-full"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
            />
            {(nameError ?? serverNameError) && (
              <p className="mt-1 text-body text-error">
                {nameError ?? serverNameError}
              </p>
            )}
          </div>

          <div>
            <label className={label} htmlFor="recipe-desc">
              Descripción
            </label>
            <Textarea
              id="recipe-desc"
              aria-label="Descripción"
              className="w-full"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className={label} htmlFor="recipe-servings">
                Comensales
              </label>
              <Input
                id="recipe-servings"
                aria-label="Comensales"
                type="number"
                min={1}
                className="w-full"
                value={draft.servings}
                onChange={(e) => set("servings", e.target.value)}
              />
            </div>
            <div className="flex-[2]">
              <span className={label}>Foto</span>
              {draft.photo_path ? (
                <div className="flex items-center gap-3">
                  <img
                    src={photoSrc(draft.photo_path)}
                    alt="Foto actual"
                    className="h-12 w-12 rounded-control object-cover"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => set("photo_path", "")}
                  >
                    Quitar
                  </Button>
                </div>
              ) : (
                <label
                  className={buttonClass({
                    variant: "secondary",
                    className: `inline-block cursor-pointer ${
                      uploading ? "opacity-50 pointer-events-none" : ""
                    }`,
                  })}
                >
                  Subir foto
                  <input
                    id="recipe-photo"
                    aria-label="Foto"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
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
                <div className="mt-2 flex items-center gap-3" role="alert">
                  <p className="text-body text-error">{uploadError}</p>
                  <Button variant="secondary" onClick={discardPendingUpload}>
                    Descartar
                  </Button>
                </div>
              )}
            </div>
          </div>

          <section>
            <h3 className="mb-2 font-semibold">Ingredientes</h3>
            <ul className="flex flex-col gap-2">
              {draft.ingredients.map((row, i) => (
                <li key={i} className="flex gap-2">
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
                    className="w-20"
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
                    className="w-20"
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
                  <button
                    type="button"
                    aria-label={`Quitar ingrediente ${i + 1}`}
                    className={small}
                    onClick={() =>
                      set(
                        "ingredients",
                        draft.ingredients.filter((_, j) => j !== i),
                      )
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              className="mt-2"
              onClick={() =>
                set("ingredients", [
                  ...draft.ingredients,
                  { food: "", quantity: "", unit: "" },
                ])
              }
            >
              Añadir ingrediente
            </Button>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Pasos</h3>
            <ol className="flex flex-col gap-2">
              {draft.steps.map((text, i) => (
                <li key={i} className="flex gap-2">
                  <span className="pt-2 font-semibold text-text-secondary">
                    {i + 1}.
                  </span>
                  <Input
                    aria-label={`Paso ${i + 1}`}
                    className="flex-1"
                    value={text}
                    onChange={(e) =>
                      set(
                        "steps",
                        draft.steps.map((s, j) =>
                          j === i ? e.target.value : s,
                        ),
                      )
                    }
                  />
                  {i > 0 && (
                    <button
                      type="button"
                      aria-label={`Subir paso ${i + 1}`}
                      className={small}
                      onClick={() => set("steps", move(draft.steps, i, i - 1))}
                    >
                      ↑
                    </button>
                  )}
                  {i < draft.steps.length - 1 && (
                    <button
                      type="button"
                      aria-label={`Bajar paso ${i + 1}`}
                      className={small}
                      onClick={() => set("steps", move(draft.steps, i, i + 1))}
                    >
                      ↓
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Quitar paso ${i + 1}`}
                    className={small}
                    onClick={() =>
                      set(
                        "steps",
                        draft.steps.filter((_, j) => j !== i),
                      )
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            <Button
              variant="secondary"
              className="mt-2"
              onClick={() => set("steps", [...draft.steps, ""])}
            >
              Añadir paso
            </Button>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Materiales</h3>
            <ul className="mb-2 flex flex-wrap gap-2">
              {draft.materials.map((m) => (
                <li
                  key={m}
                  className="flex items-center gap-1 rounded-chip bg-surface-muted px-3 py-1"
                >
                  {m}
                  <button
                    type="button"
                    aria-label={`Quitar material ${m}`}
                    onClick={() =>
                      set(
                        "materials",
                        draft.materials.filter((x) => x !== m),
                      )
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                aria-label="Nuevo material"
                className="w-full"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              />
              <Button
                variant="secondary"
                onClick={() =>
                  addChip("materials", material, () => setMaterial(""))
                }
              >
                Añadir material
              </Button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Etiquetas</h3>
            <ul className="mb-2 flex flex-wrap gap-2">
              {draft.tags.map((t) => (
                <li
                  key={t}
                  className="flex items-center gap-1 rounded-chip bg-done-bg px-3 py-1 text-done-text"
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Quitar etiqueta ${t}`}
                    onClick={() =>
                      set(
                        "tags",
                        draft.tags.filter((x) => x !== t),
                      )
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                aria-label="Nueva etiqueta"
                className="w-full"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
              <Button
                variant="secondary"
                onClick={() => addChip("tags", tag, () => setTag(""))}
              >
                Añadir etiqueta
              </Button>
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={cancel}>
              Cancelar
            </Button>
            <Button disabled={api.saving || uploading} onClick={save}>
              {api.saving || uploading ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
