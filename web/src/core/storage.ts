// Guardado en el propio teléfono. Todo pasa por aquí para poder cambiar el
// almacenamiento más adelante (o simularlo en las pruebas) sin tocar lo demás.

export interface KV {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

const PREFIX = "jarvis:";

export const localKV: KV = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Navegador sin espacio o en modo privado: la app sigue funcionando en memoria.
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* nada que hacer */
    }
  },
};

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)!) : f),
    set: (k, v) => void m.set(k, JSON.stringify(v)),
    remove: (k) => void m.delete(k),
  };
}
