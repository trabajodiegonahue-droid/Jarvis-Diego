// Guarda lo que Diego dice en su área de la vida (lo usa el asistente después de cada frase).
import { area, areaDeHerramienta, clasificarArea, seccionDe } from "../areas/calc";
import { hhmm } from "../core/texto";
import type { ChileNow } from "../core/time";
import type { AppStore } from "../data/store";
import { uid, type Nota } from "../data/types";

export function crearNotar(store: AppStore, clock: () => ChileNow) {
  return async ({ texto, tool, args, origen }: { texto: string; tool?: string; args?: any; origen: "jarvis" | "siri" }) => {
    if (tool === "anotar_en_area") return null; // esa herramienta ya guarda la nota
    const n = clock();
    const id = tool ? areaDeHerramienta(tool, args, texto) : clasificarArea(texto);
    const nota: Nota = { id: uid(), fecha: `${n.date}T${hhmm(n.minutes)}`, area: id, texto: texto.trim(), origen, ...(tool ? { registro: tool } : {}) };
    await store.put("notas", nota);
    return { area: area(id).nombre, id, texto: nota.texto, seccion: seccionDe(tool) ?? undefined, undo: () => store.remove("notas", nota.id).then(() => {}) };
  };
}
