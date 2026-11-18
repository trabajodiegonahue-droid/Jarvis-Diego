// Mi tiempo: bitácora al minuto (cronómetro y bloques), línea del día, y cómo se reparte
// el tiempo en la semana, el mes y el año. Al final, "Mi año en números".
import { useEffect, useState } from "preact/hooks";
import { addDays, dow, fechaCorta, lunesDe } from "../../core/dates";
import { chileNow, DAY_NAMES } from "../../core/time";
import { store } from "../../data/store";
import { uid, type Actividad, type CatTiempo } from "../../data/types";
import { numerosAnio } from "../../jarvis/resumenes";
import { nombreMes } from "../../money/calc";
import { clp } from "../../money/format";
import { bloquesDia, cat, CATS, corriendo, horasTxt, iso, minutosDia, minutosEntreIso, tiempoPeriodo, type Bloque } from "../../time/calc";
import { Bars, BarsH } from "../charts";
import { Empty, Sheet } from "../components";
import { Icon } from "../icons";
import { go, toast, useApp } from "../state";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const ahoraIso = () => {
  const n = chileNow();
  return iso(n.date, hhmm(n.minutes));
};
type Vista = "dia" | "semana" | "mes" | "anio";

export function Tiempo() {
  const [vista, setVista] = useState<Vista>(() => (location.hash.includes("anio") ? "anio" : "dia"));
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(iv);
  }, []);
  return (
    <main class="page">
      <header class="head">
        <h1>Mi tiempo</h1>
      </header>
      <Cronometro />
      <div class="seg tabs4" role="tablist" aria-label="Periodo">
        {(
          [
            ["dia", "Día"],
            ["semana", "Semana"],
            ["mes", "Mes"],
            ["anio", "Año"],
          ] as [Vista, string][]
        ).map(([v, n]) => (
          <button key={v} role="tab" aria-selected={vista === v} class={vista === v ? "on" : ""} onClick={() => setVista(v)}>
            {n}
          </button>
        ))}
      </div>
      {vista === "dia" ? <VistaDia /> : vista === "anio" ? <VistaAnio /> : <VistaPeriodo tipo={vista} />}
    </main>
  );
}

// ---------- Cronómetro: un toque para empezar algo y otro para terminarlo ----------
export function Cronometro({ compacto }: { compacto?: boolean }) {
  const { data } = useApp();
  const run = corriendo(data.actividades);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!run) return;
    const iv = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(iv);
  }, [run?.id]);

  async function empezar(c: CatTiempo) {
    const now = ahoraIso();
    const prev = corriendo(store.data.actividades);
    if (prev) await store.put("actividades", { ...prev, fin: now > prev.inicio ? now : prev.inicio });
    const a: Actividad = { id: uid(), cat: c, inicio: now };
    await store.put("actividades", a);
    toast(`Corriendo: ${cat(c).nombre}.`, async () => {
      await store.remove("actividades", a.id);
      if (prev) await store.put("actividades", prev);
    });
  }
  async function terminar() {
    if (!run) return;
    const fin = ahoraIso();
    await store.put("actividades", { ...run, fin: fin > run.inicio ? fin : run.inicio });
    toast(`${cat(run.cat).nombre}: ${horasTxt(minutosEntreIso(run.inicio, fin))}.`, () => void store.put("actividades", run));
  }

  if (run) {
    const min = minutosEntreIso(run.inicio, ahoraIso());
    return (
      <div class="card" style={{ flexDirection: "row", alignItems: "center", gap: "12px", borderColor: cat(run.cat).color }} aria-live="polite">
        <span style={{ width: "12px", height: "12px", borderRadius: "6px", background: cat(run.cat).color, flex: "none" }} />
        <div class="stack" style={{ gap: "2px", flex: 1, minWidth: 0 }}>
          <strong>{run.nota || cat(run.cat).nombre}</strong>
          <span class="small num">
            Desde las {run.inicio.slice(11)} · lleva {horasTxt(min)}
          </span>
        </div>
        <button class="btn sm" onClick={terminar}>
          <Icon name="stop" size={16} /> Terminar
        </button>
      </div>
    );
  }
  return (
    <div class="card" style={{ gap: "8px" }}>
      <span class="lbl">¿Qué estás haciendo ahora?</span>
      <div class="chips" style={compacto ? { flexWrap: "nowrap", overflowX: "auto" } : undefined}>
        {CATS.filter((c) => c.id !== "otro").map((c) => (
          <button key={c.id} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px" }} onClick={() => empezar(c.id)}>
            <span style={{ width: "8px", height: "8px", borderRadius: "4px", background: c.color }} />
            {c.nombre}
          </button>
        ))}
      </div>
      {!compacto && <span class="small">O dile a JARVIS "empecé a estudiar" y "terminé".</span>}
    </div>
  );
}

// ---------- Día: línea de 24 horas, al minuto ----------
const PX = 0.6; // pixeles por minuto (24 h = 864 px)

function VistaDia() {
  const { data } = useApp();
  const hoy = chileNow().date;
  const [fecha, setFecha] = useState(hoy);
  const [form, setForm] = useState<{ a?: Actividad; ini?: number } | null>(null);
  const now = ahoraIso();
  const bloques = bloquesDia(data, fecha, now);
  const tope = fecha === hoy ? chileNow().minutes : 1440;
  const min = minutosDia(bloques, tope);
  const total = Object.values(min).reduce((a, b) => a + (b || 0), 0);
  const filas = (Object.entries(min) as [CatTiempo, number][]).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ nombre: cat(c).nombre, valor: v, color: cat(c).color }));
  // Columnas: si dos bloques se pisan, van lado a lado.
  const col = new Map<string, number>();
  const finCol: number[] = [];
  for (const b of bloques) {
    let k = finCol.findIndex((f) => f <= b.ini);
    if (k < 0) k = finCol.length;
    finCol[k] = b.fin;
    col.set(b.id, k);
  }
  const ncol = Math.max(1, finCol.length);

  return (
    <>
      <div class="between">
        <button class="icon-btn" aria-label="Día anterior" onClick={() => setFecha(addDays(fecha, -1))}>
          <Icon name="izq" />
        </button>
        <strong style={{ textTransform: "capitalize" }}>{fecha === hoy ? "Hoy" : fecha === addDays(hoy, -1) ? "Ayer" : `${DAY_NAMES[dow(fecha)]} ${fechaCorta(fecha)}`}</strong>
        <button class="icon-btn" aria-label="Día siguiente" disabled={fecha >= hoy} onClick={() => setFecha(addDays(fecha, 1))}>
          <Icon name="der" />
        </button>
      </div>
      <div class="card">
        <div class="between">
          <span class="lbl">Registrado</span>
          <span class="num" style={{ fontWeight: 700 }}>
            {horasTxt(total)} de {horasTxt(tope)}
          </span>
        </div>
        {filas.length ? <BarsH data={filas} total={tope} label="Tiempo por actividad" fmt={horasTxt} /> : <span class="small">Nada registrado este día.</span>}
        {tope - total > 60 && <span class="small">Sin registrar: {horasTxt(tope - total)}. Toca un espacio vacío de la línea para anotarlo.</span>}
      </div>
      <div class="card" style={{ padding: "12px 12px 12px 4px" }}>
        <div class="between" style={{ paddingLeft: "8px" }}>
          <h2>Línea del día</h2>
          <button class="btn sm" onClick={() => setForm({ ini: fecha === hoy ? Math.max(0, chileNow().minutes - 60) : 9 * 60 })}>
            <Icon name="plus" size={16} /> Bloque
          </button>
        </div>
        <div
          style={{ position: "relative", height: `${1440 * PX}px`, marginLeft: "44px" }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            const y = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
            setForm({ ini: Math.max(0, Math.min(1380, Math.floor(y / PX / 15) * 15)) });
          }}
        >
          {Array.from({ length: 13 }, (_, i) => i * 2).map((h) => (
            <div key={h} aria-hidden="true" style={{ position: "absolute", top: `${h * 60 * PX}px`, left: "-44px", right: 0, borderTop: "1px solid var(--line)", pointerEvents: "none" }}>
              <span class="small num" style={{ position: "absolute", top: "-8px", left: 0, width: "38px", fontSize: "11px", background: "var(--card)" }}>
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}
          {fecha === hoy && <div aria-hidden="true" style={{ position: "absolute", top: `${chileNow().minutes * PX}px`, left: "-6px", right: 0, borderTop: "2px solid var(--red)", pointerEvents: "none" }} />}
          {bloques.map((b) => (
            <BloqueVista key={b.id} b={b} col={col.get(b.id)!} ncol={ncol} onOpen={() => (b.derivado ? go(b.cat === "trabajo" ? "/mas/trabajo" : "/futbol") : setForm({ a: b.actividad }))} />
          ))}
        </div>
        <span class="small" style={{ paddingLeft: "8px" }}>
          Los turnos y partidos con hora aparecen solos. Si dos cosas se pisan, el total cuenta cada minuto una sola vez.
        </span>
      </div>
      {form && <BloqueForm fecha={fecha} a={form.a} ini={form.ini} onClose={() => setForm(null)} />}
    </>
  );
}

function BloqueVista({ b, col, ncol, onOpen }: { b: Bloque; col: number; ncol: number; onOpen: () => void }) {
  const c = cat(b.cat);
  const h = Math.max(6, (b.fin - b.ini) * PX);
  return (
    <button
      onClick={onOpen}
      aria-label={`${b.titulo}, de ${hhmm(b.ini)} a ${b.fin >= 1440 ? "24:00" : hhmm(b.fin)}${b.corriendo ? ", en curso" : ""}`}
      style={{
        position: "absolute",
        top: `${b.ini * PX}px`,
        height: `${h}px`,
        left: `calc(${(col / ncol) * 100}% + 2px)`,
        width: `calc(${100 / ncol}% - 4px)`,
        background: c.color,
        border: b.corriendo ? "2px dashed var(--ink)" : b.derivado ? "2px dashed rgba(11,15,23,.45)" : 0,
        borderRadius: "6px",
        color: "#0B0F17",
        fontSize: "12px",
        fontWeight: 600,
        textAlign: "left",
        padding: h > 18 ? "2px 6px" : 0,
        overflow: "hidden",
        lineHeight: 1.2,
      }}
    >
      {h > 14 ? `${b.titulo}${h > 30 ? ` · ${horasTxt(b.fin - b.ini)}` : ""}` : ""}
    </button>
  );
}

function BloqueForm({ fecha, a, ini, onClose }: { fecha: string; a?: Actividad; ini?: number; onClose: () => void }) {
  const [c, setC] = useState<CatTiempo>(a?.cat || "estudio");
  const [inicio, setInicio] = useState(a ? a.inicio.slice(11) : hhmm(ini ?? 540));
  const [fin, setFin] = useState(a?.fin ? a.fin.slice(11) : a ? "" : hhmm(Math.min(1439, (ini ?? 540) + 60)));
  const [nota, setNota] = useState(a?.nota || "");
  const base = a ? a.inicio.slice(0, 10) : fecha;
  async function guardar() {
    if (!/^\d{2}:\d{2}$/.test(inicio)) return toast("Pon la hora de inicio.");
    const ini2 = iso(base, inicio);
    let fin2: string | undefined;
    if (fin) {
      fin2 = iso(fin <= inicio ? addDays(base, 1) : base, fin);
      if (minutosEntreIso(ini2, fin2) > 20 * 60) return toast("Un bloque no puede durar más de 20 horas.");
    } else if (a?.fin || !a) return toast("Pon la hora de término.");
    if (fin2 && fin2 > ahoraIso()) return toast("Ese bloque termina en el futuro: anótalo cuando pase, o usa el cronómetro.");
    const nuevo: Actividad = { ...(a || { id: uid() }), cat: c, inicio: ini2, ...(fin2 ? { fin: fin2 } : {}), nota: nota.trim() || undefined } as Actividad;
    if (!fin2) delete nuevo.fin;
    await store.put("actividades", nuevo);
    onClose();
    toast(a ? "Bloque actualizado." : "Bloque anotado.", a ? () => void store.put("actividades", a) : () => void store.remove("actividades", nuevo.id));
  }
  return (
    <Sheet title={a ? "Editar bloque" : "Anotar bloque"} onClose={onClose}>
      <div class="chips">
        {CATS.map((x) => (
          <button key={x.id} class={c === x.id ? "on" : ""} aria-pressed={c === x.id} onClick={() => setC(x.id)}>
            {x.nombre}
          </button>
        ))}
      </div>
      <div class="grid2">
        <div class="field">
          <label class="lbl" for="b-i">
            Desde
          </label>
          <input id="b-i" type="time" value={inicio} onInput={(e) => setInicio((e.target as HTMLInputElement).value)} />
        </div>
        <div class="field">
          <label class="lbl" for="b-f">
            Hasta
          </label>
          <input id="b-f" type="time" value={fin} onInput={(e) => setFin((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      {a && !a.fin && <span class="small">Este bloque está corriendo. Ponle hora de término para cerrarlo.</span>}
      <div class="field">
        <label class="lbl" for="b-n">
          Nota (opcional)
        </label>
        <input id="b-n" value={nota} maxLength={80} placeholder="Inglés, serie, ordenar la pieza…" onInput={(e) => setNota((e.target as HTMLInputElement).value)} />
      </div>
      <span class="small">Si la hora de término es antes que la de inicio, termina al día siguiente (por ejemplo, dormir de 23:30 a 07:00).</span>
      <button class="btn main full" onClick={guardar}>
        Guardar
      </button>
      {a && (
        <button
          class="btn danger full"
          onClick={async () => {
            const u = await store.remove("actividades", a.id);
            onClose();
            toast("Bloque borrado.", () => void u());
          }}
        >
          Borrar
        </button>
      )}
    </Sheet>
  );
}

// ---------- Semana y mes ----------
function VistaPeriodo({ tipo }: { tipo: "semana" | "mes" }) {
  const { data } = useApp();
  const hoy = chileNow().date;
  const desde = tipo === "semana" ? lunesDe(hoy) : `${hoy.slice(0, 7)}-01`;
  const p = tiempoPeriodo(data, desde, hoy, ahoraIso());
  const dias = p.dias.length || 1;
  const filas = (Object.entries(p.porCat) as [CatTiempo, number][]).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ nombre: `${cat(c).nombre} · ${horasTxt(v / dias)}/día`, valor: v, color: cat(c).color }));
  return (
    <>
      <div class="card">
        <div class="between">
          <span class="lbl">{tipo === "semana" ? "Esta semana" : `En ${nombreMes(hoy.slice(0, 7))}`}</span>
          <span class="num" style={{ fontWeight: 700 }}>
            {Math.round((p.registrado / Math.max(1, p.posible)) * 100)}% registrado
          </span>
        </div>
        {filas.length ? <BarsH data={filas} total={p.registrado} label="Tiempo por actividad" fmt={horasTxt} /> : <Empty text="Todavía no hay tiempo registrado en este periodo. Usa el cronómetro o dile a JARVIS qué estás haciendo." />}
      </div>
      {p.registrado > 0 && (
        <div class="card">
          <h2>Horas registradas por día</h2>
          <Bars label="Horas registradas por día" fmt={(n) => `${Math.round(n * 10) / 10} h`} data={p.dias.map((d) => ({ etiqueta: tipo === "semana" ? DAY_NAMES[dow(d.fecha)].slice(0, 2) : String(Number(d.fecha.slice(8))), valor: d.minutos / 60 }))} />
        </div>
      )}
    </>
  );
}

// ---------- Año: Mi año en números ----------
function VistaAnio() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const n = numerosAnio(data, hoy);
  const tiempo = (Object.entries(n.tiempo) as [CatTiempo, number][]).sort((a, b) => b[1] - a[1]);
  const totT = tiempo.reduce((a, [, v]) => a + v, 0);
  const num = (v: number) => (Math.round(v * 10) / 10).toLocaleString("es-CL");
  const items: [string, string][] = [
    ["Partidos", String(n.partidos)],
    ["Goles", String(n.goles)],
    ["Asistencias", String(n.asistencias)],
    ["Entrenos", String(n.entrenos)],
    ["Horas de estudio", num(n.horasEstudio)],
    ["Horas de trabajo", num(n.horasTrabajo)],
    ["Metas cumplidas", String(n.metasCumplidas)],
    ["Sueño promedio", n.sueno != null ? `${num(n.sueno)} h` : "—"],
  ];
  return (
    <>
      <div class="card">
        <h2>Mi {n.anio} en números</h2>
        <div class="grid2">
          {items.map(([t, v]) => (
            <div key={t} class="stack" style={{ gap: "2px" }}>
              <span class="small">{t}</span>
              <span class="mid num">{v}</span>
            </div>
          ))}
        </div>
        {n.mejorHabito && (
          <span class="small">
            Mejor racha: {n.mejorHabito.nombre}, {n.mejorHabito.racha} días seguidos.
          </span>
        )}
        {(n.ingresos > 0 || n.egresos > 0) && !prefs.privacy && (
          <span class="small">
            Plata del año: entraron {clp(n.ingresos)}, salieron {clp(n.egresos)}.
          </span>
        )}
      </div>
      <div class="card">
        <h2>Entrenos por mes</h2>
        <Bars label="Entrenos por mes" color="var(--green)" data={n.porMes.map((m) => ({ etiqueta: nombreMes(m.mes, true), valor: m.entrenos }))} />
        <h2>Horas de estudio por mes</h2>
        <Bars label="Horas de estudio por mes" fmt={(v) => `${num(v)} h`} data={n.porMes.map((m) => ({ etiqueta: nombreMes(m.mes, true), valor: m.horasEstudio }))} />
        <h2>Horas de trabajo por mes</h2>
        <Bars label="Horas de trabajo por mes" color="var(--amber)" fmt={(v) => `${num(v)} h`} data={n.porMes.map((m) => ({ etiqueta: nombreMes(m.mes, true), valor: m.horasTrabajo }))} />
      </div>
      <div class="card">
        <h2>Tu tiempo en el año</h2>
        {tiempo.length ? <BarsH label="Tiempo del año por actividad" fmt={(v) => horasTxt(v)} total={totT} data={tiempo.map(([c, v]) => ({ nombre: cat(c).nombre, valor: v, color: cat(c).color }))} /> : <span class="small">Cuando uses la bitácora, aquí verás en qué se te va el año.</span>}
      </div>
    </>
  );
}
