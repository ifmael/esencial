// Pitido y keep-alive del modo sesión, sin asset: tonos del propio Web Audio.
// El keep-alive es un tono casi inaudible en bucle mientras corre una pausa:
// mantiene la pestaña «sonando» para que el navegador no la congele en segundo
// plano (best effort — si aun así la suspende o la ralentiza, la
// resincronización por `endsAt` hace sonar el pitido al volver). Sin Web Audio
// no pasa nada: el modo funciona igual, sin sonido.

const KEEP_HZ = 60;
const KEEP_GAIN = 0.0008;
const BEEP_HZ = [880, 1175] as const;

let cached: AudioContext | null = null;

/** El contexto nace con el gesto que abre el modo (política de autoplay) y se
 *  reutiliza; un fallo no se cachea, por si el navegador lo da más tarde. */
function context(): AudioContext | null {
  if (cached) return cached;
  if (typeof AudioContext === "undefined") return null;
  try {
    cached = new AudioContext();
    return cached;
  } catch {
    return null;
  }
}

let keep: OscillatorNode | null = null;

/** Arranca el keep-alive de la pausa (idempotente: corta el anterior). */
export function startPauseAudio(): void {
  stopPauseAudio();
  const ctx = context();
  if (!ctx) return;
  void ctx.resume().catch(() => {});
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = KEEP_HZ;
  gain.gain.value = KEEP_GAIN;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  keep = osc;
}

/** Corta el keep-alive: al acabar la pausa, al saltarla o al salir del modo. */
export function stopPauseAudio(): void {
  if (!keep) return;
  try {
    keep.stop();
  } catch {
    /* ya estaba parado */
  }
  keep.disconnect();
  keep = null;
}

/** El pitido de fin de pausa: dos tonos cortos. */
export function beep(): void {
  const ctx = context();
  if (!ctx) return;
  void ctx.resume().catch(() => {});
  BEEP_HZ.forEach((hz, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = hz;
    osc.connect(gain).connect(ctx.destination);
    const at = ctx.currentTime + i * 0.16;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.25, at + 0.01);
    gain.gain.setValueAtTime(0.25, at + 0.08);
    gain.gain.linearRampToValueAtTime(0, at + 0.1);
    osc.start(at);
    osc.stop(at + 0.12);
  });
}
