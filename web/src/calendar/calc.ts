import { hhmm } from "../core/texto";
// Calendario unificado: junta turnos, partidos, entrenos, estudio, rutina y metas de cada día
// y avisa cuando algo se choca. Funciones puras, con pruebas.
import { addDays, dow } from "../core/dates";
import type { Datos } from "../data/types";
import type { Task } from "../routine/routine";

export type TipoEvento = "turno" | "partido" | "equipo" | "fisico" | "rutina" | "prueba" | "tarea" | "meta";

export interface Evento {
  id: string;
  tipo: TipoEvento;
  titulo: string;
  inicio?: string; // HH:MM (sin hora = todo el día)
  fin?: string; // HH:MM; "24:00" si termina al día siguiente
  ruta: string; // dónde se ve o se edita
  hecho?: boolean;
  importante?: boolean;
}

export interface DiaCal {
  fecha: string;
  eventos: Evento[];
  choques: string[]; // avisos en palabras
}

const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const hhmmCal = (m: number) => (m >= 1440 ? "24:00" : hhmm(m));
export const DURACION = { partido: 105, equipo: 90, rutina: 60 }; // minutos, cuando no hay hora de término

export function eventosDia(d: Datos, tasks: Task[], fecha: string): DiaCal {
  const ev: Evento[] = [];
  for (const t of d.turnos) {
    if (t.fecha !== fecha || t.falte) continue;
    ev.push({ id: `t:${t.id}`, tipo: "turno", titulo: "Turno de trabajo", inicio: t.inicio, fin: min(t.fin) <= min(t.inicio) ? "24:00" : t.fin, ruta: "/mas/trabajo" });
  }
  // Turno que empezó ayer y termina hoy en la madrugada.
  for (const t of d.turnos) {
    if (t.fecha !== addDays(fecha, -1) || t.falte || min(t.fin) > min(t.inicio) || t.fin === "00:00") continue;
    ev.push({ id: `t2:${t.id}`, tipo: "turno", titulo: "Turno (sigue de ayer)", inicio: "00:00", fin: t.fin, ruta: "/mas/trabajo" });
  }
  const partidos = d.partidos.filter((p) => p.fecha === fecha);
  for (const p of partidos) {
    const tipo = p.tipo === "partido" ? "partido" : "equipo";
    ev.push({
      id: `p:${p.id}`,
      tipo,
      titulo: p.tipo === "partido" ? `Partido${p.rival ? ` vs. ${p.rival}` : ""}` : "Entrenamiento con el equipo",
      ...(p.hora ? { inicio: p.hora, fin: hhmmCal(min(p.hora) + DURACION[tipo]) } : {}),
      ruta: "/futbol",
      hecho: p.fui === true,
      importante: !!p.importante,
    });
  }
  const plan = d.planes.find((p) => p.id === "activo");
  const ses = plan?.sesiones.find((s) => s.dia === dow(fecha));
  const entrenos = d.entrenos.filter((e) => e.fecha === fecha);
  if (ses) ev.push({ id: `f:${ses.id}`, tipo: "fisico", titulo: `Físico: ${ses.nombre.replace(/^[^:]+: /, "")}`, ruta: "/futbol?fisico", hecho: entrenos.length > 0 });
  else for (const e of entrenos) ev.push({ id: `e:${e.id}`, tipo: "fisico", titulo: `Entreno: ${e.nombre}`, ruta: "/futbol?fisico", hecho: true });
  for (const t of tasks) {
    if (!t.days.includes(dow(fecha))) continue;
    ev.push({ id: `r:${t.id}`, tipo: "rutina", titulo: t.title, inicio: t.time, ...(t.end ? { fin: min(t.end) <= min(t.time) ? "24:00" : t.end } : {}), ruta: "/", hecho: t.done.includes(fecha) });
  }
  for (const e of d.evaluaciones) if (e.fecha === fecha) ev.push({ id: `v:${e.id}`, tipo: "prueba", titulo: `Prueba: ${e.nombre}`, ruta: "/mas/estudios", hecho: e.resultado != null, importante: true });
  for (const t of d.tareas) if (t.fecha === fecha) ev.push({ id: `k:${t.id}`, tipo: "tarea", titulo: t.texto, ruta: "/mas/estudios", hecho: t.hecho });
  for (const m of d.metas) if (m.fechaLimite === fecha && !m.archivada) ev.push({ id: `m:${m.id}`, tipo: "meta", titulo: `Vence la meta: ${m.nombre}`, ruta: "/metas" });

  ev.sort((a, b) => (a.inicio ? 1 : 0) - (b.inicio ? 1 : 0) || (a.inicio || "").localeCompare(b.inicio || ""));
  return { fecha, eventos: ev, choques: choques(ev, d, fecha) };
}

function choques(ev: Evento[], d: Datos, fecha: string): string[] {
  const out: string[] = [];
  const conHora = ev.filter((e) => e.inicio);
  const fin = (e: Evento) => (e.fin ? min(e.fin === "24:00" ? "23:59" : e.fin) + (e.fin === "24:00" ? 1 : 0) : min(e.inicio!) + DURACION.rutina);
  for (let i = 0; i < conHora.length; i++)
    for (let j = i + 1; j < conHora.length; j++) {
      const a = conHora[i];
      const b = conHora[j];
      if (a.tipo === "rutina" && b.tipo === "rutina") continue; // la rutina es flexible entre sí
      if (min(a.inicio!) < fin(b) && min(b.inicio!) < fin(a)) out.push(`${a.titulo} (${a.inicio}${a.fin ? `–${a.fin}` : ""}) se cruza con ${b.titulo} (${b.inicio}${b.fin ? `–${b.fin}` : ""}).`);
    }
  const hayPartido = ev.some((e) => e.tipo === "partido");
  if (hayPartido && ev.some((e) => e.tipo === "fisico" && !e.hecho)) out.push("Tienes físico el mismo día del partido: mejor solo activación.");
  const manana = d.partidos.find((p) => p.fecha === addDays(fecha, 1) && p.tipo === "partido" && p.importante);
  const ses = ev.find((e) => e.tipo === "fisico" && !e.hecho);
  if (manana && ses && /fuerza|pierna|inferior|potencia/i.test(ses.titulo) && !/sin pierna/i.test(ses.titulo)) out.push("Mañana tienes partido importante: hoy nada de pierna pesada.");
  const turno = ev.find((e) => e.tipo === "turno" && e.fin === "24:00");
  if (turno && d.partidos.some((p) => p.fecha === addDays(fecha, 1) && p.tipo === "partido" && p.hora && min(p.hora) < 12 * 60)) out.push("Trabajas hasta tarde y mañana juegas temprano: ojo con el sueño.");
  return out;
}

export function semanaCal(d: Datos, tasks: Task[], lunes: string): DiaCal[] {
  return Array.from({ length: 7 }, (_, i) => eventosDia(d, tasks, addDays(lunes, i)));
}
