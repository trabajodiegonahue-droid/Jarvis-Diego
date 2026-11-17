import { chileNow, DAY_NAMES, parseHour, type ChileNow } from "../core/time";
import { ALL_DAYS, daysLabel, type Routine, type Task } from "../routine/routine";
import type { Tool } from "./registry";

const dayArray = {
  type: "array",
  items: { type: "integer" },
  description: "Días de la semana: 0 = lunes, 1 = martes … 6 = domingo. Vacío o ausente = todos los días.",
};

export const joinY = (xs: string[]) => (xs.length > 1 ? xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1] : xs[0] || "");

export function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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
      name: "tachar_tareas",
      description: "Marca como hechas hoy varias tareas de una vez. Úsala cuando Diego nombre más de una.",
      parameters: { type: "object", properties: { titulos: { type: "array", items: { type: "string" } } }, required: ["titulos"] },
      run({ titulos }) {
        const n = clock();
        const names: string[] = Array.isArray(titulos) ? titulos.map(String) : [];
        const ok: Task[] = [];
        const miss: string[] = [];
        for (const q of names) {
          const t = r.find(q, n.dow);
          if (t) {
            r.check(t, n.date);
            if (!ok.includes(t)) ok.push(t);
          } else miss.push(q);
        }
        const left = r.dayStatus(n.date, n.dow).pending;
        const parts: string[] = [];
        if (ok.length) parts.push(`Listo, taché ${joinY(ok.map((t) => t.title))}.`);
        if (miss.length) parts.push(`No encontré ${joinY(miss.map((m) => `"${m}"`))}.`);
        parts.push(left.length ? `Te queda ${joinY(left.map((t) => t.title))}.` : "Con eso cerraste todo lo de hoy. Bien ahí.");
        return { ok: ok.length > 0, say: parts.join(" "), data: { tachadas: ok.map((t) => t.title), no_encontradas: miss, pendientes: left.map((t) => t.title) } };
      },
    },
    {
      name: "tachar_todo_hoy",
      description: "Marca como hechas todas las tareas de hoy. Solo si Diego dice que hizo todo.",
      parameters: { type: "object", properties: {} },
      run() {
        const n = clock();
        const { pending } = r.dayStatus(n.date, n.dow);
        pending.forEach((t) => r.check(t, n.date));
        if (!pending.length) return { ok: true, say: "Ya tenías todo tachado hoy. Crack." };
        return { ok: true, say: `Listo, taché todo: ${joinY(pending.map((t) => t.title))}. Día completo, bien ahí.` };
      },
    },
    {
      name: "resumen_dia",
      description: "Dice qué hizo y qué le falta a Diego en un día (hoy por defecto). Úsala para '¿cómo voy?', '¿qué me falta?', 'hice la rutina a medias' o cuando no está claro qué hizo.",
      parameters: { type: "object", properties: { dias_atras: { type: "integer", description: "0 = hoy, 1 = ayer…" } } },
      run({ dias_atras }) {
        const back = Number.isInteger(dias_atras) && dias_atras > 0 ? Math.min(dias_atras, 30) : 0;
        const n = clock();
        const date = shiftDate(n.date, -back);
        const dow = (n.dow - back + 70) % 7;
        const { done, pending } = r.dayStatus(date, dow);
        const total = done.length + pending.length;
        const when = back === 0 ? "Hoy" : back === 1 ? "Ayer" : `El ${DAY_NAMES[dow]}`;
        if (!total) return { ok: true, say: `${when} no había nada en la rutina.`, data: { hechas: [], pendientes: [] } };
        let say = `${when} llevas ${done.length} de ${total}.`;
        if (back) say = `${when} hiciste ${done.length} de ${total}.`;
        if (done.length) say += ` Hecho: ${joinY(done.map((t) => t.title))}.`;
        if (pending.length) say += ` ${back ? "Quedó pendiente" : "Te falta"}: ${joinY(pending.map((t) => `${t.title} (${t.time})`))}.`;
        else say += " Todo listo.";
        return { ok: true, say, data: { hechas: done.map((t) => t.title), pendientes: pending.map((t) => ({ titulo: t.title, hora: t.time })) } };
      },
    },
    {
      name: "ver_semana",
      description: "Cuántas veces cumplió cada tarea en los últimos 7 días. Para '¿cómo voy esta semana?' o '¿qué me cuesta más?'.",
      parameters: { type: "object", properties: {} },
      run() {
        const n = clock();
        const rows = r.tasks.map((t) => {
          let due = 0;
          let ok = 0;
          for (let i = 0; i < 7; i++) {
            const dow = (n.dow - i + 70) % 7;
            if (!t.days.includes(dow)) continue;
            due++;
            if (t.done.includes(shiftDate(n.date, -i))) ok++;
          }
          return { titulo: t.title, cumplidas: ok, tocaban: due };
        }).filter((x) => x.tocaban);
        if (!rows.length) return { ok: true, say: "Todavía no tienes tareas en la rutina.", data: [] };
        const ok = rows.reduce((a, x) => a + x.cumplidas, 0);
        const due = rows.reduce((a, x) => a + x.tocaban, 0);
        const worst = [...rows].sort((a, b) => a.cumplidas / a.tocaban - b.cumplidas / b.tocaban)[0];
        return {
          ok: true,
          say: `Esta semana cumpliste ${ok} de ${due} (${Math.round((ok / due) * 100)}%). Lo que más te cuesta: ${worst.titulo}, ${worst.cumplidas} de ${worst.tocaban}.`,
          data: rows,
        };
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
