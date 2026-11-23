// Calendario unificado: la semana con turnos, partidos, físico, rutina, pruebas y metas, y lo que se cruza.
import { useState } from "preact/hooks";
import { addDays, dow, fechaCorta, lunesDe } from "../../core/dates";
import { chileNow, DAY_NAMES } from "../../core/time";
import { semanaCal, type Evento, type TipoEvento } from "../../calendar/calc";
import { routine } from "../../jarvis/instance";
import { Icon } from "../icons";
import { go, setPrefs, useApp } from "../state";

const COLOR: Record<TipoEvento, string> = { turno: "var(--t2)", partido: "var(--t6)", equipo: "var(--t3)", fisico: "var(--t1)", rutina: "var(--t-gris1)", prueba: "var(--t8)", tarea: "var(--t7)", meta: "var(--t5)" };
const NOMBRE: Record<TipoEvento, string> = { turno: "Trabajo", partido: "Partido", equipo: "Equipo", fisico: "Físico", rutina: "Rutina", prueba: "Prueba", tarea: "Pendiente", meta: "Meta" };

export function Calendario() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const [lunes, setLunes] = useState(lunesDe(hoy));
  const sem = semanaCal(data, routine.tasks, lunes).map((d) => ({ ...d, eventos: prefs.calRutina ? d.eventos : d.eventos.filter((e) => e.tipo !== "rutina") }));
  const choques = sem.reduce((n, d) => n + d.choques.length, 0);

  return (
    <main class="page">
      <header class="head">
        <h1>Calendario</h1>
        {lunes !== lunesDe(hoy) && (
          <button class="btn sm" onClick={() => setLunes(lunesDe(hoy))}>
            Hoy
          </button>
        )}
      </header>
      <div class="between">
        <button class="icon-btn" aria-label="Semana anterior" onClick={() => setLunes(addDays(lunes, -7))}>
          <Icon name="izq" />
        </button>
        <strong>
          {fechaCorta(lunes)} – {fechaCorta(addDays(lunes, 6))}
        </strong>
        <button class="icon-btn" aria-label="Semana siguiente" onClick={() => setLunes(addDays(lunes, 7))}>
          <Icon name="der" />
        </button>
      </div>
      <div class="chips">
        <button class={prefs.calRutina ? "on" : ""} aria-pressed={prefs.calRutina} onClick={() => setPrefs({ calRutina: !prefs.calRutina })}>
          Mostrar rutina
        </button>
      </div>
      {choques > 0 && (
        <div class="card" style={{ borderColor: "var(--amber)" }} role="status">
          <strong>
            {choques === 1 ? "1 cosa se cruza" : `${choques} cosas se cruzan`} esta semana
          </strong>
          <span class="small">Están marcadas abajo en amarillo. Mueve algo antes de que llegue el día.</span>
        </div>
      )}
      {sem.map((d) => {
        const esHoy = d.fecha === hoy;
        const pasado = d.fecha < hoy;
        return (
          <section key={d.fecha} class="card" style={{ gap: "8px", borderColor: esHoy ? "var(--blue)" : undefined, background: pasado ? "transparent" : undefined }} aria-label={`${DAY_NAMES[dow(d.fecha)]} ${fechaCorta(d.fecha)}`}>
            <div class="between">
              <h2 style={{ textTransform: "capitalize" }}>
                {DAY_NAMES[dow(d.fecha)]} {Number(d.fecha.slice(8))}
              </h2>
              {esHoy ? <span class="small" style={{ color: "var(--blue)", fontWeight: 600 }}>Hoy</span> : pasado ? <span class="small">Pasó</span> : null}
            </div>
            {d.choques.map((c) => (
              <p key={c} style={{ margin: 0, fontSize: "13px", borderLeft: "3px solid var(--amber)", paddingLeft: "8px" }}>
                {c}
              </p>
            ))}
            {!d.eventos.length ? <span class="small">Libre.</span> : d.eventos.map((e) => <Fila key={e.id} e={e} />)}
          </section>
        );
      })}
      <div class="chips" aria-label="Colores" style={{ gap: "10px" }}>
        {(Object.keys(NOMBRE) as TipoEvento[]).map((t) => (
          <span key={t} class="small row" style={{ gap: "4px" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "5px", background: COLOR[t] }} />
            {NOMBRE[t]}
          </span>
        ))}
      </div>
    </main>
  );
}

function Fila({ e }: { e: Evento }) {
  return (
    <button onClick={() => go(e.ruta)} style={{ display: "grid", gridTemplateColumns: "92px 10px minmax(0,1fr)", gap: "8px", alignItems: "center", minHeight: "36px", background: "none", border: 0, padding: 0, textAlign: "left", color: "var(--ink)" }}>
      <span class="small num">{e.inicio ? `${e.inicio}${e.fin ? `–${e.fin === "24:00" ? "00:00" : e.fin}` : ""}` : "todo el día"}</span>
      <span style={{ width: "10px", height: "10px", borderRadius: "5px", background: COLOR[e.tipo] }} aria-hidden="true" />
      <span style={{ fontSize: "14px", textDecoration: e.hecho ? "line-through" : "none", color: e.hecho ? "var(--muted)" : undefined }}>
        {e.titulo}
        {e.importante && e.tipo === "partido" ? " ★" : ""}
        <span class="sr-only">{e.hecho ? " (hecho)" : ""}</span>
      </span>
    </button>
  );
}
