// Recordatorios: cuándo suenan, cuáles vienen y cómo se entiende "el viernes a las 10".
// Funciones puras, con pruebas.
import { addDays, dow } from "../core/dates";
import type { Recordatorio } from "../data/types";

const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const sinTilde = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const p2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (m: number) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
const NUM: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, diez: 10, quince: 15, veinte: 20, treinta: 30, media: 30 };

export interface Cuando {
  fecha: string; // AAAA-MM-DD
  hora: string; // HH:MM
  repetir?: Recordatorio["repetir"];
  horaDicha: boolean; // si dijo la hora (si no, se usa 09:00)
  resto: string; // el texto sin la parte del cuándo
}

// Hora: "a las 9", "a las 18:30", "a las 7 de la tarde", "al mediodía", "en la noche".
function horaEn(t: string): { min: number; txt: string } | null {
  let m = t.match(/\b(?:a las?|tipo|como a las?|para las?)\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*(?:hrs?|horas|h))?(\s+(?:de la (?:manana|tarde|noche)|am|pm))?/);
  if (m) {
    let h = Number(m[1]);
    const mi = Number(m[2] || 0);
    const suf = m[3] || "";
    if (/tarde|noche|pm/.test(suf) && h < 12) h += 12;
    if (/manana|am/.test(suf) && h === 12) h = 0;
    if (h > 23 || mi > 59) return null;
    return { min: h * 60 + mi, txt: m[0] };
  }
  m = t.match(/\b(?:al |a )?mediodia\b/);
  if (m) return { min: 12 * 60, txt: m[0] };
  m = t.match(/\b(?:en|por) la (manana|tarde|noche)\b/);
  if (m) return { min: m[1] === "manana" ? 9 * 60 : m[1] === "tarde" ? 16 * 60 : 21 * 60, txt: m[0] };
  return null;
}

// Entiende el cuándo de una frase. "ahora" = minutos del día. null si no dice cuándo.
export function parseCuando(texto: string, hoy: string, ahora: number): Cuando | null {
  let t = ` ${sinTilde(texto).replace(/[¿?¡!,]/g, " ").replace(/\s+/g, " ").trim()} `;
  let fecha: string | null = null;
  let repetir: Cuando["repetir"];
  const quitar = (x: string) => (t = t.replace(x, " ").replace(/\s+/g, " "));

  // "en 30 minutos", "en 2 horas", "en una hora y media"
  let m = t.match(/\ben (\d+|un|una|dos|tres|cuatro|cinco|diez|quince|veinte|treinta|media) (minutos?|min|horas?)( y media)?\b/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM[m[1]];
    const total = ahora + (/hora/.test(m[2]) ? (m[1] === "media" ? 30 : n * 60) : n) + (m[3] ? 30 : 0);
    quitar(m[0]);
    return { fecha: addDays(hoy, Math.floor(total / 1440)), hora: hhmm(total % 1440), horaDicha: true, resto: t.trim() };
  }
  // Repeticiones: "todos los días", "cada lunes", "todos los meses el 5", "cada año"
  if ((m = t.match(/\b(todos los dias|cada dia|diariamente|todas las (?:mananas|tardes|noches))\b/))) {
    repetir = "diario";
    quitar(m[0].replace(/^todas las (mananas|tardes|noches)$/, "todas las $1"));
    if (/mananas/.test(m[0])) t += " en la manana";
    if (/tardes/.test(m[0])) t += " en la tarde";
    if (/noches/.test(m[0])) t += " en la noche";
  } else if ((m = t.match(/\b(?:todos los|cada) (lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)\b/))) {
    repetir = "semanal";
    const target = DIAS.findIndex((d) => m![1].startsWith(d));
    fecha = addDays(hoy, (target - dow(hoy) + 7) % 7);
    quitar(m[0]);
  } else if ((m = t.match(/\b(?:todos los meses|cada mes)(?: el (\d{1,2}))?\b/))) {
    repetir = "mensual";
    if (m[1]) {
      const d = Number(m[1]);
      let f = `${hoy.slice(0, 7)}-${p2(Math.min(28, d))}`;
      if (f < hoy) f = addDays(`${hoy.slice(0, 7)}-28`, 4).slice(0, 7) + `-${p2(Math.min(28, d))}`;
      fecha = f;
    }
    quitar(m[0]);
  } else if ((m = t.match(/\b(?:todos los anos|cada ano)\b/))) {
    repetir = "anual";
    quitar(m[0]);
  }

  // El día
  if (!fecha) {
    if ((m = t.match(/\bpasado manana\b/))) {
      fecha = addDays(hoy, 2);
      quitar(m[0]);
    } else if ((m = t.match(/\bmanana\b(?! en la| por la)/)) && !/\bde la manana\b/.test(t)) {
      fecha = addDays(hoy, 1);
      quitar(m[0]);
    } else if ((m = t.match(/\bhoy\b|\besta (tarde|noche)\b/))) {
      fecha = hoy;
      if (m[1]) t += m[1] === "tarde" ? " en la tarde" : " en la noche";
      quitar(m[0]);
    } else if ((m = t.match(new RegExp(`\\b(?:el |este |para el )?(${DIAS.join("|")})\\b(?: que viene)?`)))) {
      const target = DIAS.indexOf(m[1]);
      fecha = addDays(hoy, (target - dow(hoy) + 7) % 7 || 7);
      quitar(m[0]);
    } else if ((m = t.match(new RegExp(`\\b(?:el )?(\\d{1,2}) de (${MESES.join("|")})(?: de (\\d{4}))?\\b`)))) {
      const mes = MESES.indexOf(m[2]) + 1;
      let y = m[3] ? Number(m[3]) : Number(hoy.slice(0, 4));
      let f = `${y}-${p2(mes)}-${p2(Number(m[1]))}`;
      if (!m[3] && f < hoy) f = `${++y}${f.slice(4)}`;
      fecha = f;
      quitar(m[0]);
    } else if ((m = t.match(/\b(?:el )(\d{1,2})\b(?! de la| horas| hrs| min)/)) && Number(m[1]) <= 31) {
      let f = `${hoy.slice(0, 7)}-${p2(Number(m[1]))}`;
      if (f < hoy) f = `${addDays(`${hoy.slice(0, 7)}-28`, 4).slice(0, 7)}-${p2(Number(m[1]))}`;
      fecha = f;
      quitar(m[0]);
    } else if ((m = t.match(/\b(?:la )?(?:proxima|otra) semana\b/))) {
      fecha = addDays(hoy, 7 - dow(hoy));
      quitar(m[0]);
    }
  }
  const h = horaEn(t);
  if (h) quitar(h.txt);
  if (!fecha && !h && !repetir) return null;
  let min = h ? h.min : 9 * 60;
  if (!fecha) fecha = hoy;
  // Solo la hora y ya pasó hoy: es mañana. (Una hora sin am/pm que ya pasó en la mañana, puede ser en la tarde.)
  if (fecha === hoy && min <= ahora) {
    if (h && !repetir && min < 12 * 60 && min + 720 > ahora && !/manana|am/.test(h.txt)) min += 720;
    else fecha = addDays(hoy, 1);
  }
  return { fecha, hora: hhmm(min), ...(repetir ? { repetir } : {}), horaDicha: !!h, resto: t.replace(/\s+/g, " ").trim() };
}

export const ahoraIso = (hoy: string, minutos: number) => `${hoy}T${hhmm(minutos)}`;

// La siguiente vez que suena un recordatorio que se repite.
export function siguiente(r: Recordatorio): string {
  const f = r.cuando.slice(0, 10);
  const h = r.cuando.slice(11);
  if (r.repetir === "diario") return `${addDays(f, 1)}T${h}`;
  if (r.repetir === "semanal") return `${addDays(f, 7)}T${h}`;
  if (r.repetir === "mensual") {
    const [y, mo, d] = f.split("-").map(Number);
    const ny = mo === 12 ? y + 1 : y;
    const nm = mo === 12 ? 1 : mo + 1;
    return `${ny}-${p2(nm)}-${p2(Math.min(d, 28))}T${h}`;
  }
  if (r.repetir === "anual") return `${Number(f.slice(0, 4)) + 1}${f.slice(4)}T${h}`;
  return r.cuando;
}

// Los que ya tocan y no se han avisado.
export const vencidos = (rs: Recordatorio[], ahora: string) => rs.filter((r) => !r.hecho && r.cuando <= ahora).sort((a, b) => a.cuando.localeCompare(b.cuando));

// Los que vienen en los próximos días.
export function proximos(rs: Recordatorio[], ahora: string, dias = 7): Recordatorio[] {
  const tope = `${addDays(ahora.slice(0, 10), dias)}T23:59`;
  return rs.filter((r) => !r.hecho && r.cuando > ahora && r.cuando <= tope).sort((a, b) => a.cuando.localeCompare(b.cuando));
}

// Al sonar: si se repite, pasa a la próxima fecha; si no, queda hecho.
export const alSonar = (r: Recordatorio): Recordatorio => (r.repetir ? { ...r, cuando: siguiente(r) } : { ...r, hecho: true });

export function cuandoTxt(iso: string, hoy: string): string {
  const f = iso.slice(0, 10);
  const h = iso.slice(11);
  const dif = Math.round((Date.parse(f) - Date.parse(hoy)) / 864e5);
  const dia = dif === 0 ? "hoy" : dif === 1 ? "mañana" : dif === 2 ? "pasado mañana" : dif > 2 && dif < 7 ? `el ${["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][dow(f)]}` : `el ${Number(f.slice(8))} de ${["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][Number(f.slice(5, 7)) - 1]}`;
  return `${dia} a las ${h}`;
}

export const REPETIR_TXT: Record<NonNullable<Recordatorio["repetir"]>, string> = { diario: "todos los días", semanal: "todas las semanas", mensual: "todos los meses", anual: "todos los años" };
