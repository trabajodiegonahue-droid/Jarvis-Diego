// Herramientas de JARVIS para la fase 5: bitácora de tiempo (al minuto), bienestar, hábitos,
// calendario unificado y clima. Igual que las otras: lo que anota se puede deshacer.
import { addDays, dow, fechaCorta, lunesDe } from "../core/dates";
import { DAY_NAMES, type ChileNow } from "../core/time";
import type { AppStore } from "../data/store";
import { uid, type Actividad, type CatTiempo, type Dia, type Habito } from "../data/types";
import { eventosDia, semanaCal } from "../calendar/calc";
import { activos, aplica, racha } from "../habits/calc";
import { norm, type Routine } from "../routine/routine";
import type { Tool, ToolResult } from "../tools/registry";
import { cat, catPara, CATS, corriendo, fraseTiempo, horasTxt, iso, minutosEntreIso, tiempoPeriodo } from "../time/calc";
import { describir, type Clima } from "../weather/clima";

export interface DiaDeps {
  store: AppStore;
  routine: Routine;
  clock: () => ChileNow;
  clima?: () => Promise<Clima | null>;
  aguaMeta?: () => number;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const CAT_IDS = CATS.map((c) => c.id);
const y = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function diaTools({ store, routine, clock, clima, aguaMeta = () => 8 }: DiaDeps): Tool[] {
  const d = () => store.data;
  const ahora = () => {
    const n = clock();
    return iso(n.date, hhmm(n.minutes));
  };
  const catDe = (a: any): CatTiempo => (CAT_IDS.includes(a.categoria) ? a.categoria : catPara(String(a.texto || "")) || "otro");
  const notaDe = (a: any, c: CatTiempo) => {
    const t = String(a.texto || "").trim();
    // Si el texto solo dice la categoría ("estudiar"), no hace falta guardarlo como nota.
    return t && (c === "otro" || t.split(" ").length > 1) ? cap(t) : undefined;
  };

  async function guardarDia(fecha: string, patch: Partial<Dia>) {
    const antes = d().dias.find((x) => x.id === fecha);
    const nuevo: Dia = { ...(antes || { id: fecha, habitos: [] }), ...patch };
    await store.put("dias", nuevo);
    return () => (antes ? store.put("dias", antes) : store.remove("dias", fecha).then(() => {}));
  }

  function cerrarCorriendo(fin: string): { act: Actividad; antes: Actividad } | null {
    const c = corriendo(d().actividades);
    if (!c) return null;
    const act = { ...c, fin: fin > c.inicio ? fin : c.inicio };
    void store.put("actividades", act);
    return { act, antes: c };
  }

  const buscarHabito = (q: string): Habito | null => {
    const t = norm(q);
    const hs = activos(d().habitos);
    return hs.find((h) => norm(h.nombre) === t) || hs.find((h) => norm(h.nombre).includes(t) || t.includes(norm(h.nombre))) || hs.find((h) => norm(h.nombre).split(" ")[0] === t.split(" ")[0]) || null;
  };

  return [
    // ---------- Bitácora ----------
    {
      name: "iniciar_actividad",
      description: "Parte el cronómetro de la bitácora: Diego empezó a hacer algo ahora (estudiar, trabajar, gym, celular, dormir…). Cierra lo que estaba corriendo.",
      parameters: { type: "object", properties: { texto: { type: "string", description: "Qué empezó a hacer, en sus palabras" }, categoria: { type: "string", enum: CAT_IDS } } },
      run: (a) => {
        const now = ahora();
        const c = catDe(a);
        const prev = cerrarCorriendo(now);
        const act: Actividad = { id: uid(), cat: c, inicio: now, ...(notaDe(a, c) ? { nota: notaDe(a, c) } : {}) };
        void store.put("actividades", act);
        const cerrado = prev ? ` Cerré ${prev.act.nota?.toLowerCase() || cat(prev.act.cat).nombre.toLowerCase()} (${horasTxt(minutosEntreIso(prev.act.inicio, prev.act.fin!))}).` : "";
        const say = c === "sueno" ? `Que descanses.${cerrado} Cuando despiertes, dime "me desperté" y anoto cuánto dormiste.` : `Partí el cronómetro: ${act.nota?.toLowerCase() || cat(c).nombre.toLowerCase()}, desde las ${now.slice(11)}.${cerrado} Dime "terminé" cuando acabes.`;
        return {
          ok: true,
          say,
          undo: async () => {
            await store.remove("actividades", act.id);
            if (prev) await store.put("actividades", prev.antes);
          },
        };
      },
    },
    {
      name: "terminar_actividad",
      description: "Detiene el cronómetro de la bitácora (Diego terminó lo que estaba haciendo).",
      parameters: { type: "object", properties: {} },
      run: async () => {
        const now = ahora();
        const prev = cerrarCorriendo(now);
        if (!prev) return { ok: false, say: 'No tenías nada corriendo. Si quieres anotar algo que ya pasó, dime por ejemplo "de 14 a 16 estuve estudiando".' };
        const min = minutosEntreIso(prev.act.inicio, prev.act.fin!);
        let extra = "";
        let undoDia: (() => Promise<void>) | null = null;
        if (prev.act.cat === "sueno") {
          const h = Math.round((min / 60) * 2) / 2;
          undoDia = await guardarDia(now.slice(0, 10), { sueno: h });
          extra = ` Dormiste ${String(h).replace(".", ",")} horas.`;
        }
        return {
          ok: true,
          say: `Listo: ${prev.act.nota?.toLowerCase() || cat(prev.act.cat).nombre.toLowerCase()}, ${horasTxt(min)}.${extra}`,
          undo: async () => {
            await store.put("actividades", prev.antes);
            await undoDia?.();
          },
        };
      },
    },
    {
      name: "registrar_bloque",
      description: "Anota en la bitácora algo que ya pasó: con hora de inicio y fin (HH:MM), o con los minutos que duró (termina ahora).",
      parameters: { type: "object", properties: { texto: { type: "string" }, categoria: { type: "string", enum: CAT_IDS }, inicio: { type: "string" }, fin: { type: "string" }, minutos: { type: "integer" }, fecha: { type: "string", description: "AAAA-MM-DD del término; omitir si es hoy" } } },
      run: async (a): Promise<ToolResult> => {
        const n = clock();
        const now = ahora();
        const c = catDe(a);
        let ini: string;
        let fin: string;
        const fecha = typeof a.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.fecha) ? a.fecha : n.date;
        if (/^\d{2}:\d{2}$/.test(a.inicio || "") && /^\d{2}:\d{2}$/.test(a.fin || "")) {
          // Si el fin es antes que el inicio, empezó el día anterior (dormir de 23:30 a 7).
          fin = iso(fecha, a.fin);
          ini = iso(a.fin <= a.inicio ? addDays(fecha, -1) : fecha, a.inicio);
          // Un rango que todavía no termina hoy probablemente era de ayer ("de 22 a 23" dicho a las 10).
          if (fin > now && fecha === n.date) {
            if (ini < now) fin = now;
            else {
              fin = iso(addDays(fecha, -1), a.fin);
              ini = iso(a.fin <= a.inicio ? addDays(fecha, -2) : addDays(fecha, -1), a.inicio);
            }
          }
        } else if (Number(a.minutos) > 0) {
          fin = now;
          const m = n.minutes - Math.round(Number(a.minutos));
          ini = m >= 0 ? iso(n.date, hhmm(m)) : iso(addDays(n.date, -1), hhmm(1440 + m));
        } else return { ok: false, say: "¿De qué hora a qué hora fue? Por ejemplo: de 14 a 16 estuve estudiando." };
        const min = minutosEntreIso(ini, fin);
        if (min <= 0 || min > 20 * 60) return { ok: false, say: "Ese rango no me cuadra. Dímelo así: de 14 a 16 estuve estudiando." };
        const act: Actividad = { id: uid(), cat: c, inicio: ini, fin, ...(notaDe(a, c) ? { nota: notaDe(a, c) } : {}) };
        await store.put("actividades", act);
        let extra = "";
        let undoDia: (() => Promise<void>) | null = null;
        if (c === "sueno" && min >= 180) {
          const h = Math.round((min / 60) * 2) / 2;
          undoDia = await guardarDia(fin.slice(0, 10), { sueno: h });
          extra = ` Son ${String(h).replace(".", ",")} horas de sueño.`;
        }
        const dia = fin.slice(0, 10) === n.date ? "" : fin.slice(0, 10) === addDays(n.date, -1) ? " (ayer)" : ` (${fechaCorta(fin.slice(0, 10))})`;
        return {
          ok: true,
          say: `Anotado: ${act.nota?.toLowerCase() || cat(c).nombre.toLowerCase()} de ${ini.slice(11)} a ${fin.slice(11)}${dia}, ${horasTxt(min)}.${extra}`,
          undo: async () => {
            await store.remove("actividades", act.id);
            await undoDia?.();
          },
        };
      },
    },
    {
      name: "consultar_tiempo",
      description: "En qué se le fue el tiempo, según su bitácora (al minuto). periodo: hoy, ayer, semana, mes o anio. texto: una actividad para ver solo esa (estudio, celular…).",
      parameters: { type: "object", properties: { periodo: { type: "string", enum: ["hoy", "ayer", "semana", "mes", "anio"] }, texto: { type: "string" } } },
      run: (a) => {
        const n = clock();
        const now = ahora();
        const per = a.periodo || "hoy";
        const desde = per === "ayer" ? addDays(n.date, -1) : per === "semana" ? lunesDe(n.date) : per === "mes" ? `${n.date.slice(0, 7)}-01` : per === "anio" ? `${n.date.slice(0, 4)}-01-01` : n.date;
        const hasta = per === "ayer" ? addDays(n.date, -1) : n.date;
        const cuando = { hoy: "hoy", ayer: "ayer", semana: "esta semana", mes: "este mes", anio: "este año" }[per as string] || "hoy";
        const p = tiempoPeriodo(d(), desde, hasta, now);
        const c = a.texto ? catPara(String(a.texto)) : null;
        if (c) {
          const v = p.porCat[c] || 0;
          const dias = p.dias.length;
          return { ok: true, say: v ? `${cap(cuando)} llevas ${horasTxt(v)} de ${cat(c).nombre.toLowerCase()}${dias > 1 ? `, en promedio ${horasTxt(v / dias)} al día` : ""}.` : `${cap(cuando)} no tienes ${cat(c).nombre.toLowerCase()} en la bitácora.` };
        }
        const run = corriendo(d().actividades);
        return { ok: true, say: fraseTiempo(p, cuando) + (run && per === "hoy" ? ` Ahora mismo corre: ${run.nota?.toLowerCase() || cat(run.cat).nombre.toLowerCase()}.` : "") };
      },
    },

    // ---------- Bienestar y hábitos ----------
    {
      name: "registrar_dia",
      description: "Anota cómo está el día: horas de sueño, energía (1 a 5), ánimo (1 a 5), vasos de agua (agua_suma suma vasos) o una nota del diario.",
      parameters: { type: "object", properties: { sueno: { type: "number" }, energia: { type: "integer" }, animo: { type: "integer" }, agua: { type: "integer" }, agua_suma: { type: "integer" }, diario: { type: "string" }, fecha: { type: "string" } } },
      run: async (a) => {
        const fecha = typeof a.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.fecha) ? a.fecha : clock().date;
        const actual = d().dias.find((x) => x.id === fecha);
        const patch: Partial<Dia> = {};
        const dice: string[] = [];
        if (Number(a.sueno) > 0 && Number(a.sueno) <= 16) {
          patch.sueno = Math.round(Number(a.sueno) * 2) / 2;
          dice.push(`${String(patch.sueno).replace(".", ",")} horas de sueño`);
        }
        for (const k of ["energia", "animo"] as const) {
          const v = Math.round(Number(a[k]));
          if (v >= 1 && v <= 5) {
            patch[k] = v;
            dice.push(`${k === "energia" ? "energía" : "ánimo"} ${v} de 5`);
          }
        }
        if (Number(a.agua_suma) > 0 || Number(a.agua) >= 0) {
          const vasos = Number(a.agua_suma) > 0 ? (actual?.agua || 0) + Math.round(Number(a.agua_suma)) : Number.isFinite(Number(a.agua)) && a.agua != null ? Math.round(Number(a.agua)) : undefined;
          if (vasos != null) {
            patch.agua = Math.min(40, vasos);
            dice.push(`${patch.agua} de ${aguaMeta()} vasos de agua`);
          }
        }
        if (typeof a.diario === "string" && a.diario.trim()) {
          patch.diario = [actual?.diario, a.diario.trim()].filter(Boolean).join("\n");
          dice.push("tu nota del día");
        }
        if (!dice.length) return { ok: false, say: "¿Qué anoto? Puede ser cuánto dormiste, tu ánimo o el agua." };
        const undo = await guardarDia(fecha, patch);
        let say = `Anotado: ${y(dice)}.`;
        if (patch.sueno != null && patch.sueno < 6) say += " Poco sueño: hoy ve suave y acuéstate temprano.";
        if (patch.animo != null && patch.animo <= 2) say += " Ánimo. Si quieres, cuéntame qué pasó.";
        if (patch.energia != null && patch.energia <= 2) say += " Si te toca entrenar, la sesión de hoy se ajusta sola.";
        if (patch.agua != null && patch.agua >= aguaMeta() && (actual?.agua || 0) < aguaMeta()) say += " Cumpliste el agua del día. Bien ahí.";
        return { ok: true, say, undo };
      },
    },
    {
      name: "marcar_habito",
      description: "Marca como cumplido un hábito de Diego (hoy o en la fecha que diga).",
      parameters: { type: "object", properties: { nombre: { type: "string" }, fecha: { type: "string" } }, required: ["nombre"] },
      run: async (a) => {
        const h = buscarHabito(String(a.nombre || ""));
        if (!h) {
          const hs = activos(d().habitos);
          return { ok: false, say: hs.length ? `No encontré ese hábito. Tienes ${y(hs.map((x) => x.nombre.toLowerCase()))}.` : 'Todavía no tienes hábitos. Dime por ejemplo "crea el hábito leer 15 minutos".' };
        }
        const fecha = typeof a.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.fecha) ? a.fecha : clock().date;
        const actual = d().dias.find((x) => x.id === fecha);
        if (actual?.habitos.includes(h.id)) return { ok: true, say: `${h.nombre} ya estaba marcado.` };
        const undo = await guardarDia(fecha, { habitos: [...(actual?.habitos || []), h.id] });
        const r = racha(h, d().dias, clock().date);
        const faltan = activos(d().habitos).filter((x) => x.id !== h.id && aplica(x, fecha) && !actual?.habitos.includes(x.id));
        return { ok: true, say: `Marcado: ${h.nombre.toLowerCase()}.${r >= 2 ? ` Llevas ${r} días seguidos.` : ""}${faltan.length ? ` Te queda ${y(faltan.slice(0, 3).map((x) => x.nombre.toLowerCase()))}.` : " Cumpliste todos tus hábitos de hoy."}`, undo };
      },
    },
    {
      name: "crear_habito",
      description: "Crea un hábito diario (o solo algunos días: dias = 0 lunes … 6 domingo; vacío = todos los días).",
      parameters: { type: "object", properties: { nombre: { type: "string" }, dias: { type: "array", items: { type: "integer" } } }, required: ["nombre"] },
      run: async (a) => {
        const nombre = cap(String(a.nombre || "").trim());
        if (!nombre) return { ok: false, say: "¿Cómo se llama el hábito?" };
        if (buscarHabito(nombre) && norm(buscarHabito(nombre)!.nombre) === norm(nombre)) return { ok: true, say: `Ya tienes el hábito ${nombre.toLowerCase()}.` };
        const dias = Array.isArray(a.dias) ? a.dias.filter((x: number) => x >= 0 && x <= 6) : [];
        const h: Habito = { id: uid(), nombre, dias, orden: d().habitos.length };
        await store.put("habitos", h);
        return { ok: true, say: `Creé el hábito ${nombre.toLowerCase()}${dias.length && dias.length < 7 ? `, ${dias.length === 5 && dias.every((x: number) => x < 5) ? "de lunes a viernes" : `los ${y(dias.map((x: number) => DAY_NAMES[x]))}`}` : ", todos los días"}. Cuando lo cumplas, dime "hice el hábito ${nombre.toLowerCase()}".`, undo: () => store.remove("habitos", h.id).then(() => {}) };
      },
    },

    // ---------- Calendario ----------
    {
      name: "ver_calendario",
      description: "Lo que tiene un día o una semana juntando turnos, partidos, físico, rutina, pruebas y metas, y si algo se cruza. fecha AAAA-MM-DD, o semana: esta / proxima.",
      parameters: { type: "object", properties: { fecha: { type: "string" }, semana: { type: "string", enum: ["esta", "proxima"] } } },
      run: (a) => {
        const hoy = clock().date;
        if (typeof a.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.fecha)) {
          const dc = eventosDia(d(), routine.tasks, a.fecha);
          const cuando = a.fecha === addDays(hoy, 1) ? "Mañana" : `El ${DAY_NAMES[dow(a.fecha)]} ${Number(a.fecha.slice(8))}`;
          const ev = dc.eventos.filter((e) => e.tipo !== "rutina");
          const rut = dc.eventos.filter((e) => e.tipo === "rutina");
          if (!dc.eventos.length) return { ok: true, say: `${cuando} no tienes nada anotado.` };
          const txt = ev.map((e) => `${e.titulo.replace(/^Físico: /, "físico, ").replace(/^./, (c) => c.toLowerCase())}${e.inicio ? ` a las ${e.inicio}` : ""}`);
          return { ok: true, say: `${cuando} tienes ${y(txt) || "solo tu rutina"}${rut.length ? `${ev.length ? ", más" : ":"} ${rut.length} ${rut.length === 1 ? "cosa" : "cosas"} de la rutina` : ""}.${dc.choques.length ? ` Ojo: ${dc.choques[0]}` : ""}` };
        }
        const lunes = a.semana === "proxima" ? addDays(lunesDe(hoy), 7) : lunesDe(hoy);
        const sem = semanaCal(d(), routine.tasks, lunes).filter((x) => a.semana === "proxima" || x.fecha >= hoy);
        const choques = sem.flatMap((x) => x.choques.map((c) => `el ${DAY_NAMES[dow(x.fecha)]}: ${c}`));
        const fuertes = sem.flatMap((x) => x.eventos.filter((e) => e.tipo === "partido" || e.tipo === "prueba" || e.tipo === "meta").map((e) => `${e.titulo.replace(/^./, (c) => c.toLowerCase())} el ${DAY_NAMES[dow(x.fecha)]}`));
        const turnos = sem.reduce((n, x) => n + x.eventos.filter((e) => e.tipo === "turno").length, 0);
        const fisico = sem.reduce((n, x) => n + x.eventos.filter((e) => e.tipo === "fisico" && !e.hecho).length, 0);
        const partes = [turnos ? `${turnos} ${turnos === 1 ? "turno" : "turnos"}` : "", fisico ? `${fisico} ${fisico === 1 ? "sesión de físico" : "sesiones de físico"}` : "", ...fuertes].filter(Boolean);
        const cuando = a.semana === "proxima" ? "La próxima semana" : "Lo que queda de la semana";
        if (!partes.length && !choques.length) return { ok: true, say: `${cuando} está tranquila: no hay turnos, partidos ni pruebas anotados.` };
        return { ok: true, say: `${cuando}: ${y(partes)}.${choques.length ? ` Ojo con ${choques.length === 1 ? "un choque" : `${choques.length} choques`}: ${choques[0]}` : " Nada se cruza."}` };
      },
    },

    // ---------- Clima ----------
    {
      name: "consultar_clima",
      description: "El pronóstico de hoy o mañana en la ciudad de Diego (Open-Meteo).",
      parameters: { type: "object", properties: { dia: { type: "string", enum: ["hoy", "manana"] } } },
      run: async (a) => {
        const c = clima ? await clima().catch(() => null) : null;
        if (!c) return { ok: false, say: "No pude ver el clima ahora: parece que no hay internet. Prueba en un rato." };
        const fecha = a.dia === "manana" ? addDays(clock().date, 1) : clock().date;
        const x = c.dias.find((z) => z.fecha === fecha);
        if (!x) return { ok: false, say: "No tengo el pronóstico de ese día." };
        const ciudad = c.ciudad.split(",")[0];
        const ahoraTxt = a.dia !== "manana" && c.actual ? ` Ahora hay ${c.actual.temp} grados.` : "";
        const lluvia = x.lluvia >= 30 ? ` Probabilidad de lluvia: ${x.lluvia}%${x.mm >= 1 ? `, unos ${String(x.mm).replace(".", ",")} milímetros` : ""}.` : " Sin lluvia a la vista.";
        return { ok: true, say: `${a.dia === "manana" ? "Mañana" : "Hoy"} en ${ciudad}: ${x.min} a ${x.max} grados, ${describir(x.codigo)}.${ahoraTxt}${lluvia}` };
      },
    },
  ];
}
