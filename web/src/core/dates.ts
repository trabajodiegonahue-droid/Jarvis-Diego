// Fechas como texto AAAA-MM-DD (sin horas ni zonas: no hay sorpresas con el cambio de hora).

const toUTC = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const fromUTC = (t: number) => new Date(t).toISOString().slice(0, 10);

export const addDays = (d: string, n: number) => fromUTC(toUTC(d) + n * 864e5);
export const diffDays = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / 864e5); // a - b
export const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(toUTC(d));

// Día de la semana: 0 = lunes … 6 = domingo.
export const dow = (d: string) => (new Date(toUTC(d)).getUTCDay() + 6) % 7;
export const lunesDe = (d: string) => addDays(d, -dow(d));

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const fechaCorta = (d: string) => `${Number(d.slice(8, 10))} ${MES[Number(d.slice(5, 7)) - 1]}`;
export const fechaLarga = (d: string) => `${fechaCorta(d)} ${d.slice(0, 4)}`;

// Minutos entre dos horas "HH:MM"; si la de término es menor, el turno cruzó la medianoche.
export function minutosEntre(inicio: string, fin: string): number {
  const a = Number(inicio.slice(0, 2)) * 60 + Number(inicio.slice(3, 5));
  const b = Number(fin.slice(0, 2)) * 60 + Number(fin.slice(3, 5));
  return (b - a + 1440) % 1440;
}
