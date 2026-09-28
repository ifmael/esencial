// E8: página "Nueva receta" en /recetario/nueva. Misma mecánica de draft que el
// modal recipe-editor (D2), pero como página: una columna en móvil y dos en lg,
// dropzone con subida a /api/uploads (contrato fail-closed: 200 {photo_path},
// 400 {error, field:"file"}) y preview por photo_path. description/servings
// salen null. Guardar es un botón dividido: «Guardar receta» vuelve al
// recetario; «Guardar y añadir otra» (mismo POST) deja el formulario vacío.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Loader, Shape } from "../components/expressive";
import {
  AddIcon,
  BookIcon,
  CheckIcon,
  CloseIcon,
  PhotoIcon,
} from "../components/icons";
import { useSnackbar } from "../components/overlay";
import {
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
  ripple,
  Select,
  SplitButton,
} from "../components/ui";
import { ApiError, apiFetch, photoSrc } from "../lib/api";
import { useCreateMorph } from "../lib/view-transition";

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

/** Posición en la entrada escalonada (`.stagger`). */
const at = (i: number) => ({ ["--i" as string]: i });

const setRow = (rows: IngRow[], i: number, patch: Partial<IngRow>): IngRow[] =>
  rows.map((r, j) => (j === i ? { ...r, ...patch } : r));

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
  const nameInput = useRef<HTMLInputElement>(null);
  const snackbar = useSnackbar();
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

  const busy = api.saving || uploading;

  /** Un solo POST. Sin `another` vuelve al recetario; con él deja el
   * formulario vacío (y la subida pendiente descartada) para la siguiente. */
  const save = async (another = false) => {
    if (busy) return;
    if (!draft.name.trim()) {
      setNameError("El nombre es obligatorio");
      nameInput.current?.focus();
      return;
    }
    setNameError(null);
    const photoKey = await ensurePhotoUploaded();
    if (photoKey === null) return;
    const ok = await api.create(payload(photoKey));
    if (!ok) return;
    if (!another) {
      navigate("/recetario");
      return;
    }
    uploadSessionRef.current += 1;
    pendingFileRef.current = null;
    photoRemovedRef.current = false;
    setUploadError(null);
    setMaterial("");
    setTag("");
    setDraft(blank());
    snackbar({ message: "Receta guardada" });
    nameInput.current?.focus();
  };

  const morph = useCreateMorph();
  const serverNameError =
    api.fieldError?.field === "name" ? api.fieldError.message : null;

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
            <h1 className="text-headline-l text-e">Nueva receta</h1>
            <p className="text-body-m">
              Foto, ingredientes y pasos en una sola página.
            </p>
          </div>
        </div>
        <SplitButton
          onClick={() => save()}
          menuLabel="Más opciones de guardado"
          disabled={busy}
          items={[
            {
              label: "Guardar y añadir otra",
              icon: <AddIcon className="text-on-surface-variant" />,
              onSelect: () => save(true),
            },
          ]}
        >
          {busy ? "Guardando…" : "Guardar receta"}
        </SplitButton>
      </header>

      {api.fieldError && api.fieldError.field !== "name" && (
        <Alert tone="error">
          <p className="text-body-m">{api.fieldError.message}</p>
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
                    <option value="gr">gr</option>
                    <option value="ml">ml</option>
                    <option value="ud">ud</option>
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
