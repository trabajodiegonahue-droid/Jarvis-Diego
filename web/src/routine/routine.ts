import { DAY_NAMES, toMinutes, type ChileNow } from "../core/time";
import type { KV } from "../core/storage";

export interface Task {
  id: string;
  title: string;
  time: string; // "HH:MM"
  days: number[]; // 0 = lunes … 6 = domingo
  done: string[]; // fechas AAAA-MM-DD en que se tachó
}

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const KEY = "routine";

// Texto sin tildes ni mayúsculas, para comparar lo que dice Diego con los nombres guardados.
export const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set(["el", "la", "los", "las", "de", "del", "al", "a", "mi", "un", "una", "que", "y", "en"]);
// Palabras que significan lo mismo en el día a día.
const SYN: Record<string, string> = { gym: "gimnasio", gim: "gimnasio", pesas: "gimnasio", ejercicio: "entrenar", entreno: "entrenar", ingles: "ingles", english: "ingles" };
const words = (s: string) =>
  norm(s)
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map((w) => SYN[w] || w);

export class Routine {
  tasks: Task[];
  constructor(private kv: KV) {
    this.tasks = sanitize(kv.get<Task[]>(KEY, []));
  }
  private save() {
    this.kv.set(KEY, this.tasks);
  }

  add(title: string, time: string, days: number[] = ALL_DAYS): Task {
    const t: Task = {
      id: Math.random().toString(36).slice(2, 10),
      title: title.trim(),
      time,
      days: uniqDays(days),
      done: [],
    };
    this.tasks.push(t);
    this.sort();
    this.save();
    return t;
  }

  // Busca la tarea que más se parece a lo dicho. Si hay empate, null (mejor preguntar).
  find(query: string, dow?: number): Task | null {
    const q = norm(query);
    if (!q) return null;
    const pool = dow == null ? this.tasks : this.tasks.filter((t) => t.days.includes(dow));
    const exact = pool.filter((t) => norm(t.title) === q);
    if (exact.length === 1) return exact[0];
    const qw = words(query);
    const scored = pool
      .map((t) => {
        const tw = words(t.title);
        const hits = qw.filter((w) => tw.some((x) => x.startsWith(w) || w.startsWith(x))).length;
        const contains = norm(t.title).includes(q) || q.includes(norm(t.title)) ? 1 : 0;
        return { t, score: hits / Math.max(1, Math.max(qw.length, tw.length)) + contains };
      })
      .filter((x) => x.score > 0.3)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) return dow != null ? this.find(query) : null;
    if (scored.length > 1 && scored[0].score === scored[1].score) return null;
    return scored[0].t;
  }

  check(task: Task, date: string): void {
    if (!task.done.includes(date)) task.done.push(date);
    // Solo se guardan los últimos 60 días tachados por tarea.
    task.done = task.done.sort().slice(-60);
    this.save();
  }

  uncheck(task: Task, date: string): void {
    task.done = task.done.filter((d) => d !== date);
    this.save();
  }

  remove(task: Task): void {
    this.tasks = this.tasks.filter((t) => t.id !== task.id);
    this.save();
  }

  removeAll(): number {
    const n = this.tasks.length;
    this.tasks = [];
    this.save();
    return n;
  }

  update(task: Task, patch: Partial<Pick<Task, "title" | "time" | "days">>): void {
    if (patch.title) task.title = patch.title.trim();
    if (patch.time) task.time = patch.time;
    if (patch.days && patch.days.length) task.days = uniqDays(patch.days);
    this.sort();
    this.save();
  }

  forDay(dow: number): Task[] {
    return this.tasks.filter((t) => t.days.includes(dow));
  }

  // Lo que toca: la última tarea de hoy cuya hora ya llegó y no está tachada,
  // más la siguiente. Una tarea "vence" 2 horas después de su hora.
  now(n: ChileNow): { current: Task | null; next: Task | null; pending: Task[] } {
    const today = this.forDay(n.dow);
    const isDone = (t: Task) => t.done.includes(n.date);
    const started = today.filter((t) => toMinutes(t.time) <= n.minutes && !isDone(t));
    const current = started.filter((t) => n.minutes - toMinutes(t.time) <= 120).pop() || null;
    const pending = started.filter((t) => t !== current);
    const next = today.find((t) => toMinutes(t.time) > n.minutes && !isDone(t)) || null;
    return { current, next, pending };
  }

  exportJSON(): string {
    return JSON.stringify({ app: "jarvis", version: 1, exportedAt: new Date().toISOString(), tasks: this.tasks }, null, 1);
  }

  importJSON(text: string): number {
    const data = JSON.parse(text);
    if (!data || data.app !== "jarvis" || !Array.isArray(data.tasks)) throw new Error("Ese archivo no es un respaldo de JARVIS.");
    this.tasks = sanitize(data.tasks);
    this.save();
    return this.tasks.length;
  }

  private sort() {
    this.tasks.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  }
}

const uniqDays = (d: number[]) => [...new Set(d.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();

function sanitize(list: unknown): Task[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t: any) => t && typeof t.title === "string" && /^\d{2}:\d{2}$/.test(t.time))
    .map((t: any) => ({
      id: String(t.id || Math.random().toString(36).slice(2, 10)),
      title: t.title,
      time: t.time,
      days: uniqDays(Array.isArray(t.days) && t.days.length ? t.days : ALL_DAYS),
      done: Array.isArray(t.done) ? t.done.filter((d: unknown) => typeof d === "string") : [],
    }))
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

// "lunes a viernes", "los martes y jueves", "fin de semana", "todos los días", "hoy", "mañana"
export function parseDays(text: string, n?: ChileNow): number[] | null {
  const t = norm(text);
  if (/todos los dias|cada dia|diario|siempre/.test(t)) return ALL_DAYS;
  if (/fin(es)? de semana/.test(t)) return [5, 6];
  if (/dias de semana|dias habiles|lunes a viernes/.test(t)) return [0, 1, 2, 3, 4];
  const keys = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
  const range = t.match(new RegExp(`(${keys.join("|")}) a (${keys.join("|")})`));
  if (range) {
    const a = keys.indexOf(range[1]);
    const b = keys.indexOf(range[2]);
    const out: number[] = [];
    for (let i = a; ; i = (i + 1) % 7) {
      out.push(i);
      if (i === b) break;
    }
    return out;
  }
  const found = keys.map((k, i) => (new RegExp(`\\b${k}s?\\b`).test(t) ? i : -1)).filter((i) => i >= 0);
  if (found.length) return found;
  if (n && /\bhoy\b/.test(t)) return [n.dow];
  if (n && /\bmanana\b/.test(t) && !/de la manana/.test(t)) return [(n.dow + 1) % 7];
  return null;
}

export function daysLabel(days: number[]): string {
  const d = [...days].sort();
  if (d.length === 7) return "todos los días";
  if (d.join() === "0,1,2,3,4") return "de lunes a viernes";
  if (d.join() === "5,6") return "el fin de semana";
  const names = d.map((i) => DAY_NAMES[i] + (i >= 5 ? "s" : ""));
  return "los " + (names.length > 1 ? names.slice(0, -1).join(", ") + " y " + names[names.length - 1] : names[0]);
}
