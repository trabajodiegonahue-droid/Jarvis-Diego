// Recordatorios, fechas importantes, lo que JARVIS recuerda y los avisos en el iPhone.
import { useState } from "preact/hooks";
import { chileNow } from "../../core/time";
import { store } from "../../data/store";
import { uid, type FechaImportante, type Recordatorio } from "../../data/types";
import { esSensible, fechaTxt, proximasFechas } from "../../extras/calc";
import { exportarIcs } from "../../jarvis/avisos";
import { activarPush, desactivarPush, pushPosible, sincronizarPush, type EstadoPush } from "../../jarvis/avisosApp";
import { routine } from "../../jarvis/instance";
import { ahoraIso, cuandoTxt, original, parseCuando, proximos, REPETIR_TXT } from "../../reminders/calc";
import { Empty } from "../components";
import { Icon } from "../icons";
import { setPrefs, toast, useApp } from "../state";
import { saveFile } from "./Mas";

type Tab = "recordatorios" | "fechas" | "memoria" | "avisos";
const inp = { minHeight: "48px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 14px", flex: 1 } as const;

export function Recordatorios() {
  const [tab, setTab] = useState<Tab>(() => (location.hash.includes("avisos") ? "avisos" : "recordatorios"));
  return (
    <main class="page">
      <header class="head">
        <h1>Recordatorios</h1>
      </header>
      <div class="seg tabs4" role="tablist" aria-label="Secciones">
        {(
          [
            ["recordatorios", "Avisos"],
            ["fechas", "Fechas"],
            ["memoria", "Memoria"],
            ["avisos", "iPhone"],
          ] as [Tab, string][]
        ).map(([t, n]) => (
          <button key={t} role="tab" aria-selected={tab === t} class={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {n}
          </button>
        ))}
      </div>
      {tab === "recordatorios" ? <ListaRecordatorios /> : tab === "fechas" ? <Fechas /> : tab === "memoria" ? <Memoria /> : <AvisosIphone />}
    </main>
  );
}

function ListaRecordatorios() {
  const { data } = useApp();
  const n = chileNow();
  const ahora = ahoraIso(n.date, n.minutes);
  const [txt, setTxt] = useState("");
  const pendientes = proximos(data.recordatorios, ahora, 3650);
  const vencidos = data.recordatorios.filter((r) => !r.hecho && r.cuando <= ahora);
  const hechos = data.recordatorios.filter((r) => r.hecho).sort((a, b) => b.cuando.localeCompare(a.cuando)).slice(0, 5);

  async function crear(e: Event) {
    e.preventDefault();
    const t = txt.trim();
    if (!t) return;
    const c = parseCuando(t, n.date, n.minutes);
    if (!c) return toast('Dime cuándo: por ejemplo "pagar la luz el viernes a las 10".');
    const texto = original(t, c.resto.replace(/^(recuerdame|recordarme|avisame)\s+/i, "").replace(/^(que|de|para)\s+/i, "").trim()) || t;
    const r: Recordatorio = { id: uid(), texto: texto.charAt(0).toUpperCase() + texto.slice(1), cuando: `${c.fecha}T${c.hora}`, ...(c.repetir ? { repetir: c.repetir } : {}) };
    await store.put("recordatorios", r);
    setTxt("");
    toast(`Te aviso ${cuandoTxt(r.cuando, n.date)}${r.repetir ? `, ${REPETIR_TXT[r.repetir]}` : ""}.`, () => void store.remove("recordatorios", r.id));
  }

  return (
    <>
      <form class="card" onSubmit={crear} style={{ gap: "8px" }}>
        <label class="lbl" for="rec-n">
          Nuevo recordatorio
        </label>
        <div class="row">
          <input id="rec-n" style={inp} placeholder="Pagar la luz el viernes a las 10" value={txt} onInput={(e) => setTxt((e.target as HTMLInputElement).value)} />
          <button class="btn main" aria-label="Crear recordatorio">
            <Icon name="plus" size={20} />
          </button>
        </div>
        <span class="small">Escríbelo como lo dirías: "llamar a la abuela mañana a las 7", "gym todos los lunes a las 8", "sacar la ropa en 40 minutos". También se lo puedes decir a JARVIS: "recuérdame…".</span>
      </form>
      {vencidos.length > 0 && (
        <div class="card" style={{ borderColor: "var(--amber)" }}>
          <h2>Se te pasaron</h2>
          {vencidos.map((r) => (
            <Fila key={r.id} r={r} hoy={n.date} />
          ))}
        </div>
      )}
      <div class="card">
        <h2>Lo que viene</h2>
        {pendientes.length ? pendientes.map((r) => <Fila key={r.id} r={r} hoy={n.date} />) : <Empty text="No tienes recordatorios pendientes." />}
      </div>
      {hechos.length > 0 && (
        <details class="card">
          <summary style={{ cursor: "pointer", minHeight: "36px", fontWeight: 600 }}>Ya avisados</summary>
          {hechos.map((r) => (
            <Fila key={r.id} r={r} hoy={n.date} />
          ))}
        </details>
      )}
    </>
  );
}

function Fila({ r, hoy }: { r: Recordatorio; hoy: string }) {
  return (
    <div class="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
      <div class="stack" style={{ gap: "2px" }}>
        <span class="t" style={{ textDecoration: r.hecho ? "line-through" : "none", color: r.hecho ? "var(--muted)" : undefined }}>
          {r.texto}
        </span>
        <span class="small">
          {cuandoTxt(r.cuando, hoy)}
          {r.repetir ? ` · ${REPETIR_TXT[r.repetir]}` : ""}
        </span>
      </div>
      <button
        class="icon-btn"
        aria-label={`Borrar ${r.texto}`}
        onClick={async () => {
          const u = await store.remove("recordatorios", r.id);
          toast("Recordatorio borrado.", () => void u());
        }}
      >
        <Icon name="trash" size={18} />
      </button>
    </div>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function Fechas() {
  const { data } = useApp();
  const hoy = chileNow().date;
  const [nombre, setNombre] = useState("");
  const [dia, setDia] = useState("");
  const [mes, setMes] = useState(1);
  const [anio, setAnio] = useState("");
  const [tipo, setTipo] = useState<FechaImportante["tipo"]>("cumple");
  const lista = proximasFechas(data.fechas, hoy, 366);
  async function crear(e: Event) {
    e.preventDefault();
    const d = Number(dia);
    if (!nombre.trim() || !(d >= 1 && d <= 31)) return toast("Pon el nombre y el día.");
    const quien = nombre.trim();
    const f: FechaImportante = { id: uid(), nombre: tipo === "cumple" && !/^cumple/i.test(quien) ? `Cumpleaños de ${quien}` : quien, dia: `${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`, tipo, ...(Number(anio) > 1900 ? { anio: Number(anio) } : {}) };
    await store.put("fechas", f);
    setNombre("");
    setDia("");
    setAnio("");
    toast("Fecha guardada.", () => void store.remove("fechas", f.id));
  }
  return (
    <>
      <form class="card" onSubmit={crear} style={{ gap: "10px" }}>
        <h2>Nueva fecha</h2>
        <div class="chips">
          {(
            [
              ["cumple", "Cumpleaños"],
              ["aniversario", "Aniversario"],
              ["otro", "Otra"],
            ] as [FechaImportante["tipo"], string][]
          ).map(([t, n]) => (
            <button type="button" key={t} class={tipo === t ? "on" : ""} aria-pressed={tipo === t} onClick={() => setTipo(t)}>
              {n}
            </button>
          ))}
        </div>
        <input aria-label={tipo === "cumple" ? "De quién" : "Nombre"} style={inp} placeholder={tipo === "cumple" ? "De quién (mi mamá, la Cata…)" : "Nombre"} value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
        <div class="row" style={{ gap: "8px" }}>
          <input aria-label="Día" style={{ ...inp, flex: "0 0 72px" }} inputMode="numeric" placeholder="Día" value={dia} onInput={(e) => setDia((e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 2))} />
          <select aria-label="Mes" style={inp} value={mes} onChange={(e) => setMes(Number((e.target as HTMLSelectElement).value))}>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <input aria-label="Año (opcional)" style={{ ...inp, flex: "0 0 92px" }} inputMode="numeric" placeholder="Año" value={anio} onInput={(e) => setAnio((e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 4))} />
        </div>
        <button class="btn main full">Guardar</button>
        <span class="small">Te aviso 3 días antes (para el regalo) y la noche anterior. El año es opcional: sirve para decirte cuántos cumple.</span>
      </form>
      <div class="card">
        <h2>Próximas</h2>
        {!lista.length ? (
          <Empty text='Todavía no tienes fechas. También puedes decirle a JARVIS: "el cumpleaños de mi mamá es el 3 de mayo".' />
        ) : (
          lista.map((p) => (
            <div key={p.f.id} class="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <div class="stack" style={{ gap: "2px" }}>
                <span class="t">{p.f.nombre}</span>
                <span class="small">
                  {fechaTxt(p.f.dia)} · {p.enDias === 0 ? "¡hoy!" : p.enDias === 1 ? "mañana" : `en ${p.enDias} días`}
                  {p.cumple && p.f.tipo === "cumple" ? ` · cumple ${p.cumple}` : ""}
                </span>
              </div>
              <button
                class="icon-btn"
                aria-label={`Borrar ${p.f.nombre}`}
                onClick={async () => {
                  const u = await store.remove("fechas", p.f.id);
                  toast("Fecha borrada.", () => void u());
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function Memoria() {
  const { data } = useApp();
  const [txt, setTxt] = useState("");
  const rs = [...data.recuerdos].sort((a, b) => b.creado.localeCompare(a.creado));
  return (
    <>
      <form
        class="card"
        style={{ gap: "8px" }}
        onSubmit={async (e) => {
          e.preventDefault();
          const t = txt.trim();
          if (!t) return;
          if (esSensible(t)) return toast("Eso parece una clave o un dato de tarjeta: mejor no lo guardo.");
          const n = chileNow();
          const c = parseCuando(t, n.date, n.minutes);
          const r = { id: uid(), texto: t.charAt(0).toUpperCase() + t.slice(1), creado: n.date, ...(c && !c.repetir ? { fecha: c.fecha } : {}) };
          await store.put("recuerdos", r);
          setTxt("");
          toast("JARVIS se va a acordar.", () => void store.remove("recuerdos", r.id));
        }}
      >
        <label class="lbl" for="mem-n">
          Algo que JARVIS debe saber
        </label>
        <div class="row">
          <input id="mem-n" style={inp} placeholder="El viernes tengo prueba de inglés" value={txt} onInput={(e) => setTxt((e.target as HTMLInputElement).value)} />
          <button class="btn main" aria-label="Guardar recuerdo">
            <Icon name="plus" size={20} />
          </button>
        </div>
        <span class="small">JARVIS lo usa cuando viene al caso y te lo menciona el día que corresponde. A Gemini solo le llegan los recuerdos que tienen que ver con lo que le preguntas. Nunca guarda claves ni datos de tarjetas.</span>
      </form>
      <div class="card">
        <h2>Lo que JARVIS recuerda</h2>
        {!rs.length ? (
          <Empty text='Nada todavía. Dile por ejemplo "acuérdate que me lesioné el tobillo izquierdo".' />
        ) : (
          rs.map((r) => (
            <div key={r.id} class="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <div class="stack" style={{ gap: "2px" }}>
                <span>{r.texto}</span>
                <span class="small">{r.fecha ? `Para el ${fechaTxt(r.fecha.slice(5))}` : `Contado el ${fechaTxt(r.creado.slice(5))}`}</span>
              </div>
              <button
                class="icon-btn"
                aria-label={`Olvidar: ${r.texto}`}
                onClick={async () => {
                  const u = await store.remove("recuerdos", r.id);
                  toast("Olvidado.", () => void u());
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

const ESTADO: Record<EstadoPush, string> = {
  listo: "Listo: los avisos van a llegar a este iPhone aunque la app esté cerrada.",
  "sin-intermediario": "Los avisos con la app cerrada necesitan el intermediario de Cloudflare (Ajustes → JARVIS y Gemini). Mientras, puedes exportar al Calendario.",
  "no-soportado": "Este navegador no permite avisos de una página web. Usa Exportar al Calendario.",
  instalar: "En el iPhone, los avisos solo funcionan con Vida agregada a la pantalla de inicio (Compartir → Agregar a inicio) y abierta desde ahí.",
  denegado: "No diste permiso para las notificaciones. Se activa en Ajustes del iPhone → Notificaciones → Vida.",
  error: "No pude activar los avisos. Revisa que el intermediario tenga el buzón y las claves de avisos (README).",
};

function AvisosIphone() {
  const { data, prefs } = useApp();
  const [estado, setEstado] = useState<EstadoPush | null>(prefs.avisos.activos ? "listo" : pushPosible());
  const [cargando, setCargando] = useState(false);
  const a = prefs.avisos;
  const cambiar = (patch: Partial<typeof a>) => {
    setPrefs({ avisos: { ...a, ...patch } });
    void sincronizarPush(true);
  };
  return (
    <>
      <div class="card" style={{ gap: "10px" }}>
        <h2>Avisos en el iPhone</h2>
        <span class="small">Te llegan aunque la app esté cerrada: tus recordatorios, lo que te toca cada mañana, lo de mañana en la noche, tu rutina 10 minutos antes y los cumpleaños.</span>
        {a.activos ? (
          <button
            class="btn full"
            onClick={async () => {
              await desactivarPush();
              setEstado(null);
              toast("Avisos apagados.");
            }}
          >
            Apagar avisos
          </button>
        ) : (
          <button
            class="btn main full"
            disabled={cargando}
            onClick={async () => {
              setCargando(true);
              const r = await activarPush();
              setEstado(r);
              setCargando(false);
            }}
          >
            {cargando ? "Activando…" : "Activar avisos"}
          </button>
        )}
        {estado && <p style={{ margin: 0, fontSize: "14px", borderLeft: `3px solid ${estado === "listo" ? "var(--green)" : "var(--amber)"}`, paddingLeft: "10px" }}>{ESTADO[estado]}</p>}
      </div>
      <div class="card" style={{ gap: "10px" }}>
        <h2>Qué y cuándo</h2>
        <div class="between">
          <label for="av-m">Lo de hoy, en la mañana</label>
          <input id="av-m" type="time" value={a.manana} onChange={(e) => cambiar({ manana: (e.target as HTMLInputElement).value || "08:00" })} style={{ ...inp, flex: "0 0 120px" }} />
        </div>
        <div class="between">
          <label for="av-n">Lo de mañana, en la noche</label>
          <input id="av-n" type="time" value={a.noche} onChange={(e) => cambiar({ noche: (e.target as HTMLInputElement).value || "21:30" })} style={{ ...inp, flex: "0 0 120px" }} />
        </div>
        <label class="row" style={{ minHeight: "44px" }}>
          <input type="checkbox" checked={a.rutina} onChange={(e) => cambiar({ rutina: (e.target as HTMLInputElement).checked })} style={{ width: "22px", height: "22px" }} />
          Tareas de la rutina, 10 minutos antes
        </label>
        <label class="row" style={{ minHeight: "44px" }}>
          <input type="checkbox" checked={a.agua} onChange={(e) => cambiar({ agua: (e.target as HTMLInputElement).checked })} style={{ width: "22px", height: "22px" }} />
          Tomar agua (11, 14, 17 y 20 h)
        </label>
        <span class="small">Qué se envía: al intermediario (tu Cloudflare, no Gemini) van los textos cortos de los avisos de los próximos 7 días. No van montos de plata. Se borran apenas se envían.</span>
      </div>
      <div class="card" style={{ gap: "8px" }}>
        <h2>Sin servidor: Calendario del iPhone</h2>
        <span class="small">Exporta tus recordatorios, tu rutina y tus fechas importantes como un calendario con alarmas. Lo abres en el iPhone y se agrega al Calendario. Si cambias algo, vuelve a exportarlo.</span>
        <button
          class="btn full"
          onClick={() => {
            const n = chileNow();
            void saveFile("vida-recordatorios.ics", exportarIcs(data, routine.tasks, ahoraIso(n.date, n.minutes)), "text/calendar");
          }}
        >
          Exportar al Calendario (.ics)
        </button>
      </div>
    </>
  );
}
