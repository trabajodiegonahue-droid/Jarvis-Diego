import { useEffect, useState } from "preact/hooks";
import { chileNow } from "../../core/time";
import { applyExtra, exportCSV, exportJSON, readJSON } from "../../data/backup";
import { clearPin, hasPin, setPin } from "../../core/pin";
import { store } from "../../data/store";
import { emptyDatos } from "../../data/types";
import { reloadJarvis, settings, speaker, tools, updateSettings } from "../../jarvis/instance";
import { calidadVoz, pickVoice, vocesEnEspanol } from "../../voice/speech";
import { GEMINI_MODEL } from "../../config";
import { askGemini, limpiarClave } from "../../brain/gemini";
import { FRIENDLY } from "../../brain/persona";
import { Empty, Sheet } from "../components";
import { buscarCiudad, type Ciudad } from "../../weather/clima";
import { Icon } from "../icons";
import { AREAS, CARDS, cardReady, getPrefs, go, kv, reloadPrefs, setPrefs, toast, useApp, type CardId } from "../state";

const GRUPOS: { titulo: string; items: { path: string; nombre: string; detalle: string; icon: string; color: string }[] }[] = [
  {
    titulo: "Tu día",
    items: [
      { path: "/metas", nombre: "Metas", detalle: "Ahorro, hábitos, cantidades y pasos, con simulador", icon: "metas", color: "#C9A227" },
      { path: "/mas/recordatorios", nombre: "Recordatorios", detalle: "Avisos, cumpleaños y lo que JARVIS recuerda", icon: "campana", color: "#E0A23B" },
      { path: "/mas/calendario", nombre: "Calendario", detalle: "Tu semana y lo que se cruza", icon: "calendario", color: "#E15A5A" },
      { path: "/mas/tiempo", nombre: "Mi tiempo", detalle: "Tu día al minuto, el mes y el año", icon: "reloj", color: "#4C8DF6" },
      { path: "/mas/habitos", nombre: "Hábitos y bienestar", detalle: "Rachas, sueño, ánimo y agua", icon: "habitos", color: "#1FA463" },
      { path: "/mas/compras", nombre: "Lista de compras", detalle: "Se llena hablándole a JARVIS", icon: "carro", color: "#D9775B" },
    ],
  },
  {
    titulo: "Áreas",
    items: [
      { path: "/mas/estudios", nombre: "Estudios", detalle: "Horas, pendientes y pruebas", icon: "libro", color: "#9B6BDE" },
      { path: "/mas/trabajo", nombre: "Trabajo", detalle: "Turnos, horas y propinas", icon: "trabajo", color: "#A98467" },
    ],
  },
  {
    titulo: "App",
    items: [{ path: "/mas/ajustes", nombre: "Ajustes", detalle: "JARVIS, respaldo, PIN, tarjetas y tema", icon: "ajustes", color: "#5E6B7D" }],
  },
];

export function Mas() {
  return (
    <main class="page">
      <header class="head">
        <h1>Más</h1>
      </header>
      {GRUPOS.map((g) => (
        <section key={g.titulo} class="stack" style={{ gap: "8px" }} aria-labelledby={`g-${g.titulo}`}>
          <h2 class="grupo" id={`g-${g.titulo}`}>
            {g.titulo}
          </h2>
          <div class="card menu">
            {g.items.map((s) => (
              <a key={s.path} href={`#${s.path}`}>
                <span class="ico" style={{ background: s.color }} aria-hidden="true">
                  <Icon name={s.icon} size={18} />
                </span>
                <span>
                  <span class="t">{s.nombre}</span>
                  <span class="d">{s.detalle}</span>
                </span>
                <Icon name="chevron" size={18} />
              </a>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function MascotaNombre() {
  const { prefs } = useApp();
  const [n, setN] = useState(prefs.mascota);
  return (
    <section class="card" aria-labelledby="a-mascota">
      <h2 id="a-mascota">Tu mascota</h2>
      <span class="small">Todo lo de tu mascota (paseos, comida, veterinario) queda en su propia área de Mi vida, con su nombre.</span>
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          setPrefs({ mascota: n.trim() });
          toast(n.trim() ? `Listo: ${n.trim()} tiene su área en Mi vida.` : "Guardado.");
        }}
      >
        <input aria-label="Nombre de tu mascota" placeholder="Nombre (por ejemplo: Apolo)" value={n} onInput={(e) => setN((e.target as HTMLInputElement).value)} style={{ flex: 1, minWidth: 0, minHeight: "44px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--card2)", color: "var(--text)", padding: "0 12px" }} />
        <button class="btn sm main">Guardar</button>
      </form>
    </section>
  );
}

function CiudadYAgua() {
  const { prefs } = useApp();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Ciudad[] | null>(null);
  return (
    <section class="card" aria-labelledby="a-clima">
      <h2 id="a-clima">Clima y bienestar</h2>
      <span class="small">Ciudad para el clima: {prefs.ciudad.nombre}</span>
      <form
        class="row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!q.trim()) return;
          try {
            setRes(await buscarCiudad(q.trim()));
          } catch {
            toast("No pude buscar: revisa tu internet.");
          }
        }}
      >
        <input aria-label="Buscar ciudad" placeholder="Buscar otra ciudad" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} style={{ flex: 1 }} />
        <button class="btn sm">Buscar</button>
      </form>
      {res && (
        <div class="chips">
          {res.length ? (
            res.map((c) => (
              <button
                key={c.nombre + c.lat}
                onClick={() => {
                  setPrefs({ ciudad: c });
                  setRes(null);
                  setQ("");
                  toast(`Clima de ${c.nombre.split(",")[0]}.`);
                }}
              >
                {c.nombre}
              </button>
            ))
          ) : (
            <span class="small">No encontré esa ciudad.</span>
          )}
        </div>
      )}
      <div class="between">
        <span>Meta de agua</span>
        <div class="row" style={{ gap: "6px" }}>
          <button class="icon-btn" aria-label="Menos vasos" onClick={() => setPrefs({ aguaMeta: Math.max(1, prefs.aguaMeta - 1) })}>
            −
          </button>
          <span class="num">{prefs.aguaMeta} vasos</span>
          <button class="icon-btn" aria-label="Más vasos" onClick={() => setPrefs({ aguaMeta: Math.min(20, prefs.aguaMeta + 1) })}>
            +
          </button>
        </div>
      </div>
      <span class="small">Clima: Open-Meteo.com (licencia CC BY 4.0, gratis para uso personal). Solo recibe las coordenadas de la ciudad.</span>
    </section>
  );
}

export function Pronto({ titulo, fase, texto }: { titulo: string; fase: number; texto: string }) {
  return (
    <main class="page">
      <header class="head">
        <h1>{titulo}</h1>
      </header>
      <div class="card">
        <Empty text={`${texto} Llega en la fase ${fase}.`} action="Volver al inicio" onAction={() => go("/")} />
      </div>
    </main>
  );
}

export function saveFile(name: string, text: string, type: string) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title: name }).then(() => true, (e) => (e?.name === "AbortError" ? false : download(file)));
  return Promise.resolve(download(file));
}
function download(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}

export function Ajustes() {
  const { prefs, data } = useApp();
  const [pinSheet, setPinSheet] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const hoy = chileNow().date;
  const cards = prefs.cards;
  const move = (i: number, d: number) => {
    const c = [...cards];
    const j = i + d;
    if (j < 0 || j >= c.length) return;
    [c[i], c[j]] = [c[j], c[i]];
    setPrefs({ cards: c });
  };

  return (
    <main class="page">
      <header class="head">
        <h1>Ajustes</h1>
      </header>

      <section class="card" aria-labelledby="a-resp">
        <h2 id="a-resp">Respaldo</h2>
        <p class="small" style={{ margin: 0 }}>
          Tus datos viven solo en este teléfono. Si lo pierdes o se borra el navegador, se pierden: guarda un respaldo seguido en Archivos, Drive o un correo para ti.
          {prefs.lastBackup ? ` Último: ${prefs.lastBackup}.` : " Todavía no guardas ninguno."}
        </p>
        <div class="grid2">
          <button
            class="btn sm"
            onClick={async () => {
              const ok = await saveFile(`vida-respaldo-${hoy}.json`, exportJSON(store.data, kv), "application/json");
              if (ok) {
                setPrefs({ lastBackup: hoy });
                toast("Respaldo listo.");
              }
            }}
          >
            <Icon name="download" size={18} /> Guardar respaldo
          </button>
          <label class="btn sm">
            <Icon name="upload" size={18} /> Restaurar
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                (e.target as HTMLInputElement).value = "";
                if (!f) return;
                try {
                  const r = readJSON(await f.text());
                  if (!confirm(`Esto reemplaza todo lo de ahora por el respaldo${r.exportedAt ? ` del ${r.exportedAt.slice(0, 10)}` : ""} (${r.datos.movimientos.length} movimientos). ¿Seguir?`)) return;
                  await store.replaceAll(r.datos);
                  applyExtra(kv, r.extra);
                  reloadPrefs();
                  reloadJarvis();
                  toast("Respaldo restaurado.");
                } catch (err) {
                  toast((err as Error).message);
                }
              }}
            />
          </label>
        </div>
        <button class="link" style={{ alignSelf: "flex-start" }} onClick={() => saveFile(`vida-movimientos-${hoy}.csv`, exportCSV(data), "text/csv")}>
          Exportar movimientos a CSV (para Excel o Sheets)
        </button>
        <p class="small" style={{ margin: 0 }}>
          El respaldo no incluye tu clave de Gemini.
        </p>
      </section>

      <section class="card" aria-labelledby="a-inicio">
        <h2 id="a-inicio">Tarjetas del inicio</h2>
        <p class="small" style={{ margin: 0 }}>
          Elige cuáles ver y en qué orden.
        </p>
        {cards.map((c, i) => (
          <div class="between" key={c.id} style={{ borderTop: i ? "1px solid var(--line)" : 0, paddingTop: i ? "6px" : 0 }}>
            <label class="row" style={{ minHeight: "44px", flex: 1 }}>
              <input type="checkbox" checked={c.on} style={{ width: "22px", height: "22px" }} onChange={() => setPrefs({ cards: cards.map((x) => (x.id === c.id ? { ...x, on: !x.on } : x)) })} />
              {CARDS.find((x) => x.id === (c.id as CardId))?.nombre}
              {!cardReady(c.id) && <span class="small"> · llega en la fase {CARDS.find((x) => x.id === c.id)?.fase}</span>}
            </label>
            <button class="icon-btn" aria-label="Subir" disabled={!i} onClick={() => move(i, -1)}>
              <Icon name="arriba" size={18} />
            </button>
            <button class="icon-btn" aria-label="Bajar" disabled={i === cards.length - 1} onClick={() => move(i, 1)}>
              <Icon name="abajo" size={18} />
            </button>
          </div>
        ))}
      </section>

      <section class="card" aria-labelledby="a-areas">
        <h2 id="a-areas">Qué quiero seguir</h2>
        <div class="chips">
          {AREAS.map((a) => {
            const on = prefs.areas.includes(a.id);
            return (
              <button key={a.id} class={on ? "on" : ""} aria-pressed={on} onClick={() => setPrefs({ areas: on ? prefs.areas.filter((x) => x !== a.id) : [...prefs.areas, a.id] })}>
                {a.nombre}
              </button>
            );
          })}
        </div>
      </section>

      <section class="card" aria-labelledby="a-tema">
        <h2 id="a-tema">Apariencia</h2>
        <div class="seg">
          {(["dark", "light", "auto"] as const).map((t) => (
            <button key={t} class={prefs.theme === t ? "on" : ""} aria-pressed={prefs.theme === t} onClick={() => setPrefs({ theme: t })}>
              {{ dark: "Oscuro", light: "Claro", auto: "Como el teléfono" }[t]}
            </button>
          ))}
        </div>
      </section>

      <CiudadYAgua />
      <MascotaNombre />

      <section class="card" aria-labelledby="a-pin">
        <h2 id="a-pin">Bloqueo con PIN</h2>
        <p class="small" style={{ margin: 0 }}>
          Pide un PIN al abrir la app. Sirve para que nadie mire tus datos si toma tu teléfono; no los cifra.
        </p>
        {hasPin(kv) ? (
          <button
            class="btn sm danger"
            onClick={() => {
              clearPin(kv);
              toast("PIN quitado.");
              setPrefs({});
            }}
          >
            Quitar PIN
          </button>
        ) : (
          <button class="btn sm" onClick={() => setPinSheet(true)}>
            <Icon name="lock" size={18} /> Poner PIN
          </button>
        )}
      </section>

      <JarvisAjustes />

      <section class="card" aria-labelledby="a-datos">
        <h2 id="a-datos">Datos</h2>
        {store.hasDemo() && (
          <button class="btn sm" onClick={() => store.removeDemo().then(() => toast("Datos de ejemplo borrados."))}>
            Borrar datos de ejemplo
          </button>
        )}
        <button class="btn sm danger" onClick={() => setBorrar(true)}>
          Borrar todo
        </button>
      </section>

      {pinSheet && <PinSheet onClose={() => setPinSheet(false)} />}
      {borrar && (
        <Sheet title="¿Borrar todo?" onClose={() => setBorrar(false)}>
          <p style={{ margin: 0 }}>Se borran todos tus movimientos, presupuestos y fijos de este teléfono. No se puede deshacer. Si quieres, guarda un respaldo antes.</p>
          <button
            class="btn danger full"
            onClick={async () => {
              await store.replaceAll(emptyDatos());
              setBorrar(false);
              toast("Listo, partimos de cero.");
            }}
          >
            Sí, borrar todo
          </button>
        </Sheet>
      )}
    </main>
  );
}

function PinSheet({ onClose }: { onClose: () => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <Sheet title="Poner PIN" onClose={onClose}>
      <p class="small" style={{ margin: 0 }}>
        De 4 a 6 números. Si lo olvidas: borra los datos de este sitio en Ajustes del iPhone y restaura tu respaldo.
      </p>
      <div class="field">
        <label class="lbl" for="pin-a">
          PIN
        </label>
        <input id="pin-a" type="password" inputMode="numeric" maxLength={6} value={a} onInput={(e) => setA((e.target as HTMLInputElement).value.replace(/\D/g, ""))} />
      </div>
      <div class="field">
        <label class="lbl" for="pin-b">
          Repite el PIN
        </label>
        <input id="pin-b" type="password" inputMode="numeric" maxLength={6} value={b} onInput={(e) => setB((e.target as HTMLInputElement).value.replace(/\D/g, ""))} />
      </div>
      <button
        class="btn main full"
        onClick={async () => {
          if (a !== b) return toast("Los PIN no coinciden.");
          try {
            await setPin(kv, a);
            onClose();
            toast("PIN puesto. Te lo pido al abrir la app.");
            setPrefs({});
          } catch (e) {
            toast((e as Error).message);
          }
        }}
      >
        Guardar PIN
      </button>
    </Sheet>
  );
}

// Elegir la voz de JARVIS y probarla. Las mejores ("Premium" o "Mejorada") se bajan gratis en el iPhone.
function VozJarvis({ voz, rate, onChange }: { voz: string; rate: number; onChange: (voiceURI: string, rate: number) => void }) {
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const cargar = () => setVoces(vocesEnEspanol(speechSynthesis.getVoices()));
    cargar();
    speechSynthesis.addEventListener?.("voiceschanged", cargar);
    return () => speechSynthesis.removeEventListener?.("voiceschanged", cargar);
  }, []);
  const actual = pickVoice(voces, voz);
  const buena = voces.some((v) => calidadVoz(v) >= 30);
  const probar = (uri: string, r: number) => {
    speaker.stop();
    const antes = { v: speaker.voiceURI, r: speaker.rate, e: speaker.enabled };
    speaker.voiceURI = uri;
    speaker.rate = r;
    speaker.enabled = true;
    speaker.unlock();
    speaker.feed("Hola Diego, soy JARVIS. Hoy tienes fútbol a las 15:30 y gimnasio a las 17:00. ");
    speaker.flush();
    Object.assign(speaker, { voiceURI: antes.v, rate: antes.r, enabled: antes.e });
  };
  if (!voces.length) return <span class="small">Este navegador no tiene voces en español para leer en voz alta.</span>;
  return (
    <div class="stack" style={{ gap: "8px" }}>
      <label class="lbl" for="g-voz">
        Voz de JARVIS
      </label>
      <div class="row">
        <select id="g-voz" value={actual?.voiceURI || ""} onChange={(e) => onChange((e.target as HTMLSelectElement).value, rate)} style={{ flex: 1, minWidth: 0, minHeight: "44px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--card2)", color: "var(--text)", padding: "0 10px" }}>
          {voces.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} ({v.lang.replace("_", "-")}){calidadVoz(v) >= 30 ? " ★" : ""}
            </option>
          ))}
        </select>
        <button class="btn sm" onClick={() => probar(actual?.voiceURI || "", rate)}>
          Probar
        </button>
      </div>
      <label class="lbl" for="g-rate">
        Velocidad: {rate.toFixed(2).replace(".", ",")}
      </label>
      <input id="g-rate" type="range" min="0.8" max="1.3" step="0.05" value={rate} onInput={(e) => onChange(actual?.voiceURI || "", Number((e.target as HTMLInputElement).value))} />
      {!buena && (
        <span class="small">
          Tu teléfono solo tiene voces básicas (suenan a robot). Para una mucho mejor: en el iPhone ve a <strong>Ajustes › Accesibilidad › Contenido leído › Voces › Español</strong>, baja una voz <strong>Mejorada</strong> o <strong>Premium</strong> (por ejemplo Paulina, Mónica o Jorge), vuelve aquí, elígela y toca Guardar.
        </span>
      )}
      {buena && <span class="small">Las marcadas con ★ son las de mejor calidad. Después de elegir, toca Guardar.</span>}
    </div>
  );
}

function JarvisAjustes() {
  const [s, setS] = useState({ ...settings });
  const prefs = getPrefs();
  return (
    <section class="card" aria-labelledby="a-jarvis">
      <h2 id="a-jarvis">JARVIS y Gemini</h2>
      <div class="seg">
        <button class={s.mode === "key" ? "on" : ""} onClick={() => setS({ ...s, mode: "key" })}>
          Clave en este teléfono
        </button>
        <button class={s.mode === "worker" ? "on" : ""} onClick={() => setS({ ...s, mode: "worker" })}>
          Intermediario
        </button>
      </div>
      {s.mode === "key" ? (
        <div class="field">
          <label class="lbl" for="g-key">
            Clave de Google AI Studio
          </label>
          <input id="g-key" type="password" autocomplete="off" autoCapitalize="off" spellcheck={false} value={s.apiKey || ""} onInput={(e) => setS({ ...s, apiKey: limpiarClave((e.target as HTMLInputElement).value) })} placeholder="AIza… o AQ.…" />
        </div>
      ) : (
        <>
          <div class="field">
            <label class="lbl" for="g-url">
              Dirección del intermediario
            </label>
            <input id="g-url" inputMode="url" autoCapitalize="off" value={s.workerUrl || ""} onInput={(e) => setS({ ...s, workerUrl: (e.target as HTMLInputElement).value.trim() })} />
          </div>
          <div class="field">
            <label class="lbl" for="g-tok">
              Código de acceso
            </label>
            <input id="g-tok" type="password" autoCapitalize="off" value={s.workerToken || ""} onInput={(e) => setS({ ...s, workerToken: (e.target as HTMLInputElement).value.trim() })} />
          </div>
        </>
      )}
      <div class="field">
        <label class="lbl" for="g-about">
          Lo que JARVIS sabe de ti
        </label>
        <textarea id="g-about" maxLength={1200} value={s.about} onInput={(e) => setS({ ...s, about: (e.target as HTMLTextAreaElement).value })} />
      </div>
      <label class="row" style={{ minHeight: "44px" }}>
        <input type="checkbox" checked={s.speak} onChange={(e) => setS({ ...s, speak: (e.target as HTMLInputElement).checked })} style={{ width: "22px", height: "22px" }} />
        Responder hablando
      </label>
      {s.speak && <VozJarvis voz={s.voiceURI} rate={s.rate} onChange={(voiceURI, rate) => setS({ ...s, voiceURI, rate })} />}
      <label class="row" style={{ minHeight: "44px" }}>
        <input type="checkbox" checked={prefs.privacy} onChange={(e) => setPrefs({ privacy: (e.target as HTMLInputElement).checked })} style={{ width: "22px", height: "22px" }} />
        Modo privado: no enviar datos de dinero a Gemini
      </label>
      <div class="row">
        <button
          class="btn sm main"
          onClick={() => {
            updateSettings(s);
            toast("Guardado.");
          }}
        >
          Guardar
        </button>
        <button
          class="btn sm"
          onClick={() => {
            updateSettings(s);
            toast("Probando…");
            // Se prueba igual que una conversación de verdad (con las herramientas), para pillar cualquier error.
            askGemini(settings, { system: "Responde solo: Conectado.", contents: [{ role: "user", parts: [{ text: "Hola" }] }], tools: tools.declarations(), maxTokens: 20, think: false })
              .then(() => toast("Conectado con Gemini. Bien ahí."))
              .catch((e) => toast(`${FRIENDLY[e?.kind] || FRIENDLY.generic}${e?.message ? ` (${e.message})` : ""}`));
          }}
        >
          Probar conexión
        </button>
      </div>
      <details>
        <summary style={{ cursor: "pointer", minHeight: "40px", fontWeight: 600 }}>Qué se le envía a Gemini</summary>
        <ul class="small" style={{ margin: "4px 0 0", paddingLeft: "18px", display: "grid", gap: "6px" }}>
          <li>Modelo {GEMINI_MODEL}, nivel gratis. Google puede usar lo que recibe para mejorar sus productos: no le cuentes nada sensible.</li>
          <li>Anotar ("gasté 5 mil en comida", "hice gym", "metí un gol") y las consultas típicas ("¿cuánto llevo gastado?", "resumen de la semana") se resuelven en el teléfono: no se envía nada.</li>
          <li>Cuando JARVIS no entiende la frase, se envía esa frase, tu rutina de hoy, lo que JARVIS sabe de ti (el texto de arriba) y un resumen corto de la conversación.</li>
          <li>Si Gemini necesita un dato de la app, se le pasa solo el resultado ya calculado (por ejemplo "llevas $80.000 este mes"), nunca tu lista de movimientos.</li>
          <li>Con el modo privado, ni ese resultado de dinero sale: tú lo ves en pantalla y Gemini solo sabe que respondiste. Las frases con plata que JARVIS no entiende tampoco se envían.</li>
          <li>Tu diario no se le manda nunca a Gemini. Tus hábitos y tu bitácora de tiempo tampoco: "¿en qué se me fue el día?" se calcula en el teléfono, y si Gemini necesita el dato recibe solo el resumen ("hoy registraste 9 h: trabajo 6 h…").</li>
          <li>El clima se pide a Open-Meteo con las coordenadas de tu ciudad, nada más.</li>
          <li>La clave o el código de acceso quedan solo en este teléfono. Los respaldos no los incluyen.</li>
        </ul>
      </details>
      <details>
        <summary style={{ cursor: "pointer", minHeight: "40px", fontWeight: 600 }}>Atajo de Siri: "Oye Siri, Jarvis"</summary>
        <div class="small stack" style={{ gap: "6px", marginTop: "4px" }}>
          <span>Necesita el intermediario de Cloudflare (modo "intermediario" arriba). En la app Atajos crea un atajo llamado Jarvis con estas acciones:</span>
          <ol style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "4px" }}>
            <li>Dictar texto (Dictate Text), idioma Español (Chile), y en «Dejar de escuchar» (Stop Listening) elige «Al tocar» (On Tap): así hablas tranquilo, con pausas, y tocas cuando terminas.</li>
            <li>Obtener contenido de URL (Get Contents of URL): {(settings.workerUrl || "https://tu-intermediario.workers.dev").replace(/\/+$/, "")}/siri, método POST, sin encabezados, y cuerpo JSON con dos campos de texto: texto = Texto dictado, y codigo = tu código de acceso.</li>
            <li>Leer texto en voz alta (Speak Text): Contenido de URL, idioma Español y una voz en español.</li>
          </ol>
          <span>
            <b>Qué hace:</b> todo lo que le cuentas ("me duele la rodilla", "gasté 5 lukas en completos", "salí con la polola") queda guardado y Siri te dice en qué área va. Se anota en Vida apenas la abres. "¿Qué tengo mañana?" te lo responde al tiro con tu agenda. Las preguntas generales las responde Gemini. Tus montos de plata no salen del teléfono: eso pregúntalo dentro de la app.
          </span>
          <b>Para no tener que abrir nada:</b>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "4px" }}>
            <li>Con la voz: "Oye Siri, Jarvis", incluso con el teléfono bloqueado o desde AirPods.</li>
            <li>Tocando la espalda del iPhone: Ajustes → Accesibilidad → Tocar → Tocar atrás → Doble toque → Jarvis.</li>
            <li>Con el botón de acción (iPhone 15 Pro o más nuevo): Ajustes → Botón de acción → Atajo → Jarvis.</li>
            <li>Desde el centro de control o la pantalla bloqueada: agrega el control "Atajo" y elige Jarvis.</li>
            <li>En el Apple Watch: el mismo atajo aparece en la app Atajos del reloj.</li>
          </ul>
        </div>
      </details>
    </section>
  );
}
