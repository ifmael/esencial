// Primitivas Material 3 Expressive. La piel vive en `globals.css` (.btn-*,
// .card-*, .input, .field, .chip, .badge-*, .fab, .connected, .checkbox,
// .switch, .alert-*); aquí queda el contrato de React. Una pantalla nunca
// escribe esas clases a mano (`pnpm lint` lo rechaza): pide la primitiva.
import {
  type ComponentProps,
  type PointerEvent,
  type ReactNode,
  useId,
} from "react";

/** Une clases saltándose las falsas. */
export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

/** Onda M3 al pulsar. Solo la dispara `pointerdown` (el teclado ya tiene su
 * capa de estado). Se monta en el propio elemento y se va al acabar. */
export function ripple(e: PointerEvent<HTMLElement>) {
  const host = e.currentTarget;
  const rect = host.getBoundingClientRect();
  const size = Math.hypot(rect.width, rect.height) * 2;
  const dot = document.createElement("span");
  dot.className = "ripple";
  dot.style.width = dot.style.height = `${size}px`;
  dot.style.left = `${e.clientX - rect.left - size / 2}px`;
  dot.style.top = `${e.clientY - rect.top - size / 2}px`;
  host.append(dot);
  dot.addEventListener("animationend", () => dot.remove(), { once: true });
}

// --- Botones -----------------------------------------------------------------

/** `filled` = acción principal (color de la sección); `tonal` = secundaria con
 * peso; `outlined` = secundaria; `text` = terciaria; `danger` = destructiva. */
export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "danger";
/** `sm` 40 px (dentro de filas densas), `md` 48 px (el mínimo táctil),
 * `lg` 56 px (acción protagonista), `icon` 48×48. */
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  filled: "btn-filled",
  tonal: "btn-tonal",
  outlined: "btn-outlined",
  text: "btn-text",
  danger: "btn-danger",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-10 px-4 text-label-l",
  md: "h-12 px-6 text-label-l",
  lg: "h-14 px-7 text-title-m",
  icon: "size-12 shrink-0 p-0",
  "icon-sm": "size-10 shrink-0 p-0",
};

/** Clases del botón, para los `<Link>` que deben *parecer* un botón. */
export function buttonClass({
  variant = "filled",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cx("btn state", BUTTON_VARIANT[variant], BUTTON_SIZE[size], className);
}

export function Button({
  variant = "filled",
  size = "md",
  className,
  type = "button",
  onPointerDown,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, className })}
      onPointerDown={(e) => {
        ripple(e);
        onPointerDown?.(e);
      }}
      {...rest}
    />
  );
}

/** Botón dividido (M3E *split button*): acción principal + un menú de
 * variantes a su lado. Las dos mitades se unen con esquinas interiores
 * pequeñas; la flecha se abre en redondo. */
export function SplitButton({
  children,
  onClick,
  menuLabel,
  menuOpen,
  onMenu,
  disabled,
  variant = "filled",
}: {
  children: ReactNode;
  onClick: () => void;
  menuLabel: string;
  menuOpen: boolean;
  onMenu: () => void;
  disabled?: boolean;
  variant?: "filled" | "tonal";
}) {
  return (
    <div className="connected">
      <Button variant={variant} onClick={onClick} disabled={disabled}>
        {children}
      </Button>
      <Button
        variant={variant}
        size="icon"
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-pressed={menuOpen}
        onClick={onMenu}
        disabled={disabled}
        className="w-12 grow-0"
      >
        <svg viewBox="0 -960 960 960" width={20} height={20} fill="currentColor" aria-hidden="true" className={cx("transition-transform motion-spatial-fast", menuOpen && "rotate-180")}>
          <path d="M459-381 314-526q-3-3-4.5-6.5T308-540q0-8 5.5-14t14.5-6h304q9 0 14.5 6t5.5 14q0 2-6 14L501-381q-5 5-10 7t-11 2q-6 0-11-2t-10-7Z" />
        </svg>
      </Button>
    </div>
  );
}

/** Grupo de botones conectados (M3E): opciones exclusivas o conmutables
 * pegadas; la elegida cambia de forma y la pulsada crece. */
export function ConnectedGroup({
  label,
  className,
  ...rest
}: ComponentProps<"div"> & { label: string }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: un fieldset no es flex en todos los motores y su leyenda sobra: el grupo se nombra con aria-label.
    <div role="group" aria-label={label} className={cx("connected", className)} {...rest} />
  );
}

/** Clases del contenedor de un grupo conectado que no es un `role=group`
 * (p. ej. un `<nav>` de enlaces). */
export const connectedClass = (className?: string) => cx("connected", className);

/** Clase de cada pieza de un grupo conectado cuando es un `<Link>`. */
export const connectedItemClass = (className?: string) =>
  cx("state inline-flex h-10 items-center justify-center gap-2 bg-surface-container-highest px-4 text-label-l text-on-surface-variant type-move", className);

export function ConnectedItem({
  pressed,
  className,
  onPointerDown,
  ...rest
}: ComponentProps<"button"> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={connectedItemClass(className)}
      onPointerDown={(e) => {
        ripple(e);
        onPointerDown?.(e);
      }}
      {...rest}
    />
  );
}

/** FAB. `size="lg"` = 96 px (raíl expandido), `md` = 56, `sm` = 40. Con
 * `extended` lleva etiqueta. `aria-expanded` lo transforma (menú FAB). */
export function Fab({
  size = "md",
  className,
  onPointerDown,
  ...rest
}: ComponentProps<"button"> & { size?: "sm" | "md" | "lg" }) {
  const box = { sm: "size-10 rounded-m", md: "h-14 min-w-14 px-4", lg: "size-24 rounded-xl" }[size];
  return (
    <button
      type="button"
      className={cx("fab state", box, className)}
      onPointerDown={(e) => {
        ripple(e);
        onPointerDown?.(e);
      }}
      {...rest}
    />
  );
}

// --- Superficies ---------------------------------------------------------------

export type CardVariant = "elevated" | "filled" | "outlined" | "tonal";

const CARD_VARIANT: Record<CardVariant, string> = {
  elevated: "card-elevated",
  filled: "card-filled",
  outlined: "card-outlined",
  tonal: "card-tonal",
};

/** Tarjeta M3: `elevated` (tono claro + sombra mínima), `filled` (el tono más
 * alto), `outlined` (borde), `tonal` (contenedor medio, la de por defecto). */
export function Card({
  variant = "tonal",
  className,
  ...rest
}: ComponentProps<"div"> & { variant?: CardVariant }) {
  return <div className={cardClass(variant, className)} {...rest} />;
}

/** Clases de la tarjeta para un `<Link>`, `<button>` o `<ul>`. */
export function cardClass(variant: CardVariant = "tonal", ...parts: (string | false | null | undefined)[]) {
  return cx("card", CARD_VARIANT[variant], ...parts);
}

type AlertTone = "error" | "info";

/** Aviso en línea. `error` anuncia (`role="alert"`); `info`, `status`. */
export function Alert({
  tone = "error",
  className,
  ...rest
}: ComponentProps<"div"> & { tone?: AlertTone }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("alert", tone === "error" ? "alert-error" : "alert-info", className)}
      {...rest}
    />
  );
}

// --- Campos ----------------------------------------------------------------------

/** Campo desnudo (sin etiqueta propia: la pone `<Field>` o un `aria-label`).
 * El error se marca con `aria-invalid`: gancho de estilo y de lector a la vez. */
export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx("input", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx("input resize-none", className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cx("input", className)} {...rest} />;
}

/** Campo M3 *outlined* con etiqueta flotante, texto de ayuda y error. Enlaza
 * etiqueta, ayuda y error por id; con `error` marca `aria-invalid`. */
export function Field({
  label,
  support,
  error,
  className,
  children,
}: {
  label: string;
  support?: ReactNode;
  error?: ReactNode;
  className?: string;
  /** El control; recibe los atributos de enlace. */
  children: (a11y: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
    placeholder: string;
  }) => ReactNode;
}) {
  const id = useId();
  const hint = error ? `${id}-error` : support ? `${id}-support` : undefined;
  return (
    <div className={cx("field", className)}>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": hint,
        // Un espacio: `:placeholder-shown` dice si el campo está vacío y la
        // etiqueta hace de placeholder mientras tanto.
        placeholder: " ",
      })}
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {error ? (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      ) : support ? (
        <span id={`${id}-support`} className="field-support">
          {support}
        </span>
      ) : null}
    </div>
  );
}

/** Casilla M3 con 48 px de área táctil. */
export function Checkbox({ className, ...rest }: Omit<ComponentProps<"input">, "type">) {
  return (
    <span className={cx("checkbox-target state", className)}>
      <input type="checkbox" className="checkbox" {...rest} />
    </span>
  );
}

/** Interruptor M3 (el pulgar crece al pulsar y salta con muelle). */
export function Switch({
  className,
  checked,
  ...rest
}: Omit<ComponentProps<"input">, "type" | "role">) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-checked={checked}
      checked={checked}
      className={cx("switch", className)}
      {...rest}
    />
  );
}

/** Chip de filtro o de navegación. `pressed` lo marca elegido. */
export function Chip({
  pressed,
  className,
  onPointerDown,
  ...rest
}: ComponentProps<"button"> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cx("chip state", className)}
      onPointerDown={(e) => {
        ripple(e);
        onPointerDown?.(e);
      }}
      {...rest}
    />
  );
}

/** Clases de chip para un `<Link>` (chips de navegación). */
export const chipClass = (className?: string) => cx("chip state", className);

// --- Insignias -----------------------------------------------------------------

type BadgeTone = "pending" | "done" | "neutral" | "accent";

const BADGE_TONE: Record<BadgeTone, string> = {
  pending: "badge-pending",
  done: "badge-done",
  neutral: "badge-neutral",
  accent: "badge-accent",
};

export function Badge({
  tone = "neutral",
  className,
  ...rest
}: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return <span className={cx(BADGE_TONE[tone], className)} {...rest} />;
}

/** Tecla de un atajo (⌘K). */
export function Kbd({ className, ...rest }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cx("inline-grid min-w-6 place-items-center rounded-xs bg-surface-container-highest px-1.5 font-sans text-label-s text-on-surface-variant", className)}
      {...rest}
    />
  );
}
