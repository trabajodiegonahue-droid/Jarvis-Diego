import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.js";

const env = { ALLOWED_ORIGIN: "https://ok.github.io", ACCESS_TOKEN: "secreto", GEMINI_API_KEY: "AIzaREAL", GEMINI_MODEL: "gemini-flash-lite-latest" };
const req = (path, init = {}) =>
  new Request("https://jarvis.workers.dev" + path, {
    method: "POST",
    headers: { Origin: "https://ok.github.io", Authorization: "Bearer secreto", "Content-Type": "application/json", ...(init.headers || {}) },
    body: init.method === "GET" ? undefined : init.body ?? "{}",
    ...(init.method ? { method: init.method } : {}),
  });

afterEach(() => vi.unstubAllGlobals());

describe("intermediario", () => {
  it("reenvía a Gemini con la clave y el modelo del servidor", async () => {
    const f = vi.fn().mockResolvedValue(new Response("data: {}\n\n", { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", f);
    const res = await worker.fetch(req("/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://ok.github.io");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:streamGenerateContent?alt=sse");
    expect(init.headers["x-goog-api-key"]).toBe("AIzaREAL");
  });
  it("rechaza sin código, de otro origen o a otra ruta", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect((await worker.fetch(req("/v1beta/models/x:generateContent", { headers: { Authorization: "Bearer malo" } }), env)).status).toBe(401);
    expect((await worker.fetch(req("/v1beta/models/x:generateContent", { headers: { Origin: "https://otro.com" } }), env)).status).toBe(403);
    expect((await worker.fetch(req("/v1beta/files"), env)).status).toBe(404);
    expect((await worker.fetch(req("/v1beta/models/x:generateContent", { body: "x".repeat(70000) }), env)).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("responde al preflight CORS", async () => {
    const res = await worker.fetch(new Request("https://w.dev/v1beta/models/x:generateContent", { method: "OPTIONS", headers: { Origin: "https://ok.github.io" } }), env);
    expect(res.status).toBe(204);
  });

});

// KV falso en memoria (lo mismo que ofrece Cloudflare: put, get, list, delete).
function kvFalso() {
  const m = new Map();
  return {
    m,
    put: async (k, v) => void m.set(k, v),
    get: async (k) => m.get(k) ?? null,
    delete: async (k) => void m.delete(k),
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })) }),
  };
}
const siri = (texto, token = "secreto") => new Request("https://w.dev/siri", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });

describe("atajo de Siri y buzón", () => {
  it("lo que es para anotar queda en el buzón y la app lo lee y lo borra", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const BUZON = kvFalso();
    const e = { ...env, BUZON };
    const r = await worker.fetch(siri("Jarvis, gasté 5 mil en almuerzo"), e);
    expect(await r.text()).toBe("Listo, lo guardo en Dinero. Queda en Vida apenas abras la app.");
    expect(fetch).not.toHaveBeenCalled(); // no pasa por Gemini
    const lista = await (await worker.fetch(req("/buzon", { method: "GET", body: null }), e)).json();
    expect(lista.items.map((i) => i.texto)).toEqual(["Jarvis, gasté 5 mil en almuerzo"]);
    await worker.fetch(req("/buzon/borrar", { body: JSON.stringify({ ids: lista.items.map((i) => i.id) }) }), e);
    expect([...BUZON.m.keys()].filter((k) => k.startsWith("m:")).length).toBe(0);
  });
  it("el buzón solo se lee desde tu página y con tu código", async () => {
    const e = { ...env, BUZON: kvFalso() };
    expect((await worker.fetch(req("/buzon", { method: "GET", body: null, headers: { Origin: "https://otro.com" } }), e)).status).toBe(403);
    expect((await worker.fetch(req("/buzon", { method: "GET", body: null, headers: { Authorization: "Bearer x" } }), e)).status).toBe(401);
    expect((await worker.fetch(siri("gasté 5 mil", "malo"), e)).status).toBe(401);
  });
  it("las preguntas generales van a Gemini y vuelven como texto para leer en voz alta", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Mañana llueve en Puerto Varas, **lleva** paraguas." }] } }] })));
    vi.stubGlobal("fetch", f);
    const r = await worker.fetch(siri("¿qué es un mediocampista box to box?"), env);
    expect(await r.text()).toBe("Mañana llueve en Puerto Varas, lleva paraguas.");
    expect(f.mock.calls[0][0]).toContain("gemini-flash-lite-latest:generateContent");
  });
  it("lo que vive en el teléfono no se inventa", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const r = await worker.fetch(siri("¿cuánto llevo gastado este mes?"), env);
    expect(await r.text()).toMatch(/Abre Vida/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("avisos en el iPhone (push)", () => {
  async function claves() {
    const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = Buffer.from(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey))).toString("base64url");
    const d = (await crypto.subtle.exportKey("jwk", par.privateKey)).d;
    return { VAPID_PUBLIC: pub, VAPID_PRIVATE: d, par };
  }
  const SUB = { endpoint: "https://web.push.apple.com/abc123", keys: { p256dh: "x", auth: "y" } };
  const ID = "a1b2c3d4e5f6a7b8c9d0";

  it("la firma VAPID es un JWT ES256 válido para el servicio de push", async () => {
    const k = await claves();
    const { firmaVapid } = await import("../src/index.js");
    const h = await firmaVapid(SUB.endpoint, { ...env, ...k }, Date.UTC(2026, 10, 18, 12));
    const [, jwt, pk] = h.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(pk).toBe(k.VAPID_PUBLIC);
    const [hd, pl, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(pl, "base64url"))).toMatchObject({ aud: "https://web.push.apple.com" });
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k.par.publicKey, Buffer.from(sig, "base64url"), new TextEncoder().encode(`${hd}.${pl}`));
    expect(ok).toBe(true);
  });

  it("guarda los avisos, manda el toque a su hora y el teléfono lee el texto una vez", async () => {
    const k = await claves();
    const BUZON = kvFalso();
    const e = { ...env, ...k, BUZON };
    vi.stubGlobal("fetch", vi.fn());
    expect((await (await worker.fetch(req("/push/clave", { method: "GET", body: null }), e)).json()).clave).toBe(k.VAPID_PUBLIC);
    const t0 = Date.UTC(2026, 10, 18, 11, 0);
    const avisos = [
      { id: "m:2026-11-18", t: t0, titulo: "Buenos días, Diego", cuerpo: "Hoy: turno 14:00." },
      { id: "r:1", t: t0 + 3600_000, titulo: "Recordatorio", cuerpo: "Pagar la luz" },
    ];
    const r = await worker.fetch(req("/avisos", { body: JSON.stringify({ id: ID, k: "secreto-del-aparato", suscripcion: SUB, avisos }) }), e);
    expect(await r.json()).toEqual({ ok: true, avisos: 2 });

    const push = vi.fn(async () => new Response(null, { status: 201 }));
    const { enviarAvisos } = await import("../src/index.js");
    expect(await enviarAvisos(e, t0 - 60_000, push)).toBe(0); // todavía no
    expect(await enviarAvisos(e, t0 + 60_000, push)).toBe(1);
    expect(push.mock.calls[0][0]).toBe(SUB.endpoint);
    expect(push.mock.calls[0][1].headers.Authorization).toMatch(/^vapid t=/);
    expect(await enviarAvisos(e, t0 + 120_000, push)).toBe(0); // no se repite

    const sw = (k2) => new Request(`https://w.dev/avisos/pendientes?id=${ID}&k=${k2}`, { headers: { Origin: "https://ok.github.io" } });
    expect((await worker.fetch(sw("otra"), e)).status).toBe(401);
    expect((await (await worker.fetch(sw("secreto-del-aparato"), e)).json()).mensajes).toEqual([{ titulo: "Buenos días, Diego", cuerpo: "Hoy: turno 14:00." }]);
    expect((await (await worker.fetch(sw("secreto-del-aparato"), e)).json()).mensajes).toEqual([]);
  });

  it("si el iPhone ya no acepta avisos (410), se borra el aparato", async () => {
    const k = await claves();
    const BUZON = kvFalso();
    const e = { ...env, ...k, BUZON };
    await worker.fetch(req("/avisos", { body: JSON.stringify({ id: ID, k: "x", suscripcion: SUB, avisos: [{ id: "a", t: 1, titulo: "x", cuerpo: "y" }] }) }), e);
    const { enviarAvisos } = await import("../src/index.js");
    await enviarAvisos(e, 1000, vi.fn(async () => new Response(null, { status: 410 })));
    expect([...BUZON.m.keys()].filter((k) => k.startsWith("dev:"))).toEqual([]);
  });

  it("rechaza avisos de otro origen o con datos raros", async () => {
    const e = { ...env, BUZON: kvFalso() };
    expect((await worker.fetch(req("/avisos", { body: JSON.stringify({ id: ID, k: "x", suscripcion: SUB, avisos: [] }), headers: { Origin: "https://otro.com" } }), e)).status).toBe(403);
    expect((await worker.fetch(req("/avisos", { body: JSON.stringify({ id: "../x", k: "x", suscripcion: SUB }) }), e)).status).toBe(400);
    expect((await worker.fetch(req("/avisos", { body: JSON.stringify({ id: ID, k: "x", suscripcion: { endpoint: "http://inseguro" } }) }), e)).status).toBe(400);
  });
});

describe("Siri sin abrir la app", () => {
  it("lo que cuentas (sin verbo de anotar) también se guarda, en su área", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const e = { ...env, BUZON: kvFalso() };
    expect(await (await worker.fetch(siri("me duele la rodilla derecha"), e)).text()).toBe("Listo, lo guardo en Salud. Queda en Vida apenas abras la app.");
    expect(await (await worker.fetch(siri("hoy salí con la polola al cine"), e)).text()).toMatch(/en Amor/);
    expect([...e.BUZON.m.keys()].filter((k) => k.startsWith("m:")).length).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("responde '¿qué tengo mañana?' con la agenda que mandó la app", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { fechaChile } = await import("../src/index.js");
    const BUZON = kvFalso();
    const e = { ...env, BUZON };
    const hoy = fechaChile();
    const man = new Date(Date.parse(hoy + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
    await worker.fetch(req("/avisos", { body: JSON.stringify({ id: "a1b2c3d4e5f6a7b8c9d0", k: "x", suscripcion: { endpoint: "https://web.push.apple.com/x" }, avisos: [], agenda: { [hoy]: ["Turno de trabajo 14:00–22:30"], [man]: ["Partido vs. Frutillar 11:00", "Pagar la luz 10:00"] } }) }), e);
    expect(await (await worker.fetch(siri("oye jarvis qué tengo mañana"), e)).text()).toBe("Mañana tienes Partido vs. Frutillar 11:00 y Pagar la luz 10:00.");
    expect(await (await worker.fetch(siri("qué tengo hoy"), e)).text()).toBe("Hoy tienes Turno de trabajo 14:00–22:30.");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("agenda sin avisos", () => {
  it("se guarda con la clave del aparato y no la puede pisar otro", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const e = { ...env, BUZON: kvFalso() };
    const id = "a1b2c3d4e5f6a7b8c9d0";
    expect((await worker.fetch(req("/agenda", { body: JSON.stringify({ id, k: "clave-1", agenda: { "2026-11-24": ["Turno 14:00"] } }) }), e)).status).toBe(200);
    expect((await worker.fetch(req("/agenda", { body: JSON.stringify({ id, k: "otra", agenda: {} }) }), e)).status).toBe(401);
    expect(JSON.parse(e.BUZON.m.get(`dev:${id}`)).agenda).toEqual({ "2026-11-24": ["Turno 14:00"] });
  });
});

describe("atajo con errores de tipeo", () => {
  it("perdona comillas, espacios, saltos de línea y 'bearer' en minúscula; y deja un diagnóstico sin el código", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const e = { ...env, BUZON: kvFalso() };
    const pide = (auth) => worker.fetch(new Request("https://w.dev/siri", { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify({ texto: "me duele la rodilla" }) }), e);
    for (const a of ["Bearer secreto", "bearer secreto ", "Bearer \"secreto\"", "secreto", "Bearer: secreto"]) expect((await pide(a)).status, a).toBe(200);
    expect((await pide("Bearer otro")).status).toBe(401);
    const d = JSON.parse(e.BUZON.m.get("diag:siri"));
    expect(JSON.stringify(d)).not.toContain("otro");
    expect(d.cuerpo.json).toEqual(["texto"]);
  });
});

describe("código dentro del JSON (sin encabezado)", () => {
  it("acepta {texto, codigo} y nunca guarda el código", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const e = { ...env, BUZON: kvFalso() };
    const r = await worker.fetch(new Request("https://w.dev/siri", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: "me duele la rodilla", codigo: " secreto\n" }) }), e);
    expect(r.status).toBe(200);
    expect(JSON.stringify([...e.BUZON.m.values()])).not.toContain("secreto");
    const mal = await worker.fetch(new Request("https://w.dev/siri", { method: "POST", body: JSON.stringify({ texto: "hola", codigo: "otro" }) }), e);
    expect(mal.status).toBe(401);
  });
});

describe("recordatorios por Siri, al tiro", () => {
  const T = Date.parse("2026-11-23T17:30:00Z"); // 14:30 en Chile
  it("entiende en N minutos, a las H, mañana y altiro", async () => {
    const { recordatorioSiri } = await import("../src/index.js");
    const r = (s) => recordatorioSiri(s, T);
    expect(r("recuerdame sacar al perro en 10 minutos")).toMatchObject({ t: T + 600000, texto: "Sacar al perro" });
    expect(r("recuerdame tomar agua dentro de media hora")?.t).toBe(T + 1800000);
    expect(r("avisame a las 5 que llame a mi mama")).toMatchObject({ t: Date.parse("2026-11-23T20:00:00Z"), cuando: "hoy a las 17:00" });
    expect(r("recuerdame a las 2 ir al banco")?.cuando).toBe("mañana a las 14:00");
    expect(r("recuerdame pagar la luz manana a las 10")?.t).toBe(Date.parse("2026-11-24T13:00:00Z"));
    expect(r("tengo que comprar pan altiro")).toMatchObject({ t: T + 600000, texto: "Comprar pan" });
    expect(r("me duele la rodilla")).toBeNull();
  });
  it("lo agenda en el teléfono sin esperar a que abras la app", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const BUZON = kvFalso();
    await BUZON.put("dev:abcdefghijklmnop", JSON.stringify({ k: "x", sub: { endpoint: "https://web.push.apple.com/z" }, avisos: [], enviados: [], cola: [] }));
    const e = { ...env, BUZON };
    const res = await worker.fetch(siri("recuérdame sacar al perro en 10 minutos"), e);
    expect(await res.text()).toMatch(/^Listo, te aviso a las \d\d:\d\d: sacar al perro\.$/);
    const dev = JSON.parse(BUZON.m.get("dev:abcdefghijklmnop"));
    expect(dev.avisos).toHaveLength(1);
    expect(dev.avisos[0].cuerpo).toBe("Sacar al perro");
  });
});

describe("Siri pregunta la hora si falta", () => {
  it("recuérdame X → ¿cuándo? → mañana a las 7 → agendado", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const BUZON = kvFalso();
    await BUZON.put("dev:abcdefghijklmnop", JSON.stringify({ k: "x", sub: { endpoint: "https://web.push.apple.com/z" }, avisos: [], enviados: [], cola: [] }));
    const e = { ...env, BUZON };
    expect(await (await worker.fetch(siri("recuérdame sacar a la Polo a trotar"), e)).text()).toMatch(/^¿Cuándo te recuerdo sacar a la polo a trotar\?/);
    expect(await (await worker.fetch(siri("mañana a las 7"), e)).text()).toMatch(/^Listo, te aviso mañana a las 07:00: sacar a la polo a trotar\.$/);
    expect(JSON.parse(BUZON.m.get("dev:abcdefghijklmnop")).avisos).toHaveLength(1);
    expect(BUZON.m.has("pend:siri")).toBe(false);
    // Solo el día: pregunta la hora.
    expect(await (await worker.fetch(siri("recuérdame pagar la luz el viernes"), e)).text()).toMatch(/^¿A qué hora el viernes te recuerdo pagar la luz\?/);
    expect(await (await worker.fetch(siri("a las 10"), e)).text()).toMatch(/^Listo, te aviso .* a las 10:00: pagar la luz\.$/);
  });
});

describe("dictado y horas que ya pasaron", () => {
  it("'a las 15 16' es 15:16, y 'hoy' a una hora pasada avisa al tiro", async () => {
    const { recordatorioSiri } = await import("../src/index.js");
    const T = Date.parse("2026-11-23T18:16:03Z"); // 15:16 en Chile
    expect(recordatorioSiri("recuerdame sacar al perro a las 15 20", T)).toMatchObject({ t: Date.parse("2026-11-23T18:20:00Z"), texto: "Sacar al perro" });
    expect(recordatorioSiri("recuerdame sacar al perro hoy a las 15 16", T)).toMatchObject({ t: T + 60000, texto: "Sacar al perro" });
  });
});
