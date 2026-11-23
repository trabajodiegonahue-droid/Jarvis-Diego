import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Assistant } from "../src/brain/assistant";
import { memoryKV } from "../src/core/storage";
import { resetDB } from "../src/data/db";
import { datosEjemplo } from "../src/data/demo";
import { AppStore } from "../src/data/store";
import { revisarBuzon } from "../src/jarvis/buzon";
import { categoriaPara, consultaDinero, resumenHoy, resumenMes, resumenSemana } from "../src/jarvis/resumenes";
import { fechaLimiteEn, montoEn, parseVida } from "../src/jarvis/vidaParser";
import { vidaTools } from "../src/jarvis/vidaTools";
import { Routine } from "../src/routine/routine";
import { ToolRegistry } from "../src/tools/registry";
import { routineTools } from "../src/tools/routineTools";
import { comandoEntreno } from "../src/training/voz";
import { forSpeech } from "../src/voice/speech";
import { categoriasBase, emptyDatos } from "../src/data/types";
import { at } from "./helpers";

const HOY = "2026-11-17"; // martes
const p = (s: string) => parseVida(s, HOY);

describe("intérprete de la vida: plata", () => {
  it("entiende montos como se dicen en Chile", () => {
    expect(montoEn("5 mil en comida")?.valor).toBe(5000);
    expect(montoEn("$12.500")?.valor).toBe(12500);
    expect(montoEn("30 lucas")?.valor).toBe(30000);
    expect(montoEn("una luca")?.valor).toBe(1000);
    expect(montoEn("cinco mil")?.valor).toBe(5000);
    expect(montoEn("1,5 millones")?.valor).toBe(1500000);
    expect(montoEn("un palo")?.valor).toBe(1000000);
    expect(montoEn("3 cosas")).toBeNull(); // un número chico sin unidad no es plata
  });
  it("gastos e ingresos, con fecha", () => {
    expect(p("Gasté 5 mil en comida")).toEqual({ tool: "registrar_gasto", args: { monto: 5000, descripcion: "comida" } });
    expect(p("pagué 30 lucas de luz ayer")).toEqual({ tool: "registrar_gasto", args: { monto: 30000, descripcion: "luz", fecha: "2026-11-16" } });
    expect(p("compré zapatillas en 45 mil")).toEqual({ tool: "registrar_gasto", args: { monto: 45000, descripcion: "zapatillas" } });
    expect(p("Jarvis, gasté $12.500 en el almuerzo")?.args).toEqual({ monto: 12500, descripcion: "almuerzo" });
    expect(p("me pagaron 40 mil de propina")).toEqual({ tool: "registrar_ingreso", args: { monto: 40000, descripcion: "propina" } });
    expect(p("me llegó el sueldo de 520.000")?.args).toEqual({ monto: 520000, descripcion: "sueldo" });
    expect(p("gasté plata")).toEqual({ tool: "__falta_monto", args: { tipo: "egreso" } });
  });
  it("consultas de plata", () => {
    expect(p("¿Cuánto llevo gastado este mes?")).toEqual({ tool: "consultar_dinero", args: { periodo: "mes", tipo: "egreso" } });
    expect(p("cuánto he gastado en comida esta semana")).toEqual({ tool: "consultar_dinero", args: { periodo: "semana", tipo: "egreso", categoria: "comida" } });
  });
});

describe("intérprete de la vida: entreno, fútbol, metas, estudio y trabajo", () => {
  it("entrenos", () => {
    expect(p("hice gym")).toEqual({ tool: "registrar_entreno", args: { tipo: "gym" } });
    expect(p("salí a correr 5 km en 30 minutos")).toEqual({ tool: "registrar_entreno", args: { tipo: "correr", minutos: 30, km: 5 } });
    // varias tareas de la rutina: lo resuelve el intérprete de la rutina
    expect(p("ya hice el gym y el inglés")).toBeNull();
  });
  it("partidos", () => {
    expect(p("metí un gol y una asistencia")).toEqual({ tool: "registrar_partido", args: { goles: 1, asistencias: 1 } });
    expect(p("hice 2 goles contra el Llanquihue y ganamos 3 a 1")?.args).toEqual({ goles: 2, resultado: "ganado", goles_favor: 3, goles_contra: 1, rival: "llanquihue" });
    expect(p("perdimos 2 a 1, jugué 70 minutos")?.args).toEqual({ minutos: 70, resultado: "perdido", goles_favor: 1, goles_contra: 2 });
    expect(p("cuántos goles llevo")).toEqual({ tool: "consultar_futbol", args: {} });
  });
  it("metas con fecha límite", () => {
    expect(fechaLimiteEn("para marzo", HOY)).toBe("2027-03-31");
    expect(fechaLimiteEn("para diciembre", HOY)).toBe("2026-12-31");
    expect(fechaLimiteEn("para el 15 de enero", HOY)).toBe("2027-01-15");
    expect(fechaLimiteEn("en 3 meses", HOY)).toBe("2027-02-17");
    expect(p("agrega una meta de ahorrar 200 mil para marzo")).toEqual({ tool: "crear_meta", args: { nombre: "ahorrar", tipo: "monto", objetivo: 200000, fecha_limite: "2027-03-31" } });
    expect(p("nueva meta: leer 10 libros para diciembre")?.args).toEqual({ nombre: "leer 10 libros", tipo: "cantidad", objetivo: 10, unidad: "libros", fecha_limite: "2026-12-31" });
    expect(p("agrega una meta de correr 3 veces por semana")?.args).toEqual({ nombre: "correr", tipo: "habito", objetivo: 3 });
    expect(p("aporté 20 mil a la meta del viaje")).toEqual({ tool: "aportar_meta", args: { meta: "viaje", valor: 20000 } });
  });
  it("estudio y turnos", () => {
    expect(p("estudié 1 hora y media de inglés")).toEqual({ tool: "registrar_estudio", args: { materia: "ingles", minutos: 90 } });
    expect(p("trabajé de 18 a 23 y saqué 15 mil de propina")).toEqual({ tool: "registrar_turno", args: { inicio: "18:00", fin: "23:00", propinas: 15000 } });
  });
  it("no se mete con la rutina", () => {
    expect(p("agrega estudiar a las 18")).toBeNull();
    expect(p("qué me toca ahora")).toBeNull();
    expect(p("¿qué me toca hoy?")).toEqual({ tool: "resumen", args: { tipo: "hoy" } });
  });
});

describe("categorías", () => {
  const cats = categoriasBase();
  it("adivina por palabras del día a día y si no sabe, no inventa", () => {
    expect(categoriaPara("almuerzo", cats, "egreso")?.id).toBe("c-comida");
    expect(categoriaPara("uber", cats, "egreso")?.id).toBe("c-transporte");
    expect(categoriaPara("chuteadores", cats, "egreso")?.id).toBe("c-deporte");
    expect(categoriaPara("propina", cats, "ingreso")?.id).toBe("i-propinas");
    expect(categoriaPara("luz", cats, "egreso")).toBeNull();
  });
});

describe("JARVIS anota en la app (con deshacer y modo privado)", () => {
  beforeEach(async () => {
    resetDB();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase("vida");
      r.onsuccess = r.onerror = () => res();
    });
  });
  async function setup(conn: any = { mode: "key", apiKey: "" }, privado = false, stream?: any) {
    const kv = memoryKV();
    const routine = new Routine(kv);
    routine.add("Gimnasio", "08:00");
    const store = new AppStore();
    await store.load();
    const clock = at("15:00");
    const reg = new ToolRegistry();
    reg.register(...routineTools(routine, clock), ...vidaTools({ store, routine, clock }));
    const a = new Assistant(reg, routine, () => conn, kv, clock, { stream: stream || vi.fn(), ask: vi.fn() } as any, { parse: (t, n) => parseVida(t, n.date), privado: () => privado });
    return { a, store, routine };
  }

  it("gasto con categoría: lo anota, lo dice y se puede deshacer hablando", async () => {
    const { a, store } = await setup();
    const r = await a.handle("gasté 5 mil en almuerzo");
    expect(r.text).toBe("Anotado: gasto de $5.000 en comida (almuerzo), hoy.");
    expect(r.undo).toBeTypeOf("function");
    expect(store.data.movimientos).toMatchObject([{ tipo: "egreso", monto: 5000, categoriaId: "c-comida", fecha: HOY, nota: "Almuerzo" }]);
    expect((await a.handle("deshaz eso")).text).toBe("Listo, lo deshice.");
    expect(store.data.movimientos).toEqual([]);
    expect((await a.handle("deshaz eso")).text).toMatch(/nada reciente/);
  });
  it("si no sabe la categoría, pregunta antes de anotar", async () => {
    const { a, store } = await setup();
    const r = await a.handle("pagué 30 lucas de luz");
    expect(r.text).toMatch(/Anoto un gasto de \$30\.000 por luz en otros gastos, ¿ya\?/);
    expect(store.data.movimientos).toEqual([]);
    await a.handle("sí");
    expect(store.data.movimientos).toMatchObject([{ monto: 30000, categoriaId: "c-otros" }]);
  });
  it("pregunta el monto si no lo dijo", async () => {
    const { a, store } = await setup();
    expect((await a.handle("gasté plata")).text).toMatch(/¿Cuánto fue/);
    await a.handle("8 lucas en micro");
    expect(store.data.movimientos).toMatchObject([{ monto: 8000, categoriaId: "c-transporte" }]);
  });
  it("avisa del presupuesto al anotar", async () => {
    const { a, store } = await setup();
    await store.put("presupuestos", { id: "c-comida", categoriaId: "c-comida", monto: 10000 });
    expect((await a.handle("gasté 6 mil en comida")).text).toMatch(/Llevas \$6\.000 de \$10\.000 este mes/);
    expect((await a.handle("gasté 6 mil en comida")).text).toMatch(/te pasaste del presupuesto de comida/);
  });
  it("entreno: lo anota y tacha el gimnasio de la rutina", async () => {
    const { a, store, routine } = await setup();
    const r = await a.handle("hice gym");
    expect(r.text).toMatch(/Anotado: gimnasio hoy\. Taché Gimnasio en la rutina\. Llevas 1 entreno esta semana/);
    expect(store.data.entrenos).toHaveLength(1);
    expect(routine.dayStatus(HOY, 1).done.map((t) => t.title)).toEqual(["Gimnasio"]);
    await r.undo!();
    expect(store.data.entrenos).toEqual([]);
    expect(routine.dayStatus(HOY, 1).done).toEqual([]);
  });
  it("partido: se suma al partido de hoy y va completando", async () => {
    const { a, store } = await setup();
    await store.put("partidos", { id: "px", tipo: "partido", fecha: HOY, rival: "Frutillar", temporada: "2026" });
    let r = await a.handle("metí un gol y una asistencia");
    expect(r.text).toMatch(/Anotado en el partido hoy contra Frutillar: 1 gol, 1 asistencia\. ¡Bien ahí! Si quieres, dime los minutos y qué nota te pones/);
    r = await a.handle("ganamos 3 a 1, jugué 80 minutos");
    expect(store.data.partidos).toMatchObject([{ id: "px", fui: true, goles: 1, asistencias: 1, minutos: 80, golesFavor: 3, golesContra: 1 }]);
  });
  it("metas: crear y aportar", async () => {
    const { a, store } = await setup();
    expect((await a.handle("agrega una meta de ahorrar 200 mil para marzo")).text).toMatch(/Creé la meta "Ahorrar \$200\.000" para el 31 mar/);
    expect((await a.handle("aporté 50 mil a la meta de ahorrar")).text).toBe('Sumé $50.000 a "Ahorrar $200.000". Llevas $50.000 de $200.000 (25%).');
    expect(store.data.aportes).toHaveLength(1);
    expect((await a.handle("¿cómo voy con mis metas?")).text).toMatch(/Ahorrar \$200\.000: 25%/);
  });
  it("estudio y turno con propinas que pasan a Dinero", async () => {
    const { a, store } = await setup();
    expect((await a.handle("estudié 45 minutos de inglés")).text).toMatch(/45 minutos de inglés hoy\. Creé la materia/);
    expect((await a.handle("trabajé de 18 a 23 y saqué 15 mil de propina")).text).toMatch(/turno hoy de 18:00 a 23:00, 5 horas y \$15\.000 de propinas/);
    expect(store.data.movimientos).toMatchObject([{ tipo: "ingreso", categoriaId: "i-propinas", monto: 15000 }]);
  });
  it("modo privado: con Gemini conectado, la plata no sale del teléfono", async () => {
    const stream = vi.fn();
    const { a } = await setup({ mode: "key", apiKey: "k" }, true, stream);
    expect((await a.handle("¿cuánto llevo gastado este mes?")).text).toMatch(/no tienes nada anotado/);
    expect((await a.handle("oye, me endeudé con 300 lucas, qué hago")).text).toMatch(/modo privado/);
    expect(stream).not.toHaveBeenCalled();
  });
  it("modo privado: si Gemini pide cifras, Diego las ve pero Gemini recibe solo un aviso", async () => {
    const { a, store } = await setup({ mode: "key", apiKey: "k" }, true);
    await store.put("movimientos", { id: "m", tipo: "egreso", monto: 7000, categoriaId: "c-comida", fecha: HOY, creado: 1 });
    const seen: any[] = [];
    const stream = vi.fn(async (_c: any, req: any, on: any) => {
      seen.push(JSON.stringify(req.contents));
      if (seen.length === 1) return { text: "", calls: [{ name: "consultar_dinero", args: { periodo: "mes" } }], parts: [{ functionCall: { name: "consultar_dinero", args: {} } }] };
      on("Ojo con el delivery.");
      return { text: "Ojo con el delivery.", calls: [], parts: [] };
    });
    (a as any).gemini = { stream, ask: vi.fn() };
    const r = await a.handle("analiza mis finanzas y dame un consejo");
    expect(r.text).toMatch(/Este mes llevas \$7\.000 gastados/);
    expect(seen[1]).not.toMatch(/7\.000|7000/);
    expect(seen[1]).toMatch(/cifras privadas/);
  });
});

describe("resúmenes y consultas (se calculan en el teléfono)", () => {
  const d = { ...emptyDatos(), categorias: categoriasBase(), ...datosEjemplo(HOY) } as any;
  it("dinero del mes", () => {
    const r = consultaDinero(d, HOY, { periodo: "mes" });
    expect(r.privado).toBe(true);
    expect(r.texto).toMatch(/^Este mes llevas \$[\d.]+ gastados y \$[\d.]+ de ingresos, así que vas/);
  });
  it("resumen de la mañana, la semana y el mes", () => {
    const m = resumenHoy(d, HOY, 7 * 60, { hechas: [], pendientes: [{ titulo: "Gimnasio", hora: "08:00" }], ayerPendientes: ["Leer"] }, true);
    expect(m.texto).toMatch(/^Buenos días Diego\. En la rutina tienes Gimnasio a las 08:00\./);
    expect(m.texto).toMatch(/De ayer quedó Leer\./);
    expect(resumenSemana(d, HOY).texto).toMatch(/^Tu semana: /);
    expect(resumenMes(d, HOY).texto).toMatch(/^Tu noviembre hasta ahora: En plata: entraron/);
    expect(resumenSemana(emptyDatos(), HOY).texto).toMatch(/todavía no tienes nada/);
  });
});

describe("voz", () => {
  it("lee la plata como pesos", () => {
    expect(forSpeech("Llevas $12.500 de $100.000.")).toBe("Llevas 12500 pesos de 100000 pesos.");
  });
  it("manos libres en el entreno", () => {
    expect(comandoEntreno("listo")).toEqual({ tipo: "serie" });
    expect(comandoEntreno("terminé la serie")).toEqual({ tipo: "serie" });
    expect(comandoEntreno("hice 8")).toEqual({ tipo: "serie", reps: 8 });
    expect(comandoEntreno("10 repeticiones con 22,5 kilos")).toEqual({ tipo: "serie", reps: 10, kg: 22.5 });
    expect(comandoEntreno("doce con veinte kilos")).toEqual({ tipo: "serie", reps: 12, kg: 20 });
    expect(comandoEntreno("siguiente ejercicio")).toEqual({ tipo: "siguiente" });
    expect(comandoEntreno("salta el descanso")).toEqual({ tipo: "saltar" });
    expect(comandoEntreno("terminé el entreno")).toEqual({ tipo: "terminar" });
    expect(comandoEntreno("qué toca")).toEqual({ tipo: "repite" });
    expect(comandoEntreno("me pica la nariz")).toBeNull();
  });
});

describe("buzón del Atajo de Siri", () => {
  it("anota lo pendiente y lo borra del intermediario", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || "GET"} ${url}`);
      if (url.endsWith("/buzon")) return new Response(JSON.stringify({ items: [{ id: "m:1", texto: "gasté 5 mil en comida", fecha: "" }] }));
      return new Response("{}");
    });
    const handle = vi.fn(async (t: string) => ({ text: `ok: ${t}`, source: "local" as const }));
    const r = await revisarBuzon({ mode: "worker", workerUrl: "https://w.dev/", workerToken: "x" } as any, { handle } as any, fetcher as any);
    expect(r).toEqual([{ texto: "gasté 5 mil en comida", respuesta: "ok: gasté 5 mil en comida", undo: undefined }]);
    expect(calls).toEqual(["GET https://w.dev/buzon", "POST https://w.dev/buzon/borrar"]);
    expect(await revisarBuzon({ mode: "key", apiKey: "k" } as any, { handle } as any, fetcher as any)).toEqual([]);
  });
});
