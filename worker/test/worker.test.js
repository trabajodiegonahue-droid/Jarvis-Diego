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
    expect(await r.text()).toMatch(/anotado/i);
    expect(fetch).not.toHaveBeenCalled(); // no pasa por Gemini
    const lista = await (await worker.fetch(req("/buzon", { method: "GET", body: null }), e)).json();
    expect(lista.items.map((i) => i.texto)).toEqual(["Jarvis, gasté 5 mil en almuerzo"]);
    await worker.fetch(req("/buzon/borrar", { body: JSON.stringify({ ids: lista.items.map((i) => i.id) }) }), e);
    expect(BUZON.m.size).toBe(0);
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
    expect(BUZON.m.size).toBe(0);
  });

  it("rechaza avisos de otro origen o con datos raros", async () => {
    const e = { ...env, BUZON: kvFalso() };
    expect((await worker.fetch(req("/avisos", { body: JSON.stringify({ id: ID, k: "x", suscripcion: SUB, avisos: [] }), headers: { Origin: "https://otro.com" } }), e)).status).toBe(403);
    expect((await worker.fetch(req("/avisos", { body: JSON.stringify({ id: "../x", k: "x", suscripcion: SUB }) }), e)).status).toBe(400);
    expect((await worker.fetch(req("/avisos", { body: JSON.stringify({ id: ID, k: "x", suscripcion: { endpoint: "http://inseguro" } }) }), e)).status).toBe(400);
  });
});
