// E2 editor (D2): create/edit recipe as a modal overlay. Cancel = close, no API
// call; save POSTs/PUTs the whole draft; field errors render beside the field.
import { useRef, useState } from "react";
import { apiField, photoSrc, apiFetch } from "../../lib/api";
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

const field = "w-full rounded-lg border border-border bg-surface px-3 py-2";
const small = "rounded-lg border border-border bg-surface px-2 py-1";
const label = "mb-1 block text-sm font-medium text-text-secondary";

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
  recipe: Recipe | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => (recipe ? fromRecipe(recipe) : blank()));
  const [nameError, setNameError] = useState<string | null>(null);
  const [material, setMaterial] = useState("");
  const [tag, setTag] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const title = recipe ? "Editar receta" : "Nueva receta";

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const addChip = (key: "materials" | "tags", value: string, clear: () => void) => {
    const v = value.trim();
    if (v && !draft[key].includes(v)) set(key, [...draft[key], v]);
    clear();
  };

  const onFile = async (file: File) => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { photo_path } = await apiFetch<{ photo_path: string }>("/api/uploads", {
        method: "POST",
        body: fd,
      });
      set("photo_path", photo_path);
    } catch (e) {
      setUploadError(
        apiField(e) === "file"
          ? "No se pudo subir el archivo. Inténtalo de nuevo."
          : "No se pudo conectar con el servidor.",
      );
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const payload = (): RecipeInput => ({
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    servings: draft.servings.trim() ? Number(draft.servings) : null,
    photo_path: draft.photo_path.trim() || null,
    ingredients: draft.ingredients
      .filter((i) => i.food.trim())
      .map((i) => ({
        food: i.food.trim(),
        quantity: i.quantity.trim() ? Number(i.quantity) : null,
        unit: i.unit.trim() || null,
      })),
    steps: draft.steps.map((s) => s.trim()).filter(Boolean),
    materials: draft.materials,
    tags: draft.tags,
  });

  const save = async () => {
    if (api.saving || uploading) return;
    if (!draft.name.trim()) {
      setNameError("El nombre es obligatorio");
      return;
    }
    setNameError(null);
    const ok = recipe ? await api.update(recipe.id, payload()) : await api.create(payload());
    if (ok) onClose();
  };

  const serverNameError = api.fieldError?.field === "name" ? api.fieldError.message : null;
  const otherFieldError =
    api.fieldError && api.fieldError.field !== "name" ? api.fieldError.message : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className="card my-8 w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl font-bold">{title}</h2>

        {(otherFieldError || api.error) && (
          <div className="mb-4 rounded-lg bg-error/10 p-3 text-error" role="alert">
            {otherFieldError ?? api.error}{" "}
            <button type="button" className="font-semibold underline" onClick={save}>
              Reintentar
            </button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <label className={label} htmlFor="recipe-name">
              Nombre
            </label>
            <input
              id="recipe-name"
              aria-label="Nombre"
              className={field}
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
            />
            {(nameError ?? serverNameError) && (
              <p className="mt-1 text-sm text-error">{nameError ?? serverNameError}</p>
            )}
          </div>

          <div>
            <label className={label} htmlFor="recipe-desc">
              Descripción
            </label>
            <textarea
              id="recipe-desc"
              aria-label="Descripción"
              className={field}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className={label} htmlFor="recipe-servings">
                Comensales
              </label>
              <input
                id="recipe-servings"
                aria-label="Comensales"
                type="number"
                min={1}
                className={field}
                value={draft.servings}
                onChange={(e) => set("servings", e.target.value)}
              />
            </div>
            <div className="flex-[2]">
              <span className={label}>Foto</span>
              {draft.photo_path ? (
                <div className="flex items-center gap-3">
                  <img src={photoSrc(draft.photo_path)} alt="Foto actual" className="h-12 w-12 rounded-lg object-cover" />
                  <button type="button" className="btn-secondary" onClick={() => set("photo_path", "")}>
                    Quitar
                  </button>
                </div>
              ) : (
                <label className="btn-secondary inline-block cursor-pointer">
                  Subir foto
                  <input
                    id="recipe-photo"
                    aria-label="Foto"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void onFile(f);
                    }}
                  />
                </label>
              )}
              {uploadError && (
                <p className="mt-2 text-sm text-error" role="alert">
                  {uploadError}
                </p>
              )}
            </div>
          </div>

          <section>
            <h3 className="mb-2 font-semibold">Ingredientes</h3>
            <ul className="flex flex-col gap-2">
              {draft.ingredients.map((row, i) => (
                <li key={i} className="flex gap-2">
                  <input
                    aria-label={`Ingrediente ${i + 1} alimento`}
                    className={`${field} flex-1`}
                    placeholder="alimento"
                    value={row.food}
                    onChange={(e) =>
                      set(
                        "ingredients",
                        draft.ingredients.map((r, j) => (j === i ? { ...r, food: e.target.value } : r)),
                      )
                    }
                  />
                  <input
                    aria-label={`Ingrediente ${i + 1} cantidad`}
                    className={`${small} w-20`}
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
                  <input
                    aria-label={`Ingrediente ${i + 1} unidad`}
                    className={`${small} w-20`}
                    placeholder="unidad"
                    value={row.unit}
                    onChange={(e) =>
                      set(
                        "ingredients",
                        draft.ingredients.map((r, j) => (j === i ? { ...r, unit: e.target.value } : r)),
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
            <button
              type="button"
              className="btn-secondary mt-2"
              onClick={() => set("ingredients", [...draft.ingredients, { food: "", quantity: "", unit: "" }])}
            >
              Añadir ingrediente
            </button>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Pasos</h3>
            <ol className="flex flex-col gap-2">
              {draft.steps.map((text, i) => (
                <li key={i} className="flex gap-2">
                  <span className="pt-2 font-semibold text-text-secondary">{i + 1}.</span>
                  <input
                    aria-label={`Paso ${i + 1}`}
                    className={`${field} flex-1`}
                    value={text}
                    onChange={(e) =>
                      set(
                        "steps",
                        draft.steps.map((s, j) => (j === i ? e.target.value : s)),
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
                    onClick={() => set("steps", draft.steps.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="btn-secondary mt-2"
              onClick={() => set("steps", [...draft.steps, ""])}
            >
              Añadir paso
            </button>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Materiales</h3>
            <ul className="mb-2 flex flex-wrap gap-2">
              {draft.materials.map((m) => (
                <li key={m} className="flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1">
                  {m}
                  <button
                    type="button"
                    aria-label={`Quitar material ${m}`}
                    onClick={() => set("materials", draft.materials.filter((x) => x !== m))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                aria-label="Nuevo material"
                className={field}
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => addChip("materials", material, () => setMaterial(""))}
              >
                Añadir material
              </button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Etiquetas</h3>
            <ul className="mb-2 flex flex-wrap gap-2">
              {draft.tags.map((t) => (
                <li key={t} className="flex items-center gap-1 rounded-full bg-done-bg px-3 py-1 text-done-text">
                  {t}
                  <button
                    type="button"
                    aria-label={`Quitar etiqueta ${t}`}
                    onClick={() => set("tags", draft.tags.filter((x) => x !== t))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                aria-label="Nueva etiqueta"
                className={field}
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => addChip("tags", tag, () => setTag(""))}
              >
                Añadir etiqueta
              </button>
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" disabled={api.saving || uploading} onClick={save}>
              {api.saving || uploading ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
