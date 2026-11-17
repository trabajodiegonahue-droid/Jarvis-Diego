// IndexedDB mínimo: una "tabla" por tipo de dato, cada fila con su id.
import { STORES, type StoreName } from "./types";

const DB_NAME = "vida";
const VERSION = 1;

let dbp: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result as T[]);
    r.onerror = () => rej(r.error);
  });
}

export async function putMany(store: StoreName, items: unknown[]): Promise<void> {
  if (!items.length) return;
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  for (const it of items) tx.objectStore(store).put(it);
  return done(tx);
}

export async function deleteMany(store: StoreName, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  for (const id of ids) tx.objectStore(store).delete(id);
  return done(tx);
}

export async function clearStore(store: StoreName): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  return done(tx);
}

// Para las pruebas: cerrar y olvidar la conexión.
export function resetDB() {
  dbp?.then((d) => d.close()).catch(() => {});
  dbp = null;
}
