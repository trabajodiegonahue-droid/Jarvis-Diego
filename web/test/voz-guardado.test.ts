import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listenOnce } from "../src/voice/speech";

// Un reconocimiento de voz falso, como el de Safari.
class FakeSR {
  static ultimo: FakeSR;
  static creados = 0;
  onresult: any; onerror: any; onend: any;
  lang = ""; interimResults = false; continuous = false; maxAlternatives = 1;
  parados = 0;
  constructor() { FakeSR.ultimo = this; FakeSR.creados++; }
  start() {}
  stop() { this.parados++; }
  di(...frases: [string, boolean][]) {
    const results = frases.map(([t, fin]) => Object.assign([{ transcript: t }], { isFinal: fin }));
    this.onresult({ resultIndex: 0, results });
  }
}

describe("escuchar sin cortarse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSR.creados = 0;
    (globalThis as any).window = globalThis;
    (globalThis as any).webkitSpeechRecognition = FakeSR;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).webkitSpeechRecognition;
  });

  it("una pausa corta no envía; 3 segundos de silencio sí", async () => {
    const parciales: string[] = [];
    const l = listenOnce((p) => parciales.push(p));
    let listo: string | null = null;
    l.promise.then((t) => (listo = t));
    expect(FakeSR.ultimo.continuous).toBe(true);
    FakeSR.ultimo.di(["tengo entrenamiento", true]);
    await vi.advanceTimersByTimeAsync(2000); // pausa para pensar
    expect(listo).toBeNull();
    FakeSR.ultimo.di(["tengo entrenamiento", true], [" a las 3", false]);
    await vi.advanceTimersByTimeAsync(2999);
    expect(listo).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(listo).toBe("tengo entrenamiento a las 3");
  });

  it("si Safari corta solo, vuelve a escuchar y junta todo", async () => {
    const l = listenOnce(() => {});
    let listo: string | null = null;
    l.promise.then((t) => (listo = t));
    FakeSR.ultimo.di(["me duele", false]);
    FakeSR.ultimo.onend();
    expect(FakeSR.creados).toBe(2);
    FakeSR.ultimo.di(["la rodilla", true]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(listo).toBe("me duele la rodilla");
  });

  it("tocar el micrófono envía al tiro", async () => {
    const l = listenOnce(() => {});
    FakeSR.ultimo.di(["hola", false]);
    l.stop();
    await expect(l.promise).resolves.toBe("hola");
  });

  it("si no dices nada, se rinde", async () => {
    const l = listenOnce(() => {});
    const p = expect(l.promise).rejects.toBe("no-speech");
    await vi.advanceTimersByTimeAsync(8000);
    await p;
  });

  it("sin permiso de micrófono avisa", async () => {
    const l = listenOnce(() => {});
    FakeSR.ultimo.onerror({ error: "not-allowed" });
    await expect(l.promise).rejects.toBe("denied");
  });
});
