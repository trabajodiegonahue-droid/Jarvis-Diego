import { describe, expect, it } from "vitest";
import { memoryKV } from "../src/core/storage";
import { daysLabel, parseDays, Routine } from "../src/routine/routine";
import { at } from "./helpers";

const mk = () => {
  const r = new Routine(memoryKV());
  r.add("Gimnasio", "08:00");
  r.add("Estudiar inglés", "18:00", [0, 1, 2, 3, 4]);
  r.add("Leer", "22:00", [5, 6]);
  return r;
};

describe("rutina", () => {
  it("ordena por hora y filtra por día", () => {
    const r = mk();
    expect(r.tasks.map((t) => t.time)).toEqual(["08:00", "18:00", "22:00"]);
    expect(r.forDay(1).map((t) => t.title)).toEqual(["Gimnasio", "Estudiar inglés"]);
    expect(r.forDay(6).map((t) => t.title)).toEqual(["Gimnasio", "Leer"]);
  });
  it("encuentra tareas aunque se digan distinto", () => {
    const r = mk();
    expect(r.find("el gym")?.title).toBe("Gimnasio");
    expect(r.find("gimnasio")?.title).toBe("Gimnasio");
    expect(r.find("ingles")?.title).toBe("Estudiar inglés");
    expect(r.find("estudiar")?.title).toBe("Estudiar inglés");
    expect(r.find("bailar")).toBeNull();
  });
  it("qué toca ahora cruza día y hora", () => {
    const r = mk();
    const n = at("18:05")();
    let w = r.now(n);
    expect(w.current?.title).toBe("Estudiar inglés");
    expect(w.pending.map((t) => t.title)).toEqual(["Gimnasio"]);
    r.check(r.find("gimnasio")!, n.date);
    r.check(r.find("ingles")!, n.date);
    w = r.now(n);
    expect(w.current).toBeNull();
    expect(w.pending).toEqual([]);
    expect(mk().now(at("07:00")()).next?.title).toBe("Gimnasio");
  });
  it("el sábado no toca inglés", () => {
    const r = mk();
    const w = r.now(at("18:10", "2026-11-21")());
    expect(w.current).toBeNull();
    expect(w.next?.title).toBe("Leer");
  });
  it("tachar un día no tacha el siguiente", () => {
    const r = mk();
    r.check(r.find("gimnasio")!, "2026-11-17");
    expect(r.now(at("08:30", "2026-11-18")()).current?.title).toBe("Gimnasio");
  });
  it("respaldo: exporta e importa", () => {
    const r = mk();
    const json = r.exportJSON();
    const r2 = new Routine(memoryKV());
    expect(r2.importJSON(json)).toBe(3);
    expect(r2.tasks.map((t) => t.title)).toEqual(r.tasks.map((t) => t.title));
    expect(() => r2.importJSON('{"hola":1}')).toThrow();
  });
  it("persiste en el almacenamiento", () => {
    const kv = memoryKV();
    new Routine(kv).add("Correr", "07:00");
    expect(new Routine(kv).tasks[0].title).toBe("Correr");
  });
  it("entiende días hablados", () => {
    const n = at("10:00")();
    expect(parseDays("de lunes a viernes")).toEqual([0, 1, 2, 3, 4]);
    expect(parseDays("los martes y jueves")).toEqual([1, 3]);
    expect(parseDays("el fin de semana")).toEqual([5, 6]);
    expect(parseDays("todos los días")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(parseDays("viernes a lunes")).toEqual([4, 5, 6, 0]);
    expect(parseDays("hoy", n)).toEqual([1]);
    expect(parseDays("mañana", n)).toEqual([2]);
    expect(parseDays("6 de la mañana", n)).toBeNull();
    expect(parseDays("18:00")).toBeNull();
    expect(daysLabel([0, 1, 2, 3, 4])).toBe("de lunes a viernes");
    expect(daysLabel([1, 5])).toBe("los martes y sábados");
  });
});
