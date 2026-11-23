// La ficha de la mascota: paseos, comida, caca, veterinario, a partir de lo que le cuentas a JARVIS. Funciones puras.
import { addDays } from "../core/dates";
import { areaEfectiva } from "../areas/calc";
import type { Nota } from "../data/types";

export type TipoMascota = "paseo" | "comida" | "caca" | "salud" | "bano" | "otro";
const TIPOS: [TipoMascota, RegExp][] = [
  ["salud", /veterinari|vacuna|desparasit|pulgas|remedio|enferm|cojea|vomit/],
  ["caca", /caca|pipi|hizo sus necesidades|necesidades/],
  ["paseo", /pase|sacar|saque|salir|sali con|trot|camin|corri con|plaza|parque/],
  ["comida", /comida|comio|comer|croqueta|aliment|di de comer|le di|agua/],
  ["bano", /bano|bañ|lav[eé] al|lav[eé] a la/],
];
const sinTilde = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export function tipoMascota(texto: string): TipoMascota {
  const t = sinTilde(texto);
  // "tengo que sacar..." no es un paseo hecho; igual se clasifica como paseo pendiente más abajo.
  for (const [k, re] of TIPOS) if (re.test(t)) return k;
  return "otro";
}

export interface EventoMascota {
  nota: Nota;
  tipo: TipoMascota;
  pendiente: boolean; // "tengo que sacar a Apolo" (no lo hizo todavía)
}

export function eventosMascota(notas: Nota[]): EventoMascota[] {
  return notas
    .filter((n) => areaEfectiva(n) === "mascota")
    .map((n) => ({ nota: n, tipo: tipoMascota(n.texto), pendiente: /\b(tengo que|hay que|debo|recuerd|avis)/i.test(sinTilde(n.texto)) }))
    .sort((a, b) => b.nota.fecha.localeCompare(a.nota.fecha));
}

export function porDia(ev: EventoMascota[], tipo: TipoMascota, hoy: string, n = 7): { etiqueta: string; valor: number }[] {
  const DIAS = ["D", "L", "M", "M", "J", "V", "S"];
  return Array.from({ length: n }, (_, i) => {
    const f = addDays(hoy, i - (n - 1));
    return { etiqueta: i === n - 1 ? "Hoy" : DIAS[new Date(f + "T12:00:00Z").getUTCDay()], valor: ev.filter((e) => !e.pendiente && e.tipo === tipo && e.nota.fecha.startsWith(f)).length };
  });
}

export const ultimo = (ev: EventoMascota[], tipo: TipoMascota) => ev.find((e) => !e.pendiente && e.tipo === tipo);

// Minutos desde el último paseo (o caca, que también implica que salió). null si nunca se anotó.
export function minutosSinSalir(ev: EventoMascota[], ahoraIso: string): number | null {
  const u = ev.find((e) => !e.pendiente && (e.tipo === "paseo" || e.tipo === "caca"));
  if (!u) return null;
  return Math.max(0, Math.round((Date.parse(ahoraIso + ":00Z") - Date.parse(u.nota.fecha + ":00Z")) / 60000));
}
