import { GEMINI_API_BASE, GEMINI_MODEL, MAX_OUTPUT_TOKENS, THINKING_BUDGET } from "../config";

// Cliente mínimo de la API de Gemini, con respuesta en streaming (texto a medida
// que llega) y function calling. Habla directo con Google o con el intermediario
// (Cloudflare Worker), según los ajustes.

export type Part = { text?: string; functionCall?: { name: string; args?: any }; functionResponse?: { name: string; response: any }; [k: string]: unknown };
export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export interface Connection {
  mode: "key" | "worker";
  apiKey?: string; // modo "key": la clave queda solo en este teléfono
  workerUrl?: string; // modo "worker": la clave vive en Cloudflare
  workerToken?: string;
}

export type GeminiErrorKind = "quota" | "auth" | "network" | "down" | "config" | "blocked";
export class GeminiError extends Error {
  constructor(public kind: GeminiErrorKind, message: string) {
    super(message);
  }
}

export interface Request {
  system: string;
  contents: Content[];
  tools?: unknown[];
  maxTokens?: number;
  think?: boolean; // razonar antes de responder (por defecto sí)
}

export interface StreamResult {
  text: string;
  calls: { name: string; args: any }[];
  parts: Part[]; // partes tal como llegaron (hay que devolverlas igual en la siguiente vuelta)
}

// Deja solo los caracteres que puede tener una clave (letras, números y . _ -).
export const limpiarClave = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, "");

function endpoint(c: Connection, method: "streamGenerateContent" | "generateContent"): { url: string; headers: Record<string, string> } {
  const path = `/models/${encodeURIComponent(GEMINI_MODEL)}:${method}${method === "streamGenerateContent" ? "?alt=sse" : ""}`;
  if (c.mode === "worker") {
    if (!c.workerUrl) throw new GeminiError("config", "Falta la dirección del intermediario.");
    return { url: c.workerUrl.replace(/\/+$/, "") + "/v1beta" + path, headers: { Authorization: `Bearer ${c.workerToken || ""}` } };
  }
  // Al copiar desde el iPhone a veces se cuela un espacio o un carácter invisible: se limpia.
  const key = limpiarClave(c.apiKey || "");
  if (!key) throw new GeminiError("config", "Falta la clave de Gemini.");
  return { url: GEMINI_API_BASE + path, headers: { "x-goog-api-key": key } };
}

function body(r: Request, think: boolean) {
  const max = r.maxTokens ?? MAX_OUTPUT_TOKENS;
  return JSON.stringify({
    systemInstruction: { parts: [{ text: r.system }] },
    contents: r.contents,
    ...(r.tools ? { tools: r.tools } : {}),
    generationConfig: {
      temperature: 0.7,
      // Con razonamiento, el modelo piensa primero (hasta THINKING_BUDGET tokens) y después responde corto.
      ...(think ? { maxOutputTokens: max + THINKING_BUDGET, thinkingConfig: { thinkingBudget: THINKING_BUDGET } } : { maxOutputTokens: max }),
    },
  });
}

async function post(c: Connection, method: "streamGenerateContent" | "generateContent", r: Request, signal?: AbortSignal) {
  const { url, headers } = endpoint(c, method);
  const send = async (think: boolean) => {
    try {
      return await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: body(r, think), signal });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new GeminiError("network", "Sin conexión.");
    }
  };
  const think = r.think !== false && THINKING_BUDGET > 0;
  let res = await send(think);
  let txt = "";
  // Si el modelo vigente no acepta el ajuste de razonamiento, se reintenta sin él.
  if (!res.ok && think && res.status === 400) {
    txt = await res.text().catch(() => "");
    if (/thinking/i.test(txt)) {
      res = await send(false);
      txt = "";
    }
  }
  if (!res.ok) {
    txt = txt || (await res.text().catch(() => ""));
    if (res.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(txt)) throw new GeminiError("quota", "Se acabó la cuota gratis por ahora.");
    if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(txt)) throw new GeminiError("auth", "La clave no sirve.");
    if (res.status >= 500) throw new GeminiError("down", "Gemini no responde.");
    throw new GeminiError("down", `Error ${res.status}`);
  }
  return res;
}

// Lee las partes de una respuesta de Gemini (texto, llamadas a herramientas) y las acumula.
function lector(out: StreamResult, onText: (delta: string) => void) {
  return (json: any) => {
    const cand = json?.candidates?.[0];
    if (cand?.finishReason === "SAFETY" || json?.promptFeedback?.blockReason) throw new GeminiError("blocked", "Respuesta bloqueada.");
    for (const p of cand?.content?.parts || []) {
      if (typeof p.text === "string" && !p.thought) {
        out.text += p.text;
        onText(p.text);
      }
      if (p.functionCall) out.calls.push({ name: p.functionCall.name, args: p.functionCall.args || {} });
      mergePart(out.parts, p);
    }
  };
}

// Tiempos máximos: si la respuesta "en vivo" no empieza a llegar, se pide entera (algunos iPhone
// dejan colgada la lectura por partes); y nunca se espera para siempre.
export const ESPERA_PRIMER_TROZO = 15_000;
export const ESPERA_TOTAL = 45_000;

class SinRespuesta extends Error {}

async function enVivo(c: Connection, r: Request, onText: (delta: string) => void, signal?: AbortSignal): Promise<StreamResult> {
  const ctl = new AbortController();
  const corta = () => ctl.abort();
  signal?.addEventListener("abort", corta);
  let llego = false;
  const t1 = setTimeout(() => !llego && ctl.abort(), ESPERA_PRIMER_TROZO);
  const t2 = setTimeout(() => ctl.abort(), ESPERA_TOTAL);
  const out: StreamResult = { text: "", calls: [], parts: [] };
  const handle = lector(out, onText);
  try {
    const res = await post(c, "streamGenerateContent", r, ctl.signal);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (value) {
        llego = true;
        buf += dec.decode(value, { stream: true });
      }
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data && data !== "[DONE]") {
            try {
              handle(JSON.parse(data));
            } catch (e) {
              if (e instanceof GeminiError) throw e;
            }
          }
        }
      }
      if (done) break;
    }
    return out;
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    if (signal?.aborted) throw e;
    // Se cortó por tiempo: si todavía no se había mostrado nada, se puede pedir entera.
    if (!out.text && !out.calls.length) throw new SinRespuesta();
    throw new GeminiError("down", "La respuesta se cortó.");
  } finally {
    clearTimeout(t1);
    clearTimeout(t2);
    signal?.removeEventListener("abort", corta);
  }
}

// La misma respuesta, pero entera de una vez (sin leer por partes).
async function entera(c: Connection, r: Request, onText: (delta: string) => void): Promise<StreamResult> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ESPERA_TOTAL);
  try {
    const res = await post(c, "generateContent", r, ctl.signal);
    const out: StreamResult = { text: "", calls: [], parts: [] };
    lector(out, onText)(await res.json());
    return out;
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    throw new GeminiError("down", "Gemini se demoró demasiado.");
  } finally {
    clearTimeout(t);
  }
}

export async function streamGemini(c: Connection, r: Request, onText: (delta: string) => void, signal?: AbortSignal): Promise<StreamResult> {
  try {
    return await enVivo(c, r, onText, signal);
  } catch (e) {
    if (e instanceof SinRespuesta) return entera(c, r, onText);
    throw e;
  }
}

// Junta los trozos de texto seguidos en una sola parte; el resto se guarda tal cual.
function mergePart(parts: Part[], p: Part) {
  const last = parts[parts.length - 1];
  if (last && typeof p.text === "string" && typeof last.text === "string" && Object.keys(p).length === 1 && Object.keys(last).length === 1) last.text += p.text;
  else parts.push({ ...p });
}

// Llamada simple sin streaming (para resumir la conversación).
export async function askGemini(c: Connection, r: Request): Promise<string> {
  const res = await post(c, "generateContent", r);
  const json = await res.json();
  return (json?.candidates?.[0]?.content?.parts || []).map((p: Part) => p.text || "").join("").trim();
}

// Búsqueda en internet: una llamada aparte con la herramienta de Google Search de Gemini.
// Devuelve un resumen corto y las fuentes que usó.
export async function searchGemini(c: Connection, query: string): Promise<{ text: string; sources: { title: string; url: string }[] }> {
  const res = await post(c, "generateContent", {
    system: "Busca en internet y responde en español de Chile en máximo 3 frases cortas, para escuchar en voz alta. Incluye fechas o cifras concretas si las hay. Si no encuentras nada confiable, dilo.",
    contents: [{ role: "user", parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
    maxTokens: 350,
    think: false,
  });
  const json = await res.json();
  const cand = json?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: Part) => p.text || "").join("").trim();
  const sources = (cand?.groundingMetadata?.groundingChunks || [])
    .map((g: any) => ({ title: g?.web?.title || "", url: g?.web?.uri || "" }))
    .filter((s: any) => s.url)
    .slice(0, 4);
  return { text, sources };
}
