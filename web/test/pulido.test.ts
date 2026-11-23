import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { streamGemini } from "../src/brain/gemini";
import { Assistant } from "../src/brain/assistant";
import { normalizarChileno } from "../src/brain/chileno";
import { esPregunta } from "../src/areas/calc";
import { memoryKV } from "../src/core/storage";
import { resetDB } from "../src/data/db";
import { AppStore } from "../src/data/store";
import { extrasTools } from "../src/jarvis/extrasTools";
import { crearNotar } from "../src/jarvis/notas";
import { parseVida } from "../src/jarvis/vidaParser";
import { vidaTools } from "../src/jarvis/vidaTools";
import { diaTools } from "../src/jarvis/diaTools";
import { Routine } from "../src/routine/routine";
import { ToolRegistry } from "../src/tools/registry";
import { routineTools } from "../src/tools/routineTools";
import { calidadVoz, pickVoice } from "../src/voice/speech";
import { at } from "./helpers";

const sse = (chunks: any[]) =>
  new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const ch of chunks) c.enqueue(e.encode(`data: ${JSON.stringify(ch)}\n\n`)); c.close(); } }), { status: 200 });

function registro() {
  const kv = memoryKV();
  const routine = new Routine(kv);
  const store = new AppStore();
  const reloj = at("12:00");
  const reg = new ToolRegistry();
  let dif: any[] = [];
  reg.register(...routineTools(routine, reloj), ...vidaTools({ store, routine, clock: reloj }), ...diaTools({ store, routine, clock: reloj }), ...extrasTools({ store, routine, clock: reloj, dificil: { get: () => dif, set: (p) => (dif = p) } }));
  return { kv, routine, store, reloj, reg };
}

describe("Gemini acepta las herramientas", () => {
  it("ninguna herramienta va con un objeto vacío (Google rechaza todo el pedido con eso)", () => {
    const { reg } = registro();
    for (const f of reg.declarations()[0].functionDeclarations as any[]) {
      if (!f.parameters) continue;
      expect(Object.keys(f.parameters.properties || {}).length, f.name).toBeGreaterThan(0);
      for (const r of f.parameters.required || []) expect(f.parameters.properties, `${f.name}.${r}`).toHaveProperty(r);
    }
  });
});

describe("cliente Gemini más firme", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("si el modelo ya no existe (404), prueba el siguiente", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "models/x is not found" } }), { status: 404 })).mockResolvedValueOnce(sse([{ candidates: [{ content: { parts: [{ text: "ok" }] } }] }]));
    vi.stubGlobal("fetch", f);
    const r = await streamGemini({ mode: "key", apiKey: "K" }, { system: "s", contents: [] }, () => {});
    expect(r.text).toBe("ok");
    expect(f.mock.calls[0][0]).not.toBe(f.mock.calls[1][0]);
  });
  it("si rechaza las herramientas (400), igual conversa sin ellas", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Invalid function declaration" } }), { status: 400 })).mockResolvedValueOnce(sse([{ candidates: [{ content: { parts: [{ text: "hola" }] } }] }]));
    vi.stubGlobal("fetch", f);
    const r = await streamGemini({ mode: "key", apiKey: "K" }, { system: "s", contents: [], tools: [{ functionDeclarations: [] }] }, () => {});
    expect(r.text).toBe("hola");
    expect(JSON.parse(f.mock.calls[1][1].body).tools).toBeUndefined();
  });
});

describe("agenda: 'tengo fútbol a las 3:30 y a las 5 gimnasio'", () => {
  beforeEach(async () => {
    resetDB();
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("vida"); r.onsuccess = r.onerror = () => res(); });
  });
  it("crea un aviso por cada cosa y cada una queda en su área", async () => {
    const { kv, routine, store, reloj, reg } = registro();
    await store.load();
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, reloj, { stream: vi.fn(), ask: vi.fn() } as any, {
      parse: (t, n) => parseVida(t, n.date, {}),
      notar: crearNotar(store, reloj),
      esPregunta,
    });
    const r = await a.handle("tengo entrenamiento a las 3:30 de fútbol y a las 5 tengo de gimnasio");
    expect(r.source).toBe("local");
    expect(r.text).toBe("Agendé entrenamiento de fútbol hoy a las 15:30; te aviso a esa hora. Agendé gimnasio hoy a las 17:00; te aviso a esa hora.");
    expect(store.data.recordatorios.map((x) => [x.texto, x.cuando])).toEqual([["Entrenamiento de fútbol", "2026-11-17T15:30"], ["Gimnasio", "2026-11-17T17:00"]].map(([t, c]) => [t, c.replace("2026-11-17", reloj().date)]));
    expect(r.guardado?.map((g) => [g.id, g.texto])).toEqual([["futbol", "Entrenamiento de fútbol (a las 3:30)"], ["entreno", "Gimnasio (a las 5)"]]);
    expect(store.data.notas.map((n) => n.area).sort()).toEqual(["entreno", "futbol"]);
  });
  it("otras formas de decirlo", () => {
    const p = (s: string) => parseVida(normalizarChileno(s), "2026-11-23", {});
    expect(p("mañana a las 10 tengo prueba de ingles")).toEqual({ tool: "crear_recordatorio", args: { texto: "prueba de inglés", cuando: "manana a las 10", agenda: true } });
    expect(p("me toca turno a las 6 y después a las 9 me junto con la polola")?.args.cmds).toHaveLength(2);
    expect(p("a que hora tengo gym")?.tool).not.toBe("crear_recordatorio");
    expect(p("jugué a las 3")?.tool).not.toBe("crear_recordatorio");
  });
});

describe("voz de JARVIS", () => {
  const v = (name: string, lang: string) => ({ name, lang, voiceURI: name, localService: true, default: false }) as SpeechSynthesisVoice;
  it("prefiere las voces Mejoradas/Premium y evita las de efectos", () => {
    const voces = [v("Francisca", "es-CL"), v("Grandma (Español (México))", "es-MX"), v("Paulina (Mejorada)", "es-MX"), v("Jorge (Premium)", "es-ES")];
    expect(pickVoice(voces)?.name).toBe("Jorge (Premium)");
    expect(calidadVoz(voces[1])).toBeLessThan(calidadVoz(voces[0]));
    expect(pickVoice(voces, "Francisca")?.name).toBe("Francisca");
  });
});

describe("pendientes: 'tengo que sacar la caca del perro ahora'", () => {
  it("queda como aviso (no solo como nota) y en Casa", async () => {
    resetDB();
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("vida"); r.onsuccess = r.onerror = () => res(); });
    const { kv, routine, store, reloj, reg } = registro();
    await store.load();
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, reloj, { stream: vi.fn(), ask: vi.fn() } as any, {
      parse: (t, n) => parseVida(t, n.date, {}),
      notar: crearNotar(store, reloj),
      esPregunta,
    });
    const r = await a.handle("tengo que sacar la caca del perro ahora", () => {}, "siri");
    expect(r.text).toBe("Anotado: sacar la caca del perro. Te lo recuerdo en 10 minutos, por si se te pasa.");
    expect(store.data.recordatorios[0]).toMatchObject({ texto: "Sacar la caca del perro", cuando: `${reloj().date}T12:10` });
    expect(r.guardado?.[0]).toMatchObject({ id: "casa", seccion: { nombre: "Recordatorios" } });
    expect(parseVida("tengo que estudiar mas", "2026-11-23", {})).toBeNull();
  });
});
