import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.js";

const env = { ALLOWED_ORIGIN: "https://ok.github.io", ACCESS_TOKEN: "secreto", GEMINI_API_KEY: "AIzaREAL", GEMINI_MODEL: "gemini-flash-lite-latest" };
const req = (path, init = {}) =>
  new Request("https://jarvis.workers.dev" + path, {
    method: "POST",
    headers: { Origin: "https://ok.github.io", Authorization: "Bearer secreto", "Content-Type": "application/json", ...(init.headers || {}) },
    body: init.body ?? "{}",
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
