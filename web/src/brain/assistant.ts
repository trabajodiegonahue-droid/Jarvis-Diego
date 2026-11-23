import { hhmm } from "../core/texto";
import { HISTORY_KEEP, HISTORY_LIMIT } from "../config";
import { chileNow, parseHour, toMinutes, type ChileNow } from "../core/time";

import type { KV } from "../core/storage";
import { norm, type Routine, type Task } from "../routine/routine";
import type { ToolRegistry, ToolResult } from "../tools/registry";
import { joinY } from "../tools/routineTools";
import { fixVerb, isNo, isYes, parseCommand, type LocalCommand } from "./commands";
import { normalizarChileno } from "./chileno";
import { askGemini, GeminiError, streamGemini, type Connection, type Content, type Part } from "./gemini";
import { FRIENDLY, systemPrompt } from "./persona";

export interface Turn {
  role: "user" | "model";
  text: string;
}

export interface Reply {
  text: string;
  source: "local" | "gemini" | "error";
  error?: string;
  undo?: () => Promise<void> | void; // si la respuesta anotó algo, cómo deshacerlo
  guardado?: Guardado[]; // qué se guardó en este turno y dónde
}

export interface Guardado {
  area: string; // nombre del área ("Salud")
  id: string; // id del área ("salud")
  texto: string; // lo que se guardó
  seccion?: { nombre: string; ruta: string }; // dónde más quedó (Dinero, Hábitos…)
}

const sinUndo = ({ area, id, texto, seccion }: Guardado): Guardado => ({ area, id, texto, ...(seccion ? { seccion } : {}) });

export interface AssistantOptions {
  // Intérprete extra que se prueba antes que el de la rutina (en la app: plata, entrenos, fútbol, metas).
  parse?: (text: string, n: ChileNow) => LocalCommand | null;
  // Modo privado: las cifras de dinero no se le mandan a Gemini.
  privado?: () => boolean;
  // Contexto extra para Gemini según lo que dijo Diego (por ejemplo, los recuerdos que tienen que ver).
  contexto?: (texto: string, n: ChileNow) => string;
  // Guarda lo que Diego dijo en su área de la vida. tool = lo que JARVIS anotó (si anotó algo).
  // Devuelve el nombre del área y cómo deshacer la nota.
  notar?: (n: { texto: string; tool?: string; args?: any; origen: "jarvis" | "siri"; ya?: string[] }) => Promise<(Guardado & { undo: () => Promise<void> }) | null>;
  // ¿Es una pregunta (va a Gemini) o algo que cuenta (se guarda en su área)?
  esPregunta?: (texto: string) => boolean;
}

// Frases que hablan de plata: en modo privado no salen del teléfono.
const DE_PLATA = /\$\s?\d|\d\s*(mil|lucas?|palos?|pesos)\b|\b(plata|gast|pagu|sueldo|propina|presupuesto|ahorr|deuda|lucas)/i;

type Gemini = { stream: typeof streamGemini; ask: typeof askGemini };

// Lo que JARVIS dejó "en el aire" esperando la respuesta de Diego.
type Pending =
  | { kind: "confirm"; tool: string; args: any }
  | { kind: "choose"; date: string; ids: string[] }
  | { kind: "hour"; title: string }
  | { kind: "monto"; tipo: "ingreso" | "egreso"; descripcion?: string }
  | { kind: "acoste" }
  | { kind: "recordar"; falta: "cuando" | "hora"; texto: string; cuando?: string; extra?: any };

const NUM_WORDS: Record<string, number> = { uno: 1, una: 1, primera: 1, primero: 1, dos: 2, segunda: 2, segundo: 2, tres: 3, tercera: 3, tercero: 3, cuatro: 4, cuarta: 4, cinco: 5, quinta: 5, seis: 6, sexta: 6, siete: 7, septima: 7 };

const connected = (c: Connection) => (c.mode === "key" ? !!c.apiKey : !!c.workerUrl && !!c.workerToken);

// El cerebro: primero intenta entender la orden en el teléfono (gratis e instantáneo).
// Si es ambigua, pregunta. Si no la entiende, le pregunta a Gemini, que razona y usa herramientas.
export class Assistant {
  history: Turn[];
  summary: string;
  private pending: Pending | null = null;
  private lastUndo: { undo: () => Promise<void> | void } | null = null;
  private turnUndo: (() => Promise<void> | void) | undefined;

  constructor(
    private tools: ToolRegistry,
    private routine: Routine,
    private conn: () => Connection & { about?: string },
    private kv: KV,
    private clock: () => ChileNow = chileNow,
    private gemini: Gemini = { stream: streamGemini, ask: askGemini },
    private opts: AssistantOptions = {},
  ) {
    this.history = kv.get<Turn[]>("history", []);
    this.summary = kv.get<string>("summary", "");
  }

  get waiting() {
    return this.pending?.kind ?? null;
  }

  private remember(user: string, model: string) {
    this.history.push({ role: "user", text: user }, { role: "model", text: model });
    this.history = this.history.slice(-40);
    this.kv.set("history", this.history);
  }

  clearHistory() {
    this.history = [];
    this.summary = "";
    this.pending = null;
    this.kv.set("history", []);
    this.kv.set("summary", "");
  }

  // Llama a una herramienta y guarda cómo deshacer lo que hizo.
  private async call(name: string, args: any): Promise<ToolResult> {
    const r = await this.tools.call(name, args);
    // A un recordatorio le faltó cuándo o la hora: la próxima respuesta lo completa.
    const f = r.data as { falta?: "cuando" | "hora"; texto?: string; cuando?: string; extra?: any } | undefined;
    if (!r.ok && name === "crear_recordatorio" && f?.texto && (f.falta === "cuando" || f.falta === "hora"))
      this.pending = { kind: "recordar", falta: f.falta, texto: f.texto, cuando: f.cuando, extra: f.extra };
    if (r.ok && r.undo) {
      let undo = r.undo;
      // Lo anotado también queda en su área, con la frase tal como la dijiste.
      const nota = this.dicho && this.opts.notar ? await this.opts.notar({ texto: this.dicho, tool: name, args, origen: this.origen, ya: this.guardados.map((g) => g.id) }).catch(() => null) : null;
      if (nota) {
        this.guardados.push(sinUndo(nota));
        const u0 = undo;
        undo = async () => {
          await u0();
          await nota.undo();
        };
      }
      this.lastUndo = { undo };
      this.turnUndo = undo;
    }
    return r;
  }

  private dicho = "";
  private origen: "jarvis" | "siri" = "jarvis";

  private guardados: Guardado[] = [];

  async handle(text: string, onText: (delta: string) => void = () => {}, origen: "jarvis" | "siri" = "jarvis"): Promise<Reply> {
    this.guardados = [];
    const r = await this.turno(text, onText, origen);
    return this.guardados.length && !r.guardado ? { ...r, guardado: this.guardados } : r;
  }

  private async turno(text: string, onText: (delta: string) => void, origen: "jarvis" | "siri"): Promise<Reply> {
    const said = text.trim();
    if (!said) return { text: "", source: "local" };
    this.turnUndo = undefined;
    this.dicho = said;
    this.origen = origen;
    // Cómo escribe Diego ("toy en el gym nms", "gaste 5 lukas x un completo") → español que entiende el intérprete.
    const frase = normalizarChileno(said) || said;

    // ¿Es la respuesta a algo que JARVIS preguntó?
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      if (p.kind === "confirm") {
        if (isYes(frase)) return this.local(said, (await this.call(p.tool, p.args)).say, onText);
        if (isNo(frase)) return this.local(said, "Ya, no hago nada.", onText);
      } else if (p.kind === "hour") {
        const ans = frase.trim();
        const phrase = /^(a las|a la|de|desde|entre|para las)\b/i.test(ans) ? ans : `a las ${ans}`;
        const cmd = parseCommand(`agrega ${p.title} ${phrase}`, this.clock());
        if (cmd?.tool === "agregar_tarea") return this.local(said, (await this.call(cmd.tool, cmd.args)).say, onText);
        if (isNo(frase)) return this.local(said, "Ya, no agrego nada.", onText);
      } else if (p.kind === "recordar") {
        if (isNo(frase) || /^(nada|olvidalo|olvídalo|déjalo|dejalo|cancela)\b/i.test(frase)) return this.local(said, "Ya, no lo agendo.", onText);
        // Solo si la respuesta parece un cuándo ("a las 7", "mañana", "en 20 minutos", "7:30"); si no, se atiende como frase nueva.
        const otra = this.opts.parse?.(frase, this.clock());
        if (!(otra && otra.tool !== "crear_recordatorio") && /\d|\b(hoy|mañana|manana|pasado|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|ahora|altiro|al tiro|tarde|noche|mediod[ií]a|semana|mes|todos|cada|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\b/i.test(frase)) {
          const ans = frase.trim().replace(/[.!]+$/, "");
          const hora = /^\d{1,2}([:.]\d{2})?( ?(am|pm|hrs?|horas))?$|^(una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)( y media)?$/i.test(ans) ? `a las ${ans}` : ans;
          const cuando = p.falta === "hora" ? `${p.cuando} ${hora}` : hora;
          return this.local(said, (await this.call("crear_recordatorio", { texto: p.texto, cuando, ...(p.extra || {}) })).say, onText);
        }
      } else if (p.kind === "acoste") {
        // "¿A qué hora te acostaste?" → "a las 12", "como a la 1", "23:30"
        const h = parseHour(frase.replace(/^(como |tipo |a eso de |cerca de )?(a las |a la )?/i, ""));
        if (h) {
          // "a las 12" casi siempre es medianoche y "a las 11" de la noche: se elige la lectura que da un sueño más razonable.
          const now = this.clock().minutes;
          const m = toMinutes(h);
          const dur = (x: number) => (((now - x) % 1440) + 1440) % 1440;
          const ini = [m, (m + 720) % 1440].sort((a, b) => Math.abs(dur(a) - 480) - Math.abs(dur(b) - 480))[0];
          return this.local(said, (await this.call("registrar_bloque", { categoria: "sueno", texto: "dormir", inicio: hhmm(ini), fin: hhmm(now) })).say, onText);
        }
        if (isNo(frase)) return this.local(said, "Ya, no anoto el sueño.", onText);
      } else if (p.kind === "monto") {
        const v = this.opts.parse?.(`${p.tipo === "egreso" ? "gasté" : "me pagaron"} ${frase}${p.descripcion ? ` de ${p.descripcion}` : ""}`, this.clock());
        if (v && /^registrar_(gasto|ingreso)$/.test(v.tool)) {
          const local = await this.runLocal(v, true);
          if (local) return this.local(said, local, onText);
        }
        if (isNo(frase)) return this.local(said, "Ya, no anoto nada.", onText);
      } else {
        const answer = this.answerChoice(p, frase);
        if (answer) return this.local(said, answer, onText);
      }
    }

    const vida = this.opts.parse?.(frase, this.clock());
    if (vida) {
      const local = await this.runLocal(vida, true);
      if (local) return this.local(said, local, onText);
    }
    const cmd = parseCommand(frase, this.clock());
    if (cmd) {
      const local = await this.runLocal(cmd);
      if (local) return this.local(said, local, onText);
    }
    // Modo privado: una frase con plata que no entendí no se manda a Gemini.
    if (this.opts.privado?.() && DE_PLATA.test(frase))
      return this.local(said, 'Estás en modo privado, así que no mando frases de plata a Gemini. Dímelo así y lo anoto yo: "gasté 5 mil en comida", "me pagaron 40 mil de propina" o "¿cuánto llevo gastado este mes?".', onText);
    // Algo que Diego cuenta (no una pregunta): se guarda en su área de la vida.
    if (!cmd && this.opts.notar && this.opts.esPregunta && !this.opts.esPregunta(frase)) {
      const nota = await this.opts.notar({ texto: said, origen }).catch(() => null);
      if (nota) {
        this.guardados.push(sinUndo(nota));
        this.lastUndo = { undo: nota.undo };
        this.turnUndo = nota.undo;
        if (!connected(this.conn())) return this.local(said, `Anotado en ${nota.area}: ${said.charAt(0).toLowerCase()}${said.slice(1).replace(/[.!]+$/, "")}.`, onText);
        const r = await this.viaGemini(said, onText, `\nLo que Diego acaba de contar ya quedó guardado en su área "${nota.area}" de la app. Empieza diciendo en pocas palabras que lo guardaste en "${nota.area}" (por ejemplo "Lo dejé en ${nota.area}."), y después respóndele corto y con empatía si corresponde.`);
        return { ...r, text: r.text, undo: nota.undo };
      }
    }
    if (connected(this.conn())) return this.viaGemini(said, onText);
    // Sin Gemini: igual intenta ayudar con lo que sabe.
    return this.local(said, await this.offlineHelp(cmd, frase), onText);
  }

  // Devuelve lo que JARVIS dice, o null si conviene que lo resuelva Gemini.
  private async runLocal(cmd: LocalCommand, vida = false): Promise<string | null> {
    const n = this.clock();
    if (cmd.tool === "__deshacer") {
      const u = this.lastUndo;
      if (!u) return "No tengo nada reciente que deshacer.";
      this.lastUndo = null;
      await u.undo();
      return "Listo, lo deshice.";
    }
    if (cmd.tool === "__saludo") {
      const h = n.minutes;
      const op = ["¿Qué anotamos?", "¿En qué te ayudo?", "¿Qué hacemos?"][n.minutes % 3];
      return `${h < 12 * 60 ? "Buenos días" : h < 20 * 60 ? "Hola" : "Buenas noches"} Diego. ${op}`;
    }
    if (cmd.tool === "__ayuda")
      return 'Puedo anotar tu plata ("gasté 5 lukas en completos"), tu tiempo ("toy en el gym", "terminé"), tu sueño y ánimo ("dormí 7 horas", "ando cansao"), entrenos y partidos ("metí un gol"), hábitos y metas. Y te respondo "¿qué tengo mañana?", "¿en qué se me fue el día?" o "resumen de la semana". Abajo, en "¿Qué le puedo decir?", tienes más ejemplos para tocar.';
    if (cmd.tool === "__gracias") return ["De nada, para eso estoy.", "Ningún problema.", "Al tiro, cuando quieras."][n.minutes % 3];
    if (cmd.tool === "__acoste") {
      this.pending = { kind: "acoste" };
      return "Buenos días. ¿A qué hora te acostaste? Así anoto cuánto dormiste.";
    }
    if (cmd.tool === "__varios") {
      const says: string[] = [];
      for (const c of (cmd.args.cmds as LocalCommand[]) || []) {
        const r = await this.call(c.tool, c.args);
        says.push(r.say);
      }
      return says.join(" ");
    }
    if (cmd.tool === "__falta_monto") {
      this.pending = { kind: "monto", tipo: cmd.args.tipo as "ingreso" | "egreso", descripcion: cmd.args.descripcion as string | undefined };
      return cmd.args.tipo === "egreso" ? "¿Cuánto fue y en qué? Por ejemplo: 5 mil en almuerzo." : "¿De cuánto fue?";
    }
    if (cmd.tool === "__elegir") return this.askWhich(n, "Ya, vamos por partes.");
    if (cmd.tool === "__nada") return this.nothingDone(n);
    if (cmd.tool === "__falta_hora") {
      const title = String(cmd.args.titulo || "").trim();
      if (!title) return "¿Qué quieres que agregue, y a qué hora?";
      this.pending = { kind: "hour", title };
      return `¿A qué hora pongo ${title}? Puede ser una hora, como 18:00, o un rango, como de 20 a 22.`;
    }
    const tool = this.tools.get(cmd.tool);
    const ask = tool?.needsConfirm?.(cmd.args);
    if (ask) {
      this.pending = { kind: "confirm", tool: cmd.tool, args: cmd.args };
      return ask;
    }
    const r = await this.call(cmd.tool, cmd.args);
    // Si el teléfono no pudo (no encontró la meta, faltó un dato…), con Gemini conectado se lo pasa a él.
    if (r.ok || (vida && !connected(this.conn()))) return r.say;
    // No encontró la tarea: Gemini puede razonarlo; si no hay Gemini, pregunta con opciones.
    if (connected(this.conn())) return null;
    if (/^(tachar_tarea|tachar_tareas)$/.test(cmd.tool)) {
      const what = String(cmd.args.titulo || ((cmd.args.titulos as string[]) || []).join(", "));
      return this.askWhich(n, `No me calza "${what}" con tu rutina.`);
    }
    return r.say;
  }

  // "Hice la rutina a medias": muestra lo pendiente numerado y espera la respuesta.
  private askWhich(n: ChileNow, intro: string): string {
    const { done, pending } = this.routine.dayStatus(n.date, n.dow);
    if (!done.length && !pending.length) return "Hoy no tienes nada en la rutina. Si quieres, dime qué hiciste y lo agrego, por ejemplo: agrega gimnasio a las 8.";
    if (!pending.length) return `Según yo ya tenías todo tachado hoy: ${joinY(done.map((t) => t.title))}. Si algo no lo hiciste, dime "no hice" y el nombre.`;
    this.pending = { kind: "choose", date: n.date, ids: pending.map((t) => t.id) };
    const opts = pending.map((t, i) => `${i + 1}, ${t.title}`).join("; ");
    const yaHecho = done.length ? ` Ya tenías tachado ${joinY(done.map((t) => t.title))}.` : "";
    return `${intro}${yaHecho} Te falta: ${opts}. ¿Cuáles hiciste? Dime los números o los nombres, "todas" o "ninguna".`;
  }

  private nothingDone(n: ChileNow): string {
    const { pending } = this.routine.dayStatus(n.date, n.dow);
    if (!pending.length) return "Tranquilo, igual hoy tenías todo tachado. ¿Quieres que desmarque algo?";
    const later = pending.filter((t) => toMinutes(t.time) > n.minutes);
    const missed = pending.filter((t) => toMinutes(t.time) <= n.minutes);
    let say = "Tranquilo, hay días así; lo importante es no soltar dos seguidos.";
    if (later.length) say += ` Todavía alcanzas ${joinY(later.map((t) => `${t.title} a las ${t.time}`))}.`;
    if (missed.length) say += ` Lo que se pasó, ${joinY(missed.map((t) => t.title))}, lo retomas mañana.`;
    return say;
  }

  private answerChoice(p: Extract<Pending, { kind: "choose" }>, said: string): string | null {
    const options = p.ids.map((id) => this.routine.tasks.find((t) => t.id === id)).filter(Boolean) as Task[];
    if (!options.length) return null;
    const t = norm(said);
    let chosen: Task[] = [];
    if (/\b(ninguna|ninguno|nada|ni una)\b/.test(t)) {
      const later = options.filter((o) => toMinutes(o.time) > this.clock().minutes);
      return `Ya, no taché nada.${later.length ? ` Todavía alcanzas ${joinY(later.map((o) => `${o.title} a las ${o.time}`))}. Tú puedes.` : " Mañana se retoma, sin drama."}`;
    }
    if (/\b(todas|todos|todo)\b/.test(t) && !/\bmenos\b/.test(t)) chosen = options;
    else {
      const nums = [...t.matchAll(/\b(\d|uno|una|primera|primero|dos|segunda|segundo|tres|tercera|tercero|cuatro|cuarta|cinco|quinta|seis|sexta|siete|septima)\b/g)].map((m) => NUM_WORDS[m[1]] || Number(m[1]));
      nums.forEach((k) => options[k - 1] && chosen.push(options[k - 1]));
      for (const part of said.split(/\s*(?:,|\by\b|\be\b)\s*/)) {
        const hit = part.trim() && !/^\d+$/.test(part.trim()) ? this.routine.find(part, undefined, options) : null;
        if (hit) chosen.push(hit);
      }
      // "todas menos el gym"
      if (/\b(todas|todo) menos\b/.test(t)) {
        const except = this.routine.find(said.split(/menos/i)[1] || "", undefined, options);
        chosen = options.filter((o) => o !== except);
      }
    }
    chosen = [...new Set(chosen)];
    if (!chosen.length) return null; // no era una respuesta: se procesa como mensaje nuevo
    chosen.forEach((o) => this.routine.check(o, p.date));
    const left = options.filter((o) => !chosen.includes(o));
    let say = `Listo, taché ${joinY(chosen.map((o) => o.title))}.`;
    if (!left.length) return say + " Con eso cerraste el día. Bien ahí.";
    const n = this.clock();
    const later = left.filter((o) => toMinutes(o.time) > n.minutes);
    const missed = left.filter((o) => toMinutes(o.time) <= n.minutes);
    if (later.length) say += ` Te queda ${joinY(later.map((o) => `${o.title} a las ${o.time}`))}, todavía alcanzas.`;
    if (missed.length) say += ` ${joinY(missed.map((o) => o.title))} ${missed.length > 1 ? "quedaron" : "quedó"} pendiente${missed.length > 1 ? "s" : ""}; mañana se retoma.`;
    return say;
  }

  private async offlineHelp(cmd: LocalCommand | null, said: string): Promise<string> {
    if (cmd) return (await this.call(cmd.tool, cmd.args)).say;
    // Si parece una orden que no entendí, lo digo en vez de responder cualquier cosa.
    if (/^(agrega|añade|anota|agenda|ponme|quita|borra|elimina|cambia|mueve|tacha)\b/.test(fixVerb(said.toLowerCase().trim()))) {
      return 'Te entendí que quieres cambiar tu rutina, pero no me quedó clara la frase. Dímelo así: "agrega entrenamiento de 20 a 22", "cambia el gym a las 19:00" o "quita leer".';
    }
    // Sin Gemini igual responde lo que sabe (datos guardados en la app).
    const k = await this.tools.call("consultar_datos", { tema: said });
    if (k.ok) return k.say;
    // Una pregunta que necesita a Gemini: se guarda y se responde apenas se conecte.
    const pend = this.pendientes();
    if (!pend.includes(said)) this.kv.set("pendientes", [...pend, said].slice(-20));
    return "Para responder eso necesito a Gemini, que todavía no está conectado. Guardé tu pregunta y te la respondo apenas lo conectes: arriba está el botón, es gratis y toma 2 minutos.";
  }

  // Preguntas que llegaron sin Gemini conectado, para responderlas después.
  pendientes(): string[] {
    return this.kv.get<string[]>("pendientes", []);
  }
  quitarPendiente(p: string) {
    this.kv.set("pendientes", this.pendientes().filter((x) => x !== p));
  }

  private local(user: string, say: string, onText: (d: string) => void): Reply {
    onText(say);
    this.remember(user, say);
    return { text: say, source: "local", ...(this.turnUndo ? { undo: this.turnUndo } : {}) };
  }

  private async viaGemini(said: string, onText: (d: string) => void, extra = ""): Promise<Reply> {
    const conn = this.conn();
    const contents: Content[] = this.history.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
    contents.push({ role: "user", parts: [{ text: said }] });
    const system = systemPrompt(this.clock(), this.routine, this.summary, conn.about) + (this.opts.contexto?.(said, this.clock()) || "") + extra;
    let spoken = "";
    try {
      for (let round = 0; round < 4; round++) {
        const res = await this.gemini.stream(conn, { system, contents, tools: this.tools.declarations() }, (d) => {
          spoken += d;
          onText(d);
        });
        if (!res.calls.length) break;
        const responses: Part[] = [];
        let confirmMsg = "";
        for (const call of res.calls) {
          const tool = this.tools.get(call.name);
          const ask = tool?.needsConfirm?.(call.args);
          if (ask) {
            this.pending = { kind: "confirm", tool: call.name, args: call.args };
            confirmMsg = ask;
            responses.push({ functionResponse: { name: call.name, response: { ok: false, resultado: "Esperando que Diego confirme." } } });
            continue;
          }
          const r = await this.call(call.name, call.args);
          if (r.privado && this.opts.privado?.()) {
            // Modo privado: Diego ve la respuesta con las cifras; Gemini solo sabe que se respondió.
            const sep = spoken ? " " : "";
            spoken += sep + r.say;
            onText(sep + r.say);
            responses.push({ functionResponse: { name: call.name, response: { ok: r.ok, resultado: "Respuesta con cifras privadas: ya se la mostré a Diego tal cual. No repitas ni inventes cifras; si quieres, agrega algo muy breve sin números." } } });
            continue;
          }
          responses.push({ functionResponse: { name: call.name, response: { ok: r.ok, resultado: r.say, datos: r.data ?? null } } });
        }
        if (confirmMsg) {
          const sep = spoken ? " " : "";
          spoken += sep + confirmMsg;
          onText(sep + confirmMsg);
          break;
        }
        contents.push({ role: "model", parts: res.parts }, { role: "user", parts: responses });
        if (round === 3) {
          const fallback = responses.map((p) => (p.functionResponse as any)?.response?.resultado).filter(Boolean).join(" ");
          spoken += fallback;
          onText(fallback);
        }
      }
      const final = spoken.trim() || "Listo.";
      this.remember(said, final);
      void this.maybeSummarize(conn);
      return { text: final, source: "gemini", ...(this.turnUndo ? { undo: this.turnUndo } : {}) };
    } catch (e) {
      const kind = e instanceof GeminiError ? e.kind : "generic";
      // Si Gemini falla, igual intenta resolverlo en el teléfono.
      const cmd = parseCommand(said, this.clock());
      const backup = cmd ? await this.runLocal(cmd) : null;
      const msg = backup ? `${backup}` : FRIENDLY[kind] || FRIENDLY.generic;
      const sep = spoken ? " " : "";
      onText(sep + msg);
      if (backup) {
        this.remember(said, backup);
        return { text: (spoken + sep + msg).trim(), source: "local" };
      }
      return { text: (spoken + sep + msg).trim(), source: "error", error: kind };
    }
  }

  // Conversación larga: lo antiguo se resume en pocas líneas para gastar menos tokens.
  private async maybeSummarize(conn: Connection) {
    if (this.history.length <= HISTORY_LIMIT) return;
    const old = this.history.slice(0, -HISTORY_KEEP);
    const keep = this.history.slice(-HISTORY_KEEP);
    try {
      const text = await this.gemini.ask(conn, {
        system: "Resume en máximo 4 líneas, en español, los datos útiles de esta conversación (qué pidió, qué se acordó, cómo se sentía). Sin saludos.",
        contents: [{ role: "user", parts: [{ text: (this.summary ? `Resumen previo: ${this.summary}\n` : "") + old.map((t) => `${t.role === "user" ? "Diego" : "JARVIS"}: ${t.text}`).join("\n") }] }],
        maxTokens: 200,
        think: false,
      });
      if (text) {
        this.summary = text;
        this.history = keep;
        this.kv.set("summary", this.summary);
        this.kv.set("history", this.history);
      }
    } catch {
      this.history = this.history.slice(-HISTORY_LIMIT);
      this.kv.set("history", this.history);
    }
  }
}
