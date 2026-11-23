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
//
// Y los avisos en el iPhone (notificaciones push, gratis):
//   GET  /push/clave       → la clave pública para suscribirse.
//   POST /avisos           → la app guarda sus próximos avisos (recordatorios, resumen del día, rutina).
//   POST /avisos/borrar    → la app apaga los avisos.
//   GET  /avisos/pendientes → el teléfono (service worker) lee el texto de lo que llegó.
//   Cada 5 minutos (cron) se revisa qué toca y se manda un "toque" push sin contenido; el texto
//   lo pide el teléfono después. Así no hace falta cifrar el mensaje y en Cloudflare no queda nada sensible.

const GEMINI = "https://generativelanguage.googleapis.com";
const ALLOWED_METHODS = new Set(["streamGenerateContent", "generateContent"]);
const MAX_BODY = 64 * 1024;
const MAX_SIRI = 500; // caracteres de lo dictado
const BUZON_TTL = 14 * 24 * 3600; // lo no leído se borra solo a las 2 semanas

// Preguntas o pedidos (van a la agenda o a Gemini). Todo lo demás es algo que Diego cuenta: se guarda.
const PREGUNTA = /^(que|como|cuando|cuanto|cuanta|cuantos|cuantas|donde|por que|cual|cuales|quien|puedes|podrias|me puedes|dime|explicame|ayudame|recomiendame|sabes|crees|opinas|deberia|conviene|busca|traduce|dame|ensename|hay)\b/;
// La agenda que la app manda junto con los avisos (sin plata) permite responder esto sin abrir la app.
const AGENDA = /\b(que (tengo|hay|me toca)|mi agenda|mis (turnos|recordatorios|pendientes))\b/;
// En qué área de la vida queda lo que cuenta (la misma idea que web/src/areas/calc.ts, en corto).
const AREAS = [
  ["Amor", /\b(polola|pololo|novia|novio|pareja|cita|aniversario|beso|mi ex\b|terminamos|enamorad)/],
  ["Salud", /\b(duele|dolor|lesion|tobillo|rodilla|espalda|resfri|gripe|fiebre|enferm|medico|doctor|dentista|kine|remedio|pastilla|dormi|sueno|insomnio|agua)/],
  ["Ánimo", /\b(triste|feliz|contento|bajoneado|bajon|ansios|estres|angustia|me siento|ando|motivad|frustrad|enojad|cansad|reventad)/],
  ["Dinero", /\b(gaste|me gaste|pague|compre|me pagaron|sueldo|propina|plata|lucas|luca|pesos|ahorr|deuda|debo|presupuesto|cobre|vendi)/],
  ["Fútbol", /\b(futbol|partido|gol|goles|asistencia|ganamos|perdimos|empatamos|jugue|cancha|club|pichanga)/],
  ["Entrenamiento", /\b(gym|gimnasio|entrene|entreno|pesas|pierna|correr|corri|trote|km|cardio)/],
  ["Estudios", /\b(estudie|estudiar|ingles|clase|prueba|examen|ensayo|curso|universidad|preu|tarea)/],
  ["Trabajo", /\b(trabaje|trabajo|turno|pega|jefe|jefa|cliente)/],
  ["Familia y amigos", /\b(mama|papa|abuel|herman|familia|amigo|amiga|amigos|carrete|junta|cumpleanos|cumple|asado)/],
  ["Casa y trámites", /\b(casa|pieza|arriendo|aseo|ordenar|lavar|supermercado|compras|lista|tramite|pasaporte|visa|cuentas)/],
  ["Ocio y hobbies", /\b(pelicula|peli|serie|netflix|cine|concierto|musica|guitarra|videojuego|play|libro|paseo|playa|lago|volcan|pesca|camping)/],
  ["Metas y proyectos", /\b(meta|proyecto|working holiday|australia|viaje|negocio)/],
];
const areaDe = (t) => (AREAS.find(([, re]) => re.test(` ${t} `)) || ["tus notas"])[0];

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

const MAX_AVISOS = 400;

// Compara códigos en tiempo constante (se comparan sus huellas SHA-256), para no dar pistas por el tiempo de respuesta.
async function iguales(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(String(a))), crypto.subtle.digest("SHA-256", enc.encode(String(b)))]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

async function leerAparato(env, id) {
  if (!/^[a-z0-9]{16,40}$/.test(id || "")) return null;
  const v = await env.BUZON.get(`dev:${id}`);
  return v ? JSON.parse(v) : null;
}

export default {
  // Cada 5 minutos: manda los avisos que ya tocan.
  async scheduled(_evento, env, ctx) {
    ctx?.waitUntil?.(enviarAvisos(env));
    if (!ctx?.waitUntil) await enviarAvisos(env);
  },

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

    // El service worker del teléfono pide el texto de sus avisos con su propia clave de aparato.
    if (url.pathname === "/avisos/pendientes" && request.method === "GET") {
      if (!env.BUZON) return json({ mensajes: [] });
      const id = url.searchParams.get("id") || "";
      const dev = await leerAparato(env, id);
      if (!dev || !(await iguales(dev.k, url.searchParams.get("k") || ""))) return fail(401, "Aparato desconocido");
      const mensajes = dev.cola || [];
      if (mensajes.length) await env.BUZON.put(`dev:${id}`, JSON.stringify({ ...dev, cola: [] }));
      return json({ mensajes });
    }

    // El Atajo de Siri no manda "Origin" (no es una página): basta con el código de acceso.
    if (url.pathname === "/siri") {
      if (request.method !== "POST") return fail(405, "Solo POST");
      const tokens = [env.SIRI_TOKEN, env.ACCESS_TOKEN].filter(Boolean);
      let ok = false;
      for (const t of tokens) ok = (await iguales(auth, `Bearer ${t}`)) || ok;
      if (!ok) return texto("El código de acceso del atajo no es correcto. Revísalo en la app Atajos.", 401);
      return siri(request, env);
    }

    if (!okOrigin) return fail(403, "Origen no permitido");
    if (!env.ACCESS_TOKEN || !(await iguales(auth, `Bearer ${env.ACCESS_TOKEN}`))) return fail(401, "Código de acceso incorrecto");

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
    if (url.pathname === "/push/clave" && request.method === "GET") {
      if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return fail(501, "Faltan las claves de los avisos en el intermediario");
      return json({ clave: env.VAPID_PUBLIC });
    }
    if (url.pathname === "/avisos" && request.method === "POST") {
      if (!env.BUZON) return fail(501, "Falta el buzón (KV) en el intermediario");
      const b = await request.json().catch(() => null);
      if (!b || !/^[a-z0-9]{16,40}$/.test(b.id || "") || typeof b.k !== "string" || !b.suscripcion?.endpoint || !/^https:\/\//.test(b.suscripcion.endpoint)) return fail(400, "Datos de avisos inválidos");
      const antes = (await leerAparato(env, b.id)) || {};
      const enviados = new Set(antes.enviados || []);
      const avisos = (Array.isArray(b.avisos) ? b.avisos : [])
        .slice(0, MAX_AVISOS)
        .filter((a) => a && typeof a.id === "string" && Number.isFinite(a.t) && !enviados.has(a.id))
        .map((a) => ({ id: a.id.slice(0, 80), t: a.t, titulo: String(a.titulo || "JARVIS").slice(0, 60), cuerpo: String(a.cuerpo || "").slice(0, 240) }));
      // Agenda de los próximos días (textos cortos, sin plata) para responder "¿qué tengo mañana?" por Siri.
      const agenda = {};
      for (const [f, cosas] of Object.entries(b.agenda && typeof b.agenda === "object" ? b.agenda : {}).slice(0, 8))
        if (/^\d{4}-\d{2}-\d{2}$/.test(f) && Array.isArray(cosas)) agenda[f] = cosas.slice(0, 12).map((c) => String(c).slice(0, 120));
      await env.BUZON.put(`dev:${b.id}`, JSON.stringify({ k: b.k, sub: b.suscripcion, avisos, agenda, enviados: [...enviados].slice(-300), cola: antes.cola || [] }));
      return json({ ok: true, avisos: avisos.length });
    }
    // Solo la agenda (sin avisos push): para que Siri responda "¿qué tengo mañana?" aunque no actives las notificaciones.
    if (url.pathname === "/agenda" && request.method === "POST") {
      if (!env.BUZON) return fail(501, "Falta el buzón (KV) en el intermediario");
      const b = await request.json().catch(() => null);
      if (!b || !/^[a-z0-9]{16,40}$/.test(b.id || "") || typeof b.k !== "string") return fail(400, "Datos de agenda inválidos");
      const antes = (await leerAparato(env, b.id)) || { avisos: [], enviados: [], cola: [] };
      if (antes.k && !(await iguales(antes.k, b.k))) return fail(401, "Aparato desconocido");
      const agenda = {};
      for (const [f, cosas] of Object.entries(b.agenda && typeof b.agenda === "object" ? b.agenda : {}).slice(0, 8))
        if (/^\d{4}-\d{2}-\d{2}$/.test(f) && Array.isArray(cosas)) agenda[f] = cosas.slice(0, 12).map((c) => String(c).slice(0, 120));
      await env.BUZON.put(`dev:${b.id}`, JSON.stringify({ ...antes, k: b.k, agenda }));
      return json({ ok: true });
    }
    if (url.pathname === "/avisos/borrar" && request.method === "POST") {
      const { id } = await request.json().catch(() => ({}));
      if (env.BUZON && typeof id === "string") await env.BUZON.delete(`dev:${id}`);
      return json({ ok: true });
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

  // ¿Qué tengo hoy, mañana, el viernes? Se responde con la agenda que mandó la app (sin abrirla).
  if (AGENDA.test(t) && env.BUZON) {
    const r = await agendaDe(env, t);
    if (r) return texto(r);
  }
  // Algo que cuenta o pide anotar: queda en el buzón y se guarda en su área al abrir la app.
  if (PARA_ANOTAR.test(t) || !PREGUNTA.test(t)) {
    if (!env.BUZON) return texto("Para anotar desde Siri falta crear el buzón en Cloudflare. Mientras, ábreme en la app y dímelo ahí.");
    const id = `m:${Date.now().toString().padStart(15, "0")}:${Math.random().toString(36).slice(2, 6)}`;
    await env.BUZON.put(id, JSON.stringify({ texto: dicho, fecha: new Date().toISOString() }), { expirationTtl: BUZON_TTL });
    const a = areaDe(t);
    return texto(`Listo, lo guardo en ${a}. Queda en Vida apenas abras la app.`);
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

// ---------- Avisos push (Web Push con VAPID, sin contenido) ----------
export async function enviarAvisos(env, ahora = Date.now(), fetcher = fetch) {
  if (!env.BUZON || !env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return 0;
  let n = 0;
  const lista = await env.BUZON.list({ prefix: "dev:" });
  for (const k of lista.keys) {
    const dev = JSON.parse((await env.BUZON.get(k.name)) || "null");
    if (!dev?.sub) continue;
    const tocan = dev.avisos.filter((a) => a.t <= ahora);
    if (!tocan.length) continue;
    // Si el teléfono estuvo apagado mucho rato, no se manda una avalancha: solo lo de las últimas 6 horas.
    const frescos = tocan.filter((a) => ahora - a.t < 6 * 3600_000);
    const resto = dev.avisos.filter((a) => a.t > ahora);
    const enviados = [...(dev.enviados || []), ...tocan.map((a) => a.id)].slice(-300);
    const cola = [...(dev.cola || []), ...frescos.map(({ titulo, cuerpo }) => ({ titulo, cuerpo }))].slice(-10);
    if (frescos.length) {
      const r = await empujar(dev.sub.endpoint, env, fetcher);
      if (r === 404 || r === 410) {
        await env.BUZON.delete(k.name); // la suscripción ya no existe (se desinstaló o quitó el permiso)
        continue;
      }
      n += frescos.length;
    }
    await env.BUZON.put(k.name, JSON.stringify({ ...dev, avisos: resto, enviados, cola }));
  }
  return n;
}

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

// Firma VAPID (JWT ES256) con la clave privada guardada como secreto.
export async function firmaVapid(endpoint, env, ahora = Date.now()) {
  const pub = deB64u(env.VAPID_PUBLIC); // 65 bytes: 0x04 || x || y
  const jwk = { kty: "EC", crv: "P-256", x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: env.VAPID_PRIVATE, ext: true };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const datos = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || "https://github.com/trabajodiegonahue-droid/Jarvis-Diego" })}`;
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(datos));
  return `vapid t=${datos}.${b64u(firma)}, k=${env.VAPID_PUBLIC}`;
}

async function empujar(endpoint, env, fetcher) {
  try {
    const r = await fetcher(endpoint, { method: "POST", headers: { Authorization: await firmaVapid(endpoint, env), TTL: "3600", Urgency: "high", "Content-Length": "0" } });
    return r.status;
  } catch {
    return 0;
  }
}

// ---------- Agenda por Siri ----------
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const DIAS_TXT = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export function fechaChile(ahora = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ahora)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const sumarDias = (f, n) => new Date(Date.parse(f + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const yy = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1] : xs[0] || "");

export async function agendaDe(env, t, ahora = Date.now()) {
  const lista = await env.BUZON.list({ prefix: "dev:" });
  let agenda = null;
  for (const k of lista.keys) {
    const dev = JSON.parse((await env.BUZON.get(k.name)) || "null");
    if (dev?.agenda && Object.keys(dev.agenda).length) {
      agenda = dev.agenda;
      break;
    }
  }
  if (!agenda) return null;
  const hoy = fechaChile(ahora);
  const dow = new Date(hoy + "T12:00:00Z").getUTCDay();
  let dias = [hoy];
  let cuando = "Hoy";
  if (/\bpasado manana\b/.test(t)) [dias, cuando] = [[sumarDias(hoy, 2)], "Pasado mañana"];
  else if (/\bmanana\b/.test(t) && !/\bde la manana\b/.test(t)) [dias, cuando] = [[sumarDias(hoy, 1)], "Mañana"];
  else if (/\bsemana\b/.test(t)) [dias, cuando] = [Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i)), "Esta semana"];
  else {
    const m = t.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
    if (m) {
      const n = (DIAS.indexOf(m[1]) - dow + 7) % 7 || 7;
      dias = [sumarDias(hoy, n)];
      cuando = `El ${DIAS_TXT[DIAS.indexOf(m[1])]}`;
    }
  }
  if (dias.length === 1) {
    const cosas = agenda[dias[0]];
    if (!cosas) return `${cuando} no lo tengo en la agenda que mandó la app. Abre Vida para actualizarla.`;
    return cosas.length ? `${cuando} tienes ${yy(cosas.slice(0, 6))}.` : `${cuando} no tienes nada anotado.`;
  }
  const partes = dias.filter((f) => agenda[f]?.length).map((f) => `el ${DIAS_TXT[new Date(f + "T12:00:00Z").getUTCDay()]}, ${yy(agenda[f].slice(0, 3))}`);
  return partes.length ? `${cuando}: ${partes.slice(0, 5).join("; ")}.` : `${cuando} no tienes nada anotado fuera de tu rutina.`;
}
