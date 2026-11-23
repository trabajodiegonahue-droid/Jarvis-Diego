// Buzón del Atajo de Siri: lo que dictaste con "Oye Siri, Jarvis" para anotar queda en el
// intermediario (Cloudflare) y aquí se anota en el teléfono al abrir la app. Después se borra allá.
import type { Settings } from "../core/settings";
import type { Assistant, Guardado } from "../brain/assistant";
import { normalizarChileno } from "../brain/chileno";

export interface Anotado {
  texto: string;
  respuesta: string;
  undo?: () => Promise<void> | void;
  guardado?: Guardado[];
}

let corriendo = false;

export function ajustarRelativo(texto: string, edad: number): string {
  if (edad < 1) return texto;
  const t = normalizarChileno(texto);
  const numero = (x: string) => (/^\d+$/.test(x) ? Number(x) : ({ un: 1, una: 1, dos: 2, tres: 3, cinco: 5, diez: 10, quince: 15, veinte: 20, treinta: 30 } as Record<string, number>)[x.toLowerCase()]);
  const enMin = (n: number, u: string, media?: string) => (/^h/i.test(u) ? n * 60 + (media ? 30 : 0) : n);
  if (!/\b(hace|en) (\d+|un|una|dos|tres|cinco|diez|quince|veinte|treinta) (minutos?|min|horas?)\b/i.test(t)) return texto;
  return t
    .replace(/\bhace (\d+|un|una|dos|tres|cinco|diez|quince|veinte|treinta) (minutos?|min|horas?)( y media)?\b/gi, (_, n, u, m) => `hace ${enMin(numero(n), u, m) + edad} minutos`)
    .replace(/\ben (\d+|un|una|dos|tres|cinco|diez|quince|veinte|treinta) (minutos?|min|horas?)( y media)?\b/gi, (_, n, u, m) => `en ${Math.max(1, enMin(numero(n), u, m) - edad)} minutos`);
}

export async function revisarBuzon(s: Settings, assistant: Assistant, fetcher: typeof fetch = fetch, ahora: () => number = Date.now): Promise<Anotado[]> {
  if (corriendo || s.mode !== "worker" || !s.workerUrl || !s.workerToken) return [];
  corriendo = true;
  try {
    const base = s.workerUrl.replace(/\/+$/, "");
    const headers = { Authorization: `Bearer ${s.workerToken}` };
    const r = await fetcher(`${base}/buzon`, { headers });
    if (!r.ok) return [];
    const { items } = (await r.json()) as { items: { id: string; texto: string; fecha: string }[] };
    if (!items?.length) return [];
    const out: Anotado[] = [];
    const listos: string[] = [];
    for (const it of items) {
      // "hace 10 minutos" / "en 10 minutos" se cuentan desde que lo dijiste a Siri, no desde que abriste la app.
      const edad = Math.max(0, Math.round((ahora() - Date.parse(it.fecha)) / 60000));
      const rep = await assistant.handle(ajustarRelativo(it.texto, Number.isFinite(edad) ? edad : 0), () => {}, "siri");
      out.push({ texto: it.texto, respuesta: rep.text, undo: rep.undo, guardado: rep.guardado });
      listos.push(it.id);
    }
    await fetcher(`${base}/buzon/borrar`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ids: listos }) });
    return out;
  } catch {
    return []; // sin internet: se intenta la próxima vez
  } finally {
    corriendo = false;
  }
}
