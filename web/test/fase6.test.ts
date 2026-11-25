import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Assistant } from "../src/brain/assistant";
import { normalizarChileno } from "../src/brain/chileno";
import { isNo, isYes } from "../src/brain/commands";
import { memoryKV } from "../src/core/storage";
import { resetDB } from "../src/data/db";
import { datosEjemplo } from "../src/data/demo";
import { AppStore } from "../src/data/store";
import { diaTools } from "../src/jarvis/diaTools";
import { GUIA } from "../src/jarvis/guia";
import { montoEn, parseVida } from "../src/jarvis/vidaParser";
import { vidaTools } from "../src/jarvis/vidaTools";
import { extrasTools } from "../src/jarvis/extrasTools";
import { crearNotar } from "../src/jarvis/notas";
import { planTools } from "../src/jarvis/planTools";
import { esPregunta } from "../src/areas/calc";
import { Routine } from "../src/routine/routine";
import { ToolRegistry } from "../src/tools/registry";
import { routineTools } from "../src/tools/routineTools";
import { at } from "./helpers";

const HOY = "2026-11-17";

describe("cómo escribe Diego", () => {
  it("traduce abreviaciones y saca muletillas", () => {
    expect(normalizarChileno("toy en el gym nms")).toBe("estoy en el gym");
    expect(normalizarChileno("q tengo mñn po")).toBe("que tengo mañana");
    expect(normalizarChileno("oe wn gaste 5 lukas x un completo, cachai")).toBe("oye gaste 5 lucas por un completo");
    expect(normalizarChileno("ando cansao")).toBe("ando cansado");
    expect(normalizarChileno("hice d too mns el ingles jajaja")).toBe("hice de too menos el ingles");
    expect(normalizarChileno("anota eso no más.")).toBe("anota eso.");
    expect(normalizarChileno("¿q hago dsp?")).toBe("¿que hago después?");
    expect(normalizarChileno("estuve 1 hr en el celu")).toBe("estuve 1 hora en el celular");
  });
  it("sí y no a la chilena", () => {
    for (const s of ["sí", "sipo", "ya", "dale", "de una", "obvio", "ok", "anótalo"]) expect(isYes(normalizarChileno(s)), s).toBe(true);
    for (const s of ["no", "nop", "nica", "mejor no", "déjalo"]) expect(isNo(normalizarChileno(s)), s).toBe(true);
  });
  it("monedas chilenas", () => {
    expect(montoEn("una gamba")?.valor).toBe(100);
    expect(montoEn("3 gambas")?.valor).toBe(300);
    expect(montoEn("una quina")?.valor).toBe(500);
  });
  it("frases sueltas", () => {
    const p = (s: string, ctx = {}) => parseVida(normalizarChileno(s), HOY, ctx);
    expect(p("ya po anota q dormi 7 hrs")).toEqual({ tool: "registrar_dia", args: { sueno: 7 } });
    expect(p("me siento como el pico")).toEqual({ tool: "registrar_dia", args: { animo: 1 } });
    expect(p("toy reventao")).toEqual({ tool: "registrar_dia", args: { energia: 1 } });
    expect(p("me desperte")).toEqual({ tool: "__acoste", args: {} });
    expect(p("me desperte", { corriendo: "sueno" })).toEqual({ tool: "terminar_actividad", args: {} });
    expect(p("hola jarvis")).toEqual({ tool: "__saludo", args: {} });
    expect(p("q puedo decirte")).toEqual({ tool: "__ayuda", args: {} });
    expect(p("jugue 85 y me pongo un 7")?.args).toEqual({ minutos: 85, calificacion: 7 });
    expect(p("ya hice el gym y el ingles", { habitos: ["Inglés 20 minutos"], rutina: [] })).toEqual({
      tool: "__varios",
      args: { cmds: [{ tool: "registrar_entreno", args: { tipo: "gym" } }, { tool: "marcar_habito", args: { nombre: "Inglés 20 minutos" } }] },
    });
  });
});

describe("JARVIS con los datos de ejemplo (modo práctica)", () => {
  beforeEach(async () => {
    resetDB();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase("vida");
      r.onsuccess = r.onerror = () => res();
    });
  });
  async function setup(hora = "15:00") {
    const kv = memoryKV();
    const routine = new Routine(kv);
    routine.add("Gimnasio", "08:00");
    const store = new AppStore();
    await store.load();
    for (const [k, v] of Object.entries(datosEjemplo(HOY))) await store.put(k as any, ...(v as any[]));
    let clock = at(hora);
    const reloj = () => clock();
    const reg = new ToolRegistry();
    let dif: any[] = [];
    reg.register(...routineTools(routine, reloj), ...vidaTools({ store, routine, clock: reloj }), ...diaTools({ store, routine, clock: reloj }), ...extrasTools({ store, routine, clock: reloj, dificil: { get: () => dif, set: (p) => (dif = p) } }), ...planTools({ store, routine, clock: reloj, prefs: () => ({ partidoPorSemana: {}, fechaPrueba: "", comida: { medida: 24, meta: 110, almuerzo: 25, once: 20, colacion: 8 } }) }));
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, reloj, { stream: vi.fn(), ask: vi.fn() } as any, {
      parse: (t, n) => parseVida(t, n.date, { habitos: store.data.habitos.map((h) => h.nombre), rutina: routine.tasks.map((x) => x.title), corriendo: store.data.actividades.find((x) => !x.fin)?.cat ?? null, compras: store.data.compras.filter((c) => !c.hecho).map((c) => c.texto), dificil: dif.length > 0, minutos: n.minutes }),
      notar: crearNotar(store, reloj),
      esPregunta,
    });
    return { a, store, setHora: (h: string) => (clock = at(h)) };
  }

  it("todas las frases de la guía se entienden sin Gemini", async () => {
    const { a } = await setup();
    for (const [, frases] of GUIA)
      for (const f of frases) {
        const r = await a.handle(f);
        expect(r.text, f).not.toMatch(/no la cacho|no me quedó clara|No entendí/i);
        expect(r.source, f).toBe("local");
        if (a.waiting) await a.handle("sí");
      }
  });
  it("lo que anotas practicando se borra con los ejemplos", async () => {
    const { a, store } = await setup();
    await a.handle("gaste 5 lukas en completos nms");
    await a.handle("toy en el gym");
    expect(store.data.movimientos.find((m) => m.nota === "Completos")?.demo).toBe(true);
    await store.removeDemo();
    expect(store.data.movimientos).toEqual([]);
    expect(store.data.actividades).toEqual([]);
  });
  it("me desperté: pregunta la hora y entiende que 'las 12' es medianoche", async () => {
    const { a, store } = await setup("07:30");
    expect((await a.handle("me desperte")).text).toMatch(/¿A qué hora te acostaste\?/);
    expect((await a.handle("como a las 12")).text).toBe("Anotado: dormir de 00:00 a 07:30, 7 h 30 min. Son 7,5 horas de sueño.");
    expect(store.data.dias.find((x) => x.id === HOY)?.sueno).toBe(7.5);
  });
  it("el cronómetro del gym deja el entreno anotado; si lo paras al tiro, se anula", async () => {
    const { a, store, setHora } = await setup("18:00");
    const antes = store.data.entrenos.length;
    await a.handle("toy en el gym");
    expect((await a.handle("terminé")).text).toMatch(/anulé entreno/);
    await a.handle("toy en el gym");
    setHora("19:10");
    expect((await a.handle("listo")).text).toMatch(/^Listo: entreno, 1 h 10 min\. Lo dejé en tus entrenos de la semana\./);
    expect(store.data.entrenos.length).toBe(antes + 1);
  });
  it("aporte sin decir a qué meta: si hay una sola de plata, va ahí", async () => {
    const { a } = await setup();
    await a.handle("agrega una meta de ahorrar 200 lukas para marzo");
    expect((await a.handle("aporté 20 lukas a la meta")).text).toBe('Sumé $20.000 a "Ahorrar $200.000". Llevas $20.000 de $200.000 (10%).');
  });
});

describe("JARVIS avisa qué guardó y dónde", () => {
  beforeEach(async () => {
    resetDB();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase("vida");
      r.onsuccess = r.onerror = () => res();
    });
  });
  it("un gasto queda en Mi vida › Dinero y en la pestaña Dinero; algo contado, en su área", async () => {
    const kv = memoryKV();
    const routine = new Routine(kv);
    const store = new AppStore();
    await store.load();
    const reloj = at("15:00");
    const reg = new ToolRegistry();
    reg.register(...routineTools(routine, reloj), ...vidaTools({ store, routine, clock: reloj }));
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, reloj, { stream: vi.fn(), ask: vi.fn() } as any, {
      parse: (t, n) => parseVida(t, n.date, {}),
      notar: crearNotar(store, reloj),
      esPregunta,
    });
    const r = await a.handle("gaste 5 lukas en completos");
    expect(r.guardado).toEqual([{ area: "Dinero", id: "dinero", texto: "gaste 5 lukas en completos", seccion: { nombre: "Dinero", ruta: "/dinero" } }]);
    const r2 = await a.handle("me duele la rodilla");
    expect(r2.guardado?.[0]).toMatchObject({ id: "salud", texto: "me duele la rodilla" });
    expect(r2.text).toMatch(/Anotado en Salud/);
    const r3 = await a.handle("¿que tengo mañana?");
    expect(r3.guardado).toBeUndefined();
  });
});
