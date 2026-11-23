import { describe, expect, it } from "vitest";
import type { Entreno, Partido } from "../src/data/types";
import { equilibrioFutbol, porMes, proximoEvento, resultado, serieNotas, sinRegistrar, statsTemporada } from "../src/futbol/calc";
import { EJERCICIOS, ejercicio } from "../src/training/ejercicios";
import { cargaDelDia, e1rm, equilibrioCuerpo, generarRutina, records, recordsNuevos, semanaEntreno, seriesAjustadas, sugerencia, volumenPorMusculo } from "../src/training/calc";

const HOY = "2026-11-17"; // martes

describe("biblioteca de ejercicios", () => {
  it("es coherente: ids únicos, variantes que existen, sin porcentajes inventados", () => {
    const ids = EJERCICIOS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EJERCICIOS) {
      if (e.facil) expect(ejercicio(e.facil), `${e.id}.facil`).toBeTruthy();
      if (e.dificil) expect(ejercicio(e.dificil), `${e.id}.dificil`).toBeTruthy();
      expect(e.errores.length).toBeGreaterThan(0);
      expect(JSON.stringify(e.secundarios)).not.toMatch(/\d/); // participación: nivel, nunca un % inventado
    }
  });
});

describe("generador de rutinas", () => {
  it("con 7 días deja uno de descanso y no se cae", () => {
    for (const objetivo of ["futbol", "fuerza", "masa"] as const) expect(generarRutina({ objetivo, dias: [0, 1, 2, 3, 4, 5, 6], minutos: 45, equipo: ["mancuernas"], nivel: 1 }).length).toBe(6);
  });
  it("reparte las sesiones en los días elegidos y deja descanso", () => {
    const s = generarRutina({ objetivo: "masa", dias: [0, 2, 4], minutos: 60, equipo: ["mancuernas", "barra-dominadas", "banda"], nivel: 2 });
    expect(s.map((x) => x.dia)).toEqual([0, 2, 4]);
    for (const ses of s) {
      expect(ses.items.length).toBeGreaterThanOrEqual(3);
      expect(ses.minutos).toBeLessThanOrEqual(70);
      expect(new Set(ses.items.map((i) => i.ejId)).size).toBe(ses.items.length); // sin repetir en la sesión
      expect(ses.items.every((i) => i.repsMin <= i.repsMax)).toBe(true);
    }
    expect(s[0].items.find((i) => ejercicio(i.ejId)?.tipo === "fuerza")?.repsMax).toBe(12);
  });
  it("respeta el equipo: en casa sin gimnasio no aparece la barra", () => {
    const s = generarRutina({ objetivo: "fuerza", dias: [0, 3], minutos: 75, equipo: ["mancuernas"], nivel: 3 });
    const usados = s.flatMap((x) => x.items.map((i) => ejercicio(i.ejId)!));
    expect(usados.every((e) => e.equipo.some((q) => q !== "gimnasio"))).toBe(true);
    expect(usados.some((e) => e.id === "sentadilla-barra" || e.id === "press-banca")).toBe(false);
  });
  it("principiante: no le da ejercicios avanzados", () => {
    const s = generarRutina({ objetivo: "masa", dias: [1, 4], minutos: 60, equipo: ["gimnasio", "mancuernas", "barra-dominadas"], nivel: 1 });
    expect(s.flatMap((x) => x.items).every((i) => ejercicio(i.ejId)!.nivel === 1)).toBe(true);
  });
  it("fútbol: potencia, prevención y nada de pierna pesada el día antes del partido", () => {
    const s = generarRutina({ objetivo: "futbol", dias: [0, 2, 4], minutos: 60, equipo: ["mancuernas", "cajon", "banda"], nivel: 2, diasPartido: [5] });
    const todos = s.flatMap((x) => x.items.map((i) => ejercicio(i.ejId)!));
    expect(todos.some((e) => e.tipo === "potencia")).toBe(true);
    expect(todos.some((e) => e.tipo === "prevencion")).toBe(true);
    const viernes = s.find((x) => x.dia === 4)!;
    expect(viernes.items.some((i) => ejercicio(i.ejId)!.pesado)).toBe(false);
  });
  it("respeta el tiempo de la sesión", () => {
    for (const minutos of [30, 45, 60]) {
      const s = generarRutina({ objetivo: "futbol", dias: [0, 2, 4], minutos, equipo: ["mancuernas", "cajon", "banda", "barra-dominadas"], nivel: 2 });
      for (const ses of s) expect(ses.minutos, `${minutos} min: ${ses.nombre}`).toBeLessThanOrEqual(minutos + 3);
    }
  });
  it("sin días no arma nada", () => {
    expect(generarRutina({ objetivo: "masa", dias: [], minutos: 60, equipo: [], nivel: 1 })).toEqual([]);
  });
});

const en = (fecha: string, ejId: string, series: { reps: number; kg?: number }[]): Entreno => ({ id: fecha + ejId, fecha, nombre: "x", items: [{ ejId, series }] });

describe("progresión y récords", () => {
  const item = { ejId: "sentadilla-goblet", series: 3, repsMin: 8, repsMax: 12, descanso: 90 };
  it("suma una repetición o sube el peso cuando todas llegan al tope", () => {
    expect(sugerencia([], item, false).texto).toMatch(/Primera vez/);
    const a = [en("2026-11-10", "sentadilla-goblet", [{ reps: 10, kg: 16 }, { reps: 9, kg: 16 }, { reps: 8, kg: 16 }])];
    expect(sugerencia(a, item, false)).toMatchObject({ reps: 11, kg: 16 });
    const b = [en("2026-11-12", "sentadilla-goblet", [{ reps: 12, kg: 16 }, { reps: 12, kg: 16 }, { reps: 12, kg: 16 }])];
    expect(sugerencia([...a, ...b], item, false)).toMatchObject({ reps: 8, kg: 18 });
    expect(sugerencia([...a, ...b], item, true).kg).toBe(18.5);
  });
  it("con el peso del cuerpo propone la variante más difícil", () => {
    const it2 = { ejId: "flexiones", series: 3, repsMin: 8, repsMax: 12, descanso: 90 };
    const s = sugerencia([en("2026-11-10", "flexiones", [{ reps: 12 }, { reps: 12 }, { reps: 13 }])], it2, false);
    expect(s.texto).toMatch(/flexiones con mochila/);
  });
  it("récords y récords nuevos", () => {
    const hist = [en("2026-11-01", "dominadas", [{ reps: 5 }, { reps: 4 }]), en("2026-11-08", "dominadas", [{ reps: 6 }])];
    expect(records(hist, "dominadas").maxReps?.reps).toBe(6);
    expect(recordsNuevos(hist, en("2026-11-15", "dominadas", [{ reps: 7 }]))).toEqual(["Dominadas: 7 repeticiones"]);
    expect(recordsNuevos(hist, en("2026-11-15", "dominadas", [{ reps: 6 }]))).toEqual([]);
    expect(Math.round(e1rm(100, 5))).toBe(117);
  });
  it("volumen por músculo de la semana", () => {
    const v = volumenPorMusculo([en("2026-11-16", "sentadilla-goblet", [{ reps: 10 }, { reps: 10 }, { reps: 10 }]), en("2026-11-10", "flexiones", [{ reps: 10 }])], "2026-11-16");
    expect(v.cuadriceps).toBe(3);
    expect(v.gluteos).toBe(1.5); // secundario alto = media serie
    expect(v.pectoral).toBeUndefined(); // la semana pasada no cuenta
  });
});

describe("carga del día", () => {
  const imp = (fecha: string): Partido => ({ id: fecha, tipo: "partido", fecha, temporada: "2026", importante: true });
  it("dolor agudo: parar y ver a un profesional", () => {
    const c = cargaDelDia({ id: HOY, cansancio: 2, dolor: 3, agudo: true }, [], HOY);
    expect(c.nivel).toBe("parar");
    expect(c.motivo).toMatch(/kinesiólogo/);
  });
  it("partido importante mañana o en dos días", () => {
    expect(cargaDelDia(undefined, [imp("2026-11-18")], HOY)).toMatchObject({ nivel: "activacion", sinPierna: true });
    expect(cargaDelDia(undefined, [imp("2026-11-19")], HOY)).toMatchObject({ nivel: "suave", factor: 0.7 });
    expect(cargaDelDia(undefined, [imp(HOY)], HOY).factor).toBe(0);
  });
  it("cansancio, sueño y dolor que se repite", () => {
    expect(cargaDelDia({ id: HOY, cansancio: 5, dolor: 0 }, [], HOY).nivel).toBe("muy-suave");
    expect(cargaDelDia({ id: HOY, cansancio: 2, dolor: 0, sueno: 6 }, [], HOY).factor).toBe(0.75);
    expect(cargaDelDia({ id: HOY, cansancio: 2, dolor: 0, sueno: 8 }, [], HOY).nivel).toBe("normal");
    const hist = [{ id: "2026-11-15", cansancio: 2, dolor: 5 }, { id: "2026-11-16", cansancio: 2, dolor: 4 }];
    expect(cargaDelDia({ id: HOY, cansancio: 2, dolor: 4 }, [], HOY, hist).motivo).toMatch(/varios días con dolor/);
    expect(seriesAjustadas(4, { nivel: "suave", factor: 0.75, motivo: "" })).toBe(3);
    expect(seriesAjustadas(2, { nivel: "muy-suave", factor: 0.5, motivo: "" })).toBe(1);
  });
});

describe("semana y equilibrio del cuerpo", () => {
  const plan = { id: "activo", objetivo: "masa" as const, dias: [0, 2, 4], minutos: 60, equipo: [], nivel: 2 as const, creado: HOY, sesiones: [0, 2, 4].map((d) => ({ id: "s" + d, dia: d, nombre: "x", items: [], minutos: 50 })) };
  it("puntos de la semana y equilibrio", () => {
    const ents = [en("2026-11-16", "flexiones", [{ reps: 10 }])];
    expect(semanaEntreno(plan, ents, HOY).map((x) => [x.plan, x.hecho])[0]).toEqual([true, true]);
    expect(equilibrioCuerpo(plan, ents, HOY)).toBe(100);
    expect(equilibrioCuerpo(plan, ents, "2026-11-20")).toBe(33); // 1 de 3 sesiones hasta el viernes
    expect(equilibrioCuerpo(undefined, ents, HOY)).toBeNull();
  });
});

describe("fútbol", () => {
  const p = (o: Partial<Partido>): Partido => ({ id: Math.random().toString(), tipo: "partido", fecha: "2026-11-01", temporada: "2026", ...o });
  const ps = [
    p({ fecha: "2026-10-04", fui: true, minutos: 90, goles: 1, asistencias: 0, calificacion: 7, golesFavor: 2, golesContra: 1, rival: "A" }),
    p({ fecha: "2026-11-01", fui: true, minutos: 60, goles: 0, asistencias: 2, calificacion: 6, golesFavor: 1, golesContra: 1, rival: "B" }),
    p({ fecha: "2026-11-08", fui: false }),
    p({ fecha: "2026-11-12", tipo: "entrenamiento", fui: true }),
    p({ fecha: "2026-11-15" }),
    p({ fecha: "2026-11-21", rival: "C" }),
    p({ fecha: "2025-11-01", temporada: "2025", fui: true, minutos: 45, goles: 0 }),
  ];
  it("estadísticas de la temporada", () => {
    expect(statsTemporada(ps, "2026")).toMatchObject({ partidos: 2, minutos: 150, goles: 1, asistencias: 2, nota: 6.5, ganados: 1, empatados: 1, perdidos: 0 });
    expect(statsTemporada(ps, "2025").minutos).toBe(45);
  });
  it("por mes, notas, próximo y pendientes de registrar", () => {
    expect(porMes(ps, "2026-11", 2)).toEqual([{ mes: "2026-10", minutos: 90, goles: 1, asistencias: 0 }, { mes: "2026-11", minutos: 60, goles: 0, asistencias: 2 }]);
    expect(serieNotas(ps, "2026").map((x) => x.nota)).toEqual([7, 6]);
    expect(proximoEvento(ps, HOY)?.rival).toBe("C");
    expect(sinRegistrar(ps, HOY).map((x) => x.fecha)).toEqual(["2026-11-15"]);
    expect(resultado(ps[0])).toBe("Ganado");
  });
  it("equilibrio: a cuántos fuiste de los que había", () => {
    expect(equilibrioFutbol(ps, "2026-11", HOY)).toBe(50); // fui a 2 de 4
  });
});
