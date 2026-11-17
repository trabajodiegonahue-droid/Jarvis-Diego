import { chileNow, type ChileNow } from "../src/core/time";
// Reloj fijo: martes 17 de noviembre de 2026 a la hora indicada (hora de Chile).
export function at(hhmm: string, date = "2026-11-17"): () => ChileNow {
  return () => chileNow(new Date(`${date}T${hhmm}:00-03:00`));
}
