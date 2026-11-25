// Estado de la pantalla: preferencias, navegación y avisos con "deshacer".
import { useEffect, useState } from "preact/hooks";
import { localKV } from "../core/storage";
import { setNombreMascota } from "../areas/calc";
import { store } from "../data/store";
import { PUERTO_VARAS, type Ciudad } from "../weather/clima";

export const kv = localKV;

export type CardId = "areas" | "recordatorios" | "resumen" | "tiempo" | "habitos" | "dinero" | "metas" | "entreno" | "futbol" | "pendientes" | "equilibrio" | "jarvis";
// "fase": en qué fase llega la tarjeta. Las que todavía no existen no se muestran en el inicio.
export const CARDS: { id: CardId; nombre: string; fase: number }[] = [
  { id: "recordatorios", nombre: "Recordatorios y lo que viene", fase: 6 },
  { id: "areas", nombre: "Mi vida por áreas", fase: 6 },
  { id: "resumen", nombre: "Resumen de la semana y del mes", fase: 5 },
  { id: "tiempo", nombre: "Mi tiempo hoy", fase: 5 },
  { id: "habitos", nombre: "Hábitos de hoy", fase: 5 },
  { id: "dinero", nombre: "Dinero del mes", fase: 1 },
  { id: "metas", nombre: "Mis metas", fase: 2 },
  { id: "entreno", nombre: "Semana de entrenamiento", fase: 3 },
  { id: "futbol", nombre: "Fútbol", fase: 3 },
  { id: "pendientes", nombre: "Pendientes de estudios y trabajo", fase: 2 },
  { id: "jarvis", nombre: "Frase de JARVIS", fase: 1 },
  { id: "equilibrio", nombre: "Equilibrio", fase: 1 },
];
export const FASE_ACTUAL = 6;
export const cardReady = (id: CardId) => (CARDS.find((c) => c.id === id)?.fase ?? 99) <= FASE_ACTUAL;
export const AREAS = [
  { id: "dinero", nombre: "Dinero" },
  { id: "metas", nombre: "Metas" },
  { id: "cuerpo", nombre: "Entrenamiento" },
  { id: "futbol", nombre: "Fútbol" },
  { id: "estudios", nombre: "Estudios" },
  { id: "trabajo", nombre: "Trabajo" },
  { id: "bienestar", nombre: "Hábitos" },
];

export interface Prefs {
  onboarded: boolean;
  theme: "dark" | "light" | "auto";
  areas: string[];
  startMonth: string;
  cards: { id: CardId; on: boolean }[];
  lastBackup: string; // AAAA-MM-DD
  privacy: boolean; // modo privado: no mandar datos de dinero a Gemini
  tarifaHora: number; // valor por hora del trabajo (para estimar el sueldo)
  futbol: { posicion: string; equipo: string; objetivos: string; diasPartido: number[] };
  areasConocidas: string[]; // para sumar áreas nuevas que lleguen en otras versiones
  ciudad: Ciudad; // para el clima
  aguaMeta: number; // vasos al día
  calRutina: boolean; // mostrar la rutina en el calendario
  resumenVisto: string; // último resumen (semana o mes) que cerraste en el inicio
  dificil: { desde: string; hasta: string }[]; // periodos en modo semana difícil
  logrosVistos: string[];
  avisos: { activos: boolean; manana: string; noche: string; agua: boolean; rutina: boolean }; // avisos en el teléfono
  vistaEquilibrio: "barras" | "rueda";
  dificilSugerido: string; // fecha en que dijiste "no, gracias" a la semana difícil
  mascota: string; // nombre de la mascota (su área en Mi vida)
  partidoPorSemana: Record<string, "sab" | "dom">; // lunes de la semana → día del partido
  fechaPrueba: string; // fecha de la prueba en el club (AAAA-MM-DD), si ya la sabes
  miDia: boolean; // ya se cargó el horario de Mi Día como rutina
}

const DEFAULT_PREFS: Prefs = {
  onboarded: false,
  theme: "dark",
  areas: AREAS.map((a) => a.id),
  startMonth: "",
  cards: CARDS.map((c) => ({ id: c.id, on: true })),
  lastBackup: "",
  privacy: false,
  tarifaHora: 0,
  futbol: { posicion: "Mediocampista", equipo: "", objetivos: "", diasPartido: [] },
  areasConocidas: AREAS.map((a) => a.id),
  ciudad: PUERTO_VARAS,
  aguaMeta: 8,
  calRutina: true,
  resumenVisto: "",
  dificil: [],
  logrosVistos: [],
  avisos: { activos: false, manana: "08:00", noche: "21:30", agua: false, rutina: true },
  vistaEquilibrio: "rueda",
  dificilSugerido: "",
  mascota: "",
  partidoPorSemana: {},
  fechaPrueba: "",
  miDia: false,
};

let prefs: Prefs = loadPrefs();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

function loadPrefs(): Prefs {
  const p = { ...DEFAULT_PREFS, ...kv.get<Partial<Prefs>>("prefs", {}) };
  // Tarjetas nuevas que aparezcan en versiones futuras se agregan al final.
  for (const c of CARDS) if (!p.cards.some((x) => x.id === c.id)) p.cards.push({ id: c.id, on: true });
  p.cards = p.cards.filter((x) => CARDS.some((c) => c.id === x.id));
  // Áreas nuevas (por ejemplo Hábitos) se activan solas una vez.
  const nuevas = AREAS.map((a) => a.id).filter((id) => !(p.areasConocidas || []).includes(id));
  if (nuevas.length && kv.get("prefs", null)) p.areas = [...new Set([...p.areas, ...nuevas])];
  p.areasConocidas = AREAS.map((a) => a.id);
  setNombreMascota(p.mascota);
  return p;
}

export const getPrefs = () => prefs;
export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  setNombreMascota(prefs.mascota);
  kv.set("prefs", prefs);
  applyTheme();
  emit();
}
export function reloadPrefs() {
  prefs = loadPrefs();
  applyTheme();
  emit();
}

export function applyTheme() {
  const t = prefs.theme;
  const light = t === "light" || (t === "auto" && window.matchMedia?.("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#F5F6F9" : "#0B0F1A");
}

// Se redibuja cuando cambian los datos o las preferencias.
export function useApp() {
  const [, set] = useState(0);
  // Se recuerda cómo estaban los datos al dibujar: si cambiaron antes de alcanzar a suscribirse
  // (por ejemplo, la carga inicial terminó muy rápido), se vuelve a dibujar al tiro.
  const visto = { ready: store.ready, data: store.data };
  useEffect(() => {
    const f = () => set((n) => n + 1);
    listeners.add(f);
    const off = store.subscribe(f);
    if (visto.ready !== store.ready || visto.data !== store.data) f();
    return () => {
      listeners.delete(f);
      off();
    };
  }, []);
  return { prefs, data: store.data };
}

// Navegación por la dirección (#/dinero), así el botón "atrás" del teléfono funciona.
export function useRoute(): string {
  const read = () => (location.hash.replace(/^#/, "") || "/").split("?")[0];
  const [r, setR] = useState(read());
  useEffect(() => {
    const f = () => {
      setR(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return r;
}
export const go = (path: string) => {
  location.hash = path;
};

// Aviso corto abajo, opcionalmente con "Deshacer".
export interface ToastMsg {
  id: number;
  text: string;
  undo?: () => void;
}
let toastMsg: ToastMsg | null = null;
let toastTimer = 0;
const toastListeners = new Set<() => void>();
export function toast(text: string, undo?: () => void) {
  toastMsg = { id: Date.now(), text, undo };
  toastListeners.forEach((f) => f());
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMsg = null;
    toastListeners.forEach((f) => f());
  }, undo ? 6000 : 3000);
}
export function useToast() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    toastListeners.add(f);
    return () => void toastListeners.delete(f);
  }, []);
  return toastMsg;
}
export const closeToast = () => {
  toastMsg = null;
  toastListeners.forEach((f) => f());
};
