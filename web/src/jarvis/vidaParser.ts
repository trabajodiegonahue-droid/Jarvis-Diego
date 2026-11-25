import { parseEjercicios } from "../training/ejerciciosVoz";
import { MESES } from "../core/texto";
import { parseExtras } from "./extrasParser";
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
const AMOUNT = new RegExp(`\\buna? (?:lucas?|palos?|millon|gambas?|quinas?)\\b|\\bmil pesos\\b|(?:\\$\\s?)?(?:\\d[\\d.,]*|\\b(?:${NUM_RE})\\b)(?:\\s*(?:millones|millon|palos?|mil|lucas?|k|gambas?|quinas?)\\b)?(?:\\s*pesos)?|\\bmil\\b`, "g");

export function montoEn(text: string): { valor: number; resto: string } | null {
  for (const m of text.matchAll(AMOUNT)) {
    let raw = m[0].trim().replace(/^\$\s?/, "").replace(/\s*pesos$/, "");
    if (/^una? (lucas?|palos?|millon|gambas?|quinas?)$/.test(raw)) raw = raw.replace(/^una? /, "1 ");
    if (raw === "mil") raw = "1 mil";
    const w = raw.match(new RegExp(`^(${NUM_RE})\\b(.*)$`));
    if (w) raw = `${NUM[w[1]]}${w[2]}`;
    // "una gamba" = $100, "una quina" = $500 (monedas, en chileno)
    const mon = raw.match(/^(\d+)\s*(gambas?|quinas?)$/);
    // un número suelto sin unidad, en una frase de plata, solo vale si parece monto (>= 100)
    const v = mon ? Number(mon[1]) * (/gamba/.test(mon[2]) ? 100 : 500) : parseCLP(raw);
    if (v == null) continue;
    if (!/mil|k|luca|palo|millon|gamba|quina|\$/.test(m[0]) && v < 100) continue;
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
    .replace(/^\s*((oye|oe|hola|wena|buenas|ey|hey)[,!\s]+)*(jarvis[,!\s]*)?/i, "")
    .replace(/[¿?¡!]/g, "")
    .replace(/\.$/, "")
    .replace(/\s+/g, " ")
    .trim();

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

// Lo que el intérprete necesita saber de la app para no confundirse (opcional).
export interface CtxVida {
  habitos?: string[]; // nombres de los hábitos
  rutina?: string[]; // nombres de las tareas de la rutina
  corriendo?: string | null; // categoría del cronómetro que corre, si hay
  compras?: string[];
  dificil?: boolean;
  minutos?: number; // la hora actual en minutos del día, para calcular "hace 10 minutos"
}

const DIAS_SEM = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const HORA_RE = "(\\d{1,2}(?:[:.]\\d{2})?)(?:\\s*(?:hrs?|horas|h))?";
const parecido = (a: string, b: string) => {
  const x = a.replace(/^(el|la|los|las|mi|de) /, "");
  return !!x && (b === x || b.startsWith(x) || x.startsWith(b) || b.split(" ")[0] === x.split(" ")[0]);
};

export function parseVida(text: string, hoy: string, ctx: CtxVida = {}): LocalCommand | null {
  const t0 = suave(limpiar(text).toLowerCase());
  // "hace 10 minutos empecé a estudiar", "terminé hace media hora": se calcula la hora y se interpreta el resto.
  const hace = ctx.minutos != null ? haceCuanto(text) : null;
  if (hace) {
    const r = parseVida(hace.resto, hoy, { ...ctx, minutos: undefined });
    const m = (ctx.minutos! - hace.minutos + 1440) % 1440;
    const hora = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    if (!r) return null;
    if (r.tool === "iniciar_actividad") return { ...r, args: { ...r.args, inicio: hora } };
    if (r.tool === "terminar_actividad") return { ...r, args: { ...r.args, fin: hora } };
    if (r.tool === "registrar_bloque" && Number(r.args.minutos) > 0) {
      const i = (m - Number(r.args.minutos) + 1440) % 1440;
      const { minutos: _x, ...resto } = r.args;
      return { ...r, args: { ...resto, inicio: `${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`, fin: hora } };
    }
    return { ...r, args: { ...r.args, hora } };
  }
  // Despertar: cierra el sueño que corre, o pregunta a qué hora se acostó.
  if (/^(ya )?(me desperte|desperte|me levante|buenos dias|buen dia)( recien| recién)?$/.test(t0)) {
    if (ctx.corriendo === "sueno") return { tool: "terminar_actividad", args: {} };
    if (/desperte|levante/.test(t0)) return { tool: "__acoste", args: {} };
  }
  if (/^(ayuda|que (le )?puedo (decir|decirte|pedir|pedirte)|que (sabes|puedes) hacer|que haces|como funcionas|como te uso)( jarvis)?$/.test(t0)) return { tool: "__ayuda", args: {} };
  // Saludos y gracias: respuesta corta, sin gastar cuota.
  const tSal = suave(text.toLowerCase().replace(/[¿?¡!.,]/g, " "));
  if (!t0 || /^(hola|holi|wena|buenas|buenas tardes|buenas noches|que onda|que tal|como estai|como estas|como estay|oye|oe|hey|ey)( jarvis)?$/.test(tSal) || /^(hola |wena |buenas |oye |oe |hey )?jarvis$/.test(tSal)) return { tool: "__saludo", args: {} };
  if (/^(gracias|muchas gracias|grax|vale|buena|bacan|filete|perfecto|genial|ok gracias)( jarvis)?$/.test(t0)) return { tool: "__gracias", args: {} };
  const x = parseExtras(text, ctx);
  if (x) return x;
  // Mi Día: "ya saqué al perro", "ya almorcé", "me tomé el batido" tachan su bloque (y quedan en su área).
  const md = bloqueMiDia(t0, ctx.rutina || []);
  if (md) return { tool: "tachar_tarea", args: { titulo: md } };
  const r = parseVidaBase(text, hoy, ctx);
  if (r) return r;
  // "anota que dormí 7 horas", "pon que gasté 5 lucas", "registra que hice gym": se saca el "anota que".
  const m = limpiar(text).match(/^(?:ya\s+)?(?:anota|anotame|anótame|registra|registrame|apunta|apuntame|pon|ponme|guarda)\s+(?:que\s+)?(.+)$/i);
  return m && !/^(un |una )?(gasto|ingreso|meta|habito|hábito)\b/i.test(m[1]) ? parseVidaBase(m[1], hoy, ctx) : null;
}

function parseVidaBase(text: string, hoy: string, ctx: CtxVida): LocalCommand | null {
  const raw = limpiar(text).toLowerCase();
  const t = suave(raw);
  if (!t) return null;

  // Deshacer lo último que anotó JARVIS.
  if (/^(deshace|deshacer|deshaz|anula|anular|borra|borrar|quita) (eso|lo ultimo|el ultimo|lo que anotaste|ultimo registro)\b|^(deshace|deshaz|deshacer)$|^me equivoque\b/.test(t)) return { tool: "__deshacer", args: {} };

  // ---------- Clima, calendario y bitácora (preguntas) ----------
  if (!/\bcuanto tiempo\b/.test(t) && /\b(clima|va a llover|llovera|llueve|lluvia|que tiempo (hace|va a hacer|hara)|temperatura|hace frio|hace calor|como esta el dia afuera)\b/.test(t))
    return { tool: "consultar_clima", args: { dia: /\bmanana\b/.test(t) && !/\bde la manana\b/.test(t) ? "manana" : "hoy" } };
  if (/\b(mi ano en numeros|resumen del ano|resumen anual|como (va|fue|me fue|me va) (el|este|mi) ano)\b/.test(t)) return { tool: "resumen", args: { tipo: "anio" } };
  if (/\b(en que se me (fue|va|paso)|como (use|ocupe|he usado|he ocupado|gaste|uso|ocupo) (el|mi) tiempo|en que (gaste|ocupe|se me fue) (el|mi) (tiempo|dia))\b|\bcuanto tiempo\b.*\b(estudie|trabaje|entrene|dormi|llevo|pase|estuve|en el celular|en pantallas|hoy|semana|mes|ano)\b/.test(t)) {
    const periodo = /\bayer\b/.test(t) ? "ayer" : /\bsemana\b/.test(t) ? "semana" : /\bmes\b/.test(t) ? "mes" : /\bano\b/.test(t) ? "anio" : "hoy";
    const c = t.match(/\b(estudie|estudiando|trabaje|trabajando|entrene|entrenando|dormi|durmiendo|celular|pantallas|redes|futbol|traslado|comiendo|ocio)\b/);
    return { tool: "consultar_tiempo", args: { periodo, ...(c ? { texto: c[1] } : {}) } };
  }
  if (/\b(se me cruza|se me topa|tengo (algun )?(choque|tope)|hay (algun )?(choque|tope))\b/.test(t)) return { tool: "ver_calendario", args: { semana: /proxima/.test(t) ? "proxima" : "esta" } };
  {
    const c = t.match(/^(?:y )?(?:que tengo|que hay|que me toca|mi agenda|mi calendario|calendario)\s*(?:para |de |del )?(?:el |la |este |esta )?(proxima semana|semana|manana|pasado manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
    if (c) {
      const w = c[1];
      if (/semana/.test(w)) return { tool: "ver_calendario", args: { semana: /proxima/.test(w) ? "proxima" : "esta" } };
      if (w === "manana") return { tool: "ver_calendario", args: { fecha: addDays(hoy, 1) } };
      if (w === "pasado manana") return { tool: "ver_calendario", args: { fecha: addDays(hoy, 2) } };
      const target = DIAS_SEM.indexOf(w);
      const actual = (new Date(hoy + "T12:00Z").getUTCDay() + 6) % 7;
      return { tool: "ver_calendario", args: { fecha: addDays(hoy, ((target - actual + 7) % 7) || 7) } };
    }
    if (/^(mi |el )?(calendario|agenda)( de la semana)?$/.test(t)) return { tool: "ver_calendario", args: { semana: "esta" } };
  }

  // ---------- Bienestar: sueño, agua, ánimo y hábitos ----------
  {
    const dormi = t.match(new RegExp(`^(?:anoche |ayer |hoy )?dormi (?:como |unas |solo |apenas )?(\\d+(?:[.,]\\d+)?|${NUM_RE}) horas?( y media| y cuarto)?`));
    if (dormi) {
      const h = (num(dormi[1]) ?? Number(dormi[1].replace(",", "."))) + (dormi[2] === " y media" ? 0.5 : dormi[2] ? 0.25 : 0);
      if (h > 0 && h <= 16) return { tool: "registrar_dia", args: { sueno: h } };
    }
    const agua = t.match(new RegExp(`^(?:ya )?(?:tome|me tome|anota) (?:(\\d+|${NUM_RE}) )?(?:vasos?|botellas?)? ?(?:de )?agua\\b`));
    if (agua) return { tool: "registrar_dia", args: { agua_suma: (num(agua[1]) || 1) * (/botella/.test(t) ? 2 : 1) } };
    const animo = t.match(/^(?:ya )?(?:hoy )?(?:me siento|me senti|ando|estoy|me encuentro|quede|amaneci)( muy| super| re| bastante| mas o menos| medio| un poco)? (bien|mal|normal|feliz|contento|triste|bajoneado|bajon|chato|aburrido|pesimo|increible|la raja|filete|bacan|piola|tranqui|tranquilo|como el pico|como las weas|para la caga|pal pico|pal gato|hecho bolsa|hecho pico|enfermo|resfriado|con sueno|cansado|reventado|muerto|sin pilas|con energia|a full|motivado|prendido|estresado|colapsado|ansioso)$/);
    if (animo) {
      const w = animo[2];
      const muy = /muy|super|bastante/.test(animo[1] || "");
      if (/cansado|reventado|muerto|sin pilas|con sueno|enfermo|resfriado|hecho bolsa/.test(w)) return { tool: "registrar_dia", args: { energia: /reventado|muerto|enfermo|hecho bolsa/.test(w) || muy ? 1 : 2 } };
      if (/con energia|a full|motivado|prendido/.test(w)) return { tool: "registrar_dia", args: { energia: 5 } };
      const v = /pesimo|pico|weas|caga|gato/.test(w) ? 1 : /mal|triste|bajoneado|bajon|chato|aburrido|estresado|colapsado|ansioso/.test(w) ? (muy ? 1 : 2) : /normal/.test(w) || /mas o menos|medio/.test(animo[1] || "") ? 3 : /increible|la raja|filete|bacan|feliz/.test(w) || muy ? 5 : 4;
      return { tool: "registrar_dia", args: { animo: v } };
    }
    if (/\b(como|cuanto) (dormi|he dormido|duermo|estoy durmiendo)\b|\bcomo (ando|voy|estoy) (de|con el|con mi) (sueno|animo|energia|bienestar)\b|\bmi bienestar\b/.test(t))
      return { tool: "consultar_bienestar", args: { periodo: /\bsemana\b/.test(t) ? "semana" : /\bmes\b/.test(t) ? "mes" : "hoy" } };
    const esc = t.match(/^(?:mi )?(animo|energia) (?:de |en |es )?(\d)(?: de 5)?$/);
    if (esc && Number(esc[2]) >= 1 && Number(esc[2]) <= 5) return { tool: "registrar_dia", args: { [esc[1]]: Number(esc[2]) } };
    const nuevo = raw.match(/^(?:crea|crear|agrega|agregar|añade|nuevo|ponme|quiero)\s+(?:un\s+)?(?:el\s+)?(?:nuevo\s+)?h[aá]bito\s*(?:de\s+|:\s*)?(.+)$/);
    if (nuevo) {
      const resto = suave(nuevo[1]);
      const dias = /de lunes a viernes|dias de semana|en la semana/.test(resto) ? [0, 1, 2, 3, 4] : /fines? de semana/.test(resto) ? [5, 6] : [];
      const nombre = resto.replace(/\s*(todos los dias|cada dia|diario|de lunes a viernes|dias de semana|en la semana|los fines? de semana|fines? de semana)$/, "").trim();
      if (nombre) return { tool: "crear_habito", args: { nombre, dias } };
    }
    const marca = t.match(/^(?:ya )?(?:marca|tacha|cumpli|hice|complete)\s+(?:el |mi )?habito\s+(?:de\s+)?(.+)$/);
    if (marca) return { tool: "marcar_habito", args: { nombre: marca[1] } };
    // "ya leí" / "cumplí estirar": si calza con un hábito (y no con la rutina), se marca el hábito.
    const suelto = t.match(/^(?:ya )?(?:hice|cumpli|complete|termine|tache)\s+(?:el |la |de |mi )?(.+)$/);
    // "ya hice el gym y el inglés": cada cosa va donde corresponde (rutina, hábito o entreno).
    if (suelto && / (y|e) |, /.test(suelto[1]) && ctx.habitos?.length) {
      const partes = suelto[1].split(/\s*(?:,|\by\b|\be\b|\btambien\b)\s*/).map((x) => x.replace(/^(el|la|los|las|de|mi) /, "").trim()).filter(Boolean);
      const enHab = partes.filter((q) => ctx.habitos!.some((x) => parecido(q, suave(x))) && !(ctx.rutina || []).some((r) => parecido(q, suave(r))));
      if (enHab.length && partes.length > 1) {
        const cmds = partes.map((q) =>
          enHab.includes(q) ? { tool: "marcar_habito", args: { nombre: ctx.habitos!.find((x) => parecido(q, suave(x)))! } } : (ctx.rutina || []).some((r) => parecido(q, suave(r))) || !new RegExp(`^(${ENTRENO})$`).test(q) ? { tool: "tachar_tarea", args: { titulo: q } } : { tool: "registrar_entreno", args: { tipo: q } },
        );
        return { tool: "__varios", args: { cmds } };
      }
    }
    if (suelto && ctx.habitos?.length) {
      const q = suelto[1];
      const h = ctx.habitos.find((x) => parecido(q, suave(x)));
      if (h && !(ctx.rutina || []).some((r) => parecido(q, suave(r)))) return { tool: "marcar_habito", args: { nombre: h } };
    }
  }

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
  if (!preg && /\bgol(es)?\b|\basistencias?\b|^(ganamos|perdimos|empatamos)\b|\bjugue\b.*\b(minutos|partido)\b|^jugue (?:los |como |unos )?\d{2,3}\b/.test(resto) && !/\b(llevo|tengo|cuantos)\b/.test(resto)) {
    const args: Record<string, unknown> = {};
    const g = resto.match(new RegExp(`\\b(\\d+|${NUM_RE}) (?:gol|goles|golazos?)\\b`));
    if (g) args.goles = num(g[1]);
    else if (/\b(meti|hice|marque|anote|convierti) (el |un )?gol(azo)?\b/.test(resto)) args.goles = 1;
    const a = resto.match(new RegExp(`\\b(\\d+|${NUM_RE}) asistencias?\\b`));
    if (a) args.asistencias = num(a[1]);
    else if (/\b(di|hice|tuve) (la )?asistencia\b/.test(resto)) args.asistencias = 1;
    const min = resto.match(/\b(\d+) (?:minutos|min)\b/) || resto.match(/\bjugue (?:los |como |unos )?(\d{2,3})\b/);
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

  // ---------- Ejercicios sueltos: "hice press banca 4 de 8 con 50 kilos" ----------
  if (!preg && /\b(\d+ ?(x|por) ?\d+|\d+ (series|serie|sets?)|\d+ de \d+ con|repeticiones|reps)\b/.test(resto) && !new RegExp(`^(?:ya )?(?:hice|fui al?|termine|complete|entrene|tuve)\\s+(?:el |la |mi )?(?:rutina de |sesion de |entrenamiento de )?(?:${ENTRENO})\\b`).test(resto)) {
    const ejs = parseEjercicios(resto);
    if (ejs.length && !/\b(km|kilometros|minutos)\b/.test(resto)) return { tool: "agregar_ejercicios", args: { ejercicios: ejs } };
  }

  // ---------- Entreno ----------
  // "hice gym", "fui al gimnasio", "entrené pierna", "salí a correr 5 km", "corrí 30 minutos"
  if (!preg) {
    const e =
      resto.match(new RegExp(`^(?:ya )?(?:hice|fui al?|termine|complete|entrene|tuve)\\s+(?:el |la |mi )?(?:rutina de |sesion de |entrenamiento de )?(${ENTRENO})\\b(.*)$`)) ||
      resto.match(/^(?:ya )?(?:entrene|sali a correr|fui a correr|corri|sali a trotar|fui a trotar|trote|nade|fui a nadar|sali en bici|anduve en bici|pedalee|camine)\b(.*)$/);
    // "ya hice el gym y el inglés": son varias tareas de la rutina, eso lo resuelve el intérprete de la rutina.
    if (e && /^\s*(y|e|,|tambien)\s/.test((e.length > 2 ? e[2] : e[1]) || "")) return null;
    if (e) {
      const que = e.length > 2 ? e[1] : /trot/.test(resto) ? "trote" : /corr/.test(resto) ? "correr" : /nad/.test(resto) ? "natación" : /bici|pedal/.test(resto) ? "bici" : /camin/.test(resto) ? "caminata" : "entrenamiento";
      const extra = (e.length > 2 ? e[2] : e[1]) || "";
      // Cardio (km, minutos) o fuerza (ejercicios con series): lo que calce.
      const c0 = cardio(extra);
      const esCardioX = !!(c0.km || c0.minutos || c0.calorias) || /corr|trot|nad|bici|camin/.test(que);
      const ejs = esCardioX ? [] : parseEjercicios(extra);
      const c = ejs.length ? {} : c0;
      const rpe = extra.match(/\b(?:esfuerzo|rpe|intensidad) (?:de )?(\d{1,2})\b/);
      return {
        tool: "registrar_entreno",
        args: conFecha({
          tipo: que,
          ...c,
          ...(ejs.length ? { ejercicios: ejs } : {}),
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

  // ---------- Bitácora de tiempo ----------
  if (!preg) {
    // Terminar lo que corre: "terminé", "listo", "paré", "me desperté".
    if (ctx.corriendo && (/^(ya )?(termine|listo|pare|acabe|fin|stop|deje)( ya)?( de \w+( \w+)?)?$/.test(t) || (ctx.corriendo === "sueno" && /^(me desperte|desperte|buenos dias)$/.test(t))))
      return { tool: "terminar_actividad", args: {} };
    // Un bloque con horas: "de 14 a 16 estuve estudiando", "estuve en el celular de 22 a 23:30", "dormí de 23:30 a 7".
    let b = t.match(new RegExp(`^(?:de|desde) (?:las )?${HORA_RE} (?:a|hasta) (?:las )?${HORA_RE} (?:estuve |fui |hice |me puse a |estaba )?(.+)$`));
    if (b) {
      const ini = parseHour(b[1]);
      const fin = parseHour(b[2]);
      if (ini && fin) return { tool: "registrar_bloque", args: { texto: b[3], inicio: ini, fin } };
    }
    b = t.match(new RegExp(`^(?:estuve|hice|fui|pase|dormi|estudie|vi|jugue)\\s*(.*?) (?:de|desde) (?:las )?${HORA_RE} (?:a|hasta) (?:las )?${HORA_RE}$`));
    if (b) {
      const ini = parseHour(b[2]);
      const fin = parseHour(b[3]);
      const verbo = t.split(" ")[0];
      if (ini && fin) return { tool: "registrar_bloque", args: { texto: `${verbo} ${b[1]}`.trim(), inicio: ini, fin } };
    }
    // Un rato que ya pasó: "estuve 2 horas en el celular", "pasé una hora viendo series".
    b = t.match(new RegExp(`^(?:estuve|pase|me pase|llevo)\\s+(?:como |unas? )?(\\d+(?:[.,]\\d+)?|${NUM_RE}|media) (horas?|minutos|min)( y media)? (.+)$`));
    if (b) {
      const base = b[1] === "media" ? 0.5 : num(b[1]) ?? Number(b[1].replace(",", "."));
      const minutos = Math.round(/hora/.test(b[2]) ? base * 60 + (b[3] ? 30 : 0) : base);
      if (minutos > 0) return { tool: "registrar_bloque", args: { texto: b[4], minutos } };
    }
    // Empezar algo ahora: "empecé a estudiar", "me pongo a ordenar", "estoy en el gym", "me voy a dormir".
    b =
      t.match(/^(?:ya )?(?:empece|empiezo|comence|comienzo|me pongo|me puse|parto|parti) (?:a |con )(.+)$/) ||
      t.match(/^(?:ya )?(?:llegue|entre) (?:al |a la |a )(gym|gimnasio|trabajo|turno|la pega|pega|clases?|entrenamiento|la u|universidad|colegio)$/) ||
      t.match(/^(?:me voy|voy|ya me voy) a (dormir|acostarme|acostar|la cama|tuto|hacer tuto|almorzar|comer|cenar|tomar once|entrenar|estudiar|trabajar|correr|jugar .+|ver .+|leer.*)$/) ||
      t.match(/^estoy (?:en el |en la |en |)(gym|gimnasio|trabajo|turno|la pega|clases?|el partido|entrenamiento|la micro|el bus|camino .+|estudiando.*|trabajando.*|entrenando.*|comiendo.*|almorzando.*|viendo .+|jugando .+|ordenando.*|limpiando.*|leyendo.*|con (?:mis |la |el )?(?:amigos|familia|polola|pololo).*)$/);
    if (b) return { tool: "iniciar_actividad", args: { texto: b[1] } };
  }

  return null;
}

const NUMS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, diez: 10, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50 };
// "hace 10 minutos", "desde hace 2 horas", "hace 1 hora y media" → minutos atrás y el resto de la frase.
export function haceCuanto(text: string): { minutos: number; resto: string } | null {
  const re = /\s*,?\s*\b(?:desde )?hace (?:como |unos |unas )?(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|diez|quince|veinte|treinta|cuarenta|cincuenta) (minutos?|mins?|horas?|hrs?)( y media)?\b\s*,?/i;
  const m = text.match(re);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMS[m[1].toLowerCase()];
  const minutos = /^h/i.test(m[2]) ? n * 60 + (m[3] ? 30 : 0) : n;
  const resto = text.replace(re, " ").replace(/\s+/g, " ").trim();
  return minutos > 0 && minutos < 24 * 60 && resto ? { minutos, resto } : null;
}

// "2 kilómetros, 89" / "2,89 km" / "2 coma 89 km"; "19 minutos 35 segundos" / "19:35"; "234 calorías".
export function cardio(x: string): { km?: number; minutos?: number; segundos?: number; calorias?: number } {
  const out: { km?: number; minutos?: number; segundos?: number; calorias?: number } = {};
  const km =
    x.match(/\b(\d+)(?:[.,]| coma )(\d+) ?(?:km|kms|kilometros?|k)\b/) ||
    x.match(/\b(\d+) ?(?:km|kms|kilometros?|k)(?:,| con| coma)? (\d{1,3})\b(?! ?(?:minutos?|min|segundos?|seg|calorias|kcal|horas?))/) ||
    x.match(/\b(\d+) ?(?:km|kms|kilometros?)\b/) ||
    x.match(/\b(\d+) ?(?:mil )?metros\b/);
  if (km) {
    if (/metros/.test(km[0]) && !/kilo/.test(km[0])) out.km = Number(km[1]) / (/mil/.test(km[0]) ? 1 : 1000);
    else out.km = km[2] ? Number(`${km[1]}.${km[2]}`) : Number(km[1]);
  }
  const reloj = x.match(/\b(?:en|tarde|demore|me demore|tiempo(?: de)?)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  const ms = x.match(/\b(\d+) ?(?:minutos?|mins?)(?:,| y| con)? ?(?:(\d+) ?(?:segundos?|seg|s)\b)?/);
  const hs = x.match(/\b(una|1|\d+) ?horas?( y media)?\b/);
  if (reloj && !/\ba las?\b/.test(x.slice(Math.max(0, (reloj.index || 0) - 6), (reloj.index || 0) + 1))) {
    if (reloj[3]) {
      out.minutos = Number(reloj[1]) * 60 + Number(reloj[2]);
      out.segundos = Number(reloj[3]);
    } else {
      out.minutos = Number(reloj[1]);
      out.segundos = Number(reloj[2]);
    }
  } else if (ms) {
    out.minutos = Number(ms[1]);
    if (ms[2]) out.segundos = Number(ms[2]);
  }
  if (hs && !reloj) out.minutos = (out.minutos || 0) + (hs[1] === "una" ? 1 : Number(hs[1])) * 60 + (hs[2] ? 30 : 0);
  const kcal = x.match(/\b(\d{2,4}) ?(?:calorias|kcal|cal)\b/);
  if (kcal) out.calorias = Number(kcal[1]);
  return out;
}

// Lo que dices en pasado → el bloque de Mi Día que corresponde (si está en tu rutina).
const MI_DIA: [RegExp, string][] = [
  [/\b(saque|pasee|saqué|paseé|ya salio|salio|salí con|sali con)\b.*\b(perro|perrita|perrito|apolo|mascota|gato)\b|\b(perro|apolo|mascota)\b.*\b(salio|paseo|ya salio)\b/, "Sacar al perro"],
  [/\b(me tome|tome|tomé|me tomé|hice) (el |mi )?batido\b/, "Batido: proteína + avena"],
  [/\b(almorce|almorcé|ya almorce)\b/, "Almuerzo"],
  [/\b(desayune|desayuné|tome la creatina|tomé la creatina|me tome la creatina)\b/, "Despertar + desayuno + creatina"],
  [/\b(tome|tomé|comi|comí) (la |mi )?colacion\b|\bcolacion lista\b/, "Colación"],
  [/\b(tome once|tomé once|ya tome once|cene|cené)\b/, "Once / comida"],
  [/\b(dormi|dormí|tome|tomé|hice) (la |una )?siesta\b/, "Siesta 20–30 min"],
  [/\b(lave la loza|lavé la loza|aspire|aspiré|ordene la casa|ordené la casa|me duche|me duché)\b/, "Casa + ducha"],
  [/\b(estire|estiré|hice core|hice el core)\b/, "Estirar + core"],
  [/\b(busque pega|busqué pega|postule|postulé|mande curriculum|mandé currículum|mande cv)\b/, "Buscar pega / proyectos"],
  [/\b(deje el celular|dejé el celular|guarde el celular|guardé el celular)\b/, "Celular fuera"],
];
function bloqueMiDia(t: string, rutina: string[]): string | null {
  if (/\?|^(que|cuando|a que hora)\b|\b(tengo que|hay que|debo|recuerdame|avisame)\b/.test(t)) return null;
  for (const [re, titulo] of MI_DIA) if (re.test(t) && rutina.some((r) => suave(r.toLowerCase()) === suave(titulo.toLowerCase()))) return titulo;
  return null;
}
