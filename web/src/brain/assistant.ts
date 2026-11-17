import { HISTORY_KEEP, HISTORY_LIMIT } from "../config";
import { chileNow, type ChileNow } from "../core/time";
import type { KV } from "../core/storage";
import type { Routine } from "../routine/routine";
import type { ToolRegistry } from "../tools/registry";
import { isNo, isYes, parseCommand } from "./commands";
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

// El cerebro: primero intenta entender la orden en el teléfono (gratis e instantáneo);
// si no, le pregunta a Gemini, que puede llamar herramientas.
export class Assistant {
  history: Turn[];
  summary: string;
  private pending: { tool: string; args: any } | null = null;

  constructor(
    private tools: ToolRegistry,
    private routine: Routine,
    private conn: () => Connection,
    private kv: KV,
    private clock: () => ChileNow = chileNow,
    private gemini: Gemini = { stream: streamGemini, ask: askGemini },
  ) {
    this.history = kv.get<Turn[]>("history", []);
    this.summary = kv.get<string>("summary", "");
  }

  private remember(user: string, model: string) {
    this.history.push({ role: "user", text: user }, { role: "model", text: model });
    this.history = this.history.slice(-40);
    this.kv.set("history", this.history);
  }

  clearHistory() {
    this.history = [];
    this.summary = "";
    this.kv.set("history", []);
    this.kv.set("summary", "");
  }

  async handle(text: string, onText: (delta: string) => void = () => {}): Promise<Reply> {
    const said = text.trim();
    if (!said) return { text: "", source: "local" };

    // ¿Respuesta a una confirmación pendiente?
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      if (isYes(said)) return this.local(said, this.tools.call(p.tool, p.args).say, onText);
      if (isNo(said)) return this.local(said, "Ya, no hago nada.", onText);
    }

    const cmd = parseCommand(said, this.clock());
    if (cmd) {
      const tool = this.tools.get(cmd.tool);
      const ask = tool?.needsConfirm?.(cmd.args);
      if (ask) {
        this.pending = cmd;
        return this.local(said, ask, onText);
      }
      const r = this.tools.call(cmd.tool, cmd.args);
      return this.local(said, r.say, onText);
    }
    return this.viaGemini(said, onText);
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
    const system = systemPrompt(this.clock(), this.routine, this.summary);
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
            this.pending = { tool: call.name, args: call.args };
            confirmMsg = ask;
            responses.push({ functionResponse: { name: call.name, response: { ok: false, resultado: "Esperando que Diego confirme." } } });
            continue;
          }
          const r = this.tools.call(call.name, call.args);
          responses.push({ functionResponse: { name: call.name, response: { ok: r.ok, resultado: r.say } } });
        }
        if (confirmMsg) {
          const sep = spoken ? " " : "";
          spoken += sep + confirmMsg;
          onText(sep + confirmMsg);
          break;
        }
        contents.push({ role: "model", parts: res.parts }, { role: "user", parts: responses });
        if (round === 3) {
          // Si el modelo sigue llamando herramientas sin hablar, se cierra con lo hecho.
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
      const msg = FRIENDLY[kind] || FRIENDLY.generic;
      const sep = spoken ? " " : "";
      onText(sep + msg);
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
        system: "Resume en máximo 4 líneas, en español, los datos útiles de esta conversación (qué pidió, qué se acordó). Sin saludos.",
        contents: [{ role: "user", parts: [{ text: (this.summary ? `Resumen previo: ${this.summary}\n` : "") + old.map((t) => `${t.role === "user" ? "Diego" : "JARVIS"}: ${t.text}`).join("\n") }] }],
        maxTokens: 200,
      });
      if (text) {
        this.summary = text;
        this.history = keep;
        this.kv.set("summary", this.summary);
        this.kv.set("history", this.history);
      }
    } catch {
      // Si no se pudo resumir, se recorta igual para no crecer sin límite.
      this.history = this.history.slice(-HISTORY_LIMIT);
      this.kv.set("history", this.history);
    }
  }
}
