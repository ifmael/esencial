// Sustituye la View Transitions API en jsdom y guarda, por transición, qué
// elementos llevaban el nombre de crear en la foto «antes». Dos elementos con
// el mismo nombre en una foto anulan la transición: los tests lo comprueban.
import { vi } from "vitest";
import { CREATE_MORPH, resetMorph } from "../src/lib/view-transition";

type Doc = { startViewTransition?: unknown };

/** Elementos que llevan ahora el nombre de crear. */
export const morphing = () =>
  [...document.querySelectorAll<HTMLElement>("*")].filter(
    (el) => el.style.viewTransitionName === CREATE_MORPH,
  );

export function stubViewTransitions() {
  const before: HTMLElement[][] = [];
  (document as unknown as Doc).startViewTransition = vi.fn(
    (cb: () => void | Promise<void>) => {
      before.push(morphing());
      const done = Promise.resolve().then(cb);
      return { updateCallbackDone: done, finished: done, ready: done };
    },
  );
  return before;
}

export function unstubViewTransitions() {
  delete (document as unknown as Doc).startViewTransition;
  resetMorph();
}
