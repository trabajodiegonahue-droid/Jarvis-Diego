import { describe, expect, it, vi } from "vitest";
import { Assistant } from "../src/brain/assistant";
import { GeminiError } from "../src/brain/gemini";
import { memoryKV } from "../src/core/storage";
import { Routine } from "../src/routine/routine";
import { ToolRegistry } from "../src/tools/registry";
import { routineTools } from "../src/tools/routineTools";
import { knowledgeTools } from "../src/tools/knowledgeTools";
import { at } from "./helpers";

function setup(search = vi.fn(), conn: any = { mode: "key", apiKey: "" }) {
  const kv = memoryKV();
  const r = new Routine(kv);
  const reg = new ToolRegistry();
  reg.register(...routineTools(r, at("10:00")), ...knowledgeTools(() => "Diego vive en Puerto Varas y trabaja de garzón.", () => conn, search));
  return { a: new Assistant(reg, r, () => conn, kv, at("10:00"), { stream: vi.fn(), ask: vi.fn() } as any), reg };
}

describe("conocimiento", () => {
  it("sin Gemini responde con los datos guardados", async () => {
    const { a } = setup();
    expect((await a.handle("¿cuándo me inscribo al servicio militar?")).text).toMatch(/febrero de 2027/);
    expect((await a.handle("requisitos de la working holiday en Australia")).text).toMatch(/18 a 30 años/);
    expect((await a.handle("¿qué sabes de mí?")).text).toMatch(/garzón/);
    expect((await a.handle("número de la ambulancia")).text).toMatch(/131/);
  });
  it("buscar en internet devuelve texto y fuentes", async () => {
    const search = vi.fn().mockResolvedValue({ text: "El acuartelamiento 2027 es el 5 de abril.", sources: [{ title: "DGMN", url: "https://x" }] });
    const { reg } = setup(search);
    const r = await reg.call("buscar_en_internet", { consulta: "acuartelamiento 2027" });
    expect(r.say).toMatch(/5 de abril/);
    expect((r.data as any).fuentes[0].title).toBe("DGMN");
  });
  it("si la búsqueda falla, lo dice amable", async () => {
    const { reg } = setup(vi.fn().mockRejectedValue(new GeminiError("quota", "x")));
    expect((await reg.call("buscar_en_internet", { consulta: "x" })).say).toMatch(/cuota/);
  });
});
