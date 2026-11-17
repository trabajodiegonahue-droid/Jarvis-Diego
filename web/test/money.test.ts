import { describe, expect, it } from "vitest";
import { clp, parseCLP } from "../src/money/format";
import { ahorroAcumulado, compararMes, diasDelMes, equilibrioDinero, estadoPresupuestos, fraseDinero, mesesParaMeta, pendientesRecurrentes, porCategoria, presupuestoTotal, serieMensual, sumarMeses, totalesMes } from "../src/money/calc";
import { categoriasBase, type Movimiento } from "../src/data/types";

const mv = (fecha: string, tipo: "ingreso" | "egreso", monto: number, categoriaId = tipo === "ingreso" ? "i-sueldo" : "c-comida"): Movimiento => ({ id: fecha + monto + tipo + categoriaId, tipo, monto, categoriaId, fecha, creado: 0 });
const cats = categoriasBase();

describe("formato de pesos", () => {
  it("escribe como en Chile", () => {
    expect(clp(1234567)).toBe("$1.234.567");
    expect(clp(0)).toBe("$0");
    expect(clp(999)).toBe("$999");
    expect(clp(-5000)).toBe("-$5.000");
    expect(clp(186400, { signo: true })).toBe("+$186.400");
    expect(clp(1500.6)).toBe("$1.501");
  });
  it("entiende como se dice la plata", () => {
    expect(parseCLP("5000")).toBe(5000);
    expect(parseCLP("5.000")).toBe(5000);
    expect(parseCLP("$ 12.345")).toBe(12345);
    expect(parseCLP("5 mil")).toBe(5000);
    expect(parseCLP("5k")).toBe(5000);
    expect(parseCLP("40 lucas")).toBe(40000);
    expect(parseCLP("1,5 millones")).toBe(1500000);
    expect(parseCLP("2 palos")).toBe(2000000);
    expect(parseCLP("12.34")).toBeNull();
    expect(parseCLP("hola")).toBeNull();
    expect(parseCLP("")).toBeNull();
  });
});

describe("meses y fechas", () => {
  it("días del mes y bisiestos", () => {
    expect(diasDelMes("2026-02")).toBe(28);
    expect(diasDelMes("2028-02")).toBe(29);
    expect(diasDelMes("2026-11")).toBe(30);
    expect(sumarMeses("2026-11", 2)).toBe("2027-01");
    expect(sumarMeses("2027-01", -1)).toBe("2026-12");
  });
});

describe("totales y categorías", () => {
  const movs = [mv("2026-11-01", "ingreso", 420000), mv("2026-11-03", "egreso", 22000), mv("2026-11-05", "egreso", 9500, "c-transporte"), mv("2026-10-30", "egreso", 99999)];
  it("suma solo el mes pedido", () => {
    expect(totalesMes(movs, "2026-11")).toEqual({ ingresos: 420000, egresos: 31500, balance: 388500 });
    expect(totalesMes(movs, "2026-10").balance).toBe(-99999);
    expect(totalesMes([], "2026-11")).toEqual({ ingresos: 0, egresos: 0, balance: 0 });
  });
  it("gasto por categoría ordenado", () => {
    expect(porCategoria(movs, cats, "2026-11", "egreso").map((x) => [x.nombre, x.total])).toEqual([["Comida", 22000], ["Transporte", 9500]]);
  });
});

describe("presupuesto", () => {
  const movs = [mv("2026-11-02", "egreso", 60000), mv("2026-11-10", "egreso", 50000), mv("2026-11-04", "egreso", 30000, "c-salidas")];
  const pres = [{ id: "c-comida", categoriaId: "c-comida", monto: 130000 }, { id: "c-salidas", categoriaId: "c-salidas", monto: 25000 }, { id: "c-ropa", categoriaId: "c-ropa", monto: 0 }];
  it("calcula avance y alertas", () => {
    const e = estadoPresupuestos(movs, pres, cats, "2026-11", 17);
    expect(e.map((x) => [x.nombre, Math.round(x.pct), x.estado])).toEqual([["Salidas", 120, "excedido"], ["Comida", 85, "atencion"]]);
    expect(Math.round(e[0].esperado)).toBe(57); // 17 de 30 días
    const t = presupuestoTotal(e);
    expect(t).toMatchObject({ monto: 155000, gastado: 140000 });
  });
  it("un gasto fijo ya pagado no es alerta", () => {
    const fijo = { ...mv("2026-11-02", "egreso", 25000, "c-celular"), recurrenteId: "r1" };
    const e = estadoPresupuestos([fijo], [{ id: "c-celular", categoriaId: "c-celular", monto: 25000 }], cats, "2026-11", 5);
    expect(e[0].estado).toBe("ok");
    const e2 = estadoPresupuestos([fijo, mv("2026-11-03", "egreso", 3000, "c-celular")], [{ id: "c-celular", categoriaId: "c-celular", monto: 25000 }], cats, "2026-11", 5);
    expect(e2[0].estado).toBe("excedido");
  });
  it("va bien cuando gasta al ritmo del mes", () => {
    const e = estadoPresupuestos([mv("2026-11-10", "egreso", 40000)], pres.slice(0, 1), cats, "2026-11", 15);
    expect(e[0].estado).toBe("ok");
    expect(equilibrioDinero(e)).toBe(100);
  });
  it("equilibrio baja en proporción si se pasa del ritmo", () => {
    const e = estadoPresupuestos([mv("2026-11-02", "egreso", 130000)], pres.slice(0, 1), cats, "2026-11", 15);
    expect(equilibrioDinero(e)).toBe(50); // tocaba 65.000, gastó 130.000
    expect(equilibrioDinero([])).toBeNull();
  });
  it("la frase de JARVIS dice lo más importante", () => {
    const e = estadoPresupuestos(movs, pres, cats, "2026-11", 17);
    expect(fraseDinero(e, totalesMes(movs, "2026-11"), "2026-11", 17)).toBe("Te pasaste del presupuesto de salidas: llevas 120%.");
    const e2 = estadoPresupuestos(movs.slice(0, 2), pres.slice(0, 1), cats, "2026-11", 17);
    expect(fraseDinero(e2, totalesMes(movs.slice(0, 2), "2026-11"), "2026-11", 17)).toBe("Vas en 85% del presupuesto de comida y quedan 13 días.");
  });
});

describe("series y comparación", () => {
  const movs = [mv("2026-09-01", "ingreso", 100), mv("2026-10-01", "ingreso", 300), mv("2026-10-02", "egreso", 100), mv("2026-11-01", "egreso", 50), mv("2026-11-20", "egreso", 70)];
  it("serie de meses y ahorro acumulado", () => {
    const s = serieMensual(movs, "2026-11", 3);
    expect(s.map((x) => x.mes)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(ahorroAcumulado(s).map((x) => x.valor)).toEqual([100, 300, 180]);
  });
  it("compara con el mes anterior hasta el mismo día", () => {
    const c = compararMes(movs, "2026-11", 17);
    expect(c.actual.egresos).toBe(50);
    expect(c.anterior.egresos).toBe(100);
    expect(c.difEgresos).toBe(-50);
  });
});

describe("gastos fijos", () => {
  const r = { id: "r1", nombre: "Plan celular", tipo: "egreso" as const, monto: 25000, categoriaId: "c-celular", dia: 31, desde: "2026-09", activo: true };
  it("crea los meses que faltan, sin duplicar y ajustando el día", () => {
    const n = pendientesRecurrentes([r], [], "2026-11-17");
    expect(n.map((m) => m.fecha)).toEqual(["2026-09-30", "2026-10-31"]); // noviembre 30 todavía no llega
    expect(pendientesRecurrentes([r], n, "2026-11-17")).toEqual([]);
    expect(pendientesRecurrentes([{ ...r, activo: false }], [], "2026-11-17")).toEqual([]);
    expect(pendientesRecurrentes([{ ...r, dia: 5 }], [], "2026-11-17").map((m) => m.fecha)).toEqual(["2026-09-05", "2026-10-05", "2026-11-05"]);
  });
});

describe("metas de ahorro", () => {
  it("a este ritmo llegas en X meses", () => {
    expect(mesesParaMeta(3000000, 1140000, 150000)).toBe(13);
    expect(mesesParaMeta(100, 100, 0)).toBe(0);
    expect(mesesParaMeta(100, 0, 0)).toBeNull();
  });
});
