// Importar movimientos desde un CSV de la cartola del banco (opcional).
// Cada banco usa columnas distintas: Diego elige cuál es la fecha, la descripción y el monto.
import { parseCLP } from "./format";

export function parseCSV(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = clean.split("\n")[0] || "";
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : first.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (q) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

// 15/11/2026, 15-11-2026, 2026-11-15, 15/11/26 → AAAA-MM-DD
export function parseFecha(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    if (Number(m[2]) > 12) return null;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// "-12.345", "$ 12.345", "12345", "(12.345)" → número con signo
export function parseMontoCartola(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const neg = /^-|^\(.*\)$/.test(t) || /-$/.test(t);
  const v = parseCLP(t.replace(/[()\-\s$]/g, "").replace(/,\d{1,2}$/, ""));
  return v == null ? null : neg ? -v : v;
}

export interface Mapeo {
  fecha: number;
  descripcion: number;
  // Una columna con signo (negativo = gasto) o dos columnas: cargo (gasto) y abono (ingreso).
  monto?: number;
  cargo?: number;
  abono?: number;
  saltarPrimera: boolean;
}

export interface FilaImportada {
  fecha: string;
  descripcion: string;
  tipo: "ingreso" | "egreso";
  monto: number;
}

export function mapear(rows: string[][], m: Mapeo): { ok: FilaImportada[]; malas: number } {
  const ok: FilaImportada[] = [];
  let malas = 0;
  for (const r of rows.slice(m.saltarPrimera ? 1 : 0)) {
    const fecha = parseFecha(r[m.fecha] || "");
    let v: number | null = null;
    if (m.monto != null) v = parseMontoCartola(r[m.monto] || "");
    else {
      const c = parseMontoCartola(r[m.cargo ?? -1] || "");
      const a = parseMontoCartola(r[m.abono ?? -1] || "");
      v = c ? -Math.abs(c) : a ? Math.abs(a) : null;
    }
    if (!fecha || v == null || v === 0) {
      malas++;
      continue;
    }
    ok.push({ fecha, descripcion: (r[m.descripcion] || "").slice(0, 80), tipo: v < 0 ? "egreso" : "ingreso", monto: Math.abs(v) });
  }
  return { ok, malas };
}

export function toCSV(rows: (string | number)[][]): string {
  return "﻿" + rows.map((r) => r.map((c) => (/[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(";")).join("\r\n");
}
