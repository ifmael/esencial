// Diálogos de la copia de sesiones en /plan-fuerza: un día sobre otro y una
// semana entera sobre otra. Los dos avisan ANTES de escribir (qué se sustituye,
// qué se crea y qué se borra) y los dos dicen también cuándo la operación no es
// posible, con el motivo a la vista: un día registrado no se puede escribir y
// uno con borrador sin registrar perdería lo hecho.
import { useState } from "react";
import {
  countExercises,
  dayBlockedMessage,
  dayLabel,
  replaceNotice,
  weekCopyBlockers,
  weekCopyDays,
  weekCopyLines,
} from "../lib/copy-session";
import { isoWeekDates } from "../lib/iso-week";
import type { PlanSession } from "../lib/plan-week";
import { Shape } from "./expressive";
import { CloseIcon, CopyIcon } from "./icons";
import { Dialog } from "./overlay";
import { Alert, Button, Field, Input, Select } from "./ui";

/** Cabecera común de los dos diálogos (icono, título y cierre). */
function CopyHeader({
  id,
  title,
  detail,
  onClose,
}: {
  id: string;
  title: string;
  detail: string;
  onClose: () => void;
}) {
  return (
    <header className="flex items-center gap-3 px-4 pt-4 md:px-6 md:pt-5">
      <Shape name="cookie-12" size={40} className="text-accent-container">
        <CopyIcon className="text-on-accent-container" />
      </Shape>
      <h2 id={id} className="min-w-0 flex-1 text-headline-s text-e">
        {title}{" "}
        <span className="tabular text-on-surface-variant">{detail}</span>
      </h2>
      <Button
        variant="text"
        size="icon"
        aria-label="Cerrar"
        className="text-on-surface-variant"
        onClick={onClose}
      >
        <CloseIcon />
      </Button>
    </header>
  );
}

const FOOTER =
  "flex flex-wrap items-center justify-end gap-2 px-4 pt-2 pb-4 md:px-6 md:pb-5";
const BODY = "flex flex-col gap-3 px-4 py-3 md:px-6";

/** Copiar una sesión guardada sobre el día `target`. */
export function CopyDayDialog({
  target,
  targetSession,
  sources,
  hasDraft,
  onCopy,
  onClose,
}: {
  target: string;
  /** La sesión que hay en el destino (undefined si el día está vacío). */
  targetSession: PlanSession | undefined;
  /** Días con sesión guardada que pueden ser origen (sin el destino). */
  sources: readonly PlanSession[];
  /** El destino tiene un borrador del modo sesión sin registrar. */
  hasDraft: boolean;
  onCopy: (source: PlanSession) => Promise<void>;
  onClose: () => void;
}) {
  const blocked = dayBlockedMessage(targetSession, hasDraft, target);
  const empty = sources.length === 0;
  // Arranca en la sesión más reciente anterior al destino: «el de ayer».
  const initial =
    (sources.find((s) => s.date < target) ?? sources[0])?.date ?? "";
  const [date, setDate] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const chosen = sources.find((s) => s.date === date);
  const error = !date
    ? null
    : date === target
      ? "Ese es el día de destino: elige otro."
      : !chosen
        ? "Ese día no tiene sesión guardada."
        : null;

  const copy = async () => {
    if (!chosen || busy || error) return;
    setBusy(true);
    setFailure(null);
    try {
      await onCopy(chosen);
      onClose();
    } catch {
      setFailure("No se pudo copiar la sesión; se deshizo lo aplicado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      labelledBy="copy-day-title"
      mobile="sheet"
      className="md:max-w-lg"
    >
      <CopyHeader
        id="copy-day-title"
        title="Copiar sesión"
        detail={`· ${dayLabel(target)}`}
        onClose={onClose}
      />
      <div className={BODY}>
        {blocked ? (
          <Alert>{blocked}</Alert>
        ) : empty ? (
          <Alert tone="info">
            Todavía no hay otra sesión guardada que copiar.
          </Alert>
        ) : (
          <>
            <Field
              label="Copiar desde"
              support="Solo los días con sesión guardada."
              error={error}
            >
              {(a) => (
                <Input
                  {...a}
                  type="date"
                  className="tabular"
                  value={date}
                  min={sources[sources.length - 1]?.date}
                  max={sources[0]?.date}
                  // Chromium solo abre el calendario desde el icono: así se
                  // abre al pulsar en cualquier punto (el patrón de «Hoy»).
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {}
                  }}
                  onChange={(e) => setDate(e.target.value)}
                />
              )}
            </Field>
            {chosen ? (
              <p role="status" className="text-body-m text-on-surface-variant">
                «{chosen.name ?? "Sesión"}» ·{" "}
                {countExercises(chosen.exercises.length)}
              </p>
            ) : null}
            {targetSession ? (
              <Alert tone="info">
                {replaceNotice(targetSession.exercises.length)}
              </Alert>
            ) : null}
            {failure ? <Alert>{failure}</Alert> : null}
          </>
        )}
      </div>
      <footer className={FOOTER}>
        <Button variant="outlined" onClick={onClose}>
          {blocked || empty ? "Cerrar" : "Cancelar"}
        </Button>
        {blocked || empty ? null : (
          <Button onClick={() => void copy()} disabled={!chosen || busy}>
            {busy ? "Copiando…" : "Copiar"}
          </Button>
        )}
      </footer>
    </Dialog>
  );
}

/** Copiar una semana anterior sobre la semana que se está viendo. */
export function CopyWeekDialog({
  week,
  weeks,
  sessions,
  hasDraft,
  onCopy,
  onClose,
}: {
  /** La semana que se está viendo: el destino. */
  week: string;
  /** Semanas anteriores con sesiones (las únicas que pueden ser origen). */
  weeks: readonly { week: string; count: number }[];
  /** Todas las sesiones del usuario (para emparejar las dos semanas). */
  sessions: readonly PlanSession[];
  hasDraft: (date: string) => boolean;
  onCopy: (sourceWeek: string) => Promise<void>;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(weeks[0]?.week ?? "");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const days = from
    ? weekCopyDays(isoWeekDates(week), isoWeekDates(from), sessions)
    : [];
  const lines = weekCopyLines(days);
  const blockers = from ? weekCopyBlockers(days, hasDraft) : [];

  const copy = async () => {
    if (!from || busy || blockers.length > 0) return;
    setBusy(true);
    setFailure(null);
    try {
      await onCopy(from);
      onClose();
    } catch {
      setFailure(
        "No se pudo copiar la semana; se deshizo lo aplicado y la rejilla se ha recargado.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      labelledBy="copy-week-title"
      mobile="sheet"
      className="md:max-w-lg"
    >
      <CopyHeader
        id="copy-week-title"
        title="Copiar semana"
        detail={`· ${week}`}
        onClose={onClose}
      />
      <div className={BODY}>
        {weeks.length === 0 ? (
          <Alert tone="info">
            No hay ninguna semana anterior con sesiones que copiar.
          </Alert>
        ) : (
          <>
            <Field
              label="Semana de origen"
              support="La semana que ves es el destino: se vacía y se copia día a día."
            >
              {(a) => (
                <Select
                  {...a}
                  className="tabular"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                >
                  {weeks.map((w) => (
                    <option key={w.week} value={w.week}>
                      {`${w.week} · ${w.count} ${w.count === 1 ? "sesión" : "sesiones"}`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <ul
              aria-label="Lo que hará la copia"
              className="flex flex-col gap-1"
            >
              {lines.map((line) => (
                <li key={line} className="text-body-m">
                  {line}
                </li>
              ))}
            </ul>
            {blockers.map((blocker) => (
              <Alert key={blocker}>{blocker}</Alert>
            ))}
            {failure ? <Alert>{failure}</Alert> : null}
          </>
        )}
      </div>
      <footer className={FOOTER}>
        <Button variant="outlined" onClick={onClose}>
          {weeks.length === 0 ? "Cerrar" : "Cancelar"}
        </Button>
        {weeks.length === 0 ? null : (
          <Button
            onClick={() => void copy()}
            disabled={busy || blockers.length > 0 || lines.length === 0}
          >
            {busy ? "Copiando…" : "Copiar"}
          </Button>
        )}
      </footer>
    </Dialog>
  );
}
