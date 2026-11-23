import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiError, streamGemini } from "../src/brain/gemini";

const sse = (chunks: any[]) =>
  new Response(new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      for (const ch of chunks) c.enqueue(enc.encode(`data: ${JSON.stringify(ch)}\r\n\r\n`));
      c.close();
    },
  }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("cliente Gemini", () => {
  it("lee el streaming y las llamadas a herramientas", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([
      { candidates: [{ content: { parts: [{ text: "Hola " }] } }] },
      { candidates: [{ content: { parts: [{ text: "Diego." }] } }] },
      { candidates: [{ content: { parts: [{ functionCall: { name: "ver_rutina", args: { dia: 2 } }, thoughtSignature: "s" }] } }] },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const got: string[] = [];
    const r = await streamGemini({ mode: "key", apiKey: "K" }, { system: "s", contents: [] }, (d) => got.push(d));
    expect(got).toEqual(["Hola ", "Diego."]);
    expect(r.text).toBe("Hola Diego.");
    expect(r.calls).toEqual([{ name: "ver_rutina", args: { dia: 2 } }]);
    expect(r.parts[0]).toEqual({ text: "Hola Diego." });
    expect(r.parts[1].thoughtSignature).toBe("s");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/generativelanguage\.googleapis\.com\/v1beta\/models\/.+:streamGenerateContent\?alt=sse/);
    expect(init.headers["x-goog-api-key"]).toBe("K");
    const gc = JSON.parse(init.body).generationConfig;
    expect(gc.thinkingConfig.thinkingBudget).toBe(1024);
    expect(gc.maxOutputTokens).toBe(300 + 1024);
  });
  it("si el modelo no acepta razonamiento, reintenta sin él", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("thinking_budget is not supported", { status: 400 })).mockResolvedValueOnce(sse([{ candidates: [{ content: { parts: [{ text: "ok" }] } }] }]));
    vi.stubGlobal("fetch", f);
    const r = await streamGemini({ mode: "key", apiKey: "K" }, { system: "s", contents: [] }, () => {});
    expect(r.text).toBe("ok");
    expect(JSON.parse(f.mock.calls[1][1].body).generationConfig.thinkingConfig).toBeUndefined();
  });
  it("por el intermediario no manda la clave", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([]));
    vi.stubGlobal("fetch", fetchMock);
    await streamGemini({ mode: "worker", workerUrl: "https://w.example.dev/", workerToken: "T" }, { system: "s", contents: [] }, () => {});
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/w\.example\.dev\/v1beta\/models\//);
    expect(init.headers.Authorization).toBe("Bearer T");
    expect(init.headers["x-goog-api-key"]).toBeUndefined();
  });
  it("traduce los errores", async () => {
    const cases: [any, string][] = [
      [new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 }), "quota"],
      [new Response("API key not valid", { status: 400 }), "auth"],
      [new Response("", { status: 503 }), "down"],
    ];
    for (const [res, kind] of cases) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
      await expect(streamGemini({ mode: "key", apiKey: "K" }, { system: "", contents: [] }, () => {})).rejects.toMatchObject({ kind });
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(streamGemini({ mode: "key", apiKey: "K" }, { system: "", contents: [] }, () => {})).rejects.toBeInstanceOf(GeminiError);
    await expect(streamGemini({ mode: "key" }, { system: "", contents: [] }, () => {})).rejects.toMatchObject({ kind: "config" });
  });
});
