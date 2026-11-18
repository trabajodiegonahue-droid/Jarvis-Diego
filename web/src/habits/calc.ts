// Hábitos y bienestar: rachas, cumplimiento y tendencias de sueño, energía y ánimo. Funciones puras.
import { addDays, dow } from "../core/dates";
import type { Dia, Habito } from "../data/types";

export const aplica = (h: Habito, fecha: string) => !h.dias.length || h.dias.includes(dow(fecha));
export const hecho = (dias: Dia[], habitoId: string, fecha: string) => !!dias.find((d) => d.id === fecha)?.habitos.includes(habitoId);
export const activos = (hs: Habito[]) => hs.filter((h) => !h.archivado).sort((a, b) => a.orden - b.orden);

// Racha: días seguidos (solo los que aplican) en que cumpliste. Hoy sin marcar no corta la racha:
// el día todavía no termina.
export function racha(h: Habito, dias: Dia[], hoy: string): number {
  const hechos = new Set(dias.filter((d) => d.habitos.includes(h.id)).map((d) => d.id));
  let n = 0;
  let f = hoy;
  if (aplica(h, f) && !hechos.has(f)) f = addDays(f, -1);
  for (let i = 0; i < 800; i++, f = addDays(f, -1)) {
    if (!aplica(h, f)) continue;
    if (!hechos.has(f)) break;
    n++;
  }
  return n;
}

export function mejorRacha(h: Habito, dias: Dia[], hoy: string): number {
  const fechas = dias.filter((d) => d.habitos.includes(h.id)).map((d) => d.id).sort();
  if (!fechas.length) return 0;
  const hechos = new Set(fechas);
  let mejor = 0;
  let n = 0;
  for (let f = fechas[0]; f <= hoy; f = addDays(f, 1)) {
    if (!aplica(h, f)) continue;
    if (hechos.has(f)) mejor = Math.max(mejor, ++n);
    else if (f !== hoy) n = 0;
  }
  return mejor;
}

// Cumplimiento de los últimos n días (los que aplican), sin contar hoy si todavía no lo marcas.
export function cumplimiento(hs: Habito[], dias: Dia[], hoy: string, n = 7): { hechos: number; tocaban: number; pct: number | null } {
  let hechos = 0;
  let tocaban = 0;
  for (let i = 0; i < n; i++) {
    const f = addDays(hoy, -i);
    for (const h of activos(hs)) {
      if (!aplica(h, f)) continue;
      const ok = hecho(dias, h.id, f);
      if (i === 0 && !ok) continue;
      tocaban++;
      if (ok) hechos++;
    }
  }
  return { hechos, tocaban, pct: tocaban ? Math.round((hechos / tocaban) * 100) : null };
}

// Equilibrio del área bienestar (0-100): cumplimiento de hábitos de los últimos 7 días.
export const equilibrioHabitos = (hs: Habito[], dias: Dia[], hoy: string) => (activos(hs).length ? cumplimiento(hs, dias, hoy).pct : null);

export function serieBienestar(dias: Dia[], hoy: string, n: number): { fecha: string; sueno?: number; energia?: number; animo?: number; agua?: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const fecha = addDays(hoy, -(n - 1 - i));
    const d = dias.find((x) => x.id === fecha);
    return { fecha, sueno: d?.sueno, energia: d?.energia, animo: d?.animo, agua: d?.agua };
  });
}

const prom = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

export function promedios(dias: Dia[], hoy: string, n = 7) {
  const s = serieBienestar(dias, hoy, n);
  return { sueno: prom(s.map((x) => x.sueno)), energia: prom(s.map((x) => x.energia)), animo: prom(s.map((x) => x.animo)), agua: prom(s.map((x) => x.agua)) };
}

// Lo más destacable del bienestar, para el inicio y los resúmenes. Realista, sin sermones.
export function fraseBienestar(dias: Dia[], hoy: string): string | null {
  const ult = serieBienestar(dias, hoy, 3);
  const sueno = ult.map((x) => x.sueno).filter((x): x is number => typeof x === "number");
  if (sueno.length === 3 && sueno.every((x) => x < 6.5)) return "Llevas 3 noches durmiendo menos de 6 horas y media: hoy intenta acostarte más temprano.";
  const animo = ult.map((x) => x.animo).filter((x): x is number => typeof x === "number");
  if (animo.length >= 2 && animo.slice(-2).every((x) => x <= 2)) return "Llevas un par de días con el ánimo bajo. Haz algo que te guste hoy y, si sigue así, conversarlo con alguien ayuda.";
  const s = promedios(dias, hoy).sueno;
  if (s != null && s >= 7.5) return `Esta semana duermes ${String(s).replace(".", ",")} horas en promedio. Bien ahí.`;
  return null;
}

export const SUGERIDOS = ["Leer 15 minutos", "Estirar 10 minutos", "Inglés 20 minutos", "Sin celular antes de dormir", "Comer fruta", "Ordenar la pieza"];
export const ESCALA_ENERGIA = ["Sin pilas", "Baja", "Normal", "Buena", "A full"];
export const ESCALA_ANIMO = ["Mal", "Bajoneado", "Normal", "Bien", "Muy bien"];
