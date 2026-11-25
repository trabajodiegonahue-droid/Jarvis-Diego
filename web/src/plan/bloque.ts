// El bloque de 8 semanas: fases, días al partido (MD) y lo que toca cada día (mañana, tarde y con el perro),
// más el horario de Mi Día de 7:30 a 23:00. Funciones puras, con pruebas.
import { addDays, dow, lunesDe } from "../core/dates";

export const INICIO_BLOQUE = "2026-11-25";

export type TipoSesion = "fuerza" | "velocidad" | "tecnica" | "preparador" | "resistencia" | "recuperacion" | "activacion" | "partido" | "agilidad" | "descanso";
export const COLOR_SESION: Record<TipoSesion, string> = {
  fuerza: "#e8772e",
  velocidad: "#d64545",
  tecnica: "#1f9d55",
  preparador: "#7b4fd0",
  resistencia: "#b45309",
  recuperacion: "#3a86c8",
  activacion: "#159a9c",
  partido: "#d4a017",
  agilidad: "#d64545",
  descanso: "#6b7280",
};
export const NOMBRE_SESION: Record<TipoSesion, string> = { fuerza: "Fuerza", velocidad: "Velocidad", tecnica: "Técnica", preparador: "Preparador físico", resistencia: "Resistencia", recuperacion: "Recuperación", activacion: "Activación", partido: "Partido", agilidad: "Agilidad", descanso: "Descanso" };

export interface Bloque {
  tipo: TipoSesion;
  titulo: string;
  detalle?: string;
  sesion?: SesionId; // la sesión guiada que abre (Fuerza A, Velocidad…)
}
export type SesionId = "fuerzaA" | "fuerzaB" | "velocidad" | "resistencia" | "agilidad" | "activacion" | "tecnica" | "recuperacion" | "preparador";
export interface DiaPlan {
  fecha: string;
  md: number | null; // 0 = partido, -5..-1 antes, 1 = día después
  mdTxt: string; // "MD-3", "MD+1", "Partido"
  manana: Bloque;
  tarde: Bloque;
  perro: string; // "Trote suave 20 min" o "Caminata"
}

type Fila = [Bloque, Bloque, string];
const B = (tipo: TipoSesion, titulo: string, sesion?: SesionId, detalle?: string): Bloque => ({ tipo, titulo, ...(sesion ? { sesion } : {}), ...(detalle ? { detalle } : {}) });

// Tablas del documento, por días al partido.
const DOM: Record<string, Fila> = {
  "1": [B("recuperacion", "Recuperación: movilidad 20 min + core corto", "recuperacion"), B("tecnica", "Técnica suave 30 min", "tecnica"), "Trote suave 20–30 min"],
  "-5": [B("fuerza", "Fuerza A (piernas)", "fuerzaA"), B("resistencia", "Resistencia 4×4 con balón + técnica 30 min", "resistencia"), "Caminata"],
  "-4": [B("preparador", "Preparador físico (full body + 10×10)", "preparador"), B("tecnica", "Técnica 30 min, pierna mala", "tecnica"), "Trote suave 20 min"],
  "-3": [B("velocidad", "Velocidad + saltos", "velocidad"), B("fuerza", "Fuerza B (tren superior) + técnica 30 min", "fuerzaB"), "Caminata"],
  "-2": [B("agilidad", "Agilidad + técnica 60 min", "agilidad"), B("descanso", "Libre / estudio"), "Trote suave 15–20 min"],
  "-1": [B("activacion", "Activación 30–40 min", "activacion"), B("descanso", "Descanso"), "Caminata"],
  "0": [B("partido", "PARTIDO"), B("descanso", "Descanso"), "Caminata"],
};
const SAB: Record<string, Fila> = {
  "1": DOM["1"],
  "-5": [B("fuerza", "Fuerza A (piernas)", "fuerzaA"), B("resistencia", "Resistencia 4×4 + técnica 30 min", "resistencia"), "Caminata"],
  "-4": [B("velocidad", "Velocidad + saltos", "velocidad"), B("tecnica", "Técnica 30 min", "tecnica"), "Caminata"],
  "-3": [B("preparador", "Preparador físico (full body + 10×10)", "preparador"), B("tecnica", "Técnica 30 min, pierna mala", "tecnica"), "Trote suave 20 min"],
  "-2": [B("agilidad", "Agilidad + técnica", "agilidad"), B("fuerza", "Fuerza B moderada", "fuerzaB"), "Trote suave 15 min"],
  "-1": [B("activacion", "Activación", "activacion"), B("descanso", "Descanso"), "Caminata"],
  "0": [B("partido", "PARTIDO"), B("descanso", "Descanso"), "Caminata"],
};

// ¿Sábado o domingo? Se guarda por semana (lunes de la semana). Por defecto, domingo.
export type DiaPartido = "sab" | "dom";
export const partidoDeSemana = (lunes: string, porSemana: Record<string, DiaPartido>): string => addDays(lunes, porSemana[lunes] === "sab" ? 5 : 6);

export function planDelDia(fecha: string, porSemana: Record<string, DiaPartido> = {}): DiaPlan {
  const lunes = lunesDe(fecha);
  const esteP = partidoDeSemana(lunes, porSemana);
  const antP = partidoDeSemana(addDays(lunes, -7), porSemana);
  const sigP = partidoDeSemana(addDays(lunes, 7), porSemana);
  const prox = esteP >= fecha ? esteP : sigP;
  const prev = esteP < fecha ? esteP : antP;
  const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  let md: number;
  if (fecha === prox) md = 0;
  else if (dias(prev, fecha) === 1) md = 1;
  else md = -Math.min(5, dias(fecha, prox));
  const tipo = (prox === esteP ? porSemana[lunes] : porSemana[addDays(lunes, 7)]) === "sab" ? SAB : DOM;
  let [manana, tarde, perro] = (md === 1 ? (prev === antP ? (porSemana[addDays(lunes, -7)] === "sab" ? SAB : DOM) : tipo) : tipo)[String(md)];
  // El miércoles siempre es preparador físico (salvo que sea la víspera o el día del partido).
  if (dow(fecha) === 2 && md !== 0 && md !== -1 && manana.tipo !== "preparador") {
    manana = B("preparador", "Preparador físico (full body + 10×10)", "preparador");
    tarde = B("tecnica", "Técnica 30 min, pierna mala", "tecnica");
    perro = "Trote suave 20 min";
  }
  return { fecha, md, mdTxt: md === 0 ? "Partido" : md > 0 ? `MD+${md}` : `MD${md}`, manana, tarde, perro };
}

// ---------- Fases del bloque ----------
export interface Fase {
  semana: number; // 0..8 (o más)
  nombre: string;
  ajuste: string;
  diasPrueba?: number; // cuenta regresiva si hay fecha de prueba
}
export function faseDe(fecha: string, inicio = INICIO_BLOQUE, fechaPrueba?: string | null): Fase {
  const semana = Math.floor((Date.parse(fecha) - Date.parse(inicio)) / (7 * 864e5));
  const diasPrueba = fechaPrueba ? Math.round((Date.parse(fechaPrueba) - Date.parse(fecha)) / 864e5) : undefined;
  const base = (nombre: string, ajuste: string): Fase => ({ semana, nombre, ajuste, ...(diasPrueba != null && diasPrueba >= 0 ? { diasPrueba } : {}) });
  if (diasPrueba != null && diasPrueba >= 0 && diasPrueba <= 7) return base("Afinar", diasPrueba === 0 ? "Hoy es tu prueba. Calienta bien y a jugar suelto." : "Volumen −50% · nada nuevo · dormir 9 h");
  if (semana < 0) return base("Antes del bloque", `El bloque parte el ${inicio.slice(8)}/${inicio.slice(5, 7)}.`);
  if (semana === 0) return base("Tests", "Medir todo: sprint, salto, 5-10-5, pared, dominadas de balón y 10×10.");
  if (semana <= 3) return base("Base", "50–60 saltos · sprints al 85–90% · 4×4 con 3 bloques · pesas a 2–3 reps del fallo");
  if (semana === 4) return base("Descarga + tests", "Volumen a la mitad y repetir los tests.");
  if (semana <= 7) return base("Intensificación", "Mancuerna de ~20 kg · 80–100 saltos · sprints al 95% · 4×4 con 4 bloques");
  if (semana === 8) return base("Afinar", "Volumen −50% · nada nuevo · dormir 9 h");
  return base("Mantención", "Terminó el bloque: repite los tests y arma el siguiente.");
}

// ---------- Mi Día: 7:30 a 23:00 ----------
export interface BloqueDia {
  hora: string;
  titulo: string; // el nombre fijo (también es el de la rutina, para que JARVIS lo tache por voz)
  detalle?: string; // lo que cambia según el día
  ruta?: string;
}
export const HORARIO: { hora: string; titulo: string; ruta?: string }[] = [
  { hora: "07:30", titulo: "Despertar + desayuno + creatina", ruta: "/mas/comida" },
  { hora: "08:00", titulo: "Inglés suave", ruta: "/mas/estudios" },
  { hora: "08:30", titulo: "Sacar al perro", ruta: "/mas/mascota" },
  { hora: "09:15", titulo: "Calentamiento FIFA 11+", ruta: "/futbol?fisico" },
  { hora: "09:30", titulo: "Sesión 1 (física)", ruta: "/futbol?fisico" },
  { hora: "11:00", titulo: "Batido: proteína + avena", ruta: "/mas/comida" },
  { hora: "11:15", titulo: "Casa + ducha" },
  { hora: "13:00", titulo: "Almuerzo" },
  { hora: "13:45", titulo: "Estudio", ruta: "/mas/estudios" },
  { hora: "14:45", titulo: "Siesta 20–30 min" },
  { hora: "15:15", titulo: "Buscar pega / proyectos", ruta: "/mas/trabajo" },
  { hora: "16:30", titulo: "Colación", ruta: "/mas/comida" },
  { hora: "17:00", titulo: "Sesión 2 (técnica)", ruta: "/futbol?fisico" },
  { hora: "18:30", titulo: "Estirar + core" },
  { hora: "20:30", titulo: "Once / comida", ruta: "/mas/comida" },
  { hora: "21:00", titulo: "Partido o tiempo libre" },
  { hora: "22:30", titulo: "Celular fuera" },
  { hora: "23:00", titulo: "Dormir" },
];

export const MATERIA_DEL_DIA = ["Matemática M1", "Inglés", "Lenguaje", "Ventas", "Economía", "Mini-ensayo (opcional)", null] as const;

export function horarioDelDia(fecha: string, porSemana: Record<string, DiaPartido> = {}): BloqueDia[] {
  const p = planDelDia(fecha, porSemana);
  const materia = MATERIA_DEL_DIA[dow(fecha)];
  return HORARIO.map((h): BloqueDia => {
    let detalle: string | undefined;
    if (h.titulo === "Despertar + desayuno + creatina") detalle = "Avena + 1 medida de proteína · creatina 3–5 g";
    if (h.titulo === "Inglés suave") detalle = "20–30 min: escuchar o vocabulario";
    if (h.titulo === "Sacar al perro") detalle = p.perro;
    if (h.titulo === "Calentamiento FIFA 11+") detalle = p.md === 0 ? "Activación antes del partido" : p.manana.tipo === "descanso" ? "Opcional" : "15 min";
    if (h.titulo === "Sesión 1 (física)") detalle = p.manana.titulo;
    if (h.titulo === "Sesión 2 (técnica)") detalle = p.md === 0 ? "Recuperación: movilidad y estirar" : p.tarde.titulo;
    if (h.titulo === "Estudio") detalle = materia ? `${materia}${materia.startsWith("Mini") ? "" : " · 45 min"}` : "Libre";
    if (h.titulo === "Partido o tiempo libre") detalle = "Mira un partido analizando al 5, o tiempo libre";
    if (h.titulo === "Casa + ducha") detalle = "Loza, aspirar, ordenar";
    return { ...h, ...(detalle ? { detalle } : {}) };
  });
}

// El bloque que corre ahora (el último que ya empezó) y el siguiente.
export function bloqueActual(bloques: BloqueDia[], hhmm: string): { actual: BloqueDia | null; siguiente: BloqueDia | null } {
  let actual: BloqueDia | null = null;
  for (const b of bloques) if (b.hora <= hhmm) actual = b;
  const siguiente = bloques.find((b) => b.hora > hhmm) || null;
  return { actual, siguiente };
}
