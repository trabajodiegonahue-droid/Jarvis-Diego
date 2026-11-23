import { describe, expect, it } from "vitest";
import { addDays, diffDays, dow, lunesDe, minutosEntre } from "../src/core/dates";
import { emptyDatos, type Datos, type Meta } from "../src/data/types";
import { avance, equilibrioMetas, faltaSemana, fechaEstimada, metasPrincipales, objetivoTotal, revisionMes, valorActual } from "../src/goals/calc";
import { cumpleMeta, equilibrioEstudios, formatoResultado, horasEnSemana, proximasEvaluaciones, resultadoValido, serieSemanas, tareasPendientes } from "../src/study/calc";
import { equilibrioTrabajo, horasMes, horasSemana, horasTurno, idPropinas, movPropinas, sueldoEstimado } from "../src/work/calc";

const HOY = "2026-11-17"; // martes

describe("fechas", () => {
  it("días, semanas y horas", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2027-03-01", "2027-02-01")).toBe(28);
    expect(dow(HOY)).toBe(1);
    expect(lunesDe(HOY)).toBe("2026-11-16");
    expect(lunesDe("2026-11-22")).toBe("2026-11-16"); // domingo
    expect(minutosEntre("14:00", "22:30")).toBe(510);
    expect(minutosEntre("16:00", "00:30")).toBe(510); // cruza la medianoche
  });
});

describe("trabajo", () => {
  const t = (id: string, fecha: string, inicio: string, fin: string, extra = {}) => ({ id, fecha, inicio, fin, pausaMin: 30, ...extra });
  const turnos = [t("a", "2026-11-03", "14:00", "22:30"), t("b", "2026-11-17", "16:00", "00:30", { propinas: 23500 }), t("c", "2026-11-18", "14:00", "22:30", { falte: true }), t("d", "2026-10-30", "14:00", "22:30")];
  it("horas por turno, semana y mes", () => {
    expect(horasTurno(turnos[0])).toBe(8);
    expect(horasTurno(turnos[1])).toBe(8);
    expect(horasTurno(turnos[2])).toBe(0);
    expect(horasMes(turnos, "2026-11")).toBe(16);
    expect(horasMes(turnos, "2026-11", "2026-11-10")).toBe(8);
    expect(horasSemana(turnos, HOY)).toBe(8);
  });
  it("sueldo estimado y propinas a Dinero sin duplicar", () => {
    expect(sueldoEstimado(16, 3200)).toBe(51200);
    expect(sueldoEstimado(16, 0)).toBe(0);
    const m = movPropinas(turnos[1])!;
    expect(m).toMatchObject({ id: idPropinas("b"), tipo: "ingreso", monto: 23500, categoriaId: "i-propinas", fecha: "2026-11-17" });
    expect(movPropinas(turnos[0])).toBeNull();
  });
  it("equilibrio: turnos a los que fuiste contra los planificados hasta hoy", () => {
    expect(equilibrioTrabajo(turnos, "2026-11", HOY)).toBe(100);
    expect(equilibrioTrabajo(turnos, "2026-11", "2026-11-20")).toBe(67);
    expect(equilibrioTrabajo([], "2026-11", HOY)).toBeNull();
  });
});

describe("estudios", () => {
  const ses = [
    { id: "1", materiaId: "ing", fecha: "2026-11-16", minutos: 60 },
    { id: "2", materiaId: "ing", fecha: HOY, minutos: 30 },
    { id: "3", materiaId: "mat", fecha: HOY, minutos: 45 },
    { id: "4", materiaId: "ing", fecha: "2026-11-10", minutos: 120 },
  ];
  it("horas por semana y por materia", () => {
    expect(horasEnSemana(ses, "2026-11-16")).toBe(2.25);
    expect(horasEnSemana(ses, "2026-11-16", "ing")).toBe(1.5);
    expect(serieSemanas(ses, HOY, 2).map((x) => x.horas)).toEqual([2, 2.25]);
  });
  it("equilibrio: lo hecho contra lo que tocaba hasta hoy", () => {
    const mats = [{ id: "ing", nombre: "Inglés", metaHorasSemana: 3.5 }, { id: "mat", nombre: "Matemáticas", metaHorasSemana: 3.5 }];
    expect(equilibrioEstudios(mats, ses, HOY)).toBe(100); // tocaban 2 h (7 × 2/7), hizo 2,25
    expect(equilibrioEstudios(mats, ses, "2026-11-22")).toBe(32); // domingo: tocaban 7 h
    expect(equilibrioEstudios([{ id: "x", nombre: "x" }], ses, HOY)).toBeNull();
  });
  it("pendientes, próximas pruebas y resultados", () => {
    const tareas = [{ id: "a", texto: "Ensayo", fecha: "2026-11-15", hecho: false }, { id: "b", texto: "Leer", hecho: false }, { id: "c", texto: "Futuro", fecha: "2026-11-30", hecho: false }, { id: "d", texto: "Hecha", hecho: true }];
    expect(tareasPendientes(tareas, HOY).map((t) => t.id)).toEqual(["a", "b"]);
    const evs = [{ id: "e1", materiaId: "ing", nombre: "EF SET", fecha: "2026-11-20", escala: "porcentaje" as const, meta: 51 }, { id: "e2", materiaId: "mat", nombre: "Prueba", fecha: "2026-12-30", escala: "nota" as const }, { id: "e3", materiaId: "mat", nombre: "Control", fecha: "2026-11-10", escala: "nota" as const, resultado: 5.5, meta: 6 }];
    expect(proximasEvaluaciones(evs, HOY).map((e) => e.id)).toEqual(["e1"]);
    expect(cumpleMeta(evs[2])).toBe(false);
    expect(formatoResultado(evs[2])).toBe("5,5");
    expect(resultadoValido("nota", 7.1)).toBe(false);
    expect(resultadoValido("nota", 4)).toBe(true);
    expect(resultadoValido("porcentaje", 101)).toBe(false);
  });
});

describe("metas", () => {
  const base = (m: Partial<Meta>): Meta => ({ id: "m", nombre: "Meta", area: "otro", tipo: "cantidad", objetivo: 10, inicio: "2026-11-01", fechaLimite: "2026-11-30", fuente: "manual", creado: 0, ...m });
  const d = (over: Partial<Datos> = {}): Datos => ({ ...emptyDatos(), ...over });
  it("cantidad a mano: avance contra el tiempo", () => {
    const m = base({});
    const datos = d({ aportes: [{ id: "a", metaId: "m", fecha: "2026-11-05", valor: 3 }, { id: "b", metaId: "m", fecha: "2026-11-20", valor: 4 }] });
    const a = avance(m, datos, HOY);
    expect(a.actual).toBe(3); // el aporte del 20 todavía no pasa
    expect(Math.round(a.pct)).toBe(30);
    expect(Math.round(a.pctTiempo)).toBe(55); // 16 de 29 días
    expect(a.estado).toBe("atrasada");
    expect(a.quedanDias).toBe(13);
    expect(faltaSemana(m, datos, HOY)!.valor).toBeCloseTo(3.5); // faltan 7 en 2 semanas
    expect(avance(m, datos, "2026-11-22").estado).toBe("a-tiempo");
    expect(avance(m, datos, "2026-12-02").estado).toBe("vencida");
  });
  it("ahorro que se alimenta solo desde Dinero", () => {
    const m = base({ tipo: "monto", fuente: "ahorro", objetivo: 1000000, inicio: "2026-11-01", fechaLimite: "2027-04-30" });
    const datos = d({
      movimientos: [
        { id: "1", tipo: "ingreso", monto: 420000, categoriaId: "i-sueldo", fecha: "2026-11-01", creado: 0 },
        { id: "2", tipo: "egreso", monto: 170000, categoriaId: "c-comida", fecha: "2026-11-10", creado: 0 },
        { id: "3", tipo: "ingreso", monto: 999999, categoriaId: "i-sueldo", fecha: "2026-10-01", creado: 0 },
      ],
      aportes: [{ id: "x", metaId: "m", fecha: "2026-11-01", valor: 100000, nota: "Lo que ya tenía" }],
    });
    expect(valorActual(m, datos, HOY)).toBe(350000);
    expect(Math.round(avance(m, datos, HOY).pct)).toBe(35);
  });
  it("horas de estudio y de trabajo desde sus módulos", () => {
    const datos = d({ sesiones: [{ id: "s", materiaId: "ing", fecha: "2026-11-10", minutos: 90 }], turnos: [{ id: "t", fecha: "2026-11-12", inicio: "14:00", fin: "22:30", pausaMin: 30 }] });
    expect(valorActual(base({ fuente: "horas-estudio" }), datos, HOY)).toBe(1.5);
    expect(valorActual(base({ fuente: "horas-trabajo" }), datos, HOY)).toBe(8);
  });
  it("hábito: veces por semana", () => {
    const m = base({ tipo: "habito", objetivo: 3, inicio: "2026-11-02", fechaLimite: "2026-11-29" }); // 4 semanas
    expect(objetivoTotal(m)).toBe(12);
    const datos = d({ aportes: [{ id: "1", metaId: "m", fecha: "2026-11-16", valor: 1 }, { id: "2", metaId: "m", fecha: "2026-11-03", valor: 1 }] });
    expect(faltaSemana(m, datos, HOY)!.texto).toBe("Te faltan 2 veces esta semana");
  });
  it("pasos", () => {
    const m = base({ tipo: "pasos", pasos: [{ id: "1", texto: "Sacar pasaporte", hecho: true }, { id: "2", texto: "Prueba de inglés", hecho: false }] });
    const a = avance(m, d(), HOY);
    expect([a.actual, a.objetivo, a.pct]).toEqual([1, 2, 50]);
    expect(faltaSemana(m, d(), HOY)!.texto).toBe("Siguiente paso: Prueba de inglés");
  });
  it("fecha estimada al ritmo actual", () => {
    const m = base({ objetivo: 100, inicio: "2026-10-01", fechaLimite: "2027-06-30" });
    const datos = d({ aportes: [{ id: "a", metaId: "m", fecha: "2026-11-01", valor: 20 }] }); // 20 en las últimas 4 semanas → 5 por semana
    expect(fechaEstimada(m, datos, HOY)).toBe(addDays(HOY, 16 * 7));
    expect(fechaEstimada(m, d(), HOY)).toBeNull();
  });
  it("equilibrio, principales y revisión del mes", () => {
    const m1 = base({ id: "m1", fechaLimite: "2026-12-20" });
    const m2 = base({ id: "m2", fechaLimite: "2027-03-01" });
    const m3 = base({ id: "m3", fechaLimite: "2026-11-20", principal: true });
    const datos = d({ aportes: [{ id: "a", metaId: "m3", fecha: "2026-11-10", valor: 10 }] });
    expect(metasPrincipales([m1, m2, m3], HOY).map((m) => m.id)).toEqual(["m3"]);
    expect(metasPrincipales([m1, m2], HOY).map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(equilibrioMetas([m3], datos, HOY)).toBe(100);
    expect(equilibrioMetas([m1], datos, HOY)).toBe(0);
    const r = revisionMes([m3], datos, "2026-11");
    expect(r[0]).toMatchObject({ ganado: 10, estado: "cumplida" });
  });
});
