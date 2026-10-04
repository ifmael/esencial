// Contador con −/+ y su nombre visible delante («Peso (kg)  −  55  +»). El
// `context` («Press banca serie 1») completa el nombre accesible del campo y de
// los dos botones, para que el lector de pantalla distinga un campo de otro.
// Lo comparten la sesión (borrador) y su modo interactivo.
import { Button, Input } from "./ui";

export function Stepper({
  caption,
  context,
  value,
  step,
  onValue,
  onStep,
}: {
  caption: string;
  context: string;
  value: number | null;
  step: number;
  onValue: (v: string) => void;
  onStep: (d: number) => void;
}) {
  const label = `${caption} · ${context}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/* Sin `<label>`: el primer control etiquetable sería el botón «−». */}
      <span className="px-1 text-label-m text-on-surface-variant">
        {caption}
      </span>
      <div className="flex items-center gap-1">
        <Button
          aria-label={`Reducir ${label}`}
          variant="tonal"
          size="icon"
          className="text-title-l"
          onClick={() => onStep(-step)}
        >
          −
        </Button>
        <Input
          type="number"
          inputMode="decimal"
          aria-label={label}
          className="tabular min-w-0 flex-1 px-0 text-center text-title-m"
          value={value === null ? "" : String(value)}
          onChange={(e) => onValue(e.target.value)}
        />
        <Button
          aria-label={`Aumentar ${label}`}
          variant="tonal"
          size="icon"
          className="text-title-l"
          onClick={() => onStep(step)}
        >
          +
        </Button>
      </div>
    </div>
  );
}
