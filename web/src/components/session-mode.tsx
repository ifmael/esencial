// Modo interactivo de sesión (gimnasio): un ejercicio a la vez, pausas con
// barra y cuenta atrás (automáticas al marcar una serie, o a mano) y la tira
// de series de siempre. Reemplaza la página mientras está abierto; el borrador
// sigue debajo: «Salir» vuelve a él sin tocar nada y «Terminar» hace lo de
// «Guardar» (lo cierra el padre). Los descansos son por ejercicio y
// opcionales: sin ellos el ejercicio se comporta como la página normal (sin
// pausa ni pitido).
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { pushEscape } from "../lib/escape-stack";
import { type ExerciseKind, KIND_LABELS } from "../lib/exercises";
import { beep, startPauseAudio, stopPauseAudio } from "../lib/rest-audio";
import type { ShapeName } from "../lib/shapes";
import { useWakeLock } from "../lib/wake-lock";
import { Shape, useReducedMotion, WavyProgress } from "./expressive";
import { CloseIcon } from "./icons";
import { Button, Checkbox, ScrollStrip } from "./ui";

/** Un ejercicio del modo: fuerza con su tira de series, o cardio con «Hecho». */
export type ModeItem = {
  id: number;
  name: string;
  kind: ExerciseKind;
  /** «3 series» / «5 km · 30 min» (targetSummary). */
  objective: string | null;
  /** Series (fuerza) o null (cardio, con `done`). */
  sets: { done: boolean; filled: boolean }[] | null;
  done: boolean | null;
  /** Pausa entre series y al terminar el ejercicio, en segundos; null = sin
   *  descanso programado. */
  restSecs: number | null;
  restAfterSecs: number | null;
};

type Pause = { kind: "sets" | "after"; durationMs: number; endsAt: number };

const BACKDROP_SHAPES: ShapeName[] = [
  "cookie-12",
  "flower",
  "soft-diamond",
  "sunny",
];
const BACKDROP_MS = 4000;

/** mm:ss del reloj de la pausa. */
function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Fondo abstracto: una forma M3E grande que se transforma despacio; con
 *  `prefers-reduced-motion` se queda quieta. */
function ModeBackdrop() {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(
      () => setI((n) => (n + 1) % BACKDROP_SHAPES.length),
      BACKDROP_MS,
    );
    return () => clearInterval(id);
  }, [reduced]);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden"
    >
      <Shape
        name={BACKDROP_SHAPES[i]}
        size={480}
        className="text-accent-container opacity-30"
      />
    </div>
  );
}

export function SessionMode({
  items,
  onToggleSet,
  onToggleCardio,
  onExit,
  onFinish,
  finishControl,
  canFinish,
  saving,
}: {
  items: ModeItem[];
  onToggleSet: (id: number, index: number) => void;
  onToggleCardio: (id: number) => void;
  onExit: () => void;
  /** = «Guardar» de la sesión (lo ejecuta el padre). */
  onFinish: () => void;
  /** Selector de esfuerzo: cerrar la sesión exige esfuerzo, como «Guardar». */
  finishControl: ReactNode;
  canFinish: boolean;
  saving: boolean;
}) {
  const [active, setActive] = useState(0);
  const [pause, setPause] = useState<Pause | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Un cierre de pausa solo dispara una vez (el tic y el regreso pueden
  // coincidir); saltarla lo marca para que no pite después.
  const finished = useRef(false);

  useWakeLock(true);
  useEffect(() => pushEscape(onExit), [onExit]);
  // Al desmontar (salir o terminar) no queda sonando nada.
  useEffect(() => stopPauseAudio, []);

  const item = items[Math.min(active, items.length - 1)];
  const last = active >= items.length - 1;

  const advance = useCallback(
    () => setActive((i) => Math.min(i + 1, items.length - 1)),
    [items.length],
  );

  const finishPause = useCallback(
    (kind: Pause["kind"]) => {
      if (finished.current) return;
      finished.current = true;
      stopPauseAudio();
      beep();
      setPause(null);
      if (kind === "after") advance();
    },
    [advance],
  );

  // El reloj de la pausa: tics para la cuenta atrás y, al llegar a `endsAt`,
  // el pitido. Al volver a la pestaña se resincroniza de inmediato — si el
  // navegador ralentizó o suspendió los timers en segundo plano, el pitido
  // suena tarde, o aquí si nunca llegó a sonar.
  useEffect(() => {
    if (!pause) return;
    const tick = () => {
      setNow(Date.now());
      if (Date.now() >= pause.endsAt) finishPause(pause.kind);
    };
    const id = setInterval(tick, 250);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pause, finishPause]);

  const startPause = (seconds: number, kind: Pause["kind"]) => {
    finished.current = false;
    startPauseAudio();
    const durationMs = seconds * 1000;
    setPause({ kind, durationMs, endsAt: Date.now() + durationMs });
    setNow(Date.now());
  };

  const skipPause = () => {
    if (!pause) return;
    finished.current = true; // saltar no pita
    stopPauseAudio();
    const { kind } = pause;
    setPause(null);
    if (kind === "after") advance();
  };

  const toggleSet = (index: number) => {
    if (!item.sets) return;
    const willDo = !item.sets[index].done;
    onToggleSet(item.id, index);
    if (!willDo) return;
    const isLast = index === item.sets.length - 1;
    if (isLast) {
      if (item.restAfterSecs !== null) startPause(item.restAfterSecs, "after");
      else advance();
    } else if (item.restSecs !== null) {
      startPause(item.restSecs, "sets");
    }
  };

  const toggleCardio = () => {
    if (item.done === null) return;
    const willDo = !item.done;
    onToggleCardio(item.id);
    if (!willDo) return;
    if (item.restAfterSecs !== null) startPause(item.restAfterSecs, "after");
    else advance();
  };

  const remainingMs = pause ? Math.max(0, pause.endsAt - now) : 0;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Modo sesión"
      className="fixed inset-0 z-50 flex flex-col bg-surface text-on-surface"
    >
      <ModeBackdrop />
      <header className="relative flex items-center gap-3 p-4">
        <Button
          variant="text"
          size="icon"
          aria-label="Salir del modo sesión"
          onClick={onExit}
        >
          <CloseIcon />
        </Button>
        <span className="flex-1 text-label-l text-on-surface-variant">
          <span aria-hidden="true" className="tabular">
            {active + 1} / {items.length}
          </span>
          <span className="sr-only">
            Ejercicio {active + 1} de {items.length}
          </span>
        </span>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 pb-2 text-center">
        <p className="section-label text-accent">{KIND_LABELS[item.kind]}</p>
        <h2 className="text-display-s text-e">{item.name}</h2>
        {item.objective && (
          <p className="tabular text-title-m text-on-surface-variant">
            {item.objective}
          </p>
        )}

        {item.sets && (
          <>
            {item.sets.length > 0 && (
              <ScrollStrip className="flex w-full items-center justify-center gap-2">
                {item.sets.map((s, i) => (
                  <Checkbox
                    key={i}
                    className="shrink-0"
                    aria-label={`${item.name} serie ${i + 1}`}
                    checked={s.done}
                    disabled={!s.done && !s.filled}
                    onChange={() => toggleSet(i)}
                  />
                ))}
              </ScrollStrip>
            )}
            {item.restSecs === null && (
              <p className="text-body-s text-on-surface-variant">
                Sin descanso programado
              </p>
            )}
          </>
        )}

        {item.done !== null && (
          <div className="flex items-center gap-2 text-title-m">
            <Checkbox
              aria-label={`${item.name} hecho`}
              checked={item.done}
              onChange={toggleCardio}
            />
            Hecho
          </div>
        )}

        {pause && (
          <div className="flex w-full max-w-sm flex-col items-center gap-2">
            <WavyProgress
              className="w-full"
              value={pause.durationMs - remainingMs}
              max={pause.durationMs}
              label={
                pause.kind === "sets"
                  ? `Pausa entre series de ${item.name}`
                  : `Pausa al terminar ${item.name}`
              }
            />
            <span className="tabular text-display-m">
              {formatCountdown(remainingMs)}
            </span>
            <Button variant="tonal" onClick={skipPause}>
              Saltar
            </Button>
          </div>
        )}
      </div>

      <footer className="relative flex flex-col gap-3 p-4 pb-6">
        {finishControl}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="tonal"
            disabled={
              item.sets === null || item.restSecs === null || pause !== null
            }
            onClick={() =>
              item.restSecs !== null && startPause(item.restSecs, "sets")
            }
          >
            Descanso
          </Button>
          <Button
            variant="outlined"
            disabled={last || pause !== null}
            onClick={advance}
          >
            Siguiente
          </Button>
          <Button disabled={!canFinish || saving} onClick={onFinish}>
            {saving ? "Guardando…" : "Terminar"}
          </Button>
        </div>
      </footer>
    </section>
  );
}
