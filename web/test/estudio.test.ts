import { describe, expect, it } from "vitest";
import { diasEstudiados, ejeDeLaSemana, estudioDeHoy, interesCompuesto, MAZO_FUTBOL, materiaDeNombre, minutosPorSemana, presupuesto503020, puntoEquilibrio, rachaEstudio, repasarError, repasarTarjeta, TEMAS, todasLasSesiones } from "../src/plan/estudio";

describe("estudio del bloque", () => {
  it("una materia por día; sábado mini-ensayo alternado; domingo libre", () => {
    expect(estudioDeHoy("2026-11-30").materia).toBe("mate");
    expect(estudioDeHoy("2026-12-01").materia).toBe("ingles");
    expect(estudioDeHoy("2026-12-02").materia).toBe("lenguaje");
    expect(estudioDeHoy("2026-12-03").materia).toBe("ventas");
    expect(estudioDeHoy("2026-12-04").materia).toBe("economia");
    expect(estudioDeHoy("2026-12-05").ensayo).not.toBe(estudioDeHoy("2026-12-12").ensayo);
    expect(estudioDeHoy("2026-12-06").texto).toBe("Libre");
  });
  it("temario de Matemática: un eje cada 2 semanas", () => {
    expect(ejeDeLaSemana("2026-12-03").id).toBe("numeros");
    expect(ejeDeLaSemana("2026-12-17").id).toBe("algebra");
    expect(ejeDeLaSemana("2027-01-07").id).toBe("geometria");
    expect(ejeDeLaSemana("2027-01-20").id).toBe("probabilidad");
  });
  it("mazo de 40 palabras y temarios de 8 semanas con 3 preguntas", () => {
    expect(MAZO_FUTBOL).toHaveLength(40);
    for (const m of ["ventas", "economia"] as const) {
      expect(TEMAS[m]).toHaveLength(8);
      for (const t of TEMAS[m]) for (const q of t.quiz) expect(q.c).toBeLessThan(q.o.length);
    }
  });
  it("repetición espaciada: tarjetas y cuaderno de errores", () => {
    const t = { id: "a", palabra: "pitch", traduccion: "cancha", intervalo: 1, proximaRevision: "2026-11-25", aciertos: 0, fallos: 0 };
    const t2 = repasarTarjeta(t, true, "2026-11-25");
    expect([t2.intervalo, t2.proximaRevision]).toEqual([2, "2026-11-27"]);
    expect(repasarTarjeta(t2, false, "2026-11-27")).toMatchObject({ intervalo: 1, proximaRevision: "2026-11-28", fallos: 1 });
    const e = { id: "e", materia: "mate" as const, descripcion: "x", fechaCreado: "2026-11-25", proximaRevision: "2026-11-27", intervalo: 2, resuelto: false };
    expect(repasarError(e, true, "2026-11-27")).toMatchObject({ intervalo: 4, proximaRevision: "2026-12-01", resuelto: false });
    expect(repasarError({ ...e, intervalo: 8 }, true, "2026-11-27").resuelto).toBe(true);
    expect(repasarError({ ...e, intervalo: 8 }, false, "2026-11-27")).toMatchObject({ intervalo: 2, proximaRevision: "2026-11-29" });
  });
  it("minutos, días estudiados y racha (el finde no la corta); incluye lo antiguo de JARVIS", () => {
    const L = (fecha: string, materia: any, minutos: number) => ({ id: fecha + materia, fecha, materia, minutos });
    const log = todasLasSesiones([L("2026-11-27", "economia", 45), L("2026-11-30", "mate", 45)], [{ id: "s", materiaId: "m1", fecha: "2026-12-01", minutos: 30 }], [{ id: "m1", nombre: "Inglés" }]);
    expect(materiaDeNombre("Matemáticas PAES")).toBe("mate");
    expect(minutosPorSemana(log, "2026-11-30", "2026-12-06")[0]).toMatchObject({ mate: 45, ingles: 30 });
    expect(diasEstudiados(log, "2026-11-30", "2026-12-04")).toEqual({ hechos: 2, plan: 5 });
    expect(rachaEstudio(log, "2026-12-01")).toBe(3);
  });
  it("calculadoras", () => {
    const s = interesCompuesto(10000, 0, 2);
    expect(s.map((x) => x.valor)).toEqual([120000, 240000]);
    expect(interesCompuesto(10000, 12, 1)[0].valor).toBeGreaterThan(120000);
    expect(presupuesto503020(500000)).toEqual({ necesidades: 250000, gustos: 150000, ahorro: 100000 });
    expect(puntoEquilibrio(50000, 15000, 6000)).toBe(6);
    expect(puntoEquilibrio(50000, 5000, 6000)).toBeNull();
  });
});
