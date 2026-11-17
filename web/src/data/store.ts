// Los datos se cargan una vez en memoria (son pocos) y cada cambio se guarda en IndexedDB.
// La pantalla se suscribe y se redibuja cuando algo cambia.
import { chileNow } from "../core/time";
import { pendientesRecurrentes } from "../money/calc";
import { clearStore, deleteMany, getAll, putMany } from "./db";
import { categoriasBase, emptyDatos, STORES, type Datos, type StoreName } from "./types";

type Listener = () => void;
type Item<S extends StoreName> = Datos[S][number];

export class AppStore {
  data: Datos = emptyDatos();
  ready = false;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }

  async load() {
    const d = emptyDatos();
    for (const s of STORES) (d as any)[s] = await getAll(s);
    if (!d.categorias.length) {
      d.categorias = categoriasBase();
      await putMany("categorias", d.categorias);
    }
    this.data = d;
    this.ready = true;
    await this.runRecurrentes();
    this.emit();
  }

  // Crea los gastos fijos que ya correspondían (por ejemplo, al abrir la app un nuevo mes).
  async runRecurrentes(hoy = chileNow().date) {
    const nuevos = pendientesRecurrentes(this.data.recurrentes, this.data.movimientos, hoy);
    if (nuevos.length) await this.put("movimientos", ...nuevos);
  }

  async put<S extends StoreName>(store: S, ...items: Item<S>[]) {
    const list = this.data[store] as Item<S>[];
    for (const it of items) {
      const i = list.findIndex((x) => x.id === it.id);
      if (i >= 0) list[i] = it;
      else list.push(it);
    }
    (this.data as any)[store] = [...list];
    this.emit();
    await putMany(store, items);
  }

  // Borra y devuelve una función para deshacer.
  async remove<S extends StoreName>(store: S, ...ids: string[]): Promise<() => Promise<void>> {
    const removed = (this.data[store] as Item<S>[]).filter((x) => ids.includes(x.id));
    (this.data as any)[store] = (this.data[store] as Item<S>[]).filter((x) => !ids.includes(x.id));
    this.emit();
    await deleteMany(store, ids);
    return () => this.put(store, ...removed);
  }

  async replaceAll(d: Datos) {
    for (const s of STORES) {
      await clearStore(s);
      await putMany(s, d[s]);
    }
    this.data = { ...emptyDatos(), ...d };
    if (!this.data.categorias.length) this.data.categorias = categoriasBase();
    this.emit();
  }

  hasDemo() {
    return STORES.some((s) => (this.data[s] as { demo?: boolean }[]).some((x) => x.demo));
  }

  async removeDemo() {
    for (const s of STORES) {
      const ids = (this.data[s] as { id: string; demo?: boolean }[]).filter((x) => x.demo).map((x) => x.id);
      if (ids.length) await this.remove(s, ...ids);
    }
  }
}

export const store = new AppStore();
