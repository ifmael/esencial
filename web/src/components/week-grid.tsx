// Rejilla semanal de fuerza (Lunes→Domingo). Presentacional: la página es dueña
// del hook usePlanWeek, del picker y del editor del día. Celdas: vacía →
// "+ añadir"; planned → nombre + "+" para añadir más + badge Pendiente + ✕ con
// confirmación inline; logged → badge Hecho y tap hacia la pantalla de sesión
// (solo lectura).
import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toISODate } from "../lib/day";
import { targetSummary } from "../lib/exercises";
import type { PlanSession, SessionExercise } from "../lib/plan-week";
import {
  DRAG_INSTRUCTIONS,
  GripIcon,
  sortableAnnouncements,
  useDragSensors,
} from "./sortable";

const DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

/** YYYY-MM-DD of day `dayIndex` (0=Lunes) of ISO week, UTC-math, no clock. */
function dayOf(isoWeek: string, dayIndex: number): string {
  const [yearStr, weekStr] = isoWeek.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(
    jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000,
  );
  const date = new Date(monday.getTime() + (week - 1) * 7 * 86_400_000);
  date.setUTCDate(date.getUTCDate() + dayIndex);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Fila de la celda: asa (días planned) + nombre + info del objetivo. */
function CellRow({
  exercise,
  sortable,
}: {
  exercise: SessionExercise;
  sortable: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exercise.exerciseId, disabled: !sortable });
  const info = targetSummary(exercise);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 ${
        isDragging ? "relative z-10 opacity-70" : ""
      }`}
    >
      {sortable ? (
        <button
          type="button"
          className="cursor-grab touch-none px-1 text-text-secondary hover:text-primary active:cursor-grabbing"
          aria-label={`Mover ${exercise.exerciseName}`}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
      ) : null}
      <span className="min-w-0 truncate">{exercise.exerciseName}</span>
      {info ? <span className="ml-auto shrink-0 text-xs">{info}</span> : null}
    </li>
  );
}

function SessionCell({
  date,
  session,
  isToday,
  onOpen,
  onRemove,
  onReorder,
}: {
  date: string;
  session: PlanSession | undefined;
  isToday: boolean;
  onOpen: () => void;
  onRemove: (id: number) => void;
  onReorder: (session: PlanSession, exercises: SessionExercise[]) => void;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const sensors = useDragSensors();
  const border = isToday ? "border-primary/60" : "";

  if (!session) {
    return (
      <button
        onClick={onOpen}
        className={`flex min-h-11 flex-1 flex-col items-center justify-start rounded-lg border border-dashed pt-3 text-text-secondary hover:border-primary hover:text-primary ${
          border || "border-border"
        }`}
      >
        <span className="text-sm">+ añadir</span>
      </button>
    );
  }

  const logged = session.status === "logged";
  const badge = logged ? (
    <span className="badge-done self-start">Hecho</span>
  ) : (
    <span className="badge-pending self-start">Pendiente</span>
  );
  const order = session.exercises;
  const nameOf = (id: number | string) =>
    order.find((e) => e.exerciseId === id)?.exerciseName ?? "";

  /** Reordena en el sitio: el PUT (optimista en el hook) lo persiste al soltar. */
  const moveExercise = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = order.findIndex((e) => e.exerciseId === active.id);
    const to = order.findIndex((e) => e.exerciseId === over.id);
    if (from === -1 || to === -1) return;
    onReorder(session, arrayMove(order, from, to));
  };

  return (
    <div
      className={`flex min-h-11 flex-1 cursor-pointer flex-col gap-1 rounded-lg border border-border bg-surface p-2 ${border}`}
      onClick={() => (logged ? navigate(`/sesion/${date}`) : onOpen())}
    >
      <div className="flex items-center gap-2">
        <button
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
          aria-label={
            logged ? `Ver sesión del ${date}` : `Editar sesión del ${date}`
          }
          onClick={(e) => {
            e.stopPropagation();
            if (logged) navigate(`/sesion/${date}`);
            else onOpen();
          }}
        >
          {session.name ?? "Sesión"}
        </button>
        {logged ? null : (
          <>
            <button
              aria-label={`Añadir ejercicios al ${date}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="min-h-11 px-2 text-text-secondary hover:text-primary"
            >
              +
            </button>
            <button
              aria-label={`Desprogramar sesión del ${date}`}
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
              className="min-h-11 px-2 text-text-secondary hover:text-error"
            >
              ✕
            </button>
          </>
        )}
      </div>
      {badge}
      {order.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={moveExercise}
          accessibility={{
            screenReaderInstructions: DRAG_INSTRUCTIONS,
            announcements: sortableAnnouncements(
              nameOf,
              (id) => order.findIndex((e) => e.exerciseId === id) + 1,
            ),
          }}
        >
          <SortableContext
            items={order.map((e) => e.exerciseId)}
            strategy={verticalListSortingStrategy}
          >
            <ol
              aria-label={`Ejercicios del ${date}`}
              className="list-decimal pl-4 text-sm text-text-secondary"
            >
              {order.map((e) => (
                <CellRow key={e.exerciseId} exercise={e} sortable={!logged} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : null}
      {confirming ? (
        <button
          className="btn-primary min-h-11 bg-error text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(false);
            onRemove(session.id);
          }}
        >
          Confirmar desprogramar
        </button>
      ) : null}
    </div>
  );
}

export function WeekGrid({
  isoWeek,
  sessions,
  loading,
  error,
  onShiftWeek,
  onOpenDay,
  onRemove,
  onReorder,
}: {
  isoWeek: string;
  sessions: PlanSession[];
  loading: boolean;
  error: string | null;
  onShiftWeek: (delta: number) => void;
  onOpenDay: (date: string) => void;
  onRemove: (id: number) => void;
  onReorder: (session: PlanSession, exercises: SessionExercise[]) => void;
}) {
  const today = toISODate(new Date());
  const byDate = new Map(sessions.map((s) => [s.date, s]));

  return (
    <section className="card flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <button
          aria-label="Semana anterior"
          className="btn-secondary"
          onClick={() => onShiftWeek(-1)}
        >
          ‹
        </button>
        <h2 className="text-xl font-bold">{isoWeek}</h2>
        <button
          aria-label="Semana siguiente"
          className="btn-secondary"
          onClick={() => onShiftWeek(1)}
        >
          ›
        </button>
      </header>

      {error ? (
        <div role="alert" className="text-error">
          {error}
        </div>
      ) : null}
      {loading && sessions.length === 0 ? (
        <div className="text-text-secondary">Cargando…</div>
      ) : (
        <div className="flex flex-col gap-3 md:grid md:min-h-0 md:flex-1 md:grid-flow-col md:auto-cols-fr md:gap-2">
          {DAYS.map((day, di) => {
            const date = dayOf(isoWeek, di);
            return (
              <div key={day} className="flex flex-col gap-2 md:min-h-0">
                <h3 className="font-semibold">
                  {day}
                  {date === today ? (
                    <span className="ml-2 text-xs font-bold text-primary">
                      Hoy
                    </span>
                  ) : null}
                </h3>
                <SessionCell
                  date={date}
                  session={byDate.get(date)}
                  isToday={date === today}
                  onOpen={() => onOpenDay(date)}
                  onRemove={onRemove}
                  onReorder={onReorder}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
