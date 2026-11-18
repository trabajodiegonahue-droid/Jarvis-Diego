import { describe, expect, it } from "vitest";
import { chileAUtc } from "../src/core/time";
import { datosEjemplo } from "../src/data/demo";
import { categoriasBase, emptyDatos, type Datos, type Habito, type Meta } from "../src/data/types";
import { enDificil, esSensible, logros, proximasFechas, relevantes, simular } from "../src/extras/calc";
import { racha } from "../src/habits/calc";
import { exportarIcs, planAvisos } from "../src/jarvis/avisos";
import { parseExtras } from "../src/jarvis/extrasParser";
import { alSonar, parseCuando, proximos, siguiente, vencidos } from "../src/reminders/calc";
import { cargaDelDia } from "../src/training/calc";

const HOY = "2026-11-17"; // martes
const base = (): Datos => ({ ...emptyDatos(), categorias: categoriasBase() });

describe("cuándo: 'mañana a las 9', 'el viernes', 'en 2 horas'", () => {
  const c = (s: string, ahora = 15 * 60) => parseCuando(s, HOY, ahora);
  it("días y horas", () => {
    expect(c("mañana a las 9")).toMatchObject({ fecha: "2026-11-18", hora: "09:00", horaDicha: true });
    expect(c("el viernes a las 7 de la tarde")).toMatchObject({ fecha: "2026-11-20", hora: "19:00" });
    expect(c("el viernes")).toMatchObject({ fecha: "2026-11-20", hora: "09:00", horaDicha: false });
    expect(c("el martes")).toMatchObject({ fecha: "2026-11-24" }); // hoy es martes: el próximo
    expect(c("pasado mañana en la noche")).toMatchObject({ fecha: "2026-11-19", hora: "21:00" });
    expect(c("el 3 de enero")).toMatchObject({ fecha: "2027-01-03" });
    expect(c("el 25")).toMatchObject({ fecha: "2026-11-25" });
    expect(c("el 5")).toMatchObject({ fecha: "2026-12-05" });
  });
  it("relativos y horas que ya pasaron", () => {
    expect(c("en 30 minutos")).toMatchObject({ fecha: HOY, hora: "15:30" });
    expect(c("en 2 horas", 23 * 60)).toMatchObject({ fecha: "2026-11-18", hora: "01:00" });
    expect(c("a las 8", 10 * 60)).toMatchObject({ fecha: HOY, hora: "20:00" }); // las 8 ya pasaron: de la tarde
    expect(c("a las 8 de la mañana", 10 * 60)).toMatchObject({ fecha: "2026-11-18", hora: "08:00" });
    expect(c("algo sin fecha")).toBeNull();
  });
  it("repeticiones", () => {
    expect(c("todos los días a las 8")).toMatchObject({ repetir: "diario", hora: "08:00", fecha: "2026-11-18" });
    expect(c("todos los lunes a las 7")).toMatchObject({ repetir: "semanal", fecha: "2026-11-23", hora: "07:00" });
    expect(c("cada mes el 5")).toMatchObject({ repetir: "mensual", fecha: "2026-12-05" });
  });
  it("suenan, se repiten y se posponen", () => {
    const r = { id: "r", texto: "x", cuando: "2026-11-30T09:00", repetir: "mensual" as const };
    expect(siguiente(r)).toBe("2026-12-28T09:00"); // los días 29 a 31 se pasan al 28 para no saltarse febrero
    expect(siguiente({ ...r, repetir: "semanal" })).toBe("2026-12-07T09:00");
    expect(alSonar({ id: "a", texto: "x", cuando: "2026-11-17T09:00" })).toMatchObject({ hecho: true });
    const rs = [
      { id: "1", texto: "a", cuando: "2026-11-17T08:00" },
      { id: "2", texto: "b", cuando: "2026-11-17T18:00" },
      { id: "3", texto: "c", cuando: "2026-11-30T18:00" },
    ];
    expect(vencidos(rs, "2026-11-17T15:00").map((x) => x.id)).toEqual(["1"]);
    expect(proximos(rs, "2026-11-17T15:00", 3).map((x) => x.id)).toEqual(["2"]);
  });
  it("hora de Chile a UTC, con horario de verano", () => {
    expect(new Date(chileAUtc("2026-11-17T09:00")).toISOString()).toBe("2026-11-17T12:00:00.000Z"); // verano: UTC-3
    expect(new Date(chileAUtc("2026-07-01T09:00")).toISOString()).toBe("2026-07-01T13:00:00.000Z"); // invierno: UTC-4
  });
});

describe("intérprete: recordatorios, memoria, fechas, compras, simulador", () => {
  const p = (s: string, ctx = {}) => parseExtras(s, ctx);
  it("recordatorios", () => {
    expect(p("recuérdame pagar la luz mañana a las 10")).toEqual({ tool: "crear_recordatorio", args: { texto: "pagar la luz", cuando: "pagar la luz manana a las 10" } });
    expect(p("avísame en 30 minutos que saque la ropa")?.args).toMatchObject({ texto: "saque la ropa" });
    expect(p("qué recordatorios tengo")).toEqual({ tool: "ver_recordatorios", args: {} });
    expect(p("qué se viene esta semana")?.tool).toBe("lo_que_viene");
  });
  it("memoria", () => {
    expect(p("acuérdate que el viernes tengo prueba de inglés")).toEqual({ tool: "recordar", args: { texto: "el viernes tengo prueba de inglés" } });
    expect(p("qué recuerdas")).toEqual({ tool: "que_recuerdas", args: {} });
    expect(p("olvida lo del tobillo")).toEqual({ tool: "olvidar", args: { texto: "tobillo" } });
  });
  it("fechas importantes", () => {
    expect(p("el cumpleaños de mi mamá es el 3 de mayo")).toEqual({ tool: "agregar_fecha", args: { nombre: "Cumpleaños de mi mamá", dia: "05-03", tipo: "cumple" } });
    expect(p("el cumple del benja es el 20/12/2004")).toEqual({ tool: "agregar_fecha", args: { nombre: "Cumpleaños del Benja", dia: "12-20", tipo: "cumple", anio: 2004 } });
    expect(p("cuándo es el cumpleaños de mi mamá")).toEqual({ tool: "proximas_fechas", args: { nombre: "mi mama" } });
  });
  it("compras", () => {
    expect(p("agrega pan, leche y huevos a la lista")).toEqual({ tool: "agregar_compras", args: { cosas: ["pan", "leche", "huevos"] } });
    expect(p("compré el pan", { compras: ["Pan", "Leche"] })).toEqual({ tool: "marcar_compras", args: { cosas: ["pan"] } });
    expect(p("compré zapatillas en 30 mil", { compras: ["Pan"] })).toBeNull(); // eso es un gasto
  });
  it("simulador y semana difícil", () => {
    expect(p("si ahorro 50 lucas al mes cuándo llego")).toEqual({ tool: "simular_meta", args: { por_mes: 50000 } });
    expect(p("estoy en una semana pesada")).toEqual({ tool: "semana_dificil", args: { activar: true } });
    expect(p("ya estoy bien")).toBeNull();
    expect(p("ya estoy bien", { dificil: true })).toEqual({ tool: "semana_dificil", args: { activar: false } });
  });
});

describe("fechas, memoria, simulador, semana difícil y logros", () => {
  it("próximos cumpleaños con la edad", () => {
    const fs = [
      { id: "a", nombre: "Cumpleaños de la mamá", dia: "11-20", anio: 1975, tipo: "cumple" as const },
      { id: "b", nombre: "Año nuevo", dia: "01-01", tipo: "otro" as const },
    ];
    expect(proximasFechas(fs, HOY, 60).map((x) => [x.f.id, x.enDias, x.cumple])).toEqual([
      ["a", 3, 51],
      ["b", 45, undefined],
    ]);
  });
  it("la memoria no guarda datos sensibles y elige lo relevante", () => {
    expect(esSensible("mi clave del banco es 1234")).toBe(true);
    expect(esSensible("4111 1111 1111 1111")).toBe(true);
    expect(esSensible("el viernes tengo prueba de inglés")).toBe(false);
    const rs = [
      { id: "1", texto: "Me lesioné el tobillo izquierdo", creado: "2026-11-01" },
      { id: "2", texto: "Prueba de inglés", creado: "2026-11-10", fecha: "2026-11-18" },
      { id: "3", texto: "Cumpleaños del Benja", creado: "2026-10-01", fecha: "2026-10-05" },
    ];
    expect(relevantes(rs, "¿puedo entrenar pierna con el tobillo así?", HOY).map((r) => r.id).sort()).toEqual(["1", "2"]); // el 3 ya pasó
  });
  it("simulador de metas", () => {
    const d = base();
    const m: Meta = { id: "m", nombre: "Viaje", area: "dinero", tipo: "monto", objetivo: 600000, inicio: HOY, fechaLimite: "2027-05-17", fuente: "manual", creado: 0 };
    d.aportes = [{ id: "a", metaId: "m", fecha: HOY, valor: 100000 }];
    expect(simular(m, d, HOY, 100000)).toMatchObject({ meses: 5, aTiempo: true, necesario: 100000 });
    expect(simular(m, d, HOY, 50000)).toMatchObject({ meses: 10, aTiempo: false });
  });
  it("semana difícil: no corta rachas y baja el entreno", () => {
    const ps = [{ desde: "2026-11-14", hasta: "2026-11-20" }];
    expect(enDificil(ps, HOY)).toBe(true);
    const h: Habito = { id: "h", nombre: "Leer", dias: [], orden: 0 };
    const dias = [{ id: "2026-11-12", habitos: ["h"] }, { id: "2026-11-13", habitos: ["h"] }, { id: "2026-11-16", habitos: ["h"] }];
    expect(racha(h, dias, HOY)).toBe(1);
    expect(racha(h, dias, HOY, (f) => enDificil(ps, f))).toBe(3);
    expect(cargaDelDia(undefined, [], HOY, [], true)).toMatchObject({ nivel: "suave", factor: 0.7 });
  });
  it("logros con los datos de ejemplo", () => {
    const d = { ...base(), ...datosEjemplo(HOY) } as Datos;
    const ids = logros(d, HOY).map((l) => l.id);
    expect(ids).toContain("entrenos-10");
    expect(ids).toContain(`gol-2026`);
  });
});

describe("avisos", () => {
  const d = { ...base(), ...datosEjemplo(HOY) } as Datos;
  const tasks = [{ id: "t", title: "Gimnasio", time: "08:00", days: [0, 1, 2, 3, 4], done: [] }];
  it("arma los avisos de la semana: recordatorios, resumen, rutina y cumpleaños", () => {
    const av = planAvisos(d, tasks, { manana: "08:00", noche: "21:30", agua: false, rutina: true }, `${HOY}T15:00`);
    expect(av.every((a) => a.cuando > `${HOY}T15:00`)).toBe(true);
    expect(av.find((a) => a.id === "m:2026-11-18")?.cuerpo).toMatch(/^Hoy: /);
    expect(av.find((a) => a.id === "t:t:2026-11-18")).toMatchObject({ cuando: "2026-11-18T07:50", cuerpo: "En 10 minutos: gimnasio (08:00)." });
    expect(av.some((a) => a.cuerpo === "Pagar la cuenta de la luz")).toBe(true);
    expect(av.some((a) => /cumpleaños de la mamá/.test(a.cuerpo))).toBe(true);
    expect(JSON.stringify(av)).not.toMatch(/\$\d/); // nada de plata en la pantalla bloqueada
  });
  it("exporta un calendario .ics válido con alarmas", () => {
    const ics = exportarIcs(d, tasks, `${HOY}T15:00`);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toMatch(/SUMMARY:Gimnasio\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR/);
    expect(ics).toMatch(/SUMMARY:Revisar el presupuesto de la semana\r\nRRULE:FREQ=WEEKLY/);
    expect(ics).toMatch(/RRULE:FREQ=YEARLY/);
    expect(ics.match(/BEGIN:VEVENT/g)!.length).toBe(ics.match(/END:VEVENT/g)!.length);
  });
});
