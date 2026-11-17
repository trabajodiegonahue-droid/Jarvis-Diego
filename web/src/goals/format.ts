import type { Meta } from "../data/types";
import { clp } from "../money/format";
import type { EstadoMeta } from "./calc";

const num = (v: number) => (Math.round(v * 10) / 10).toLocaleString("es-CL");

export function fmtValor(m: Meta, v: number): string {
  if (m.tipo === "monto") return clp(v);
  if (m.tipo === "habito") return `${Math.round(v)} ${Math.round(v) === 1 ? "vez" : "veces"}`;
  if (m.tipo === "pasos") return `${v} ${v === 1 ? "paso" : "pasos"}`;
  return `${num(v)}${m.unidad ? " " + m.unidad : ""}`;
}

export const ESTADO_META: Record<EstadoMeta, { texto: string; color: string; icono: string }> = {
  cumplida: { texto: "Cumplida", color: "var(--green)", icono: "✓" },
  adelantada: { texto: "Adelantada", color: "var(--green)", icono: "▲" },
  "a-tiempo": { texto: "Al día", color: "var(--blue)", icono: "●" },
  atrasada: { texto: "Atrasada", color: "var(--amber)", icono: "▼" },
  vencida: { texto: "Venció", color: "var(--red)", icono: "✕" },
};

export const AREAS_META = [
  { id: "dinero", nombre: "Dinero" },
  { id: "cuerpo", nombre: "Cuerpo" },
  { id: "futbol", nombre: "Fútbol" },
  { id: "estudios", nombre: "Estudios" },
  { id: "trabajo", nombre: "Trabajo" },
  { id: "otro", nombre: "Otra" },
] as const;
