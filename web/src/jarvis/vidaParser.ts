// Intérprete local de lo que Diego registra o pregunta sobre su vida (plata, entrenos,
// fútbol, metas, estudio, trabajo). Funciona sin internet y sin gastar cuota de Gemini.
// Si no entiende la frase devuelve null y sigue el intérprete de la rutina o Gemini.
import type { LocalCommand } from "../brain/commands";
import { addDays } from "../core/dates";
import { parseHour } from "../core/time";
import { parseCLP } from "../money/format";

const NUM: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
  doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};
const NUM_RE = Object.keys(NUM).join("|");

// "5 mil", "5.000", "$5.000", "5 lucas", "una luca", "cinco mil", "1,5 millones", "un palo", "mil pesos".
const AMOUNT = new RegExp(`\\buna? (?:lucas?|palos?|millon)\\b|\\bmil pesos\\b|(?:\\$\\s?)?(?:\\d[\\d.,]*|\\b(?:${NUM_RE})\\b)(?:\\s*(?:millones|millon|palos?|mil|lucas?|k)\\b)?(?:\\s*pesos)?|\\bmil\\b`, "g");

export function montoEn(text: string): { valor: number; resto: string } | null {
  for (const m of text.matchAll(AMOUNT)) {
    let raw = m[0].trim().replace(/^\$\s?/, "").replace(/\s*pesos$/, "");
    if (/^una? (lucas?|palos?|millon)$/.test(raw)) raw = raw.replace(/^una? /, "1 ");
    if (raw === "mil") raw = "1 mil";
    const w = raw.match(new RegExp(`^(${NUM_RE})\\b(.*)$`));
    if (w) raw = `${NUM[w[1]]}${w[2]}`;
    // un número suelto sin unidad, en una frase de plata, solo vale si parece monto (>= 100)
    const v = parseCLP(raw);
    if (v == null) continue;
    if (!/mil|k|luca|palo|millon|\$/.test(m[0]) && v < 100) continue;
    return { valor: v, resto: (text.slice(0, m.index) + " " + text.slice(m.index! + m[0].length)).replace(/\s+/g, " ").trim() };
  }
  return null;
}

const num = (s?: string) => (s == null ? undefined : /^\d+$/.test(s) ? Number(s) : NUM[s]);

// "ayer", "anteayer", "hoy": la fecha del registro; el texto sale sin esa palabra.
function fechaEn(t: string, hoy: string): { fecha: string; resto: string } {
  if (/\bantes de ayer\b|\banteayer\b/.test(t)) return { fecha: addDays(hoy, -2), resto: t.replace(/\b(antes de ayer|anteayer)\b/, "").trim() };
  if (/\bayer\b/.test(t)) return { fecha: addDays(hoy, -1), resto: t.replace(/\bayer\b/, "").trim() };
  return { fecha: hoy, resto: t.replace(/\bhoy\b/, "").trim() };
}

// Como norm(), pero conserva lo que sirve para montos y horas: "$5.000", "1,5", "18:30".
const suave = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9$.,: ]/g, " ").replace(/[.,:](?!\d)/g, " ").replace(/\s+/g, " ").trim();

const limpiar = (s: string) =>
  s
    .replace(/^\s*(oye\s+)?jarvis[,\s]*/i, "")
    .replace(/[¿?¡!]/g, "")
    .replace(/\.$/, "")
    .replace(/\s+/g, " ")
    .trim();

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12

// "para marzo" → 31 de marzo (del próximo marzo que viene); "para el 15 de marzo"; "para fin de año"; "en 3 meses".
export function fechaLimiteEn(t: string, hoy: string): string | null {
  const y = Number(hoy.slice(0, 4));
  const mHoy = Number(hoy.slice(5, 7));
  if (/fin de ano|fin de año|fines de ano/.test(t)) return `${y}-12-31`;
  let m = t.match(/\ben (\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce) (mes|meses|semana|semanas|ano|anos|año|años)\b/);
  if (m) {
    const n = num(m[1]) || 1;
    if (/semana/.test(m[2])) return addDays(hoy, n * 7);
    if (/an|añ/.test(m[2])) return addDays(hoy, n * 365);
    const total = mHoy - 1 + n;
    const yy = y + Math.floor(total / 12);
    const mm = (total % 12) + 1;
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(Number(hoy.slice(8, 10)), ultimoDia(yy, mm))).padStart(2, "0")}`;
  }
  m = t.match(new RegExp(`\\b(?:el )?(\\d{1,2}) de (${MESES.join("|")})(?: (?:de |del )?(\\d{4}))?`));
  if (m) {
    const mm = MESES.indexOf(m[2]) + 1;
    let yy = m[3] ? Number(m[3]) : y;
    const d = Math.min(Number(m[1]), ultimoDia(yy, mm));
    let f = `${yy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!m[3] && f <= hoy) f = `${++yy}${f.slice(4)}`;
    return f;
  }
  m = t.match(new RegExp(`\\b(?:para|a|hasta|en|antes de)\\s+(?:fines de |fin de |finales de )?(${MESES.join("|")})(?: (?:de |del )?(\\d{4}))?`));
  if (m) {
    const mm = MESES.indexOf(m[1]) + 1;
    const yy = m[2] ? Number(m[2]) : mm <= mHoy ? y + 1 : y;
    return `${yy}-${String(mm).padStart(2, "0")}-${String(ultimoDia(yy, mm)).padStart(2, "0")}`;
  }
  return null;
}

const sinFechaMeta = (s: string) =>
  s
    .replace(/\b(para|hasta|antes de|en)\s+(el\s+)?(\d{1,2} de )?(fines de |fin de |finales de )?(\w+)( de \d{4})?$/, "")
    .replace(/\ben \d+ (mes|meses|semanas?|anos?|años?)$/, "")
    .replace(/\bpara fin de (ano|año)$/, "")
    .trim();

const ENTRENO = "gym|gimnasio|gim|pesas|pierna|piernas|tren superior|tren inferior|core|abdominales|cardio|fisico|físico|entrenamiento|entreno|funcional|crossfit|natacion|natación|bici|spinning";

export function parseVida(text: string, hoy: string): LocalCommand | null {
  const raw = limpiar(text).toLowerCase();
  const t = suave(raw);
  if (!t) return null;

  // Deshacer lo último que anotó JARVIS.
  if (/^(deshace|deshacer|deshaz|anula|anular|borra|borrar|quita) (eso|lo ultimo|el ultimo|lo que anotaste|ultimo registro)\b|^(deshace|deshaz|deshacer)$|^me equivoque\b/.test(t)) return { tool: "__deshacer", args: {} };

  // ---------- Consultas ----------
  if (/\b(resumen|resume) (de la manana|del dia|de hoy|matinal)\b|^buen(os)? dias?\b|\bcomo (parte|viene) mi dia\b/.test(t)) return { tool: "resumen", args: { tipo: "manana" } };
  if (/\bresumen (de la |de esta |semanal|de mi semana)|\bcomo (fue|estuvo|me fue|va) (mi |la |esta )?semana\b|\bresumen semanal\b/.test(t)) return { tool: "resumen", args: { tipo: "semana" } };
  if (/\bresumen (del|de este|mensual|de mi) ?mes|\bresumen mensual\b|\bcomo (fue|estuvo|me fue|me va|va) (el |este |mi )?mes\b/.test(t)) return { tool: "resumen", args: { tipo: "mes" } };
  if (/\bque (me toca|tengo|hay|hago) hoy\b|\bque tengo para hoy\b|\bmi dia de hoy\b|\bagenda de hoy\b/.test(t)) return { tool: "resumen", args: { tipo: "hoy" } };

  if (/\b(cuanto|cuanta plata|cuanto dinero)\b.*\b(gaste|gastado|llevo|he gastado|gastando|gasto|me queda|ahorrado|ahorre|gane|ganado|entro|recibi)\b|\bcomo (voy|ando|estoy|vamos) (con|en) (la )?(plata|dinero|lucas|presupuesto|gastos|finanzas)\b|\bmi presupuesto\b|\bcuanto me queda\b/.test(t)) {
    const periodo = /\bhoy\b/.test(t) ? "hoy" : /\bsemana\b/.test(t) ? "semana" : /\bmes pasado\b/.test(t) ? "mes-pasado" : "mes";
    const cat = t.match(/\ben (?!el mes|este mes|la semana|esta semana|hoy\b)([a-zñ ]+?)(?: este mes| esta semana| hoy| el mes pasado)?$/);
    const tipo = /\b(gane|ganado|entro|recibi|ingres)/.test(t) ? "ingreso" : "egreso";
    return { tool: "consultar_dinero", args: { periodo, tipo, ...(cat ? { categoria: cat[1].trim() } : {}) } };
  }
  if (/\bcomo (voy|ando|van|vamos|va) (con |en )?(mis |las |la )?metas?\b|\bmis metas\b/.test(t)) {
    const m = t.match(/\bmeta (?:de |del |de la )?(.+)$/);
    return { tool: "consultar_metas", args: m ? { nombre: m[1] } : {} };
  }
  if (/\bcuant[oa]s? (goles|asistencias|partidos|minutos)\b|\bcomo (voy|ando) (en|con) (el )?futbol\b|\bmis (numeros|estadisticas)( del futbol| de futbol)?\b|\bproximo partido\b|\bcuando juego\b/.test(t)) return { tool: "consultar_futbol", args: {} };
  if (/\bque (me toca )?entren(o|ar) hoy\b|\bque entreno (me toca|hoy)\b|\b(rutina|sesion) de (gym|gimnasio|hoy)\b|\bque hago en el gym\b/.test(t)) return { tool: "entreno_de_hoy", args: {} };

  const preg = /^(cuanto|cuanta|cuantos|cuantas|como|que|cuando|donde|por que|cual)\b/.test(t);

  // ---------- Metas ----------
  // "agrega una meta de ahorrar 200 mil para marzo", "nueva meta: leer 10 libros para diciembre"
  let m = raw.match(/^(?:agrega|agregar|crea|crear|ponme|anota|anotame|añade|nueva|quiero)\s+(?:una\s+)?(?:nueva\s+)?meta\s*(?:de\s+|:\s*|que sea\s+)?(.+)$/) || raw.match(/^nueva meta\s*(?:de\s+|:\s*)?(.+)$/);
  if (m) {
    const cuerpo = suave(m[1]);
    const limite = fechaLimiteEn(cuerpo, hoy);
    const sinF = sinFechaMeta(cuerpo);
    const plata = /\b(ahorr|junt|reun|guard|plata|pesos|lucas?|mil|palo|millon|\$)/.test(m[1].toLowerCase()) ? montoEn(sinF) : null;
    if (plata) {
      const nombre = plata.resto.replace(/\b(de|para)$/, "").trim();
      return { tool: "crear_meta", args: { nombre: nombre || "ahorrar", tipo: "monto", objetivo: plata.valor, ...(limite ? { fecha_limite: limite } : {}) } };
    }
    const hab = sinF.match(/^(.+?)\s+(\d+|una|dos|tres|cuatro|cinco|seis|siete)\s+veces? (?:por|a la|cada) semana$/);
    if (hab) return { tool: "crear_meta", args: { nombre: hab[1], tipo: "habito", objetivo: num(hab[2]), ...(limite ? { fecha_limite: limite } : {}) } };
    const cant = sinF.match(/^(.*?)\s*\b(\d+)\s+([a-zñ]+)(.*)$/);
    if (cant) return { tool: "crear_meta", args: { nombre: sinF, tipo: "cantidad", objetivo: Number(cant[2]), unidad: cant[3], ...(limite ? { fecha_limite: limite } : {}) } };
    return { tool: "crear_meta", args: { nombre: sinF, tipo: "pasos", ...(limite ? { fecha_limite: limite } : {}) } };
  }
  // "aporté 20 mil a la meta del viaje", "guardé 30 lucas para la visa"
  m = raw.match(/^(?:aporte|aporté|abone|aboné|guarde|guardé|ahorre|ahorré|puse|meti|metí|deposite|deposité)\s+(.+?)\s+(?:a|para|en)\s+(?:la\s+)?(?:meta\s+)?(?:de(?:l)?\s+|la\s+)?(.+)$/);
  if (m && !preg) {
    const v = montoEn(suave(m[1]));
    if (v) return { tool: "aportar_meta", args: { meta: suave(m[2]), valor: v.valor } };
  }

  // ---------- Plata ----------
  const { fecha, resto } = fechaEn(t, hoy);
  const conFecha = (args: Record<string, unknown>) => (fecha !== hoy ? { ...args, fecha } : args);

  // Gastos: "gasté 5 mil en comida", "pagué 12 lucas de luz", "compré zapatillas en 30 mil", "almuerzo 5 lucas"
  if (!preg && /^(me )?(gaste|pague|compre|se me fueron|anota (un )?gasto|gasto de|registra (un )?gasto)\b/.test(resto)) {
    const sinVerbo = resto.replace(/^(me )?(gaste|pague|compre|se me fueron|anota (un )?gasto( de)?|gasto de|registra (un )?gasto( de)?)\s*/, "");
    const v = montoEn(sinVerbo);
    if (v) {
      const desc = v.resto.replace(/^((en|de|por|para|un|una|el|la|los|las)\s+)+/, "").replace(/\s+(en|de|por)$/, "").trim();
      return { tool: "registrar_gasto", args: conFecha({ monto: v.valor, ...(desc ? { descripcion: desc } : {}) }) };
    }
    return { tool: "__falta_monto", args: { tipo: "egreso" } };
  }
  // Ingresos: "me pagaron 40 mil de propina", "me llegó el sueldo", "gané 20 lucas en un pololo", "recibí 10 mil"
  if (!preg && /^(me (pagaron|dieron|llego|llegaron|depositaron|transfirieron)|gane|recibi|cobre|anota (un )?ingreso|ingreso de|saque)\b|^(\S+ )?(lucas?|mil|pesos) de propinas?\b|^propinas? de\b/.test(resto)) {
    const sinVerbo = resto.replace(/^(me (pagaron|dieron|llego|llegaron|depositaron|transfirieron)|gane|recibi|cobre|anota (un )?ingreso( de)?|ingreso de|saque)\s*/, "");
    const v = montoEn(sinVerbo);
    if (v) {
      const desc = v.resto.replace(/^((en|de|por|el|la|un|una)\s+)+/, "").replace(/\s+(de|en|por)$/, "").trim();
      return { tool: "registrar_ingreso", args: conFecha({ monto: v.valor, ...(desc ? { descripcion: desc } : {}) }) };
    }
    if (/sueldo/.test(sinVerbo)) return { tool: "__falta_monto", args: { tipo: "ingreso", descripcion: "sueldo" } };
  }

  // ---------- Fútbol ----------
  // "metí un gol y una asistencia", "hice 2 goles", "ganamos 3 a 1", "jugué 70 minutos", "di una asistencia"
  if (!preg && /\bgol(es)?\b|\basistencias?\b|^(ganamos|perdimos|empatamos)\b|\bjugue\b.*\b(minutos|partido)\b/.test(resto) && !/\b(llevo|tengo|cuantos)\b/.test(resto)) {
    const args: Record<string, unknown> = {};
    const g = resto.match(new RegExp(`\\b(\\d+|${NUM_RE}) (?:gol|goles|golazos?)\\b`));
    if (g) args.goles = num(g[1]);
    else if (/\b(meti|hice|marque|anote|convierti) (el |un )?gol(azo)?\b/.test(resto)) args.goles = 1;
    const a = resto.match(new RegExp(`\\b(\\d+|${NUM_RE}) asistencias?\\b`));
    if (a) args.asistencias = num(a[1]);
    else if (/\b(di|hice|tuve) (la )?asistencia\b/.test(resto)) args.asistencias = 1;
    const min = resto.match(/\b(\d+) (?:minutos|min)\b/);
    if (min) args.minutos = Number(min[1]);
    else if (/\b(todo el partido|los 90|el partido completo)\b/.test(resto)) args.minutos = 90;
    const r = resto.match(/\b(ganamos|perdimos|empatamos)(?: (\d+) (?:a|-|por) (\d+))?/);
    if (r) {
      args.resultado = r[1] === "ganamos" ? "ganado" : r[1] === "perdimos" ? "perdido" : "empate";
      if (r[2] && r[3]) {
        const [x, y] = [Number(r[2]), Number(r[3])];
        args.goles_favor = r[1] === "perdimos" ? Math.min(x, y) : Math.max(x, y);
        args.goles_contra = r[1] === "perdimos" ? Math.max(x, y) : Math.min(x, y);
      }
    }
    const nota = resto.match(/\b(?:me pongo|nota|me doy|me pongo un|me pongo una) (?:un |una )?(\d{1,2})\b/);
    if (nota && Number(nota[1]) <= 10) args.calificacion = Number(nota[1]);
    const rival = resto.match(/\b(?:contra|vs|versus|ante) (?:el |la |los )?([a-zñ ]+?)(?= y | ganamos| perdimos| empatamos| \d|$)/);
    if (rival) args.rival = rival[1].trim();
    if (Object.keys(args).length) return { tool: "registrar_partido", args: conFecha(args) };
  }

  // ---------- Entreno ----------
  // "hice gym", "fui al gimnasio", "entrené pierna", "salí a correr 5 km", "corrí 30 minutos"
  if (!preg) {
    const e =
      resto.match(new RegExp(`^(?:ya )?(?:hice|fui al?|termine|complete|entrene|tuve)\\s+(?:el |la |mi )?(?:rutina de |sesion de |entrenamiento de )?(${ENTRENO})\\b(.*)$`)) ||
      resto.match(/^(?:ya )?(?:entrene|sali a correr|fui a correr|corri|sali a trotar|trote|nade|fui a nadar)\b(.*)$/);
    // "ya hice el gym y el inglés": son varias tareas de la rutina, eso lo resuelve el intérprete de la rutina.
    if (e && /^\s*(y|e|,|tambien)\s/.test((e.length > 2 ? e[2] : e[1]) || "")) return null;
    if (e) {
      const que = e.length > 2 ? e[1] : /corr|trot/.test(resto) ? "correr" : /nad/.test(resto) ? "natación" : "entrenamiento";
      const extra = (e.length > 2 ? e[2] : e[1]) || "";
      const minutos = extra.match(/\b(\d+) (?:minutos|min)\b/) || extra.match(/\b(una|1) hora\b/);
      const km = extra.match(/\b(\d+(?:[.,]\d+)?) ?(?:km|kilometros|kilómetros)\b/);
      const rpe = extra.match(/\b(?:esfuerzo|rpe|intensidad) (?:de )?(\d{1,2})\b/);
      return {
        tool: "registrar_entreno",
        args: conFecha({
          tipo: que,
          ...(minutos ? { minutos: /hora/.test(minutos[0]) ? 60 : Number(minutos[1]) } : {}),
          ...(km ? { km: Number(km[1].replace(",", ".")) } : {}),
          ...(rpe && Number(rpe[1]) <= 10 ? { esfuerzo: Number(rpe[1]) } : {}),
        }),
      };
    }
  }

  // ---------- Estudio ----------
  // "estudié 1 hora de inglés", "estudie 45 minutos de matemáticas", "estudié inglés una hora y media"
  if (!preg) {
    const s = resto.match(/^(?:ya )?(?:estudie|repase|practique|hice)\s+(.+)$/);
    if (s && /\b(hora|horas|minutos|min)\b/.test(s[1])) {
      const dur = s[1].match(/\b(\d+(?:[.,]\d+)?|una|un|dos|tres|cuatro|media)\s*(horas?|minutos|min)\b(\s+y\s+media)?/);
      if (dur) {
        const base = dur[1] === "media" ? 0.5 : num(dur[1]) ?? Number(dur[1].replace(",", "."));
        const minutos = Math.round(/hora/.test(dur[2]) ? base * 60 + (dur[3] ? 30 : 0) : base);
        const materia = s[1].replace(dur[0], "").replace(/^\s*(de|del|en)\s+/, "").replace(/\s+(de|del|en)\s*$/, "").replace(/^\s*(de|del)\s+/, "").trim();
        if (minutos > 0 && materia) return { tool: "registrar_estudio", args: conFecha({ materia, minutos }) };
      }
    }
  }

  // ---------- Trabajo ----------
  // "trabajé de 18 a 23", "hice turno de 9 a 17 con 30 minutos de colación", "trabajé de 18 a 23 y saqué 15 mil de propina"
  if (!preg) {
    const w = resto.match(/^(?:trabaje|hice (?:un )?turno|tuve turno|me toco turno)\s+(?:de|desde)\s+(?:las\s+)?(\d{1,2}(?:[:.]\d{2})?)\s+(?:a|hasta)\s+(?:las\s+)?(\d{1,2}(?:[:.]\d{2})?)(.*)$/);
    if (w) {
      const ini = parseHour(w[1]);
      const fin = parseHour(w[2]);
      if (ini && fin) {
        const pausa = w[3].match(/\b(\d+) (?:minutos|min)\b/);
        const prop = /propina/.test(w[3]) ? montoEn(w[3].replace(/\b\d+ (minutos|min)\b/, "")) : null;
        return { tool: "registrar_turno", args: conFecha({ inicio: ini, fin, ...(pausa ? { pausa_min: Number(pausa[1]) } : {}), ...(prop ? { propinas: prop.valor } : {}) }) };
      }
    }
  }

  return null;
}
