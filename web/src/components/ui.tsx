// Primitivas compartidas (dirección B «cristal»). La piel vive en las clases de
// `globals.css` (.glass, .card, .sheet, .btn-*, .input, .badge-*, .chip) y aquí
// queda solo el contrato de React — variantes, tonos, tamaños y el `type`.
import type { ComponentProps } from "react";

/** Une clases saltándose las falsas. Sin dependencias: son cuatro líneas. */
const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

/** `md` = 44px de alto (área táctil mínima); `icon` = 44×44 cuadrado. */
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-caption",
  md: "h-11 px-4 text-body",
  icon: "size-11 shrink-0 p-0",
};

/** Clases del botón, para los `<Link>` que deben *parecer* un botón: así la piel
 * se define una sola vez y ninguna pantalla repite `.btn-*` a mano. */
export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cx("btn", BUTTON_VARIANT[variant], BUTTON_SIZE[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, className })}
      {...rest}
    />
  );
}

/** Tarjeta de vidrio tintado, sin blur: las listas pueden tener decenas. */
export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cx("glass card", className)} {...rest} />;
}

/** Clases de la tarjeta, para los elementos que se ven como una tarjeta pero no
 * pueden ser un `<div>`: un `<Link>`, un `<button>` o un `<ul>` con sus `<li>`.
 * `Card` renderiza un div, así que en esos casos la piel se pide aquí. */
export function cardClass(...parts: (string | false | null | undefined)[]) {
  return cx("glass card", ...parts);
}

/** Tarjeta con blur real: una sola pieza protagonista por pantalla (la rejilla
 * del calendario). Cada capa con blur cuesta GPU; nunca en una lista. */
export function blurCardClass(...parts: (string | false | null | undefined)[]) {
  return cx("glass glass-blur card", ...parts);
}

/** Fondo de una modal: oscurece la página y centra la hoja. Pulsar el propio
 * fondo (no la hoja) cierra; el consumidor decide qué es cerrar. */
export function Scrim({
  className,
  onDismiss,
  ...rest
}: ComponentProps<"div"> & { onDismiss?: () => void }) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape lo gestiona la modal; el clic en el fondo es un atajo de ratón.
    <div
      className={cx("scrim fixed inset-0 z-50 flex p-4", className)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss?.();
      }}
      {...rest}
    />
  );
}

/** Cromo de vidrio: barra lateral y barra inferior, lo que queda fijo encima
 * del contenido que se desplaza por detrás. */
export function chromeClass(...parts: (string | false | null | undefined)[]) {
  return cx("glass-chrome", ...parts);
}

/** Hoja de vidrio denso: el panel de una modal o de un cajón lateral. */
export function sheetClass(...parts: (string | false | null | undefined)[]) {
  return cx("glass-chrome sheet", ...parts);
}

/** Panel de una modal: la hoja con el relleno de una tarjeta. */
export function Sheet({ className, ...rest }: ComponentProps<"div">) {
  return <div className={sheetClass("p-card", className)} {...rest} />;
}

/** Ficha pequeña (material, tag, filtro). Si es un botón conmutable, su
 * `aria-pressed` la pinta rellena de marca; `tone="done"` es la ficha verde. */
export function chipClass({
  tone,
  className,
}: {
  tone?: "done";
  className?: string;
} = {}) {
  return cx("chip", tone === "done" && "chip-done", className);
}

/** Campo de texto. El error se marca con `aria-invalid`, que es a la vez el
 * gancho de estilo y lo que anuncia el lector de pantalla. */
export function Input({
  className,
  "aria-invalid": invalid,
  ...rest
}: ComponentProps<"input">) {
  const bad = invalid === true || invalid === "true";
  return (
    <input
      aria-invalid={invalid}
      className={cx("input", bad && "input-error", className)}
      {...rest}
    />
  );
}

export function Textarea({
  className,
  "aria-invalid": invalid,
  ...rest
}: ComponentProps<"textarea">) {
  const bad = invalid === true || invalid === "true";
  return (
    <textarea
      aria-invalid={invalid}
      className={cx("input", "resize-none", bad && "input-error", className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  "aria-invalid": invalid,
  ...rest
}: ComponentProps<"select">) {
  const bad = invalid === true || invalid === "true";
  return (
    <select
      aria-invalid={invalid}
      className={cx("input", bad && "input-error", className)}
      {...rest}
    />
  );
}

type BadgeTone = "pending" | "done" | "neutral";

const BADGE_TONE: Record<BadgeTone, string> = {
  pending: "badge-pending",
  done: "badge-done",
  neutral: "badge-neutral",
};

export function Badge({
  tone = "neutral",
  className,
  ...rest
}: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return <span className={cx(BADGE_TONE[tone], className)} {...rest} />;
}
