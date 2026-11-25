// Chat y voz de JARVIS dentro de la app: registrar hablando, preguntar y pedir resúmenes.
import { useEffect, useRef, useState } from "preact/hooks";
import { GREETING } from "../../brain/persona";
import type { Guardado } from "../../brain/assistant";
import { chileNow } from "../../core/time";
import { assistant, settings, speaker, tools, updateSettings } from "../../jarvis/instance";
import { isConnected } from "../../core/settings";
import { askGemini, limpiarClave } from "../../brain/gemini";
import { fotoABase64, leerFoto } from "../../brain/foto";
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
  guardado?: Guardado[];
}
let chat: Msg[] = [];

// "Mi vida › Salud y Hábitos": dónde quedó lo que se guardó.
export function dondeTxt(gs: Guardado[]): string {
  const partes = new Set<string>();
  for (const g of gs) {
    partes.add(`Mi vida › ${g.area}`);
    if (g.seccion) partes.add(g.seccion.nombre);
  }
  return [...partes].join(" y ");
}

function Guardados({ gs }: { gs: Guardado[] }) {
  return (
    <div class="guardado" role="note">
      {gs.map((g, i) => (
        <div key={i} class="stack" style={{ gap: "4px" }}>
          <span class="small" style={{ fontWeight: 600, color: "var(--ink)" }}>
            <Icon name="estrella" size={14} /> Guardé: “{g.texto}”
          </span>
          <span class="row" style={{ gap: "6px", flexWrap: "wrap" }}>
            <a class="pill-link" href={`#/areas?a=${g.id}`}>Mi vida › {g.area}</a>
            {g.seccion && <a class="pill-link" href={`#${g.seccion.ruta}`}>{g.seccion.nombre}</a>}
          </span>
        </div>
      ))}
    </div>
  );
}

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
  // Con Mi Día cargado, el saludo es el plan del día en 3 líneas.
  if (getPrefs().miDia) {
    const p = await tools.call("plan_de_hoy", { saludo: n.minutes < 13 * 60 });
    if (p.ok) return n.minutes < 13 * 60 ? p.say : `Hola Diego. ${p.say}`;
  }
  const r = await tools.call("resumen", { tipo: n.minutes < 13 * 60 ? "manana" : "hoy" });
  if (!r.ok) return GREETING;
  return n.minutes < 13 * 60 ? r.say : `Hola Diego. ${r.say}`;
}

export const abrirJarvis = (detail: { borrador?: string; enviar?: boolean } = {}) => dispatchEvent(new CustomEvent("abrir-jarvis", { detail }));

export function JarvisSheet({ onClose, borrador, enviar }: { onClose: () => void; borrador?: string; enviar?: boolean }) {
  const [, redraw] = useState(0);
  const [estado, setEstado] = useState<Estado>("idle");
  const [detalle, setDetalle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const stop = useRef<null | (() => void)>(null);
  const lista = useRef<HTMLDivElement>(null);
  // La conversación siempre muestra lo último (abajo), como un chat.
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  useEffect(() => {
    speaker.onStart = () => setEstado("speaking");
    speaker.onEnd = () => setEstado((e) => (e === "speaking" ? "idle" : e));
    speaker.unlock();
    if (borrador && enviar) void send(borrador);
    else if (borrador && input.current) {
      input.current.value = borrador;
      input.current.focus();
      if (!/ $/.test(borrador)) setDetalle("Llegó este texto desde un enlace o un atajo. Revísalo y toca enviar.");
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
    msg.guardado = r.guardado;
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
    setDetalle("Habla tranquilo: lo envío cuando te quedes callado 3 segundos (o toca para enviar ya).");
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

  // Una foto de una boleta o del reloj de trote: Gemini la lee y JARVIS lo anota.
  async function foto(el: HTMLInputElement) {
    const f = el.files?.[0];
    el.value = "";
    if (!f) return;
    if (!isConnected(settings)) {
      chat.push({ who: "a", text: "Para leer fotos necesito estar conectado a Gemini (Ajustes)." });
      return redraw((n) => n + 1);
    }
    if (getPrefs().privacy) {
      chat.push({ who: "a", text: "Estás en modo privado: no mando fotos a Gemini. Dímelo con palabras y lo anoto." });
      return redraw((n) => n + 1);
    }
    chat.push({ who: "u", text: "📷 Foto" });
    const msg: Msg = { who: "a", text: "" };
    chat.push(msg);
    setEstado("thinking");
    redraw((n) => n + 1);
    try {
      const l = await leerFoto(settings, await fotoABase64(f));
      if (!l.frase) {
        msg.text = `${l.resumen} No encontré un gasto ni un entreno para anotar.`;
        setEstado("idle");
        return redraw((n) => n + 1);
      }
      chat.splice(chat.indexOf(msg), 1);
      chat.push({ who: "a", text: `Leí la foto: ${l.resumen}` });
      await send(l.frase);
    } catch {
      msg.text = "No pude leer la foto. Prueba con una más nítida o dímelo con palabras.";
      setEstado("error");
      redraw((n) => n + 1);
    }
  }

  const pocos = chat.filter((m) => m.who === "u").length < 2;

  const conectado = isConnected(settings);
  return (
    <Sheet title="JARVIS" onClose={onClose} full>
      {!conectado && (
        <Conexion onResponder={(ps) => ps.forEach((q, i) => setTimeout(() => {
          assistant.quitarPendiente(q);
          void send(q);
        }, i * 2500))} />
      )}
      <div class="jv-estado" aria-live="polite">
        <span class={`jv-orb ${estado}`} aria-hidden="true" />
        <div class="stack" style={{ gap: "2px", minWidth: 0 }}>
          <strong>{TXT[estado]}</strong>
          {detalle && <span class="small jv-detalle">{detalle}</span>}
        </div>
      </div>
      <div class="jv-chat" ref={lista} aria-live="polite">
        {chat.slice(-30).map((m, i) => (
          <div key={i} class={`jv-msg ${m.who === "u" ? "yo" : "el"}`}>
            {m.text || <span class="jv-puntos" aria-label="Pensando"><i /><i /><i /></span>}
            {m.guardado?.length ? <Guardados gs={m.guardado} /> : null}
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
      {pocos && (
        <div class="jv-sugerencias">
          {SUGERENCIAS.map((s) => (
            <button key={s} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        class="jv-barra"
        onSubmit={(e) => {
          e.preventDefault();
          const v = input.current!.value;
          input.current!.value = "";
          send(v);
        }}
      >
        <button type="button" class={`jv-mic ${estado}`} onClick={escuchar} aria-label={estado === "listening" ? "Enviar lo que dije" : "Hablar con JARVIS"}>
          <Icon name={estado === "speaking" ? "stop" : "mic"} size={24} />
        </button>
        <input ref={input} aria-label="Mensaje para JARVIS" placeholder="Escríbele o toca el micrófono" enterKeyHint="send" />
        <label class="jv-foto" aria-label="Mandar una foto (boleta o reloj de trote)">
          <Icon name="camara" size={20} />
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => void foto(e.target as HTMLInputElement)} />
        </label>
        <button class="jv-enviar" aria-label="Enviar">
          <Icon name="send" size={18} />
        </button>
      </form>
      <details class="jv-guia">
        <summary>¿Qué le puedo decir?</summary>
        <div class="stack" style={{ gap: "10px", marginTop: "6px" }}>
          <span class="small">Háblale como hablas tú: entiende q, xq, nms, toy, mñn, lukas, po, cansao… Puedes decirle varias cosas de una vez. Toca una frase para probarla.</span>
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
          <span class="small">
            {getPrefs().privacy
              ? "Modo privado: tus cifras de dinero no salen del teléfono."
              : "Lo que anotas y los números se calculan en el teléfono. A Gemini solo va la frase cuando hace falta razonarla."}
          </span>
          {conectado && <Conexion onResponder={(ps) => ps.forEach((q, i) => setTimeout(() => { assistant.quitarPendiente(q); void send(q); }, i * 2500))} />}
        </div>
      </details>
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
          const k = limpiarClave(clave);
          // Google entrega claves con dos formatos: las clásicas (AIza…) y las nuevas (AQ.…). La prueba real la hace Gemini.
          if (!/^(AIza[\w-]{20,}|AQ\.[\w.-]{20,})$/.test(k)) return setEstado("Esa no parece una clave de Gemini (empiezan con AIza o AQ.). Cópiala completa desde AI Studio.");
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
            setEstado(`${FRIENDLY[err?.kind] || "No pude conectarme con esa clave. Revísala e intenta de nuevo."}${err?.message ? ` (${err.message})` : ""}`);
          }
        }}
      >
        <input type="password" autocomplete="off" autoCapitalize="off" spellcheck={false} aria-label="Clave de Gemini" placeholder="AIza… o AQ.…" value={clave} onInput={(e) => setClave((e.target as HTMLInputElement).value)} style={{ flex: 1, minWidth: 0, minHeight: "48px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 14px" }} />
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
