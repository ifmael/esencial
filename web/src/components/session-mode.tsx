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
import {
  type ExerciseKind,
  type ExerciseMetric,
  KIND_LABELS,
} from "../lib/exercises";
import {
  beep,
  startPauseAudio,
  stopPauseAudio,
  WARN_LEADS_MS,
  warnAhead,
} from "../lib/rest-audio";
import { useWakeLock } from "../lib/wake-lock";
import {
  blockLabel,
  blockRange,
  blocks,
  nextAfterSet,
  type SessionStep,
  setFields,
} from "../lib/workout";
import { WavyProgress, WavyRing } from "./expressive";
import { CheckIcon, ChevronDownIcon, CloseIcon } from "./icons";
import { Dialog, OverlayHeader } from "./overlay";
import { Stepper } from "./stepper";
import { Button, Chain, Checkbox, cx, ScrollStrip, Switch } from "./ui";

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
        durationSecs: number | null;
        done: boolean;
        /** Marcas completas: la casilla se puede marcar (mismas reglas que el borrador). */
        filled: boolean;
      }[]
    | null;
  done: boolean | null;
  /** Unidad de la serie (decide qué campos se piden). */
  metric: ExerciseMetric;
  /** Sin peso: solo suelta los kilos de la métrica `weight_reps`. */
  noWeight: boolean;
  /** Pausa entre series y al terminar el ejercicio, en segundos; null = sin
   *  descanso programado. */
  restSecs: number | null;
  restAfterSecs: number | null;
  /** `true` = va pegado al ejercicio siguiente (bloque/superserie). */
  superset: boolean;
};

type Pause = {
  kind: "sets" | "after";
  durationMs: number;
  endsAt: number;
  /** El ejercicio de la pausa: saltar a otro no la renombra. */
  name: string;
};

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
    field: "weightKg" | "reps" | "durationSecs",
    raw: string,
  ) => void;
  onStep: (
    id: number,
    index: number,
    field: "weightKg" | "reps" | "durationSecs",
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
  // El botón del encabezado abre la lista de ejercicios de la sesión.
  const [listing, setListing] = useState(false);
  // Un cierre de pausa solo dispara una vez (el tic y el regreso pueden
  // coincidir); saltarla lo marca para que no pite después.
  const finished = useRef(false);
  // Las marcas de aviso ya gastadas en esta pausa: cada una suena una sola vez.
  // Al arrancar nace con las que la pausa ya deja atrás (una pausa más corta que
  // la marca avisaría nada más empezar, pegada al pitido de fin).
  const warned = useRef<number[]>([]);

  const askExit = useCallback(() => setConfirmingExit(true), []);

  useWakeLock(true);
  useEffect(() => pushEscape(askExit), [askExit]);
  // Al desmontar (salir o terminar) no queda sonando nada.
  useEffect(() => stopPauseAudio, []);

  const item = items[Math.min(active, items.length - 1)];
  const last = active >= items.length - 1;
  const fields = setFields(item.metric, item.noWeight);

  const advance = useCallback(
    () => setActive((i) => Math.min(i + 1, items.length - 1)),
    [items.length],
  );

  const startPause = useCallback(
    (seconds: number, kind: Pause["kind"], name: string) => {
      finished.current = false;
      const durationMs = seconds * 1000;
      // Una marca que la pausa ya trae pasada no suena: avisaría al arrancar.
      warned.current = WARN_LEADS_MS.filter((ms) => ms >= durationMs);
      startPauseAudio();
      setPause({ kind, durationMs, endsAt: Date.now() + durationMs, name });
      setNow(Date.now());
    },
    [],
  );

  // Al acabar la pausa: la de entre series vuelve al primer miembro del bloque
  // (una serie recta se queda donde está) y la de fin pasa al ejercicio que va
  // después del bloque.
  const finishPause = useCallback(
    (pause: Pause) => {
      if (finished.current) return;
      finished.current = true;
      stopPauseAudio();
      beep();
      setPause(null);
      setActive((i) => {
        const [start, end] = blockRange(items, i);
        return pause.kind === "after"
          ? Math.min(end + 1, items.length - 1)
          : start;
      });
    },
    [items],
  );

  // Pausa al marcar: una serie (o el cardio) que pasa a hecha da el paso que
  // toca —la marques con la casilla o escribiendo las marcas—. En un bloque, a
  // mitad de vuelta se salta al siguiente miembro sin pausa, y al cerrar la
  // vuelta manda el descanso del último. Se compara contra el render anterior;
  // el primer render y el cambio de ejercicio no cuentan.
  const prevDone = useRef<{
    id: number;
    sets: boolean[] | null;
    done: boolean | null;
  } | null>(null);
  useEffect(() => {
    const sets = item.sets?.map((s) => s.done) ?? null;
    const prev = prevDone.current;
    prevDone.current = { id: item.id, sets, done: item.done };
    if (!prev || prev.id !== item.id) return;
    let step: SessionStep | null = null;
    if (sets) {
      // La vuelta la define la serie que acaba de marcarse (la última si se
      // marcaron varias de golpe).
      const marked = sets.reduce(
        (acc, d, i) => (d && !(prev.sets?.[i] ?? false) ? i : acc),
        -1,
      );
      if (marked !== -1) step = nextAfterSet(items, active, marked);
    } else if (item.done === true && prev.done !== true) {
      step = nextAfterSet(items, active, 0);
    }
    if (!step) return;
    if (step.kind === "end") {
      // La última serie de la sesión no arranca nada: se acabó. Y la pausa que
      // estuviera corriendo ya no pinta nada: se corta sin pitido.
      finished.current = true;
      stopPauseAudio();
      setPause(null);
    } else if (step.kind === "move") {
      setActive(step.to);
    } else if (step.kind === "pause") {
      startPause(step.seconds, step.pause, items[step.owner].name);
    }
  }, [item, items, active, startPause]);

  // El reloj de la pausa: tics para la cuenta atrás, un aviso al cruzar cada
  // marca (`WARN_LEADS_MS`) y, al llegar a `endsAt`, el pitido. Al volver a la
  // pestaña se resincroniza de inmediato — si el navegador ralentizó o suspendió
  // los timers en segundo plano, el pitido suena tarde, o aquí si nunca llegó a
  // sonar.
  useEffect(() => {
    if (!pause) return;
    const tick = () => {
      const now = Date.now();
      const remaining = pause.endsAt - now;
      if (remaining <= 0) {
        finishPause(pause);
        return;
      }
      // Las marcas recién cruzadas: si el reloj saltó por varias (el regreso a
      // la pestaña), suenan todas como una, no en ráfaga.
      const crossed = WARN_LEADS_MS.filter(
        (ms) => ms >= remaining && !warned.current.includes(ms),
      );
      if (crossed.length > 0) {
        warned.current.push(...crossed);
        warnAhead();
      }
      setNow(now);
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
    setPause(null);
    setActive((i) => {
      const [start, end] = blockRange(items, i);
      return pause.kind === "after"
        ? Math.min(end + 1, items.length - 1)
        : start;
    });
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
  // «A continuación»: cuando al ejercicio activo solo le queda su última serie
  // (fuerza —hecha la última también, que es lo que pasa durante la pausa de
  // fin) o ya está hecho (cardio). El siguiente es el de al lado en el orden del
  // día, esté hecho o no.
  const nextItem = items[active + 1] ?? null;
  const nearlyDone = item.sets
    ? item.sets.length > 0 && item.sets.slice(0, -1).every((s) => s.done)
    : item.done === true;
  // El bloque en curso (él solo si va suelto): nombra la etiqueta del título.
  const [blockStart, blockEnd] = blockRange(items, active);
  const blockSize = blockEnd - blockStart + 1;

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
        {/* Botón central: el ejercicio en curso, y al pulsarlo la lista de la
            sesión para saltar a otro. */}
        <Button
          variant="text"
          aria-haspopup="dialog"
          aria-expanded={listing}
          className="min-w-0 flex-1 gap-2 text-title-m"
          onClick={() => setListing(true)}
        >
          <span className="min-w-0 truncate">{item.name}</span>
          <ChevronDownIcon
            width={18}
            height={18}
            className="shrink-0 text-on-surface-variant"
          />
        </Button>
        <Button
          variant="text"
          size="icon"
          aria-label="Salir del modo sesión"
          onClick={askExit}
        >
          <CloseIcon />
        </Button>
      </header>

      {/* La pausa vive pegada al encabezado, no al fondo del contenido: con una
          lista de series que desborda, su barra y su cuenta atrás quedaban fuera
          de la pantalla justo cuando es lo único que importa. Aquí abre su
          hueco entre el encabezado y el cuerpo, así que se ve sin desplazar
          nada (y no se va con el scroll del cuerpo). */}
      {pause && (
        <div className="flex w-full shrink-0 justify-center px-6 pt-2 pb-3">
          <div className="flex w-full max-w-sm flex-col items-center gap-2">
            {/* Barra y tiempo en una sola fila: la barra se queda el ancho que
                sobra (`flex-1`) y el `mm:ss` va al final, a su derecha. */}
            <div className="flex w-full items-center gap-3">
              <WavyProgress
                className="min-w-0 flex-1"
                waveOnly
                value={pause.durationMs - remainingMs}
                max={pause.durationMs}
                label={
                  pause.kind === "sets"
                    ? `Pausa entre series de ${pause.name}`
                    : `Pausa al terminar ${pause.name}`
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
        </div>
      )}

      {/* El centrado va en los márgenes automáticos del contenido, no en
          `justify-center`: con contenido más alto que la pantalla el centrado
          deja el desborde de arriba inaccesible (el nombre salía cortado bajo
          la cabecera) y los márgenes automáticos se anulan solos al desbordar,
          así que el scroll arranca en el principio. */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-2 text-center">
        <div className="my-auto flex w-full flex-col items-center gap-5">
          {/* Cabecera del ejercicio, apretada: la etiqueta del tipo (y del
              bloque), el nombre y, en UNA sola fila, lo que decide la serie.
              El nombre va en `title-l` — en `display-s` un nombre largo como
              «Sentadilla a una pierna» se comía dos líneas — y el recuento de
              series no se repite: las casillas ya lo dicen. */}
          <div className="flex w-full flex-col items-center gap-2">
            <p className="section-label text-accent">
              {KIND_LABELS[item.kind]}
              {blockSize > 1 ? ` · ${blockLabel(blockSize)}` : null}
            </p>
            <h2 className="text-title-l text-e">{item.name}</h2>

            {item.sets !== null && (
              <div className="flex w-full max-w-sm min-w-0 items-center justify-center gap-4">
                {/* «Sin peso» solo donde el kg es opcional (`weight_reps`). */}
                {item.metric === "weight_reps" && (
                  <div className="flex shrink-0 items-center gap-2 text-label-l text-on-surface-variant">
                    <Switch
                      aria-label={`Sin peso · ${item.name}`}
                      checked={item.noWeight}
                      onChange={() => onToggleNoWeight(item.id)}
                    />
                    Sin peso
                  </div>
                )}
                {/* Las casillas de todas las series, en una sola tira que
                    desplaza (el patrón de la tarjeta plegada del borrador):
                    cada fila de serie se queda con su número y sus steppers. */}
                <ScrollStrip className="flex w-full min-w-0 items-center gap-1">
                  {item.sets.map((s, i) => (
                    <Checkbox
                      key={i}
                      className="shrink-0"
                      aria-label={`${item.name} serie ${i + 1}`}
                      checked={s.done}
                      disabled={!s.done && !s.filled}
                      onChange={() => onToggleSet(item.id, i)}
                    />
                  ))}
                </ScrollStrip>
              </div>
            )}

            {/* Cardio (sin series): el objetivo del día y su «Hecho», en la
                misma fila. */}
            {item.done !== null && (
              <div className="flex items-center gap-3">
                {item.objective && (
                  <span className="tabular text-title-m text-on-surface-variant">
                    {item.objective}
                  </span>
                )}
                <div className="flex items-center gap-2 text-title-m">
                  <Checkbox
                    aria-label={`${item.name} hecho`}
                    checked={item.done}
                    onChange={() => onToggleCardio(item.id)}
                  />
                  Hecho
                </div>
              </div>
            )}
          </div>

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
                    <span className="text-label-l text-on-surface-variant">
                      Serie {i + 1}
                    </span>
                    <div
                      className={cx(
                        "grid gap-3",
                        fields.weight && (fields.reps || fields.time)
                          ? "grid-cols-2"
                          : "grid-cols-1",
                      )}
                    >
                      {fields.weight && (
                        <Stepper
                          caption="Peso (kg)"
                          context={`${item.name} serie ${i + 1}`}
                          value={s.weightKg}
                          step={2.5}
                          onValue={(v) => onSetValue(item.id, i, "weightKg", v)}
                          onStep={(d) => onStep(item.id, i, "weightKg", d)}
                        />
                      )}
                      {fields.reps && (
                        <Stepper
                          caption="Reps"
                          context={`${item.name} serie ${i + 1}`}
                          value={s.reps}
                          step={1}
                          onValue={(v) => onSetValue(item.id, i, "reps", v)}
                          onStep={(d) => onStep(item.id, i, "reps", d)}
                        />
                      )}
                      {fields.time && (
                        <Stepper
                          caption="Segundos"
                          context={`${item.name} serie ${i + 1}`}
                          value={s.durationSecs}
                          step={5}
                          onValue={(v) =>
                            onSetValue(item.id, i, "durationSecs", v)
                          }
                          onStep={(d) => onStep(item.id, i, "durationSecs", d)}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {item.superset ? (
                <p className="text-body-s text-on-surface-variant">
                  Encadenado con «{items[active + 1]?.name ?? ""}»
                </p>
              ) : item.restSecs === null ? (
                <p className="text-body-s text-on-surface-variant">
                  {item.restAfterSecs === null
                    ? "Sin descansos programados"
                    : "Sin pausa entre series"}
                </p>
              ) : null}
            </div>
          )}

          {/* Bajo la lista: el nombre del siguiente ejercicio del día, o el
              aviso de que no queda ninguno. Va antes de la pausa para seguir a
              la vista durante la de fin de ejercicio. */}
          {nearlyDone && (
            <p className="text-body-m text-on-surface-variant">
              {nextItem ? (
                <>
                  A continuación:{" "}
                  <span className="text-e">{nextItem.name}</span>
                </>
              ) : (
                "Último ejercicio"
              )}
            </p>
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
              item.restSecs !== null &&
              startPause(item.restSecs, "sets", item.name)
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

      {/* Lista de la sesión: el encabezado lleva el ejercicio en curso y desde
          aquí se salta a cualquiera, sin tocar el borrador ni la pausa que
          estuviera corriendo. */}
      {listing && (
        <Dialog
          labelledBy="session-items-title"
          onClose={() => setListing(false)}
          mobile="sheet"
          className="md:max-w-md"
        >
          <OverlayHeader
            id="session-items-title"
            title="Ejercicios"
            onClose={() => setListing(false)}
          />
          <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto pb-6">
            {/* Cada bloque va en su contenedor, con la caja cuando encadena:
                en el listado se ve qué ejercicios se hacen de un tirón. */}
            {blocks(items).map((block) => {
              const row = (i: number) => {
                const it = items[i];
                // Hecho = todas sus series (o el cardio marcado), el mismo
                // criterio que el aro «N / M».
                const isDone = it.sets
                  ? it.sets.length > 0 && it.sets.every((s) => s.done)
                  : it.done === true;
                return (
                  <li key={it.id}>
                    <Button
                      variant="text"
                      className="list-row w-full justify-start text-left"
                      aria-label={`${it.name}, ${isDone ? "hecho" : "pendiente"}`}
                      aria-pressed={i === active}
                      onClick={() => {
                        setActive(i);
                        setListing(false);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate text-title-m">
                        {it.name}
                      </span>
                      <span aria-hidden="true" className="grid size-5 shrink-0">
                        {isDone ? (
                          <CheckIcon filled width={20} height={20} />
                        ) : (
                          <span className="size-5 rounded-full border-2 border-current" />
                        )}
                      </span>
                    </Button>
                  </li>
                );
              };
              return (
                <Chain
                  key={`c${items[block[0]].id}`}
                  label={
                    block.length > 1 ? blockLabel(block.length) : undefined
                  }
                >
                  {block.map(row)}
                </Chain>
              );
            })}
          </ul>
        </Dialog>
      )}

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
