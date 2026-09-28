// Piezas compartidas de las listas ordenables (editor del día y celda de la
// rejilla): sensores, asa y anuncios del lector de pantalla en español.
import {
  type Announcements,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { ComponentProps } from "react";
import { GripIcon } from "./icons";
import { cx } from "./ui";

/** Ratón: umbral corto; táctil: mantener pulsado para no robar el scroll;
 *  teclado: espacio/intro para levantar y flechas para mover. */
export function useDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}

/** Asa de arrastre de una fila: botón de 48 px con el icono de agarre. Recibe
 *  los `attributes` y `listeners` de `useSortable` tal cual. */
export function DragHandle({
  label,
  className,
  ...rest
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(
        "state grid size-12 shrink-0 cursor-grab touch-none place-items-center rounded-full text-on-surface-variant active:cursor-grabbing",
        className,
      )}
      {...rest}
    >
      <GripIcon />
    </button>
  );
}

/** Anuncios del lector de pantalla; `positionOf` añade «en la posición N» al
 *  soltar (la posición del destino en el orden actual). */
export function sortableAnnouncements(
  nameOf: (id: UniqueIdentifier) => string,
  positionOf?: (id: UniqueIdentifier) => number,
): Announcements {
  return {
    onDragStart: ({ active }) => `Has levantado ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `Has movido ${nameOf(active.id)} sobre ${nameOf(over.id)}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over && positionOf
        ? `Has soltado ${nameOf(active.id)} en la posición ${positionOf(over.id)}.`
        : `Has soltado ${nameOf(active.id)}.`,
    onDragCancel: ({ active }) =>
      `Has cancelado el movimiento de ${nameOf(active.id)}.`,
  };
}

export const DRAG_INSTRUCTIONS = {
  draggable:
    "Para reordenar un ejercicio, enfoca su asa, pulsa espacio o intro, muévelo con las flechas y vuelve a pulsar espacio o intro para soltarlo; Esc cancela.",
};
