// Estadísticas de fútbol. Funciones puras, con pruebas.
import type { Partido } from "../data/types";
import { sumarMeses } from "../money/calc";

export const jugados = (ps: Partido[], temporada?: string) => ps.filter((p) => p.tipo === "partido" && p.fui && (!temporada || p.temporada === temporada));

export interface StatsTemporada {
  temporada: string;
  partidos: number;
  minutos: number;
  goles: number;
  asistencias: number;
  pases: number;
  nota: number | null; // promedio de calificación propia
  ganados: number;
  empatados: number;
  perdidos: number;
}

export function statsTemporada(ps: Partido[], temporada: string): StatsTemporada {
  const j = jugados(ps, temporada);
  const notas = j.map((p) => p.calificacion).filter((x): x is number => typeof x === "number");
  const res = j.filter((p) => p.golesFavor != null && p.golesContra != null);
  return {
    temporada,
    partidos: j.length,
    minutos: j.reduce((a, p) => a + (p.minutos || 0), 0),
    goles: j.reduce((a, p) => a + (p.goles || 0), 0),
    asistencias: j.reduce((a, p) => a + (p.asistencias || 0), 0),
    pases: j.reduce((a, p) => a + (p.pases || 0), 0),
    nota: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null,
    ganados: res.filter((p) => p.golesFavor! > p.golesContra!).length,
    empatados: res.filter((p) => p.golesFavor === p.golesContra).length,
    perdidos: res.filter((p) => p.golesFavor! < p.golesContra!).length,
  };
}

export const temporadas = (ps: Partido[]) => [...new Set(ps.map((p) => p.temporada))].sort();

export function porMes(ps: Partido[], hasta: string, n: number): { mes: string; minutos: number; goles: number; asistencias: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const mes = sumarMeses(hasta, -(n - 1 - i));
    const j = jugados(ps).filter((p) => p.fecha.startsWith(mes));
    return { mes, minutos: j.reduce((a, p) => a + (p.minutos || 0), 0), goles: j.reduce((a, p) => a + (p.goles || 0), 0), asistencias: j.reduce((a, p) => a + (p.asistencias || 0), 0) };
  });
}

export const serieNotas = (ps: Partido[], temporada: string) =>
  jugados(ps, temporada)
    .filter((p) => typeof p.calificacion === "number")
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((p) => ({ fecha: p.fecha, rival: p.rival || "", nota: p.calificacion! }));

export const proximoEvento = (ps: Partido[], hoy: string) => ps.filter((p) => p.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || "").localeCompare(b.hora || ""))[0] || null;

// Eventos que ya pasaron y no se han registrado (¿fuiste?, ¿cómo te fue?).
export const sinRegistrar = (ps: Partido[], hoy: string) => ps.filter((p) => p.fecha < hoy && p.fui == null);

// Equilibrio de fútbol: partidos y entrenamientos del mes a los que fuiste, contra los que había hasta hoy.
export function equilibrioFutbol(ps: Partido[], mes: string, hoy: string): number | null {
  const pasados = ps.filter((p) => p.fecha.startsWith(mes) && p.fecha <= hoy);
  if (!pasados.length) return null;
  return Math.round((pasados.filter((p) => p.fui).length / pasados.length) * 100);
}

export const resultado = (p: Partido) => (p.golesFavor == null || p.golesContra == null ? null : p.golesFavor > p.golesContra ? "Ganado" : p.golesFavor < p.golesContra ? "Perdido" : "Empate");
