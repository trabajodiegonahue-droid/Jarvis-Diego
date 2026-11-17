import { GEMINI_API_BASE, GEMINI_MODEL, MAX_OUTPUT_TOKENS } from "../config";

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
}

export interface StreamResult {
  text: string;
  calls: { name: string; args: any }[];
  parts: Part[]; // partes tal como llegaron (hay que devolverlas igual en la siguiente vuelta)
}

function endpoint(c: Connection, method: "streamGenerateContent" | "generateContent"): { url: string; headers: Record<string, string> } {
  const path = `/models/${encodeURIComponent(GEMINI_MODEL)}:${method}${method === "streamGenerateContent" ? "?alt=sse" : ""}`;
  if (c.mode === "worker") {
    if (!c.workerUrl) throw new GeminiError("config", "Falta la dirección del intermediario.");
    return { url: c.workerUrl.replace(/\/+$/, "") + "/v1beta" + path, headers: { Authorization: `Bearer ${c.workerToken || ""}` } };
  }
  if (!c.apiKey) throw new GeminiError("config", "Falta la clave de Gemini.");
  return { url: GEMINI_API_BASE + path, headers: { "x-goog-api-key": c.apiKey } };
}

function body(r: Request) {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: r.system }] },
    contents: r.contents,
    ...(r.tools ? { tools: r.tools } : {}),
    generationConfig: { maxOutputTokens: r.maxTokens ?? MAX_OUTPUT_TOKENS, temperature: 0.7 },
  });
}

async function post(c: Connection, method: "streamGenerateContent" | "generateContent", r: Request, signal?: AbortSignal) {
  const { url, headers } = endpoint(c, method);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: body(r), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new GeminiError("network", "Sin conexión.");
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(txt)) throw new GeminiError("quota", "Se acabó la cuota gratis por ahora.");
    if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(txt)) throw new GeminiError("auth", "La clave no sirve.");
    if (res.status >= 500) throw new GeminiError("down", "Gemini no responde.");
    throw new GeminiError("down", `Error ${res.status}`);
  }
  return res;
}

export async function streamGemini(c: Connection, r: Request, onText: (delta: string) => void, signal?: AbortSignal): Promise<StreamResult> {
  const res = await post(c, "streamGenerateContent", r, signal);
  const out: StreamResult = { text: "", calls: [], parts: [] };
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const handle = (json: any) => {
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
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
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
