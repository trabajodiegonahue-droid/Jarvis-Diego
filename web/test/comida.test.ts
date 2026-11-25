import { describe, expect, it } from "vitest";
import { proteinaDia, rachaCreatina, sinSubir } from "../src/plan/comida";

describe("comida y suplementos", () => {
  it("proteína estimada: desayuno y batido ~30 g, almuerzo 25, once 20 (meta 110)", () => {
    expect(proteinaDia({ id: "x", desayuno: true, batido: true, almuerzo: true, once: true })).toBe(105);
    expect(proteinaDia({ id: "x", desayuno: true }, { medida: 30, meta: 110, almuerzo: 25, once: 20, colacion: 8 })).toBe(36);
    expect(proteinaDia(undefined)).toBe(0);
  });
  it("racha de creatina (hoy todavía no corta)", () => {
    const cs = [{ id: "2026-11-23", creatina: true }, { id: "2026-11-24", creatina: true }];
    expect(rachaCreatina(cs, "2026-11-25")).toBe(2);
    expect(rachaCreatina([...cs, { id: "2026-11-25", creatina: true }], "2026-11-25")).toBe(3);
  });
  it("aviso si no subes de peso en 2–3 semanas", () => {
    expect(sinSubir([{ id: "2026-11-01", kg: 70 }, { id: "2026-11-20", kg: 70.1 }], "2026-11-25")).toEqual({ kg: 70.1, antes: 70 });
    expect(sinSubir([{ id: "2026-11-01", kg: 70 }, { id: "2026-11-20", kg: 70.6 }], "2026-11-25")).toBeNull();
  });
});
