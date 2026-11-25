// Números del bloque para los gráficos de Fútbol. Funciones puras, con pruebas.
import { addDays, lunesDe } from "../core/dates";
import type { Entreno, Peso, TestFisico } from "../data/types";
import { INICIO_BLOQUE, planDelDia, type DiaPartido, type TipoSesion } from "./bloque";

export type Filtro = "semana" | "4sem" | "bloque";
export function rango(f: Filtro, hoy: string, inicio = INICIO_BLOQUE): { desde: string; hasta: string } {
  const lunes = lunesDe(hoy);
  if (f === "semana") return { desde: lunes, hasta: addDays(lunes, 6) };
  if (f === "4sem") return { desde: addDays(lunes, -21), hasta: addDays(lunes, 6) };
  return { desde: lunesDe(inicio < hoy ? inicio : hoy), hasta: addDays(lunes, 6) };
}
export const dias = (desde: string, hasta: string) => {
  const out: string[] = [];
  for (let f = desde; f <= hasta; f = addDays(f, 1)) out.push(f);
  return out;
};
export const semanas = (desde: string, hasta: string) => {
  const out: string[] = [];
  for (let l = lunesDe(desde); l <= hasta; l = addDays(l, 7)) out.push(l);
  return out;
};
const etiqueta = (f: string) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

export interface Planificada {
  fecha: string;
  turno: "manana" | "tarde";
  tipo: TipoSesion;
  sesion: string;
}
export function planificadas(desde: string, hasta: string, porSemana: Record<string, DiaPartido>): Planificada[] {
  const out: Planificada[] = [];
  for (const f of dias(desde, hasta)) {
    const p = planDelDia(f, porSemana);
    if (p.manana.sesion) out.push({ fecha: f, turno: "manana", tipo: p.manana.tipo, sesion: p.manana.sesion });
    if (p.tarde.sesion) out.push({ fecha: f, turno: "tarde", tipo: p.tarde.tipo, sesion: p.tarde.sesion });
  }
  return out;
}
// ¿Esta sesión planificada se hizo? (un entreno de ese día con esa sesión, o del mismo tipo)
export const hecha = (p: Planificada, ents: Entreno[]) => ents.some((e) => e.fecha === p.fecha && (e.sesion === p.sesion || e.tipoSesion === p.tipo));

export function cumplimiento(ents: Entreno[], desde: string, hasta: string, porSemana: Record<string, DiaPartido>, hoy: string): { hechas: number; plan: number } {
  const pl = planificadas(desde, hasta < hoy ? hasta : hoy, porSemana);
  return { hechas: pl.filter((p) => hecha(p, ents)).length, plan: pl.length };
}

// Sesiones hechas por semana, por tipo, contra las planificadas.
export function sesionesPorSemana(ents: Entreno[], desde: string, hasta: string, porSemana: Record<string, DiaPartido>) {
  return semanas(desde, hasta).map((l) => {
    const pl = planificadas(l, addDays(l, 6), porSemana);
    const tipos: Partial<Record<TipoSesion, number>> = {};
    for (const p of pl) if (hecha(p, ents)) tipos[p.tipo] = (tipos[p.tipo] || 0) + 1;
    return { etiqueta: etiqueta(l), tipos, plan: pl.length };
  });
}

// Carga = minutos × esfuerzo (RPE), por semana.
export function cargaSemanal(ents: Entreno[], desde: string, hasta: string) {
  return semanas(desde, hasta).map((l) => ({
    etiqueta: etiqueta(l),
    valor: Math.round(ents.filter((e) => e.fecha >= l && e.fecha <= addDays(l, 6) && e.rpe).reduce((t, e) => t + ((e.seg || 0) / 60 || 60) * (e.rpe || 0), 0)),
  }));
}

export function rpeDiario(ents: Entreno[], hoy: string, n = 28) {
  return dias(addDays(hoy, -(n - 1)), hoy)
    .map((f) => {
      const r = ents.filter((e) => e.fecha === f && e.rpe).map((e) => e.rpe!);
      return r.length ? { etiqueta: etiqueta(f), valor: Math.max(...r) } : null;
    })
    .filter((x): x is { etiqueta: string; valor: number } => !!x);
}

// ---------- Tests ----------
export const TESTS: { k: keyof TestFisico; nombre: string; unidad: string; menosEsMejor?: boolean }[] = [
  { k: "sprint10", nombre: "Sprint 10 m", unidad: "s", menosEsMejor: true },
  { k: "sprint30", nombre: "Sprint 30 m", unidad: "s", menosEsMejor: true },
  { k: "salto", nombre: "Salto vertical", unidad: "cm" },
  { k: "t5105", nombre: "5-10-5", unidad: "s", menosEsMejor: true },
  { k: "paredDer", nombre: "Pared 30 s (derecha)", unidad: "pases" },
  { k: "paredIzq", nombre: "Pared 30 s (izquierda)", unidad: "pases" },
  { k: "dominadasMala", nombre: "Dominadas pierna mala", unidad: "toques" },
  { k: "diezPrimero", nombre: "10×10 primer sprint", unidad: "s", menosEsMejor: true },
  { k: "diezUltimo", nombre: "10×10 último sprint", unidad: "s", menosEsMejor: true },
];
export function serieTest(tests: TestFisico[], k: keyof TestFisico) {
  const t = TESTS.find((x) => x.k === k)!;
  const pts = [...tests].sort((a, b) => a.fecha.localeCompare(b.fecha)).filter((x) => typeof x[k] === "number").map((x) => ({ etiqueta: `Sem ${x.semana}`, valor: x[k] as number }));
  if (pts.length < 2) return { pts, cambio: null as number | null, mejor: null as boolean | null };
  const a = pts[0].valor;
  const b = pts[pts.length - 1].valor;
  const cambio = a ? Math.round(((b - a) / a) * 1000) / 10 : 0;
  return { pts, cambio, mejor: cambio === 0 ? null : t.menosEsMejor ? cambio < 0 : cambio > 0 };
}

// ---------- Fuerza, nórdicos y peso ----------
export function fuerzaSerie(ents: Entreno[], ejId: string, desde: string, hasta: string) {
  const pts = [...ents]
    .filter((e) => e.fecha >= desde && e.fecha <= hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((e) => {
      const it = e.items.find((i) => i.ejId === ejId);
      if (!it?.series.length) return null;
      return { etiqueta: etiqueta(e.fecha), valor: Math.max(...it.series.map((s) => (s.kg || 1) * s.reps)) };
    })
    .filter((x): x is { etiqueta: string; valor: number } => !!x);
  const record = pts.length ? Math.max(...pts.map((p) => p.valor)) : 0;
  return { pts, record };
}

export function seriesPorSemana(ents: Entreno[], ids: string[], desde: string, hasta: string) {
  return semanas(desde, hasta).map((l) => {
    const out: Record<string, number> = {};
    for (const id of ids) out[id] = ents.filter((e) => e.fecha >= l && e.fecha <= addDays(l, 6)).reduce((t, e) => t + (e.items.find((i) => i.ejId === id)?.series.length || 0), 0);
    return { etiqueta: etiqueta(l), ...out };
  });
}

export function pesoSemanal(pesos: Peso[], desde: string, hasta: string) {
  return semanas(desde, hasta)
    .map((l) => {
      const p = pesos.filter((x) => x.id >= l && x.id <= addDays(l, 6)).sort((a, b) => b.id.localeCompare(a.id))[0];
      return p ? { etiqueta: etiqueta(l), valor: p.kg } : null;
    })
    .filter((x): x is { etiqueta: string; valor: number } => !!x);
}

// ---------- Días entrenados y racha ----------
export function diasEntrenados(ents: Entreno[], desde: string, hasta: string): { fecha: string; n: number }[] {
  return dias(lunesDe(desde), hasta).map((f) => ({ fecha: f, n: ents.filter((e) => e.fecha === f).length }));
}

// Días seguidos cumpliendo lo planificado (los días de descanso o partido cuentan si no había sesión). Hoy cuenta solo si ya cumpliste.
export function racha(ents: Entreno[], hoy: string, porSemana: Record<string, DiaPartido>, inicio = INICIO_BLOQUE): number {
  let n = 0;
  for (let f = hoy; f >= inicio; f = addDays(f, -1)) {
    const pl = planificadas(f, f, porSemana);
    const ok = pl.every((p) => hecha(p, ents));
    if (f === hoy && !ok) continue;
    if (!ok) break;
    if (pl.length || ents.some((e) => e.fecha === f)) n++;
    else n++;
  }
  return n;
}
