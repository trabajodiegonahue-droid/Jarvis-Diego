// Comida y suplementos: checklist del día, proteína estimada contra la meta, racha de creatina
// y aviso si no subes de peso. Funciones puras.
import { addDays } from "../core/dates";
import type { Comida, Peso } from "../data/types";

export type ItemComida = "creatina" | "desayuno" | "batido" | "almuerzo" | "colacion" | "once";
export interface ConfigComida {
  medida: number; // gramos de proteína por medida (según la etiqueta)
  meta: number; // gramos al día
  almuerzo: number;
  once: number;
  colacion: number;
}
export const CONFIG_COMIDA: ConfigComida = { medida: 24, meta: 110, almuerzo: 25, once: 20, colacion: 8 };

export const ITEMS: { k: ItemComida; nombre: string; detalle: string; hora: string; rutina: string }[] = [
  { k: "creatina", nombre: "Creatina 3–5 g", detalle: "Con el desayuno, todos los días (también sin entrenar)", hora: "07:30", rutina: "Despertar + desayuno + creatina" },
  { k: "desayuno", nombre: "Desayuno: avena + 1 medida de proteína", detalle: "", hora: "07:30", rutina: "Despertar + desayuno + creatina" },
  { k: "batido", nombre: "Batido post-entreno: proteína + avena", detalle: "", hora: "11:00", rutina: "Batido: proteína + avena" },
  { k: "almuerzo", nombre: "Almuerzo", detalle: "", hora: "13:00", rutina: "Almuerzo" },
  { k: "colacion", nombre: "Colación", detalle: "", hora: "16:30", rutina: "Colación" },
  { k: "once", nombre: "Once / comida", detalle: "", hora: "20:30", rutina: "Once / comida" },
];

// Proteína de cada cosa: desayuno y batido = 1 medida + ~6 g de la avena.
export const gramosDe = (k: ItemComida, c: ConfigComida = CONFIG_COMIDA): number =>
  k === "desayuno" || k === "batido" ? c.medida + 6 : k === "almuerzo" ? c.almuerzo : k === "once" ? c.once : k === "colacion" ? c.colacion : 0;

export const proteinaDia = (x: Comida | undefined, c: ConfigComida = CONFIG_COMIDA) =>
  x ? (["desayuno", "batido", "almuerzo", "colacion", "once"] as ItemComida[]).reduce((t, k) => t + (x[k] ? gramosDe(k, c) : 0), 0) : 0;

export function rachaCreatina(cs: Comida[], hoy: string): number {
  let n = 0;
  for (let f = hoy; ; f = addDays(f, -1)) {
    const ok = cs.find((x) => x.id === f)?.creatina;
    if (ok) n++;
    else if (f !== hoy) break;
    if (n > 1000) break;
  }
  return n;
}

// ¿Llevas 2–3 semanas sin subir de peso? (compara el último peso con el de hace ~14–21 días)
export function sinSubir(pesos: Peso[], hoy: string): { kg: number; antes: number } | null {
  const ord = [...pesos].sort((a, b) => a.id.localeCompare(b.id));
  const ult = ord[ord.length - 1];
  if (!ult || ult.id < addDays(hoy, -10)) return null;
  const antes = [...ord].reverse().find((p) => p.id <= addDays(ult.id, -14) && p.id >= addDays(ult.id, -24));
  if (!antes) return null;
  return ult.kg - antes.kg <= 0.1 ? { kg: ult.kg, antes: antes.kg } : null;
}
