// Respaldo automático en TU intermediario de Cloudflare, cifrado en el teléfono con una contraseña tuya
// (AES-GCM con clave derivada por PBKDF2). Cloudflare guarda solo texto cifrado: sin la contraseña no se puede leer.
import type { KV } from "../core/storage";
import { exportJSON, readJSON, type Respaldo } from "./backup";
import type { Datos } from "./types";

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function clave(pass: string, sal: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: 210_000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function comprimir(t: string): Promise<{ datos: Uint8Array; gz: boolean }> {
  const bytes = new TextEncoder().encode(t);
  if (typeof CompressionStream === "undefined") return { datos: bytes, gz: false };
  const s = new Response(bytes).body!.pipeThrough(new CompressionStream("gzip"));
  return { datos: new Uint8Array(await new Response(s).arrayBuffer()), gz: true };
}
async function descomprimir(b: Uint8Array, gz: boolean): Promise<string> {
  if (!gz) return new TextDecoder().decode(b);
  const s = new Response(b).body!.pipeThrough(new DecompressionStream("gzip"));
  return new Response(s).text();
}

export async function cifrar(texto: string, pass: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { datos, gz } = await comprimir(texto);
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await clave(pass, sal), datos);
  return JSON.stringify({ v: 1, gz, s: b64(sal), i: b64(iv), c: b64(c) });
}

export async function descifrar(paquete: string, pass: string): Promise<string> {
  const p = JSON.parse(paquete);
  try {
    const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(p.i) }, await clave(pass, deB64(p.s)), deB64(p.c));
    return descomprimir(new Uint8Array(plano), !!p.gz);
  } catch {
    throw new Error("La contraseña del respaldo no es correcta.");
  }
}

export interface Nube {
  url: string;
  token: string;
}
const cab = (n: Nube) => ({ Authorization: `Bearer ${n.token}`, "Content-Type": "application/json" });

export async function subirRespaldo(n: Nube, d: Datos, kv: KV, pass: string, fetcher: typeof fetch = fetch): Promise<void> {
  const paquete = await cifrar(exportJSON(d, kv), pass);
  const r = await fetcher(`${n.url.replace(/\/+$/, "")}/respaldo`, { method: "POST", headers: cab(n), body: JSON.stringify({ paquete }) });
  if (!r.ok) throw new Error(`El intermediario no guardó el respaldo (${r.status}).`);
}

export async function bajarRespaldo(n: Nube, pass: string, fetcher: typeof fetch = fetch): Promise<Respaldo & { fecha: string }> {
  const r = await fetcher(`${n.url.replace(/\/+$/, "")}/respaldo`, { headers: cab(n) });
  if (r.status === 404) throw new Error("Todavía no hay respaldo en la nube.");
  if (!r.ok) throw new Error(`No pude traer el respaldo (${r.status}).`);
  const { paquete, fecha } = (await r.json()) as { paquete: string; fecha: string };
  return { ...readJSON(await descifrar(paquete, pass)), fecha };
}

// Una vez al día, solo si activaste el respaldo y hay intermediario.
export async function respaldoDiario(n: Nube | null, d: Datos, kv: KV, hoy: string): Promise<boolean> {
  const pass = kv.get<string>("respaldoNube", "");
  if (!n || !pass || kv.get<string>("respaldoNubeFecha", "") === hoy) return false;
  try {
    await subirRespaldo(n, d, kv, pass);
    kv.set("respaldoNubeFecha", hoy);
    return true;
  } catch {
    return false;
  }
}
