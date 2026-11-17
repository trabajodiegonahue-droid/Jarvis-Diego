// Chat y voz de JARVIS dentro de la app (lo de la versión 1, ahora en una hoja).
import { useEffect, useRef, useState } from "preact/hooks";
import { GREETING } from "../../brain/persona";
import { assistant, speaker } from "../../jarvis/instance";
import { canListen, listenOnce, type ListenError } from "../../voice/speech";
import { Sheet } from "../components";
import { Icon } from "../icons";

type Estado = "idle" | "listening" | "thinking" | "speaking" | "error";
const TXT: Record<Estado, string> = { idle: "Toca para hablar", listening: "Escuchando…", thinking: "Pensando…", speaking: "Hablando…", error: "Algo pasó" };
let chat: { who: "u" | "a"; text: string }[] = [{ who: "a", text: GREETING }];
let greeted = false;

export function JarvisSheet({ onClose }: { onClose: () => void }) {
  const [, redraw] = useState(0);
  const [estado, setEstado] = useState<Estado>("idle");
  const [detalle, setDetalle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const stop = useRef<null | (() => void)>(null);

  useEffect(() => {
    speaker.onStart = () => setEstado("speaking");
    speaker.onEnd = () => setEstado((e) => (e === "speaking" ? "idle" : e));
    if (!greeted) {
      greeted = true;
      speaker.unlock();
      speaker.feed(GREETING + " ");
      speaker.flush();
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
    const msg = { who: "a" as const, text: "" };
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
    speaker.flush();
    redraw((n) => n + 1);
    if (r.source === "error") setEstado("error");
    else if (!speaker.enabled || !speaker.supported) setEstado("idle");
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

  return (
    <Sheet title="JARVIS" onClose={onClose}>
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
      <div class="stack" aria-live="polite">
        {[...chat].reverse().slice(0, 12).map((m, i) => (
          <div key={i} style={{ alignSelf: m.who === "u" ? "flex-end" : "flex-start", maxWidth: "88%", padding: "10px 13px", borderRadius: "14px", border: "1px solid var(--line)", background: m.who === "u" ? "var(--card2)" : "var(--card)", fontSize: "15px" }}>
            {m.text || "…"}
          </div>
        ))}
      </div>
      <p class="small" style={{ margin: 0 }}>
        Por ahora JARVIS maneja tu rutina y conversa. Anotar gastos hablando ("gasté 5 mil en comida") llega en la fase 4.
      </p>
    </Sheet>
  );
}
