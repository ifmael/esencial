// Pitido y keep-alive del modo sesión: sin Web Audio no rompe y, con él, el
// keep-alive corre mientras la pausa está en marcha, el aviso previo es un solo
// tono corto y el pitido de fin arranca sus tres tonos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beep,
  startPauseAudio,
  stopPauseAudio,
  WARN_LEADS_MS,
  warnAhead,
} from "../src/lib/rest-audio";
import { createFakeAudio } from "./audio-fake";

const audio = createFakeAudio();

/** Los tonos que no son el keep-alive (60 Hz). */
const tones = () => audio.oscillators.filter((o) => o.frequency.value !== 60);

beforeEach(() => {
  audio.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rest-audio", () => {
  it("sin Web Audio no rompe ni suena", () => {
    expect(() => {
      startPauseAudio();
      warnAhead();
      beep();
      stopPauseAudio();
    }).not.toThrow();
  });

  it("keep-alive casi inaudible mientras corre la pausa; se corta al pararla", () => {
    vi.stubGlobal("AudioContext", audio.Ctor);
    startPauseAudio();
    const keep = audio.oscillators.find((o) => o.frequency.value === 60);
    expect(keep?.started).toBe(true);
    expect(keep?.stopped).toBe(false);
    stopPauseAudio();
    expect(keep?.stopped).toBe(true);
  });

  it("el pitido de fin arranca sus tres tonos", () => {
    vi.stubGlobal("AudioContext", audio.Ctor);
    beep();
    expect(tones().map((o) => o.frequency.value)).toEqual([880, 1175, 1568]);
  });

  it("las marcas del aviso son los tres últimos segundos de la pausa", () => {
    // Un tono al cruzar cada marca: a los 3 s, a los 2 s y al segundo final.
    expect(WARN_LEADS_MS).toEqual([3000, 2000, 1000]);
  });

  it("el aviso previo es un solo tono, distinto y más corto que los del fin", () => {
    vi.stubGlobal("AudioContext", audio.Ctor);
    warnAhead();
    const [warn] = tones();
    expect(tones()).toHaveLength(1);
    expect(warn.frequency.value).not.toBe(60);

    audio.reset();
    beep();
    const beeps = tones();
    expect(beeps).toHaveLength(3);
    // Distinto de todos los del fin…
    expect(beeps.map((o) => o.frequency.value)).not.toContain(
      warn.frequency.value,
    );
    // …y cada tono del fin dura más que el aviso.
    for (const t of beeps) expect(warn.stopAt).toBeLessThan(t.stopAt ?? 0);
  });
});
