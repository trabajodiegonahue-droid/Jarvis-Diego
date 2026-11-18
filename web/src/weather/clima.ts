// Clima con Open-Meteo: gratis para uso personal (no comercial), sin clave y sin cuenta.
// Datos bajo licencia CC BY 4.0: la app muestra "Clima: Open-Meteo.com".
// Solo se envían las coordenadas de la ciudad; se guarda una copia por una hora para no repetir pedidos.
import type { KV } from "../core/storage";

export interface Ciudad {
  nombre: string;
  lat: number;
  lon: number;
}
export const PUERTO_VARAS: Ciudad = { nombre: "Puerto Varas", lat: -41.3195, lon: -72.9854 };

export interface DiaClima {
  fecha: string;
  codigo: number;
  max: number;
  min: number;
  lluvia: number; // probabilidad máxima de lluvia, %
  mm: number; // milímetros
}
export interface Clima {
  ciudad: string;
  actual: { temp: number; codigo: number } | null;
  dias: DiaClima[];
  at: number;
}

// Códigos WMO que usa Open-Meteo, en palabras.
export function describir(c: number): string {
  if (c === 0) return "despejado";
  if (c <= 2) return "parcialmente nublado";
  if (c === 3) return "nublado";
  if (c === 45 || c === 48) return "con neblina";
  if (c >= 51 && c <= 57) return "con llovizna";
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return c === 65 || c === 82 ? "con lluvia fuerte" : "con lluvia";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "con nieve";
  if (c >= 95) return "con tormenta";
  return "variable";
}

export function urlClima(c: Ciudad) {
  const q = new URLSearchParams({
    latitude: String(c.lat),
    longitude: String(c.lon),
    current: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
    timezone: "America/Santiago",
    forecast_days: "3",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

export function leerRespuesta(j: any, ciudad: string): Clima {
  const d = j?.daily || {};
  const dias: DiaClima[] = (d.time || []).map((fecha: string, i: number) => ({
    fecha,
    codigo: d.weather_code?.[i] ?? 0,
    max: Math.round(d.temperature_2m_max?.[i] ?? 0),
    min: Math.round(d.temperature_2m_min?.[i] ?? 0),
    lluvia: Math.round(d.precipitation_probability_max?.[i] ?? 0),
    mm: Math.round((d.precipitation_sum?.[i] ?? 0) * 10) / 10,
  }));
  const actual = j?.current ? { temp: Math.round(j.current.temperature_2m), codigo: j.current.weather_code } : null;
  return { ciudad, actual, dias, at: Date.now() };
}

const HORA = 3600_000;

export async function obtenerClima(ciudad: Ciudad, kv: KV, fetcher: typeof fetch = fetch): Promise<Clima | null> {
  const guardado = kv.get<Clima | null>("clima", null);
  if (guardado && guardado.ciudad === ciudad.nombre && Date.now() - guardado.at < HORA) return guardado;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetcher(urlClima(ciudad), { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return guardado;
    const c = leerRespuesta(await r.json(), ciudad.nombre);
    if (!c.dias.length) return guardado;
    kv.set("clima", c);
    return c;
  } catch {
    return guardado; // sin internet: lo último que hubo (o nada)
  }
}

export async function buscarCiudad(nombre: string, fetcher: typeof fetch = fetch): Promise<Ciudad[]> {
  const q = new URLSearchParams({ name: nombre, count: "5", language: "es", format: "json" });
  const r = await fetcher(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j.results || []).map((x: any) => ({ nombre: [x.name, x.admin1, x.country_code !== "CL" ? x.country : ""].filter(Boolean).join(", "), lat: x.latitude, lon: x.longitude }));
}

// La frase del clima para el resumen de la mañana, con un consejo si hay partido o entreno afuera.
export function fraseClima(c: Clima | null, fecha: string, opts: { partido?: boolean; correr?: boolean } = {}): string | null {
  const d = c?.dias.find((x) => x.fecha === fecha);
  if (!c || !d) return null;
  const nombre = c.ciudad.split(",")[0];
  const llueve = d.lluvia >= 60 || d.mm >= 2;
  let t = `En ${nombre}, ${d.min} a ${d.max} grados, ${describir(d.codigo)}${d.lluvia >= 30 ? `, ${d.lluvia}% de probabilidad de lluvia` : ""}.`;
  if (opts.partido && llueve) t += " Para el partido: ropa de agua, chuteadores con toperoles y calienta bien, que con frío y cancha mojada uno se lesiona más.";
  else if (opts.partido && d.max <= 8) t += " Hace frío para el partido: calienta más rato.";
  else if (llueve) t += " Lleva paraguas o chaqueta de agua.";
  else if (d.max >= 26) t += " Hace calor: toma harta agua.";
  return t;
}
