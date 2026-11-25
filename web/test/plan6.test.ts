import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Assistant } from "../src/brain/assistant";
import { esPregunta } from "../src/areas/calc";
import { memoryKV } from "../src/core/storage";
import { resetDB } from "../src/data/db";
import { AppStore } from "../src/data/store";
import { planAvisos } from "../src/jarvis/avisos";
import { crearNotar } from "../src/jarvis/notas";
import { parsePlan, planTools } from "../src/jarvis/planTools";
import { parseVida } from "../src/jarvis/vidaParser";
import { vidaTools } from "../src/jarvis/vidaTools";
import { HORARIO } from "../src/plan/bloque";
import { Routine } from "../src/routine/routine";
import { ToolRegistry } from "../src/tools/registry";
import { routineTools } from "../src/tools/routineTools";
import { emptyDatos } from "../src/data/types";
import { at } from "./helpers";

const P = { partidoPorSemana: {}, fechaPrueba: "", comida: { medida: 24, meta: 110, almuerzo: 25, once: 20, colacion: 8 } };

describe("JARVIS y el plan", () => {
  beforeEach(async () => {
    resetDB();
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("vida"); r.onsuccess = r.onerror = () => res(); });
  });
  async function setup() {
    const kv = memoryKV();
    const routine = new Routine(kv);
    for (const h of HORARIO) routine.add(h.titulo, h.hora);
    const store = new AppStore();
    await store.load();
    const reloj = at("10:00"); // 2026-11-17 (martes) en helpers
    const reg = new ToolRegistry();
    reg.register(...routineTools(routine, reloj), ...vidaTools({ store, routine, clock: reloj }), ...planTools({ store, routine, clock: reloj, prefs: () => P }));
    const a = new Assistant(reg, routine, () => ({ mode: "key", apiKey: "" }) as any, kv, reloj, { stream: vi.fn(), ask: vi.fn() } as any, { parse: (t, n) => parseVida(t, n.date, { rutina: routine.tasks.map((x) => x.title), minutos: n.minutes }), notar: crearNotar(store, reloj), esPregunta });
    return { a, store, routine, reloj };
  }
  it("entiende las preguntas del plan", () => {
    expect(parsePlan("que me toca hoy")?.tool).toBe("plan_de_hoy");
    expect(parsePlan("como voy esta semana")?.tool).toBe("como_voy_semana");
    expect(parsePlan("cuanta proteina me falta")?.tool).toBe("proteina");
    expect(parsePlan("que estudio hoy")?.tool).toBe("que_estudio");
    expect(parsePlan("que errores tengo que repasar")?.tool).toBe("errores_repasar");
    expect(parsePlan("cuanto mejore en el sprint")?.tool).toBe("mejora_sprint");
    expect(parsePlan("peso 70,5 kilos")).toEqual({ tool: "anotar_peso", args: { kg: 70.5 } });
    expect(parsePlan("me tome la creatina")).toEqual({ tool: "marcar_comida", args: { item: "creatina" } });
  });
  it("responde con los datos de las 4 secciones", async () => {
    const { a, store, routine, reloj } = await setup();
    expect((await a.handle("¿Qué me toca hoy?")).text).toMatch(/^Mañana: fuerza A \(piernas\); tarde: resistencia 4×4 con balón \+ técnica 30 min\. Estudio a las 13:45: Inglés\./);
    expect((await a.handle("me tomé la creatina")).text).toBe("Anotada la creatina. Llevas 1 días seguidos.");
    expect((await a.handle("desayuné")).text).toMatch(/^Anotado: desayuno\. Llevas ~30 g de proteína, te faltan 80 g\./);
    expect(routine.tasks.find((t) => t.title === "Despertar + desayuno + creatina")!.done).toContain(reloj().date);
    expect((await a.handle("¿cuánta proteína me falta?")).text).toMatch(/^Llevas 30 g de 110: te faltan 80 g\. Te queda: batido post-entreno \(~30 g\), almuerzo \(~25 g\)/);
    expect((await a.handle("peso 70,5")).text).toBe("Anotado: 70,5 kg.");
    expect(store.data.pesos[0]).toMatchObject({ kg: 70.5 });
    await store.put("tests", { id: "a", fecha: "2026-11-01", semana: 0, sprint10: 1.9 }, { id: "b", fecha: "2026-11-15", semana: 4, sprint10: 1.8 });
    expect((await a.handle("¿cuánto mejoré en el sprint?")).text).toBe("sprint de 10 m: de 1,9 a 1,8 s (5,3% más rápido).");
    expect((await a.handle("¿cómo voy esta semana?")).text).toMatch(/^Esta semana: entrenamiento 0 de \d+ sesiones\. Estudio 0 minutos en 0 días\. Comida: proteína promedio 30 g de 110, creatina 1 de 2 días\.$/);
  });
  it("avisos del plan: 7:30, 9:15, 13:45, 17:00 y 22:30, sin un aviso por cada bloque", () => {
    const tasks = HORARIO.map((h, i) => ({ id: String(i), title: h.titulo, time: h.hora, days: [0, 1, 2, 3, 4, 5, 6], done: [] }));
    const av = planAvisos(emptyDatos(), tasks, { manana: "08:00", noche: "21:30", agua: false, rutina: true, plan: true, partidoPorSemana: {} }, "2026-12-01T06:00", 0);
    expect(av.filter((x) => x.id.startsWith("p")).map((x) => x.cuando.slice(11))).toEqual(["07:30", "09:15", "13:45", "17:00", "22:30"]);
    expect(av.some((x) => x.id.startsWith("t:"))).toBe(false);
  });
});
