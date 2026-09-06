// E8: página "Nueva receta" en /recetario/nueva. Misma mecánica de draft que el
// modal recipe-editor (D2), pero como página: grid de dos columnas, dropzone
// con subida a /api/uploads (contrato fail-closed: 201 {path}, 400 {error,
// field:"file"}) y preview por photo_path. description/servings salen null.
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useRecipes, type RecipeInput } from "../components/recipes/use-recipes";

import { apiFetch, apiField } from "../lib/api";

type IngRow = { food: string; quantity: string; unit: string };

type Draft = {
  name: string;
  photo_path: string;
  ingredients: IngRow[];
  steps: string[];
  materials: string[];
  tags: string[];
};

const blank = (): Draft => ({
  name: "",
  photo_path: "",
  ingredients: [{ food: "", quantity: "", unit: "" }],
  steps: [""],
  materials: [],
  tags: [],
});

const BASE_TAGS = ["Desayuno", "Almuerzo", "Cena", "Snack"];

const chip = (active: boolean) =>
  `rounded-full border border-border px-3 py-1 text-sm transition-colors ${
    active ? "bg-primary-container text-white" : "bg-surface-muted"
  }`;
const field = "w-full rounded-lg border border-border bg-surface px-3 py-2";
const small = "rounded-lg border border-border bg-surface px-2 py-1";
const label = "mb-1 block text-sm font-medium text-text-secondary";

const setRow = (rows: IngRow[], i: number, patch: Partial<IngRow>): IngRow[] =>
  rows.map((r, j) => (j === i ? { ...r, ...patch } : r));

export function NuevaRecetaPage() {
  const api = useRecipes();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(blank);
  const [nameError, setNameError] = useState<string | null>(null);
  const [material, setMaterial] = useState("");
  const [tag, setTag] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const toggleTag = (t: string) =>
    set("tags", draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t]);

  const addChip = (key: "materials" | "tags", value: string, clear: () => void) => {
    const v = value.trim();
    if (v && !draft[key].includes(v)) set(key, [...draft[key], v]);
    clear();
  };

  const onFile = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { path } = await apiFetch<{ path: string }>("/api/uploads", { method: "POST", body: fd });
      set("photo_path", path);
    } catch (e) {
      setUploadError(
        apiField(e) === "file"
          ? "No se pudo subir el archivo. Inténtalo de nuevo."
          : "No se pudo conectar con el servidor.",
      );
    } finally {
      setUploading(false);
    }
  };

  const payload = (): RecipeInput => ({
    name: draft.name.trim(),
    description: null,
    servings: null,
    photo_path: draft.photo_path || null,
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
    if (api.saving) return;
    if (!draft.name.trim()) {
      setNameError("El nombre es obligatorio");
      return;
    }
    setNameError(null);
    const ok = await api.create(payload());
    if (ok) navigate("/recetario");
  };

  const serverNameError = api.fieldError?.field === "name" ? api.fieldError.message : null;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Nueva receta</h1>
        <button type="button" className="btn-primary" disabled={api.saving} onClick={save}>
          {api.saving ? "Guardando…" : "Guardar"}
        </button>
      </header>

      {api.fieldError && api.fieldError.field !== "name" && (
        <div className="mb-4 rounded-lg bg-error/10 p-3 text-error" role="alert">
          {api.fieldError.message}{" "}
          <button type="button" className="font-semibold underline" onClick={save}>
            Reintentar
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 font-semibold">Foto principal</h3>
          <div className="card">
            {draft.photo_path ? (
              <img src={draft.photo_path} alt="Vista previa de la foto" className="h-40 w-full rounded-lg object-cover" />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-lg bg-surface-muted text-sm text-text-secondary">
                Sin foto
              </div>
            )}
            {uploading && (
              <p className="mt-2 text-sm text-text-secondary" role="status">
                Subiendo…
              </p>
            )}
            {uploadError && (
              <p className="mt-2 text-sm text-error" role="alert">
                {uploadError}
              </p>
            )}
            <label className="btn-secondary mt-2 inline-block cursor-pointer">
              Elegir foto
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Nombre</h3>
          <input
            aria-label="Nombre"
            className={field}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
          />
          {(nameError ?? serverNameError) && (
            <p className="mt-1 text-sm text-error">{nameError ?? serverNameError}</p>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Categorías</h3>
          <ul className="flex flex-wrap gap-2">
            {BASE_TAGS.map((t) => (
              <li key={t}>
                <button type="button" className={chip(draft.tags.includes(t))} onClick={() => toggleTag(t)}>
                  {t}
                </button>
              </li>
            ))}
            {draft.tags
              .filter((t) => !BASE_TAGS.includes(t))
              .map((t) => (
                <li key={t}>
                  <button type="button" className={chip(true)} onClick={() => toggleTag(t)}>
                    {t}
                  </button>
                </li>
              ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              aria-label="Nueva categoría"
              className={field}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => addChip("tags", tag, () => setTag(""))}
            >
              Añadir categoría
            </button>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Materiales</h3>
          <ul className="mb-2 flex flex-wrap gap-2">
            {draft.materials.map((m) => (
              <li key={m} className="flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1">
                {m}
                <button type="button" aria-label={`Quitar material ${m}`} onClick={() => set("materials", draft.materials.filter((x) => x !== m))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input aria-label="Nuevo material" className={field} value={material} onChange={(e) => setMaterial(e.target.value)} />
            <button type="button" className="btn-secondary" onClick={() => addChip("materials", material, () => setMaterial(""))}>
              Añadir material
            </button>
          </div>
        </section>

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
                  onChange={(e) => set("ingredients", setRow(draft.ingredients, i, { food: e.target.value }))}
                />
                <input
                  aria-label={`Ingrediente ${i + 1} cantidad`}
                  className={`${small} w-20`}
                  type="number"
                  placeholder="cant."
                  value={row.quantity}
                  onChange={(e) => set("ingredients", setRow(draft.ingredients, i, { quantity: e.target.value }))}
                />
                <select
                  aria-label={`Ingrediente ${i + 1} unidad`}
                  className={small}
                  value={row.unit}
                  onChange={(e) => set("ingredients", setRow(draft.ingredients, i, { unit: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="gr">gr</option>
                  <option value="ml">ml</option>
                  <option value="ud">ud</option>
                </select>
                <button
                  type="button"
                  aria-label={`Quitar ingrediente ${i + 1}`}
                  className={small}
                  onClick={() => set("ingredients", draft.ingredients.filter((_, j) => j !== i))}
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
                  onChange={(e) => set("steps", draft.steps.map((s, j) => (j === i ? e.target.value : s)))}
                />
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
          <button type="button" className="btn-secondary mt-2" onClick={() => set("steps", [...draft.steps, ""])}>
            Añadir paso
          </button>
        </section>
      </div>
    </div>
  );
}
