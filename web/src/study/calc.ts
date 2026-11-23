// Cálculos de Estudios: horas por semana, metas de horas, pruebas y resultados.
import { addDays, diffDays, dow, lunesDe } from "../core/dates";
import type { Evaluacion, Materia, Sesion, Tarea } from "../data/types";

export function horasEnSemana(sesiones: Sesion[], lunes: string, materiaId?: string): number {
  const fin = addDays(lunes, 6);
  return sesiones.filter((s) => s.fecha >= lunes && s.fecha <= fin && (!materiaId || s.materiaId === materiaId)).reduce((a, s) => a + s.minutos, 0) / 60;
}

export function serieSemanas(sesiones: Sesion[], hoy: string, n: number): { lunes: string; horas: number }[] {
  const l = lunesDe(hoy);
  return Array.from({ length: n }, (_, i) => {
    const lunes = addDays(l, -7 * (n - 1 - i));
    return { lunes, horas: horasEnSemana(sesiones, lunes) };
  });
}

export const metaSemanalTotal = (materias: Materia[]) => materias.reduce((a, m) => a + (m.metaHorasSemana || 0), 0);

// Equilibrio de estudios: horas de esta semana contra lo que tocaba hasta hoy (meta × días transcurridos / 7).
export function equilibrioEstudios(materias: Materia[], sesiones: Sesion[], hoy: string): number | null {
  const meta = metaSemanalTotal(materias);
  if (!meta) return null;
  const esperado = (meta * (dow(hoy) + 1)) / 7;
  const hechas = horasEnSemana(sesiones, lunesDe(hoy));
  return Math.min(100, Math.round((hechas / esperado) * 100));
}

export const tareasPendientes = (tareas: Tarea[], hoy: string) =>
  tareas.filter((t) => !t.hecho && (!t.fecha || t.fecha <= hoy)).sort((a, b) => (a.fecha || "9").localeCompare(b.fecha || "9"));

export const proximasEvaluaciones = (evs: Evaluacion[], hoy: string, dias = 14) =>
  evs.filter((e) => e.resultado == null && e.fecha >= hoy && diffDays(e.fecha, hoy) <= dias).sort((a, b) => a.fecha.localeCompare(b.fecha));

// ¿Llegó a la meta de la prueba? (en nota, puntaje y % más alto es mejor)
export const cumpleMeta = (e: Evaluacion) => (e.resultado == null || e.meta == null ? null : e.resultado >= e.meta);

export const formatoResultado = (e: Evaluacion, v = e.resultado) =>
  v == null ? "—" : e.escala === "nota" ? v.toFixed(1).replace(".", ",") : e.escala === "porcentaje" ? `${Math.round(v)}%` : String(Math.round(v));

// Valida según la escala: nota chilena 1,0 a 7,0; porcentaje 0 a 100; puntaje 0 a 10.000.
export function resultadoValido(escala: Evaluacion["escala"], v: number): boolean {
  if (!Number.isFinite(v)) return false;
  if (escala === "nota") return v >= 1 && v <= 7;
  if (escala === "porcentaje") return v >= 0 && v <= 100;
  return v >= 0 && v <= 10000;
}

export const parseDecimal = (s: string) => {
  const v = parseFloat(String(s).trim().replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};
