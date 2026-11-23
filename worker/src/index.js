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
  ["Casa y trámites", /\b(perro|perrit|gato|gatit|mascota|veterinari|pasear|caca|casa|pieza|arriendo|aseo|ordenar|lavar|supermercado|compras|lista|tramite|pasaporte|visa|cuentas)/],
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
// "Bearer código" → "código", sin comillas, espacios raros ni saltos de línea.
function limpiarCodigo(v) {
  return String(v || "")
    .replace(/[\u00a0\u200b-\u200d\ufeff]/g, " ")
    .replace(/[“”"'‘’]/g, "")
    .trim()
    .replace(/^bearer\s*:?\s*/i, "")
    .trim();
}

// Cómo llegó el último pedido del atajo (sin el código ni lo que dijiste), para encontrar errores de configuración.
async function diagnostico(env, request, auth, codigo, cuerpo) {
  let json = null;
  try {
    json = Object.keys(JSON.parse(cuerpo));
  } catch {}
  const d = {
    fecha: new Date().toISOString(),
    metodo: request.method,
    ruta: new URL(request.url).pathname,
    tipo: request.headers.get("Content-Type"),
    encabezados: [...request.headers.keys()].filter((k) => !/^(cf-|x-forwarded|x-real-ip|cdn-loop|true-client)/.test(k)),
    auth: { largo: auth.length, empiezaBearer: /^bearer /i.test(auth.trim()), largoCodigo: codigo.length, raros: /[^\x20-\x7e]/.test(auth) },
    cuerpo: { largo: cuerpo.length, json },
  };
  await env.BUZON.put("diag:siri", JSON.stringify(d), { expirationTtl: 86400 });
}

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
    if (/^\/siri\/?$/i.test(decodeURIComponent(url.pathname).trim())) {
      // En la app Atajos es fácil que se cuele un espacio, comillas o un salto de línea: se perdona.
      // El código puede venir en el encabezado Authorization o, más simple, como campo "codigo" del JSON.
      const cuerpo = await request.clone().text().catch(() => "");
      let delCuerpo = "";
      try {
        delCuerpo = String(JSON.parse(cuerpo)?.codigo ?? "");
      } catch {}
      const codigo = limpiarCodigo(auth) || limpiarCodigo(delCuerpo);
      if (env.BUZON) await diagnostico(env, request, auth, codigo, cuerpo).catch(() => {});
      if (request.method !== "POST") return texto("El atajo tiene que usar el método POST (en Get Contents of URL, Method: POST).", 405);
      const tokens = [env.SIRI_TOKEN, env.ACCESS_TOKEN].filter(Boolean).map((t) => limpiarCodigo(t));
      let ok = false;
      for (const t of tokens) ok = (await iguales(codigo, t)) || ok;
      if (!ok) return texto(codigo ? "El código de acceso del atajo no es correcto. Revísalo en la app Atajos." : "Al atajo le falta tu código: agrégalo como campo codigo en el cuerpo JSON.", 401);
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
    // Aviso de prueba: llega en segundos, para confirmar que las notificaciones funcionan.
    if (url.pathname === "/push/prueba" && request.method === "POST") {
      if (!env.BUZON || !env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return fail(501, "Faltan el buzón o las claves de avisos");
      const b = await request.json().catch(() => null);
      const dev = b && typeof b.id === "string" ? await leerAparato(env, b.id) : null;
      if (!dev || !(await iguales(dev.k, String(b.k || "")))) return fail(404, "Este teléfono no está registrado: toca Activar avisos");
      if (!dev.sub) return fail(409, "Este teléfono no tiene permiso de avisos: toca Activar avisos");
      await env.BUZON.put(`dev:${b.id}`, JSON.stringify({ ...dev, cola: [...(dev.cola || []), { titulo: "JARVIS", cuerpo: "Prueba: así te van a llegar los avisos." }].slice(-10) }));
      const r = await empujar(dev.sub.endpoint, env, fetch);
      return r >= 200 && r < 300 ? json({ ok: true }) : fail(502, `Apple no aceptó el aviso (${r})`);
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
      await indexar(env, b.id);
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
      await indexar(env, b.id);
      return json({ ok: true });
    }
    if (url.pathname === "/avisos/borrar" && request.method === "POST") {
      const { id } = await request.json().catch(() => ({}));
      if (env.BUZON && typeof id === "string") {
        await env.BUZON.delete(`dev:${id}`);
        await indexar(env, id, true);
      }
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
    // Si es JSON, solo vale el texto dictado (nunca el código que viene al lado).
    dicho = j && typeof j === "object" ? (j.texto ?? j.text ?? "") : raw;
  } catch {}
  dicho = String(dicho || "").trim().slice(0, MAX_SIRI);
  if (!dicho) return texto("No te escuché. Dime de nuevo qué necesitas.");
  const t = norm(dicho);

  // ¿Qué tengo hoy, mañana, el viernes? Se responde con la agenda que mandó la app (sin abrirla).
  if (AGENDA.test(t) && env.BUZON) {
    const r = await agendaDe(env, t);
    if (r) return texto(r);
  }
  // ¿Es la respuesta a "¿cuándo te lo recuerdo?" (lo que preguntó la vez anterior, hace menos de 5 minutos)?
  let rec = null;
  const pend = env.BUZON ? JSON.parse((await env.BUZON.get("pend:siri")) || "null") : null;
  if (pend && /^(no|nada|olvidalo|dejalo|cancela)\b/.test(t)) {
    await env.BUZON.delete("pend:siri");
    return texto("Ya, no lo agendo.");
  }
  if (pend && /\d|\b(hoy|manana|pasado|lunes|martes|miercoles|jueves|viernes|sabado|domingo|ahora|altiro|al tiro|tarde|noche|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|media|cuarto)\b/.test(t) && !PARA_ANOTAR.test(t)) {
    const ans = /^(\d{1,2}(?:[:.]\d{2})?|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)$/.test(t) ? `a las ${t}` : t;
    const r = recordatorioSiri(norm(`recuerdame ${pend.texto} ${pend.dia || ""} ${ans}`), Date.now());
    if (r && !r.falta) rec = { ...r, completado: true };
  }
  // Reglas rápidas ("recuérdame X en 10 minutos"); si no alcanzan, Gemini razona la frase.
  if (!rec) rec = recordatorioSiri(t, Date.now());
  let intento = null;
  // Gemini solo cuando puede ser un aviso o algo con hora (lo demás se resuelve sin gastar cuota).
  const quizasAviso = /\b(recuerd|record|avis|agend|alarma|notific)/.test(t) || /\b(a las?|ahora|ahorita|altiro|en \d+|dentro de|manana|esta (?:tarde|noche)|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(t);
  if ((!rec || rec.falta) && (pend || quizasAviso) && !DE_LA_APP.test(t)) {
    intento = await entenderSiri(env, dicho, pend).catch(() => null);
    if (intento?.tipo === "recordatorio") {
      if (intento.fecha && intento.hora) rec = { ...instanteDe(intento.fecha, intento.hora, Date.now()), texto: intento.texto, completado: !!pend };
      else rec = { falta: intento.fecha ? "hora" : "cuando", dia: intento.fecha ? diaTxt(intento.fecha, fechaChile()) : "", fecha: intento.fecha || "", texto: intento.texto };
    } else if (intento) rec = null;
  }
  if (pend && rec && !rec.falta) await env.BUZON.delete("pend:siri");
  if (rec?.falta && env.BUZON) {
    await env.BUZON.put("pend:siri", JSON.stringify({ texto: rec.texto, dia: rec.dia || "" }), { expirationTtl: 300 });
    const q = rec.falta === "hora" ? `¿A qué hora ${String(rec.dia || "").replace("manana", "mañana")} te recuerdo ${rec.texto.toLowerCase()}?` : `¿Cuándo te recuerdo ${rec.texto.toLowerCase()}?`;
    return texto(q.replace(/\s+/g, " "));
  }
  if (rec && !rec.falta && env.BUZON) {
    let n = 0;
    for (const id of await idsAparatos(env)) {
      const dev = await leerAparato(env, id);
      if (!dev?.sub) continue;
      const avisos = [...(dev.avisos || []), { id: `siri-${Date.now()}`, t: rec.t, titulo: "JARVIS", cuerpo: rec.texto }].slice(-MAX_AVISOS);
      await env.BUZON.put(`dev:${id}`, JSON.stringify({ ...dev, avisos }));
      n++;
    }
    const id = `m:${Date.now().toString().padStart(15, "0")}:${Math.random().toString(36).slice(2, 6)}`;
    // A la app le llega en forma clara, para que también quede en Recordatorios.
    await env.BUZON.put(id, JSON.stringify({ texto: `recuérdame ${rec.texto.toLowerCase()} ${rec.cuandoApp || rec.cuando}`, fecha: new Date().toISOString() }), { expirationTtl: BUZON_TTL });
    return texto(n ? `Listo, te aviso ${rec.cuando}: ${rec.texto.toLowerCase()}.` : `Lo anoté para ${rec.cuando}, pero tu iPhone no tiene los avisos activados: en Vida ve a Más, Recordatorios, Avisos.`);
  }
  // Algo que ya hizo ("saqué al Apolo a las 15:24"): queda anotado (a esa hora) y se guarda en su área al abrir la app.
  if (intento?.tipo === "registro" && env.BUZON) {
    const id = `m:${Date.now().toString().padStart(15, "0")}:${Math.random().toString(36).slice(2, 6)}`;
    await env.BUZON.put(id, JSON.stringify({ texto: dicho, fecha: new Date().toISOString(), ...(intento.hora ? { hora: intento.hora } : {}) }), { expirationTtl: BUZON_TTL });
    return texto(`Anotado${intento.hora ? ` a las ${intento.hora}` : ""}: ${intento.texto.toLowerCase()}. Queda en ${areaDe(t)}.`);
  }
  if (intento && (intento.tipo === "pregunta" || intento.tipo === "conversacion") && intento.respuesta && !DE_LA_APP.test(t) && !PARA_ANOTAR.test(t)) return texto(intento.respuesta);
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
  for (const id of await idsAparatos(env)) {
    const k = { name: `dev:${id}` };
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
        await indexar(env, id, true);
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
// Los aparatos se guardan en un índice (una lectura) en vez de listar el KV en cada minuto:
// el plan gratis de Cloudflare permite pocas listas al día.
export async function idsAparatos(env) {
  const idx = JSON.parse((await env.BUZON.get("idx:devs")) || "null");
  if (Array.isArray(idx)) return idx;
  const lista = await env.BUZON.list({ prefix: "dev:" });
  const ids = lista.keys.map((k) => k.name.slice(4));
  await env.BUZON.put("idx:devs", JSON.stringify(ids));
  return ids;
}
async function indexar(env, id, quitar = false) {
  const ids = await idsAparatos(env);
  const nuevo = quitar ? ids.filter((x) => x !== id) : ids.includes(id) ? ids : [...ids, id];
  if (nuevo.length !== ids.length) await env.BUZON.put("idx:devs", JSON.stringify(nuevo));
}

export function fechaChile(ahora = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ahora)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const sumarDias = (f, n) => new Date(Date.parse(f + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const yy = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1] : xs[0] || "");

export async function agendaDe(env, t, ahora = Date.now()) {
  let agenda = null;
  for (const id of await idsAparatos(env)) {
    const k = { name: `dev:${id}` };
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

// ---------- Recordatorios dichos a Siri ----------
const NUMS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15, veinte: 20, treinta: 30, cuarenta: 40 };
const numero = (x) => (/^\d+$/.test(x) ? Number(x) : NUMS[x]);

// Hora de Chile → instante UTC (milisegundos).
function chileAUtcMs(fecha, minutos) {
  const [y, mo, d] = fecha.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, Math.floor(minutos / 60), minutos % 60);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
  return guess - (local - guess);
}
function minutosChile(ahora) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ahora)).map((x) => [x.type, x.value]));
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
}
const hhmmTxt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// "recuerdame sacar al perro en 10 minutos", "avisame a las 5 que llame a mi mama", "tengo que comprar pan altiro".
export function recordatorioSiri(t, ahora = Date.now()) {
  let m = t.match(/^(?:ya )?(?:recuerdame|recordarme|recuerdeme|avisame|avisarme|no me dejes olvidar|ponme un recordatorio(?: de| para)?|pon un recordatorio(?: de| para)?)\s+(?:de |que |para |a (?!las?\b))?(.+)$/);
  let resto = m?.[1];
  let altiro = false;
  if (!resto) {
    m = t.match(/^(?:ya )?(?:tengo que|tengo q|debo|necesito|hay que)\s+(.+?)\s+(ahora|ahorita|altiro|al tiro|ahora mismo|ya mismo)$/);
    if (!m) return null;
    resto = m[1];
    altiro = true;
  }
  resto = resto
    .replace(/\b(a las?|para las?|tipo|como a las?) (\d{1,2}) (\d{2})\b(?! ?(?:minutos?|min|horas?))/g, "$1 $2:$3") // el dictado escribe "15 16" por "15:16"
    .replace(/\b(a las?|para las?|tipo|como a las?) (\d{1,2}) y media\b/g, "$1 $2:30")
    .replace(/\b(a las?|para las?|tipo|como a las?) (\d{1,2}) y cuarto\b/g, "$1 $2:15")
    .replace(/\bdentro de\b/g, "en").replace(/\b(?:una |1 )?hora y media\b/g, "90 minutos").replace(/\bmedia hora\b/g, "30 minutos").replace(/\b(?:un )?cuarto de hora\b/g, "15 minutos");
  const hoy = fechaChile(ahora);
  const ahoraMin = minutosChile(ahora);
  let cuandoMs = null;
  let cuando = "";
  let quitar = null;
  if (altiro) {
    cuandoMs = ahora + 10 * 60000;
    cuando = "en 10 minutos";
  } else if ((m = resto.match(/\ben (\d+|un|una|dos|tres|cuatro|cinco|diez|quince|veinte|treinta|cuarenta) (minutos?|min|horas?|hrs?)( y media)?\b/))) {
    const n = numero(m[1]);
    const min = /^h/.test(m[2]) ? n * 60 + (m[3] ? 30 : 0) : n;
    cuandoMs = ahora + min * 60000;
    cuando = `a las ${hhmmTxt((ahoraMin + min) % 1440)}`;
    quitar = m[0];
  } else if ((m = resto.match(/\b(?:a las?|tipo|como a las?|para las?) (\d{1,2})(?:[:.](\d{2}))?(?: ?(?:hrs?|horas))?( de la manana| de la tarde| de la noche| am| pm)?\b/))) {
    let h = Number(m[1]);
    const mi = Number(m[2] || 0);
    if (h > 23 || mi > 59) return null;
    // Qué día: hoy (por defecto), mañana, pasado mañana o un día de la semana.
    const sinDeLa = resto.replace(/de la manana/, "");
    const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
    const ds = sinDeLa.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
    let otroDia = null;
    if (/\bpasado manana\b/.test(sinDeLa)) otroDia = sumarDias(hoy, 2);
    else if (/\bmanana\b/.test(sinDeLa)) otroDia = sumarDias(hoy, 1);
    else if (ds) {
      const hoyDow = new Date(hoy + "T12:00:00Z").getUTCDay();
      const dif = (DIAS.indexOf(ds[1]) - hoyDow + 7) % 7 || 7;
      otroDia = sumarDias(hoy, dif);
    }
    if (/tarde|noche|pm/.test(m[3] || "") && h < 12) h += 12;
    else if (!m[3] && h >= 1 && h <= 7 && !otroDia) h += 12; // hoy, "a las 3" casi siempre es en la tarde
    let fecha = otroDia || hoy;
    let total = h * 60 + mi;
    if (!otroDia && !m[3] && h < 12 && total <= ahoraMin && (h + 12) * 60 + mi > ahoraMin) total += 720;
    // Una hora que acaba de pasar (o "hoy" a una hora ya pasada): se avisa al tiro en vez de mañana.
    let yaPaso = false;
    if (!otroDia && total <= ahoraMin) {
      if (ahoraMin - total <= 2 || /\bhoy\b/.test(sinDeLa)) yaPaso = true;
      else fecha = sumarDias(hoy, 1);
    }
    cuandoMs = yaPaso ? ahora + 60000 : chileAUtcMs(fecha, total);
    const dif = Math.round((Date.parse(fecha) - Date.parse(hoy)) / 864e5);
    cuando = yaPaso ? `en un minuto (las ${hhmmTxt(total)} ya pasaron)` : `${dif === 0 ? "hoy" : dif === 1 ? "mañana" : dif === 2 ? "pasado mañana" : `el ${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][new Date(fecha + "T12:00:00Z").getUTCDay()]}`} a las ${hhmmTxt(total)}`;
    quitar = m[0];
  } else {
    // Es un recordatorio pero sin hora: se pregunta (y la próxima vez que hables con Siri se completa).
    const dia = (resto.match(/\b(pasado manana|manana|hoy|esta (?:tarde|noche)|(?:el )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/) || [])[0] || "";
    const tx = resto.replace(dia || "\u0000", " ").replace(/\s+/g, " ").trim().replace(/^(?:de |que |para |a )+/, "").replace(/\s+(?:de|que|para|a)$/, "").trim();
    if (!tx || tx.length > 200) return null;
    return { falta: dia ? "hora" : "cuando", dia, texto: tx.charAt(0).toUpperCase() + tx.slice(1) };
  }
  const texto = resto
    .replace(quitar || "\u0000", " ")
    .replace(/\b(hoy|pasado manana|manana|(?:el |este )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: que viene)?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:de |que |para |a )+/, "")
    .replace(/\s+(?:de|que|para|a)$/, "")
    .trim();
  if (!texto || texto.length > 200) return null;
  return { t: cuandoMs, cuando, texto: texto.charAt(0).toUpperCase() + texto.slice(1) };
}

// ---------- Gemini entiende lo que le dices a Siri ----------
function diaTxt(fecha, hoy) {
  const dif = Math.round((Date.parse(fecha) - Date.parse(hoy)) / 864e5);
  return dif === 0 ? "hoy" : dif === 1 ? "mañana" : dif === 2 ? "pasado mañana" : `el ${DIAS_TXT[new Date(fecha + "T12:00:00Z").getUTCDay()]}`;
}
// Fecha y hora de Chile → instante, con el texto para decirlo. Si ya pasó (hoy), avisa en un minuto.
export function instanteDe(fecha, hora, ahora = Date.now()) {
  const hoy = fechaChile(ahora);
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m;
  let t = chileAUtcMs(fecha, total);
  if (t <= ahora) return { t: ahora + 60000, cuando: `en un minuto (las ${hora} ya pasaron)`, cuandoApp: "en 1 minuto" };
  return { t, cuando: `${diaTxt(fecha, hoy)} a las ${hora}`, cuandoApp: `${fecha === hoy ? "hoy" : fecha === sumarDias(hoy, 1) ? "mañana" : `el ${Number(fecha.slice(8))} de ${["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][Number(fecha.slice(5, 7)) - 1]}`} a las ${hora}` };
}

export async function entenderSiri(env, dicho, pend, ahora = Date.now(), fetcher = fetch) {
  if (!env.GEMINI_API_KEY) return null;
  const hoy = fechaChile(ahora);
  const ahoraTxt = `${DIAS_TXT[new Date(hoy + "T12:00:00Z").getUTCDay()]} ${hoy}, ${hhmmTxt(minutosChile(ahora))}`;
  const model = encodeURIComponent(env.GEMINI_MODEL || "gemini-flash-lite-latest");
  const sistema = `Eres JARVIS, el asistente de Diego (Chile, habla chileno). Clasifica lo que Diego dijo por voz (puede venir mal dictado) y devuelve SOLO el JSON pedido.
Ahora en Chile es ${ahoraTxt}.
- "recordatorio": quiere que le avises algo en el FUTURO (recuérdame, avísame, agenda, ponme un recordatorio, tengo X a las..., quiero que me envíes un recordatorio...). texto = qué hacer, corto, en infinitivo y sin la hora ("ver el seminario Fénix"). fecha = AAAA-MM-DD y hora = HH:MM en 24 horas. Calcula tú: "en 10 minutos" = ahora + 10; "a las cuatro" sin decir mañana/noche = la próxima vez que sean las 4 (si ahora es de día y las 4 ya pasaron en la mañana, son las 16:00); "mañana" sin hora = fecha de mañana y hora vacía. Si no dijo cuándo, deja fecha y hora vacías.
- "registro": cuenta algo que YA hizo o le pasó (saqué al perro, gasté, fui, comí, me duele). texto = lo que hizo, corto. hora = HH:MM si dijo a qué hora pasó ("ahora" = ${hhmmTxt(minutosChile(ahora))}), si no vacía. fecha vacía.
- "pregunta": pregunta algo. respuesta = la respuesta para escuchar, máximo 2 frases cortas, en chileno relajado, sin emojis ni listas. Nunca inventes datos.
- "conversacion": saludo o charla. respuesta = respuesta corta.${pend ? `
OJO: hace un rato le preguntaste a Diego cuándo recordarle "${pend.texto}"${pend.dia ? ` (${pend.dia})` : ""}. Si ahora dice un día u hora, es tipo "recordatorio" con ese texto.` : ""}`;
  const res = await fetcher(`${GEMINI}/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: "user", parts: [{ text: dicho }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 300,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            tipo: { type: "STRING", enum: ["recordatorio", "registro", "pregunta", "conversacion"] },
            texto: { type: "STRING" },
            fecha: { type: "STRING" },
            hora: { type: "STRING" },
            respuesta: { type: "STRING" },
          },
          required: ["tipo", "texto"],
        },
      },
    }),
  });
  if (!res?.ok) return null;
  const data = await res.json();
  const j = JSON.parse((data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("") || "null");
  if (!j || !["recordatorio", "registro", "pregunta", "conversacion"].includes(j.tipo)) return null;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(j.fecha || "") ? j.fecha : "";
  const hora = /^\d{1,2}:\d{2}$/.test(j.hora || "") ? j.hora.padStart(5, "0") : "";
  const tx = String(j.texto || "").replace(/[*_#`]/g, "").trim().slice(0, 200);
  return { tipo: j.tipo, texto: tx ? tx.charAt(0).toUpperCase() + tx.slice(1) : "", fecha, hora: j.tipo === "recordatorio" && !fecha && hora ? "" : hora, ...(j.tipo === "recordatorio" && !fecha && hora ? { fecha: hoy, hora } : {}), respuesta: String(j.respuesta || "").replace(/[*_#`]/g, "").trim() };
}
