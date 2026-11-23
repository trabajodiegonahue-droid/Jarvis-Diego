import { SPEECH_LANG } from "../config";

// ---------- Escuchar (Web Speech API) ----------
// En iPhone el reconocimiento existe en Safari, pero dentro de la app instalada en
// la pantalla de inicio puede fallar. Por eso siempre hay respaldo: el cuadro de
// texto con el dictado del teclado (el micrófono del teclado del iPhone).

export type ListenError = "unsupported" | "denied" | "no-speech" | "network" | "failed";

export function canListen(): boolean {
  return typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export type ListenOptions = {
  /** Silencio (ms) después de hablar que da por terminado el mensaje. */
  silencio?: number;
  /** Si no dices nada en este tiempo (ms), se rinde. */
  espera?: number;
  /** Tope total (ms) por si queda escuchando ruido. */
  maximo?: number;
};

// Escucha sin cortarse en las pausas: el mensaje se envía cuando dejas de hablar
// `silencio` ms (3 s). Safari a veces termina el reconocimiento solo a mitad de frase;
// en ese caso lo vuelve a arrancar y sigue sumando lo que dices. Llamar a stop()
// envía al tiro lo que lleva.
export function listenOnce(onPartial: (t: string) => void, opts: ListenOptions = {}): { promise: Promise<string>; stop: () => void } {
  const { silencio = 3000, espera = 8000, maximo = 60000 } = opts;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return { promise: Promise.reject("unsupported" as ListenError), stop: () => {} };
  let rec: any = null;
  let base = ""; // lo dicho en sesiones anteriores (si Safari cortó y se reinició)
  let actual = "";
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tope: ReturnType<typeof setTimeout> | undefined;
  let finish: (err?: ListenError) => void = () => {};
  const texto = () => actual.trim();

  const promise = new Promise<string>((resolve, reject) => {
    finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(tope);
      try { rec?.stop(); } catch { /* ya terminó */ }
      const t = texto();
      if (t) resolve(t);
      else reject(err || ("no-speech" as ListenError));
    };
    const armar = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(), ms);
    };
    const arrancar = () => {
      rec = new SR();
      rec.lang = SPEECH_LANG;
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e: any) => {
        let fin = "";
        let interim = "";
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) fin += r[0].transcript;
          else interim += r[0].transcript;
        }
        actual = [base, fin, interim].map((x) => x.trim()).filter(Boolean).join(" ");
        onPartial(texto());
        armar(silencio);
      };
      rec.onerror = (e: any) => {
        if (settled) return;
        if (e.error === "no-speech" || e.error === "aborted") return; // lo maneja onend / el reloj
        const map: Record<string, ListenError> = { "not-allowed": "denied", "service-not-allowed": "denied", network: "network" };
        if (texto() && !map[e.error]) return finish();
        settled = true;
        clearTimeout(timer);
        clearTimeout(tope);
        reject(map[e.error] || "failed");
      };
      rec.onend = () => {
        if (settled) return;
        // Safari cortó solo: guarda lo que llevaba y sigue escuchando.
        base = actual;
        try {
          arrancar();
        } catch {
          finish();
        }
      };
      rec.start();
    };
    try {
      arrancar();
      armar(espera);
      tope = setTimeout(() => finish(), maximo);
    } catch {
      settled = true;
      reject("failed" as ListenError);
    }
  });
  return { promise, stop: () => finish() };
}

// ---------- Hablar (speechSynthesis) ----------
// Se habla frase por frase a medida que llega el texto: así JARVIS empieza a hablar
// apenas hay una oración completa, sin esperar la respuesta entera.

export function splitSentences(buf: string): { done: string[]; rest: string } {
  // Una frase termina en . ! ? o salto de línea seguido de un espacio (así "18.30" no se corta).
  const done: string[] = [];
  let start = 0;
  for (let i = 0; i < buf.length - 1; i++) {
    if (/[.!?\n]/.test(buf[i]) && /\s/.test(buf[i + 1])) {
      const s = buf.slice(start, i + 1).trim();
      if (s) done.push(s);
      start = i + 1;
    }
  }
  return { done, rest: buf.slice(start).replace(/^\s+/, "") };
}

export function pickVoice(voices: SpeechSynthesisVoice[], preferred?: string): SpeechSynthesisVoice | null {
  if (preferred) {
    const v = voices.find((x) => x.voiceURI === preferred);
    if (v) return v;
  }
  const es = voices.filter((v) => /^es/i.test(v.lang));
  return es.find((v) => /es[-_]CL/i.test(v.lang)) || es.find((v) => /es[-_](419|MX|US)/i.test(v.lang)) || es.find((v) => /es[-_]ES/i.test(v.lang)) || es[0] || null;
}

// Para leer en voz alta: horas "18:00" → "18 horas", plata "$5.000" → "5000 pesos", sin símbolos raros.
export const forSpeech = (s: string) =>
  s
    .replace(/(-|\+)?\$(\d{1,3}(?:\.\d{3})*|\d+)\b/g, (_, sg, n) => `${sg === "-" ? "menos " : ""}${n.replace(/\./g, "")} pesos`)
    .replace(/\b(\d{1,2}):00\b/g, "$1 horas")
    .replace(/\b(\d{1,2}):(\d{2})\b/g, "$1 y $2")
    .replace(/[*_#`>]/g, "")
    .trim();

export class Speaker {
  private buf = "";
  private queue = 0;
  onStart: () => void = () => {};
  onEnd: () => void = () => {};
  voiceURI?: string;
  rate = 1.05;
  enabled = true;

  get supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  // iOS solo deja hablar después de un toque: se llama en el primer toque.
  unlock() {
    if (!this.supported) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  }

  feed(delta: string) {
    this.buf += delta;
    const { done, rest } = splitSentences(this.buf);
    this.buf = rest;
    done.forEach((s) => this.say(s));
  }

  flush() {
    const s = this.buf.trim();
    this.buf = "";
    if (s) this.say(s);
    else if (this.queue === 0) this.onEnd();
  }

  stop() {
    this.buf = "";
    this.queue = 0;
    if (this.supported) speechSynthesis.cancel();
    this.onEnd();
  }

  private say(text: string) {
    if (!this.enabled || !this.supported) return;
    const u = new SpeechSynthesisUtterance(forSpeech(text));
    const v = pickVoice(speechSynthesis.getVoices(), this.voiceURI);
    if (v) u.voice = v;
    u.lang = v?.lang || "es-ES";
    u.rate = this.rate;
    if (this.queue++ === 0) this.onStart();
    const done = () => {
      this.queue = Math.max(0, this.queue - 1);
      if (this.queue === 0 && !this.buf) this.onEnd();
    };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  }
}
