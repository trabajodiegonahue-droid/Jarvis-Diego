import { useState } from "preact/hooks";
import { chileNow } from "../../core/time";
import { applyExtra, exportCSV, exportJSON, readJSON } from "../../data/backup";
import { clearPin, hasPin, setPin } from "../../core/pin";
import { store } from "../../data/store";
import { emptyDatos } from "../../data/types";
import { reloadJarvis, settings, updateSettings } from "../../jarvis/instance";
import { GEMINI_MODEL } from "../../config";
import { askGemini } from "../../brain/gemini";
import { FRIENDLY } from "../../brain/persona";
import { Empty, Sheet } from "../components";
import { Icon } from "../icons";
import { AREAS, CARDS, cardReady, getPrefs, go, kv, reloadPrefs, setPrefs, toast, useApp, type CardId } from "../state";

const SECCIONES = [
  { path: "/mas/estudios", nombre: "Estudios", icon: "libro", fase: 2 },
  { path: "/mas/trabajo", nombre: "Trabajo", icon: "trabajo", fase: 2 },
  { path: "/mas/habitos", nombre: "Hábitos y bienestar", icon: "habitos", fase: 5 },
  { path: "/mas/calendario", nombre: "Calendario", icon: "calendario", fase: 5 },
  { path: "/mas/ajustes", nombre: "Ajustes", icon: "ajustes", fase: 0 },
];

export function Mas() {
  return (
    <main class="page">
      <header class="head">
        <h1>Más</h1>
      </header>
      <div class="card" style={{ gap: 0, padding: "4px 16px" }}>
        {SECCIONES.map((s) => (
          <a key={s.path} href={`#${s.path}`} class="item" style={{ textDecoration: "none", color: "inherit", gridTemplateColumns: "28px minmax(0,1fr) auto" }}>
            <Icon name={s.icon} />
            <span class="t">{s.nombre}</span>
            <Icon name="chevron" size={18} />
          </a>
        ))}
      </div>
    </main>
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

function saveFile(name: string, text: string, type: string) {
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
          <input id="g-key" type="password" autocomplete="off" autoCapitalize="off" spellcheck={false} value={s.apiKey || ""} onInput={(e) => setS({ ...s, apiKey: (e.target as HTMLInputElement).value.trim() })} placeholder="AIza…" />
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
            askGemini(settings, { system: "Responde solo: Conectado.", contents: [{ role: "user", parts: [{ text: "Hola" }] }], maxTokens: 20, think: false })
              .then(() => toast("Conectado con Gemini. Bien ahí."))
              .catch((e) => toast(FRIENDLY[e?.kind] || FRIENDLY.generic));
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
          <li>La clave o el código de acceso quedan solo en este teléfono. Los respaldos no los incluyen.</li>
        </ul>
      </details>
      <details>
        <summary style={{ cursor: "pointer", minHeight: "40px", fontWeight: 600 }}>Atajo de Siri: "Oye Siri, Jarvis"</summary>
        <div class="small stack" style={{ gap: "6px", marginTop: "4px" }}>
          <span>Necesita el intermediario de Cloudflare (modo "intermediario" arriba). En la app Atajos crea un atajo llamado Jarvis con estas acciones:</span>
          <ol style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "4px" }}>
            <li>Dictar texto (idioma español).</li>
            <li>Obtener contenido de URL: {(settings.workerUrl || "https://tu-intermediario.workers.dev").replace(/\/+$/, "")}/siri, método POST, encabezado Authorization con el valor "Bearer " más tu código de acceso, y cuerpo JSON con la clave texto = Texto dictado.</li>
            <li>Leer texto en voz alta: Contenido de URL.</li>
          </ol>
          <span>Lo que es para anotar ("gasté 5 mil en almuerzo", "hice gym") queda en un buzón y se anota acá apenas abres Vida. Las preguntas generales las responde Gemini al tiro. Lo que vive en el teléfono (tus gastos, tu rutina) Siri no lo puede leer: eso pregúntalo dentro de la app.</span>
        </div>
      </details>
    </section>
  );
}
