// Pitido y keep-alive del modo sesión, sin asset: tonos del propio Web Audio.
// El keep-alive es un tono casi inaudible en bucle mientras corre una pausa:
// mantiene la pestaña «sonando» para que el navegador no la congele en segundo
// plano (best effort — si aun así la suspende o la ralentiza, la
// resincronización por `endsAt` hace sonar el pitido al volver). Sin Web Audio
// no pasa nada: el modo funciona igual, sin sonido.

const KEEP_HZ = 60;
const KEEP_GAIN = 0.0008;
/** Los tonos del pitido de fin, de grave a agudo. */
const BEEP_HZ = [880, 1175, 1568] as const;
/** El aviso previo: un solo tono, más grave que cualquiera del fin. */
const WARN_HZ = 660;
/** Las marcas del aviso (ms que quedan), de mayor a menor: suena un tono al
 *  cruzar cada una. Los tres últimos segundos de la pausa —3 s, 2 s y 1 s—:
 *  el de 1 s no se salta, porque el aviso de fin no debe llegar sin que el
 *  último segundo haya sonado. */
export const WARN_LEADS_MS: readonly number[] = [3000, 2000, 1000];
/** Lo que dura un tono del pitido de fin, y el del aviso previo (más corto). */
const TONE_MS = 120;
const WARN_MS = 100;
/** Ataque y caída de cada tono, y pausa entre los del pitido. */
const FADE = 0.02;
const BEEP_GAP = 0.16;

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

/** Un tono de `ms`, con ataque y caída cortos, programado en `at`. */
function tone(ctx: AudioContext, hz: number, at: number, ms: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = hz;
  osc.connect(gain).connect(ctx.destination);
  const end = at + ms / 1000;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.25, at + FADE);
  gain.gain.setValueAtTime(0.25, end - FADE);
  gain.gain.linearRampToValueAtTime(0, end);
  osc.start(at);
  osc.stop(end);
}

/** El aviso previo al final de la pausa: un solo tono, corto y más grave. */
export function warnAhead(): void {
  const ctx = context();
  if (!ctx) return;
  void ctx.resume().catch(() => {});
  tone(ctx, WARN_HZ, ctx.currentTime, WARN_MS);
}

/** El pitido de fin de pausa: tres tonos cortos. */
export function beep(): void {
  const ctx = context();
  if (!ctx) return;
  void ctx.resume().catch(() => {});
  BEEP_HZ.forEach((hz, i) => {
    tone(ctx, hz, ctx.currentTime + i * BEEP_GAP, TONE_MS);
  });
}
