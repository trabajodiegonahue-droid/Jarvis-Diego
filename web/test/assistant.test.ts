import { describe, expect, it, vi } from "vitest";
import { Assistant } from "../src/brain/assistant";
import { GeminiError } from "../src/brain/gemini";
import { memoryKV } from "../src/core/storage";
import { Routine } from "../src/routine/routine";
import { ToolRegistry } from "../src/tools/registry";
import { routineTools } from "../src/tools/routineTools";
import { at } from "./helpers";

function setup(stream?: any) {
  const kv = memoryKV();
  const r = new Routine(kv);
  const clock = at("18:05");
  const reg = new ToolRegistry();
  reg.register(...routineTools(r, clock));
  const gem = { stream: stream || vi.fn(), ask: vi.fn().mockResolvedValue("resumen") };
  const a = new Assistant(reg, r, () => ({ mode: "key", apiKey: "x" }), kv, clock, gem as any);
  return { a, r, gem };
}

describe("asistente", () => {
  it("las órdenes comunes no gastan cuota", async () => {
    const { a, r, gem } = setup();
    const said: string[] = [];
    let rep = await a.handle("agrega estudiar inglés a las 18:00", (d) => said.push(d));
    expect(rep.source).toBe("local");
    expect(rep.text).toMatch(/agregué estudiar inglés a las 18:00, todos los días/);
    rep = await a.handle("qué me toca ahora");
    expect(rep.text).toMatch(/son las 18:05, te toca estudiar inglés/);
    rep = await a.handle("ya hice inglés");
    expect(rep.text).toMatch(/tachado estudiar inglés/i);
    expect(r.tasks[0].done).toEqual(["2026-11-17"]);
    expect(gem.stream).not.toHaveBeenCalled();
    expect(said.join("")).toMatch(/agregué/);
  });

  it("borrar todo pide confirmación", async () => {
    const { a, r } = setup();
    r.add("A", "08:00");
    r.add("B", "09:00");
    let rep = await a.handle("borra toda la rutina");
    expect(rep.text).toMatch(/¿Seguro\?/);
    expect(r.tasks.length).toBe(2);
    rep = await a.handle("no");
    expect(r.tasks.length).toBe(2);
    await a.handle("borra toda la rutina");
    rep = await a.handle("sí");
    expect(r.tasks.length).toBe(0);
    expect(rep.text).toMatch(/Borré las 2/);
  });

  it("Gemini llama una herramienta y después responde", async () => {
    const stream = vi
      .fn()
      .mockImplementationOnce(async () => ({ text: "", calls: [{ name: "agregar_tarea", args: { titulo: "Correr", hora: "07:00", dias: [5, 6] } }], parts: [{ functionCall: { name: "agregar_tarea", args: {} }, thoughtSignature: "abc" }] }))
      .mockImplementationOnce(async (_c: any, _r: any, onText: any) => {
        onText("Listo, quedó correr el fin de semana.");
        return { text: "Listo, quedó correr el fin de semana.", calls: [], parts: [] };
      });
    const { a, r } = setup(stream);
    const rep = await a.handle("oye, ponme a correr los findes temprano");
    expect(rep.source).toBe("gemini");
    expect(r.tasks[0]).toMatchObject({ title: "Correr", time: "07:00", days: [5, 6] });
    expect(rep.text).toBe("Listo, quedó correr el fin de semana.");
    // La segunda vuelta lleva la parte original (con su firma) y la respuesta de la herramienta.
    const second = stream.mock.calls[1][1];
    const last2 = second.contents.slice(-2);
    expect(last2[0].parts[0].thoughtSignature).toBe("abc");
    expect(last2[1].parts[0].functionResponse.name).toBe("agregar_tarea");
    // Y lleva la hora de Chile en las instrucciones.
    expect(second.system).toMatch(/18:05/);
  });

  it("Gemini no puede borrar todo sin confirmar", async () => {
    const stream = vi.fn().mockResolvedValueOnce({ text: "", calls: [{ name: "borrar_toda_la_rutina", args: {} }], parts: [{ functionCall: { name: "borrar_toda_la_rutina" } }] });
    const { a, r } = setup(stream);
    r.add("A", "08:00");
    const rep = await a.handle("limpia todo lo que tengo");
    expect(rep.text).toMatch(/¿Seguro\?/);
    expect(r.tasks.length).toBe(1);
    await a.handle("dale");
    expect(r.tasks.length).toBe(0);
  });

  it("cuota agotada: mensaje amable, no se rompe", async () => {
    const stream = vi.fn().mockRejectedValue(new GeminiError("quota", "x"));
    const { a } = setup(stream);
    const rep = await a.handle("cuéntame un chiste");
    expect(rep.source).toBe("error");
    expect(rep.error).toBe("quota");
    expect(rep.text).toMatch(/cuota gratis/);
    const rep2 = await a.handle("agrega leer a las 22:00");
    expect(rep2.source).toBe("local");
  });

  it("resume conversaciones largas", async () => {
    const stream = vi.fn(async (_c: any, _r: any, on: any) => (on("ok."), { text: "ok.", calls: [], parts: [] }));
    const { a, gem } = setup(stream);
    for (let i = 0; i < 9; i++) await a.handle("pregunta " + i);
    await new Promise((r) => setTimeout(r, 0));
    expect(gem.ask).toHaveBeenCalled();
    expect(a.summary).toBe("resumen");
    expect(a.history.length).toBe(6);
  });
});
