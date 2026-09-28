// Estado del snackbar M3 con «Deshacer». La acción ya está hecha cuando se
// muestra: `onUndo` la revierte. Uno a la vez (el nuevo sustituye al viejo) y
// cada `onUndo` se ejecuta como mucho una vez. Sin React: el componente se
// suscribe con `useSyncExternalStore` (components/snackbar.tsx).

export type SnackbarInput = { message: string; onUndo?: () => void };
export type SnackbarView = { id: number; message: string; canUndo: boolean };

type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

export type SnackbarStore = {
  get(): SnackbarView | null;
  subscribe(listener: () => void): () => void;
  show(input: SnackbarInput): void;
  /** Revierte la acción (como mucho una vez) y cierra. */
  undo(): void;
  /** Cierra sin revertir. */
  dismiss(): void;
};

export function createSnackbarStore({
  duration = 6000,
  timers = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  },
}: { duration?: number; timers?: Timers } = {}): SnackbarStore {
  let view: SnackbarView | null = null;
  let undo: (() => void) | undefined;
  let timer: unknown = null;
  let seq = 0;
  const listeners = new Set<() => void>();

  const set = (next: SnackbarView | null) => {
    view = next;
    for (const l of listeners) l();
  };
  const close = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
    undo = undefined;
    set(null);
  };

  return {
    get: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    show({ message, onUndo }: SnackbarInput) {
      if (timer !== null) timers.clear(timer);
      undo = onUndo;
      set({ id: ++seq, message, canUndo: Boolean(onUndo) });
      timer = timers.set(close, duration);
    },
    undo() {
      const fn = undo;
      close();
      fn?.();
    },
    dismiss: close,
  };
}
