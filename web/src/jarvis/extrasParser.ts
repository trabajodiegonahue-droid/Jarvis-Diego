// Intérprete local para recordatorios, memoria, fechas importantes, lista de compras,
// simulador de metas, semana difícil y logros. Se prueba antes que el resto.
import { MESES, p2 } from "../core/texto";
import type { LocalCommand } from "../brain/commands";
import { montoEn } from "./vidaParser";
import { original } from "../reminders/calc";

export interface CtxExtras {
  compras?: string[]; // lo que está en la lista
  dificil?: boolean; // si está en modo semana difícil
}

const suave = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!"]/g, " ").replace(/[.,;:](?!\d)/g, " ").replace(/\s+/g, " ").trim();
// Nombres con mayúscula ("la Cata", "del Benja"), pero no los parentescos ni los artículos ("mi mamá").
const COMUNES = /^(de|del|la|el|mi|mis|los|las|y|mama|mamá|papa|papá|abuela|abuelo|abue|hermana|hermano|tia|tía|tio|tío|polola|pololo|prima|primo|amiga|amigo|jefe|jefa|suegra|suegro|sobrina|sobrino|madrina|padrino|novia|novio|pareja)$/i;
const nombrePropio = (s: string) => s.split(" ").map((w) => (COMUNES.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
const lista = (s: string) =>
  s
    .split(/\s*(?:,|\by\b|\be\b|\bmas\b|\btambien\b)\s*/)
    .map((x) => x.replace(/^(un|una|unos|unas|el|la|los|las|de|del|harto|harta)\s+/, "").trim())
    .filter((x) => x && x.length < 40);

// "3 de mayo", "3/5", "03-05" → MM-DD (y año si viene: "3 de mayo de 1970")
function diaMes(t: string): { dia: string; anio?: number } | null {
  let m = t.match(new RegExp(`\\b(\\d{1,2}) de (${MESES.join("|")})(?: (?:de|del) (\\d{4}))?\\b`));
  if (m) return { dia: `${p2(MESES.indexOf(m[2]) + 1)}-${p2(Number(m[1]))}`, ...(m[3] ? { anio: Number(m[3]) } : {}) };
  m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/);
  if (m && Number(m[2]) <= 12 && Number(m[1]) <= 31) return { dia: `${p2(Number(m[2]))}-${p2(Number(m[1]))}`, ...(m[3] ? { anio: Number(m[3]) } : {}) };
  return null;
}

export function parseExtras(text: string, ctx: CtxExtras = {}): LocalCommand | null {
  const raw = text.replace(/^\s*((oye|oe|hola|wena)[,!\s]+)*(jarvis[,!\s]*)?/i, "").trim();
  const t = suave(raw);
  if (!t) return null;
  let m: RegExpMatchArray | null;

  // ---------- Recordatorios ----------
  if ((m = t.match(/^(?:ya )?(?:recuerdame|recordarme|recuerdeme|avisame|avisarme|no me dejes olvidar|ponme un recordatorio|pon un recordatorio|crea un recordatorio|haz un recordatorio|recordatorio)\s+(?:de |para |que |a )?(.+)$/))) {
    const resto = m[1];
    const texto = resto
      .replace(/\b(?:pasado manana|manana|hoy|esta (?:tarde|noche)|en \S+ (?:minutos?|min|horas?)(?: y media)?|(?:el |este |para el )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: que viene)?|(?:todos los|cada) \S+|todas las \S+|(?:el )?\d{1,2} de \w+(?: de \d{4})?|(?:a las?|tipo|como a las?|para las?) \d{1,2}(?:[:.]\d{2})?(?: ?(?:hrs?|horas|h))?(?: de la (?:manana|tarde|noche)| am| pm)?|(?:en|por) la (?:manana|tarde|noche)|al mediodia|la proxima semana)\b/g, " ")
      .trim()
      .replace(/^(?:que |de |para |a )+/, "")
      .replace(/\s+(?:de|para|que|a)$/, "")
      .replace(/\s+/g, " ")
      .trim();
    return { tool: "crear_recordatorio", args: { texto: original(raw, texto || resto), cuando: resto } };
  }
  if (/^(?:que |cuales )?(?:recordatorios tengo|son mis recordatorios)$|^(mis|ver|los) recordatorios$|^que me (tienes que|vas a) recordar$/.test(t)) return { tool: "ver_recordatorios", args: {} };
  if ((m = t.match(/^(?:borra|quita|elimina|cancela)(?: el)? recordatorio (?:de |del |para )?(.+)$/))) return { tool: "borrar_recordatorio", args: { texto: m[1] } };

  // ---------- Lo que viene ----------
  if (/\b(que (se )?viene|que tengo|que hay)( para)? (los )?(proximos|siguientes) (dias|\d+ dias)\b|\bque se (me )?viene\b|\blo que viene\b/.test(t)) {
    const n = t.match(/\b(\d+) dias\b/);
    return { tool: "lo_que_viene", args: { dias: n ? Number(n[1]) : /semana/.test(t) ? 7 : 3 } };
  }

  // ---------- Memoria ----------
  if ((m = t.match(/^(?:acuerdate|acordate|recuerda|no olvides|ten en cuenta|toma nota|guarda en tu memoria|anota en tu memoria|para que sepas)\s+(?:de\s+)?(?:que\s+)?(.+)$/)) && !/^(a |de )?(las? )?\d/.test(m[1]))
    return { tool: "recordar", args: { texto: raw.replace(/^.*?(?:acuérdate|acuerdate|acordate|recuerda|no olvides|ten en cuenta|toma nota|guarda en tu memoria|anota en tu memoria|para que sepas)\s+(?:de\s+)?(?:que\s+)?/i, "") } };
  if (/^que (recuerdas|te acuerdas|sabes que te he contado|te he contado)\b|^que tienes en (tu )?memoria$|^tu memoria$/.test(t)) return { tool: "que_recuerdas", args: {} };
  if ((m = t.match(/^(?:olvida|olvidate de|borra de tu memoria|ya no recuerdes)\s+(?:lo del |lo de la |lo de |que |lo que )?(.+)$/))) return { tool: "olvidar", args: { texto: m[1] } };

  // ---------- Fechas importantes ----------
  if ((m = t.match(/^(?:anota |guarda |agrega )?(?:el )?(cumpleanos|cumple|aniversario)( de| del| de la| con)? (.+?) (?:es|cae|sera)? ?(?:el )?(\d.*)$/))) {
    const tipo = /cumple/.test(m[1]) ? "cumple" : "aniversario";
    const quien = nombrePropio(original(raw, m[3].replace(/\s+(es|cae)$/, "").trim()));
    const prep = (m[2] || " de").trim();
    const dm = diaMes(m[4]);
    if (dm && quien) return { tool: "agregar_fecha", args: { nombre: tipo === "cumple" ? `Cumpleaños ${prep} ${quien}` : `Aniversario ${prep} ${quien}`, dia: dm.dia, tipo, ...(dm.anio ? { anio: dm.anio } : {}) } };
  }
  if ((m = t.match(/^(.+?) (?:esta|estara) de (?:cumpleanos|cumple) (?:el )?(\d.*)$/))) {
    const dm = diaMes(m[2]);
    if (dm) return { tool: "agregar_fecha", args: { nombre: `Cumpleaños de ${nombrePropio(original(raw, m[1]))}`, dia: dm.dia, tipo: "cumple", ...(dm.anio ? { anio: dm.anio } : {}) } };
  }
  if ((m = t.match(/^cuando (?:es|cae|esta de) (?:el )?(?:cumpleanos|cumple|aniversario)(?: de| con)? (.+)$/))) return { tool: "proximas_fechas", args: { nombre: m[1] } };
  if (/\b(proximos|que) (cumpleanos|cumples|fechas importantes)\b|^(mis )?fechas importantes$/.test(t)) return { tool: "proximas_fechas", args: {} };

  // ---------- Lista de compras ----------
  const tc = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[¿?¡!".]/g, " ").replace(/\s+/g, " ").trim();
  if ((m = tc.match(/^(?:agrega|agregame|anota|anotame|pon|ponme|suma|mete)\s+(.+?)\s+(?:a|en) la lista(?: de (?:compras|las compras|del super|supermercado))?$/)) || (m = tc.match(/^(?:hay que comprar|tengo que comprar|me falta comprar|falta comprar)\s+(.+)$/)))
    return { tool: "agregar_compras", args: { cosas: lista(m[1]).map((c) => original(raw, c)) } };
  if (/^(?:que hay en |ver |mi |la )?lista(?: de (?:compras|las compras|del super))?$|^que (?:hay en la lista|tengo que comprar|me falta comprar)$|^que dice la lista$/.test(t)) return { tool: "ver_compras", args: {} };
  if (/^(?:ya )?(?:compre todo|borra la lista|vacia la lista|limpia la lista)$/.test(t)) return { tool: "marcar_compras", args: { todo: true } };
  if ((m = tc.match(/^(?:ya )?(?:compre|tengo|saca de la lista|tacha de la lista|tacha)\s+(?:el |la |los |las )?(.+)$/)) && ctx.compras?.length && !montoEn(m[1])) {
    const cosas = lista(m[1]);
    const en = cosas.filter((c) => ctx.compras!.some((x) => suave(x).includes(c) || c.includes(suave(x))));
    if (en.length) return { tool: "marcar_compras", args: { cosas: en } };
  }

  // ---------- Simulador de metas ----------
  if ((m = t.match(/^si (?:ahorro|guardo|junto|pongo|ahorrara|ahorrase) (.+?) (?:al|por|cada) mes\b(.*)$/))) {
    const v = montoEn(m[1]);
    const meta = m[2].match(/\b(?:a|la|para la|para) meta (?:de |del )?(.+)$|\bpara (?:el |la )?(.+)$/);
    if (v) return { tool: "simular_meta", args: { por_mes: v.valor, ...(meta ? { meta: (meta[1] || meta[2]).replace(/^(llegar a |juntar )/, "") } : {}) } };
  }
  if ((m = t.match(/^cuanto (?:tengo|debo|necesito) (?:que )?(?:ahorrar|juntar|guardar) (?:al|por|cada) mes(?: para (?:la meta )?(?:de |del )?(.+))?$/))) return { tool: "simular_meta", args: { por_mes: 0, ...(m[1] ? { meta: m[1] } : {}) } };

  // ---------- Semana difícil ----------
  if (/^(?:(?:estoy|ando|tengo|vengo) (?:en |con |de )?(?:una )?semana (?:dificil|pesada|complicada|mala|brigida|terrible)|(?:activa |pon |ponme )?(?:el )?modo semana dificil|semana dificil)$/.test(t)) return { tool: "semana_dificil", args: { activar: true } };
  if (/^(?:desactiva|quita|saca|apaga) (?:el )?modo semana dificil$|^(?:ya )?(?:volvi a|vuelvo a) (?:la normalidad|lo normal|mi ritmo)$/.test(t) || (ctx.dificil && /^ya (?:estoy|ando|me siento) (?:bien|mejor)$/.test(t)))
    return { tool: "semana_dificil", args: { activar: false } };

  // ---------- Áreas de la vida ----------
  {
    const AREA: [string, RegExp][] = [["salud", /salud/], ["animo", /animo|mente/], ["dinero", /dinero|plata|finanzas/], ["amor", /amor|pololeo|pareja|polola|pololo/], ["social", /familia|amigos|amistades/], ["entreno", /entrenamiento|gym|gimnasio/], ["futbol", /futbol/], ["estudios", /estudios|ingles|universidad/], ["trabajo", /trabajo|pega/], ["casa", /casa|tramites/], ["metas", /metas|proyectos/], ["ocio", /ocio|hobbies|pasatiempos/]];
    const q = t.match(/^(?:que (?:he contado|te he contado|tengo|anote|hay) (?:de|en|sobre) (?:mi |la |el )?|(?:mi )?area de |como (?:voy|va|ando|anda|esta|estoy) (?:en|con) (?:mi |la |el )?)(.+)$/);
    if (q) {
      const a = AREA.find(([, re]) => re.test(q[1]));
      // "cómo voy con la plata / las metas / el fútbol" ya tienen su propia respuesta, más completa.
      const propia = /^como/.test(t) && a && ["dinero", "metas", "futbol", "entreno", "estudios"].includes(a[0]);
      if (a && !propia) return { tool: "ver_area", args: { area: a[0] } };
    }
    const n = raw.match(/^(?:anota|guarda|pon)\s+en\s+(?:mi\s+|el\s+área\s+de\s+|el\s+area\s+de\s+)?(\S+(?:\s+y\s+\S+)?)\s*(?::|que)\s*(.+)$/i);
    if (n) {
      const a = AREA.find(([, re]) => re.test(suave(n[1])));
      if (a) return { tool: "anotar_en_area", args: { area: a[0], texto: n[2] } };
    }
  }

  // ---------- Logros ----------
  if (/^(?:mis |que |ver )?logros(?: tengo)?$|^que he logrado$/.test(t)) return { tool: "ver_logros", args: {} };
  return null;
}
