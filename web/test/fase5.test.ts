import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Assistant } from "../src/brain/assistant";
import { memoryKV } from "../src/core/storage";
import { eventosDia, semanaCal } from "../src/calendar/calc";
import { resetDB } from "../src/data/db";
import { datosEjemplo } from "../src/data/demo";
import { AppStore } from "../src/data/store";
import { categoriasBase, emptyDatos, type Datos, type Habito } from "../src/data/types";
import { cumplimiento, fraseBienestar, mejorRacha, racha } from "../src/habits/calc";
import { diaTools } from "../src/jarvis/diaTools";
import { numerosAnio, resumenAnio, resumenSemana } from "../src/jarvis/resumenes";
import { parseVida } from "../src/jarvis/vidaParser";
import { vidaTools } from "../src/jarvis/vidaTools";
import { Routine } from "../src/routine/routine";
import { bloquesDia, catPara, fraseTiempo, minutosDia, minutosEntreIso, tiempoPeriodo } from "../src/time/calc";
import { ToolRegistry } from "../src/tools/registry";
import { routineTools } from "../src/tools/routineTools";
import { chequeoDeHoy } from "../src/training/calc";
import { describir, fraseClima, leerRespuesta, obtenerClima, PUERTO_VARAS } from "../src/weather/clima";
import { at } from "./helpers";

const HOY = "2026-11-17"; // martes
const base = (): Datos => ({ ...emptyDatos(), categorias: categoriasBase() });

describe("hábitos", () => {
  const h: Habito = { id: "h", nombre: "Leer", dias: [], orden: 0 };
  const lv: Habito = { id: "lv", nombre: "Inglés", dias: [0, 1, 2, 3, 4], orden: 1 };
  const dia = (id: string, ...habitos: string[]) => ({ id, habitos });
  it("la racha cuenta días seguidos y hoy sin marcar no la corta", () => {
    const dias = [dia("2026-11-14", "h"), dia("2026-11-15", "h"), dia("2026-11-16", "h")];
    expect(racha(h, dias, HOY)).toBe(3);
    expect(racha(h, [...dias, dia(HOY, "h")], HOY)).toBe(4);
    expect(racha(h, [dia("2026-11-14", "h"), dia("2026-11-16", "h")], HOY)).toBe(1);
  });
  it("los días que no aplican no cortan la racha (lunes a viernes)", () => {
    const dias = [dia("2026-11-12", "lv"), dia("2026-11-13", "lv"), dia("2026-11-16", "lv")]; // jue, vie, lun
    expect(racha(lv, dias, HOY)).toBe(3);
    expect(mejorRacha(lv, dias, HOY)).toBe(3);
  });
  it("cumplimiento de 7 días y frase de bienestar sin sermones", () => {
    const dias = [dia("2026-11-16", "h"), dia("2026-11-15")];
    expect(cumplimiento([h], dias, HOY, 3)).toEqual({ hechos: 1, tocaban: 2, pct: 50 });
    const poco = ["2026-11-15", "2026-11-16", HOY].map((id) => ({ id, habitos: [], sueno: 5.5 }));
    expect(fraseBienestar(poco, HOY)).toMatch(/3 noches durmiendo menos/);
  });
  it("el sueño y la energía de Hábitos ajustan la carga del entreno", () => {
    expect(chequeoDeHoy({ chequeos: [], dias: [{ id: HOY, habitos: [], sueno: 5, energia: 1 }] }, HOY)).toEqual({ id: HOY, cansancio: 5, dolor: 0, sueno: 5 });
    expect(chequeoDeHoy({ chequeos: [{ id: HOY, cansancio: 2, dolor: 3 }], dias: [{ id: HOY, habitos: [], sueno: 6 }] }, HOY)).toEqual({ id: HOY, cansancio: 2, dolor: 3, sueno: 6 });
  });
});

describe("calendario unificado", () => {
  it("junta todo el día y avisa los choques", () => {
    const d = base();
    d.turnos = [{ id: "t", fecha: HOY, inicio: "14:00", fin: "22:30", pausaMin: 30 }];
    d.partidos = [{ id: "p", tipo: "partido", fecha: HOY, hora: "19:00", rival: "Frutillar", temporada: "2026" }];
    d.evaluaciones = [{ id: "e", materiaId: "m", nombre: "EF SET", fecha: HOY, escala: "porcentaje" }];
    const tasks = [{ id: "r", title: "Leer", time: "22:00", days: [0, 1, 2, 3, 4, 5, 6], done: [] }];
    const dc = eventosDia(d, tasks, HOY);
    expect(dc.eventos.map((e) => e.titulo)).toEqual(["Prueba: EF SET", "Turno de trabajo", "Partido vs. Frutillar", "Leer"]);
    expect(dc.choques[0]).toBe("Turno de trabajo (14:00–22:30) se cruza con Partido vs. Frutillar (19:00–20:45).");
    expect(dc.choques.some((c) => /Leer/.test(c))).toBe(true);
  });
  it("turno que pasa de medianoche aparece en los dos días", () => {
    const d = base();
    d.turnos = [{ id: "t", fecha: HOY, inicio: "20:00", fin: "02:00", pausaMin: 0 }];
    expect(eventosDia(d, [], HOY).eventos[0]).toMatchObject({ inicio: "20:00", fin: "24:00" });
    expect(eventosDia(d, [], "2026-11-18").eventos[0]).toMatchObject({ titulo: "Turno (sigue de ayer)", inicio: "00:00", fin: "02:00" });
  });
  it("una semana tiene 7 días", () => {
    expect(semanaCal(base(), [], "2026-11-16").map((x) => x.fecha)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
  });
});

describe("bitácora de tiempo (al minuto)", () => {
  it("minutos entre fechas y horas", () => {
    expect(minutosEntreIso("2026-11-16T23:30", "2026-11-17T07:00")).toBe(450);
    expect(catPara("viendo una serie")).toBe("ocio");
    expect(catPara("en el celular")).toBe("pantallas");
    expect(catPara("estudiando inglés")).toBe("estudio");
  });
  it("corta los bloques en la medianoche y suma los turnos solos", () => {
    const d = base();
    d.actividades = [{ id: "s", cat: "sueno", inicio: "2026-11-16T23:30", fin: `${HOY}T07:00` }];
    d.turnos = [{ id: "t", fecha: HOY, inicio: "14:00", fin: "18:00", pausaMin: 0 }];
    const b = bloquesDia(d, HOY);
    expect(b.map((x) => [x.cat, x.ini, x.fin, !!x.derivado])).toEqual([
      ["sueno", 0, 420, false],
      ["trabajo", 840, 1080, true],
    ]);
    expect(bloquesDia(d, "2026-11-16")[0]).toMatchObject({ ini: 1410, fin: 1440 });
  });
  it("cada minuto cuenta una vez: si se pisan, gana lo anotado", () => {
    const d = base();
    d.turnos = [{ id: "t", fecha: HOY, inicio: "14:00", fin: "18:00", pausaMin: 0 }];
    d.actividades = [
      { id: "a", cat: "pantallas", inicio: `${HOY}T15:00`, fin: `${HOY}T15:30` },
      { id: "b", cat: "estudio", inicio: `${HOY}T15:15`, fin: `${HOY}T16:00` },
    ];
    expect(minutosDia(bloquesDia(d, HOY))).toEqual({ trabajo: 180, pantallas: 15, estudio: 45 });
  });
  it("el cronómetro corriendo cuenta hasta ahora; periodo y frase", () => {
    const d = base();
    d.actividades = [{ id: "a", cat: "estudio", inicio: `${HOY}T09:00` }];
    const p = tiempoPeriodo(d, HOY, HOY, `${HOY}T10:30`);
    expect(p.porCat).toEqual({ estudio: 90 });
    expect(p.posible).toBe(630);
    expect(fraseTiempo(p, "hoy")).toBe("Hoy registraste 1 h 30 min: estudio 1 h 30 min. Quedaron 9 h sin registrar.");
  });
});

describe("clima (Open-Meteo)", () => {
  const resp = { current: { temperature_2m: 11.4, weather_code: 61 }, daily: { time: [HOY, "2026-11-18"], weather_code: [61, 2], temperature_2m_max: [14.6, 18], temperature_2m_min: [7.2, 6], precipitation_probability_max: [85, 10], precipitation_sum: [6.3, 0] } };
  it("lee la respuesta y la dice en palabras", () => {
    const c = leerRespuesta(resp, "Puerto Varas");
    expect(c.dias[0]).toEqual({ fecha: HOY, codigo: 61, max: 15, min: 7, lluvia: 85, mm: 6.3 });
    expect(describir(61)).toBe("con lluvia");
    expect(fraseClima(c, HOY)).toBe("En Puerto Varas, 7 a 15 grados, con lluvia, 85% de probabilidad de lluvia. Lleva paraguas o chaqueta de agua.");
    expect(fraseClima(c, HOY, { partido: true })).toMatch(/Para el partido: ropa de agua/);
  });
  it("guarda una copia por una hora y sin internet usa la última", async () => {
    const kv = memoryKV();
    const f = vi.fn(async () => new Response(JSON.stringify(resp)));
    await obtenerClima(PUERTO_VARAS, kv, f as any);
    await obtenerClima(PUERTO_VARAS, kv, f as any);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String((f.mock.calls[0] as any)[0])).toMatch(/latitude=-41\.3195&longitude=-72\.9854/);
    kv.set("clima", { ...kv.get<any>("clima", null), at: 0 });
    const off = vi.fn(async () => {
      throw new Error("sin red");
    });
    expect((await obtenerClima(PUERTO_VARAS, kv, off as any))?.dias.length).toBe(2);
  });
});

describe("intérprete: lo nuevo de la fase 5", () => {
  const p = (s: string, ctx = {}) => parseVida(s, HOY, ctx);
  it("bitácora", () => {
    expect(p("empecé a estudiar")).toEqual({ tool: "iniciar_actividad", args: { texto: "estudiar" } });
    expect(p("me voy a dormir")).toEqual({ tool: "iniciar_actividad", args: { texto: "dormir" } });
    expect(p("estoy viendo una serie")).toEqual({ tool: "iniciar_actividad", args: { texto: "viendo una serie" } });
    expect(p("terminé", { corriendo: "estudio" })).toEqual({ tool: "terminar_actividad", args: {} });
    expect(p("terminé")).toBeNull(); // sin cronómetro, "terminé" es de la rutina u otra cosa
    expect(p("me desperté", { corriendo: "sueno" })).toEqual({ tool: "terminar_actividad", args: {} });
    expect(p("de 14 a 16 estuve estudiando")).toEqual({ tool: "registrar_bloque", args: { texto: "estudiando", inicio: "14:00", fin: "16:00" } });
    expect(p("dormí de 23:30 a 7")).toEqual({ tool: "registrar_bloque", args: { texto: "dormi", inicio: "23:30", fin: "07:00" } });
    expect(p("estuve 2 horas en el celular")).toEqual({ tool: "registrar_bloque", args: { texto: "en el celular", minutos: 120 } });
    expect(p("¿en qué se me fue el día?")).toEqual({ tool: "consultar_tiempo", args: { periodo: "hoy" } });
    expect(p("cuánto tiempo estudié este mes")).toEqual({ tool: "consultar_tiempo", args: { periodo: "mes", texto: "estudie" } });
    expect(p("mi año en números")).toEqual({ tool: "resumen", args: { tipo: "anio" } });
  });
  it("bienestar y hábitos", () => {
    expect(p("dormí 6 horas y media")).toEqual({ tool: "registrar_dia", args: { sueno: 6.5 } });
    expect(p("tomé 2 vasos de agua")).toEqual({ tool: "registrar_dia", args: { agua_suma: 2 } });
    expect(p("me siento bajoneado")).toEqual({ tool: "registrar_dia", args: { animo: 2 } });
    expect(p("ando sin pilas")).toEqual({ tool: "registrar_dia", args: { energia: 2 } });
    expect(p("crea el hábito leer 15 minutos")).toEqual({ tool: "crear_habito", args: { nombre: "leer 15 minutos", dias: [] } });
    expect(p("hice el hábito de estirar")).toEqual({ tool: "marcar_habito", args: { nombre: "estirar" } });
    expect(p("ya leí", { habitos: ["Leí 15 min"] })).toBeNull(); // "leí" no calza como verbo de marcar
    expect(p("cumplí estirar", { habitos: ["Estirar 10 minutos"], rutina: ["Gimnasio"] })).toEqual({ tool: "marcar_habito", args: { nombre: "Estirar 10 minutos" } });
    expect(p("hice gimnasio", { habitos: ["Gimnasio diario"], rutina: ["Gimnasio"] })?.tool).toBe("registrar_entreno");
  });
  it("calendario y clima", () => {
    expect(p("¿qué tengo el viernes?")).toEqual({ tool: "ver_calendario", args: { fecha: "2026-11-20" } });
    expect(p("qué tengo mañana")).toEqual({ tool: "ver_calendario", args: { fecha: "2026-11-18" } });
    expect(p("qué tengo la próxima semana")).toEqual({ tool: "ver_calendario", args: { semana: "proxima" } });
    expect(p("¿se me cruza algo esta semana?")).toEqual({ tool: "ver_calendario", args: { semana: "esta" } });
    expect(p("¿va a llover mañana?")).toEqual({ tool: "consultar_clima", args: { dia: "manana" } });
    expect(p("cuánto tiempo estuve en el celular hoy")?.tool).toBe("consultar_tiempo");
  });
});

describe("JARVIS con la bitácora, hábitos y calendario", () => {
  beforeEach(async () => {
    resetDB();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase("vida");
      r.onsuccess = r.onerror = () => res();
    });
  });
  async function setup(hhmm = "15:00") {
    const kv = memoryKV();
    const routine = new Routine(kv);
    const store = new AppStore();
    await store.load();
    let clock = at(hhmm);
    const reg = new ToolRegistry();
    const c = () => clock;
    reg.register(...routineTools(routine, () => c()()), ...vidaTools({ store, routine, clock: () => c()() }), ...diaTools({ store, routine, clock: () => c()() }));
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, () => c()(), { stream: vi.fn(), ask: vi.fn() } as any, {
      parse: (t, n) => parseVida(t, n.date, { habitos: store.data.habitos.map((h) => h.nombre), rutina: routine.tasks.map((x) => x.title), corriendo: store.data.actividades.find((x) => !x.fin)?.cat ?? null }),
    });
    return { a, store, routine, setHora: (h: string) => (clock = at(h)) };
  }
  it("cronómetro: empezar, cambiar de actividad y terminar", async () => {
    const { a, store, setHora } = await setup("09:00");
    expect((await a.handle("empecé a estudiar")).text).toBe('Partí el cronómetro: estudio, desde las 09:00. Dime "terminé" cuando acabes.');
    setHora("10:15");
    expect((await a.handle("me pongo a ver una serie")).text).toMatch(/Partí el cronómetro: ver una serie.*Cerré estudio \(1 h 15 min\)/);
    setHora("11:00");
    expect((await a.handle("terminé")).text).toBe("Listo: ver una serie, 45 min.");
    expect(store.data.actividades.map((x) => [x.cat, x.inicio.slice(11), x.fin?.slice(11)])).toEqual([
      ["estudio", "09:00", "10:15"],
      ["ocio", "10:15", "11:00"],
    ]);
    expect((await a.handle("¿en qué se me fue el día?")).text).toMatch(/^Hoy registraste 2 h: estudio 1 h 15 min, ocio 45 min\./);
  });
  it("dormir: de anoche a hoy, y queda en Hábitos", async () => {
    const { a, store } = await setup("09:00");
    expect((await a.handle("dormí de 23:30 a 7")).text).toBe("Anotado: dormir de 23:30 a 07:00, 7 h 30 min. Son 7,5 horas de sueño.");
    expect(store.data.dias.find((x) => x.id === HOY)?.sueno).toBe(7.5);
    expect(store.data.actividades[0]).toMatchObject({ cat: "sueno", inicio: "2026-11-16T23:30", fin: `${HOY}T07:00` });
  });
  it("un rango que todavía no pasa hoy se entiende como de ayer", async () => {
    const { a, store } = await setup("10:00");
    expect((await a.handle("de 22 a 23 estuve en el celular")).text).toMatch(/de 22:00 a 23:00 \(ayer\)/);
    expect(store.data.actividades[0].inicio).toBe("2026-11-16T22:00");
  });
  it("bienestar y hábitos hablando, con deshacer", async () => {
    const { a, store } = await setup();
    expect((await a.handle("crea el hábito estirar 10 minutos")).text).toMatch(/Creé el hábito estirar 10 minutos, todos los días/);
    expect((await a.handle("cumplí estirar")).text).toBe("Marcado: estirar 10 minutos. Cumpliste todos tus hábitos de hoy.");
    expect((await a.handle("tomé 3 vasos de agua")).text).toBe("Anotado: 3 de 8 vasos de agua.");
    expect((await a.handle("tomé agua")).text).toBe("Anotado: 4 de 8 vasos de agua.");
    await a.handle("deshaz eso");
    expect(store.data.dias.find((x) => x.id === HOY)?.agua).toBe(3);
    expect((await a.handle("dormí 5 horas")).text).toMatch(/Poco sueño/);
  });
  it("calendario por voz", async () => {
    const { a, store } = await setup();
    await store.put("turnos", { id: "t", fecha: "2026-11-20", inicio: "14:00", fin: "22:30", pausaMin: 0 });
    await store.put("partidos", { id: "p", tipo: "partido", fecha: "2026-11-20", hora: "19:00", rival: "Frutillar", temporada: "2026" });
    const r = await a.handle("¿qué tengo el viernes?");
    expect(r.text).toMatch(/^El viernes 20 tienes turno de trabajo a las 14:00 y partido vs\. Frutillar a las 19:00\. Ojo: Turno de trabajo/);
    expect((await a.handle("¿se me cruza algo esta semana?")).text).toMatch(/Ojo con un choque: el viernes/);
  });
});

describe("resúmenes con todo", () => {
  const d = { ...base(), ...datosEjemplo(HOY) } as Datos;
  it("la semana pasada trae hábitos, sueño y bitácora", () => {
    const r = resumenSemana(d, "2026-11-15", true).texto;
    expect(r).toMatch(/^Tu semana pasada: /);
    expect(r).toMatch(/hábitos/);
    expect(r).toMatch(/dormiste [\d,]+ horas en promedio/);
    expect(r).toMatch(/En tu bitácora, lo que más tiempo se llevó/);
  });
  it("mi año en números", () => {
    const n = numerosAnio(d, HOY);
    expect(n.partidos).toBeGreaterThan(0);
    expect(n.porMes).toHaveLength(11);
    expect(n.tiempo.sueno).toBeGreaterThan(0);
    expect(resumenAnio(d, HOY).texto).toMatch(/^Tu 2026 en números: \d+ partidos, \d+ goles/);
  });
});
