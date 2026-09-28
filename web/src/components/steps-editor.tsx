// Lista de pasos numerados editable: un campo por paso, subir/bajar/quitar y
// «Añadir paso». La comparten «Nueva receta» y el editor de ejercicios.
import { moveItem } from "../lib/template-draft";
import { Shape } from "./expressive";
import { AddIcon, ChevronDownIcon, CloseIcon } from "./icons";
import { Button, cx, Input } from "./ui";

export function StepsEditor({
  steps,
  onChange,
}: {
  steps: string[];
  onChange: (steps: string[]) => void;
}) {
  return (
    <>
      <ol className="flex flex-col gap-3">
        {steps.map((text, i) => (
          <li key={i} className="flex items-start gap-3">
            <Shape
              name="cookie-4"
              size={40}
              className="mt-1 text-accent-container"
            >
              <span className="text-label-l text-e text-on-accent-container tabular">
                {i + 1}
              </span>
            </Shape>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              <Input
                aria-label={`Paso ${i + 1}`}
                className="basis-full sm:basis-0 sm:flex-1"
                value={text}
                onChange={(e) =>
                  onChange(steps.map((s, j) => (j === i ? e.target.value : s)))
                }
              />
              <div className="ml-auto flex">
                {i > 0 && (
                  <Button
                    variant="text"
                    size="icon"
                    aria-label={`Subir paso ${i + 1}`}
                    onClick={() => onChange(moveItem(steps, i, i - 1))}
                  >
                    <ChevronDownIcon className="rotate-180" />
                  </Button>
                )}
                {i < steps.length - 1 && (
                  <Button
                    variant="text"
                    size="icon"
                    aria-label={`Bajar paso ${i + 1}`}
                    onClick={() => onChange(moveItem(steps, i, i + 1))}
                  >
                    <ChevronDownIcon />
                  </Button>
                )}
                <Button
                  variant="text"
                  size="icon"
                  aria-label={`Quitar paso ${i + 1}`}
                  onClick={() => onChange(steps.filter((_, j) => j !== i))}
                >
                  <CloseIcon />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <Button
        variant="outlined"
        className={cx("self-start", steps.length > 0 && "ml-13")}
        onClick={() => onChange([...steps, ""])}
      >
        <AddIcon />
        Añadir paso
      </Button>
    </>
  );
}
