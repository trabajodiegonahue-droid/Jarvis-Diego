// Cálculos de Trabajo: horas de cada turno, del mes y de la semana, e ingresos asociados.
import { addDays, lunesDe, minutosEntre } from "../core/dates";
import type { Movimiento, Turno } from "../data/types";
import { sumarMeses } from "../money/calc";

export const horasTurno = (t: Turno) => (t.falte ? 0 : Math.max(0, minutosEntre(t.inicio, t.fin) - (t.pausaMin || 0)) / 60);

export function horasMes(turnos: Turno[], mes: string, hasta?: string): number {
  return turnos.filter((t) => t.fecha.startsWith(mes) && (!hasta || t.fecha <= hasta)).reduce((a, t) => a + horasTurno(t), 0);
}

export function horasSemana(turnos: Turno[], dia: string): number {
  const ini = lunesDe(dia);
  const fin = addDays(ini, 6);
  return turnos.filter((t) => t.fecha >= ini && t.fecha <= fin).reduce((a, t) => a + horasTurno(t), 0);
}

export function serieHoras(turnos: Turno[], hasta: string, n: number): { mes: string; horas: number }[] {
  const out: { mes: string; horas: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const mes = sumarMeses(hasta, -i);
    out.push({ mes, horas: horasMes(turnos, mes) });
  }
  return out;
}

// Ingreso estimado del mes por horas (si Diego puso su valor por hora). Es una estimación:
// el sueldo real se anota en Dinero.
export const sueldoEstimado = (horas: number, tarifaHora: number) => Math.round(horas * (tarifaHora || 0));

// Las propinas de un turno pasan a Dinero como un ingreso. El id es fijo: nunca se duplica.
export const idPropinas = (turnoId: string) => `turno:${turnoId}:propinas`;
export function movPropinas(t: Turno): Movimiento | null {
  if (!t.propinas || t.propinas <= 0) return null;
  return { id: idPropinas(t.id), tipo: "ingreso", monto: Math.round(t.propinas), categoriaId: "i-propinas", fecha: t.fecha, nota: "Propinas del turno", creado: Date.now(), ...(t.demo ? { demo: true } : {}) };
}

// Equilibrio de trabajo: turnos a los que fuiste / turnos planificados hasta hoy.
export function equilibrioTrabajo(turnos: Turno[], mes: string, hoy: string): number | null {
  const plan = turnos.filter((t) => t.fecha.startsWith(mes) && t.fecha <= hoy);
  if (!plan.length) return null;
  return Math.round((plan.filter((t) => !t.falte).length / plan.length) * 100);
}

export const turnoDeHoy = (turnos: Turno[], hoy: string) => turnos.filter((t) => t.fecha === hoy && !t.falte).sort((a, b) => a.inicio.localeCompare(b.inicio))[0] || null;
export const proximoTurno = (turnos: Turno[], hoy: string) => turnos.filter((t) => t.fecha > hoy && !t.falte).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicio.localeCompare(b.inicio))[0] || null;
