// Primitivas compartidas (variante A). Postura mixta: la piel vive en las
// clases de `globals.css` (.btn-*, .card, .input, .badge-*) y aquí queda solo
// el contrato de React — variantes, tonos, tamaños y el `type` del botón.
import type { ComponentProps } from "react";

/** Une clases saltándose las falsas. Sin dependencias: son cuatro líneas. */
const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "icon";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
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

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cx("card", className)} {...rest} />;
}

/** Clases de la tarjeta, para los elementos que se ven como una tarjeta pero no
 * pueden ser un `<div>`: un `<Link>`, un `<button>` o un `<ul>` con sus `<li>`.
 * `Card` renderiza un div, así que en esos casos la piel se pide aquí. */
export function cardClass(...parts: (string | false | null | undefined)[]) {
  return cx("card", ...parts);
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
