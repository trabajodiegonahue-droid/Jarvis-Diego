import type { Connection } from "../brain/gemini";
import type { KV } from "./storage";
import { DEFAULT_ABOUT } from "../brain/persona";

export interface Settings extends Connection {
  voiceURI: string;
  rate: number;
  speak: boolean;
  about: string; // lo que JARVIS sabe de Diego (se manda a Gemini)
}

const DEFAULTS: Settings = {
  mode: (import.meta.env.VITE_WORKER_URL ? "worker" : "key") as Connection["mode"],
  apiKey: "",
  workerUrl: import.meta.env.VITE_WORKER_URL || "",
  workerToken: "",
  voiceURI: "",
  rate: 1.05,
  speak: true,
  about: DEFAULT_ABOUT,
};

export function loadSettings(kv: KV): Settings {
  return { ...DEFAULTS, ...kv.get<Partial<Settings>>("settings", {}) };
}

export function saveSettings(kv: KV, s: Settings) {
  kv.set("settings", s);
}

export const isConnected = (s: Settings) => (s.mode === "key" ? !!s.apiKey : !!s.workerUrl && !!s.workerToken);
