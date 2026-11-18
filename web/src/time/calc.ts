// Bitácora de tiempo: en qué se te va el día, al minuto. Funciones puras, con pruebas.
// Junta lo que anotas a mano (o con el cronómetro) con lo que ya existe en la app:
// los turnos cuentan como trabajo y los partidos con hora como fútbol. Lo anotado a mano manda.
import { addDays } from "../core/dates";
import type { Actividad, CatTiempo, Datos } from "../data/types";
import { DURACION } from "../calendar/calc";

export const CATS: { id: CatTiempo; nombre: string; color: string }[] = [
  { id: "sueno", nombre: "Dormir", color: "#6E7BD9" },
  { id: "trabajo", nombre: "Trabajo", color: "#E0A23B" },
  { id: "estudio", nombre: "Estudio", color: "#4C8DF6" },
  { id: "entreno", nombre: "Entreno", color: "#2ED3A6" },
  { id: "futbol", nombre: "Fútbol", color: "#1FA463" },
  { id: "traslado", nombre: "Traslado", color: "#8A94A6" },
  { id: "comida", nombre: "Comer", color: "#D9775B" },
  { id: "casa", nombre: "Casa y trámites", color: "#A98467" },
  { id: "social", nombre: "Amigos y familia", color: "#D46BA3" },
  { id: "ocio", nombre: "Ocio", color: "#9B6BDE" },
  { id: "pantallas", nombre: "Celular y pantallas", color: "#E15A5A" },
  { id: "otro", nombre: "Otro", color: "#5E6B7D" },
];
export const cat = (id: CatTiempo) => CATS.find((c) => c.id === id) || CATS[CATS.length - 1];

// Palabras del día a día → categoría.
const PISTAS: [CatTiempo, RegExp][] = [
  ["sueno", /\b(dormi|dormir|durmiendo|siesta|acostar|me acoste|tuto|la cama)/],
  ["trabajo", /\b(trabaj|turno|pega|oficina|restaurant|atender)/],
  ["entreno", /\b(gym|gimnasio|gim|entren|pesas|correr|trot|corri|nadar|nade|bici|spinning|fisico|crossfit|estirar|movilidad)/],
  ["futbol", /\b(futbol|partido|pichanga|baby|club|la cancha)/],
  ["estudio", /\b(estudi|ingles|clase|curso|tarea|repas|prueba|leer apuntes|universidad|preu|paes)/],
  ["traslado", /\b(micro|bus|manej|auto|camino|traslad|viaj|metro|uber|colectivo|caminando a)/],
  ["comida", /\b(comer|comiendo|almorz|almuerzo|cena|cenar|once|desayun|cocin)/],
  ["casa", /\b(limpi|orden|lavar|lavando|aseo|tramite|compras|supermercado|super|banco|medico|doctor|dentista)/],
  ["social", /\b(amigos|familia|polola|pololo|carrete|junta|juntarme|visita|mama|papa|abuel|herman|cumple)/],
  ["pantallas", /\b(celular|celu|cel|redes|instagram|insta|tiktok|youtube|scroll|telefono|whatsapp|pantalla)/],
  ["ocio", /\b(tele|tv|anime|serie|netflix|pelicula|jugar|play|videojuego|juego|musica|leer|lei|libro|descans|relaj|guitarra)/],
];
export function catPara(texto: string): CatTiempo | null {
  const t = ` ${texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")} `;
  for (const [c, re] of PISTAS) if (re.test(t)) return c;
  return null;
}

// "AAAA-MM-DDTHH:MM" ↔ minutos desde el inicio de una fecha.
export const fechaDe = (iso: string) => iso.slice(0, 10);
export const horaDe = (iso: string) => iso.slice(11, 16);
const minDia = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
export const iso = (fecha: string, hhmm: string) => `${fecha}T${hhmm}`;
export function minutosEntreIso(a: string, b: string): number {
  const d = Math.round((Date.parse(fechaDe(b) + "T00:00Z") - Date.parse(fechaDe(a) + "T00:00Z")) / 60000);
  return d + minDia(horaDe(b)) - minDia(horaDe(a));
}

export interface Bloque {
  id: string;
  cat: CatTiempo;
  ini: number; // minuto del día (0-1440)
  fin: number;
  titulo: string;
  derivado?: boolean; // sale de un turno o partido (no se anotó en la bitácora)
  corriendo?: boolean;
  actividad?: Actividad;
}

// Los bloques que tocan esta fecha, recortados al día. "ahora" cierra el cronómetro que corre.
export function bloquesDia(d: Pick<Datos, "actividades" | "turnos" | "partidos">, fecha: string, ahora?: string): Bloque[] {
  const out: Bloque[] = [];
  const recorta = (iniIso: string, finIso: string) => {
    const ini = fechaDe(iniIso) < fecha ? 0 : fechaDe(iniIso) > fecha ? 1440 : minDia(horaDe(iniIso));
    const fin = fechaDe(finIso) > fecha ? 1440 : fechaDe(finIso) < fecha ? 0 : minDia(horaDe(finIso));
    return { ini, fin };
  };
  for (const a of d.actividades) {
    const finIso = a.fin || ahora;
    if (!finIso || fechaDe(a.inicio) > fecha || fechaDe(finIso) < fecha) continue;
    const { ini, fin } = recorta(a.inicio, finIso);
    if (fin > ini) out.push({ id: a.id, cat: a.cat, ini, fin, titulo: a.nota || cat(a.cat).nombre, corriendo: !a.fin, actividad: a });
  }
  const manual = (c: CatTiempo, ini: number, fin: number) => out.some((b) => !b.derivado && b.cat === c && b.ini < fin && ini < b.fin);
  for (const t of d.turnos) {
    if (t.falte) continue;
    for (const f of [t.fecha, addDays(t.fecha, 1)]) {
      if (f !== fecha) continue;
      const cruza = minDia(t.fin) <= minDia(t.inicio);
      const finIso = iso(cruza ? addDays(t.fecha, 1) : t.fecha, t.fin);
      const { ini, fin } = recorta(iso(t.fecha, t.inicio), finIso);
      if (fin > ini && !manual("trabajo", ini, fin)) out.push({ id: `turno:${t.id}:${f}`, cat: "trabajo", ini, fin, titulo: "Turno", derivado: true });
    }
  }
  for (const p of d.partidos) {
    if (p.fecha !== fecha || !p.hora || p.fui === false) continue;
    const ini = minDia(p.hora);
    const fin = Math.min(1440, ini + (p.minutos && p.tipo === "partido" ? Math.max(p.minutos, 60) + 15 : DURACION[p.tipo === "partido" ? "partido" : "equipo"]));
    if (!manual("futbol", ini, fin)) out.push({ id: `partido:${p.id}`, cat: "futbol", ini, fin, titulo: p.tipo === "partido" ? `Partido${p.rival ? ` vs. ${p.rival}` : ""}` : "Entrenamiento con el equipo", derivado: true });
  }
  return out.sort((a, b) => a.ini - b.ini || Number(!!a.derivado) - Number(!!b.derivado));
}

// Minuto a minuto: si dos cosas se pisan, cuenta una sola (lo anotado a mano gana a lo derivado,
// y entre lo anotado, lo que empezó después). Así el total del día nunca pasa de 24 horas.
export function minutosDia(bloques: Bloque[], hasta = 1440): Partial<Record<CatTiempo, number>> {
  const dueno: (CatTiempo | null)[] = new Array(1440).fill(null);
  const orden = [...bloques].sort((a, b) => Number(!a.derivado) - Number(!b.derivado) || a.ini - b.ini);
  for (const b of orden) for (let m = b.ini; m < Math.min(b.fin, hasta); m++) dueno[m] = b.cat;
  const out: Partial<Record<CatTiempo, number>> = {};
  for (let m = 0; m < Math.min(hasta, 1440); m++) {
    const c = dueno[m];
    if (c) out[c] = (out[c] || 0) + 1;
  }
  return out;
}

export interface Periodo {
  porCat: Partial<Record<CatTiempo, number>>; // minutos
  registrado: number;
  posible: number; // minutos que ya pasaron en el periodo
  dias: { fecha: string; minutos: number; porCat: Partial<Record<CatTiempo, number>> }[];
}

// Suma un rango de fechas. "ahora" (AAAA-MM-DDTHH:MM) corta el día de hoy en la hora actual.
export function tiempoPeriodo(d: Pick<Datos, "actividades" | "turnos" | "partidos">, desde: string, hasta: string, ahora: string): Periodo {
  const hoy = fechaDe(ahora);
  const porCat: Partial<Record<CatTiempo, number>> = {};
  const dias: Periodo["dias"] = [];
  let registrado = 0;
  let posible = 0;
  // Se filtra una vez para que un año entero siga siendo rápido.
  const sub = {
    actividades: d.actividades.filter((a) => fechaDe(a.inicio) <= hasta && fechaDe(a.fin || ahora) >= desde),
    turnos: d.turnos.filter((t) => t.fecha >= addDays(desde, -1) && t.fecha <= hasta),
    partidos: d.partidos.filter((p) => p.fecha >= desde && p.fecha <= hasta),
  };
  for (let f = desde; f <= hasta && f <= hoy; f = addDays(f, 1)) {
    const tope = f === hoy ? minDia(horaDe(ahora)) : 1440;
    const m = minutosDia(bloquesDia(sub, f, ahora), tope);
    let tot = 0;
    for (const [c, v] of Object.entries(m) as [CatTiempo, number][]) {
      porCat[c] = (porCat[c] || 0) + v;
      tot += v;
    }
    registrado += tot;
    posible += tope;
    dias.push({ fecha: f, minutos: tot, porCat: m });
  }
  return { porCat, registrado, posible, dias };
}

export const corriendo = (acts: Actividad[]) => acts.find((a) => !a.fin) || null;

export function horasTxt(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

// En palabras, para JARVIS: "Hoy registraste 9 h: trabajo 6 h, estudio 1 h 30 min…".
export function fraseTiempo(p: Periodo, cuando: string): string {
  if (!p.registrado) return `${cuando[0].toUpperCase()}${cuando.slice(1)} no tienes tiempo registrado. Dime "empecé a estudiar" o anota bloques en Mi tiempo.`;
  const top = (Object.entries(p.porCat) as [CatTiempo, number][]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sin = p.posible - p.registrado;
  return `${cuando[0].toUpperCase()}${cuando.slice(1)} registraste ${horasTxt(p.registrado)}: ${top.map(([c, v]) => `${cat(c).nombre.toLowerCase()} ${horasTxt(v)}`).join(", ")}.${sin > 120 && p.dias.length <= 7 ? ` Quedaron ${horasTxt(sin)} sin registrar.` : ""}`;
}
