// Estado de la pantalla: preferencias, navegación y avisos con "deshacer".
import { useEffect, useState } from "preact/hooks";
import { localKV } from "../core/storage";
import { store } from "../data/store";

export const kv = localKV;

export type CardId = "dinero" | "metas" | "entreno" | "futbol" | "pendientes" | "equilibrio" | "jarvis";
// "fase": en qué fase llega la tarjeta. Las que todavía no existen no se muestran en el inicio.
export const CARDS: { id: CardId; nombre: string; fase: number }[] = [
  { id: "dinero", nombre: "Dinero del mes", fase: 1 },
  { id: "metas", nombre: "Mis metas", fase: 2 },
  { id: "entreno", nombre: "Semana de entrenamiento", fase: 3 },
  { id: "futbol", nombre: "Fútbol", fase: 3 },
  { id: "pendientes", nombre: "Pendientes de estudios y trabajo", fase: 2 },
  { id: "jarvis", nombre: "Frase de JARVIS", fase: 1 },
  { id: "equilibrio", nombre: "Equilibrio", fase: 1 },
];
export const FASE_ACTUAL = 4;
export const cardReady = (id: CardId) => (CARDS.find((c) => c.id === id)?.fase ?? 99) <= FASE_ACTUAL;
export const AREAS = [
  { id: "dinero", nombre: "Dinero" },
  { id: "metas", nombre: "Metas" },
  { id: "cuerpo", nombre: "Entrenamiento" },
  { id: "futbol", nombre: "Fútbol" },
  { id: "estudios", nombre: "Estudios" },
  { id: "trabajo", nombre: "Trabajo" },
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
};

let prefs: Prefs = loadPrefs();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

function loadPrefs(): Prefs {
  const p = { ...DEFAULT_PREFS, ...kv.get<Partial<Prefs>>("prefs", {}) };
  // Tarjetas nuevas que aparezcan en versiones futuras se agregan al final.
  for (const c of CARDS) if (!p.cards.some((x) => x.id === c.id)) p.cards.push({ id: c.id, on: true });
  p.cards = p.cards.filter((x) => CARDS.some((c) => c.id === x.id));
  return p;
}

export const getPrefs = () => prefs;
export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
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
  useEffect(() => {
    const f = () => set((n) => n + 1);
    listeners.add(f);
    const off = store.subscribe(f);
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
