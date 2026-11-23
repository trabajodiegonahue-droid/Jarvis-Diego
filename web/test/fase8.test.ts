import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { areaDeHerramienta, clasificarArea, esPregunta, estadoArea } from "../src/areas/calc";
import { Assistant } from "../src/brain/assistant";
import { memoryKV } from "../src/core/storage";
import { resetDB } from "../src/data/db";
import { datosEjemplo } from "../src/data/demo";
import { AppStore } from "../src/data/store";
import { categoriasBase, emptyDatos, type Datos } from "../src/data/types";
import { diaTools } from "../src/jarvis/diaTools";
import { extrasTools } from "../src/jarvis/extrasTools";
import { parseExtras } from "../src/jarvis/extrasParser";
import { crearNotar } from "../src/jarvis/notas";
import { parseVida } from "../src/jarvis/vidaParser";
import { vidaTools } from "../src/jarvis/vidaTools";
import { Routine } from "../src/routine/routine";
import { ToolRegistry } from "../src/tools/registry";
import { routineTools } from "../src/tools/routineTools";
import { at } from "./helpers";

const HOY = "2026-11-17";

describe("a qué área va cada cosa", () => {
  it("por las palabras", () => {
    const casos: [string, string][] = [
      ["me duele la rodilla derecha", "salud"],
      ["hoy salí con la polola al cine", "amor"],
      ["peleé con mi papá", "social"],
      ["toy medio estresado con la u", "animo"],
      ["el profe de inglés me felicitó", "estudios"],
      ["mi jefe me cambió el turno", "trabajo"],
      ["tengo que renovar el carnet", "casa"],
      ["quiero ir a Australia el 2027", "metas"],
      ["vi una película buenísima", "ocio"],
      ["debo 20 lucas", "dinero"],
      ["tengo examen de matemáticas", "estudios"], // "examen" no es "ex" (amor)
      ["algo cualquiera", "otro"],
    ];
    for (const [t, a] of casos) expect(clasificarArea(t), t).toBe(a);
  });
  it("lo que anota cada herramienta", () => {
    expect(areaDeHerramienta("registrar_gasto", {}, "")).toBe("dinero");
    expect(areaDeHerramienta("registrar_dia", { animo: 2 }, "")).toBe("animo");
    expect(areaDeHerramienta("registrar_dia", { sueno: 7 }, "")).toBe("salud");
    expect(areaDeHerramienta("recordar", {}, "acuérdate que me lesioné el tobillo")).toBe("salud");
  });
  it("pregunta o cuenta", () => {
    expect(esPregunta("¿qué es el VO2 máx?")).toBe(true);
    expect(esPregunta("dime un buen ejercicio para aductores")).toBe(true);
    expect(esPregunta("me duele la rodilla")).toBe(false);
  });
  it("cada bloque se actualiza con los datos de la app", () => {
    const d = { ...emptyDatos(), categorias: categoriasBase(), ...datosEjemplo(HOY) } as Datos;
    expect(estadoArea("dinero", d, HOY).dato).toMatch(/^balance del mes [+-]\$/);
    expect(estadoArea("salud", d, HOY).dato).toMatch(/h de sueño promedio/);
    expect(estadoArea("amor", d, HOY).notas[0].texto).toMatch(/polola/);
    expect(estadoArea("casa", d, HOY).dato).toBe("3 cosas en la lista de compras");
  });
  it("consultas por voz", () => {
    expect(parseExtras("qué he contado de salud")).toEqual({ tool: "ver_area", args: { area: "salud" } });
    expect(parseExtras("cómo voy en el amor")).toEqual({ tool: "ver_area", args: { area: "amor" } });
    expect(parseExtras("cómo voy con mis metas")).toBeNull(); // eso lo responde consultar_metas
    expect(parseExtras("anota en salud: me tomé la presión, 12/8")).toEqual({ tool: "anotar_en_area", args: { area: "salud", texto: "me tomé la presión, 12/8" } });
  });
});

describe("JARVIS guarda todo por áreas", () => {
  beforeEach(async () => {
    resetDB();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase("vida");
      r.onsuccess = r.onerror = () => res();
    });
  });
  async function setup() {
    const kv = memoryKV();
    const routine = new Routine(kv);
    const store = new AppStore();
    await store.load();
    const clock = at("15:00");
    const reg = new ToolRegistry();
    reg.register(...routineTools(routine, clock), ...vidaTools({ store, routine, clock }), ...diaTools({ store, routine, clock }), ...extrasTools({ store, routine, clock }));
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, clock, { stream: vi.fn(), ask: vi.fn() } as any, { parse: (t, n) => parseVida(t, n.date), notar: crearNotar(store, clock), esPregunta });
    return { a, store };
  }
  it("lo que cuentas queda en su área, y se puede deshacer", async () => {
    const { a, store } = await setup();
    expect((await a.handle("me duele la rodilla derecha")).text).toBe("Anotado en Salud: me duele la rodilla derecha.");
    expect(store.data.notas).toMatchObject([{ area: "salud", texto: "me duele la rodilla derecha", origen: "jarvis" }]);
    await a.handle("deshaz eso");
    expect(store.data.notas).toEqual([]);
  });
  it("lo que JARVIS anota también queda en su área (una sola vez), y deshacer borra las dos cosas", async () => {
    const { a, store } = await setup();
    await a.handle("gasté 5 lukas en completos");
    expect(store.data.notas).toMatchObject([{ area: "dinero", texto: "gasté 5 lukas en completos", registro: "registrar_gasto" }]);
    await a.handle("deshaz eso");
    expect(store.data.notas).toEqual([]);
    expect(store.data.movimientos).toEqual([]);
  });
  it("lo que llega por Siri queda marcado como de Siri", async () => {
    const { a, store } = await setup();
    await a.handle("hoy salí con la polola al cine", () => {}, "siri");
    expect(store.data.notas[0]).toMatchObject({ area: "amor", origen: "siri" });
  });
  it("las preguntas no se guardan como notas", async () => {
    const { a, store } = await setup();
    await a.handle("¿qué es el VO2 máx?");
    expect(store.data.notas).toEqual([]);
  });
});

describe("que responda todo", () => {
  beforeEach(async () => {
    resetDB();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase("vida");
      r.onsuccess = r.onerror = () => res();
    });
  });
  async function setup(conn: any = { mode: "key", apiKey: "" }, stream: any = vi.fn()) {
    const kv = memoryKV();
    const routine = new Routine(kv);
    const store = new AppStore();
    await store.load();
    const clock = at("15:00");
    const reg = new ToolRegistry();
    reg.register(...routineTools(routine, clock), ...vidaTools({ store, routine, clock }), ...diaTools({ store, routine, clock }), ...extrasTools({ store, routine, clock }));
    const a = new Assistant(reg, routine, () => conn, kv, clock, { stream, ask: vi.fn() } as any, { parse: (t, n) => parseVida(t, n.date), notar: crearNotar(store, clock), esPregunta });
    return { a, store, kv };
  }
  it("sin Gemini, una pregunta general queda guardada para responderla después (nunca 'no entiendo')", async () => {
    const { a } = await setup();
    const r = await a.handle("¿qué es el VO2 máx?");
    expect(r.text).toMatch(/Guardé tu pregunta y te la respondo apenas lo conectes/);
    expect(a.pendientes()).toEqual(["¿qué es el VO2 máx?"]);
    a.quitarPendiente("¿qué es el VO2 máx?");
    expect(a.pendientes()).toEqual([]);
  });
  it("con Gemini, si el teléfono no encuentra algo, se lo pasa a Gemini en vez de rendirse", async () => {
    const stream = vi.fn(async (_c: any, _r: any, on: any) => (on("Tu meta de plata es la del Working Holiday."), { text: "x", calls: [], parts: [] }));
    const { a } = await setup({ mode: "key", apiKey: "k" }, stream);
    const r = await a.handle("aporté 20 mil a la meta del auto");
    expect(stream).toHaveBeenCalled();
    expect(r.text).toBe("Tu meta de plata es la del Working Holiday.");
  });
  it("busca en todo lo que le contaste", async () => {
    const { a } = await setup();
    await a.handle("me duele la rodilla derecha");
    await a.handle("fui al dentista por una muela");
    expect((await a.handle("qué te dije de la rodilla")).text).toBe("Encontré esto: hoy, me duele la rodilla derecha.");
    expect((await a.handle("cuándo fue la última vez que fui al dentista")).text).toMatch(/^Encontré esto: hoy, fui al dentista/);
  });
});

describe("clave de Gemini", () => {
  it("se limpia de espacios y caracteres invisibles al copiarla", async () => {
    const { limpiarClave } = await import("../src/brain/gemini");
    expect(limpiarClave(" AQ.Ab8_x-Y​\n")).toBe("AQ.Ab8_x-Y");
    expect(limpiarClave("AIzaSyD-ab_12")).toBe("AIzaSyD-ab_12");
  });
});
