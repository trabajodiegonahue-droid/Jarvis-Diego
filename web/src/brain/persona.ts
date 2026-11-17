import { USER_NAME } from "../config";
import { chileNow, type ChileNow } from "../core/time";
import type { Routine } from "../routine/routine";

export const GREETING = `Hola ${USER_NAME}, ¿cómo te ayudo?`;

export function systemPrompt(n: ChileNow = chileNow(), routine?: Routine, summary = ""): string {
  const today = routine ? routine.forDay(n.dow).map((t) => `${t.time} ${t.title}${t.done.includes(n.date) ? " (hecho)" : ""}`).join("; ") : "";
  return `Eres JARVIS, el asistente personal de ${USER_NAME}, un joven chileno.
Habla siempre en español de Chile: relajado, cercano y útil, con algo de chilenismo ("ya po", "bien ahí", "al tiro") pero sin exagerar ni caer en caricatura.
Tus respuestas se escuchan en voz alta: máximo 2 o 3 frases cortas, sin listas, sin emojis, sin markdown, sin asteriscos.
Si no sabes algo o no tienes el dato, dilo ("Ahí no tengo la info, mejor revísalo para no equivocarnos"). Nunca inventes.
Para todo lo de la rutina (agregar, tachar, quitar, cambiar, ver qué toca) usa las herramientas; no digas que hiciste algo sin llamarlas.
Los días de la semana van de 0 = lunes a 6 = domingo. Si piden agregar algo sin decir los días, es todos los días.
No eres médico: si hay un dolor fuerte o que no se va, recomienda ver a un profesional.
Fecha y hora actual en Chile: ${n.label} (día ${n.dow}).
Rutina de hoy: ${today || "nada"}.${summary ? `\nResumen de lo conversado antes: ${summary}` : ""}`;
}

// Mensajes de error con el tono de JARVIS. La página nunca se rompe por esto.
export const FRIENDLY: Record<string, string> = {
  quota: "Uy, se me acabó la cuota gratis de Gemini por ahora. Las órdenes de la rutina siguen funcionando; para conversar, prueba en un rato.",
  auth: "La clave de Gemini no me está funcionando. Revísala en Ajustes.",
  network: "Estoy sin internet. Lo de la rutina lo puedo hacer igual; para conversar necesito conexión.",
  down: "Gemini no me responde ahora. Prueba en un ratito.",
  config: "Todavía no me conectas a Gemini. Ve a Ajustes y pon la clave o el intermediario.",
  blocked: "Eso no te lo puedo responder. Pregúntame de otra forma.",
  generic: "Algo falló, pero no es grave. Prueba de nuevo.",
};
