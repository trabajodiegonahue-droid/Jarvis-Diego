import { TIMEZONE } from "../config";

// Día de la semana: 0 = lunes … 6 = domingo (como se habla en Chile, no como JS).
export const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export interface ChileNow {
  date: string; // AAAA-MM-DD
  dow: number; // 0 = lunes
  minutes: number; // minutos desde medianoche
  hhmm: string;
  label: string; // "lunes 17 de noviembre de 2026, 18:05"
}

// La hora siempre se calcula en la zona de Chile, aunque el teléfono esté en otra.
export function chileNow(at: Date = new Date()): ChileNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const wk = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  const h = Number(parts.hour) % 24;
  const m = Number(parts.minute);
  const label = new Intl.DateTimeFormat("es-CL", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);
  const hhmm = `${pad(h)}:${pad(m)}`;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dow: wk,
    minutes: h * 60 + m,
    hhmm,
    label: `${label}, ${hhmm}`,
  };
}

export const pad = (n: number) => String(n).padStart(2, "0");

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Acepta "18", "18:00", "18.30", "6 de la tarde", "6:30 pm". Devuelve "HH:MM" o null.
export function parseHour(text: string): string | null {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  const m = t.match(/(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|de la mañana|de la tarde|de la noche|hrs?|horas)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const suf = m[3] || "";
  if (/pm|p\.m\.|tarde|noche/.test(suf) && h < 12) h += 12;
  if (/am|a\.m\.|mañana/.test(suf) && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

// "AAAA-MM-DDTHH:MM" en hora de Chile → instante (milisegundos UTC). Sirve para programar avisos
// aunque el teléfono esté en otro huso horario o cambie el horario de verano.
export function chileAUtc(iso: string): number {
  const [f, h] = iso.split("T");
  const [y, mo, d] = f.split("-").map(Number);
  const [hh, mi] = (h || "00:00").split(":").map(Number);
  const comoUtc = Date.UTC(y, mo - 1, d, hh, mi);
  // Diferencia entre la hora de Chile y UTC en ese momento (se calcula dos veces por el cambio de horario).
  let t = comoUtc;
  for (let i = 0; i < 2; i++) {
    const n = chileNow(new Date(t));
    const local = Date.UTC(Number(n.date.slice(0, 4)), Number(n.date.slice(5, 7)) - 1, Number(n.date.slice(8, 10)), Math.floor(n.minutes / 60), n.minutes % 60);
    t = comoUtc - (local - t);
  }
  return t;
}
