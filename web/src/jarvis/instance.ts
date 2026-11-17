// JARVIS dentro de la app: una sola instancia compartida por todas las pantallas.
import { Assistant } from "../brain/assistant";
import { loadSettings, saveSettings, type Settings } from "../core/settings";
import { localKV } from "../core/storage";
import { Routine } from "../routine/routine";
import { ToolRegistry } from "../tools/registry";
import { routineTools } from "../tools/routineTools";
import { knowledgeTools } from "../tools/knowledgeTools";
import { Speaker } from "../voice/speech";

export let settings: Settings = loadSettings(localKV);
export const routine = new Routine(localKV);
export const tools = new ToolRegistry();
tools.register(...routineTools(routine), ...knowledgeTools(() => settings.about, () => settings));
export const assistant = new Assistant(tools, routine, () => settings, localKV);
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
