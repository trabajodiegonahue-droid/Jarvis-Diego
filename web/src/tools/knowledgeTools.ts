import { GeminiError, searchGemini, type Connection } from "../brain/gemini";
import { findFact } from "../knowledge/facts";
import type { Tool } from "./registry";

const ABOUT_Q = /\b(que sabes de mi|quien soy|sobre mi|que recuerdas de mi|me conoces)\b/;
const normq = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function knowledgeTools(about: () => string, conn: () => Connection, search = searchGemini): Tool[] {
  return [
    {
      name: "consultar_datos",
      description: "Busca en los datos guardados en la app (perfil de Diego, Servicio Militar, Working Holiday, Puerto Varas, entrenamiento, inglés, emergencias).",
      parameters: { type: "object", properties: { tema: { type: "string" } }, required: ["tema"] },
      run({ tema }) {
        const q = String(tema || "");
        if (ABOUT_Q.test(normq(q))) {
          const a = about().trim();
          const short = (a.match(/[^.]+\./g) || [a]).slice(0, 3).join("").trim();
          return a ? { ok: true, say: `Esto sé de ti: ${short}${short.length < a.length ? " Y harto más: pregúntame algo específico." : ""}`, data: a } : { ok: false, say: "Todavía no sé mucho de ti. Cuéntame en Ajustes, en Sobre mí." };
        }
        const f = findFact(q);
        return f ? { ok: true, say: f.say, data: { tema: f.title, detalle: f.detail, fuente: f.source } } : { ok: false, say: "Ahí no tengo la info guardada." };
      },
    },
    {
      name: "buscar_en_internet",
      description: "Busca información actual en internet (noticias, fechas, precios, requisitos, resultados de fútbol, lo que cambia). Úsala cuando el dato pueda estar desactualizado o no lo sepas.",
      parameters: { type: "object", properties: { consulta: { type: "string", description: "Qué buscar, en una frase." } }, required: ["consulta"] },
      async run({ consulta }) {
        try {
          const r = await search(conn(), String(consulta || ""));
          if (!r.text) return { ok: false, say: "Busqué, pero no encontré nada confiable." };
          return { ok: true, say: r.text, data: { fuentes: r.sources } };
        } catch (e) {
          const k = e instanceof GeminiError ? e.kind : "";
          return { ok: false, say: k === "quota" ? "Se me acabó la cuota de búsquedas por hoy." : k === "network" ? "Para buscar en internet necesito conexión." : "No pude buscar en internet ahora." };
        }
      },
    },
  ];
}
