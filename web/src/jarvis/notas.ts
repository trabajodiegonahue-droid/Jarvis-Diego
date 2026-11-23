// Guarda lo que Diego dice en su área de la vida (lo usa el asistente después de cada frase).
import { area, areaDeHerramienta, clasificarArea, seccionDe } from "../areas/calc";
import { hhmm } from "../core/texto";
import type { ChileNow } from "../core/time";
import type { AppStore } from "../data/store";
import { uid, type Nota } from "../data/types";
import { haceCuanto } from "./vidaParser";

export function crearNotar(store: AppStore, clock: () => ChileNow) {
  return async ({ texto, tool, args, origen, ya = [] }: { texto: string; tool?: string; args?: any; origen: "jarvis" | "siri"; ya?: string[] }) => {
    if (tool === "anotar_en_area") return null; // esa herramienta ya guarda la nota
    const n = clock();
    // Lo específico de esta herramienta ("gimnasio") clasifica mejor que la frase entera ("fútbol a las 3 y gimnasio a las 5").
    const propio = typeof args?.texto === "string" ? args.texto : typeof args?.titulo === "string" ? args.titulo : "";
    const id = tool ? areaDeHerramienta(tool, args, propio || texto) : clasificarArea(texto);
    if (ya.includes(id)) return null; // una nota por área en cada frase
    // Si dijo "hace 10 minutos", la nota queda a esa hora.
    const hace = typeof args?.hora === "string" && /^\d{2}:\d{2}$/.test(args.hora) ? null : haceCuanto(texto);
    const min = hace ? Math.max(0, n.minutes - hace.minutos) : n.minutes;
    const hora = typeof args?.hora === "string" && /^\d{2}:\d{2}$/.test(args.hora) && args.hora <= hhmm(n.minutes) ? args.hora : hhmm(min);
    const nota: Nota = { id: uid(), fecha: `${n.date}T${hora}`, area: id, texto: texto.trim(), origen, ...(tool ? { registro: tool } : {}) };
    await store.put("notas", nota);
    return { area: area(id).nombre, id, texto: propio && propio !== texto ? `${propio.charAt(0).toUpperCase()}${propio.slice(1)}${args?.cuando ? ` (${args.cuando})` : ""}` : nota.texto, seccion: seccionDe(tool) ?? undefined, undo: () => store.remove("notas", nota.id).then(() => {}) };
  };
}
