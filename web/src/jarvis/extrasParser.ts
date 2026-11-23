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
  let t = suave(raw);
  if (!t) return null;
  let m: RegExpMatchArray | null;

  // ---------- Recordatorios ----------
  // Otras formas de pedir un aviso: "quiero que me envíes un recordatorio…", "ponme una alarma…", "agenda X a las 4".
  {
    const alt = t.match(/^(?:quiero que me |necesito que me |puedes |podrias |me puedes )?(?:envies|mandes|pongas|hagas|crees|enviar|mandar|poner|hacer|crear|envia|manda|pon|haz|crea|ponme|hazme|creame|mandame|enviame) (?:un |una )?(?:recordatorio|aviso|alarma|notificacion)\s+(?:de |para |que |a (?!las?\b))?(.+)$/) || t.match(/^(?:agenda|agendame|anota en la agenda|pon en la agenda)\s+(?:que |para )?(.+)$/);
    if (alt && /\b(a las?|en \d+|manana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo|ahora|altiro)\b/.test(alt[1])) t = `recuerdame ${alt[1]}`;
  }
  if ((m = t.match(/^(?:ya )?(?:recuerdame|recordarme|recuerdeme|avisame|avisarme|no me dejes olvidar|ponme un recordatorio|pon un recordatorio|crea un recordatorio|haz un recordatorio|recordatorio)\s+(?:de |para |que |a (?!las?\b))?(.+)$/))) {
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

  // ---------- Agenda: "tengo fútbol a las 3:30 y a las 5 gimnasio" ----------
  // Cada cosa con su hora queda como un aviso aparte (y cada una en su área).
  const agenda = parseAgenda(raw, t) || parsePendiente(raw, t);
  if (agenda) return agenda;

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

  // ---------- Buscar en lo que contó ----------
  if ((m = t.match(/^(?:que (?:te )?(?:dije|conte|anote|he dicho|he contado) (?:de|sobre|del|de la|de los|acerca de) |cuando fue la ultima vez que |busca en (?:mis notas|mi vida|lo que te dije) |cuando (?:fue que |)(?:me |fui |jugue |vi |sali |compre |pague )?)(.+)$/)) && !/\b(manana|hoy|el (lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/.test(t))
    return { tool: "buscar_en_mi_vida", args: { texto: m[1] } };

  // ---------- Logros ----------
  if (/^(?:mis |que |ver )?logros(?: tengo)?$|^que he logrado$/.test(t)) return { tool: "ver_logros", args: {} };
  return null;
}

const HORA_RE = /(?:(?:a las?|tipo|como a las?|para las?|desde las?) (\d{1,2}(?:[:.]\d{2})?|una)(?: y media)?(?: ?(?:hrs?|horas|h)\b)?(?: de la (?:manana|tarde|noche)| am\b| pm\b)?|\ben (?:\d+|un|una|dos|tres|cinco|diez|quince|veinte|treinta) (?:minutos?|min|horas?)(?: y media)?\b)/;
const DIA_RE = /\b(pasado manana|manana|hoy|esta (?:tarde|noche)|(?:el |este )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: que viene)?|(?:el )?\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))\b/;

export function parseAgenda(raw: string, t: string): LocalCommand | null {
  if (!/\b(tengo|me toca|voy a|voy al|hay|nos juntamos|juego|entreno)\b/.test(t) || /\?|^(que|a que|cuando|donde|cuanto)\b/.test(t)) return null;
  if (!HORA_RE.test(t)) return null;
  const dia = (t.match(DIA_RE) || [])[1] || "";
  // Trozos separados por "y", "," o "después"; un trozo sin hora se junta con el siguiente.
  const trozos = t.split(/\s*(?:,|\by despues\b|\bdespues\b|\by luego\b|\bluego\b|\by\b(?= (?:a las?|tipo|como|para las?|el |la |los |las |tengo|me toca|voy|al |un |una |[a-z]+ a las?)))\s*/).filter(Boolean);
  const partes: { titulo: string; hora: string }[] = [];
  let pend = "";
  for (const tr of trozos) {
    const x = (pend ? `${pend} y ${tr}` : tr).trim();
    const h = x.match(HORA_RE);
    if (!h) {
      pend = x;
      continue;
    }
    pend = "";
    const titulo = x
      .replace(HORA_RE, " ")
      .replace(DIA_RE, " ")
      .replace(/\b(tengo que ir a|tengo que ir al|tengo|me toca|voy a ir a|voy al|voy a|hay|ir a)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:(?:de|que|el|la|a|al|un|una|y)\s+)+/, "")
      .replace(/\s+(?:de|que|a|y|el|la)$/, "")
      .trim();
    partes.push({ titulo, hora: h[0] });
  }
  // Una hora suelta sin nada antes ("a las 5 tengo de gimnasio" ya quedó bien; esto es por si el nombre quedó en el trozo anterior).
  const ok = partes.filter((p) => p.titulo.length >= 2);
  if (!ok.length || ok.length !== partes.length) return null;
  const cmds = ok.map((p) => ({ tool: "crear_recordatorio", args: { texto: conTildes(original(raw, p.titulo)), cuando: `${dia ? dia + " " : ""}${p.hora}`, agenda: true } }));
  return cmds.length === 1 ? cmds[0] : { tool: "__varios", args: { cmds } };
}

const TILDES: Record<string, string> = { futbol: "fútbol", ingles: "inglés", mama: "mamá", papa: "papá", reunion: "reunión", medico: "médico", dentista: "dentista", kinesiologo: "kinesiólogo", clase: "clase", examen: "examen", musica: "música", nataci: "natación" };
const conTildes = (s: string) => s.replace(/\b[a-z]+\b/g, (w) => TILDES[w] || w);

// "tengo que sacar la caca del Apolo ahora", "debo pagar la luz mañana": un pendiente con aviso.
const CUANDO_PENDIENTE: [RegExp, string][] = [
  [/\b(ahora ya|ahora mismo|ya mismo|ahorita|ahora|altiro|al tiro|enseguida)\b/, "en 10 minutos"],
  [/\b(en un rato|en un ratito|mas rato|luego|despues|hoy)\b/, "en 1 hora"],
];
export function parsePendiente(raw: string, t: string): LocalCommand | null {
  const m = t.match(/^(?:ya )?(?:tengo que|tengo q|debo|necesito|me falta|hay que|me toca)\s+(.+)$/);
  if (!m || /\?/.test(raw)) return null;
  let resto = m[1];
  let cuando = "";
  for (const [re, c] of CUANDO_PENDIENTE)
    if (re.test(resto)) {
      cuando = c;
      resto = resto.replace(re, " ");
      break;
    }
  if (!cuando) {
    const d = resto.match(/\b(pasado manana|manana|esta (?:tarde|noche)|en la (?:manana|tarde|noche)|(?:el |este )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|en \S+ (?:minutos?|min|horas?))\b/);
    if (!d) return null; // sin cuándo: queda como nota en su área
    cuando = d[1];
    resto = resto.replace(d[0], " ");
  }
  const titulo = resto.replace(/\s+/g, " ").trim().replace(/\s+(?:de|que|a|y|el|la|po|nomas)$/, "");
  if (titulo.length < 2) return null;
  return { tool: "crear_recordatorio", args: { texto: conTildes(original(raw, titulo)), cuando, pendiente: true } };
}
