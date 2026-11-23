// Ejercicios dichos de palabra: "press banca 4 de 8 con 50 kilos y sentadilla 3 series de 10 con 60".
// Devuelve cada ejercicio con sus series (repeticiones y peso). Lo que no está en la biblioteca se guarda igual, con su nombre.
import type { SerieHecha } from "../data/types";

const sinTilde = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Nombres como los dice Diego → ejercicio de la biblioteca.
const ALIAS: [RegExp, string][] = [
  [/sentadilla (goblet|copa)/, "sentadilla-goblet"],
  [/sentadilla bulgara|bulgara/, "bulgara"],
  [/sentadilla/, "sentadilla-barra"],
  [/zancada|estocada/, "zancada"],
  [/peso muerto rumano|rumano/, "peso-muerto-rumano"],
  [/hip thrust|puente de (gluteo|cadera)/, "hip-thrust"],
  [/press (de )?banca|banca plana|press plano/, "press-banca"],
  [/press (de pecho )?(con )?mancuernas/, "press-mancuernas"],
  [/press militar|press (de )?hombros?/, "press-militar"],
  [/dominadas? con banda/, "dominadas-banda"],
  [/dominadas?/, "dominadas"],
  [/remo invertido/, "remo-invertido"],
  [/remo (con )?mancuerna/, "remo-mancuerna"],
  [/face ?pull/, "face-pull"],
  [/fondos/, "fondos"],
  [/curl|biceps/, "curl"],
  [/plancha lateral/, "plancha-lateral"],
  [/plancha/, "plancha"],
  [/flexiones|lagartijas/, "flexiones"],
  [/gemelos|pantorrillas|talones/, "gemelos"],
  [/nordico/, "nordico"],
  [/rueda abdominal/, "rueda"],
];
const NUM: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20 };
const n = (x: string) => (/^\d+([.,]\d+)?$/.test(x) ? Number(x.replace(",", ".")) : NUM[x]);
const NUMRE = "(\\d+(?:[.,]\\d+)?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte)";

export interface EjercicioDicho {
  ejId: string; // id de la biblioteca o "libre:<nombre>"
  nombre: string;
  series: SerieHecha[];
}

export function parseEjercicios(texto: string): EjercicioDicho[] {
  const t = sinTilde(texto).replace(/[;.]/g, ",");
  const trozos = t.split(/\s*(?:,|\by despues\b|\bdespues\b|\bluego\b|\by tambien\b|\by\b(?= [a-z]{3,}(?! de \d)(?: [a-z]+)* \d))\s*/).filter(Boolean);
  const out: EjercicioDicho[] = [];
  for (const tr of trozos) {
    let sets = 0;
    let reps = 0;
    let kg: number | undefined;
    let m: RegExpMatchArray | null;
    if ((m = tr.match(new RegExp(`\\b${NUMRE} ?(?:x|por|×) ?${NUMRE}\\b`)))) {
      sets = n(m[1]);
      reps = n(m[2]);
    } else if ((m = tr.match(new RegExp(`\\b${NUMRE} (?:series|serie|sets?|tandas?)(?: de| con)? ${NUMRE}(?: (?:repeticiones|reps|rep))?\\b`)))) {
      sets = n(m[1]);
      reps = n(m[2]);
    } else if ((m = tr.match(new RegExp(`\\b${NUMRE} de ${NUMRE}\\b(?! ?(?:kilos|kg|kilogramos))`)))) {
      sets = n(m[1]);
      reps = n(m[2]);
    } else if ((m = tr.match(new RegExp(`\\b${NUMRE} (?:repeticiones|reps|rep)\\b`)))) {
      sets = 1;
      reps = n(m[1]);
    } else if ((m = tr.match(new RegExp(`\\b${NUMRE} (?:segundos|seg)\\b`)))) {
      sets = 1;
      reps = n(m[1]);
    }
    const s2 = tr.match(new RegExp(`\\b${NUMRE} (?:series|serie|sets?)\\b`));
    if (s2 && !sets) sets = n(s2[1]);
    const p = tr.match(new RegExp(`\\b(?:con |de |a )?${NUMRE} ?(?:kilos|kg|kilogramos|k)\\b`)) || tr.match(/\bcon (\d+(?:[.,]\d+)?)\b(?! ?(?:repeticiones|reps|rep|segundos|seg|series))/);
    if (p) kg = n(p[1]);
    if (!sets && !reps && !kg) continue;
    // El nombre es lo que queda sin números, unidades ni palabras de relleno.
    const nombreRaw = tr
      .replace(/\d+\s*[x×]\s*\d+/g, " ")
      .replace(/\b\d+(?:[.,]\d+)?\b/g, " ")
      .replace(/\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|x|por|series|serie|sets?|tandas?|repeticiones|reps|rep|kilos|kg|kilogramos|k|segundos|seg|hice|hize|tambien|ademas|despues|luego|y|de|con|en|el|la|los|las|cada una|cada serie|a)\b/g, " ")
      .replace(/[×]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b(jalon|biceps|triceps|maquina|abdomen|isquiotibiales|cuadriceps|gluteos?|polea)\b/g, (w) => ({ jalon: "jalón", biceps: "bíceps", triceps: "tríceps", maquina: "máquina", abdomen: "abdomen", isquiotibiales: "isquiotibiales", cuadriceps: "cuádriceps", gluteo: "glúteo", gluteos: "glúteos", polea: "polea" })[w] || w);
    if (!nombreRaw || nombreRaw.length < 3) continue;
    const alias = ALIAS.find(([re]) => re.test(nombreRaw));
    const nombre = nombreRaw.charAt(0).toUpperCase() + nombreRaw.slice(1);
    const nSets = Math.min(Math.max(sets || 1, 1), 12);
    out.push({ ejId: alias ? alias[1] : `libre:${nombre}`, nombre, series: Array.from({ length: nSets }, () => ({ reps: reps || 0, ...(kg ? { kg } : {}) })) });
  }
  return out;
}

export const nombreEjercicio = (id: string, catalogo?: string) => catalogo || id.replace(/^libre:/, "");

// Nombre suelto ("press banca", "jalón al pecho") → id de la biblioteca o "libre:<Nombre>".
export function idDeNombre(nombre: string): string {
  const t = sinTilde(nombre).trim();
  const a = ALIAS.find(([re]) => re.test(t));
  return a ? a[1] : `libre:${nombre.trim().charAt(0).toUpperCase()}${nombre.trim().slice(1)}`;
}
