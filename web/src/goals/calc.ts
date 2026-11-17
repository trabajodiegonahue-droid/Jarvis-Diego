// Cálculos de Metas: avance, avance contra el tiempo, qué falta esta semana y revisión del mes.
import { addDays, diffDays, lunesDe } from "../core/dates";
import type { Aporte, Datos, Meta } from "../data/types";
import { horasMes, horasTurno } from "../work/calc";

export type EstadoMeta = "cumplida" | "adelantada" | "a-tiempo" | "atrasada" | "vencida";

export interface Avance {
  actual: number; // en la unidad de la meta (pesos, horas, veces, pasos hechos)
  objetivo: number; // total a lograr (en hábito: veces por semana × semanas)
  pct: number; // 0 a 100+
  pctTiempo: number; // % del plazo que ya pasó
  estado: EstadoMeta;
  quedanDias: number;
}

const aportesDe = (aportes: Aporte[], metaId: string, hasta?: string) => aportes.filter((a) => a.metaId === metaId && (!hasta || a.fecha <= hasta));

// Lo que cuenta para la meta, sacado del módulo que corresponda.
export function valorActual(m: Meta, d: Datos, hasta: string): number {
  const manual = aportesDe(d.aportes, m.id, hasta).reduce((a, x) => a + x.valor, 0);
  const desde = (f: string) => f >= m.inicio && f <= hasta;
  switch (m.fuente) {
    case "ahorro": {
      // Lo que te sobró desde que empezaste la meta (ingresos menos egresos), más lo que ya tenías.
      const bal = d.movimientos.filter((x) => desde(x.fecha)).reduce((a, x) => a + (x.tipo === "ingreso" ? x.monto : -x.monto), 0);
      return Math.max(0, bal) + manual;
    }
    case "horas-estudio":
      return d.sesiones.filter((s) => desde(s.fecha)).reduce((a, s) => a + s.minutos, 0) / 60 + manual;
    case "horas-trabajo":
      return d.turnos.filter((t) => desde(t.fecha)).reduce((a, t) => a + horasTurno(t), 0) + manual;
    default:
      if (m.tipo === "pasos") return (m.pasos || []).filter((p) => p.hecho).length;
      return manual;
  }
}

export function semanasDe(m: Meta) {
  return Math.max(1, Math.ceil((diffDays(m.fechaLimite, m.inicio) + 1) / 7));
}

export function objetivoTotal(m: Meta): number {
  if (m.tipo === "pasos") return (m.pasos || []).length;
  if (m.tipo === "habito") return m.objetivo * semanasDe(m);
  return m.objetivo;
}

export function avance(m: Meta, d: Datos, hoy: string): Avance {
  const actual = valorActual(m, d, hoy);
  const objetivo = objetivoTotal(m);
  const pct = objetivo > 0 ? (actual / objetivo) * 100 : 0;
  const total = Math.max(1, diffDays(m.fechaLimite, m.inicio));
  const pctTiempo = Math.max(0, Math.min(100, (diffDays(hoy, m.inicio) / total) * 100));
  const quedanDias = diffDays(m.fechaLimite, hoy);
  let estado: EstadoMeta;
  if (objetivo > 0 && pct >= 100) estado = "cumplida";
  else if (quedanDias < 0) estado = "vencida";
  else if (pct >= pctTiempo + 5) estado = "adelantada";
  else if (pct >= pctTiempo - 10) estado = "a-tiempo";
  else estado = "atrasada";
  return { actual, objetivo, pct, pctTiempo, estado, quedanDias };
}

// Qué te falta esta semana para ir al día con la meta.
export function faltaSemana(m: Meta, d: Datos, hoy: string): { valor: number; texto: string } | null {
  const a = avance(m, d, hoy);
  if (a.estado === "cumplida" || a.estado === "vencida") return null;
  if (m.tipo === "pasos") {
    const p = (m.pasos || []).find((x) => !x.hecho);
    return p ? { valor: 1, texto: `Siguiente paso: ${p.texto}` } : null;
  }
  if (m.tipo === "habito") {
    const lunes = lunesDe(hoy);
    const hechas = aportesDe(d.aportes, m.id).filter((x) => x.fecha >= lunes && x.fecha <= addDays(lunes, 6)).reduce((s, x) => s + x.valor, 0);
    const falta = Math.max(0, m.objetivo - hechas);
    return { valor: falta, texto: falta ? `Te faltan ${falta} ${falta === 1 ? "vez" : "veces"} esta semana` : "Esta semana ya cumpliste" };
  }
  const semanas = Math.max(1, Math.ceil((a.quedanDias + 1) / 7));
  const falta = Math.max(0, a.objetivo - a.actual) / semanas;
  return { valor: falta, texto: "" };
}

// Ritmo de las últimas 4 semanas, para "a este ritmo llegas el…".
export function ritmoSemanal(m: Meta, d: Datos, hoy: string): number {
  const hace = addDays(hoy, -27); // 28 días contando hoy
  const ini = hace < m.inicio ? m.inicio : hace;
  const dias = Math.max(7, diffDays(hoy, ini) + 1);
  const delta = valorActual(m, d, hoy) - valorActual(m, d, addDays(ini, -1));
  return (delta / dias) * 7;
}

export function fechaEstimada(m: Meta, d: Datos, hoy: string): string | null {
  const a = avance(m, d, hoy);
  if (a.estado === "cumplida") return hoy;
  const r = ritmoSemanal(m, d, hoy);
  if (r <= 0 || m.tipo === "habito" || m.tipo === "pasos") return null;
  const semanas = Math.ceil((a.objetivo - a.actual) / r);
  return addDays(hoy, semanas * 7);
}

// Equilibrio de metas: promedio de qué tan al día va cada meta (avance contra tiempo), tope 100.
export function equilibrioMetas(metas: Meta[], d: Datos, hoy: string): number | null {
  const activas = metas.filter((m) => !m.archivada && m.inicio <= hoy);
  if (!activas.length) return null;
  const vals = activas.map((m) => {
    const a = avance(m, d, hoy);
    if (a.estado === "cumplida") return 100;
    if (a.pctTiempo <= 0) return 100;
    return Math.min(100, (a.pct / a.pctTiempo) * 100);
  });
  return Math.round(vals.reduce((x, y) => x + y, 0) / vals.length);
}

// Las metas del inicio: las marcadas como principales; si no hay, las 3 más cercanas a vencer.
export function metasPrincipales(metas: Meta[], hoy: string): Meta[] {
  const activas = metas.filter((m) => !m.archivada);
  const marcadas = activas.filter((m) => m.principal);
  const base = marcadas.length ? marcadas : activas.filter((m) => m.fechaLimite >= hoy);
  return [...base].sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite)).slice(0, 3);
}

export interface FilaRevision {
  meta: Meta;
  ganado: number; // avance logrado durante el mes
  estado: EstadoMeta;
}

// Revisión mensual: cuánto avanzó cada meta en el mes y cómo terminó.
export function revisionMes(metas: Meta[], d: Datos, mes: string): FilaRevision[] {
  const [y, mo] = mes.split("-").map(Number);
  const fin = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const ini = `${mes}-01`;
  return metas
    .filter((m) => m.inicio <= fin && m.fechaLimite >= ini)
    .map((m) => ({ meta: m, ganado: valorActual(m, d, fin) - valorActual(m, d, addDays(ini, -1)), estado: avance(m, d, fin).estado }));
}

export const horasTrabajoMes = (d: Datos, mes: string) => horasMes(d.turnos, mes);
