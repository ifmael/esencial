// Superficies superpuestas M3: diálogo (a pantalla completa en móvil), hoja
// inferior con asa y arrastre para cerrar, y el snackbar global con «Deshacer».
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { pushEscape } from "../lib/escape-stack";
import { sheetDrag, sheetRelease } from "../lib/sheet";
import {
  createSnackbarStore,
  type SnackbarInput,
  type SnackbarStore,
} from "../lib/snackbar";
import { CloseIcon } from "./icons";
import { Button, cx } from "./ui";

/** Velo que cierra al pulsar fuera (solo si el clic empieza y acaba en él). */
export function Scrim({
  onClose,
  className,
  children,
  ...rest
}: ComponentProps<"div"> & { onClose: () => void }) {
  return (
    <div
      className={cx("scrim fixed inset-0 z-50", className)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Gesto del asa de una hoja inferior: devuelve el desplazamiento vivo y los
 * manejadores para el asa. Soltar decide con `sheetRelease` (lib/sheet). */
function useSheetDrag(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; t: number } | null>(null);
  const handle = (
    <div
      className="flex h-9 shrink-0 cursor-grab touch-none items-center justify-center md:hidden"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, t: e.timeStamp };
      }}
      onPointerMove={(e) => {
        if (drag.current) setDy(sheetDrag(e.clientY - drag.current.y));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        const moved = e.clientY - d.y;
        const result = sheetRelease({
          dy: moved,
          velocity: moved / Math.max(1, e.timeStamp - d.t),
          height: ref.current?.offsetHeight ?? 600,
        });
        setDy(0);
        if (result === "close") onClose();
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDy(0);
      }}
    >
      <span className="sheet-handle" aria-hidden="true" />
    </div>
  );
  return {
    ref,
    handle,
    style: dy
      ? { transform: `translateY(${dy}px)`, transition: "none" }
      : undefined,
  };
}

/** Escape cierra esta capa si es la de encima (lib/escape-stack). */
function useEscape(onClose: () => void) {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => pushEscape(() => latest.current()), []);
}

/** Diálogo M3: en escritorio centrado con esquinas XL. Por debajo de `md`,
 * según `mobile`: a pantalla completa (`fullscreen`, por defecto), como hoja
 * inferior con asa y arrastre para cerrar (`sheet`) o centrado (`center`).
 * Escape cierra. Un solo `role="dialog"`. */
export function Dialog({
  onClose,
  label,
  labelledBy,
  className,
  style,
  mobile = "fullscreen",
  children,
}: {
  onClose: () => void;
  label?: string;
  labelledBy?: string;
  className?: string;
  style?: CSSProperties;
  mobile?: "fullscreen" | "sheet" | "center";
  children: ReactNode;
}) {
  useEscape(onClose);
  const drag = useSheetDrag(onClose);
  const sheet = mobile === "sheet";
  return (
    <Scrim
      onClose={onClose}
      className={cx(
        "flex justify-center",
        mobile === "fullscreen" && "items-stretch md:items-center md:p-6",
        sheet && "items-end md:items-center md:p-6",
        mobile === "center" && "items-center p-4",
      )}
    >
      <div
        ref={drag.ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        style={sheet ? { ...style, ...drag.style } : style}
        className={cx(
          "dialog flex w-full flex-col",
          mobile === "fullscreen" && "max-md:rounded-none max-md:shadow-none",
          sheet &&
            "max-md:max-h-[92dvh] max-md:rounded-t-xl max-md:rounded-b-none max-md:pb-[env(safe-area-inset-bottom)] max-md:[animation-name:sheet-in]",
          className,
        )}
      >
        {sheet ? drag.handle : null}
        {children}
      </div>
    </Scrim>
  );
}

/** Hoja inferior M3 con asa: arrastrarla hacia abajo la cierra (o vuelve con
 * el muelle si no se bajó bastante). Desde `md` es un panel lateral fijo. */
export function Sheet({
  onClose,
  label,
  className,
  modal = true,
  children,
}: {
  onClose: () => void;
  label: string;
  className?: string;
  /** Con velo (móvil); sin él, convive con la página. */
  modal?: boolean;
  children: ReactNode;
}) {
  useEscape(onClose);
  const drag = useSheetDrag(onClose);
  const sheet = (
    <section
      ref={drag.ref}
      aria-label={label}
      style={drag.style}
      className={cx(
        "sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:left-auto md:max-h-none md:w-96 md:rounded-l-xl md:rounded-r-none",
        className,
      )}
    >
      {drag.handle}
      {children}
    </section>
  );
  if (!modal) return sheet;
  return (
    <>
      <div
        className="scrim fixed inset-0 z-40 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      {sheet}
    </>
  );
}

/** Cabecera estándar de hoja/diálogo: título y botón de cerrar. */
export function OverlayHeader({
  title,
  id,
  onClose,
  closeLabel = "Cerrar",
}: {
  title: ReactNode;
  id?: string;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-6 pt-2 pb-2 md:pt-5">
      <h2 id={id} className="text-headline-s">
        {title}
      </h2>
      <Button
        variant="text"
        size="icon"
        aria-label={closeLabel}
        onClick={onClose}
        className="text-on-surface-variant"
      >
        <CloseIcon />
      </Button>
    </div>
  );
}

// --- Snackbar -------------------------------------------------------------------

const SnackbarContext = createContext<SnackbarStore | null>(null);

/** Proveedor del snackbar único de la app y su pintado. */
export function SnackbarHost({ children }: { children: ReactNode }) {
  const store = useMemo(() => createSnackbarStore(), []);
  const view = useSyncExternalStore(store.subscribe, store.get, store.get);
  return (
    <SnackbarContext.Provider value={store}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-6"
      >
        {view ? (
          <div
            key={view.id}
            className="snackbar pointer-events-auto flex min-h-12 w-full max-w-md items-center gap-2 py-1 pl-4 pr-2"
          >
            <span className="flex-1 py-2 text-body-m">{view.message}</span>
            {view.canUndo ? (
              <button
                type="button"
                onClick={store.undo}
                className="snackbar-action state h-10 rounded-full px-3 text-label-l"
              >
                Deshacer
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={store.dismiss}
              className="state grid size-10 place-items-center rounded-full"
            >
              <CloseIcon width={20} height={20} />
            </button>
          </div>
        ) : null}
      </div>
    </SnackbarContext.Provider>
  );
}

/** Muestra un snackbar. Fuera del proveedor (tests de una pantalla sola) no
 * hace nada visible: la acción ya se aplicó igual. */
export function useSnackbar(): (input: SnackbarInput) => void {
  const store = useContext(SnackbarContext);
  return (input) => store?.show(input);
}
