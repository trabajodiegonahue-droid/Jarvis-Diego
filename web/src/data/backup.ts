// Respaldo: un archivo JSON con TODO (para restaurar) y un CSV de movimientos (para planillas).
// La clave de Gemini y el código del intermediario nunca van en el respaldo.
import { toCSV } from "../money/csv";
import type { KV } from "../core/storage";
import { STORES, type Datos } from "./types";

const KV_KEYS = ["routine", "settings", "prefs", "summary"]; // lo de JARVIS y las preferencias
const SECRET = ["apiKey", "workerToken"];
// Al restaurar, la conexión (a quién se le manda tu código) no se toma del archivo: se queda la de este teléfono.
const CONEXION = ["mode", "apiKey", "workerUrl", "workerToken"];

export function exportJSON(d: Datos, kv: KV): string {
  const extra: Record<string, unknown> = {};
  for (const k of KV_KEYS) {
    const v = kv.get<any>(k, null);
    if (v == null) continue;
    extra[k] = k === "settings" ? Object.fromEntries(Object.entries(v).filter(([x]) => !SECRET.includes(x))) : v;
  }
  return JSON.stringify({ app: "vida", version: 1, exportedAt: new Date().toISOString(), datos: d, extra }, null, 1);
}

export interface Respaldo {
  datos: Datos;
  extra: Record<string, unknown>;
  exportedAt: string;
}

export function readJSON(text: string): Respaldo {
  let o: any;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error("Ese archivo no se puede leer.");
  }
  if (!o || o.app !== "vida" || typeof o.datos !== "object") throw new Error("Ese archivo no es un respaldo de esta app.");
  const datos = {} as Datos;
  for (const s of STORES) {
    const list = o.datos[s];
    if (list != null && !Array.isArray(list)) throw new Error(`El respaldo está dañado (${s}).`);
    (datos as any)[s] = (list || []).filter((x: any) => x && typeof x.id === "string");
  }
  for (const m of datos.movimientos) {
    if (!Number.isInteger(m.monto) || m.monto < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(m.fecha)) throw new Error("El respaldo tiene un movimiento dañado.");
  }
  return { datos, extra: o.extra && typeof o.extra === "object" ? o.extra : {}, exportedAt: String(o.exportedAt || "") };
}

export function applyExtra(kv: KV, extra: Record<string, unknown>) {
  for (const k of KV_KEYS) {
    if (!(k in extra)) continue;
    if (k === "settings") {
      const nuevos = Object.fromEntries(Object.entries((extra[k] as object) || {}).filter(([x]) => !CONEXION.includes(x)));
      kv.set(k, { ...kv.get<object>("settings", {}), ...nuevos });
    }
    else kv.set(k, extra[k]);
  }
}

export function exportCSV(d: Datos): string {
  const cat = (id: string) => d.categorias.find((c) => c.id === id)?.nombre || "";
  const rows: (string | number)[][] = [["Fecha", "Tipo", "Categoría", "Monto", "Nota"]];
  [...d.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((m) => rows.push([m.fecha, m.tipo, cat(m.categoriaId), m.tipo === "egreso" ? -m.monto : m.monto, m.nota || ""]));
  return toCSV(rows);
}

export async function pedirPersistencia(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
