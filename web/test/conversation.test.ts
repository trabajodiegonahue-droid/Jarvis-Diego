import { describe, expect, it, vi } from "vitest";
import { Assistant } from "../src/brain/assistant";
import { systemPrompt } from "../src/brain/persona";
import { memoryKV } from "../src/core/storage";
import { Routine } from "../src/routine/routine";
import { ToolRegistry } from "../src/tools/registry";
import { routineTools } from "../src/tools/routineTools";
import { at } from "./helpers";

// Sin Gemini conectado (como en la demo): JARVIS razona y pregunta con lo que sabe.
function setup(hhmm = "15:00", conn: any = { mode: "key", apiKey: "" }, stream?: any) {
  const kv = memoryKV();
  const r = new Routine(kv);
  r.add("Gimnasio", "08:00");
  r.add("Estudiar inglés", "10:45");
  r.add("Sacar al perro", "12:00");
  r.add("Leer", "22:00");
  const clock = at(hhmm);
  const reg = new ToolRegistry();
  reg.register(...routineTools(r, clock));
  const a = new Assistant(reg, r, () => conn, kv, clock, { stream: stream || vi.fn(), ask: vi.fn() } as any);
  return { a, r, done: () => r.tasks.filter((t) => t.done.includes("2026-11-17")).map((t) => t.title) };
}

describe("conversación con casos ambiguos", () => {
  it("'hice la rutina a medias' → pregunta cuáles y tacha las que dice", async () => {
    const { a, done } = setup();
    let rep = await a.handle("hice la rutina a medias");
    expect(rep.text).toMatch(/vamos por partes/i);
    expect(rep.text).toMatch(/1, Gimnasio; 2, Estudiar inglés; 3, Sacar al perro; 4, Leer/);
    expect(rep.text).toMatch(/¿Cuáles hiciste\?/);
    expect(a.waiting).toBe("choose");
    rep = await a.handle("la 1 y el perro");
    expect(done()).toEqual(["Gimnasio", "Sacar al perro"]);
    expect(rep.text).toMatch(/taché Gimnasio y Sacar al perro/);
    expect(rep.text).toMatch(/Leer a las 22:00, todavía alcanzas/);
    expect(rep.text).toMatch(/Estudiar inglés quedó pendiente/);
  });
  it("'todas menos el inglés'", async () => {
    const { a, done } = setup();
    await a.handle("no la terminé");
    await a.handle("todas menos el inglés");
    expect(done()).toEqual(["Gimnasio", "Sacar al perro", "Leer"]);
  });
  it("'ninguna' no tacha nada y anima", async () => {
    const { a, done } = setup();
    await a.handle("hice algunas");
    const rep = await a.handle("ninguna");
    expect(done()).toEqual([]);
    expect(rep.text).toMatch(/Todavía alcanzas Leer a las 22:00/);
  });
  it("si responde otra cosa, se olvida la pregunta y atiende lo nuevo", async () => {
    const { a } = setup();
    await a.handle("hice la rutina a medias");
    const rep = await a.handle("qué me toca ahora");
    expect(rep.text).toMatch(/Son las 15:00/);
  });
  it("varias de una vez", async () => {
    const { a, done } = setup();
    const rep = await a.handle("ya hice el gym y el inglés");
    expect(done()).toEqual(["Gimnasio", "Estudiar inglés"]);
    expect(rep.text).toMatch(/Te queda Sacar al perro y Leer/);
  });
  it("'hice todo'", async () => {
    const { a, done } = setup();
    await a.handle("ya hice todo");
    expect(done().length).toBe(4);
  });
  it("tarea que no existe: pregunta con opciones en vez de rendirse", async () => {
    const { a, done } = setup();
    const rep = await a.handle("ya hice natación");
    expect(rep.text).toMatch(/No me calza "natación"/);
    expect(rep.text).toMatch(/1, Gimnasio/);
    await a.handle("la primera");
    expect(done()).toEqual(["Gimnasio"]);
  });
  it("'no hice nada' empatiza y dice qué alcanza", async () => {
    const { a, done } = setup();
    const rep = await a.handle("no hice nada, estoy reventado");
    expect(done()).toEqual([]);
    expect(rep.text).toMatch(/Tranquilo/);
    expect(rep.text).toMatch(/Leer a las 22:00/);
  });
  it("cómo voy (hoy, ayer y semana)", async () => {
    const { a } = setup();
    await a.handle("ya hice el gym");
    let rep = await a.handle("¿cómo voy?");
    expect(rep.text).toMatch(/Hoy llevas 1 de 4/);
    expect(rep.text).toMatch(/Te falta: Estudiar inglés \(10:45\)/);
    rep = await a.handle("qué me faltó ayer");
    expect(rep.text).toMatch(/Ayer hiciste 0 de 4/);
    rep = await a.handle("cómo voy esta semana");
    expect(rep.text).toMatch(/Esta semana cumpliste 1 de/);
  });
  it("con Gemini conectado, lo que no calza lo razona Gemini (con contexto)", async () => {
    const stream = vi.fn(async (_c: any, _req: any, on: any) => (on("¿Natación cuenta como el gimnasio de hoy?"), { text: "x", calls: [], parts: [] }));
    const { a } = setup("15:00", { mode: "key", apiKey: "K" }, stream);
    const rep = await a.handle("ya hice natación");
    expect(rep.source).toBe("gemini");
    const sys = stream.mock.calls[0][1].system;
    expect(sys).toMatch(/Cómo razonas/);
    expect(sys).toMatch(/se le pasó la hora y no lo ha marcado: Gimnasio \(08:00\), Estudiar inglés \(10:45\), Sacar al perro \(12:00\)/);
    expect(sys).toMatch(/todavía le queda: Leer \(22:00\)/);
    expect(sys).toMatch(/Puerto Varas/);
  });
  it("las instrucciones incluyen ejemplos de casos ambiguos", () => {
    expect(systemPrompt(at("10:00")())).toMatch(/Hice la rutina a medias/);
  });
});
