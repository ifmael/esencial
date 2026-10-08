// Doble de Web Audio para los tests: registra los osciladores del modo sesión
// (el keep-alive casi inaudible de la pausa y los tonos del pitido) sin sonar
// ni depender del navegador. El contexto real no existe en jsdom.

export type FakeOscillator = {
  frequency: { value: number };
  started: boolean;
  stopped: boolean;
  /** Cuándo se programa el final (`stop(when)`): mide la duración del tono. */
  stopAt: number | null;
};

export type FakeAudio = {
  oscillators: FakeOscillator[];
  reset: () => void;
  /** La clase que se instala como `AudioContext` global del test. */
  Ctor: typeof AudioContext;
};

export function createFakeAudio(): FakeAudio {
  const oscillators: FakeOscillator[] = [];

  class FakeParam {
    value = 0;
    setValueAtTime() {}
    linearRampToValueAtTime() {}
  }

  class FakeGain {
    gain = new FakeParam();
    connect(node: unknown) {
      return node;
    }
    disconnect() {}
  }

  class FakeOscillatorNode implements FakeOscillator {
    type = "sine";
    frequency = new FakeParam();
    started = false;
    stopped = false;
    stopAt: number | null = null;
    constructor() {
      oscillators.push(this);
    }
    connect(node: unknown) {
      return node;
    }
    disconnect() {}
    start() {
      this.started = true;
    }
    stop(when?: number) {
      this.stopped = true;
      this.stopAt = when ?? 0;
    }
  }

  /** Cada llamada crea un ejemplar: el módulo cachea el primero y lo reutiliza. */
  class FakeContext {
    currentTime = 0;
    state = "running";
    destination = {};
    resume() {
      return Promise.resolve();
    }
    createOscillator() {
      return new FakeOscillatorNode();
    }
    createGain() {
      return new FakeGain();
    }
  }

  // Solo se usan los miembros de arriba; el resto de la interfaz DOM no hace
  // falta en un doble (motivo del cast, asignado a un const con nombre).
  const Ctor = FakeContext as unknown as typeof AudioContext;

  return {
    oscillators,
    reset: () => {
      oscillators.length = 0;
    },
    Ctor,
  };
}
