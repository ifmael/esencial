// Screen Wake Lock del modo sesión (best effort): la pantalla no se apaga
// mientras el modo está visible. El navegador suelta la lock al ocultar la
// pestaña, así que al volver (visibilitychange) se pide otra vez. Sin la API
// —o si falla— no pasa nada: el modo funciona igual.
import { useEffect } from "react";

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      if (!navigator.wakeLock) return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        sentinel = null;
      }
    };

    void acquire();
    const onVisibility = () => {
      if (!disposed && document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
