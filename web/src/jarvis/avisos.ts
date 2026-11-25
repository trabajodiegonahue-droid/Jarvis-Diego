// Avisos: qué te avisa JARVIS y cuándo. Lo que se calcula aquí sirve para tres caminos:
// 1) con la app abierta suena en pantalla; 2) con los avisos activados, el intermediario de Cloudflare
// manda la notificación al iPhone aunque la app esté cerrada; 3) sin servidor, se exporta al Calendario (.ics).
import { HORARIO, planDelDia } from "../plan/bloque";
import { estudioDeHoy } from "../plan/estudio";
import { areaEfectiva, getNombreMascota } from "../areas/calc";
import { hhmm, joinY } from "../core/texto";
import { addDays, dow } from "../core/dates";
import type { Datos, Recordatorio } from "../data/types";
import { eventosDia } from "../calendar/calc";
import { proximasFechas } from "../extras/calc";
import { siguiente } from "../reminders/calc";
import type { Task } from "../routine/routine";

export interface Aviso {
  id: string;
  cuando: string; // AAAA-MM-DDTHH:MM, hora de Chile
  titulo: string;
  cuerpo: string;
}

export interface PrefsAvisos {
  manana: string; // HH:MM del resumen del día
  noche: string; // HH:MM de "mañana tienes…"
  agua: boolean;
  rutina: boolean;
  plan?: boolean; // Mi Día cargado: avisos del plan a las 7:30, 9:15, 13:45, 17:00 y 22:30
  partidoPorSemana?: Record<string, "sab" | "dom">;
}

const min = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// Lo de un día en una línea corta (sin plata: las notificaciones se ven en la pantalla bloqueada).
export function agendaDia(d: Datos, tasks: Task[], fecha: string, conRutina = false): string[] {
  const ev = eventosDia(d, conRutina ? tasks : [], fecha).eventos;
  const cosas = ev.filter((e) => !e.hecho).map((e) => `${e.titulo.replace(/^Físico: /, "Físico: ")}${e.inicio ? ` ${e.inicio}${e.fin && e.fin !== "24:00" ? `–${e.fin}` : ""}` : ""}`);
  for (const r of d.recordatorios.filter((x) => !x.hecho && x.cuando.startsWith(fecha))) cosas.push(`${r.texto} ${r.cuando.slice(11)}`);
  for (const r of d.recuerdos.filter((x) => x.fecha === fecha)) cosas.push(r.texto);
  for (const p of proximasFechas(d.fechas, fecha, 0)) cosas.push(p.f.nombre);
  return cosas;
}

// Las veces que suena un recordatorio en los próximos días (los que se repiten, varias veces).
function ocurrencias(r: Recordatorio, desde: string, hasta: string): string[] {
  const out: string[] = [];
  let c: Recordatorio = r;
  for (let i = 0; i < 60 && c.cuando <= hasta; i++) {
    if (c.cuando >= desde) out.push(c.cuando);
    if (!c.repetir) break;
    c = { ...c, cuando: siguiente(c) };
  }
  return out;
}

export function planAvisos(d: Datos, tasks: Task[], p: PrefsAvisos, ahora: string, dias = 7): Aviso[] {
  const hoy = ahora.slice(0, 10);
  const hasta = `${addDays(hoy, dias)}T23:59`;
  const out: Aviso[] = [];
  for (const r of d.recordatorios.filter((x) => !x.hecho)) for (const c of ocurrencias(r, ahora, hasta)) out.push({ id: `r:${r.id}:${c}`, cuando: c, titulo: "Recordatorio", cuerpo: r.texto });
  for (let i = 0; i <= dias; i++) {
    const f = addDays(hoy, i);
    // Resumen de la mañana: lo de hoy.
    const cosas = agendaDia(d, tasks, f);
    out.push({ id: `m:${f}`, cuando: `${f}T${p.manana}`, titulo: "Buenos días, Diego", cuerpo: cosas.length ? `Hoy: ${joinY(cosas.slice(0, 5))}.` : "Hoy no tienes nada anotado. ¿Qué vas a hacer?" });
    // En la noche: lo de mañana.
    const man = agendaDia(d, tasks, addDays(f, 1));
    if (man.length) out.push({ id: `n:${f}`, cuando: `${f}T${p.noche}`, titulo: "Para mañana", cuerpo: `Mañana: ${joinY(man.slice(0, 5))}.` });
    // Cumpleaños: el día antes en la noche ya va en "Para mañana"; tres días antes, un aviso para el regalo.
    for (const x of proximasFechas(d.fechas, f, 3).filter((x) => x.enDias === 3)) out.push({ id: `f:${x.f.id}:${f}`, cuando: `${f}T12:00`, titulo: "Se viene un cumpleaños", cuerpo: `En 3 días es ${min(x.f.nombre)}${x.cumple && x.f.tipo === "cumple" ? ` (cumple ${x.cumple})` : ""}.` });
    // El plan del día (Mi Día): 5 avisos clave en vez de uno por bloque.
    if (p.plan) {
      const pl = planDelDia(f, p.partidoPorSemana || {});
      const e = estudioDeHoy(f);
      out.push({ id: `p1:${f}`, cuando: `${f}T07:30`, titulo: "Buenos días, Diego", cuerpo: `${pl.md === 0 ? "Hoy hay partido." : `Mañana: ${pl.manana.titulo}. Tarde: ${pl.tarde.titulo}.`} ${e.materia ? `Estudio: ${e.texto.split(":")[0]}.` : ""} Creatina con el desayuno.`.replace(/\s+/g, " ").trim() });
      if (pl.manana.tipo !== "descanso") out.push({ id: `p2:${f}`, cuando: `${f}T09:15`, titulo: pl.md === 0 ? "Activación" : "Calentamiento FIFA 11+", cuerpo: pl.md === 0 ? "Activación antes del partido. ¡A jugar!" : `Después: ${pl.manana.titulo}.` });
      if (e.materia || e.ensayo) out.push({ id: `p3:${f}`, cuando: `${f}T13:45`, titulo: "Estudio", cuerpo: e.texto });
      if (pl.tarde.tipo !== "descanso" && pl.md !== 0) out.push({ id: `p4:${f}`, cuando: `${f}T17:00`, titulo: "Sesión 2", cuerpo: pl.tarde.titulo });
      out.push({ id: `p5:${f}`, cuando: `${f}T22:30`, titulo: "Celular fuera", cuerpo: "A las 23:00 a dormir: 8,5 horas para recuperar." });
    }
    // Rutina: 10 minutos antes de cada tarea (los bloques de Mi Día ya van en los 5 avisos del plan).
    if (p.rutina)
      for (const t of tasks.filter((t) => t.days.includes(dow(f)) && !t.done.includes(f) && !(p.plan && HORARIO.some((h) => h.titulo === t.title)))) {
        const [h, m] = t.time.split(":").map(Number);
        const antes = h * 60 + m - 10;
        if (antes < 0) continue;
        out.push({ id: `t:${t.id}:${f}`, cuando: `${f}T${hhmm(antes)}`, titulo: t.title, cuerpo: `En 10 minutos: ${min(t.title)} (${t.time}).` });
      }
    if (p.agua) for (const h of ["11:00", "14:00", "17:00", "20:00"]) out.push({ id: `a:${f}:${h}`, cuando: `${f}T${h}`, titulo: "Agua", cuerpo: "Tómate un vaso de agua." });
  }
  // Domingo en la noche: cómo te fue en la semana (sin montos de plata: los avisos pasan por Apple y Cloudflare).
  for (let i = 0; i <= dias; i++) {
    const f = addDays(hoy, i);
    if (dow(f) !== 6) continue;
    const lunes = addDays(f, -6);
    const ent = d.entrenos.filter((e) => e.fecha >= lunes && e.fecha <= f);
    const km = Math.round(ent.reduce((t, e) => t + (e.km || 0), 0) * 10) / 10;
    const sueno = d.dias.filter((x) => x.id >= lunes && x.id <= f && x.sueno);
    const prom = sueno.length ? Math.round((sueno.reduce((t, x) => t + (x.sueno || 0), 0) / sueno.length) * 10) / 10 : 0;
    const nom = getNombreMascota();
    const paseos = d.notas.filter((n) => n.fecha >= lunes && n.fecha <= `${f}T23:59` && areaEfectiva(n) === "mascota" && /pase|saque|sacar|salir|caca/i.test(n.texto) && !/tengo que|hay que|debo/i.test(n.texto)).length;
    const partes = [`${ent.length} ${ent.length === 1 ? "entreno" : "entrenos"}${km ? ` (${String(km).replace(".", ",")} km)` : ""}`, prom ? `dormiste ${String(prom).replace(".", ",")} h en promedio` : "", nom && paseos ? `${nom} salió ${paseos} ${paseos === 1 ? "vez" : "veces"}` : ""].filter(Boolean);
    out.push({ id: `s:${f}`, cuando: `${f}T20:00`, titulo: "Tu semana", cuerpo: `Esta semana: ${joinY(partes)}. Abre Vida para ver el resumen completo.` });
  }
  // La mascota: si lleva 8 horas sin salir, un aviso.
  const nom = getNombreMascota();
  const ultPaseo = d.notas
    .filter((n) => areaEfectiva(n) === "mascota" && /pase|saque|sacar|salir|caca|pipi/i.test(n.texto) && !/tengo que|hay que|debo|recuerd/i.test(n.texto))
    .map((n) => n.fecha)
    .sort()
    .pop();
  if (ultPaseo) {
    const t = new Date(Date.parse(ultPaseo + ":00Z") + 8 * 3600_000).toISOString().slice(0, 16);
    if (t > ahora && t.slice(11) >= "08:00" && t.slice(11) <= "22:30") out.push({ id: `p:${ultPaseo}`, cuando: t, titulo: nom || "Tu mascota", cuerpo: `${nom || "Tu mascota"} lleva 8 horas sin salir. ¿Lo sacas un rato?` });
  }
  return out.filter((a) => a.cuando > ahora && a.cuando <= hasta).sort((a, b) => a.cuando.localeCompare(b.cuando));
}

// ---------- Calendario del iPhone (.ics), sin servidor ----------
const icsFecha = (iso: string) => iso.replace(/[-:]/g, "") + "00";
const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function exportarIcs(d: Datos, tasks: Task[], ahora: string): string {
  const L: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vida//JARVIS//ES", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Vida (JARVIS)", "X-WR-TIMEZONE:America/Santiago"];
  const stamp = icsFecha(ahora);
  const evento = (uidEv: string, inicio: string, titulo: string, rrule?: string, durMin = 15) => {
    const [f, h] = inicio.split("T");
    const [hh, mm] = h.split(":").map(Number);
    const fin = hh * 60 + mm + durMin;
    const finIso = fin >= 1440 ? `${addDays(f, 1)}T23:59` : `${f}T${hhmm(fin)}`;
    L.push("BEGIN:VEVENT", `UID:${uidEv}@vida`, `DTSTAMP:${stamp}`, `DTSTART;TZID=America/Santiago:${icsFecha(inicio)}`, `DTEND;TZID=America/Santiago:${icsFecha(finIso)}`, `SUMMARY:${esc(titulo)}`);
    if (rrule) L.push(`RRULE:${rrule}`);
    L.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(titulo)}`, "TRIGGER:-PT0M", "END:VALARM", "END:VEVENT");
  };
  for (const r of d.recordatorios.filter((x) => !x.hecho)) evento(`r-${r.id}`, r.cuando, r.texto, r.repetir ? `FREQ=${{ diario: "DAILY", semanal: "WEEKLY", mensual: "MONTHLY", anual: "YEARLY" }[r.repetir]}` : undefined);
  for (const t of tasks) {
    const hoy = ahora.slice(0, 10);
    const primer = Array.from({ length: 7 }, (_, i) => addDays(hoy, i)).find((f) => t.days.includes(dow(f))) || hoy;
    const dur = t.end ? Math.max(15, Number(t.end.slice(0, 2)) * 60 + Number(t.end.slice(3)) - (Number(t.time.slice(0, 2)) * 60 + Number(t.time.slice(3)))) : 15;
    evento(`t-${t.id}`, `${primer}T${t.time}`, t.title, `FREQ=WEEKLY;BYDAY=${t.days.map((x) => BYDAY[x]).join(",")}`, dur);
  }
  for (const f of d.fechas) {
    const y0 = Number(ahora.slice(0, 4));
    L.push("BEGIN:VEVENT", `UID:f-${f.id}@vida`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${y0}${f.dia.replace("-", "")}`, `SUMMARY:${esc(f.nombre)}`, "RRULE:FREQ=YEARLY", "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(f.nombre)}`, "TRIGGER:-PT9H", "END:VALARM", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}
