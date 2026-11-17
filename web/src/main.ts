import "./ui/styles.css";
import { Assistant } from "./brain/assistant";
import { askGemini } from "./brain/gemini";
import { GREETING, FRIENDLY } from "./brain/persona";
import { GEMINI_MODEL } from "./config";
import { isConnected, loadSettings, saveSettings, type Settings } from "./core/settings";
import { localKV } from "./core/storage";
import { chileNow, DAY_NAMES, parseHour } from "./core/time";
import { ALL_DAYS, daysLabel, Routine } from "./routine/routine";
import { ToolRegistry } from "./tools/registry";
import { routineTools } from "./tools/routineTools";
import { canListen, listenOnce, pickVoice, Speaker, type ListenError } from "./voice/speech";

// ---------- Armado ----------
const kv = localKV;
let settings: Settings = loadSettings(kv);
const routine = new Routine(kv);
const tools = new ToolRegistry();
tools.register(...routineTools(routine));
const assistant = new Assistant(tools, routine, () => settings, kv);
const speaker = new Speaker();
speaker.voiceURI = settings.voiceURI;
speaker.rate = settings.rate;
speaker.enabled = settings.speak;

type State = "idle" | "listening" | "thinking" | "speaking" | "error";
const ui = {
  tab: "hablar" as "hablar" | "rutina" | "ajustes",
  state: "idle" as State,
  detail: "",
  partial: "",
  chat: [{ who: "a", text: GREETING }] as { who: "u" | "a"; text: string; err?: boolean }[],
  greeted: false,
  dayView: chileNow().dow,
  newDays: [...ALL_DAYS],
  stopListen: null as null | (() => void),
};

const app = document.getElementById("app")!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

let toastT = 0;
function toast(msg: string) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastT);
  toastT = window.setTimeout(() => (el!.hidden = true), 3200);
}

// ---------- Estados ----------
const STATE_TXT: Record<State, string> = {
  idle: "Toca para hablar",
  listening: "Escuchando…",
  thinking: "Pensando…",
  speaking: "Hablando…",
  error: "Algo pasó",
};
function setState(s: State, detail = "") {
  ui.state = s;
  ui.detail = detail;
  const orb = document.getElementById("orb");
  const st = document.getElementById("state");
  if (orb) orb.className = "orb " + s;
  if (st) st.innerHTML = `${STATE_TXT[s]}${detail ? `<small>${esc(detail)}</small>` : ""}`;
}
speaker.onStart = () => setState("speaking");
let listenAfterSpeech = false;
speaker.onEnd = () => {
  if (ui.state === "speaking") setState("idle");
  if (listenAfterSpeech) {
    listenAfterSpeech = false;
    startListening();
  }
};

// ---------- Conversación ----------
async function send(text: string) {
  const said = text.trim();
  if (!said) return;
  speaker.stop();
  ui.chat.push({ who: "u", text: said });
  const msg = { who: "a" as const, text: "", err: false };
  ui.chat.push(msg);
  ui.chat = ui.chat.slice(-30);
  setState("thinking");
  renderChat();
  const reply = await assistant.handle(said, (d) => {
    msg.text += d;
    speaker.feed(d);
    renderChat();
  });
  msg.err = reply.source === "error";
  msg.text = reply.text;
  renderChat();
  speaker.flush();
  if (reply.source === "error") setState("error", reply.error === "quota" ? "Cuota gratis agotada" : "");
  else if (!speaker.enabled || !speaker.supported) setState("idle");
}

function startListening() {
  if (!canListen()) {
    focusText("Aquí no puedo escucharte directo. Toca el cuadro de texto y usa el micrófono del teclado.");
    return;
  }
  speaker.stop();
  setState("listening");
  ui.partial = "";
  const { promise, stop } = listenOnce((t) => {
    ui.partial = t;
    setState("listening", t);
  });
  ui.stopListen = stop;
  promise
    .then((t) => {
      ui.stopListen = null;
      send(t);
    })
    .catch((e: ListenError) => {
      ui.stopListen = null;
      const msg: Record<ListenError, string> = {
        unsupported: "Aquí no puedo escucharte directo. Usa el micrófono del teclado.",
        denied: "No tengo permiso para el micrófono. Actívalo en Ajustes del iPhone → Safari → Micrófono, o usa el dictado del teclado.",
        "no-speech": "No te escuché. Toca de nuevo y habla cerca del teléfono.",
        network: "El reconocimiento de voz necesita internet. Usa el dictado del teclado.",
        failed: "El micrófono falló. Usa el cuadro de texto con el dictado del teclado.",
      };
      if (e === "no-speech") setState("idle", msg[e]);
      else {
        setState("error", msg[e] || msg.failed);
        if (e !== "denied") focusText();
      }
    });
}

function focusText(hint?: string) {
  if (hint) toast(hint);
  const el = document.getElementById("txt") as HTMLInputElement | null;
  el?.focus();
}

function greetOnce() {
  if (ui.greeted) return;
  ui.greeted = true;
  speaker.unlock();
  speaker.feed(GREETING + " ");
  speaker.flush();
}

// ---------- Vistas ----------
function connPill() {
  if (!isConnected(settings)) return `<span class="pill warn">Sin Gemini</span>`;
  return navigator.onLine ? `<span class="pill ok">En línea</span>` : `<span class="pill warn">Sin internet</span>`;
}

function viewHablar() {
  const n = chileNow();
  const { current, next } = routine.now(n);
  const nowLine = current ? `Ahora: ${current.title} (${current.time})` : next ? `Lo próximo: ${next.title} a las ${next.time}` : "Hoy no te queda nada en la rutina.";
  return `
  <div class="stage">
    <button id="orb" class="orb ${ui.state}" aria-label="Hablar con JARVIS"><span class="core"></span><span class="mic">${canListen() ? "Hablar" : "Escribir"}</span></button>
    <div id="state" class="state" aria-live="polite">${STATE_TXT[ui.state]}${ui.detail ? `<small>${esc(ui.detail)}</small>` : ""}</div>
  </div>
  <p class="hint" style="text-align:center">${esc(nowLine)}</p>
  <form id="compose" class="compose" autocomplete="off">
    <input id="txt" enterkeyhint="send" placeholder="Escribe o dicta con el micrófono del teclado" aria-label="Mensaje para JARVIS" />
    <button class="btn main" aria-label="Enviar">➤</button>
  </form>
  <div id="chat" class="chat" aria-live="polite"></div>`;
}

function renderChat() {
  const el = document.getElementById("chat");
  if (!el) return;
  el.innerHTML = ui.chat
    .slice(-12)
    .reverse()
    .map((m) => `<div class="msg ${m.who}${m.err ? " err" : ""}">${esc(m.text || "…")}</div>`)
    .join("");
}

function viewRutina() {
  const n = chileNow();
  const d = ui.dayView;
  const list = routine.forDay(d);
  const isToday = d === n.dow;
  const { current } = isToday ? routine.now(n) : { current: null };
  return `
  <div class="card">
    <div class="row" style="justify-content:space-between"><h2>Rutina</h2><span class="tm">${isToday ? "Hoy" : ""} ${esc(DAY_NAMES[d])}</span></div>
    <div class="days">${DAY_NAMES.map((x, i) => `<button class="${i === d ? "on" : ""}" data-day="${i}" aria-label="${x}">${x[0].toUpperCase()}</button>`).join("")}</div>
    <div>${
      list.length
        ? list
            .map((t) => {
              const done = isToday && t.done.includes(n.date);
              return `<div class="task ${done ? "done" : ""} ${current?.id === t.id ? "now" : ""}">
          <button class="chk" data-check="${t.id}" ${isToday ? "" : "disabled"} aria-pressed="${done}" aria-label="Tachar ${esc(t.title)}">${done ? "✓" : ""}</button>
          <div><div class="tt">${esc(t.title)}</div><div class="tm">${t.time} · ${esc(daysLabel(t.days))}</div></div>
          <button class="x" data-del="${t.id}" aria-label="Quitar ${esc(t.title)}">✕</button></div>`;
            })
            .join("")
        : `<p class="hint">Nada este día. Agrega algo abajo o dile a JARVIS: "agrega estudiar inglés a las 18:00".</p>`
    }</div>
  </div>
  <form id="addf" class="card" autocomplete="off">
    <h2>Agregar tarea</h2>
    <div class="field"><label class="lbl" for="a-t">Qué</label><input id="a-t" required maxlength="60" placeholder="Estudiar inglés" /></div>
    <div class="field" style="max-width:160px"><label class="lbl" for="a-h">Hora</label><input id="a-h" type="time" required value="18:00" /></div>
    <span class="lbl">Días</span>
    <div class="days">${DAY_NAMES.map((x, i) => `<button type="button" class="${ui.newDays.includes(i) ? "on" : ""}" data-nday="${i}" aria-pressed="${ui.newDays.includes(i)}" aria-label="${x}">${x[0].toUpperCase()}</button>`).join("")}</div>
    <button class="btn main">Agregar</button>
  </form>
  <div class="card">
    <h2>Respaldo</h2>
    <p class="hint">Tu rutina vive solo en este teléfono. Descarga una copia de vez en cuando y guárdala en Archivos o Drive.</p>
    <div class="row"><button class="btn" data-export>Descargar copia</button><label class="btn" style="display:grid;place-items:center">Restaurar copia<input type="file" id="imp" accept="application/json,.json" hidden /></label></div>
  </div>`;
}

function viewAjustes() {
  const s = settings;
  const voices = "speechSynthesis" in window ? speechSynthesis.getVoices().filter((v) => /^es/i.test(v.lang)) : [];
  const cur = pickVoice(voices, s.voiceURI);
  return `
  <div class="card">
    <h2>Conexión con Gemini</h2>
    <div class="seg"><button class="${s.mode === "key" ? "on" : ""}" data-mode="key">Clave en este teléfono</button><button class="${s.mode === "worker" ? "on" : ""}" data-mode="worker">Intermediario (Cloudflare)</button></div>
    ${
      s.mode === "key"
        ? `<div class="field"><label class="lbl" for="s-key">Clave de Google AI Studio</label><input id="s-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(s.apiKey || "")}" placeholder="AIza…" /></div>
      <p class="hint">La clave queda guardada solo en este teléfono y nunca va a GitHub. Riesgo: si alguien toma tu teléfono desbloqueado, podría copiarla. Usa una clave hecha solo para JARVIS, limitada a la API de Gemini.</p>`
        : `<div class="field"><label class="lbl" for="s-url">Dirección del intermediario</label><input id="s-url" inputmode="url" autocapitalize="off" spellcheck="false" value="${esc(s.workerUrl || "")}" placeholder="https://jarvis.tu-usuario.workers.dev" /></div>
      <div class="field"><label class="lbl" for="s-tok">Tu código de acceso</label><input id="s-tok" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(s.workerToken || "")}" /></div>
      <p class="hint">La clave de Gemini vive en Cloudflare, no en el teléfono. Este código solo deja usar tu intermediario.</p>`
    }
    <div class="row"><button class="btn main sm" data-save>Guardar</button><button class="btn sm" data-test>Probar conexión</button></div>
    <p class="hint">Modelo: ${esc(GEMINI_MODEL)} · nivel gratuito. Lo que le preguntas a Gemini gratis puede usarse para mejorar productos de Google: no le cuentes datos sensibles.</p>
  </div>
  <div class="card">
    <h2>Voz</h2>
    <div class="seg"><button class="${s.speak ? "on" : ""}" data-speak="1">Responder hablando</button><button class="${!s.speak ? "on" : ""}" data-speak="0">Solo texto</button></div>
    <div class="field"><label class="lbl" for="s-voice">Voz</label><select id="s-voice">${
      voices.length ? voices.map((v) => `<option value="${esc(v.voiceURI)}" ${cur?.voiceURI === v.voiceURI ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("") : `<option>Voz del sistema</option>`
    }</select></div>
    <div class="field"><label class="lbl" for="s-rate">Velocidad: <span id="rate-v">${s.rate.toFixed(2)}</span></label><input id="s-rate" type="range" min="0.8" max="1.4" step="0.05" value="${s.rate}" /></div>
    <button class="btn sm" data-tryvoice>Probar voz</button>
    <p class="hint">${canListen() ? "Este navegador puede escucharte." : "Este navegador no puede escucharte directo: usa el micrófono del teclado."} En el iPhone, la voz más natural se descarga en Ajustes → Accesibilidad → Contenido leído → Voces → Español.</p>
  </div>
  <div class="card">
    <h2>Conversación</h2>
    <p class="hint">JARVIS recuerda las últimas frases para seguir el hilo, y resume lo antiguo para no gastar cuota.</p>
    <button class="btn sm danger" data-clear>Borrar conversación</button>
  </div>`;
}

function render() {
  const views = { hablar: viewHablar, rutina: viewRutina, ajustes: viewAjustes };
  app.innerHTML = `<div class="wrap">
    <div class="top"><span class="brand">J.A.R.V.I.S.</span>${connPill()}</div>
    ${views[ui.tab]()}
  </div>
  <nav class="tabs">${(["hablar", "rutina", "ajustes"] as const).map((t) => `<button class="${ui.tab === t ? "on" : ""}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</nav>`;
  if (ui.tab === "hablar") renderChat();
}

// ---------- Eventos ----------
document.addEventListener("pointerdown", () => greetOnce(), { once: true, capture: true });

app.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  const D = b.dataset;
  if (b.id === "orb") {
    if (ui.state === "listening") return ui.stopListen?.();
    // Primer toque: deja terminar el saludo y después escucha.
    if (ui.state === "speaking" && ui.chat.length === 1) return void (listenAfterSpeech = true);
    if (ui.state === "speaking") return speaker.stop();
    if (ui.state === "thinking") return;
    return startListening();
  }
  if (D.tab) {
    ui.tab = D.tab as typeof ui.tab;
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (D.day) {
    ui.dayView = Number(D.day);
    return render();
  }
  if (D.nday) {
    const i = Number(D.nday);
    ui.newDays = ui.newDays.includes(i) ? ui.newDays.filter((x) => x !== i) : [...ui.newDays, i];
    return render();
  }
  if (D.check) {
    const t = routine.tasks.find((x) => x.id === D.check);
    if (!t) return;
    const n = chileNow();
    if (t.done.includes(n.date)) routine.uncheck(t, n.date);
    else {
      routine.check(t, n.date);
      toast(`Tachado ${t.title}. Bien ahí.`);
    }
    return render();
  }
  if (D.del) {
    const t = routine.tasks.find((x) => x.id === D.del);
    if (t && confirm(`¿Quitar "${t.title}" de tu rutina?`)) {
      routine.remove(t);
      render();
    }
    return;
  }
  if (D.export !== undefined) return exportBackup();
  if (D.mode) {
    readSettingsForm();
    settings.mode = D.mode as Settings["mode"];
    return render();
  }
  if (D.save !== undefined) {
    readSettingsForm();
    saveSettings(kv, settings);
    toast("Guardado.");
    return render();
  }
  if (D.test !== undefined) {
    readSettingsForm();
    saveSettings(kv, settings);
    toast("Probando…");
    askGemini(settings, { system: "Responde solo: Conectado.", contents: [{ role: "user", parts: [{ text: "Hola" }] }], maxTokens: 20 })
      .then(() => toast("Conectado con Gemini. Bien ahí."))
      .catch((err) => toast(FRIENDLY[err?.kind] || FRIENDLY.generic));
    return;
  }
  if (D.speak) {
    settings.speak = D.speak === "1";
    speaker.enabled = settings.speak;
    saveSettings(kv, settings);
    return render();
  }
  if (D.tryvoice !== undefined) {
    speaker.unlock();
    speaker.feed("Hola Diego, así sueno. ");
    speaker.flush();
    return;
  }
  if (D.clear !== undefined) {
    assistant.clearHistory();
    ui.chat = [{ who: "a", text: GREETING }];
    toast("Conversación borrada.");
  }
});

app.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target as HTMLFormElement;
  if (f.id === "compose") {
    const el = document.getElementById("txt") as HTMLInputElement;
    const v = el.value;
    el.value = "";
    greetOnce();
    send(v);
  }
  if (f.id === "addf") {
    const title = (document.getElementById("a-t") as HTMLInputElement).value.trim();
    const time = parseHour((document.getElementById("a-h") as HTMLInputElement).value);
    if (!title || !time) return toast("Falta el nombre o la hora.");
    if (!ui.newDays.length) return toast("Elige al menos un día.");
    const t = routine.add(title, time, ui.newDays);
    toast(`Agregado: ${t.title} a las ${t.time}.`);
    render();
  }
});

app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "imp" && el.files?.[0]) {
    el.files[0]
      .text()
      .then((txt) => {
        if (!confirm("Esto reemplaza tu rutina actual por la del respaldo. ¿Seguir?")) return;
        const n = routine.importJSON(txt);
        toast(`Listo, recuperé ${n} tareas.`);
        render();
      })
      .catch((err) => toast(err?.message || "No pude leer ese archivo."));
  }
  if (el.id === "s-voice") {
    settings.voiceURI = el.value;
    speaker.voiceURI = el.value;
    saveSettings(kv, settings);
  }
});

app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "s-rate") {
    settings.rate = Number(el.value);
    speaker.rate = settings.rate;
    document.getElementById("rate-v")!.textContent = settings.rate.toFixed(2);
    saveSettings(kv, settings);
  }
});

function readSettingsForm() {
  const v = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim();
  if (settings.mode === "key") {
    const k = v("s-key");
    if (k !== undefined) settings.apiKey = k;
  } else {
    const u = v("s-url");
    const t = v("s-tok");
    if (u !== undefined) settings.workerUrl = u;
    if (t !== undefined) settings.workerToken = t;
  }
}

async function exportBackup() {
  const data = routine.exportJSON();
  const name = `jarvis-rutina-${chileNow().date}.json`;
  const file = new File([data], name, { type: "application/json" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

window.addEventListener("online", render);
window.addEventListener("offline", render);
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => ui.tab === "ajustes" && render();
// Cada minuto se actualiza "lo que toca ahora".
setInterval(() => ui.tab !== "ajustes" && ui.state === "idle" && !document.activeElement?.matches("input") && render(), 60000);

render();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
