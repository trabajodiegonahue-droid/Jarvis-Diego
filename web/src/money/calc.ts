// Todos los cálculos de dinero. Funciones puras (sin pantalla ni almacenamiento),
// para poder probarlas una por una: son números y no pueden fallar.
import type { Categoria, Movimiento, Presupuesto, Recurrente, Tipo } from "../data/types";

export const mesDe = (fecha: string) => fecha.slice(0, 7);

export function diasDelMes(mes: string): number {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function sumarMeses(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombreMes = (mes: string, corto = false) => {
  const n = MESES[Number(mes.slice(5, 7)) - 1] || "";
  return corto ? n.slice(0, 3) : n;
};

export interface Totales {
  ingresos: number;
  egresos: number;
  balance: number;
}

export function totalesMes(movs: Movimiento[], mes: string): Totales {
  let ingresos = 0;
  let egresos = 0;
  for (const m of movs) {
    if (mesDe(m.fecha) !== mes) continue;
    if (m.tipo === "ingreso") ingresos += m.monto;
    else egresos += m.monto;
  }
  return { ingresos, egresos, balance: ingresos - egresos };
}

export interface PorCategoria {
  categoriaId: string;
  nombre: string;
  total: number;
}

export function porCategoria(movs: Movimiento[], cats: Categoria[], mes: string, tipo: Tipo): PorCategoria[] {
  const acc = new Map<string, number>();
  for (const m of movs) if (m.tipo === tipo && mesDe(m.fecha) === mes) acc.set(m.categoriaId, (acc.get(m.categoriaId) || 0) + m.monto);
  return [...acc.entries()]
    .map(([categoriaId, total]) => ({ categoriaId, total, nombre: cats.find((c) => c.id === categoriaId)?.nombre || "Sin categoría" }))
    .sort((a, b) => b.total - a.total);
}

export type Estado = "ok" | "atencion" | "excedido";

export interface EstadoPresupuesto {
  categoriaId: string;
  nombre: string;
  monto: number; // presupuesto del mes
  gastado: number;
  pct: number; // gastado / presupuesto * 100
  esperado: number; // % del mes ya transcurrido
  estado: Estado;
}

// "dia" = día del mes de hoy si es el mes actual; para meses pasados, el último día.
export function estadoPresupuestos(movs: Movimiento[], presupuestos: Presupuesto[], cats: Categoria[], mes: string, dia: number): EstadoPresupuesto[] {
  const dias = diasDelMes(mes);
  const esperado = Math.min(100, (Math.max(1, Math.min(dia, dias)) / dias) * 100);
  const gastos = porCategoria(movs, cats, mes, "egreso");
  // Gasto variable (sin contar los fijos): un fijo ya pagado no es motivo de alerta.
  const variable = porCategoria(movs.filter((m) => !m.recurrenteId), cats, mes, "egreso");
  return presupuestos
    .filter((p) => p.monto > 0)
    .map((p) => {
      const gastado = gastos.find((g) => g.categoriaId === p.categoriaId)?.total || 0;
      const pc = (gastado / p.monto) * 100;
      // Excedido: pasó el 100%. Atención: va 15 puntos más rápido que el mes o pasó el 85%.
      const soloFijos = gastado > 0 && !variable.some((g) => g.categoriaId === p.categoriaId);
      const estado: Estado = pc > 100 ? "excedido" : soloFijos ? "ok" : pc >= 85 || pc - esperado >= 15 ? "atencion" : "ok";
      return { categoriaId: p.categoriaId, nombre: cats.find((c) => c.id === p.categoriaId)?.nombre || "Sin categoría", monto: p.monto, gastado, pct: pc, esperado, estado };
    })
    .sort((a, b) => b.pct - a.pct);
}

export function presupuestoTotal(estados: EstadoPresupuesto[]) {
  const monto = estados.reduce((a, e) => a + e.monto, 0);
  const gastado = estados.reduce((a, e) => a + e.gastado, 0);
  return { monto, gastado, pct: monto ? (gastado / monto) * 100 : 0 };
}

export interface PuntoMes extends Totales {
  mes: string;
}

export function serieMensual(movs: Movimiento[], hasta: string, n: number): PuntoMes[] {
  const out: PuntoMes[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const mes = sumarMeses(hasta, -i);
    out.push({ mes, ...totalesMes(movs, mes) });
  }
  return out;
}

// Ahorro acumulado: suma de los balances mes a mes.
export function ahorroAcumulado(serie: PuntoMes[]): { mes: string; valor: number }[] {
  let acc = 0;
  return serie.map((p) => ({ mes: p.mes, valor: (acc += p.balance) }));
}

export interface Comparacion {
  actual: Totales;
  anterior: Totales;
  difEgresos: number; // + gastaste más que el mes pasado
  difIngresos: number;
}

// Compara contra el mes anterior HASTA EL MISMO DÍA, para que sea justo.
export function compararMes(movs: Movimiento[], mes: string, dia: number): Comparacion {
  const prev = sumarMeses(mes, -1);
  const corte = (m: string) => movs.filter((x) => mesDe(x.fecha) === m && Number(x.fecha.slice(8, 10)) <= dia);
  const actual = totalesMes(corte(mes), mes);
  const anterior = totalesMes(corte(prev), prev);
  return { actual, anterior, difEgresos: actual.egresos - anterior.egresos, difIngresos: actual.ingresos - anterior.ingresos };
}

// Movimientos que los gastos fijos deberían haber creado hasta "hoy" y todavía no existen.
// El id es fijo (recurrente + mes), así nunca se duplican.
export function pendientesRecurrentes(recs: Recurrente[], movs: Movimiento[], hoy: string): Movimiento[] {
  const ids = new Set(movs.map((m) => m.id));
  const out: Movimiento[] = [];
  const mesHoy = mesDe(hoy);
  for (const r of recs) {
    if (!r.activo || !/^\d{4}-\d{2}$/.test(r.desde)) continue;
    for (let mes = r.desde, guard = 0; mes <= mesHoy && guard < 36; mes = sumarMeses(mes, 1), guard++) {
      const dia = Math.min(Math.max(1, r.dia), diasDelMes(mes));
      const fecha = `${mes}-${String(dia).padStart(2, "0")}`;
      if (fecha > hoy) continue;
      const id = `rec:${r.id}:${mes}`;
      if (ids.has(id)) continue;
      out.push({ id, tipo: r.tipo, monto: r.monto, categoriaId: r.categoriaId, fecha, nota: r.nombre, recurrenteId: r.id, creado: Date.now(), ...(r.demo ? { demo: true } : {}) });
    }
  }
  return out;
}

// "A este ritmo llegas en X meses"
export function mesesParaMeta(meta: number, actual: number, ahorroMensual: number): number | null {
  if (actual >= meta) return 0;
  if (ahorroMensual <= 0) return null;
  return Math.ceil((meta - actual) / ahorroMensual);
}

// Equilibrio del área dinero (0-100): compara lo gastado con lo que "tocaba" gastar
// a esta altura del mes según el presupuesto. Si vas igual o por debajo, 100.
// Si te pasaste, baja en proporción (presupuesto a la fecha / gastado).
export function equilibrioDinero(estados: EstadoPresupuesto[]): number | null {
  const { monto, gastado } = presupuestoTotal(estados);
  if (!monto) return null;
  const esperado = estados[0] ? (monto * estados[0].esperado) / 100 : monto;
  if (gastado <= esperado) return 100;
  return Math.max(0, Math.round((esperado / gastado) * 100));
}

// La frase de JARVIS para el inicio: lo más destacable, calculado aquí (no en Gemini).
export function fraseDinero(estados: EstadoPresupuesto[], tot: Totales, mes: string, dia: number): string | null {
  const quedan = diasDelMes(mes) - dia;
  const exc = estados.find((e) => e.estado === "excedido");
  if (exc) return `Te pasaste del presupuesto de ${exc.nombre.toLowerCase()}: llevas ${Math.round(exc.pct)}%.`;
  const ojo = estados.find((e) => e.estado === "atencion");
  if (ojo) return `Vas en ${Math.round(ojo.pct)}% del presupuesto de ${ojo.nombre.toLowerCase()} y quedan ${quedan} ${quedan === 1 ? "día" : "días"}.`;
  if (tot.balance < 0) return `Este mes vas gastando más de lo que entra. Ojo con eso.`;
  if (estados.length) return `Vas bien con el presupuesto: nada pasado de la raya.`;
  if (tot.ingresos || tot.egresos) return `Ponle presupuesto a tus gastos y te aviso cuando vayas rápido.`;
  return null;
}
