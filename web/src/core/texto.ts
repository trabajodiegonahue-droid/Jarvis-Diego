// Ayudas de texto que usan JARVIS y las pantallas. Un solo lugar para no repetirlas en cada archivo.

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const p2 = (n: number) => String(n).padStart(2, "0");

// Minutos desde medianoche → "HH:MM".
export const hhmm = (m: number) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;

// "a, b y c"
export const joinY = (xs: string[]) => (xs.length > 1 ? xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1] : xs[0] || "");

// Primera letra en mayúscula.
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
