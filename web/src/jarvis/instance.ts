import { esPregunta } from "../areas/calc";
import { crearNotar } from "./notas";
// JARVIS dentro de la app: una sola instancia compartida por todas las pantallas.
import { Assistant } from "../brain/assistant";
import { loadSettings, saveSettings, type Settings } from "../core/settings";
import { localKV } from "../core/storage";
import { Routine } from "../routine/routine";
import { ToolRegistry } from "../tools/registry";
import { routineTools } from "../tools/routineTools";
import { knowledgeTools } from "../tools/knowledgeTools";
import { Speaker } from "../voice/speech";
import { chileNow } from "../core/time";
import { store } from "../data/store";
import { getPrefs } from "../ui/state";
import { parseVida } from "./vidaParser";
import { vidaTools } from "./vidaTools";
import { diaTools } from "./diaTools";
import { obtenerClima } from "../weather/clima";
import { corriendo } from "../time/calc";
import { extrasTools } from "./extrasTools";
import { enDificil, relevantes } from "../extras/calc";
import { setPrefs } from "../ui/state";

export let settings: Settings = loadSettings(localKV);
export const routine = new Routine(localKV);
export const tools = new ToolRegistry();
// El clima de la ciudad elegida en Ajustes (Open-Meteo, con copia de una hora).
export const climaAhora = () => obtenerClima(getPrefs().ciudad, localKV);
tools.register(
  ...routineTools(routine),
  ...knowledgeTools(() => settings.about, () => settings),
  ...vidaTools({ store, routine, clock: chileNow, clima: climaAhora }),
  ...diaTools({ store, routine, clock: chileNow, clima: climaAhora, aguaMeta: () => getPrefs().aguaMeta }),
  ...extrasTools({ store, routine, clock: chileNow, dificil: { get: () => getPrefs().dificil, set: (p) => setPrefs({ dificil: p }) } }),
);
export const assistant = new Assistant(tools, routine, () => settings, localKV, chileNow, undefined, {
  parse: (t, n) =>
    parseVida(t, n.date, {
      habitos: store.data.habitos.filter((h) => !h.archivado).map((h) => h.nombre),
      rutina: routine.tasks.map((r) => r.title),
      corriendo: corriendo(store.data.actividades)?.cat ?? null,
      compras: store.data.compras.filter((c) => !c.hecho).map((c) => c.texto),
      dificil: enDificil(getPrefs().dificil, n.date),
    }),
  // Mi vida por áreas: lo que dices (y lo que JARVIS anota) queda en su bloque.
  notar: crearNotar(store, chileNow),
  esPregunta,
  // Memoria: a Gemini solo le llegan los recuerdos que tienen que ver con lo que dices ahora.
  contexto: (texto, n) => {
    const rs = relevantes(store.data.recuerdos, texto, n.date);
    const dificil = enDificil(getPrefs().dificil, n.date) ? "\nDiego activó el modo semana difícil: háblale más suave y propón versiones mínimas de todo." : "";
    return (rs.length ? `\nLo que Diego te pidió recordar (relevante ahora): ${rs.map((r) => `${r.texto}${r.fecha ? ` (${r.fecha})` : ""}`).join("; ")}.` : "") + dificil;
  },
  privado: () => getPrefs().privacy,
});
export const speaker = new Speaker();

function applyVoice() {
  speaker.voiceURI = settings.voiceURI;
  speaker.rate = settings.rate;
  speaker.enabled = settings.speak;
}
applyVoice();

export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  saveSettings(localKV, settings);
  applyVoice();
}

// Tras restaurar un respaldo: volver a leer la rutina y los ajustes.
export function reloadJarvis() {
  settings = loadSettings(localKV);
  routine.tasks = new Routine(localKV).tasks;
  applyVoice();
}
