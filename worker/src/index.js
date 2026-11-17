// Intermediario de JARVIS: recibe la pregunta del teléfono, le agrega la clave de
// Gemini (guardada como secreto en Cloudflare) y devuelve la respuesta en streaming.
// Así la clave nunca está en el teléfono ni en GitHub.
//
// También atiende el Atajo de Siri ("Oye Siri, Jarvis"):
//   POST /siri   → si es algo para anotar ("gasté 5 mil en comida"), lo deja en un buzón
//                  (Cloudflare KV) y la app lo anota la próxima vez que se abre. Si es una
//                  pregunta general, responde con Gemini en una o dos frases.
//   GET  /buzon  → la app lee lo pendiente (solo desde tu página y con tu código).
//   POST /buzon/borrar → la app borra lo que ya anotó.

const GEMINI = "https://generativelanguage.googleapis.com";
const ALLOWED_METHODS = new Set(["streamGenerateContent", "generateContent"]);
const MAX_BODY = 64 * 1024;
const MAX_SIRI = 500; // caracteres de lo dictado
const BUZON_TTL = 14 * 24 * 3600; // lo no leído se borra solo a las 2 semanas

// Frases que son para anotar en la app (no para conversar).
const PARA_ANOTAR = /^(ya )?(gaste|me gaste|pague|compre|me pagaron|me dieron|me llego|gane|recibi|cobre|hice|fui|entrene|corri|sali a|meti|marque|di una|ganamos|perdimos|empatamos|jugue|estudie|repase|trabaje|tuve turno|aporte|guarde|ahorre|anota|anotame|agrega|agregame|agenda|ponme|tacha|termine|crea|nueva meta|quita|borra|cambia)\b/;
// Preguntas sobre sus propios datos: viven en el teléfono, el intermediario no los ve.
const DE_LA_APP = /\b(cuanto (llevo|he|me queda|gaste|gastado)|que me toca|que tengo hoy|como voy|mis metas|mi rutina|mi presupuesto|resumen|cuantos goles)\b/;

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^\s*(oye\s+)?jarvis[,\s]*/, "")
    .replace(/[¿?¡!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const chileAhora = () => new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "full", timeStyle: "short" }).format(new Date());

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin : allowed[0] || "null",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const fail = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { ...cors, "Content-Type": "application/json" } });
    const json = (data) => new Response(JSON.stringify(data), { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    const url = new URL(request.url);
    const auth = request.headers.get("Authorization") || "";

    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });

    // El Atajo de Siri no manda "Origin" (no es una página): basta con el código de acceso.
    if (url.pathname === "/siri") {
      if (request.method !== "POST") return fail(405, "Solo POST");
      const tokens = [env.SIRI_TOKEN, env.ACCESS_TOKEN].filter(Boolean);
      if (!tokens.some((t) => auth === `Bearer ${t}`)) return texto("El código de acceso del atajo no es correcto. Revísalo en la app Atajos.", 401);
      return siri(request, env);
    }

    if (!okOrigin) return fail(403, "Origen no permitido");
    if (!env.ACCESS_TOKEN || auth !== `Bearer ${env.ACCESS_TOKEN}`) return fail(401, "Código de acceso incorrecto");

    if (url.pathname === "/buzon" && request.method === "GET") {
      if (!env.BUZON) return json({ items: [], configurado: false });
      const list = await env.BUZON.list({ prefix: "m:" });
      const items = [];
      for (const k of list.keys) {
        const v = await env.BUZON.get(k.name);
        if (v) items.push({ id: k.name, ...JSON.parse(v) });
      }
      return json({ items, configurado: true });
    }
    if (url.pathname === "/buzon/borrar" && request.method === "POST") {
      if (!env.BUZON) return json({ ok: true });
      const { ids } = await request.json().catch(() => ({ ids: [] }));
      for (const id of (Array.isArray(ids) ? ids : []).slice(0, 100)) if (typeof id === "string" && id.startsWith("m:")) await env.BUZON.delete(id);
      return json({ ok: true });
    }

    if (request.method !== "POST") return fail(405, "Solo POST");
    if (!env.GEMINI_API_KEY) return fail(500, "Falta la clave de Gemini en el intermediario");

    // Solo se aceptan las dos rutas que usa JARVIS: /v1beta/models/<modelo>:<método>
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

// Respuesta en texto plano: el atajo la dice con "Leer en voz alta".
function texto(t, status = 200) {
  return new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

async function siri(request, env) {
  const raw = await request.text();
  let dicho = raw;
  try {
    const j = JSON.parse(raw);
    dicho = j.texto ?? j.text ?? raw;
  } catch {}
  dicho = String(dicho || "").trim().slice(0, MAX_SIRI);
  if (!dicho) return texto("No te escuché. Dime de nuevo qué necesitas.");
  const t = norm(dicho);

  if (PARA_ANOTAR.test(t)) {
    if (!env.BUZON) return texto("Para anotar desde Siri falta crear el buzón en Cloudflare. Mientras, ábreme en la app y dímelo ahí.");
    const id = `m:${Date.now().toString().padStart(15, "0")}:${Math.random().toString(36).slice(2, 6)}`;
    await env.BUZON.put(id, JSON.stringify({ texto: dicho, fecha: new Date().toISOString() }), { expirationTtl: BUZON_TTL });
    return texto("Listo, lo dejé anotado. Se guarda en Vida apenas abras la app.");
  }
  if (DE_LA_APP.test(t)) return texto("Eso lo tengo guardado en tu teléfono, no en internet. Abre Vida y pregúntamelo ahí.");

  if (!env.GEMINI_API_KEY) return texto("Me falta la clave de Gemini en el intermediario.");
  const model = encodeURIComponent(env.GEMINI_MODEL || "gemini-flash-lite-latest");
  const res = await fetch(`${GEMINI}/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: `Eres JARVIS, el asistente de Diego, un joven chileno de Puerto Varas. Hablas español de Chile, relajado y cercano, sin exagerar. Tu respuesta se escucha por Siri: máximo 2 frases cortas, sin listas, sin emojis, sin markdown. Si no sabes algo, dilo; nunca inventes. Ahora en Chile: ${chileAhora()}.`,
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: dicho }] }],
      generationConfig: { maxOutputTokens: 250, temperature: 0.7 },
    }),
  });
  if (res.status === 429) return texto("Se me acabó la cuota gratis de Gemini por ahora. Prueba en un rato.");
  if (!res.ok) return texto("Gemini no me respondió. Prueba de nuevo en un ratito.");
  const data = await res.json().catch(() => null);
  const out = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").replace(/[*_#`]/g, "").trim();
  return texto(out || "No tengo una buena respuesta para eso.");
}
