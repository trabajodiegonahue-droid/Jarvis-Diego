import { HISTORY_KEEP, HISTORY_LIMIT } from "../config";
import { chileNow, toMinutes, type ChileNow } from "../core/time";
import type { KV } from "../core/storage";
import { norm, type Routine, type Task } from "../routine/routine";
import type { ToolRegistry } from "../tools/registry";
import { joinY } from "../tools/routineTools";
import { fixVerb, isNo, isYes, parseCommand, type LocalCommand } from "./commands";
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
}

type Gemini = { stream: typeof streamGemini; ask: typeof askGemini };

// Lo que JARVIS dejó "en el aire" esperando la respuesta de Diego.
type Pending =
  | { kind: "confirm"; tool: string; args: any }
  | { kind: "choose"; date: string; ids: string[] }
  | { kind: "hour"; title: string };

const NUM_WORDS: Record<string, number> = { uno: 1, una: 1, primera: 1, primero: 1, dos: 2, segunda: 2, segundo: 2, tres: 3, tercera: 3, tercero: 3, cuatro: 4, cuarta: 4, cinco: 5, quinta: 5, seis: 6, sexta: 6, siete: 7, septima: 7 };

const connected = (c: Connection) => (c.mode === "key" ? !!c.apiKey : !!c.workerUrl && !!c.workerToken);

// El cerebro: primero intenta entender la orden en el teléfono (gratis e instantáneo).
// Si es ambigua, pregunta. Si no la entiende, le pregunta a Gemini, que razona y usa herramientas.
export class Assistant {
  history: Turn[];
  summary: string;
  private pending: Pending | null = null;

  constructor(
    private tools: ToolRegistry,
    private routine: Routine,
    private conn: () => Connection & { about?: string },
    private kv: KV,
    private clock: () => ChileNow = chileNow,
    private gemini: Gemini = { stream: streamGemini, ask: askGemini },
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

  async handle(text: string, onText: (delta: string) => void = () => {}): Promise<Reply> {
    const said = text.trim();
    if (!said) return { text: "", source: "local" };

    // ¿Es la respuesta a algo que JARVIS preguntó?
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      if (p.kind === "confirm") {
        if (isYes(said)) return this.local(said, (await this.tools.call(p.tool, p.args)).say, onText);
        if (isNo(said)) return this.local(said, "Ya, no hago nada.", onText);
      } else if (p.kind === "hour") {
        const ans = said.trim();
        const phrase = /^(a las|a la|de|desde|entre|para las)\b/i.test(ans) ? ans : `a las ${ans}`;
        const cmd = parseCommand(`agrega ${p.title} ${phrase}`, this.clock());
        if (cmd?.tool === "agregar_tarea") return this.local(said, (await this.tools.call(cmd.tool, cmd.args)).say, onText);
        if (isNo(said)) return this.local(said, "Ya, no agrego nada.", onText);
      } else {
        const answer = this.answerChoice(p, said);
        if (answer) return this.local(said, answer, onText);
      }
    }

    const cmd = parseCommand(said, this.clock());
    if (cmd) {
      const local = await this.runLocal(cmd);
      if (local) return this.local(said, local, onText);
    }
    if (connected(this.conn())) return this.viaGemini(said, onText);
    // Sin Gemini: igual intenta ayudar con lo que sabe.
    return this.local(said, await this.offlineHelp(cmd, said), onText);
  }

  // Devuelve lo que JARVIS dice, o null si conviene que lo resuelva Gemini.
  private async runLocal(cmd: LocalCommand): Promise<string | null> {
    const n = this.clock();
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
    const r = await this.tools.call(cmd.tool, cmd.args);
    if (r.ok) return r.say;
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
    if (cmd) return (await this.tools.call(cmd.tool, cmd.args)).say;
    // Si parece una orden que no entendí, lo digo en vez de responder cualquier cosa.
    if (/^(agrega|añade|anota|agenda|ponme|quita|borra|elimina|cambia|mueve|tacha)\b/.test(fixVerb(said.toLowerCase().trim()))) {
      return 'Te entendí que quieres cambiar tu rutina, pero no me quedó clara la frase. Dímelo así: "agrega entrenamiento de 20 a 22", "cambia el gym a las 19:00" o "quita leer".';
    }
    // Sin Gemini igual responde lo que sabe (datos guardados en la app).
    const k = await this.tools.call("consultar_datos", { tema: said });
    if (k.ok) return k.say;
    return `${FRIENDLY.config} Mientras, puedo con la rutina: "qué me toca", "cómo voy", "hice la rutina a medias", "ya hice el gym y el inglés" o "agrega leer a las 22:00".`;
  }

  private local(user: string, say: string, onText: (d: string) => void): Reply {
    onText(say);
    this.remember(user, say);
    return { text: say, source: "local" };
  }

  private async viaGemini(said: string, onText: (d: string) => void): Promise<Reply> {
    const conn = this.conn();
    const contents: Content[] = this.history.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
    contents.push({ role: "user", parts: [{ text: said }] });
    const system = systemPrompt(this.clock(), this.routine, this.summary, conn.about);
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
          const r = await this.tools.call(call.name, call.args);
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
      return { text: final, source: "gemini" };
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
