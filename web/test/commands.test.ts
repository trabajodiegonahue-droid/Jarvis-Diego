import { describe, expect, it } from "vitest";
import { isNo, isYes, parseCommand } from "../src/brain/commands";
import { at } from "./helpers";

const p = (s: string) => parseCommand(s, at("10:00")());

describe("intérprete local", () => {
  it("agregar", () => {
    expect(p("agrega estudiar inglés a las 18:00")).toEqual({ tool: "agregar_tarea", args: { titulo: "estudiar inglés", hora: "18:00" } });
    expect(p("Jarvis, agrega gimnasio a las 7 de lunes a viernes")).toEqual({ tool: "agregar_tarea", args: { titulo: "gimnasio", hora: "07:00", dias: [0, 1, 2, 3, 4] } });
    expect(p("anota a mi rutina leer a las 10 de la noche los sábados")?.args).toEqual({ titulo: "leer", hora: "22:00", dias: [5] });
  });
  it("tachar", () => {
    expect(p("ya hice el gym")).toEqual({ tool: "tachar_tarea", args: { titulo: "gym" } });
    expect(p("Tacha estudiar inglés.")).toEqual({ tool: "tachar_tarea", args: { titulo: "estudiar inglés" } });
    expect(p("terminé de estudiar inglés")?.args).toEqual({ titulo: "estudiar inglés" });
  });
  it("quitar y cambiar", () => {
    expect(p("quita el gym")).toEqual({ tool: "quitar_tarea", args: { titulo: "gym" } });
    expect(p("borra toda la rutina")).toEqual({ tool: "borrar_toda_la_rutina", args: {} });
    expect(p("cambia el gym a las 19:30")).toEqual({ tool: "cambiar_tarea", args: { titulo: "gym", nueva_hora: "19:30" } });
  });
  it("consultas", () => {
    expect(p("¿qué me toca ahora?")?.tool).toBe("que_me_toca_ahora");
    expect(p("qué tengo hoy")).toEqual({ tool: "ver_rutina", args: { dia: 1 } });
    expect(p("qué tengo el viernes")).toEqual({ tool: "ver_rutina", args: { dia: 4 } });
  });
  it("lo demás se lo deja a Gemini", () => {
    expect(p("¿cuánto es 15% de 2000?")).toBeNull();
    expect(p("cuéntame un chiste")).toBeNull();
    expect(p("agrega algo")?.tool).toBe("__falta_hora"); // le pregunta la hora
  });
  it("sí y no", () => {
    expect(isYes("Sí")).toBe(true);
    expect(isYes("dale")).toBe(true);
    expect(isNo("no, mejor no")).toBe(true);
    expect(isYes("no")).toBe(false);
  });
});
