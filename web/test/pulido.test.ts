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
  it("queda como aviso (no solo como nota) y en Mascota", async () => {
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
    expect(r.guardado?.[0]).toMatchObject({ id: "mascota", area: "Mascota", seccion: { nombre: "Recordatorios" } });
    expect(parseVida("tengo que estudiar mas", "2026-11-23", {})).toBeNull();
  });
});

describe("JARVIS calcula la hora: ahora, en 10 minutos, hace 5 minutos", () => {
  const p = (s: string, ctx = {}) => parseVida(normalizarChileno(s), "2026-11-23", { minutos: 14 * 60, ...ctx });
  it("hacia adelante", () => {
    expect(p("recuérdame sacar al perro dentro de 10 minutos")).toMatchObject({ tool: "crear_recordatorio", args: { texto: "sacar al perro", cuando: "sacar al perro en 10 minutos" } });
    expect(p("recuérdame tomar agua en media hora")).toMatchObject({ tool: "crear_recordatorio", args: { texto: "tomar agua" } });
    expect(p("en 20 minutos tengo clase de ingles")).toMatchObject({ tool: "crear_recordatorio", args: { texto: "clase de inglés", cuando: "en 20 minutos" } });
    expect(p("dentro de una hora tengo dentista")).toMatchObject({ tool: "crear_recordatorio", args: { texto: "dentista", cuando: "en una hora" } });
  });
  it("hacia atrás", () => {
    expect(p("hace 20 minutos empecé a estudiar")).toEqual({ tool: "iniciar_actividad", args: { texto: "estudiar", inicio: "13:40" } });
    expect(p("llegué al gym hace media hora")).toEqual({ tool: "iniciar_actividad", args: { texto: "gym", inicio: "13:30" } });
    expect(p("terminé hace 10 minutos", { corriendo: "estudio" })).toEqual({ tool: "terminar_actividad", args: { fin: "13:50" } });
    expect(p("estuve 2 horas en el celular, terminé hace 1 hora")?.tool).toBeDefined();
    expect(p("hace 1 hora estuve 30 minutos en el celular")).toEqual({ tool: "registrar_bloque", args: { texto: "en el celular", inicio: "12:30", fin: "13:00" } });
  });
  it("el cronómetro parte a la hora calculada", async () => {
    resetDB();
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("vida"); r.onsuccess = r.onerror = () => res(); });
    const { kv, routine, store, reloj, reg } = registro();
    await store.load();
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, reloj, { stream: vi.fn(), ask: vi.fn() } as any, {
      parse: (t, n) => parseVida(t, n.date, { minutos: n.minutes, corriendo: store.data.actividades.find((x) => !x.fin)?.cat ?? null }),
      notar: crearNotar(store, reloj),
      esPregunta,
    });
    expect((await a.handle("hace 20 minutos empecé a estudiar")).text).toMatch(/desde las 11:40/);
    expect((await a.handle("terminé hace 5 minutos")).text).toMatch(/15 min/);
    // Algo que cuentas con "hace": la nota queda a esa hora.
    await a.handle("hace 10 minutos saqué la caca del perro");
    expect(store.data.notas.find((n) => /perro/.test(n.texto))?.fecha.slice(11)).toBe("11:50");
  });
});

describe("Siri: el tiempo cuenta desde que lo dijiste", () => {
  it("ajusta 'hace' y 'en' con lo que demoraste en abrir la app", async () => {
    const { ajustarRelativo } = await import("../src/jarvis/buzon");
    expect(ajustarRelativo("hace 10 minutos empecé a estudiar", 30)).toBe("hace 40 minutos empecé a estudiar");
    expect(ajustarRelativo("recuérdame sacar al perro dentro de media hora", 20)).toBe("recuérdame sacar al perro en 10 minutos");
    expect(ajustarRelativo("me duele la rodilla", 30)).toBe("me duele la rodilla");
    expect(ajustarRelativo("hace 10 minutos comí", 0)).toBe("hace 10 minutos comí");
  });
});

describe("recordatorio sin hora: JARVIS pregunta", () => {
  it("pregunta cuándo y a qué hora, y con la respuesta lo agenda", async () => {
    resetDB();
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("vida"); r.onsuccess = r.onerror = () => res(); });
    const { kv, routine, store, reloj, reg } = registro();
    await store.load();
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, reloj, { stream: vi.fn(), ask: vi.fn() } as any, {
      parse: (t, n) => parseVida(t, n.date, { minutos: n.minutes }),
      notar: crearNotar(store, reloj),
      esPregunta,
    });
    expect((await a.handle("recuérdame sacar a la Polo a trotar")).text).toBe("¿Cuándo te recuerdo sacar a la Polo a trotar? Dime por ejemplo: hoy a las 6, mañana a las 8 o en 2 horas.");
    expect((await a.handle("mañana")).text).toBe("¿A qué hora mañana te recuerdo sacar a la Polo a trotar?");
    expect((await a.handle("a las 7")).text).toBe("Listo, te recuerdo sacar a la Polo a trotar mañana a las 07:00.");
    expect(store.data.recordatorios).toHaveLength(1);
    // Con todo de una vez, no pregunta.
    expect((await a.handle("recuérdame llamar a la abuela hoy a las 6")).text).toMatch(/^Listo, te recuerdo llamar a la abuela hoy a las 18:00\./);
    // Si respondes otra cosa, no se queda pegado.
    await a.handle("recuérdame pagar la luz");
    expect((await a.handle("gasté 5 lukas en completos")).text).toMatch(/\$5\.000/);
    // "no" cancela.
    await a.handle("recuérdame comprar pan");
    expect((await a.handle("no")).text).toBe("Ya, no lo agendo.");
  });
});

describe("dictado", () => {
  it("'a las 15 16' es 15:16", () => {
    expect(normalizarChileno("recuérdame sacar al perro hoy a las 15 16")).toBe("recuérdame sacar al perro hoy a las 15:16");
    expect(normalizarChileno("en 15 minutos")).toBe("en 15 minutos");
  });
});

describe("más formas de pedir un aviso", () => {
  const p = (s: string) => parseVida(normalizarChileno(s), "2026-11-23", { minutos: 926 });
  it("entiende 'a las cuatro', 'quiero que me envíes un recordatorio', 'ponme una alarma' y 'agenda'", () => {
    expect(p("Quiero que me envíes un recordatorio a las cuatro para ver el seminario Fénix")).toMatchObject({ tool: "crear_recordatorio", args: { texto: "ver el seminario Fénix" } });
    expect(p("ponme una alarma a las 7 para el gym")?.tool).toBe("crear_recordatorio");
    expect(p("recuérdame a las 5 llamar a mi mamá")).toMatchObject({ args: { texto: "llamar a mi mamá" } });
    expect(p("Agenda ver el seminario Phoenix a las cuatro")).toMatchObject({ args: { texto: "ver el seminario Phoenix" } });
  });
  it("'saqué al perro a las 11:24' (ya pasó) queda como nota a esa hora, no como aviso", async () => {
    resetDB();
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("vida"); r.onsuccess = r.onerror = () => res(); });
    const { kv, routine, store, reloj, reg } = registro();
    await store.load();
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, reloj, { stream: vi.fn(), ask: vi.fn() } as any, { parse: (t, n) => parseVida(t, n.date, { minutos: n.minutes }), notar: crearNotar(store, reloj), esPregunta });
    await a.handle("saqué al perro ahora a las 11:24");
    expect(store.data.recordatorios).toHaveLength(0);
    expect(store.data.notas[0].fecha.slice(11)).toBe("11:24");
  });
});

describe("Apolo y el trote", () => {
  it("la mascota tiene su área con su nombre, y lo de antes que quedó en Otros se ve ahí", async () => {
    const { setNombreMascota, clasificarArea, areaEfectiva, area } = await import("../src/areas/calc");
    setNombreMascota("Apolo");
    expect(area("mascota").nombre).toBe("Apolo");
    expect(clasificarArea("saqué al Apolo")).toBe("mascota");
    expect(clasificarArea("le di comida al apolo")).toBe("mascota");
    expect(areaEfectiva({ id: "x", fecha: "2026-11-23T10:00", area: "otro", texto: "tengo que sacar la caca del Apolo", origen: "siri" } as any)).toBe("mascota");
    setNombreMascota("");
    expect(parseVida("mi perro se llama apolo", "2026-11-23", {})).toEqual({ tool: "nombre_mascota", args: { nombre: "apolo" } });
  });
  it("el trote queda como entreno con km, tiempo, ritmo y calorías", async () => {
    resetDB();
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("vida"); r.onsuccess = r.onerror = () => res(); });
    const { kv, routine, store, reloj, reg } = registro();
    await store.load();
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, reloj, { stream: vi.fn(), ask: vi.fn() } as any, { parse: (t, n) => parseVida(t, n.date, { minutos: n.minutes }), notar: crearNotar(store, reloj), esPregunta });
    const r = await a.handle("Troté 2 kilómetros, 89 y tardé 19 minutos 35 segundos y quemé 234 calorías");
    expect(r.text).toMatch(/^Anotado: trote hoy \(2,89 km · 19:35 · ritmo 6:47 \/km · 234 kcal\)\./);
    expect(store.data.entrenos[0]).toMatchObject({ nombre: "Trote", km: 2.89, seg: 1175, kcal: 234 });
    expect(r.guardado?.[0]).toMatchObject({ id: "entreno" });
  });
});

describe("cardio, mascota, aviso semanal y respaldo cifrado", () => {
  it("cardio: km por semana, récords y tendencia", async () => {
    const { salidas, records, kmPorSemana, tendenciaRitmo } = await import("../src/cardio/calc");
    const E = (fecha: string, km: number, seg: number) => ({ id: fecha + km, fecha, nombre: "Trote", items: [], km, seg });
    const ss = salidas([E("2026-11-23", 2.89, 1175), E("2026-11-20", 5, 1800), E("2026-11-18", 3, 1200), E("2026-11-10", 4, 1800), { id: "g", fecha: "2026-11-22", nombre: "Gimnasio", items: [] }] as any);
    expect(ss).toHaveLength(4);
    const r = records(ss, "2026-11-23");
    expect(r.masLarga?.km).toBe(5);
    expect(r.mejorRitmo?.ritmo).toBe(360);
    expect(r.kmMes).toBe(14.9);
    expect(kmPorSemana(ss, "2026-11-23", 3).map((x) => x.valor)).toEqual([4, 8, 2.9]);
    expect(tendenciaRitmo(ss)).toBeLessThan(0);
  });
  it("mascota: paseos, pendientes y horas sin salir", async () => {
    const { eventosMascota, minutosSinSalir, porDia } = await import("../src/mascota/calc");
    const n = (fecha: string, texto: string) => ({ id: fecha, fecha, area: "mascota", texto, origen: "app" }) as any;
    const ev = eventosMascota([n("2026-11-23T08:00", "saqué al Apolo"), n("2026-11-23T09:00", "tengo que sacar al Apolo"), n("2026-11-23T10:00", "Apolo comió")]);
    expect(ev.map((e) => [e.tipo, e.pendiente])).toEqual([["comida", false], ["paseo", true], ["paseo", false]]);
    expect(minutosSinSalir(ev, "2026-11-23T12:00")).toBe(240);
    expect(porDia(ev, "paseo", "2026-11-23", 2).map((x) => x.valor)).toEqual([0, 1]);
  });
  it("el domingo llega el resumen de la semana, sin plata", async () => {
    const { planAvisos } = await import("../src/jarvis/avisos");
    const { emptyDatos } = await import("../src/data/types");
    const d = { ...emptyDatos(), entrenos: [{ id: "a", fecha: "2026-11-23", nombre: "Trote", items: [], km: 3 }] } as any;
    const av = planAvisos(d, [], { manana: "08:00", noche: "21:30", agua: false, rutina: false } as any, "2026-11-23T10:00");
    const s = av.find((a) => a.id.startsWith("s:"));
    expect(s?.cuando).toBe("2026-11-29T20:00");
    expect(s?.cuerpo).toMatch(/^Esta semana: 1 entreno \(3 km\)/);
    expect(s?.cuerpo).not.toMatch(/\$/);
  });
  it("respaldo: cifrado y descifrado con la contraseña; con otra falla", async () => {
    const { cifrar, descifrar } = await import("../src/data/nube");
    const p = await cifrar('{"hola":"Apolo"}', "contraseña larga");
    expect(p).not.toContain("Apolo");
    expect(await descifrar(p, "contraseña larga")).toBe('{"hola":"Apolo"}');
    await expect(descifrar(p, "otra")).rejects.toThrow(/no es correcta/);
  });
});

describe("entreno de fuerza: JARVIS pregunta ejercicios, series, repeticiones y peso", () => {
  it("pregunta, anota cada respuesta, pregunta si hay algo más y termina con 'listo'", async () => {
    resetDB();
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("vida"); r.onsuccess = r.onerror = () => res(); });
    const { kv, routine, store, reloj, reg } = registro();
    await store.load();
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, reloj, { stream: vi.fn(), ask: vi.fn() } as any, { parse: (t, n) => parseVida(t, n.date, { minutos: n.minutes }), notar: crearNotar(store, reloj), esPregunta });
    expect((await a.handle("hice gym")).text).toMatch(/¿Qué ejercicios hiciste\? Dime ejercicio, series, repeticiones y peso/);
    expect((await a.handle("press banca 4 de 8 con 50 kilos y sentadilla 3 series de 10 con 60")).text).toBe("Anoté en tu entreno: press de banca 4×8 con 50 kg, sentadilla con barra 3×10 con 60 kg. Llevas 7 series hoy. ¡Récord! Press de banca: 50 kg, Sentadilla con barra: 60 kg. ¿Algo más?");
    expect((await a.handle("jalón al pecho 3 por 12 con 45 kg")).text).toMatch(/^Anoté en tu entreno: jalón al pecho 3×12 con 45 kg\. Llevas 10 series hoy\./);
    expect((await a.handle("listo")).text).toBe("Listo, quedó guardado tu entreno. Bien ahí.");
    const en = store.data.entrenos[0];
    expect(en.items.map((i) => [i.ejId, i.series.length, i.series[0]])).toEqual([["press-banca", 4, { reps: 8, kg: 50 }], ["sentadilla-barra", 3, { reps: 10, kg: 60 }], ["libre:Jalón al pecho", 3, { reps: 12, kg: 45 }]]);
    // El trote no pregunta ejercicios; y se puede decir todo de una.
    expect((await a.handle("troté 3 km en 20 minutos")).text).not.toMatch(/¿Qué ejercicios/);
    expect((await a.handle("hice pierna: sentadilla 4x10 con 70 kilos")).text).toMatch(/^Anotado: pierna hoy: sentadilla con barra 4×10 con 70 kg\./);
  });
});
