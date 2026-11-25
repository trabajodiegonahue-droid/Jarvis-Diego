// Metas del bloque, creadas solas una vez: "Bloque de 8 semanas", "Mejorar sprint 10 m",
// "Estudiar 5 días por semana" y "Creatina todos los días". Las de hábito suman un día solas.
import { addDays } from "../core/dates";
import { store } from "../data/store";
import { uid, type Meta } from "../data/types";
import { INICIO_BLOQUE } from "../plan/bloque";

export async function crearMetasPlan(hoy: string): Promise<number> {
  const fin = addDays(INICIO_BLOQUE, 8 * 7);
  const hay = (n: string) => store.data.metas.some((m) => m.nombre === n);
  const base = { inicio: INICIO_BLOQUE < hoy ? INICIO_BLOQUE : hoy, fechaLimite: fin, fuente: "manual" as const, creado: Date.now() };
  const nuevas: Meta[] = [];
  if (!hay("Bloque de 8 semanas")) nuevas.push({ id: uid(), nombre: "Bloque de 8 semanas", area: "cuerpo", tipo: "pasos", objetivo: 0, ...base, principal: true, pasos: ["Semana 0: tests", "Semanas 1–3: base", "Semana 4: descarga + tests", "Semanas 5–7: intensificación", "Semana 8: afinar + tests"].map((texto) => ({ id: uid(), texto, hecho: false })) });
  if (!hay("Mejorar sprint 10 m")) nuevas.push({ id: uid(), nombre: "Mejorar sprint 10 m", area: "futbol", tipo: "pasos", objetivo: 0, ...base, pasos: ["Test de la semana 0", "Test de la semana 4 más rápido", "Test de la semana 8 más rápido"].map((texto) => ({ id: uid(), texto, hecho: false })) });
  if (!hay("Estudiar 5 días por semana")) nuevas.push({ id: uid(), nombre: "Estudiar 5 días por semana", area: "estudios", tipo: "habito", objetivo: 5, ...base });
  if (!hay("Creatina todos los días")) nuevas.push({ id: uid(), nombre: "Creatina todos los días", area: "cuerpo", tipo: "habito", objetivo: 7, ...base });
  if (nuevas.length) await store.put("metas", ...nuevas);
  return nuevas.length;
}

// Suma el día a una meta de hábito (una vez por día).
export async function sumarDiaMeta(nombre: string, fecha: string) {
  const m = store.data.metas.find((x) => x.nombre === nombre && !x.archivada);
  if (!m || store.data.aportes.some((a) => a.metaId === m.id && a.fecha === fecha)) return;
  await store.put("aportes", { id: uid(), metaId: m.id, fecha, valor: 1 });
}
