// Chat y voz de JARVIS dentro de la app: registrar hablando, preguntar y pedir resúmenes.
import { useEffect, useRef, useState } from "preact/hooks";
import { GREETING } from "../../brain/persona";
import { chileNow } from "../../core/time";
import { assistant, settings, speaker, tools, updateSettings } from "../../jarvis/instance";
import { isConnected } from "../../core/settings";
import { askGemini } from "../../brain/gemini";
import { FRIENDLY } from "../../brain/persona";
import { canListen, listenOnce, type ListenError } from "../../voice/speech";
import { Sheet } from "../components";
import { Icon } from "../icons";
import { GUIA } from "../../jarvis/guia";
import { getPrefs, kv, toast } from "../state";

type Estado = "idle" | "listening" | "thinking" | "speaking" | "error";
const TXT: Record<Estado, string> = { idle: "Toca para hablar", listening: "Escuchando…", thinking: "Pensando…", speaking: "Hablando…", error: "Algo pasó" };
export interface Msg {
  who: "u" | "a";
  text: string;
  undo?: () => Promise<void> | void;
  deshecho?: boolean;
}
let chat: Msg[] = [];

// Para lo que llega desde el Atajo de Siri: queda en la conversación con su "Deshacer".
export function alChat(...ms: Msg[]) {
  chat.push(...ms);
  chat = chat.slice(-30);
}

const SUGERENCIAS = ["¿Qué me toca hoy?", "Empecé a estudiar", "¿En qué se me fue el día?", "Gasté 5 mil en almuerzo", "Dormí 7 horas", "Hice gym", "¿Qué tengo esta semana?", "¿Va a llover?", "Mi año en números"];


// El primer saludo del día es el resumen de la mañana (o de lo que queda del día). Después, el saludo corto.
async function saludo(): Promise<string> {
  const n = chileNow();
  if (kv.get<string>("saludo", "") === n.date) return GREETING;
  kv.set("saludo", n.date);
  const r = await tools.call("resumen", { tipo: n.minutes < 13 * 60 ? "manana" : "hoy" });
  if (!r.ok) return GREETING;
  return n.minutes < 13 * 60 ? r.say : `Hola Diego. ${r.say}`;
}

export function JarvisSheet({ onClose, borrador }: { onClose: () => void; borrador?: string }) {
  const [, redraw] = useState(0);
  const [estado, setEstado] = useState<Estado>("idle");
  const [detalle, setDetalle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const stop = useRef<null | (() => void)>(null);

  useEffect(() => {
    speaker.onStart = () => setEstado("speaking");
    speaker.onEnd = () => setEstado((e) => (e === "speaking" ? "idle" : e));
    speaker.unlock();
    if (borrador && input.current) {
      input.current.value = borrador;
      setDetalle("Llegó este texto desde un enlace o un atajo. Revísalo y toca enviar.");
    }
    else if (!chat.length || kv.get<string>("saludo", "") !== chileNow().date) {
      void saludo().then((t) => {
        chat.push({ who: "a", text: t });
        redraw((n) => n + 1);
        speaker.feed(t + " ");
        speaker.flush();
      });
    }
    return () => {
      speaker.stop();
      stop.current?.();
    };
  }, []);

  async function send(t: string) {
    const said = t.trim();
    if (!said) return;
    speaker.stop();
    chat.push({ who: "u", text: said });
    const msg: Msg = { who: "a", text: "" };
    chat.push(msg);
    chat = chat.slice(-30);
    setEstado("thinking");
    setDetalle("");
    redraw((n) => n + 1);
    const r = await assistant.handle(said, (d) => {
      msg.text += d;
      speaker.feed(d);
      redraw((n) => n + 1);
    });
    msg.text = r.text;
    msg.undo = r.undo;
    speaker.flush();
    redraw((n) => n + 1);
    if (r.source === "error") setEstado("error");
    else if (!speaker.enabled || !speaker.supported) setEstado("idle");
  }

  async function deshacer(m: Msg) {
    if (!m.undo || m.deshecho) return;
    await m.undo();
    m.deshecho = true;
    chat.push({ who: "a", text: "Listo, lo deshice." });
    redraw((n) => n + 1);
  }

  function escuchar() {
    if (estado === "listening") return stop.current?.();
    if (estado === "speaking") return speaker.stop();
    if (!canListen()) {
      setDetalle("Aquí no puedo escucharte directo: usa el micrófono del teclado.");
      return input.current?.focus();
    }
    speaker.stop();
    setEstado("listening");
    const l = listenOnce((p) => setDetalle(p));
    stop.current = l.stop;
    l.promise
      .then((t) => send(t))
      .catch((e: ListenError) => {
        const m: Record<ListenError, string> = {
          unsupported: "Usa el micrófono del teclado.",
          denied: "No tengo permiso para el micrófono. Actívalo en Ajustes del iPhone o usa el dictado del teclado.",
          "no-speech": "No te escuché. Toca de nuevo.",
          network: "El reconocimiento de voz necesita internet.",
          failed: "El micrófono falló: usa el cuadro de texto.",
        };
        setEstado(e === "no-speech" ? "idle" : "error");
        setDetalle(m[e] || m.failed);
      });
  }

  const pocos = chat.filter((m) => m.who === "u").length < 2;

  return (
    <Sheet title="JARVIS" onClose={onClose}>
      <Conexion onResponder={(ps) => ps.forEach((q, i) => setTimeout(() => {
        assistant.quitarPendiente(q);
        void send(q);
      }, i * 2500))} />
      <div class="stack" style={{ alignItems: "center", gap: "8px" }}>
        <button
          onClick={escuchar}
          aria-label="Hablar con JARVIS"
          style={{ width: "96px", height: "96px", borderRadius: "48px", border: 0, background: estado === "error" ? "var(--red)" : "var(--green)", color: "var(--on-accent)", display: "grid", placeItems: "center", transform: estado === "listening" ? "scale(1.08)" : "none", transition: "transform .2s" }}
        >
          <Icon name="mic" size={34} />
        </button>
        <strong aria-live="polite">{TXT[estado]}</strong>
        {detalle && <span class="small" style={{ textAlign: "center" }}>{detalle}</span>}
      </div>
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          const v = input.current!.value;
          input.current!.value = "";
          send(v);
        }}
      >
        <input ref={input} aria-label="Mensaje para JARVIS" placeholder="Escribe o dicta con el teclado" enterKeyHint="send" style={{ flex: 1, minHeight: "48px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 14px" }} />
        <button class="btn main" aria-label="Enviar">
          <Icon name="send" size={18} />
        </button>
      </form>
      <details>
        <summary style={{ cursor: "pointer", minHeight: "40px", fontWeight: 600 }}>¿Qué le puedo decir?</summary>
        <div class="stack" style={{ gap: "10px", marginTop: "6px" }}>
          <span class="small">Escríbele o háblale como hablas tú: entiende q, xq, nms, mns, toy, mñn, lukas, gambas, po, wn, cansao… Toca una frase para probarla.</span>
          {GUIA.map(([titulo, frases]) => (
            <div key={titulo} class="stack" style={{ gap: "6px" }}>
              <span class="lbl">{titulo}</span>
              <div class="chips">
                {frases.map((f) => (
                  <button key={f} style={{ minHeight: "36px", fontSize: "14px" }} onClick={() => send(f)}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
      {pocos && (
        <div class="chips" style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "2px" }}>
          {SUGERENCIAS.map((s) => (
            <button key={s} class="chip" style={{ whiteSpace: "nowrap", flex: "none", minHeight: "36px", padding: "0 12px", borderRadius: "18px", border: "1px solid var(--line)", background: "var(--card2)", color: "var(--text)", fontSize: "14px" }} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div class="stack" aria-live="polite">
        {[...chat].reverse().slice(0, 12).map((m, i) => (
          <div key={chat.length - i} style={{ alignSelf: m.who === "u" ? "flex-end" : "flex-start", maxWidth: "88%", padding: "10px 13px", borderRadius: "14px", border: "1px solid var(--line)", background: m.who === "u" ? "var(--card2)" : "var(--card)", fontSize: "15px" }}>
            {m.text || "…"}
            {m.undo && (
              <div style={{ marginTop: "6px" }}>
                {m.deshecho ? (
                  <span class="small">Deshecho</span>
                ) : (
                  <button class="link" style={{ background: "none", border: 0, padding: 0, color: "var(--blue)", fontSize: "14px", fontWeight: 600 }} onClick={() => deshacer(m)}>
                    Deshacer
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <p class="small" style={{ margin: 0 }}>
        {getPrefs().privacy
          ? "Modo privado: tus cifras de dinero no salen del teléfono. Lo que anotas y consultas de plata lo resuelvo aquí mismo."
          : "Lo que anotas (gastos, entrenos, goles, metas) y los números los calculo en el teléfono. A Gemini solo va la frase cuando no la entiendo yo."}
      </p>
    </Sheet>
  );
}

// Si JARVIS no está conectado a Gemini, solo entiende las frases del teléfono. Aquí se conecta en 2 minutos
// (clave gratis de Google AI Studio, que queda solo en este teléfono) y se responden las preguntas guardadas.
function Conexion({ onResponder }: { onResponder: (ps: string[]) => void }) {
  const [, redraw] = useState(0);
  const [clave, setClave] = useState("");
  const [estado, setEstado] = useState("");
  const conectado = isConnected(settings);
  const pend = assistant.pendientes();
  if (conectado && !pend.length) return null;
  if (conectado)
    return (
      <div class="card" style={{ gap: "8px", borderColor: "var(--green)" }}>
        <strong>Tenías {pend.length === 1 ? "una pregunta guardada" : `${pend.length} preguntas guardadas`}</strong>
        <span class="small">{pend.slice(0, 3).join(" · ")}</span>
        <button
          class="btn sm main"
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            onResponder(pend);
            redraw((n) => n + 1);
          }}
        >
          Responder ahora
        </button>
      </div>
    );
  return (
    <div class="card" style={{ borderColor: "var(--amber)", padding: "14px 16px" }}>
    <details open={pend.length > 0}>
      <summary style={{ cursor: "pointer", fontWeight: 650, minHeight: "32px" }}>Conecta a JARVIS para que responda todo</summary>
      <div class="stack" style={{ gap: "8px", marginTop: "6px", minWidth: 0 }}>
      <span class="small">
        Ahora solo entiendo lo que anotas (gastos, entrenos, recordatorios…) y lo que cuentas. Para responder cualquier pregunta necesito Gemini, que es gratis:
      </span>
      <ol class="small" style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "4px", color: "var(--ink)" }}>
        <li>
          Abre{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
            aistudio.google.com/apikey
          </a>{" "}
          con tu cuenta de Google y toca "Create API key".
        </li>
        <li>Copia la clave y pégala aquí.</li>
      </ol>
      <form
        class="row"
        onSubmit={async (e) => {
          e.preventDefault();
          const k = clave.trim();
          if (!/^AIza[\w-]{20,}$/.test(k)) return setEstado("Esa no parece una clave de Gemini (empieza con AIza).");
          setEstado("Probando…");
          const antes = { ...settings };
          updateSettings({ mode: "key", apiKey: k });
          try {
            await askGemini(settings, { system: "Responde solo: Conectado.", contents: [{ role: "user", parts: [{ text: "Hola" }] }], maxTokens: 20, think: false });
            setClave("");
            setEstado("");
            toast("JARVIS quedó conectado. Ahora te respondo todo.");
            redraw((n) => n + 1);
          } catch (err: any) {
            updateSettings({ mode: antes.mode, apiKey: antes.apiKey });
            setEstado(FRIENDLY[err?.kind] || "No pude conectarme con esa clave. Revísala e intenta de nuevo.");
          }
        }}
      >
        <input type="password" autocomplete="off" autoCapitalize="off" spellcheck={false} aria-label="Clave de Gemini" placeholder="AIza…" value={clave} onInput={(e) => setClave((e.target as HTMLInputElement).value)} style={{ flex: 1, minWidth: 0, minHeight: "48px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 14px" }} />
        <button class="btn main">Conectar</button>
      </form>
      {estado && <span class="small" style={{ color: "var(--amber)" }}>{estado}</span>}
      <span class="small">La clave queda solo en este teléfono (nunca en GitHub ni en los respaldos). Más adelante puedes usar el intermediario de Cloudflare, que la guarda fuera del teléfono (README).</span>
      {pend.length > 0 && <span class="small">Tienes {pend.length === 1 ? "una pregunta guardada: te la respondo" : `${pend.length} preguntas guardadas: te las respondo`} apenas te conectes.</span>}
      </div>
    </details>
    </div>
  );
}
