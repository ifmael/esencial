// Crea un alimento del catálogo desde el editor de recetas: nombre y valores
// por 100 g de la etiqueta; el peso de una unidad es opcional (para «ud»).
import { type FormEvent, useState } from "react";
import { ApiError } from "../../lib/api";
import { Dialog, OverlayHeader } from "../overlay";
import { Alert, Button, Field, Input } from "../ui";
import type { Food, FoodInput } from "./use-foods";

const NUMBERS = [
  ["kcal", "Calorías (por 100 g)"],
  ["protein", "Proteínas (g)"],
  ["fat", "Grasas (g)"],
  ["carbs", "Carbohidratos (g)"],
] as const;

type NumberKey = (typeof NUMBERS)[number][0];

export function NewFoodDialog({
  initialName,
  onCreate,
  onCreated,
  onClose,
}: {
  initialName: string;
  onCreate: (input: FoodInput) => Promise<Food>;
  onCreated: (food: Food) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [values, setValues] = useState<Record<NumberKey, string>>({
    kcal: "",
    protein: "",
    fat: "",
    carbs: "",
  });
  const [unit, setUnit] = useState("");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const missing: Partial<Record<string, string>> = {};
    if (!name.trim()) missing.name = "El nombre es obligatorio";
    for (const [key] of NUMBERS)
      if (values[key].trim() === "") missing[key] = "Obligatorio";
    setErrors(missing);
    setFailed(false);
    if (Object.keys(missing).length) return;
    setBusy(true);
    try {
      onCreated(
        await onCreate({
          name: name.trim(),
          kcal: Number(values.kcal),
          protein: Number(values.protein),
          fat: Number(values.fat),
          carbs: Number(values.carbs),
          gramsPerUnit: unit.trim() ? Number(unit) : null,
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.field === "name")
        setErrors({ name: "Ya existe un alimento con ese nombre" });
      else if (err instanceof ApiError && err.field)
        setErrors({ [err.field]: "Valor no válido" });
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      labelledBy="new-food-title"
      mobile="sheet"
      className="md:max-w-md"
    >
      <OverlayHeader
        id="new-food-title"
        title="Nuevo alimento"
        onClose={onClose}
      />
      <form
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-4 px-6 pt-2 pb-6"
      >
        <Field label="Nombre" error={errors.name}>
          {(a11y) => (
            <Input
              {...a11y}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {NUMBERS.map(([key, label]) => (
            <Field key={key} label={label} error={errors[key]}>
              {(a11y) => (
                <Input
                  {...a11y}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  className="tabular"
                  value={values[key]}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [key]: e.target.value }))
                  }
                />
              )}
            </Field>
          ))}
        </div>
        <Field
          label="Peso de una unidad (g)"
          support="Opcional: para contar ingredientes en «ud» (un huevo, 55 g)."
          error={errors.gramsPerUnit}
        >
          {(a11y) => (
            <Input
              {...a11y}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              className="tabular"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          )}
        </Field>
        {failed && (
          <Alert>No se pudo crear el alimento. Inténtalo de nuevo.</Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="text" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Crear
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
