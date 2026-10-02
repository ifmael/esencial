// Pitido y keep-alive del modo sesión: sin Web Audio no rompe y, con él, el
// keep-alive corre mientras la pausa está en marcha y el pitido arranca sus
// dos tonos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beep, startPauseAudio, stopPauseAudio } from "../src/lib/rest-audio";
import { createFakeAudio } from "./audio-fake";

const audio = createFakeAudio();

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

  it("el pitido arranca sus dos tonos", () => {
    vi.stubGlobal("AudioContext", audio.Ctor);
    beep();
    expect(audio.oscillators.map((o) => o.frequency.value)).toEqual([
      880, 1175,
    ]);
  });
});
