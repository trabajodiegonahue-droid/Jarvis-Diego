import { describe, expect, it } from "vitest";
import { chileNow, parseHour } from "../src/core/time";

describe("hora de Chile", () => {
  it("convierte a la zona de Chile (verano, UTC-3)", () => {
    const n = chileNow(new Date("2026-11-17T21:05:00Z"));
    expect(n.date).toBe("2026-11-17");
    expect(n.hhmm).toBe("18:05");
    expect(n.dow).toBe(1); // martes
    expect(n.label).toMatch(/martes/);
  });
  it("cambia de día a la medianoche de Chile, no la de UTC", () => {
    const n = chileNow(new Date("2026-11-18T02:30:00Z"));
    expect(n.date).toBe("2026-11-17");
    expect(n.hhmm).toBe("23:30");
  });
  it("entiende horas habladas", () => {
    expect(parseHour("18:00")).toBe("18:00");
    expect(parseHour("18")).toBe("18:00");
    expect(parseHour("7.30")).toBe("07:30");
    expect(parseHour("6 de la tarde")).toBe("18:00");
    expect(parseHour("9 de la noche")).toBe("21:00");
    expect(parseHour("6:15 pm")).toBe("18:15");
    expect(parseHour("25:00")).toBeNull();
    expect(parseHour("nada")).toBeNull();
  });
});
