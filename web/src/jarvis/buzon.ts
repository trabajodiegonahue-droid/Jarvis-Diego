// Buzón del Atajo de Siri: lo que dictaste con "Oye Siri, Jarvis" para anotar queda en el
// intermediario (Cloudflare) y aquí se anota en el teléfono al abrir la app. Después se borra allá.
import type { Settings } from "../core/settings";
import type { Assistant, Guardado } from "../brain/assistant";

export interface Anotado {
  texto: string;
  respuesta: string;
  undo?: () => Promise<void> | void;
  guardado?: Guardado[];
}

let corriendo = false;

export async function revisarBuzon(s: Settings, assistant: Assistant, fetcher: typeof fetch = fetch): Promise<Anotado[]> {
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
      const rep = await assistant.handle(it.texto, () => {}, "siri");
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
