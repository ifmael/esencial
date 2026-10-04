// Modo interactivo de sesión (gimnasio): un ejercicio a la vez, con sus series
// para registrar ahí mismo (las mismas marcas y reglas que el borrador), pausas
// con barra y cuenta atrás (arrancan al quedar hecha una serie, o a mano) y
// pitido. Reemplaza la página mientras está abierto; el borrador sigue debajo:
// «Salir» vuelve a él sin tocar nada y «Terminar» hace lo de «Guardar» (lo
// cierra el padre). Los descansos son por ejercicio y opcionales: sin ellos el
// ejercicio se comporta como la página normal (sin pausa ni pitido).
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
import { useWakeLock } from "../lib/wake-lock";
import { WavyProgress, WavyRing } from "./expressive";
import { CloseIcon } from "./icons";
import { Dialog } from "./overlay";
import { Stepper } from "./stepper";
import { Button, Checkbox, cx, Switch } from "./ui";

/** Un ejercicio del modo: fuerza con sus series, o cardio con «Hecho». */
export type ModeItem = {
  id: number;
  name: string;
  kind: ExerciseKind;
  /** «3 series» / «5 km · 30 min» (targetSummary). */
  objective: string | null;
  /** Series (fuerza) con sus marcas, o null (cardio, con `done`). */
  sets:
    | {
        weightKg: number | null;
        reps: number | null;
        done: boolean;
        /** Marcas completas: la casilla se puede marcar (mismas reglas que el borrador). */
        filled: boolean;
      }[]
    | null;
  done: boolean | null;
  /** Sin peso: se ocultan los kilos y bastan las reps. */
  noWeight: boolean;
  /** Pausa entre series y al terminar el ejercicio, en segundos; null = sin
   *  descanso programado. */
  restSecs: number | null;
  restAfterSecs: number | null;
};

type Pause = { kind: "sets" | "after"; durationMs: number; endsAt: number };

/** mm:ss del reloj de la pausa. */
function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SessionMode({
  items,
  onToggleSet,
  onSetValue,
  onStep,
  onToggleNoWeight,
  onToggleCardio,
  onExit,
  onFinish,
  finishControl,
  canFinish,
  saving,
}: {
  items: ModeItem[];
  onToggleSet: (id: number, index: number) => void;
  onSetValue: (
    id: number,
    index: number,
    field: "weightKg" | "reps",
    raw: string,
  ) => void;
  onStep: (
    id: number,
    index: number,
    field: "weightKg" | "reps",
    delta: number,
  ) => void;
  onToggleNoWeight: (id: number) => void;
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
  // Salir pregunta antes (puede ser un despiste con el móvil en la mano).
  const [confirmingExit, setConfirmingExit] = useState(false);
  // Un cierre de pausa solo dispara una vez (el tic y el regreso pueden
  // coincidir); saltarla lo marca para que no pite después.
  const finished = useRef(false);

  const askExit = useCallback(() => setConfirmingExit(true), []);

  useWakeLock(true);
  useEffect(() => pushEscape(askExit), [askExit]);
  // Al desmontar (salir o terminar) no queda sonando nada.
  useEffect(() => stopPauseAudio, []);

  const item = items[Math.min(active, items.length - 1)];
  const last = active >= items.length - 1;

  const advance = useCallback(
    () => setActive((i) => Math.min(i + 1, items.length - 1)),
    [items.length],
  );

  const startPause = useCallback((seconds: number, kind: Pause["kind"]) => {
    finished.current = false;
    startPauseAudio();
    const durationMs = seconds * 1000;
    setPause({ kind, durationMs, endsAt: Date.now() + durationMs });
    setNow(Date.now());
  }, []);

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

  // Pausa al marcar: una serie (o el cardio) que pasa a hecha arranca la pausa
  // que toca — la marques con la casilla o escribiendo sus marcas. Se compara
  // contra el render anterior; el primer render y el cambio de ejercicio no
  // cuentan.
  const prevDone = useRef<{ id: number; sets: boolean[] | null } | null>(null);
  useEffect(() => {
    const sets = item.sets?.map((s) => s.done) ?? null;
    const prev = prevDone.current;
    prevDone.current = { id: item.id, sets };
    if (!prev || prev.id !== item.id) return;
    if (sets) {
      const idx = sets.reduce(
        (acc, d, i) => (d && !(prev.sets?.[i] ?? false) ? i : acc),
        -1,
      );
      if (idx === -1) return;
      if (idx === sets.length - 1) {
        // La última serie del último ejercicio no arranca nada: se acabó. Y la
        // pausa que estuviera corriendo ya no pinta nada: se corta sin pitido.
        if (last) {
          finished.current = true;
          stopPauseAudio();
          setPause(null);
          return;
        }
        if (item.restAfterSecs !== null)
          startPause(item.restAfterSecs, "after");
        else advance();
      } else if (item.restSecs !== null) {
        startPause(item.restSecs, "sets");
      }
      return;
    }
    if (item.done === true) {
      // Igual con el cardio: si es el último, marcar no arranca cuenta atrás.
      if (last) {
        finished.current = true;
        stopPauseAudio();
        setPause(null);
        return;
      }
      if (item.restAfterSecs !== null) startPause(item.restAfterSecs, "after");
      else advance();
    }
  }, [item, last, advance, startPause]);

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

  const skipPause = () => {
    if (!pause) return;
    finished.current = true; // saltar no pita
    stopPauseAudio();
    const { kind } = pause;
    setPause(null);
    if (kind === "after") advance();
  };

  const remainingMs = pause ? Math.max(0, pause.endsAt - now) : 0;
  // Progreso de la sesión: series hechas sobre el total, la misma cuenta que la
  // barra de acciones del borrador (cada cardio cuenta como una).
  const total = items.reduce((n, it) => n + (it.sets?.length ?? 1), 0);
  const done = items.reduce(
    (n, it) =>
      n +
      (it.sets
        ? it.sets.filter((s) => s.done).length
        : it.done === true
          ? 1
          : 0),
    0,
  );
  // El esfuerzo (y con él «Terminar») solo tienen sentido con todo hecho.
  const complete = total > 0 && done === total;
  // Ejercicios completos (todas sus series hechas, o el cardio hecho): el aro
  // empieza en 0 y sube al registrar cada uno.
  const doneItems = items.filter((it) =>
    it.sets ? it.sets.every((s) => s.done) : it.done === true,
  ).length;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Modo sesión"
      className="fixed inset-0 z-50 flex flex-col bg-surface text-on-surface"
    >
      <header className="relative flex items-center gap-3 p-4">
        <WavyRing
          className="size-14"
          waveOnly
          value={doneItems}
          max={items.length}
          label={`${doneItems} de ${items.length} ejercicios hechos`}
        >
          <span
            aria-hidden="true"
            className="tabular text-label-l text-on-surface"
          >
            {doneItems} / {items.length}
          </span>
        </WavyRing>
        <span className="flex-1" />
        <Button
          variant="text"
          size="icon"
          aria-label="Salir del modo sesión"
          onClick={askExit}
        >
          <CloseIcon />
        </Button>
      </header>

      {/* El centrado va en los márgenes automáticos del contenido, no en
          `justify-center`: con contenido más alto que la pantalla el centrado
          deja el desborde de arriba inaccesible (el nombre salía cortado bajo
          la cabecera) y los márgenes automáticos se anulan solos al desbordar,
          así que el scroll arranca en el principio. */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-2 text-center">
        <div className="my-auto flex w-full flex-col items-center gap-5">
          <p className="section-label text-accent">{KIND_LABELS[item.kind]}</p>
          <h2 className="text-display-s text-e">{item.name}</h2>
          {item.objective && (
            <p className="tabular text-title-m text-on-surface-variant">
              {item.objective}
            </p>
          )}

          {item.sets !== null && (
            <div className="flex items-center gap-2 text-label-l text-on-surface-variant">
              <Switch
                aria-label={`Sin peso · ${item.name}`}
                checked={item.noWeight}
                onChange={() => onToggleNoWeight(item.id)}
              />
              Sin peso
            </div>
          )}

          {item.sets !== null && (
            <div className="flex w-full max-w-sm flex-col items-center gap-2">
              <ul className="flex w-full flex-col gap-2 text-left">
                {item.sets.map((s, i) => (
                  <li
                    key={i}
                    className={cx(
                      "flex flex-col gap-2 rounded-l p-2",
                      s.done
                        ? "bg-surface-container-lowest"
                        : "bg-surface-container-high",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        aria-label={`${item.name} serie ${i + 1}`}
                        checked={s.done}
                        disabled={!s.done && !s.filled}
                        onChange={() => onToggleSet(item.id, i)}
                      />
                      <span className="text-label-l text-on-surface-variant">
                        Serie {i + 1}
                      </span>
                    </div>
                    <div
                      className={cx(
                        "grid gap-3",
                        item.noWeight ? "grid-cols-1" : "grid-cols-2",
                      )}
                    >
                      {!item.noWeight && (
                        <Stepper
                          caption="Peso (kg)"
                          context={`${item.name} serie ${i + 1}`}
                          value={s.weightKg}
                          step={2.5}
                          onValue={(v) => onSetValue(item.id, i, "weightKg", v)}
                          onStep={(d) => onStep(item.id, i, "weightKg", d)}
                        />
                      )}
                      <Stepper
                        caption="Reps"
                        context={`${item.name} serie ${i + 1}`}
                        value={s.reps}
                        step={1}
                        onValue={(v) => onSetValue(item.id, i, "reps", v)}
                        onStep={(d) => onStep(item.id, i, "reps", d)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              {item.restSecs === null && (
                <p className="text-body-s text-on-surface-variant">
                  {item.restAfterSecs === null
                    ? "Sin descansos programados"
                    : "Sin pausa entre series"}
                </p>
              )}
            </div>
          )}

          {item.done !== null && (
            <div className="flex items-center gap-2 text-title-m">
              <Checkbox
                aria-label={`${item.name} hecho`}
                checked={item.done}
                onChange={() => onToggleCardio(item.id)}
              />
              Hecho
            </div>
          )}

          {pause && (
            <div className="flex w-full max-w-sm flex-col items-center gap-2">
              {/* Barra y tiempo en una sola fila: la barra se queda el ancho
                  que sobra (`flex-1`) y el `mm:ss` va al final, a su derecha. */}
              <div className="flex w-full items-center gap-3">
                <WavyProgress
                  className="min-w-0 flex-1"
                  waveOnly
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
              </div>
              <Button variant="tonal" onClick={skipPause}>
                Saltar
              </Button>
            </div>
          )}
        </div>
      </div>

      <footer className="relative flex flex-col gap-3 p-4 pb-6">
        {complete && finishControl}
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

      {confirmingExit && (
        <Dialog
          label="¿Salir del modo sesión?"
          onClose={() => setConfirmingExit(false)}
          mobile="center"
          className="max-w-sm gap-4 p-6"
        >
          <h2 className="text-headline-s text-e">¿Salir del modo sesión?</h2>
          <p className="text-body-l text-on-surface-variant">
            El borrador no se pierde: puedes seguir registrando desde la página.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="text" onClick={() => setConfirmingExit(false)}>
              Cancelar
            </Button>
            <Button onClick={onExit}>Salir</Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
