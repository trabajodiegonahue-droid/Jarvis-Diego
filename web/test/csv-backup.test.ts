import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { mapear, parseCSV, parseFecha, parseMontoCartola } from "../src/money/csv";
import { applyExtra, exportCSV, exportJSON, readJSON } from "../src/data/backup";
import { memoryKV } from "../src/core/storage";
import { resetDB } from "../src/data/db";
import { AppStore } from "../src/data/store";
import { datosEjemplo } from "../src/data/demo";
import { checkPin, hasPin, setPin } from "../src/core/pin";

describe("CSV de la cartola", () => {
  it("lee separadores, comillas y montos", () => {
    const rows = parseCSV('Fecha;Descripción;Monto\r\n15/11/2026;"Supermercado ""Lider""";-12.345\r\n16/11/2026;Transferencia;40.000\r\n');
    expect(rows[1]).toEqual(["15/11/2026", 'Supermercado "Lider"', "-12.345"]);
    expect(parseFecha("15/11/2026")).toBe("2026-11-15");
    expect(parseFecha("2026-11-15")).toBe("2026-11-15");
    expect(parseFecha("15/13/2026")).toBeNull();
    expect(parseMontoCartola("(12.345)")).toBe(-12345);
    const r = mapear(rows, { fecha: 0, descripcion: 1, monto: 2, saltarPrimera: true });
    expect(r.ok).toEqual([
      { fecha: "2026-11-15", descripcion: 'Supermercado "Lider"', tipo: "egreso", monto: 12345 },
      { fecha: "2026-11-16", descripcion: "Transferencia", tipo: "ingreso", monto: 40000 },
    ]);
  });
  it("cargo y abono en columnas separadas", () => {
    const rows = parseCSV("fecha,detalle,cargo,abono\n01-11-2026,Micro,700,\n02-11-2026,Sueldo,,420.000\n03-11-2026,raro,,\n");
    const r = mapear(rows, { fecha: 0, descripcion: 1, cargo: 2, abono: 3, saltarPrimera: true });
    expect(r.ok.map((x) => [x.tipo, x.monto])).toEqual([["egreso", 700], ["ingreso", 420000]]);
    expect(r.malas).toBe(1);
  });
});

describe("almacenamiento y respaldo", () => {
  beforeEach(async () => {
    resetDB();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase("vida");
      r.onsuccess = r.onerror = () => res();
    });
  });
  it("guarda, carga, borra con deshacer y crea las categorías base", async () => {
    const s = new AppStore();
    await s.load();
    expect(s.data.categorias.length).toBe(12);
    await s.put("movimientos", { id: "m1", tipo: "egreso", monto: 5000, categoriaId: "c-comida", fecha: "2026-11-17", creado: 1 });
    const undo = await s.remove("movimientos", "m1");
    expect(s.data.movimientos).toEqual([]);
    await undo();
    resetDB();
    const s2 = new AppStore();
    await s2.load();
    expect(s2.data.movimientos.map((m) => m.id)).toEqual(["m1"]);
  });
  it("los datos de ejemplo se borran con un toque", async () => {
    const s = new AppStore();
    await s.load();
    const d = datosEjemplo("2026-11-17");
    await s.put("movimientos", ...d.movimientos!);
    await s.put("presupuestos", ...d.presupuestos!);
    await s.put("movimientos", { id: "real", tipo: "egreso", monto: 1, categoriaId: "c-comida", fecha: "2026-11-17", creado: 1 });
    expect(s.hasDemo()).toBe(true);
    expect(s.data.movimientos.every((m) => m.fecha <= "2026-11-17")).toBe(true);
    await s.removeDemo();
    expect(s.hasDemo()).toBe(false);
    expect(s.data.movimientos.map((m) => m.id)).toEqual(["real"]);
  });
  it("respaldo JSON sin claves y restauración", async () => {
    const s = new AppStore();
    await s.load();
    await s.put("movimientos", { id: "m1", tipo: "ingreso", monto: 40000, categoriaId: "i-propinas", fecha: "2026-11-17", creado: 1 });
    const kv = memoryKV();
    kv.set("settings", { apiKey: "AIzaSECRETA", workerToken: "tok", rate: 1.1 });
    kv.set("routine", [{ id: "t", title: "Gym", time: "08:00", days: [0], done: [] }]);
    const json = exportJSON(s.data, kv);
    expect(json).not.toMatch(/AIzaSECRETA|"tok"/);
    const r = readJSON(json);
    expect(r.datos.movimientos[0].monto).toBe(40000);
    const kv2 = memoryKV();
    applyExtra(kv2, r.extra);
    expect(kv2.get<any>("settings", {}).rate).toBe(1.1);
    expect(kv2.get<any[]>("routine", []).length).toBe(1);
    expect(() => readJSON('{"app":"otra"}')).toThrow(/no es un respaldo/);
    expect(() => readJSON('{"app":"vida","datos":{"movimientos":[{"id":"x","monto":1.5,"fecha":"2026-11-17"}]}}')).toThrow(/dañado/);
    expect(exportCSV(s.data)).toMatch(/2026-11-17;ingreso;Propinas;40000/);
  });
});

describe("PIN", () => {
  it("guarda solo un resumen y lo comprueba", async () => {
    const kv = memoryKV();
    expect(hasPin(kv)).toBe(false);
    await setPin(kv, "1234");
    expect(JSON.stringify(kv.get("pin", {}))).not.toMatch(/1234"/);
    expect(await checkPin(kv, "1234")).toBe(true);
    expect(await checkPin(kv, "4321")).toBe(false);
    await expect(setPin(kv, "12")).rejects.toThrow();
  });
});
