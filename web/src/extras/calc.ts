// Lo que se sumó después de las 6 fases: fechas importantes, memoria de JARVIS, simulador de metas,
// modo semana difícil y logros. Funciones puras, con pruebas.
import { MESES } from "../core/texto";
import { addDays, diffDays } from "../core/dates";
import type { Datos, FechaImportante, Meta, Recuerdo } from "../data/types";
import { avance, valorActual } from "../goals/calc";
import { activos, mejorRacha } from "../habits/calc";
import { clp } from "../money/format";

const sinTilde = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---------- Fechas importantes ----------
export interface ProximaFecha {
  f: FechaImportante;
  fecha: string; // la próxima vez que cae (AAAA-MM-DD)
  enDias: number;
  cumple?: number; // años que cumple (si se sabe el año)
}

export function proximasFechas(fs: FechaImportante[], hoy: string, dias = 30): ProximaFecha[] {
  const y = Number(hoy.slice(0, 4));
  return fs
    .map((f) => {
      // 29 de febrero en años no bisiestos: se celebra el 28.
      const fix = (yy: number) => (f.dia === "02-29" && !(yy % 4 === 0 && (yy % 100 !== 0 || yy % 400 === 0)) ? "02-28" : f.dia);
      let fecha = `${y}-${fix(y)}`;
      if (fecha < hoy) fecha = `${y + 1}-${fix(y + 1)}`;
      const anio = Number(fecha.slice(0, 4));
      return { f, fecha, enDias: diffDays(fecha, hoy), ...(f.anio ? { cumple: anio - f.anio } : {}) };
    })
    .filter((x) => x.enDias <= dias)
    .sort((a, b) => a.enDias - b.enDias);
}

export const fechaTxt = (mmdd: string) => `${Number(mmdd.slice(3))} de ${MESES[Number(mmdd.slice(0, 2)) - 1]}`;

export function fraseFecha(p: ProximaFecha): string {
  const cuando = p.enDias === 0 ? "hoy" : p.enDias === 1 ? "mañana" : `en ${p.enDias} días (${fechaTxt(p.f.dia)})`;
  const edad = p.cumple && p.f.tipo === "cumple" ? `: cumple ${p.cumple}` : p.cumple && p.f.tipo === "aniversario" ? `: ${p.cumple} ${p.cumple === 1 ? "año" : "años"}` : "";
  return `${cuando[0].toUpperCase()}${cuando.slice(1)} es ${p.f.nombre.charAt(0).toLowerCase()}${p.f.nombre.slice(1)}${edad}.`;
}

// ---------- Memoria ----------
// Nunca se guardan claves, contraseñas, tarjetas ni datos para entrar a cuentas.
export const esSensible = (t: string) => /\b(clave|contrasena|password|pin|tarjeta|cvv|codigo de seguridad|rut\b|numero de cuenta|cuenta corriente|cuenta rut|token|api key)\b|\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/.test(sinTilde(t));

const VACIAS = new Set(["el", "la", "los", "las", "de", "del", "que", "y", "a", "en", "un", "una", "mi", "me", "tengo", "es", "se", "por", "para", "con", "lo", "al", "su", "hay", "esta", "este", "eso"]);
const palabras = (t: string) => sinTilde(t).replace(/[^a-zñ0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !VACIAS.has(w));

// Los recuerdos que sirven para lo que Diego dice ahora: los de fechas cercanas y los que comparten palabras.
export function relevantes(rs: Recuerdo[], texto: string, hoy: string, max = 5): Recuerdo[] {
  const q = new Set(palabras(texto));
  return rs
    .map((r) => {
      let s = palabras(r.texto).filter((w) => q.has(w)).length * 2;
      if (r.fecha) {
        const d = diffDays(r.fecha, hoy);
        if (d >= 0 && d <= 2) s += 3;
        else if (d < -1) s -= 5; // ya pasó
      }
      if (diffDays(hoy, r.creado) <= 3) s += 1;
      return { r, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.r);
}

// Para el resumen de la mañana: lo que contó que pasaba hoy.
export const recuerdosDeHoy = (rs: Recuerdo[], hoy: string) => rs.filter((r) => r.fecha === hoy);

// ---------- Simulador de metas ----------
export interface Simulacion {
  meses: number | null; // null = nunca, con ese ahorro
  fecha: string | null; // AAAA-MM-DD estimada
  aTiempo: boolean | null;
  necesario: number | null; // cuánto al mes para llegar a la fecha límite
}

export function simular(m: Meta, d: Datos, hoy: string, porMes: number): Simulacion {
  const actual = valorActual(m, d, hoy);
  const falta = Math.max(0, m.objetivo - actual);
  const mesesHasta = Math.max(0, diffDays(m.fechaLimite, hoy) / 30.44);
  const necesario = falta === 0 ? 0 : mesesHasta >= 1 ? Math.ceil(falta / Math.floor(mesesHasta) / 1000) * 1000 : falta;
  if (falta === 0) return { meses: 0, fecha: hoy, aTiempo: true, necesario: 0 };
  if (porMes <= 0) return { meses: null, fecha: null, aTiempo: false, necesario };
  const meses = Math.ceil(falta / porMes);
  const fecha = addDays(hoy, Math.round(meses * 30.44));
  return { meses, fecha, aTiempo: fecha <= m.fechaLimite, necesario };
}

export function fraseSimulacion(m: Meta, s: Simulacion, porMes: number): string {
  if (s.meses === 0) return `"${m.nombre}" ya está cumplida.`;
  if (s.meses == null) return `Sin ahorrar nada al mes no llegas. Para "${m.nombre}" a tiempo necesitas unos ${clp(s.necesario || 0)} al mes.`;
  const tiempo = s.meses < 12 ? `${s.meses} ${s.meses === 1 ? "mes" : "meses"}` : `${Math.floor(s.meses / 12)} ${Math.floor(s.meses / 12) === 1 ? "año" : "años"}${s.meses % 12 ? ` y ${s.meses % 12} ${s.meses % 12 === 1 ? "mes" : "meses"}` : ""}`;
  return `Ahorrando ${clp(porMes)} al mes, llegas a "${m.nombre}" en ${tiempo}. ${s.aTiempo ? "Llegas antes de la fecha límite. Bien ahí." : `Te pasas de la fecha límite: para llegar a tiempo necesitas unos ${clp(s.necesario || 0)} al mes.`}`;
}

// ---------- Semana difícil ----------
export interface Periodo {
  desde: string;
  hasta: string;
}
export const enDificil = (ps: Periodo[], fecha: string) => ps.some((p) => fecha >= p.desde && fecha <= p.hasta);

// ¿Conviene sugerirla? Varios días con poca energía o ánimo bajo, o te pasaste del presupuesto.
export function sugerirDificil(d: Datos, hoy: string, presupuestoExcedido: boolean): string | null {
  const ult = [0, 1, 2].map((i) => d.dias.find((x) => x.id === addDays(hoy, -i)));
  const bajos = ult.filter((x) => (x?.energia != null && x.energia <= 2) || (x?.animo != null && x.animo <= 2)).length;
  if (bajos >= 2) return "Llevas unos días con poca energía o el ánimo bajo.";
  if (presupuestoExcedido && bajos >= 1) return "Vienes cansado y con la plata justa.";
  return null;
}

// ---------- Logros (sutiles, sin infantilizar) ----------
export interface Logro {
  id: string;
  titulo: string;
  texto: string;
}

export function logros(d: Datos, hoy: string): Logro[] {
  const out: Logro[] = [];
  const anio = hoy.slice(0, 4);
  const ent = d.entrenos.length;
  for (const n of [10, 25, 50, 100, 200]) if (ent >= n) out.push({ id: `entrenos-${n}`, titulo: `${n} entrenos`, texto: `Llevas ${n} entrenos registrados.` });
  const jug = d.partidos.filter((p) => p.fui && p.tipo === "partido" && p.fecha.startsWith(anio));
  const goles = jug.reduce((a, p) => a + (p.goles || 0), 0);
  const asis = jug.reduce((a, p) => a + (p.asistencias || 0), 0);
  if (goles >= 1) out.push({ id: `gol-${anio}`, titulo: "Primer gol del año", texto: `Ya marcaste en ${anio}.` });
  for (const n of [5, 10, 20]) if (goles >= n) out.push({ id: `goles-${anio}-${n}`, titulo: `${n} goles en ${anio}`, texto: `Van ${goles} goles esta temporada.` });
  for (const n of [5, 10, 20]) if (asis >= n) out.push({ id: `asis-${anio}-${n}`, titulo: `${n} asistencias en ${anio}`, texto: "Un mediocampista que hace jugar al equipo." });
  const horasEst = d.sesiones.reduce((a, s) => a + s.minutos, 0) / 60;
  for (const n of [10, 50, 100, 250]) if (horasEst >= n) out.push({ id: `estudio-${n}`, titulo: `${n} horas de estudio`, texto: `Ya sumas ${Math.floor(horasEst)} horas estudiando.` });
  for (const h of activos(d.habitos)) {
    const r = mejorRacha(h, d.dias, hoy);
    for (const n of [7, 30, 100]) if (r >= n) out.push({ id: `racha-${h.id}-${n}`, titulo: `${n} días seguidos`, texto: `Con "${h.nombre}".` });
  }
  for (const m of d.metas) if (avance(m, d, hoy).estado === "cumplida") out.push({ id: `meta-${m.id}`, titulo: "Meta cumplida", texto: m.nombre });
  const meses = new Set(d.movimientos.map((x) => x.fecha.slice(0, 7)));
  const conAhorro = [...meses].filter((mes) => {
    const ing = d.movimientos.filter((x) => x.fecha.startsWith(mes) && x.tipo === "ingreso").reduce((a, x) => a + x.monto, 0);
    const egr = d.movimientos.filter((x) => x.fecha.startsWith(mes) && x.tipo === "egreso").reduce((a, x) => a + x.monto, 0);
    return mes < hoy.slice(0, 7) && ing > egr;
  }).length;
  for (const n of [1, 3, 6, 12]) if (conAhorro >= n) out.push({ id: `ahorro-${n}`, titulo: n === 1 ? "Primer mes con ahorro" : `${n} meses con ahorro`, texto: "Te sobró plata a fin de mes." });
  const diasBitacora = new Set(d.actividades.map((a) => a.inicio.slice(0, 10))).size;
  for (const n of [7, 30]) if (diasBitacora >= n) out.push({ id: `bitacora-${n}`, titulo: `${n} días en la bitácora`, texto: "Ya sabes en qué se te va el tiempo." });
  return out;
}
