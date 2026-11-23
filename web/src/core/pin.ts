// Bloqueo con PIN al abrir la app. Es una pantalla de privacidad: evita que alguien mire
// la app si toma tu teléfono. No cifra los datos (si olvidas el PIN, no se pierde nada).
// El PIN no se guarda: se guarda un resumen (hash) con sal.
import type { KV } from "./storage";

const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hash(pin: string, salt: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return toHex(buf);
}

export const validPin = (p: string) => /^\d{4,6}$/.test(p);

export async function setPin(kv: KV, pin: string) {
  if (!validPin(pin)) throw new Error("El PIN debe tener de 4 a 6 números.");
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  kv.set("pin", { salt, hash: await hash(pin, salt) });
}

export const hasPin = (kv: KV) => !!kv.get<{ hash?: string } | null>("pin", null)?.hash;
export const clearPin = (kv: KV) => kv.remove("pin");

export async function checkPin(kv: KV, pin: string): Promise<boolean> {
  const p = kv.get<{ salt: string; hash: string } | null>("pin", null);
  if (!p) return true;
  return (await hash(pin, p.salt)) === p.hash;
}
