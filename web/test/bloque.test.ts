import { describe, expect, it } from "vitest";
import { bloqueActual, faseDe, horarioDelDia, planDelDia } from "../src/plan/bloque";

describe("bloque de 8 semanas", () => {
  it("partido el domingo: MD y sesiones según la tabla", () => {
    const p = (f: string) => planDelDia(f, {});
    expect([p("2026-11-30"), p("2026-12-01"), p("2026-12-02"), p("2026-12-03"), p("2026-12-04"), p("2026-12-05"), p("2026-12-06")].map((x) => [x.mdTxt, x.manana.tipo, x.tarde.tipo])).toEqual([
      ["MD+1", "recuperacion", "tecnica"],
      ["MD-5", "fuerza", "resistencia"],
      ["MD-4", "preparador", "tecnica"],
      ["MD-3", "velocidad", "fuerza"],
      ["MD-2", "agilidad", "descanso"],
      ["MD-1", "activacion", "descanso"],
      ["Partido", "partido", "descanso"],
    ]);
    expect(p("2026-11-30").perro).toBe("Trote suave 20–30 min");
  });
  it("partido el sábado: el miércoles sigue siendo preparador", () => {
    const s = { "2026-11-30": "sab" as const };
    expect(planDelDia("2026-12-05", s).mdTxt).toBe("Partido");
    expect(planDelDia("2026-12-02", s).manana.tipo).toBe("preparador");
    expect(planDelDia("2026-12-03", s).tarde.titulo).toBe("Fuerza B moderada");
    expect(planDelDia("2026-12-06", s).mdTxt).toBe("MD+1");
  });
  it("fases: tests, base, descarga, intensificación, afinar; y la prueba activa Afinar", () => {
    expect(faseDe("2026-11-25").nombre).toBe("Tests");
    expect(faseDe("2026-12-03").nombre).toBe("Base");
    expect(faseDe("2026-12-23").nombre).toBe("Descarga + tests");
    expect(faseDe("2026-12-30").nombre).toBe("Intensificación");
    expect(faseDe("2027-01-20").nombre).toBe("Afinar");
    expect(faseDe("2026-12-10", undefined, "2026-12-14")).toMatchObject({ nombre: "Afinar", diasPrueba: 4 });
  });
});

describe("Mi Día", () => {
  it("el horario cambia según el día: perro, sesiones, materia y partido", () => {
    const mie = horarioDelDia("2026-12-02");
    expect(mie.find((b) => b.titulo === "Sesión 1 (física)")?.detalle).toBe("Preparador físico (full body + 10×10)");
    expect(mie.find((b) => b.titulo === "Estudio")?.detalle).toBe("Lenguaje · 45 min");
    expect(horarioDelDia("2026-12-01").find((b) => b.titulo === "Sacar al perro")?.detalle).toBe("Caminata");
    const dom = horarioDelDia("2026-12-06");
    expect(dom.find((b) => b.titulo === "Sesión 2 (técnica)")?.detalle).toBe("Recuperación: movilidad y estirar");
    expect(dom.find((b) => b.titulo === "Estudio")?.detalle).toBe("Libre");
    expect(dom).toHaveLength(18);
  });
  it("bloque actual y siguiente", () => {
    const b = horarioDelDia("2026-12-01");
    expect(bloqueActual(b, "10:05")).toMatchObject({ actual: { titulo: "Sesión 1 (física)" }, siguiente: { hora: "11:00" } });
    expect(bloqueActual(b, "07:00").actual).toBeNull();
  });
});

describe("gráficos de fútbol", async () => {
  const c = await import("../src/plan/futbolCalc");
  const E = (fecha: string, sesion: string, tipoSesion: string, extra = {}) => ({ id: fecha + sesion, fecha, nombre: sesion, items: [], sesion, tipoSesion, ...extra }) as any;
  it("cumplimiento, sesiones por semana y racha", () => {
    const ents = [E("2026-11-30", "recuperacion", "recuperacion"), E("2026-11-30", "tecnica", "tecnica"), E("2026-12-01", "fuerzaA", "fuerza", { rpe: 8, seg: 3600 })];
    expect(c.cumplimiento(ents, "2026-11-30", "2026-12-01", {}, "2026-12-01")).toEqual({ hechas: 3, plan: 4 });
    const s = c.sesionesPorSemana(ents, "2026-11-30", "2026-12-06", {});
    expect(s[0]).toMatchObject({ etiqueta: "30/11", plan: 10, tipos: { recuperacion: 1, tecnica: 1, fuerza: 1 } });
    expect(c.cargaSemanal(ents, "2026-11-30", "2026-12-06")[0].valor).toBe(480);
    expect(c.racha(ents, "2026-11-30", {}, "2026-11-30")).toBe(1);
  });
  it("tests: menos es mejor en sprint", () => {
    const t = [{ id: "a", fecha: "2026-11-25", semana: 0, sprint10: 1.9, salto: 40 }, { id: "b", fecha: "2026-12-23", semana: 4, sprint10: 1.8, salto: 38 }] as any;
    expect(c.serieTest(t, "sprint10")).toMatchObject({ cambio: -5.3, mejor: true });
    expect(c.serieTest(t, "salto")).toMatchObject({ cambio: -5, mejor: false });
  });
});
