// E8: página "Nueva receta" en /recetario/nueva. Misma mecánica de draft que el
// modal recipe-editor (D2), pero como página: grid de dos columnas, dropzone
// con subida a /api/uploads (contrato fail-closed: 200 {photo_path}, 400 {error,
// field:"file"}) y preview por photo_path. description/servings salen null.
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  type RecipeInput,
  useRecipes,
} from "../components/recipes/use-recipes";
import { Button, buttonClass, Card, Input, Select } from "../components/ui";
import { ApiError, apiFetch, photoSrc } from "../lib/api";

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
const small = "rounded-lg border border-border bg-surface px-2 py-1";
const label = "mb-1 block text-sm font-medium text-text-secondary";

const setRow = (rows: IngRow[], i: number, patch: Partial<IngRow>): IngRow[] =>
  rows.map((r, j) => (j === i ? { ...r, ...patch } : r));

const move = (items: string[], from: number, to: number): string[] => {
  const next = [...items];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

export function NuevaRecetaPage() {
  const api = useRecipes();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(blank);
  const draftRef = useRef(draft);
  draftRef.current = draft; // lectura fresca tras cualquier await
  const [nameError, setNameError] = useState<string | null>(null);
  const [material, setMaterial] = useState("");
  const [tag, setTag] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const pendingFileRef = useRef<File | null>(null);
  // Id de la selección activa: cualquier invalidación lo incrementa y las
  // respuestas de subidas anteriores (en vuelo o retenidas) se descartan.
  const uploadSessionRef = useRef(0);
  // Distingue la ELIMINACIÓN explícita (Quitar foto) del mero descarte del
  // reintento: solo la primera vacía la foto.
  const photoRemovedRef = useRef(false);

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
    description: null,
    servings: null,
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
    const photoKey = await ensurePhotoUploaded();
    if (photoKey === null) return;
    const ok = await api.create(payload(photoKey));
    if (ok) navigate("/recetario");
  };

  const serverNameError =
    api.fieldError?.field === "name" ? api.fieldError.message : null;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Nueva receta</h1>
        <Button disabled={api.saving || uploading} onClick={save}>
          {api.saving || uploading ? "Guardando…" : "Guardar"}
        </Button>
      </header>

      {api.fieldError && api.fieldError.field !== "name" && (
        <div
          className="mb-4 rounded-lg bg-error/10 p-3 text-error"
          role="alert"
        >
          {api.fieldError.message}{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={save}
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 font-semibold">Foto principal</h3>
          <Card>
            {draft.photo_path ? (
              <>
                <img
                  src={photoSrc(draft.photo_path)}
                  alt="Vista previa de la foto"
                  className="h-40 w-full rounded-lg object-cover"
                />
                <Button
                  variant="secondary"
                  className="mt-2"
                  onClick={removePhoto}
                >
                  Quitar foto
                </Button>
              </>
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
              <div className="mt-2 flex items-center gap-3" role="alert">
                <p className="text-sm text-error">{uploadError}</p>
                <Button variant="secondary" onClick={discardPendingUpload}>
                  Descartar
                </Button>
              </div>
            )}
            <label
              className={buttonClass({
                variant: "secondary",
                className: `mt-2 inline-block cursor-pointer ${
                  uploading ? "opacity-50 pointer-events-none" : ""
                }`,
              })}
            >
              Elegir foto
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
            </label>
          </Card>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Nombre</h3>
          <Input
            aria-label="Nombre"
            className="w-full"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
          />
          {(nameError ?? serverNameError) && (
            <p className="mt-1 text-sm text-error">
              {nameError ?? serverNameError}
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Categorías</h3>
          <ul className="flex flex-wrap gap-2">
            {BASE_TAGS.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  className={chip(draft.tags.includes(t))}
                  onClick={() => toggleTag(t)}
                >
                  {t}
                </button>
              </li>
            ))}
            {draft.tags
              .filter((t) => !BASE_TAGS.includes(t))
              .map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    className={chip(true)}
                    onClick={() => toggleTag(t)}
                  >
                    {t}
                  </button>
                </li>
              ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Input
              aria-label="Nueva categoría"
              className="w-full"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => addChip("tags", tag, () => setTag(""))}
            >
              Añadir categoría
            </Button>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Materiales</h3>
          <ul className="mb-2 flex flex-wrap gap-2">
            {draft.materials.map((m) => (
              <li
                key={m}
                className="flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1"
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
                      setRow(draft.ingredients, i, { food: e.target.value }),
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
                      setRow(draft.ingredients, i, {
                        quantity: e.target.value,
                      }),
                    )
                  }
                />
                <Select
                  aria-label={`Ingrediente ${i + 1} unidad`}
                  value={row.unit}
                  onChange={(e) =>
                    set(
                      "ingredients",
                      setRow(draft.ingredients, i, { unit: e.target.value }),
                    )
                  }
                >
                  <option value="">—</option>
                  <option value="gr">gr</option>
                  <option value="ml">ml</option>
                  <option value="ud">ud</option>
                </Select>
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
      </div>
    </div>
  );
}
