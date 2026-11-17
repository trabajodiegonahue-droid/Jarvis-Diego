// Todo lo que puede cambiar con el tiempo está aquí, en un solo lugar.

// Modelo de Gemini. Los nombres y los límites gratuitos cambian: revisa la consola
// de Google AI Studio. "gemini-flash-lite-latest" es un alias que Google mantiene
// apuntando al Flash-Lite vigente, así no hay que tocar el código cuando sale uno nuevo.
export const GEMINI_MODEL: string =
  import.meta.env.VITE_GEMINI_MODEL || "gemini-flash-lite-latest";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Tope de tokens por respuesta: las respuestas se escuchan, así que cortas.
export const MAX_OUTPUT_TOKENS = 300;

// Con más de este número de mensajes se resume lo antiguo para no gastar cuota.
export const HISTORY_LIMIT = 16;
export const HISTORY_KEEP = 6;

export const TIMEZONE = "America/Santiago";
export const USER_NAME = "Diego";
export const SPEECH_LANG = "es-CL";
