// Intermediario de JARVIS: recibe la pregunta del teléfono, le agrega la clave de
// Gemini (guardada como secreto en Cloudflare) y devuelve la respuesta en streaming.
// Así la clave nunca está en el teléfono ni en GitHub.

const GEMINI = "https://generativelanguage.googleapis.com";
const ALLOWED_METHODS = new Set(["streamGenerateContent", "generateContent"]);
const MAX_BODY = 64 * 1024;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin : allowed[0] || "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const fail = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (request.method !== "POST") return fail(405, "Solo POST");
    if (!okOrigin) return fail(403, "Origen no permitido");
    if (!env.ACCESS_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.ACCESS_TOKEN}`) return fail(401, "Código de acceso incorrecto");
    if (!env.GEMINI_API_KEY) return fail(500, "Falta la clave de Gemini en el intermediario");

    // Solo se aceptan las dos rutas que usa JARVIS: /v1beta/models/<modelo>:<método>
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/v1beta\/models\/[^/:]+:([A-Za-z]+)$/);
    if (!m || !ALLOWED_METHODS.has(m[1])) return fail(404, "Ruta no permitida");

    const body = await request.text();
    if (body.length > MAX_BODY) return fail(413, "Mensaje demasiado largo");

    const model = encodeURIComponent(env.GEMINI_MODEL || "gemini-flash-lite-latest");
    const target = `${GEMINI}/v1beta/models/${model}:${m[1]}${m[1] === "streamGenerateContent" ? "?alt=sse" : ""}`;
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body,
    });
    const headers = new Headers(cors);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
    headers.set("Cache-Control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
