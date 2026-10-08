// Modo interactivo de sesión (gimnasio): un ejercicio y una serie a la vez, el
// registro en la propia pantalla (las mismas marcas y reglas que el borrador),
// pausas con barra y cuenta atrás (arrancan al quedar hecha una serie, o a
// mano) y pitido. La sesión se recorre con las flechas: «< ejercicio >» salta
// de ejercicio y «< Serie n >» de serie, sin desplazar la pantalla (todo cabe
// en la ventana, ni una barra de scroll). Reemplaza la página mientras está
// abierto; el borrador sigue debajo: «Salir» vuelve a él sin tocar nada y
// «Terminar» hace lo de «Guardar» (lo cierra el padre). Los descansos son por
// ejercicio y opcionales: sin ellos el ejercicio se comporta como la página
// normal (sin pausa ni pitido).
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
  formatSetText,
  type HomologMarks,
  MAX_SETS,
  MIN_SETS,
  nextAfterSet,
  pendingItems,
  pendingLabel,
  type SessionStep,
  setFields,
} from "../lib/workout";
import { WavyProgress, WavyRing } from "./expressive";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
} from "./icons";
import { Dialog, OverlayHeader } from "./overlay";
import { Stepper } from "./stepper";
import { Button, Chain, Checkbox, cx, ripple, Switch } from "./ui";

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
  /** La serie homóloga de la sesión anterior, por índice (`null` donde no la
   *  hay): el valor que copia su botón. El cardio va sin homólogas. */
  prevSets: (HomologMarks | null)[];
  /** Marcas del cardio (opcionales); `null` en los ejercicios de fuerza. */
  distanceKm: number | null;
  durationMin: number | null;
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
  /** El final del reloj; solo cuenta con la pausa corriendo. */
  endsAt: number;
  /** Lo que quedaba al pararla (play/pausa); con el reloj corriendo, la
   *  duración entera. */
  remainingMs: number;
  paused: boolean;
  /** El ejercicio de la pausa: saltar a otro no la renombra. */
  name: string;
  /** La serie en la que deja el cursor al acabar (o al saltarla): la siguiente
   *  a la que se marcó, la misma si la pausa se pidió a mano y la primera del
   *  ejercicio que entra cuando la pausa cierra el ejercicio o el bloque. */
  cursorSet: number;
};

/** mm:ss del reloj de la pausa. */
function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SessionMode({
  items,
  sessionName,
  onToggleSet,
  onSetValue,
  onStep,
  onToggleNoWeight,
  onToggleCardio,
  onCardioValue,
  onCardioStep,
  onAddSet,
  onRemoveSet,
  onCopySet,
  onExit,
  onFinish,
  finishControl,
  canFinish,
  saving,
}: {
  items: ModeItem[];
  /** Nombre de la sesión del día; sin nombre, «Sesión». */
  sessionName: string;
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
  /** Distancia/tiempo del cardio: escribir una marca implica que se hizo. */
  onCardioValue: (
    id: number,
    field: "distanceKm" | "durationMin",
    raw: string,
  ) => void;
  onCardioStep: (
    id: number,
    field: "distanceKm" | "durationMin",
    delta: number,
  ) => void;
  /** ➕/➖: las series del ejercicio del día (el plan sigue al borrador). */
  onAddSet: (id: number) => void;
  onRemoveSet: (id: number) => void;
  /** Copia las marcas de la serie homóloga de la sesión anterior (sin marcarla). */
  onCopySet: (id: number, index: number) => void;
  onExit: () => void;
  /** = «Guardar» de la sesión (lo ejecuta el padre). */
  onFinish: () => void;
  /** Selector de esfuerzo: cerrar la sesión exige esfuerzo, como «Guardar». */
  finishControl: ReactNode;
  canFinish: boolean;
  saving: boolean;
}) {
  const [active, setActive] = useState(0);
  // La serie en curso del ejercicio activo: solo esa se pinta, y las flechas
  // («< Serie 1 >») navegan por las del ejercicio.
  const [setIndex, setSetIndex] = useState(0);
  const [pause, setPause] = useState<Pause | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Salir pregunta antes (puede ser un despiste con el móvil en la mano).
  const [confirmingExit, setConfirmingExit] = useState(false);
  // El botón del encabezado abre la lista de ejercicios de la sesión.
  const [listing, setListing] = useState(false);
  // El menú flotante de series (añadir y quitar) del ejercicio en curso.
  const [setsMenu, setSetsMenu] = useState(false);
  // «Terminar» abre el cierre (esfuerzo y nota); el pie se queda ligero hasta
  // que la persona decide cerrar. Con series pendientes antes avisa.
  const [finishing, setFinishing] = useState(false);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  // Un cierre de pausa solo dispara una vez (el tic y el regreso pueden
  // coincidir); saltarla lo marca para que no pite después.
  const finished = useRef(false);
  // Las marcas de aviso ya gastadas en esta pausa: cada una suena una sola vez.
  // Al arrancar nace con las que la pausa ya deja atrás (una pausa más corta que
  // la marca avisaría nada más empezar, pegada al pitido de fin).
  const warned = useRef<number[]>([]);
  // El botón del menú de series: al cerrarlo con Escape vuelve el foco ahí.
  const setsButton = useRef<HTMLButtonElement>(null);

  const askExit = useCallback(() => setConfirmingExit(true), []);

  useWakeLock(true);
  useEffect(() => pushEscape(askExit), [askExit]);
  // Al desmontar (salir o terminar) no queda sonando nada.
  useEffect(() => stopPauseAudio, []);

  const item = items[Math.min(active, items.length - 1)];
  const last = active >= items.length - 1;
  const fields = setFields(item.metric, item.noWeight);
  // La serie en curso: la última si el recuento encogió por el camino (el ➖).
  const sets = item.sets;
  const setIdx = sets ? Math.min(setIndex, sets.length - 1) : 0;
  const current = sets ? sets[setIdx] : null;
  const context = `${item.name} serie ${setIdx + 1}`;
  const prev = sets ? (item.prevSets[setIdx] ?? null) : null;

  /** Cambia de ejercicio (flechas, listado o el fin de una pausa) y vuelve a
   *  su primera serie. */
  const moveTo = useCallback(
    (next: number | ((i: number) => number)) => {
      setSetIndex(0);
      setActive((i) => {
        const target = typeof next === "function" ? next(i) : next;
        return Math.max(0, Math.min(target, items.length - 1));
      });
    },
    [items.length],
  );

  const startPause = useCallback(
    (seconds: number, kind: Pause["kind"], name: string, cursorSet: number) => {
      finished.current = false;
      const durationMs = seconds * 1000;
      // Una marca que la pausa ya trae pasada no suena: avisaría al arrancar.
      warned.current = WARN_LEADS_MS.filter((ms) => ms >= durationMs);
      startPauseAudio();
      setPause({
        kind,
        durationMs,
        endsAt: Date.now() + durationMs,
        remainingMs: durationMs,
        paused: false,
        name,
        cursorSet,
      });
      setNow(Date.now());
    },
    [],
  );

  // Al acabar la pausa: la de entre series vuelve al primer miembro del bloque
  // (una serie recta se queda donde está) y la de fin pasa al ejercicio que va
  // después del bloque. El cursor de serie queda en la que toca hacer — la
  // siguiente a la marcada, así el descanso no devuelve a la serie ya hecha.
  const finishPause = useCallback(
    (pause: Pause) => {
      if (finished.current) return;
      finished.current = true;
      stopPauseAudio();
      beep();
      setPause(null);
      moveTo((i) => {
        const [start, end] = blockRange(items, i);
        return pause.kind === "after"
          ? Math.min(end + 1, items.length - 1)
          : start;
      });
      setSetIndex(pause.cursorSet);
    },
    [items, moveTo],
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
    let marked = -1;
    if (sets) {
      // La vuelta la define la serie que acaba de marcarse (la última si se
      // marcaron varias de golpe).
      marked = sets.reduce(
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
      // Dentro del mismo bloque se sigue en la vuelta que se acaba de marcar
      // (la serie); al cambiar de bloque o de ejercicio, se vuelve a la 1.
      const [start, end] = blockRange(items, active);
      setActive(step.to);
      setSetIndex(step.to >= start && step.to <= end ? marked : 0);
    } else if (step.kind === "pause") {
      // La pausa de entre series deja el cursor en la siguiente serie (la que
      // toca hacer); la de fin, en la primera del ejercicio que entra.
      startPause(
        step.seconds,
        step.pause,
        items[step.owner].name,
        step.pause === "sets" ? marked + 1 : 0,
      );
    }
  }, [item, items, active, startPause]);

  // El reloj de la pausa: tics para la cuenta atrás, un aviso al cruzar cada
  // marca (`WARN_LEADS_MS`) y, al llegar a `endsAt`, el pitido. Al volver a la
  // pestaña se resincroniza de inmediato — si el navegador ralentizó o suspendió
  // los timers en segundo plano, el pitido suena tarde, o aquí si nunca llegó a
  // sonar. Con la pausa en pausa no hay reloj: el play/pausa la congeló.
  useEffect(() => {
    if (!pause || pause.paused) return;
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

  // Cerrar el menú de series con Escape (y devolver el foco a su botón) o con
  // un toque fuera.
  useEffect(() => {
    if (!setsMenu) return;
    const close = () => {
      setSetsMenu(false);
      setsButton.current?.focus();
    };
    const pop = pushEscape(close);
    const onDown = (e: globalThis.PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-sets-menu]"))
        setSetsMenu(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => {
      pop();
      window.removeEventListener("pointerdown", onDown);
    };
  }, [setsMenu]);

  const skipPause = () => {
    if (!pause) return;
    finished.current = true; // saltar no pita
    stopPauseAudio();
    setPause(null);
    moveTo((i) => {
      const [start, end] = blockRange(items, i);
      return pause.kind === "after"
        ? Math.min(end + 1, items.length - 1)
        : start;
    });
    setSetIndex(pause.cursorSet);
  };

  /** Play/pausa del descanso: para el reloj (y el keep-alive) y lo reanuda
   *  desde lo que quedaba. */
  const togglePauseClock = () => {
    if (!pause) return;
    if (pause.paused) {
      startPauseAudio();
      setPause({
        ...pause,
        paused: false,
        endsAt: Date.now() + pause.remainingMs,
      });
      setNow(Date.now());
    } else {
      stopPauseAudio();
      setPause({
        ...pause,
        paused: true,
        remainingMs: Math.max(0, pause.endsAt - Date.now()),
      });
    }
  };

  const remainingMs = pause
    ? pause.paused
      ? pause.remainingMs
      : Math.max(0, pause.endsAt - now)
    : 0;
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
  // Lo que falta para cerrar: «Terminar» lo enseña antes de pedir el esfuerzo.
  const pending = pendingItems(items);
  const note = item.sets
    ? item.superset
      ? `Encadenado con «${items[active + 1]?.name ?? ""}»`
      : item.restSecs === null
        ? item.restAfterSecs === null
          ? "Sin descansos programados"
          : "Sin pausa entre series"
        : null
    : null;

  const startFinish = () => {
    if (pending.length > 0) setConfirmingFinish(true);
    else setFinishing(true);
  };

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Modo sesión"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-surface text-on-surface"
    >
      <header className="flex shrink-0 items-center gap-3 p-4">
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

      {/* El nombre de la sesión del día (sin nombre, «Sesión»), bajo el
          encabezado. */}
      <p className="shrink-0 truncate px-4 text-center text-title-s text-on-surface-variant">
        {sessionName}
      </p>

      {/* Fila del ejercicio: flechas para ir al de delante y al de detrás, el
          recuento de series del ejercicio y el menú flotante para añadirlas o
          quitarlas. */}
      <div className="relative flex shrink-0 flex-col items-center pt-3">
        <p className="section-label text-accent">
          {KIND_LABELS[item.kind]}
          {blockSize > 1 ? ` · ${blockLabel(blockSize)}` : null}
        </p>
        <div className="flex w-full items-center justify-center gap-1 px-2">
          <Button
            variant="text"
            size="icon"
            aria-label="Ejercicio anterior"
            disabled={active === 0}
            onClick={() => moveTo(active - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <h2 className="flex min-w-0 items-baseline justify-center gap-2 text-title-l text-e">
            <span className="min-w-0 truncate">{item.name}</span>
            {sets && (
              <span
                aria-hidden="true"
                className="tabular shrink-0 text-title-m text-on-surface-variant"
              >
                {setIdx + 1}/{sets.length}
              </span>
            )}
          </h2>
          {sets && (
            <Button
              ref={setsButton}
              variant="text"
              size="icon"
              aria-label={`Series de ${item.name}`}
              aria-haspopup="menu"
              aria-expanded={setsMenu}
              aria-pressed={setsMenu}
              onClick={() => setSetsMenu((open) => !open)}
            >
              <MoreIcon />
            </Button>
          )}
          <Button
            variant="text"
            size="icon"
            aria-label="Ejercicio siguiente"
            disabled={last}
            onClick={() => moveTo(active + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>

        {/* Menú flotante de series: añadir (copia la última) y quitar (la
            última); el recuento del día sigue al borrador al guardar. */}
        {setsMenu && sets && (
          <div
            data-sets-menu=""
            role="menu"
            aria-label={`Series de ${item.name}`}
            className="menu absolute top-full right-2 z-30 min-w-56 py-2"
          >
            <button
              type="button"
              role="menuitem"
              aria-label={`Añadir serie a ${item.name}`}
              disabled={sets.length >= MAX_SETS}
              onPointerDown={ripple}
              onClick={() => {
                setSetsMenu(false);
                onAddSet(item.id);
              }}
              className="state flex h-12 w-full items-center gap-3 px-4 text-left text-body-l whitespace-nowrap"
            >
              <span aria-hidden="true">＋</span> Añadir serie
            </button>
            <button
              type="button"
              role="menuitem"
              aria-label={`Quitar serie a ${item.name}`}
              disabled={sets.length <= MIN_SETS}
              onPointerDown={ripple}
              onClick={() => {
                setSetsMenu(false);
                onRemoveSet(item.id);
                setSetIndex((i) => Math.max(0, Math.min(i, sets.length - 2)));
              }}
              className="state flex h-12 w-full items-center gap-3 px-4 text-left text-body-l whitespace-nowrap"
            >
              <span aria-hidden="true">−</span> Quitar serie
            </button>
          </div>
        )}
      </div>

      {/* Fila de la serie en curso: las flechas navegan por las del ejercicio y
          la casilla marca la que se está viendo (se marca sola al quedar
          completa: las mismas reglas que el borrador). */}
      {current && sets && (
        <div className="flex shrink-0 items-center justify-center gap-2 pt-1">
          <Button
            variant="text"
            size="icon"
            aria-label="Serie anterior"
            disabled={setIdx === 0}
            onClick={() => setSetIndex(Math.max(0, setIdx - 1))}
          >
            <ChevronLeftIcon />
          </Button>
          <h3 className="tabular text-title-m">
            Serie {setIdx + 1}/{sets.length}
          </h3>
          <Button
            variant="text"
            size="icon"
            aria-label="Serie siguiente"
            disabled={setIdx >= sets.length - 1}
            onClick={() => setSetIndex(Math.min(sets.length - 1, setIdx + 1))}
          >
            <ChevronRightIcon />
          </Button>
          <Checkbox
            aria-label={`${item.name} serie ${setIdx + 1}`}
            checked={current.done}
            disabled={!current.done && !current.filled}
            onChange={() => onToggleSet(item.id, setIdx)}
          />
        </div>
      )}

      {/* Cardio (sin series): el objetivo del día y su «Hecho», en la misma
          fila. */}
      {item.done !== null && (
        <div className="flex shrink-0 items-center justify-center gap-3 pt-3">
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

      {/* El cuerpo: los campos de la serie en curso, el descanso si corre y las
          notas del ejercicio. Centrado con márgenes automáticos (nunca con
          `justify-center`: al desbordar, el centrado deja el desborde de arriba
          inaccesible) y sin scroll propio: entra entero. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6">
        <div className="m-auto flex w-full max-w-sm flex-col items-center gap-4 text-center">
          {current && sets && (
            <div className="flex w-full flex-col gap-3 text-left">
              {(item.metric === "weight_reps" || prev) && (
                <div className="flex items-center justify-between gap-2">
                  {item.metric === "weight_reps" ? (
                    <div className="flex items-center gap-2 text-label-l text-on-surface-variant">
                      <Switch
                        aria-label={`Sin peso · ${item.name}`}
                        checked={item.noWeight}
                        onChange={() => onToggleNoWeight(item.id)}
                      />
                      Sin peso
                    </div>
                  ) : (
                    <span />
                  )}
                  {prev && (
                    // El valor de la serie homóloga de la sesión anterior y, a
                    // la vez, el botón que lo copia (sus marcas, sin marcar
                    // esta serie).
                    <Button
                      variant="text"
                      className="shrink-0 tabular"
                      aria-label={`Copiar ${formatSetText(prev)} de la sesión anterior a ${context}`}
                      onClick={() => onCopySet(item.id, setIdx)}
                    >
                      <CopyIcon width={18} height={18} />
                      {formatSetText(prev)}
                    </Button>
                  )}
                </div>
              )}
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
                    context={context}
                    value={current.weightKg}
                    step={2.5}
                    onValue={(v) => onSetValue(item.id, setIdx, "weightKg", v)}
                    onStep={(d) => onStep(item.id, setIdx, "weightKg", d)}
                  />
                )}
                {fields.reps && (
                  <Stepper
                    caption="Reps"
                    context={context}
                    value={current.reps}
                    step={1}
                    onValue={(v) => onSetValue(item.id, setIdx, "reps", v)}
                    onStep={(d) => onStep(item.id, setIdx, "reps", d)}
                  />
                )}
                {fields.time && (
                  <Stepper
                    caption="Segundos"
                    context={context}
                    value={current.durationSecs}
                    step={5}
                    onValue={(v) =>
                      onSetValue(item.id, setIdx, "durationSecs", v)
                    }
                    onStep={(d) => onStep(item.id, setIdx, "durationSecs", d)}
                  />
                )}
              </div>
            </div>
          )}

          {/* Cardio: la distancia y el tiempo son opcionales y escribir una
              marca implica que se hizo (las mismas reglas que el borrador). */}
          {item.sets === null && item.done !== null && (
            <div className="grid w-full grid-cols-2 gap-3 rounded-l bg-surface-container-high p-2 text-left">
              <Stepper
                caption="Distancia (km)"
                context={item.name}
                value={item.distanceKm}
                step={1}
                onValue={(v) => onCardioValue(item.id, "distanceKm", v)}
                onStep={(d) => onCardioStep(item.id, "distanceKm", d)}
              />
              <Stepper
                caption="Tiempo (min)"
                context={item.name}
                value={item.durationMin}
                step={5}
                onValue={(v) => onCardioValue(item.id, "durationMin", v)}
                onStep={(d) => onCardioStep(item.id, "durationMin", d)}
              />
            </div>
          )}

          {/* El descanso en curso: barra, play/pausa al principio y los segundos
              que quedan al final. */}
          {pause && (
            <div className="flex w-full flex-col items-center gap-1">
              <div className="flex w-full items-center gap-3">
                <Button
                  variant="tonal"
                  size="icon"
                  aria-label={
                    pause.paused ? "Reanudar descanso" : "Pausar descanso"
                  }
                  onClick={togglePauseClock}
                >
                  {pause.paused ? <PlayIcon /> : <PauseIcon />}
                </Button>
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
              <Button variant="text" onClick={skipPause}>
                Saltar
              </Button>
            </div>
          )}

          {note && (
            <p className="text-body-s text-on-surface-variant">{note}</p>
          )}

          {/* El nombre del siguiente ejercicio del día, o el aviso de que no
              queda ninguno. */}
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

      {/* El cierre de la sesión (esfuerzo, nota y el guardado) vive aquí y lo
          pide «Terminar»: mientras se entrena el pie se queda ligero y aun así
          se puede cerrar una sesión a medias. */}
      <footer className="flex shrink-0 flex-col gap-3 px-4 pt-2 pb-6">
        {finishing && finishControl}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="tonal"
            disabled={
              item.sets === null || item.restSecs === null || pause !== null
            }
            onClick={() =>
              item.restSecs !== null &&
              startPause(item.restSecs, "sets", item.name, setIdx)
            }
          >
            Descanso
          </Button>
          {finishing ? (
            <>
              <Button variant="text" onClick={() => setFinishing(false)}>
                Seguir
              </Button>
              <Button disabled={!canFinish || saving} onClick={onFinish}>
                {saving ? "Guardando…" : "Terminar"}
              </Button>
            </>
          ) : (
            <Button onClick={startFinish}>Terminar</Button>
          )}
        </div>
      </footer>

      {/* Series sin completar: «Terminar» con algo pendiente avisa —ejercicio a
          ejercicio— antes de pedir el esfuerzo. */}
      {confirmingFinish && (
        <Dialog
          label="Series sin completar"
          onClose={() => setConfirmingFinish(false)}
          mobile="center"
          className="max-w-sm gap-4 p-6"
        >
          <h2 className="text-headline-s text-e">Series sin completar</h2>
          <p className="text-body-l text-on-surface-variant">
            Vas a cerrar la sesión con esto pendiente:
          </p>
          <ul className="flex flex-col gap-1">
            {pending.map((row) => (
              <li
                key={row.id}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="min-w-0 truncate text-body-l">{row.name}</span>
                <span className="shrink-0 text-label-l text-on-surface-variant">
                  {pendingLabel(row.sets)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="text" onClick={() => setConfirmingFinish(false)}>
              Seguir entrenando
            </Button>
            <Button
              onClick={() => {
                setConfirmingFinish(false);
                setFinishing(true);
              }}
            >
              Terminar
            </Button>
          </div>
        </Dialog>
      )}

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
                        moveTo(i);
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
