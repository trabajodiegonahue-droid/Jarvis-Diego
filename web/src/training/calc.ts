// Entrenamiento: generador de rutinas, progresión, récords, volumen por músculo y carga del día.
// Funciones puras, con pruebas.
import { addDays, dow, lunesDe } from "../core/dates";
import type { Chequeo, Entreno, ItemPlan, Objetivo, Partido, Plan, SesionPlan } from "../data/types";
import { EJERCICIOS, ejercicio, type Ejercicio, type Equipo, type Musculo } from "./ejercicios";

// ---------- Parámetros por objetivo ----------
// Fuerza: pocas repeticiones pesadas y descanso largo. Masa: 8–12 repeticiones cerca del fallo
// (10 a 20 series por músculo a la semana). Fútbol: fuerza + potencia + prevención.
const PARAMS: Record<Objetivo, { series: number; repsMin: number; repsMax: number; descanso: number }> = {
  fuerza: { series: 4, repsMin: 4, repsMax: 6, descanso: 150 },
  masa: { series: 3, repsMin: 8, repsMax: 12, descanso: 90 },
  futbol: { series: 3, repsMin: 5, repsMax: 8, descanso: 120 },
};

const NOMBRES_DIA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export interface ParamsRutina {
  objetivo: Objetivo;
  dias: number[]; // días disponibles (0 = lunes)
  minutos: number; // por sesión
  equipo: Equipo[];
  nivel: 1 | 2 | 3;
  diasPartido?: number[]; // días de partido o de entrenamiento con el equipo
}

// Plantillas: qué tipo de ejercicio va en cada lugar de la sesión, en orden de prioridad.
type Slot = { zona?: Ejercicio["zona"]; tipo?: Ejercicio["tipo"]; principal?: Musculo[] };
const S = {
  piernaQ: { tipo: "fuerza", principal: ["cuadriceps"] } as Slot,
  piernaH: { tipo: "fuerza", principal: ["isquiotibiales", "gluteos"] } as Slot,
  empuje: { tipo: "fuerza", principal: ["pectoral", "hombros"] } as Slot,
  tiron: { tipo: "fuerza", principal: ["dorsal", "espalda-alta"] } as Slot,
  potencia: { tipo: "potencia" } as Slot,
  prevencion: { tipo: "prevencion" } as Slot,
  core: { tipo: "core" } as Slot,
  acond: { tipo: "acondicionamiento" } as Slot,
  brazos: { tipo: "fuerza", principal: ["biceps", "triceps"] } as Slot,
  gemelo: { tipo: "fuerza", principal: ["gemelos"] } as Slot,
};

type Plantilla = { nombre: string; slots: Slot[]; pierna: boolean };
const FULL_A: Plantilla = { nombre: "Cuerpo completo A", slots: [S.piernaQ, S.empuje, S.tiron, S.piernaH, S.core, S.brazos], pierna: true };
const FULL_B: Plantilla = { nombre: "Cuerpo completo B", slots: [S.piernaH, S.tiron, S.empuje, S.piernaQ, S.core, S.gemelo], pierna: true };
const INFERIOR: Plantilla = { nombre: "Tren inferior", slots: [S.piernaQ, S.piernaH, S.piernaQ, S.gemelo, S.core], pierna: true };
const SUPERIOR: Plantilla = { nombre: "Tren superior", slots: [S.empuje, S.tiron, S.empuje, S.tiron, S.brazos, S.core], pierna: false };
const FUT_FUERZA_A: Plantilla = { nombre: "Fuerza y potencia A", slots: [S.potencia, S.piernaQ, S.tiron, S.piernaH, S.prevencion, S.core], pierna: true };
const FUT_FUERZA_B: Plantilla = { nombre: "Fuerza y potencia B", slots: [S.potencia, S.piernaH, S.empuje, S.piernaQ, S.prevencion, S.core], pierna: true };
const FUT_ACOND: Plantilla = { nombre: "Resistencia y velocidad", slots: [S.potencia, S.acond, S.prevencion, S.core], pierna: false };
const FUT_SUPERIOR: Plantilla = { nombre: "Tren superior y core", slots: [S.empuje, S.tiron, S.core, S.prevencion, S.brazos], pierna: false };

function plantillas(obj: Objetivo, n: number): Plantilla[] {
  if (obj === "futbol") {
    const base = [FUT_FUERZA_A, FUT_ACOND, FUT_FUERZA_B, FUT_SUPERIOR, FUT_ACOND, FUT_FUERZA_A];
    return n === 1 ? [FUT_FUERZA_A] : base.slice(0, n);
  }
  if (n <= 3) return [FULL_A, FULL_B, FULL_A].slice(0, n);
  return [INFERIOR, SUPERIOR, INFERIOR, SUPERIOR, FULL_A, FULL_B].slice(0, n);
}

const tieneEquipo = (e: Ejercicio, eq: Equipo[]) => e.equipo.some((x) => x === "cuerpo" || x === "cajon" || eq.includes(x));

// Elige el ejercicio para un lugar de la sesión según equipo y nivel, sin repetir en la misma sesión.
function elegir(slot: Slot, p: ParamsRutina, usados: Set<string>, semana: Map<string, number>): Ejercicio | null {
  const cands = EJERCICIOS.filter(
    (e) => !usados.has(e.id) && tieneEquipo(e, p.equipo) && (!slot.tipo || e.tipo === slot.tipo) && (!slot.principal || slot.principal.includes(e.principal)) && e.nivel <= p.nivel,
  );
  if (!cands.length) return null;
  // Prefiere el nivel más cercano al de Diego y lo que menos se ha repetido en la semana.
  cands.sort((a, b) => (semana.get(a.id) || 0) - (semana.get(b.id) || 0) || Math.abs(a.nivel - p.nivel) - Math.abs(b.nivel - p.nivel));
  return cands[0];
}

export function itemPara(e: Ejercicio, obj: Objetivo, nivel: number): ItemPlan {
  const base = PARAMS[obj];
  const series = nivel === 1 ? Math.max(2, base.series - 1) : base.series;
  if (e.tipo === "potencia") return { ejId: e.id, series: 3, repsMin: 3, repsMax: 5, descanso: 90 };
  if (e.tipo === "prevencion") return e.porTiempo ? { ejId: e.id, series: 2, repsMin: 20, repsMax: 40, descanso: 45 } : { ejId: e.id, series: 2, repsMin: 3, repsMax: 6, descanso: 90 };
  if (e.tipo === "acondicionamiento") return e.id === "4x4" ? { ejId: e.id, series: 4, repsMin: 240, repsMax: 240, descanso: 180 } : { ejId: e.id, series: 6, repsMin: 1, repsMax: 1, descanso: 25 };
  if (e.porTiempo || e.tipo === "core") return e.porTiempo ? { ejId: e.id, series: 3, repsMin: 30, repsMax: 45, descanso: 45 } : { ejId: e.id, series: 3, repsMin: 8, repsMax: 12, descanso: 45 };
  return { ejId: e.id, series, repsMin: base.repsMin, repsMax: base.repsMax, descanso: base.descanso };
}

// Minutos que toma un ejercicio: cada serie (unos 45 s de trabajo o el tiempo indicado) más el descanso.
export function minutosItem(it: ItemPlan, porTiempo = false): number {
  const trabajo = porTiempo ? it.repsMax : 45;
  return (it.series * (trabajo + it.descanso)) / 60;
}

const CALENTAR_MIN = 10;
const CALMA_MIN = 5;

export function generarRutina(p: ParamsRutina): SesionPlan[] {
  // Máximo 6 días: siempre queda al menos uno de descanso.
  const dias = [...new Set(p.dias)].filter((d) => d >= 0 && d <= 6).sort().slice(0, 6);
  if (!dias.length) return [];
  const pls = plantillas(p.objetivo, dias.length);
  const partido = new Set(p.diasPartido || []);
  // Las sesiones con pierna pesada no van el día antes de un partido: se cambian por las de sin pierna.
  const orden = [...pls];
  dias.forEach((d, i) => {
    const manana = (d + 1) % 7;
    if (partido.has(manana) && orden[i].pierna) {
      const j = orden.findIndex((x, k) => k > i && !x.pierna);
      if (j > 0) [orden[i], orden[j]] = [orden[j], orden[i]];
    }
  });
  const semana = new Map<string, number>();
  const presupuesto = Math.max(15, p.minutos - CALENTAR_MIN - CALMA_MIN);
  return dias.map((d, i) => {
    const pl = orden[i];
    const usados = new Set<string>();
    const items: ItemPlan[] = [];
    let min = 0;
    const pesadoMañana = partido.has((d + 1) % 7);
    for (const slot of pl.slots) {
      const e = elegir(slot, p, usados, semana);
      if (!e) continue;
      if (pesadoMañana && e.pesado) continue;
      const it = itemPara(e, p.objetivo, p.nivel);
      // Si no cabe en el tiempo, se achican las series (mínimo 2); si igual no cabe, se salta.
      while (min + minutosItem(it, !!e.porTiempo) > presupuesto && it.series > 2) it.series--;
      const m = minutosItem(it, !!e.porTiempo);
      if (items.length >= 1 && min + m > presupuesto) continue;
      items.push(it);
      usados.add(e.id);
      semana.set(e.id, (semana.get(e.id) || 0) + 1);
      min += m;
    }
    return { id: `s${d}`, dia: d, nombre: `${NOMBRES_DIA[d]}: ${pesadoMañana && pl.pierna ? pl.nombre + " (sin pierna pesada: mañana juegas)" : pl.nombre}`, items, minutos: Math.round(min + CALENTAR_MIN + CALMA_MIN) };
  });
}

// ---------- Volumen semanal por músculo ----------
// Serie del músculo principal = 1; secundario alto = 0,5; medio = 0,25; bajo = 0.
export function volumenPorMusculo(entrenos: Entreno[], lunes: string): Partial<Record<Musculo, number>> {
  const fin = addDays(lunes, 6);
  const out: Partial<Record<Musculo, number>> = {};
  for (const en of entrenos) {
    if (en.fecha < lunes || en.fecha > fin) continue;
    for (const it of en.items) {
      const e = ejercicio(it.ejId);
      if (!e) continue;
      const n = it.series.length;
      out[e.principal] = (out[e.principal] || 0) + n;
      for (const s of e.secundarios) {
        const f = s.nivel === "alta" ? 0.5 : s.nivel === "media" ? 0.25 : 0;
        if (f) out[s.m] = (out[s.m] || 0) + n * f;
      }
    }
  }
  return out;
}

// ---------- Récords y progresión ----------
export const e1rm = (kg: number, reps: number) => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0); // fórmula de Epley

export interface Marca {
  maxKg?: { kg: number; reps: number; fecha: string };
  maxReps?: { reps: number; kg?: number; fecha: string };
  mejor1rm?: number;
}

export function records(entrenos: Entreno[], ejId: string): Marca {
  const r: Marca = {};
  for (const en of [...entrenos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    for (const it of en.items) {
      if (it.ejId !== ejId) continue;
      for (const s of it.series) {
        if (s.kg && (!r.maxKg || s.kg > r.maxKg.kg || (s.kg === r.maxKg.kg && s.reps > r.maxKg.reps))) r.maxKg = { kg: s.kg, reps: s.reps, fecha: en.fecha };
        if (!r.maxReps || s.reps > r.maxReps.reps) r.maxReps = { reps: s.reps, kg: s.kg, fecha: en.fecha };
        const x = e1rm(s.kg || 0, s.reps);
        if (x > (r.mejor1rm || 0)) r.mejor1rm = Math.round(x * 10) / 10;
      }
    }
  }
  return r;
}

// ¿Qué récords nuevos trae este entreno comparado con todo lo anterior?
export function recordsNuevos(anteriores: Entreno[], nuevo: Entreno): string[] {
  const out: string[] = [];
  for (const it of nuevo.items) {
    const antes = records(anteriores, it.ejId);
    const ahora = records([...anteriores, nuevo], it.ejId);
    const nombre = ejercicio(it.ejId)?.nombre || it.ejId;
    if (ahora.maxKg && (!antes.maxKg || ahora.maxKg.kg > antes.maxKg.kg)) out.push(`${nombre}: ${ahora.maxKg.kg} kg`);
    else if (ahora.maxReps && antes.maxReps && ahora.maxReps.reps > antes.maxReps.reps) out.push(`${nombre}: ${ahora.maxReps.reps} ${ejercicio(it.ejId)?.porTiempo ? "segundos" : "repeticiones"}`);
  }
  return out;
}

export interface Sugerencia {
  reps: number;
  kg?: number;
  texto: string;
}

// Progresión doble: si en la sesión anterior todas las series llegaron al tope del rango, sube el peso
// (o pasa a una variante más difícil si es con el peso del cuerpo); si no, suma una repetición.
export function sugerencia(entrenos: Entreno[], item: ItemPlan, gimnasio: boolean): Sugerencia {
  const e = ejercicio(item.ejId);
  const prev = [...entrenos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((en) => en.items.find((x) => x.ejId === item.ejId)).find((x) => x && x.series.length);
  if (!prev) return { reps: item.repsMin, texto: e?.porTiempo ? `Primera vez: ${item.repsMin} segundos` : `Primera vez: elige un peso con el que llegues a ${item.repsMin}–${item.repsMax} con buena técnica` };
  const series = prev.series;
  const kg = Math.max(0, ...series.map((s) => s.kg || 0));
  const topes = series.length >= item.series && series.every((s) => s.reps >= item.repsMax);
  if (topes) {
    if (kg > 0) {
      const salto = gimnasio ? 2.5 : 2;
      return { reps: item.repsMin, kg: kg + salto, texto: `Subes de peso: ${kg + salto} kg, desde ${item.repsMin} repeticiones` };
    }
    const dif = e?.dificil ? ejercicio(e.dificil) : null;
    return { reps: item.repsMax, texto: dif ? `Llegaste al tope: prueba ${dif.nombre.toLowerCase()} o súmale peso` : "Llegaste al tope: baja más lento (3 s) o súmale peso" };
  }
  const mejor = Math.max(...series.map((s) => s.reps));
  const meta = Math.min(item.repsMax, Math.max(item.repsMin, mejor + 1));
  return { reps: meta, kg: kg || undefined, texto: `Meta: ${meta}${e?.porTiempo ? " s" : " repeticiones"}${kg ? ` con ${kg} kg` : ""} (1 más que la vez pasada)` };
}

// ---------- Carga del día (cómo me siento + partido cercano) ----------
export type NivelCarga = "normal" | "suave" | "muy-suave" | "activacion" | "parar";

export interface Carga {
  nivel: NivelCarga;
  factor: number; // multiplica las series
  motivo: string;
  sinPierna?: boolean;
}

export function proximoImportante(partidos: Partido[], hoy: string): Partido | null {
  return partidos.filter((p) => p.importante && p.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0] || null;
}

export function cargaDelDia(ch: Chequeo | undefined, partidos: Partido[], hoy: string, historial: Chequeo[] = []): Carga {
  if (ch?.agudo || (ch && ch.dolor >= 7)) return { nivel: "parar", factor: 0, motivo: "Con dolor agudo o fuerte no se entrena esa zona. Si no se va en 2 o 3 días, ve a un kinesiólogo o a un médico. JARVIS no es médico." };
  const dolorSeguido = historial.filter((c) => c.id < hoy && c.id >= addDays(hoy, -3) && c.dolor >= 4).length >= 2 && (ch?.dolor || 0) >= 4;
  if (dolorSeguido) return { nivel: "suave", factor: 0.5, motivo: "Llevas varios días con dolor: hoy suave y sin la zona que duele. Si sigue, ve a un kinesiólogo." };
  const prox = proximoImportante(partidos, hoy);
  const dias = prox ? Math.round((Date.parse(prox.fecha) - Date.parse(hoy)) / 864e5) : 99;
  if (dias === 0) return { nivel: "activacion", factor: 0, motivo: "Hoy juegas: nada de gimnasio, solo el calentamiento del partido.", sinPierna: true };
  if (dias === 1) return { nivel: "activacion", factor: 0.3, motivo: "Mañana tienes partido importante: solo activación, sin pierna pesada ni fallo.", sinPierna: true };
  const sueno = ch?.sueno ?? 8;
  const cans = ch?.cansancio ?? 2;
  if (cans >= 5 || sueno < 5) return { nivel: "muy-suave", factor: 0.5, motivo: "Estás reventado o dormiste muy poco: la mitad de las series y sin llegar al fallo." };
  if (dias === 2) return { nivel: "suave", factor: 0.7, motivo: "Partido importante en 2 días: baja un poco la carga y nada al fallo.", sinPierna: false };
  if ((ch?.dolor || 0) >= 4) return { nivel: "suave", factor: 0.6, motivo: "Con algo de dolor: menos series y evita la zona que duele." };
  if (cans >= 4 || sueno < 6.5) return { nivel: "suave", factor: 0.75, motivo: "Vienes cansado o dormiste poco: una serie menos en cada ejercicio." };
  return { nivel: "normal", factor: 1, motivo: "Estás para entrenar normal." };
}

export const seriesAjustadas = (series: number, c: Carga) => (c.factor >= 1 ? series : Math.max(1, Math.round(series * c.factor)));

// ---------- Semana ----------
export function sesionDeHoy(plan: Plan | undefined, hoy: string): SesionPlan | null {
  return plan?.sesiones.find((s) => s.dia === dow(hoy)) || null;
}

// Días de esta semana con sesión en el plan y si se hicieron.
export function semanaEntreno(plan: Plan | undefined, entrenos: Entreno[], hoy: string): { dia: number; plan: boolean; hecho: boolean }[] {
  const l = lunesDe(hoy);
  return Array.from({ length: 7 }, (_, d) => {
    const f = addDays(l, d);
    return { dia: d, plan: !!plan?.sesiones.some((s) => s.dia === d), hecho: entrenos.some((e) => e.fecha === f) };
  });
}

// Equilibrio del cuerpo: sesiones hechas esta semana contra las del plan hasta hoy.
export function equilibrioCuerpo(plan: Plan | undefined, entrenos: Entreno[], hoy: string): number | null {
  if (!plan?.sesiones.length) return null;
  const sem = semanaEntreno(plan, entrenos, hoy).filter((x) => x.dia <= dow(hoy));
  const tocaban = sem.filter((x) => x.plan).length;
  if (!tocaban) return null;
  const hechas = sem.filter((x) => x.hecho).length;
  return Math.min(100, Math.round((hechas / tocaban) * 100));
}
