// Avisos mientras usas la app y conexión con los avisos del iPhone (push).
import { hhmm } from "../core/texto";
import { chileAUtc, chileNow } from "../core/time";
import { localKV } from "../core/storage";
import { store } from "../data/store";
import { uid, type Recordatorio } from "../data/types";
import { ahoraIso, alSonar, vencidos } from "../reminders/calc";
import { getPrefs, setPrefs } from "../ui/state";
import { agendaDia, planAvisos } from "./avisos";
import { addDays } from "../core/dates";
import { routine, settings, speaker } from "./instance";

// ---------- En pantalla ----------
export interface Sonando {
  r: Recordatorio;
  atrasado: boolean; // sonó tarde porque la app estaba cerrada
}
let sonando: Sonando[] = [];
const oyentes = new Set<() => void>();
export const getSonando = () => sonando;
export function onSonando(f: () => void) {
  oyentes.add(f);
  return () => void oyentes.delete(f);
}
const avisar = () => oyentes.forEach((f) => f());

export async function revisarRecordatorios() {
  if (!store.ready) return;
  const n = chileNow();
  const ahora = ahoraIso(n.date, n.minutes);
  const vs = vencidos(store.data.recordatorios, ahora);
  if (!vs.length) return;
  for (const r of vs) {
    // Más de 15 minutos tarde = la app estaba cerrada: se muestra igual, pero sin sonar fuerte.
    const atrasado = Date.now() - chileAUtc(r.cuando) > 15 * 60_000;
    if (!sonando.some((s) => s.r.id === r.id && s.r.cuando === r.cuando)) sonando = [...sonando, { r, atrasado }].slice(-6);
    await store.put("recordatorios", alSonar(r, ahora));
    if (!atrasado) {
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {}
      speaker.unlock();
      speaker.feed(`Diego, te recuerdo: ${r.texto}. `);
      speaker.flush();
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        const reg = await navigator.serviceWorker?.getRegistration?.();
        await reg?.showNotification("Recordatorio", { body: r.texto, icon: "icons/icon-192.png", tag: r.id });
      }
    }
  }
  avisar();
}

export function cerrarAviso(id: string) {
  sonando = sonando.filter((s) => s.r.id !== id);
  avisar();
}

export async function posponer(s: Sonando, minutos: number) {
  const n = chileNow();
  const t = n.minutes + minutos;
  const fecha = t >= 1440 ? new Date(Date.parse(n.date) + 864e5).toISOString().slice(0, 10) : n.date;
  const m = t % 1440;
  const cuando = `${fecha}T${hhmm(m)}`;
  await store.put("recordatorios", { id: uid(), texto: s.r.texto, cuando });
  cerrarAviso(s.r.id);
}

let iv = 0;
export function iniciarAvisos() {
  if (iv) return;
  void revisarRecordatorios();
  iv = window.setInterval(() => void revisarRecordatorios(), 20_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void revisarRecordatorios();
      void sincronizarPush();
    }
  });
  // Cuando cambian los datos, se mandan los avisos actualizados al intermediario (con calma).
  let t = 0;
  store.subscribe(() => {
    clearTimeout(t);
    t = window.setTimeout(() => {
      void sincronizarPush();
      void sincronizarAgenda();
    }, 8000);
  });
  void sincronizarPush();
  void sincronizarAgenda();
}

// ---------- Avisos en el iPhone (push) ----------
const b64uABytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const base = () => (settings.workerUrl || "").replace(/\/+$/, "");
const headers = () => ({ Authorization: `Bearer ${settings.workerToken}`, "Content-Type": "application/json" });

export type EstadoPush = "listo" | "sin-intermediario" | "no-soportado" | "instalar" | "denegado" | "error";

export function pushPosible(): EstadoPush | null {
  if (settings.mode !== "worker" || !settings.workerUrl || !settings.workerToken) return "sin-intermediario";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // En el iPhone, los avisos solo existen con la app agregada a la pantalla de inicio.
    return /iPhone|iPad/.test(navigator.userAgent) && !(navigator as any).standalone ? "instalar" : "no-soportado";
  }
  return null;
}

function aparato() {
  let a = localKV.get<{ id: string; k: string } | null>("aparato", null);
  if (!a) {
    const r = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(36).padStart(2, "0")).join("").replace(/[^a-z0-9]/g, "").slice(0, 24);
    a = { id: r(16), k: r(24) };
    localKV.set("aparato", a);
  }
  return a;
}

// Se llama desde un toque (iOS solo pide permiso así).
// Qué paso falló la última vez (para mostrarlo y poder arreglarlo).
export let detallePush = "";

export async function activarPush(): Promise<EstadoPush> {
  detallePush = "";
  const no = pushPosible();
  if (no) return no;
  let paso = "pedir permiso";
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") return "denegado";
    paso = "preparar la app (service worker)";
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("tiempo")), 10000))]);
    paso = "pedir la clave de avisos al intermediario";
    const r = await fetch(`${base()}/push/clave`, { headers: headers() });
    if (!r.ok) {
      detallePush = `El intermediario respondió ${r.status} al pedir la clave de avisos.`;
      return "error";
    }
    const { clave } = await r.json();
    paso = "suscribirse a los avisos de Apple";
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uABytes(clave) });
    const a = aparato();
    // El service worker necesita saber a quién preguntar el texto de los avisos.
    paso = "guardar los datos del aviso";
    const c = await caches.open("vida-avisos");
    await c.put(new URL("__avisos.json", location.href).href, new Response(JSON.stringify({ url: base(), id: a.id, k: a.k }), { headers: { "Content-Type": "application/json" } }));
    setPrefs({ avisos: { ...getPrefs().avisos, activos: true } });
    paso = "registrar el teléfono en el intermediario";
    const ok = await sincronizarPush(true);
    if (!ok) detallePush = `No pude registrar el teléfono en el intermediario${ultimoStatus ? ` (respondió ${ultimoStatus})` : ""}.`;
    return ok ? "listo" : "error";
  } catch (e) {
    detallePush = `Falló al ${paso}${e instanceof Error && e.message ? `: ${e.message}` : ""}.`;
    return "error";
  }
}

// Manda un aviso de prueba que llega en segundos.
export async function probarPush(): Promise<string> {
  try {
    const r = await fetch(`${base()}/push/prueba`, { method: "POST", headers: headers(), body: JSON.stringify(aparato()) });
    if (r.ok) return "Listo: en unos segundos te debería llegar un aviso. Si no llega, revisa Ajustes del iPhone › Notificaciones › Vida.";
    const j = await r.json().catch(() => ({}) as any);
    return `${j?.error || `Error ${r.status}`}.`;
  } catch {
    return "No pude llegar al intermediario. Revisa tu internet.";
  }
}

export async function desactivarPush() {
  setPrefs({ avisos: { ...getPrefs().avisos, activos: false } });
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
    await fetch(`${base()}/avisos/borrar`, { method: "POST", headers: headers(), body: JSON.stringify({ id: aparato().id }) });
  } catch {}
}

// La agenda de los próximos días va al intermediario aunque no actives los avisos (para preguntarle a Siri).
let ultimaAgenda = "";
export async function sincronizarAgenda(): Promise<boolean> {
  if (settings.mode !== "worker" || !settings.workerUrl || !settings.workerToken || !store.ready) return false;
  try {
    const n = chileNow();
    const agenda = Object.fromEntries(Array.from({ length: 8 }, (_, i) => addDays(n.date, i)).map((f) => [f, agendaDia(store.data, routine.tasks, f, true)]));
    const cuerpo = JSON.stringify({ ...aparato(), agenda, mascota: getPrefs().mascota || "" });
    if (cuerpo === ultimaAgenda) return true;
    const r = await fetch(`${base()}/agenda`, { method: "POST", headers: headers(), body: cuerpo });
    if (r.ok) ultimaAgenda = cuerpo;
    return r.ok;
  } catch {
    return false;
  }
}

let ultimo = "";
let ultimoStatus = 0;
export async function sincronizarPush(forzar = false): Promise<boolean> {
  const p = getPrefs().avisos;
  if (!p.activos || pushPosible() || !store.ready) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const n = chileNow();
    const avisos = planAvisos(store.data, routine.tasks, { ...p, plan: getPrefs().miDia, partidoPorSemana: getPrefs().partidoPorSemana }, ahoraIso(n.date, n.minutes)).map((a) => ({ id: a.id, t: chileAUtc(a.cuando), titulo: a.titulo, cuerpo: a.cuerpo }));
    // Agenda de los próximos 7 días (sin plata) para que Siri responda "¿qué tengo mañana?" sin abrir la app.
    const agenda = Object.fromEntries(Array.from({ length: 8 }, (_, i) => addDays(n.date, i)).map((f) => [f, agendaDia(store.data, routine.tasks, f, true)]));
    const cuerpo = JSON.stringify({ ...aparato(), suscripcion: sub.toJSON(), avisos, agenda, mascota: getPrefs().mascota || "" });
    if (!forzar && cuerpo === ultimo) return true;
    const r = await fetch(`${base()}/avisos`, { method: "POST", headers: headers(), body: cuerpo });
    ultimoStatus = r.status;
    if (r.ok) ultimo = cuerpo;
    return r.ok;
  } catch {
    return false;
  }
}
