// Modo manos libres del entrenamiento: entiende lo que dice Diego entre series.
import { norm } from "../routine/routine";

export type ComandoEntreno =
  | { tipo: "serie"; reps?: number; kg?: number }
  | { tipo: "siguiente" }
  | { tipo: "saltar" }
  | { tipo: "repite" }
  | { tipo: "terminar" }
  | { tipo: "salir" };

const NUM: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60 };
const n = (s?: string) => (s == null ? undefined : /^\d+([.,]\d+)?$/.test(s) ? Number(s.replace(",", ".")) : NUM[s]);
const W = `(\\d+(?:[.,]\\d+)?|${Object.keys(NUM).join("|")})`;

export function comandoEntreno(text: string): ComandoEntreno | null {
  const t = norm(text.replace(/(\d),(\d)/g, "$1.$2")).replace(/(\d) (\d)/g, "$1.$2");
  if (!t) return null;
  if (/\b(sal(ir|te)|para el modo|apaga|deja de escuchar|pausa)\b/.test(t)) return { tipo: "salir" };
  if (/\b(termine|terminar|guarda|guardar|fin) (el |la )?(entreno|entrenamiento|sesion|todo)\b|^(guardar|terminar)$/.test(t)) return { tipo: "terminar" };
  if (/\b(siguiente|proximo|otro) ejercicio\b|^siguiente$|\bme salto (este|el) ejercicio\b/.test(t)) return { tipo: "siguiente" };
  if (/\b(salta|saltar|sin) (el )?descanso\b|^(vamos|dale|ya estoy|listo para)$/.test(t)) return { tipo: "saltar" };
  if (/\b(repite|repetir|que toca|que era|cuantas eran|de nuevo)\b/.test(t)) return { tipo: "repite" };
  const reps = t.match(new RegExp(`\\b(?:hice |fueron |saque |)${W} (?:repeticiones|reps|veces|segundos|seg)\\b`)) || t.match(new RegExp(`^(?:hice |fueron |saque )?${W}(?: con| a|$)`));
  const kg = t.match(new RegExp(`\\b(?:con |a )?${W} (?:kilos|kg|kilo)\\b`));
  if (reps || /\b(termine|lista|listo|hecha|hecho|ya|complete|serie)\b/.test(t)) {
    const r = reps ? n(reps[1]) : undefined;
    const k = kg ? n(kg[1]) : undefined;
    return { tipo: "serie", ...(r && r > 0 && r < 300 ? { reps: Math.round(r) } : {}), ...(k && k > 0 && k < 400 ? { kg: k } : {}) };
  }
  return null;
}
