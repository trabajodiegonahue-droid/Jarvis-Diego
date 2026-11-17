import { chileNow, DAY_NAMES, parseHour, type ChileNow } from "../core/time";
import { ALL_DAYS, daysLabel, type Routine, type Task } from "../routine/routine";
import type { Tool } from "./registry";

const dayArray = {
  type: "array",
  items: { type: "integer" },
  description: "Días de la semana: 0 = lunes, 1 = martes … 6 = domingo. Vacío o ausente = todos los días.",
};

const list = (ts: Task[], n: ChileNow) =>
  ts.map((t) => `${t.time} ${t.title}${t.done.includes(n.date) ? " (hecho)" : ""}`).join(", ");

export function routineTools(r: Routine, clock: () => ChileNow = chileNow): Tool[] {
  const notFound = (q: string) => ({ ok: false, say: `No encontré "${q}" en tu rutina. ¿Cómo se llama exactamente?` });
  return [
    {
      name: "agregar_tarea",
      description: "Agrega una tarea a la rutina con hora y días de la semana.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Nombre corto de la tarea, por ejemplo 'estudiar inglés'." },
          hora: { type: "string", description: "Hora en formato 24 h HH:MM, por ejemplo '18:00'." },
          dias: dayArray,
        },
        required: ["titulo", "hora"],
      },
      run({ titulo, hora, dias }) {
        const time = parseHour(String(hora || ""));
        if (!titulo || !time) return { ok: false, say: "Me faltó la hora o el nombre. Dime, por ejemplo: agrega estudiar inglés a las 18:00." };
        const days = Array.isArray(dias) && dias.length ? dias : ALL_DAYS;
        const t = r.add(String(titulo), time, days);
        return { ok: true, say: `Listo, agregué ${t.title} a las ${t.time}, ${daysLabel(t.days)}.`, data: t };
      },
    },
    {
      name: "tachar_tarea",
      description: "Marca como hecha hoy una tarea de la rutina.",
      parameters: { type: "object", properties: { titulo: { type: "string" } }, required: ["titulo"] },
      run({ titulo }) {
        const n = clock();
        const t = r.find(String(titulo || ""), n.dow);
        if (!t) return notFound(titulo);
        r.check(t, n.date);
        return { ok: true, say: `Listo, tachado ${t.title}. Bien ahí.`, data: t };
      },
    },
    {
      name: "destachar_tarea",
      description: "Desmarca una tarea que se tachó hoy por error.",
      parameters: { type: "object", properties: { titulo: { type: "string" } }, required: ["titulo"] },
      run({ titulo }) {
        const n = clock();
        const t = r.find(String(titulo || ""), n.dow);
        if (!t) return notFound(titulo);
        r.uncheck(t, n.date);
        return { ok: true, say: `Ya, ${t.title} quedó pendiente otra vez.` };
      },
    },
    {
      name: "quitar_tarea",
      description: "Quita una tarea de la rutina para siempre.",
      parameters: { type: "object", properties: { titulo: { type: "string" } }, required: ["titulo"] },
      run({ titulo }) {
        const t = r.find(String(titulo || ""));
        if (!t) return notFound(titulo);
        r.remove(t);
        return { ok: true, say: `Saqué ${t.title} de tu rutina.` };
      },
    },
    {
      name: "borrar_toda_la_rutina",
      description: "Borra todas las tareas de la rutina. Solo si Diego lo pide claramente.",
      parameters: { type: "object", properties: {} },
      needsConfirm: () => `Ojo, eso borra las ${r.tasks.length} tareas de tu rutina. ¿Seguro? Di sí o no.`,
      run() {
        const n = r.removeAll();
        return { ok: true, say: `Borré las ${n} tareas. Partimos de cero.` };
      },
    },
    {
      name: "cambiar_tarea",
      description: "Cambia la hora, el nombre o los días de una tarea existente.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Nombre actual de la tarea." },
          nueva_hora: { type: "string", description: "Nueva hora HH:MM, si cambia." },
          nuevo_titulo: { type: "string" },
          dias: dayArray,
        },
        required: ["titulo"],
      },
      run({ titulo, nueva_hora, nuevo_titulo, dias }) {
        const t = r.find(String(titulo || ""));
        if (!t) return notFound(titulo);
        const time = nueva_hora ? parseHour(String(nueva_hora)) : null;
        if (nueva_hora && !time) return { ok: false, say: "No entendí la hora nueva. Dímela así: 19:30." };
        r.update(t, { time: time || undefined, title: nuevo_titulo || undefined, days: Array.isArray(dias) ? dias : undefined });
        return { ok: true, say: `Cambiado: ${t.title} a las ${t.time}, ${daysLabel(t.days)}.` };
      },
    },
    {
      name: "ver_rutina",
      description: "Lista las tareas de un día (por defecto hoy).",
      parameters: { type: "object", properties: { dia: { type: "integer", description: "0 = lunes … 6 = domingo. Ausente = hoy." } } },
      run({ dia }) {
        const n = clock();
        const d = Number.isInteger(dia) ? dia : n.dow;
        const ts = r.forDay(d);
        const when = d === n.dow ? "Hoy" : `El ${DAY_NAMES[d]}`;
        if (!ts.length) return { ok: true, say: `${when} no tienes nada en la rutina.`, data: [] };
        return { ok: true, say: `${when} tienes: ${list(ts, n)}.`, data: ts };
      },
    },
    {
      name: "que_me_toca_ahora",
      description: "Dice qué tarea toca ahora según la hora y el día actuales, y cuál sigue.",
      parameters: { type: "object", properties: {} },
      run() {
        const n = clock();
        const { current, next, pending } = r.now(n);
        const parts: string[] = [];
        if (current) parts.push(`Ya po, son las ${n.hhmm}, te toca ${current.title}.`);
        else parts.push(`Son las ${n.hhmm} y ahora no tienes nada pendiente.`);
        if (next) parts.push(`Después, a las ${next.time}, ${next.title}.`);
        else if (!current) parts.push("No te queda nada más hoy.");
        if (pending.length) parts.push(`Ojo, quedó pendiente ${pending.map((t) => t.title).join(" y ")}.`);
        return { ok: true, say: parts.join(" "), data: { current, next, pending } };
      },
    },
  ];
}
