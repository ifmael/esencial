// Copiar una sesión de fuerza entre días y una semana entera sobre otra.
// Se copia el PLAN —ejercicios, orden, objetivos, descansos, cadenas y el
// nombre—, nunca el registro (marcas, esfuerzo, nota) ni el borrador local del
// origen, que vive solo en este navegador. Todo es puro salvo el ejecutor, que
// habla con la API y sabe deshacerse (el «Deshacer» del snackbar).
//
// Un destino registrado no se puede escribir (la API responde 409 a cualquier
// PUT/DELETE), así que la comprobación va ANTES de escribir. Con un borrador
// con trabajo sin registrar pasa lo mismo: copiar encima tiraría lo hecho y sin
// guardar. Si aun así una escritura falla a mitad, se deshace lo aplicado —best
// effort— y la rejilla recarga para enseñar el estado real del servidor.
import { apiSend } from "./api";
import { dayLabel } from "./day";
import { isoWeekOfDay } from "./iso-week";
import {
  type PlanSession,
  planItems,
  recreatePayload,
  type SessionPayload,
} from "./plan-week";

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const exercisesText = (n: number) => plural(n, "ejercicio", "ejercicios");

/** Rótulo con mayúscula inicial, para encabezar una línea de aviso. */
function dayTitle(date: string): string {
  const label = dayLabel(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** «1 ejercicio» / «3 ejercicios», para los rótulos de la copia. */
export const countExercises = (n: number): string => exercisesText(n);

const nameOf = (session: PlanSession) => session.name ?? "Sesión";

/** Cuerpo del POST/PUT: el nombre y el plan del origen, en su orden. */
export function copyPayload(session: PlanSession): SessionPayload {
  return {
    name: session.name,
    items: planItems(session.exercises, new Map()),
  };
}

/**
 * Una escritura de la copia. `create` rellena un día vacío, `replace` sustituye
 * la sesión de un día planificado y `delete` deja el día sin sesión (semana).
 */
export type CopyOp = {
  kind: "create" | "replace" | "delete";
  date: string;
  /** El origen; no viaja en un `delete`. */
  source?: PlanSession;
  /** La sesión que había en el destino (para el «Deshacer»). */
  target?: PlanSession;
};

/** Motivo por el que un destino no admite la copia (null si la admite). */
function blockedCause(
  session: PlanSession | undefined,
  hasDraft: boolean,
): string | null {
  if (session?.status === "logged") return "ya está registrado";
  if (hasDraft) return "tiene un borrador sin registrar";
  return null;
}

/** Aviso de un destino no escribible para copiar un día (null si vale). */
export function dayBlockedMessage(
  session: PlanSession | undefined,
  hasDraft: boolean,
  date: string,
): string | null {
  const cause = blockedCause(session, hasDraft);
  return cause
    ? `El ${dayLabel(date)} ${cause}: no se puede copiar encima.`
    : null;
}

/** Aviso de que el destino ya tiene sesión: se sustituye entera. */
export function replaceNotice(count: number): string {
  return `El día ya tiene ${exercisesText(count)}: se ${
    count === 1 ? "sustituirá" : "sustituirán"
  }.`;
}

/** Días con sesión guardada que pueden ser origen, del más reciente al más
 *  antiguo y sin el destino (copiar un día sobre sí mismo no es copiar). */
export function daySources(
  sessions: readonly PlanSession[],
  targetDate: string,
): PlanSession[] {
  return sessions
    .filter((s) => s.date !== targetDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** La escritura de copiar un día sobre otro. */
export function dayCopyOp(
  target: string,
  source: PlanSession,
  targetSession: PlanSession | undefined,
): CopyOp {
  return targetSession
    ? { kind: "replace", date: target, source, target: targetSession }
    : { kind: "create", date: target, source, target: undefined };
}

// --- Semana → semana --------------------------------------------------------

/** Un día de la copia semanal: su origen, su destino y lo que pasará. */
export type WeekDayCopy = {
  date: string;
  source: PlanSession | null;
  target: PlanSession | null;
  action: "create" | "replace" | "delete" | "none";
};

/** Empareja las dos semanas día a día (lunes con lunes, martes con martes…):
 *  el destino queda exactamente como el origen, con sus días vacíos incluidos. */
export function weekCopyDays(
  targetDates: readonly string[],
  sourceDates: readonly string[],
  sessions: readonly PlanSession[],
): WeekDayCopy[] {
  const byDate = new Map(sessions.map((s) => [s.date, s]));
  return targetDates.map((date, i) => {
    const source = byDate.get(sourceDates[i] ?? "") ?? null;
    const target = byDate.get(date) ?? null;
    const action = source
      ? target
        ? "replace"
        : "create"
      : target
        ? "delete"
        : "none";
    return { date, source, target, action };
  });
}

/** Las escrituras de la copia semanal, en el orden de los días. */
export function weekCopyOps(days: readonly WeekDayCopy[]): CopyOp[] {
  return days.flatMap((day): CopyOp[] => {
    if (day.action === "none") return [];
    if (day.action === "delete")
      return day.target
        ? [{ kind: "delete", date: day.date, target: day.target }]
        : [];
    if (!day.source) return [];
    return [
      {
        kind: day.action,
        date: day.date,
        source: day.source,
        target: day.target ?? undefined,
      },
    ];
  });
}

/** El aviso global, día a día: qué se crea, se sustituye o se borra. */
export function weekCopyLines(days: readonly WeekDayCopy[]): string[] {
  return days.flatMap((day) => {
    const label = dayTitle(day.date);
    if (day.action === "create" && day.source)
      return [
        `${label}: se copia «${nameOf(day.source)}» (${exercisesText(
          day.source.exercises.length,
        )})`,
      ];
    if (day.action === "replace" && day.source)
      return [
        `${label}: se sustituye por «${nameOf(day.source)}» (${exercisesText(
          day.source.exercises.length,
        )})`,
      ];
    if (day.action === "delete" && day.target)
      return [
        `${label}: se borra «${nameOf(day.target)}» (${exercisesText(
          day.target.exercises.length,
        )})`,
      ];
    return [];
  });
}

/** Los destinos que no se pueden escribir. Con uno basta para no copiar nada;
 *  el aviso nombra el día porque no hay forma de «quitarlo» desde la app. Un
 *  día sin escrituras (`none`) nunca bloquea: no se toca. */
export function weekCopyBlockers(
  days: readonly WeekDayCopy[],
  hasDraft: (date: string) => boolean,
): string[] {
  return days.flatMap((day) => {
    if (day.action === "none") return [];
    const cause = blockedCause(day.target ?? undefined, hasDraft(day.date));
    return cause
      ? [`El ${dayLabel(day.date)} ${cause}: no se puede copiar la semana.`]
      : [];
  });
}

export type WeekCopySummary = {
  created: number;
  replaced: number;
  deleted: number;
  /** Ejercicios copiados (los de los días creados y sustituidos). */
  exercises: number;
};

export function weekCopySummary(days: readonly WeekDayCopy[]): WeekCopySummary {
  const summary: WeekCopySummary = {
    created: 0,
    replaced: 0,
    deleted: 0,
    exercises: 0,
  };
  for (const day of days) {
    if (day.action === "create") summary.created += 1;
    else if (day.action === "replace") summary.replaced += 1;
    else if (day.action === "delete") summary.deleted += 1;
    else continue;
    if (day.action !== "delete" && day.source)
      summary.exercises += day.source.exercises.length;
  }
  return summary;
}

/** El mensaje final de la copia semanal. */
export function weekCopyMessage(summary: WeekCopySummary): string {
  return [
    "Semana copiada",
    plural(summary.created, "creado", "creados"),
    plural(summary.replaced, "sustituido", "sustituidos"),
    plural(summary.deleted, "borrado", "borrados"),
    exercisesText(summary.exercises),
  ].join(" · ");
}

/** El mensaje final de copiar un día. */
export function dayCopyMessage(date: string, exercises: number): string {
  return `Sesión copiada al ${dayLabel(date)} · ${exercisesText(exercises)}`;
}

/** Semanas anteriores a `week` que tienen alguna sesión, de la más reciente a
 *  la más antigua: las únicas que pueden ser origen de la copia semanal. */
export function sourceWeeks(
  sessions: readonly PlanSession[],
  week: string,
): { week: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const w = isoWeekOfDay(session.date);
    if (w < week) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([w, count]) => ({ week: w, count }))
    .sort((a, b) => (a.week < b.week ? 1 : -1));
}

// --- Ejecución y «Deshacer» -------------------------------------------------

/** Cómo deshacer una escritura ya hecha. */
export type UndoStep =
  | { action: "delete"; id: number }
  | { action: "put"; id: number; payload: SessionPayload }
  | { action: "post"; payload: SessionPayload & { date: string } };

/** Fallo de una copia: además del error que la cortó, dice cuántos pasos del
 *  «Deshacer» no se pudieron aplicar (el deshacer es best effort). */
export class CopyError extends Error {
  constructor(
    /** Pasos que el servidor rechazó al deshacer. */
    public readonly undoFailed: number,
    /** El error original de la API, para depurar. */
    public readonly reason: unknown,
  ) {
    super("No se pudo copiar");
    this.name = "CopyError";
  }
}

/** Qué decir cuando una copia falla a mitad: si el deshacer dejó algo a medias,
 *  no se promete que volvió todo (la rejilla recarga y enseña lo que hay). */
export function copyFailureMessage(
  what: "la sesión" | "la semana",
  undoFailed: number,
): string {
  return undoFailed === 0
    ? `No se pudo copiar ${what}; se deshizo lo aplicado y la rejilla se ha recargado.`
    : `No se pudo copiar ${what} y no se pudo deshacer todo; la rejilla se ha recargado.`;
}

/** Aplica las escrituras en orden y devuelve cómo deshacerlas. Si una falla,
 *  deshace lo ya aplicado y relanza diciendo si ese deshacer quedó a medias. */
export async function applyCopyOps(
  ops: readonly CopyOp[],
): Promise<UndoStep[]> {
  const steps: UndoStep[] = [];
  try {
    for (const op of ops) {
      if (op.kind === "delete") {
        if (!op.target) continue;
        await apiSend(`/api/plan-sessions/${op.target.id}`, "DELETE", {});
        steps.push({ action: "post", payload: recreatePayload(op.target) });
        continue;
      }
      const payload = copyPayload(op.source as PlanSession);
      if (op.kind === "replace" && op.target) {
        // El plan de antes se guarda como copia: deshacer no depende de lo que
        // pase después con el estado de la página.
        steps.push({
          action: "put",
          id: op.target.id,
          payload: copyPayload(op.target),
        });
        await apiSend(`/api/plan-sessions/${op.target.id}`, "PUT", payload);
        continue;
      }
      const created = await apiSend<{ id: number }>(
        "/api/plan-sessions",
        "POST",
        {
          date: op.date,
          ...payload,
        },
      );
      steps.push({ action: "delete", id: created.id });
    }
  } catch (e) {
    throw new CopyError((await undoCopy(steps)).length, e);
  }
  return steps;
}

/** Deshace la copia entera, de la última escritura a la primera. Es best
 *  effort: devuelve los pasos que el servidor no dejó deshacer, para no
 *  prometer que todo volvió. */
export async function undoCopy(
  steps: readonly UndoStep[],
): Promise<UndoStep[]> {
  const failed: UndoStep[] = [];
  for (const step of [...steps].reverse()) {
    try {
      if (step.action === "delete") {
        await apiSend(`/api/plan-sessions/${step.id}`, "DELETE", {});
      } else if (step.action === "put") {
        await apiSend(`/api/plan-sessions/${step.id}`, "PUT", step.payload);
      } else {
        await apiSend("/api/plan-sessions", "POST", step.payload);
      }
    } catch {
      // Un paso que no se pudo deshacer no corta el resto: la rejilla recarga
      // y el aviso dice que puede haber quedado algo a medias.
      failed.push(step);
    }
  }
  return failed;
}
