// Formato chileno: $1.234.567, sin decimales.

export function clp(n: number, opts: { signo?: boolean } = {}): string {
  const v = Math.round(n);
  const abs = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = v < 0 ? "-" : opts.signo && v > 0 ? "+" : "";
  return `${sign}$${abs}`;
}

// Entiende como se escribe y se dice la plata: "5000", "5.000", "$5.000", "5 mil", "5k",
// "1,5 millones", "40 lucas". Devuelve pesos enteros o null.
export function parseCLP(text: string): number | null {
  let t = String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim().replace(/^\$\s*/, "").replace(/\s*(pesos|clp)$/, "");
  if (!t) return null;
  let mult = 1;
  const m = t.match(/^([\d.,]+)\s*(mil|k|lucas?|luca|palos?|millon(?:es)?|millón|m)?$/);
  if (!m) return null;
  const unit = m[2] || "";
  if (/^(mil|k|lucas?|luca)$/.test(unit)) mult = 1000;
  else if (/^(palos?|millon(?:es)?|millón|m)$/.test(unit)) mult = 1_000_000;
  let num = m[1];
  if (mult > 1) {
    // "1,5 mil" o "1.5 mil": aquí la coma o el punto son decimales
    num = num.replace(",", ".");
    if ((num.match(/\./g) || []).length > 1) return null;
  } else {
    // Sin unidad, el punto y la coma son separadores de miles ("5.000", "5,000").
    if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(num)) return null;
    num = num.replace(/[.,]/g, "");
  }
  const v = Math.round(parseFloat(num) * mult);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export const pct = (x: number) => `${Math.round(x)}%`;
