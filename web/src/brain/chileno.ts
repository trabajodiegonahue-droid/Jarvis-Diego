// Cómo escribe Diego en el chat: abreviaciones y muletillas chilenas.
// Antes de interpretar una frase, se traduce a español "de diccionario":
// "toy en el gym nms" → "estoy en el gym", "gaste 5 lukas x un completo" → "gaste 5 lucas por un completo".
// A Gemini se le manda la frase tal cual (la entiende), esto es para el intérprete del teléfono.

const sinTilde = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Palabra sola → cómo se lee. "" = muletilla, se saca.
const PALABRAS: Record<string, string> = {
  q: "que", k: "que", ke: "que", qe: "que", qu: "que",
  xq: "porque", pq: "porque", porq: "porque", xk: "porque", pk: "porque", porke: "porque",
  x: "por", d: "de", dl: "del", pa: "para", pal: "para el", pa_l: "para el",
  tb: "también", tmb: "también", tbn: "también", tamb: "también", tmbn: "también",
  mns: "menos", ms: "más",
  mñn: "mañana", mñna: "mañana", mna: "mañana", mnn: "mañana", mañn: "mañana",
  dsp: "después", dps: "después", desp: "después", dsps: "después",
  toy: "estoy", toi: "estoy", tamos: "estamos", ta: "está", tai: "estás", tay: "estás", tan: "están",
  cn: "con", xa: "para", tng: "tengo", tngo: "tengo", hr: "hora", hrs: "horas", celu: "celular", cel: "celular", insta: "instagram", tele: "tele", bkn: "bacán",
  kiero: "quiero", qiero: "quiero", nd: "nada", ns: "no sé", bn: "bien", grax: "gracias", gracia: "gracias",
  altiro: "al tiro", oe: "oye", oie: "oye", msj: "mensaje", hoydia: "hoy", ayr: "ayer", aier: "ayer",
  lukas: "lucas", luka: "luca", lks: "lucas", lk: "luca",
  sipo: "sí", sip: "sí", sii: "sí", siii: "sí", simon: "sí", nop: "no", nopo: "no", nah: "no", nica: "no",
  // muletillas
  nms: "", nomas: "", nomás: "", po: "", poh: "", pos: "", wn: "", weon: "", weón: "", hueon: "", huevon: "", wna: "", weona: "",
  cachai: "", cachay: "", wena: "", weena: "", xd: "", ctm: "", csm: "", ql: "", porfa: "", porfis: "", xfa: "", pls: "", plis: "", plz: "",
};

export function normalizarChileno(texto: string): string {
  let t = texto
    .split(/(\s+)/)
    .map((tok) => {
      if (/^\s+$/.test(tok)) return tok;
      const m = tok.match(/^([¿¡"'(]*)(.*?)([.,;:!?¿¡"')]*)$/);
      if (!m) return tok;
      const [, pre, core, post] = m;
      const k = sinTilde(core);
      const kn = core.toLowerCase();
      if (kn in PALABRAS) return PALABRAS[kn] ? pre + PALABRAS[kn] + post : post.replace(/[.,;:]/g, "");
      if (k in PALABRAS) return PALABRAS[k] ? pre + PALABRAS[k] + post : post.replace(/[.,;:]/g, "");
      if (/^ja(ja)+j?$|^je(je)+$|^xd+$/i.test(core)) return "";
      return tok;
    })
    .join("");
  t = t
    .replace(/\bno m[aá]s([.,!?]*)\s*$/i, "$1") // "anota eso no más"
    .replace(/\bya po\b/gi, "ya")
    // "cansao", "gastao", "reventao" → "cansado", "gastado", "reventado"
    .replace(/\b([a-zñ]{3,})ao\b/gi, (w, r) => (/^(bacal|cac|call|sar)$/i.test(r) ? w : `${r}ado`))
    // Tiempos relativos a una forma que JARVIS calcula: "dentro de media hora" → "en 30 minutos".
    // "a las cuatro" → "a las 4" (el dictado a veces escribe la hora en palabras).
    .replace(/\b(a las?|para las?|tipo|como a las?|desde las?|hasta las?) (una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\b/gi, (_, a, n) => `${a} ${["una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce"].indexOf(n.toLowerCase()) + 1}`)
    .replace(/\b(a las?|para las?|tipo|como a las?) (\d{1,2}) (\d{2})\b(?! ?(?:minutos?|min|horas?))/gi, "$1 $2:$3") // dictado: "15 16" = "15:16"
    .replace(/\bdentro de\b/gi, "en")
    .replace(/\b(?:una |1 )?hora y media\b/gi, "90 minutos")
    .replace(/\bmedia hora\b/gi, "30 minutos")
    .replace(/\b(?:un )?cuarto de hora\b/gi, "15 minutos")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.;:]+|[\s,;:]+$/g, "")
    .trim();
  return t;
}
