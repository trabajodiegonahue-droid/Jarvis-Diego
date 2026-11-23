// Cardio (trote, correr, bici, caminata, natación): kilómetros por semana, ritmo y récords. Funciones puras.
import { addDays, lunesDe } from "../core/dates";
import type { Entreno } from "../data/types";

export interface Salida {
  id: string;
  fecha: string;
  nombre: string;
  km?: number;
  seg?: number;
  kcal?: number;
  ritmo?: number; // segundos por km
}

export const esCardio = (e: Entreno) => !!(e.km || e.seg) || /trote|correr|bici|caminata|nataci|cardio/i.test(e.nombre);

export function salidas(entrenos: Entreno[]): Salida[] {
  return entrenos
    .filter(esCardio)
    .map((e) => ({ id: e.id, fecha: e.fecha, nombre: e.nombre, km: e.km, seg: e.seg, kcal: e.kcal, ...(e.km && e.seg && e.km >= 0.5 ? { ritmo: Math.round(e.seg / e.km) } : {}) }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// Kilómetros de las últimas n semanas (la actual al final).
export function kmPorSemana(ss: Salida[], hoy: string, n = 8): { etiqueta: string; valor: number }[] {
  const lunes = lunesDe(hoy);
  return Array.from({ length: n }, (_, i) => {
    const desde = addDays(lunes, -7 * (n - 1 - i));
    const hasta = addDays(desde, 6);
    const km = ss.filter((s) => s.fecha >= desde && s.fecha <= hasta).reduce((t, s) => t + (s.km || 0), 0);
    return { etiqueta: `${Number(desde.slice(8))}/${Number(desde.slice(5, 7))}`, valor: Math.round(km * 10) / 10 };
  });
}

export interface Records {
  masLarga?: Salida;
  mejorRitmo?: Salida;
  masCalorias?: Salida;
  kmMes: number;
  kmTotal: number;
  salidasMes: number;
}
export function records(ss: Salida[], hoy: string): Records {
  const mes = hoy.slice(0, 7);
  const delMes = ss.filter((s) => s.fecha.startsWith(mes));
  const max = <K extends keyof Salida>(k: K, menor = false) =>
    ss.filter((s) => typeof s[k] === "number" && (s[k] as number) > 0).sort((a, b) => (menor ? (a[k] as number) - (b[k] as number) : (b[k] as number) - (a[k] as number)))[0];
  return {
    masLarga: max("km"),
    mejorRitmo: max("ritmo", true),
    masCalorias: max("kcal"),
    kmMes: Math.round(delMes.reduce((t, s) => t + (s.km || 0), 0) * 10) / 10,
    kmTotal: Math.round(ss.reduce((t, s) => t + (s.km || 0), 0) * 10) / 10,
    salidasMes: delMes.length,
  };
}

// ¿Tu ritmo mejora? Promedio de las últimas 3 salidas con ritmo contra las 3 anteriores (negativo = más rápido).
export function tendenciaRitmo(ss: Salida[]): number | null {
  const r = ss.filter((s) => s.ritmo).map((s) => s.ritmo!);
  if (r.length < 4) return null;
  const prom = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const nuevas = r.slice(0, 3);
  const antes = r.slice(3, 6);
  return Math.round(prom(nuevas) - prom(antes));
}

export const mmss = (x: number) => (x >= 3600 ? `${Math.floor(x / 3600)}:${String(Math.floor((x % 3600) / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}` : `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`);
export const kmTxt = (k: number) => `${String(Math.round(k * 100) / 100).replace(".", ",")} km`;
