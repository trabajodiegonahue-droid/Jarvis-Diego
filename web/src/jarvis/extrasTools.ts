// Herramientas de JARVIS para recordatorios, memoria, fechas importantes, lista de compras,
// simulador de metas, semana difícil y "lo que viene" en los próximos días.
import { MESES, cap, joinY, p2 } from "../core/texto";
import { addDays, dow, fechaCorta } from "../core/dates";
import { DAY_NAMES, type ChileNow } from "../core/time";
import type { AppStore } from "../data/store";
import { uid, type Compra, type FechaImportante, type Recordatorio, type Recuerdo } from "../data/types";
import { eventosDia } from "../calendar/calc";
import { enDificil, esSensible, fraseFecha, fraseSimulacion, proximasFechas, simular, type Periodo } from "../extras/calc";
import { norm, type Routine } from "../routine/routine";
import { ahoraIso, cuandoTxt, parseCuando, proximos } from "../reminders/calc";
import type { Tool } from "../tools/registry";
import { buscarMeta } from "./resumenes";
import { clp } from "../money/format";
import { logros } from "../extras/calc";
import { area, AREAS_VIDA, clasificarArea, estadoArea, type AreaVida } from "../areas/calc";
import { hhmm } from "../core/texto";
import type { Nota } from "../data/types";

const sinTilde = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const VACIAS = new Set(["que", "dije", "conte", "te", "de", "del", "la", "el", "los", "las", "mi", "mis", "sobre", "cuando", "fue", "ultima", "vez", "una", "uno", "con", "por", "para", "en", "y", "lo", "me", "se", "hace", "anote"]);
const palabrasClave = (t: string) => sinTilde(t).replace(/[^a-zñ0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !VACIAS.has(w)).map((w) => w.replace(/(es|s)$/, "")).filter((w) => w.length > 2);

export interface ExtrasDeps {
  store: AppStore;
  routine?: Routine;
  clock: () => ChileNow;
  dificil?: { get: () => Periodo[]; set: (p: Periodo[]) => void };
}


export function extrasTools({ store, clock, dificil }: ExtrasDeps): Tool[] {
  const d = () => store.data;
  const ahora = () => {
    const n = clock();
    return ahoraIso(n.date, n.minutes);
  };

  return [
    // ---------- Recordatorios ----------
    {
      name: "crear_recordatorio",
      description: "Crea un recordatorio. texto: qué recordar. cuando: la frase de cuándo, tal como la dijo Diego (\"mañana a las 9\", \"el viernes\", \"en 2 horas\", \"todos los lunes a las 7\").",
      parameters: { type: "object", properties: { texto: { type: "string" }, cuando: { type: "string" } }, required: ["texto"] },
      run: async (a) => {
        const n = clock();
        const texto = String(a.texto || "").trim().replace(/^(que |de )/i, "");
        if (!texto) return { ok: false, say: "¿Qué te recuerdo?" };
        if (esSensible(texto)) return { ok: false, say: "Eso parece una clave o un dato de tarjeta: mejor no lo guardo. Para claves usa el llavero del iPhone." };
        const c = parseCuando(String(a.cuando || texto), n.date, n.minutes);
        if (!c) return { ok: false, say: `¿Cuándo te recuerdo "${texto}"? Por ejemplo: mañana a las 9, el viernes en la tarde o en 2 horas.` };
        const r: Recordatorio = { id: uid(), texto: cap(texto), cuando: `${c.fecha}T${c.hora}`, ...(c.repetir ? { repetir: c.repetir } : {}) };
        await store.put("recordatorios", r);
        const dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];
        const cuando = r.repetir === "diario" ? `todos los días a las ${c.hora}` : r.repetir === "semanal" ? `todos los ${dias[dow(c.fecha)]} a las ${c.hora}` : r.repetir === "mensual" ? `todos los meses, el ${Number(c.fecha.slice(8))}, a las ${c.hora}` : r.repetir === "anual" ? `todos los años, el ${fechaCorta(c.fecha)}` : cuandoTxt(r.cuando, n.date);
        if (a.agenda) return { ok: true, say: `Agendé ${r.texto.toLowerCase()} ${cuando}; te aviso a esa hora.`, undo: () => store.remove("recordatorios", r.id).then(() => {}) };
        return { ok: true, say: `Listo, te recuerdo "${r.texto.toLowerCase()}" ${cuando}.${c.horaDicha ? "" : " Como no me dijiste la hora, te aviso a las 9."}`, undo: () => store.remove("recordatorios", r.id).then(() => {}) };
      },
    },
    {
      name: "ver_recordatorios",
      description: "Los recordatorios que vienen en los próximos días.",
      parameters: { type: "object", properties: { dias: { type: "integer" } } },
      run: () => {
        const n = clock();
        const rs = proximos(d().recordatorios, ahora(), 14);
        if (!rs.length) return { ok: true, say: 'No tienes recordatorios pendientes. Dime por ejemplo "recuérdame pagar la luz el viernes a las 10".' };
        return { ok: true, say: `Tienes ${rs.length === 1 ? "un recordatorio" : `${rs.length} recordatorios`}: ${joinY(rs.slice(0, 5).map((r) => `${r.texto.toLowerCase()} ${cuandoTxt(r.cuando, n.date)}`))}${rs.length > 5 ? ", y más en Recordatorios" : ""}.` };
      },
    },
    {
      name: "borrar_recordatorio",
      description: "Borra o da por listo un recordatorio por su texto.",
      parameters: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
      run: async (a) => {
        const t = norm(String(a.texto || ""));
        const r = d().recordatorios.filter((x) => !x.hecho).find((x) => norm(x.texto).includes(t) || t.includes(norm(x.texto)) || norm(x.texto).split(" ").some((w) => w.length > 3 && t.split(" ").includes(w)));
        if (!r) return { ok: false, say: "No encontré ese recordatorio." };
        const u = await store.remove("recordatorios", r.id);
        return { ok: true, say: `Listo, borré "${r.texto.toLowerCase()}".`, undo: () => u() };
      },
    },
    {
      name: "lo_que_viene",
      description: "Lo que tiene Diego en los próximos días (por defecto 3): turnos, partidos, pruebas, metas que vencen, cumpleaños, recordatorios y lo que contó.",
      parameters: { type: "object", properties: { dias: { type: "integer" } } },
      run: (a) => {
        const n = clock();
        const dias = Math.min(14, Math.max(1, Number(a.dias) || 3));
        const partes: string[] = [];
        for (let i = 1; i <= dias; i++) {
          const f = addDays(n.date, i);
          const ev = eventosDia(d(), [], f).eventos.filter((e) => e.tipo !== "rutina" && e.tipo !== "fisico");
          const recs = d().recordatorios.filter((r) => !r.hecho && r.cuando.startsWith(f));
          const rec = d().recuerdos.filter((r) => r.fecha === f);
          const cosas = [...ev.map((e) => `${e.titulo.replace(/^./, (c) => c.toLowerCase())}${e.inicio ? ` a las ${e.inicio}` : ""}`), ...recs.map((r) => `${r.texto.toLowerCase()} (recordatorio, ${r.cuando.slice(11)})`), ...rec.map((r) => r.texto.toLowerCase())];
          const fechas = proximasFechas(d().fechas, n.date, dias).filter((p) => p.fecha === f);
          cosas.push(...fechas.map((p) => p.f.nombre.toLowerCase()));
          if (cosas.length) partes.push(`${i === 1 ? "Mañana" : i === 2 ? "Pasado mañana" : `El ${DAY_NAMES[dow(f)]}`}: ${joinY(cosas)}.`);
        }
        return { ok: true, say: partes.length ? partes.join(" ") : `Los próximos ${dias} días están tranquilos: no tienes nada anotado fuera de tu rutina.` };
      },
    },

    // ---------- Memoria ----------
    {
      name: "recordar",
      description: "Guarda algo que Diego quiere que JARVIS recuerde (\"mañana tengo prueba\", \"me lesioné el tobillo\", \"la Cata es mi polola\"). Nunca claves ni datos de tarjetas.",
      parameters: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
      run: async (a) => {
        const n = clock();
        const texto = String(a.texto || "").trim().replace(/^(que )/i, "");
        if (!texto) return { ok: false, say: "¿Qué quieres que recuerde?" };
        if (esSensible(texto)) return { ok: false, say: "Eso parece una clave, un número de tarjeta o de cuenta: eso no lo guardo. Usa el llavero del iPhone para eso." };
        const c = parseCuando(texto, n.date, n.minutes);
        const r: Recuerdo = { id: uid(), texto: cap(texto), creado: n.date, ...(c && !c.repetir ? { fecha: c.fecha } : {}) };
        await store.put("recuerdos", r);
        return { ok: true, say: `Ya, me acuerdo: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}.${r.fecha && r.fecha > n.date ? ` Te lo menciono ${r.fecha === addDays(n.date, 1) ? "mañana" : `el ${fechaCorta(r.fecha)}`} en el resumen.` : ""}`, undo: () => store.remove("recuerdos", r.id).then(() => {}) };
      },
    },
    {
      name: "que_recuerdas",
      description: "Lo que JARVIS recuerda de lo que Diego le ha contado.",
      parameters: { type: "object", properties: {} },
      run: () => {
        const rs = [...d().recuerdos].sort((a, b) => b.creado.localeCompare(a.creado));
        if (!rs.length) return { ok: true, say: 'Todavía no me has pedido que recuerde nada. Dime por ejemplo "acuérdate que el viernes tengo prueba de inglés".' };
        return { ok: true, say: `Me acuerdo de ${rs.length === 1 ? "esto" : "estas cosas"}: ${joinY(rs.slice(0, 6).map((r) => r.texto.charAt(0).toLowerCase() + r.texto.slice(1)))}.${rs.length > 6 ? " Y más en Más → Recordatorios." : ""} Si quieres que olvide algo, dime "olvida lo de..." .` };
      },
    },
    {
      name: "olvidar",
      description: "Borra un recuerdo (o todos, con texto 'todo').",
      parameters: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
      needsConfirm: (a) => (/^(todo|todos|todo lo que sabes)$/i.test(String(a.texto || "").trim()) ? "¿Seguro que olvido todo lo que me has contado?" : null),
      run: async (a) => {
        const t = norm(String(a.texto || ""));
        if (/^(todo|todos|todo lo que sabes)$/.test(t)) {
          const ids = d().recuerdos.map((r) => r.id);
          const u = await store.remove("recuerdos", ...ids);
          return { ok: true, say: "Listo, olvidé todo lo que me habías contado.", undo: () => u() };
        }
        const r = d().recuerdos.find((x) => norm(x.texto).includes(t) || norm(x.texto).split(" ").some((w) => w.length > 3 && t.split(" ").includes(w)));
        if (!r) return { ok: false, say: "No encuentro eso en lo que me has contado." };
        const u = await store.remove("recuerdos", r.id);
        return { ok: true, say: `Listo, olvidé que ${r.texto.charAt(0).toLowerCase()}${r.texto.slice(1)}.`, undo: () => u() };
      },
    },

    // ---------- Fechas importantes ----------
    {
      name: "agregar_fecha",
      description: "Guarda un cumpleaños, aniversario u otra fecha que se repite cada año. dia: MM-DD. anio opcional (nacimiento).",
      parameters: { type: "object", properties: { nombre: { type: "string" }, dia: { type: "string" }, anio: { type: "integer" }, tipo: { type: "string", enum: ["cumple", "aniversario", "otro"] } }, required: ["nombre", "dia"] },
      run: async (a) => {
        if (!/^\d{2}-\d{2}$/.test(a.dia || "")) return { ok: false, say: "¿Qué día es? Por ejemplo: el 3 de mayo." };
        const tipo = ["cumple", "aniversario", "otro"].includes(a.tipo) ? a.tipo : "cumple";
        const quien = String(a.nombre || "").trim();
        const nombre = tipo === "cumple" && !/^cumple/i.test(quien) ? `Cumpleaños de ${quien}` : cap(quien);
        if (d().fechas.some((x) => norm(x.nombre) === norm(nombre) && x.dia === a.dia)) return { ok: true, say: `${nombre} ya lo tenía anotado.` };
        const f: FechaImportante = { id: uid(), nombre, dia: a.dia, tipo, ...(Number(a.anio) > 1900 ? { anio: Number(a.anio) } : {}) };
        await store.put("fechas", f);
        const prox = proximasFechas([f], clock().date, 366)[0];
        return { ok: true, say: `Anotado: ${nombre.charAt(0).toLowerCase()}${nombre.slice(1)}, el ${Number(a.dia.slice(3))} de ${MESES[Number(a.dia.slice(0, 2)) - 1]}. Te aviso unos días antes${prox ? ` (faltan ${prox.enDias} días)` : ""}.`, undo: () => store.remove("fechas", f.id).then(() => {}) };
      },
    },
    {
      name: "proximas_fechas",
      description: "Cumpleaños y fechas importantes que vienen (o la de una persona).",
      parameters: { type: "object", properties: { nombre: { type: "string" } } },
      run: (a) => {
        const hoy = clock().date;
        if (a.nombre) {
          const t = norm(String(a.nombre));
          const p = proximasFechas(d().fechas, hoy, 366).find((x) => norm(x.f.nombre).includes(t) || t.split(" ").some((w) => w.length > 2 && norm(x.f.nombre).includes(w)));
          return p ? { ok: true, say: fraseFecha(p) } : { ok: false, say: `No tengo anotada esa fecha. Dime por ejemplo "el cumpleaños de ${a.nombre} es el 3 de mayo".` };
        }
        const ps = proximasFechas(d().fechas, hoy, 60);
        if (!ps.length) return { ok: true, say: d().fechas.length ? "No hay cumpleaños ni fechas importantes en los próximos dos meses." : 'No tienes fechas anotadas. Dime "el cumpleaños de mi mamá es el 3 de mayo".' };
        return { ok: true, say: ps.slice(0, 4).map(fraseFecha).join(" ") };
      },
    },

    // ---------- Lista de compras ----------
    {
      name: "agregar_compras",
      description: "Agrega cosas a la lista de compras.",
      parameters: { type: "object", properties: { cosas: { type: "array", items: { type: "string" } } }, required: ["cosas"] },
      run: async (a) => {
        const ya = new Set(d().compras.filter((c) => !c.hecho).map((c) => norm(c.texto)));
        const nuevas: Compra[] = ((a.cosas as string[]) || []).map((x) => String(x).trim()).filter((x) => x && !ya.has(norm(x))).map((x, i) => ({ id: uid(), texto: cap(x), hecho: false, creado: Date.now() + i }));
        if (!nuevas.length) return { ok: true, say: "Eso ya estaba en la lista." };
        await store.put("compras", ...nuevas);
        const total = d().compras.filter((c) => !c.hecho).length;
        return { ok: true, say: `Agregué ${joinY(nuevas.map((c) => c.texto.toLowerCase()))} a la lista. Van ${total} ${total === 1 ? "cosa" : "cosas"}.`, undo: () => store.remove("compras", ...nuevas.map((c) => c.id)).then(() => {}) };
      },
    },
    {
      name: "ver_compras",
      description: "Lo que hay en la lista de compras.",
      parameters: { type: "object", properties: {} },
      run: () => {
        const cs = d().compras.filter((c) => !c.hecho);
        return { ok: true, say: cs.length ? `En la lista tienes: ${joinY(cs.map((c) => c.texto.toLowerCase()))}.` : "La lista de compras está vacía." };
      },
    },
    {
      name: "marcar_compras",
      description: "Marca como compradas cosas de la lista (o 'todo'), o vacía la lista.",
      parameters: { type: "object", properties: { cosas: { type: "array", items: { type: "string" } }, todo: { type: "boolean" } } },
      run: async (a) => {
        const pend = d().compras.filter((c) => !c.hecho);
        const quiere = ((a.cosas as string[]) || []).map((x) => norm(x));
        const elegidas = a.todo ? pend : pend.filter((c) => quiere.some((q) => norm(c.texto).includes(q) || q.includes(norm(c.texto))));
        if (!elegidas.length) return { ok: false, say: pend.length ? `Eso no estaba en la lista. Tienes ${joinY(pend.map((c) => c.texto.toLowerCase()))}.` : "La lista ya está vacía." };
        await store.put("compras", ...elegidas.map((c) => ({ ...c, hecho: true })));
        const quedan = pend.length - elegidas.length;
        return { ok: true, say: `Listo, taché ${a.todo ? "todo" : joinY(elegidas.map((c) => c.texto.toLowerCase()))}.${quedan ? ` Te ${quedan === 1 ? "queda una cosa" : `quedan ${quedan}`}.` : " La lista quedó vacía."}`, undo: () => store.put("compras", ...elegidas) };
      },
    },

    // ---------- Simulador de metas ----------
    {
      name: "simular_meta",
      description: "Si Diego ahorra X al mes, cuándo llega a una meta de plata (y cuánto necesita para llegar a tiempo).",
      parameters: { type: "object", properties: { por_mes: { type: "integer" }, meta: { type: "string" } }, required: ["por_mes"] },
      run: (a) => {
        const hoy = clock().date;
        const plata = d().metas.filter((m) => !m.archivada && m.tipo === "monto");
        const m = a.meta ? buscarMeta(plata, String(a.meta)) : plata.find((x) => x.principal) || plata[0];
        if (!m) return { ok: false, say: plata.length ? `¿Para cuál meta? Tienes ${joinY(plata.map((x) => x.nombre))}.` : 'No tienes metas de plata. Dime "agrega una meta de ahorrar 500 lucas para marzo".' };
        const porMes = Math.round(Number(a.por_mes) || 0);
        if (porMes <= 0) {
          const sim = simular(m, d(), hoy, 0);
          return { ok: true, say: sim.meses === 0 ? `"${m.nombre}" ya está cumplida.` : `Para llegar a "${m.nombre}" a tiempo (${fechaCorta(m.fechaLimite)}), necesitas ahorrar unos ${clp(sim.necesario || 0)} al mes.`, privado: true };
        }
        return { ok: true, say: fraseSimulacion(m, simular(m, d(), hoy, porMes), porMes), privado: true };
      },
    },

    {
      name: "anotar_en_area",
      description: "Guarda algo que Diego cuenta en un área de su vida: salud, animo, dinero, amor, social (familia y amigos), entreno, futbol, estudios, trabajo, casa, metas, ocio u otro.",
      parameters: { type: "object", properties: { area: { type: "string", enum: AREAS_VIDA.map((a) => a.id) }, texto: { type: "string" } }, required: ["texto"] },
      run: async (a) => {
        const texto = String(a.texto || "").trim();
        if (!texto) return { ok: false, say: "¿Qué anoto?" };
        const id: AreaVida = AREAS_VIDA.some((x) => x.id === a.area) ? a.area : clasificarArea(texto);
        const n = clock();
        const nota: Nota = { id: uid(), fecha: `${n.date}T${hhmm(n.minutes)}`, area: id, texto: cap(texto), origen: "jarvis" };
        await store.put("notas", nota);
        return { ok: true, say: `Anotado en ${area(id).nombre}.`, undo: () => store.remove("notas", nota.id).then(() => {}) };
      },
    },
    {
      name: "buscar_en_mi_vida",
      description: "Busca en todo lo que Diego ha contado o anotado (notas por área, recuerdos, gastos, entrenos, partidos, recordatorios) y dice cuándo fue. Úsala para '¿qué te dije de…?', '¿cuándo fue la última vez que…?'.",
      parameters: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
      run: (a) => {
        const hoy = clock().date;
        const ws = palabrasClave(String(a.texto || ""));
        if (!ws.length) return { ok: false, say: "¿Qué busco? Dime una palabra, por ejemplo: rodilla, dentista o polola." };
        const items: { fecha: string; texto: string }[] = [
          ...d().notas.map((n) => ({ fecha: n.fecha.slice(0, 10), texto: n.texto })),
          ...d().recuerdos.map((r) => ({ fecha: r.creado, texto: r.texto })),
          ...d().movimientos.filter((m) => m.nota).map((m) => ({ fecha: m.fecha, texto: `${m.tipo === "egreso" ? "gasto" : "ingreso"} de ${clp(m.monto)}: ${m.nota}` })),
          ...d().entrenos.map((e) => ({ fecha: e.fecha, texto: `entreno: ${e.nombre}${e.nota ? ` (${e.nota})` : ""}` })),
          ...d().partidos.filter((p) => p.fui).map((p) => ({ fecha: p.fecha, texto: `${p.tipo === "partido" ? "partido" : "entrenamiento con el equipo"}${p.rival ? ` vs. ${p.rival}` : ""}${p.goles ? `, ${p.goles} goles` : ""}` })),
          ...d().recordatorios.map((r) => ({ fecha: r.cuando.slice(0, 10), texto: `recordatorio: ${r.texto}` })),
        ];
        const hits = items
          .map((x) => ({ x, s: ws.filter((w) => sinTilde(x.texto).includes(w)).length }))
          .filter((h) => h.s > 0)
          .sort((p, q) => q.s - p.s || q.x.fecha.localeCompare(p.x.fecha))
          .slice(0, 4)
          .sort((p, q) => q.x.fecha.localeCompare(p.x.fecha));
        if (!hits.length) return { ok: true, say: `No encuentro nada sobre "${a.texto}" en lo que me has contado.` };
        const cuando = (f: string) => (f === hoy ? "hoy" : f === addDays(hoy, -1) ? "ayer" : `el ${fechaCorta(f)}`);
        return { ok: true, say: `Encontré esto: ${hits.map((h) => `${cuando(h.x.fecha)}, ${h.x.texto.charAt(0).toLowerCase()}${h.x.texto.slice(1).replace(/[.!]+$/, "")}`).join("; ")}.`, privado: true };
      },
    },
    {
      name: "ver_area",
      description: "Cómo va un área de la vida de Diego y lo último que contó de ella.",
      parameters: { type: "object", properties: { area: { type: "string", enum: AREAS_VIDA.map((a) => a.id) } }, required: ["area"] },
      run: (a) => {
        const x = AREAS_VIDA.find((z) => z.id === a.area);
        if (!x) return { ok: false, say: `Las áreas son ${joinY(AREAS_VIDA.map((z) => z.nombre.toLowerCase()))}.` };
        const e = estadoArea(x.id, d(), clock().date);
        const ult = e.notas.slice(0, 3).map((nn) => nn.texto.charAt(0).toLowerCase() + nn.texto.slice(1).replace(/[.!]+$/, ""));
        if (!e.dato && !ult.length) return { ok: true, say: `En ${x.nombre.toLowerCase()} todavía no tienes nada. Cuéntame y lo voy guardando ahí.` };
        return { ok: true, say: `${x.nombre}: ${e.dato ? `${e.dato}.` : ""}${ult.length ? ` Lo último que me contaste: ${joinY(ult)}.` : ""}`.replace(": ", ": ").trim(), privado: x.id === "dinero" };
      },
    },
    {
      name: "ver_logros",
      description: "Los logros de Diego (entrenos, goles, rachas, horas de estudio, meses con ahorro).",
      parameters: { type: "object", properties: {} },
      run: () => {
        const ls = logros(d(), clock().date);
        if (!ls.length) return { ok: true, say: "Todavía no hay logros, pero vas en camino. Cada entreno, gol y día de hábito suma." };
        return { ok: true, say: `Llevas ${ls.length} ${ls.length === 1 ? "logro" : "logros"}. Los últimos: ${joinY(ls.slice(-3).map((l) => `${l.titulo.toLowerCase()} (${l.texto.replace(/\.$/, "").toLowerCase()})`))}.` };
      },
    },

    // ---------- Semana difícil ----------
    {
      name: "semana_dificil",
      description: "Activa o desactiva el modo semana difícil (baja las exigencias: entreno más corto, las rachas no se cortan). activar: true/false. dias: cuántos días (por defecto 7).",
      parameters: { type: "object", properties: { activar: { type: "boolean" }, dias: { type: "integer" } }, required: ["activar"] },
      run: (a) => {
        if (!dificil) return { ok: false, say: "El modo semana difícil se activa en Ajustes." };
        const hoy = clock().date;
        const ps = dificil.get();
        if (a.activar === false) {
          const nuevos = ps.map((p) => (hoy >= p.desde && hoy <= p.hasta ? { ...p, hasta: addDays(hoy, -1) } : p)).filter((p) => p.hasta >= p.desde);
          dificil.set(nuevos);
          return { ok: true, say: "Listo, volvemos al ritmo normal. Vamos con todo, pero de a poco.", undo: () => dificil.set(ps) };
        }
        if (enDificil(ps, hoy)) return { ok: true, say: "Ya estás en modo semana difícil. Tranqui, lo importante es no soltar todo." };
        const dias = Math.min(14, Math.max(1, Number(a.dias) || 7));
        dificil.set([...ps, { desde: hoy, hasta: addDays(hoy, dias - 1) }]);
        return { ok: true, say: `Activé el modo semana difícil por ${dias} días. El entreno va más corto y sin fallo, tus rachas no se cortan si un día no alcanzas, y te hablo más suave. Cuando quieras volver, dime "ya estoy bien".`, undo: () => dificil.set(ps) };
      },
    },
  ];
}

export const mmdd = (mes: number, dia: number) => `${p2(mes)}-${p2(dia)}`;
