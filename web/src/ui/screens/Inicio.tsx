import { chileNow, DAY_NAMES } from "../../core/time";
import { store } from "../../data/store";
import { routine } from "../../jarvis/instance";
import { equilibrioDinero, estadoPresupuestos, fraseDinero, nombreMes, presupuestoTotal, totalesMes } from "../../money/calc";
import { clp } from "../../money/format";
import { timeLabel } from "../../routine/routine";
import { Progress, Rueda } from "../charts";
import { Empty } from "../components";
import { Icon } from "../icons";
import { AREAS, cardReady, go, useApp, type CardId, getPrefs } from "../state";
import { diffDays, fechaCorta } from "../../core/dates";
import { equilibrioMetas, metasPrincipales } from "../../goals/calc";
import { equilibrioEstudios, proximasEvaluaciones, tareasPendientes } from "../../study/calc";
import { equilibrioTrabajo, proximoTurno, turnoDeHoy } from "../../work/calc";
import { MetaCard } from "./Metas";
import { TareaFila } from "./Estudios";
import { chequeoDeHoy, cargaDelDia, equilibrioCuerpo, semanaEntreno, sesionDeHoy } from "../../training/calc";
import { equilibrioFutbol, proximoEvento, sinRegistrar } from "../../futbol/calc";
import { useEffect, useState } from "preact/hooks";
import { addDays, dow, lunesDe } from "../../core/dates";
import { activos, aplica, equilibrioHabitos, hecho, racha } from "../../habits/calc";
import { climaAhora, speaker } from "../../jarvis/instance";
import { resumenMes, resumenSemana } from "../../jarvis/resumenes";
import { bloquesDia, cat, horasTxt, iso, minutosDia } from "../../time/calc";
import { describir, type Clima } from "../../weather/clima";
import { guardarDia, toggleHabito } from "./Habitos";
import { Cronometro } from "./Tiempo";
import type { CatTiempo } from "../../data/types";
import { kv, setPrefs } from "../state";
import { ahoraIso, cuandoTxt, proximos } from "../../reminders/calc";
import { enDificil, logros, proximasFechas, sugerirDificil } from "../../extras/calc";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function Inicio({ onAdd }: { onAdd: () => void }) {
  const { prefs, data } = useApp();
  const n = chileNow();
  const mes = n.date.slice(0, 7);
  const dia = Number(n.date.slice(8, 10));
  const tot = totalesMes(data.movimientos, mes);
  const estados = estadoPresupuestos(data.movimientos, data.presupuestos, data.categorias, mes, dia);
  const pres = presupuestoTotal(estados);
  const { current, next } = routine.now(n);
  const ahora = current ? `Ahora: ${current.title} · ${timeLabel(current)}` : next ? `Después: ${next.title} · ${next.time}` : "Hoy no te queda nada en la rutina";
  const frase = fraseDinero(estados, tot, mes, dia);
  const hay = (a: string) => prefs.areas.includes(a);
  const [clima, setClima] = useState<Clima | null>(null);
  useEffect(() => {
    void climaAhora().then(setClima);
  }, [prefs.ciudad.nombre]);
  const climaHoy = clima?.dias.find((x) => x.fecha === n.date);

  const cards: Record<CardId, () => preact.JSX.Element | null> = {
    resumen: () => <ResumenAuto />,
    recordatorios: () => <LoQueViene />,
    tiempo: () => {
      const hhmm = `${String(Math.floor(n.minutes / 60)).padStart(2, "0")}:${String(n.minutes % 60).padStart(2, "0")}`;
      const m = minutosDia(bloquesDia(data, n.date, iso(n.date, hhmm)), n.minutes);
      const filas = (Object.entries(m) as [CatTiempo, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return (
        <div class="stack" style={{ gap: "8px" }}>
          <Cronometro compacto />
          {filas.length > 0 && (
            <a href="#/mas/tiempo" class="small" style={{ color: "var(--muted)", textDecoration: "none" }}>
              Hoy: {filas.map(([c, v]) => `${cat(c).nombre.toLowerCase()} ${horasTxt(v)}`).join(" · ")} ›
            </a>
          )}
        </div>
      );
    },
    habitos: () => {
      if (!hay("bienestar")) return null;
      const hs = activos(data.habitos).filter((h) => aplica(h, n.date));
      const dia = data.dias.find((x) => x.id === n.date);
      return (
        <div class="card">
          <div class="between">
            <span class="lbl">Hábitos de hoy</span>
            <a href="#/mas/habitos" class="small" style={{ color: "var(--blue)", minHeight: "32px", display: "inline-flex", alignItems: "center" }}>
              Ver todo
            </a>
          </div>
          {!activos(data.habitos).length ? (
            <Empty text="Crea un par de hábitos y márcalos aquí con un toque." action="Elegir hábitos" onAction={() => go("/mas/habitos")} />
          ) : (
            <div class="chips">
              {hs.map((h) => {
                const ok = hecho(data.dias, h.id, n.date);
                const r = racha(h, data.dias, n.date, (f) => enDificil(getPrefs().dificil, f));
                return (
                  <button key={h.id} class={ok ? "on" : ""} aria-pressed={ok} onClick={() => toggleHabito(h, n.date)}>
                    {ok ? "✓ " : ""}
                    {h.nombre}
                    {r >= 2 ? ` · ${r}` : ""}
                  </button>
                );
              })}
            </div>
          )}
          <div class="between small">
            <span>
              Agua: {dia?.agua || 0} de {prefs.aguaMeta}
              {dia?.sueno != null ? ` · Sueño: ${String(dia.sueno).replace(".", ",")} h` : ""}
            </span>
            <button class="btn sm" aria-label="Un vaso de agua más" onClick={() => guardarDia(n.date, { agua: (dia?.agua || 0) + 1 })}>
              + Vaso
            </button>
          </div>
        </div>
      );
    },
    dinero: () =>
      !hay("dinero") ? null : (
        <button class="card" onClick={() => go("/dinero")} aria-label="Ver Dinero">
          <div class="between">
            <span class="lbl">Dinero de {nombreMes(mes)}</span>
            <span class="lbl">Balance</span>
          </div>
          {tot.ingresos || tot.egresos ? (
            <>
              <span class={`big ${tot.balance >= 0 ? "pos" : "neg"}`}>{clp(tot.balance, { signo: true })}</span>
              <IO label="Entra" valor={tot.ingresos} max={Math.max(tot.ingresos, tot.egresos)} color="var(--green)" />
              <IO label="Sale" valor={tot.egresos} max={Math.max(tot.ingresos, tot.egresos)} color="var(--red)" />
              <span class="small">{pres.monto ? `Presupuesto: ${Math.round(pres.pct)}% usado · quedan ${diasRestantes(mes, dia)} días` : "Sin presupuesto todavía: ponlo en Dinero."}</span>
            </>
          ) : (
            <span class="sub">Todavía no anotas nada este mes. Toca + para registrar tu primer gasto o ingreso.</span>
          )}
        </button>
      ),
    metas: () => {
      if (!hay("metas")) return null;
      const top = metasPrincipales(data.metas, n.date);
      return (
        <div class="card">
          <div class="between">
            <span class="lbl">Mis metas</span>
            <a href="#/metas" class="small" style={{ color: "var(--blue)", minHeight: "32px", display: "inline-flex", alignItems: "center" }}>
              Ver todas
            </a>
          </div>
          {top.length ? top.map((m) => <MetaCard key={m.id} m={m} compacta onOpen={() => go("/metas")} />) : <Empty text="Todavía no tienes metas." action="Crear una meta" onAction={() => go("/metas")} />}
        </div>
      );
    },
    entreno: () => {
      if (!hay("cuerpo")) return null;
      const plan = data.planes.find((p) => p.id === "activo");
      const sem = semanaEntreno(plan, data.entrenos, n.date);
      const hechas = sem.filter((x) => x.hecho).length;
      const tocan = sem.filter((x) => x.plan).length;
      const hoyS = sesionDeHoy(plan, n.date);
      const carga = cargaDelDia(chequeoDeHoy(data, n.date), data.partidos, n.date, data.chequeos, enDificil(getPrefs().dificil, n.date));
      return (
        <button class="card" onClick={() => go("/futbol?fisico")} aria-label={`Entrenamiento: ${hechas} de ${tocan} sesiones esta semana`}>
          <div class="between">
            <span class="lbl">Entrenamiento de la semana</span>
            <span class="num" style={{ fontWeight: 700 }}>
              {plan ? `${hechas} de ${tocan}` : ""}
            </span>
          </div>
          <div class="row" style={{ gap: "10px" }} aria-hidden="true">
            {sem.map((x) => (
              <span key={x.dia} class="stack" style={{ alignItems: "center", gap: "4px" }}>
                <span style={{ width: "18px", height: "18px", borderRadius: "9px", boxSizing: "border-box", background: x.hecho ? "var(--green)" : "transparent", border: x.hecho ? "0" : x.plan ? "2px solid var(--muted)" : "2px dashed var(--line)", outline: x.dia === n.dow ? "2px solid var(--blue)" : "none", outlineOffset: "2px" }} />
                <span class="small">{DAY_NAMES[x.dia][0].toUpperCase()}</span>
              </span>
            ))}
          </div>
          <span class="small">{!plan ? "Arma tu rutina en Fútbol → Físico." : hoyS ? `Hoy: ${hoyS.nombre.replace(/^[^:]+: /, "")}${carga.nivel !== "normal" ? ` · ${carga.nivel === "parar" ? "hoy no, cuida esa zona" : "versión suave"}` : ""}` : "Hoy toca descanso."}</span>
        </button>
      );
    },
    futbol: () => {
      if (!hay("futbol")) return null;
      const prox = proximoEvento(data.partidos, n.date);
      const pend = sinRegistrar(data.partidos, n.date);
      return (
        <button class="card" onClick={() => go("/futbol")}>
          <span class="lbl">Fútbol</span>
          {prox ? (
            <>
              <span class="mid">{prox.tipo === "partido" ? `vs. ${prox.rival || "—"}` : "Entrenamiento con el equipo"}</span>
              <span class="small">
                {prox.fecha === n.date ? "Hoy" : fechaCorta(prox.fecha)}
                {prox.hora ? ` · ${prox.hora}` : ""}
                {prox.lugar ? ` · ${prox.lugar}` : ""}
                {prox.importante ? " · ★ importante" : ""}
              </span>
            </>
          ) : (
            <span class="small">No hay partidos anotados. Agrégalos en Fútbol.</span>
          )}
          {pend.length > 0 && <span class="small" style={{ color: "var(--amber)" }}>Tienes {pend.length} sin registrar: ¿cómo te fue?</span>}
        </button>
      );
    },
    pendientes: () => {
      if (!hay("estudios") && !hay("trabajo")) return null;
      const turno = hay("trabajo") ? turnoDeHoy(data.turnos, n.date) : null;
      const prox = hay("trabajo") && !turno ? proximoTurno(data.turnos, n.date) : null;
      const tareas = hay("estudios") ? tareasPendientes(data.tareas, n.date).slice(0, 3) : [];
      const pruebas = hay("estudios") ? proximasEvaluaciones(data.evaluaciones, n.date, 7) : [];
      const nada = !turno && !prox && !tareas.length && !pruebas.length;
      return (
        <div class="card">
          <span class="lbl">Hoy en estudios y trabajo</span>
          {turno && (
            <a href="#/mas/trabajo" class="between" style={{ color: "inherit", textDecoration: "none", minHeight: "36px" }}>
              <span>Turno de hoy</span>
              <span class="num">
                {turno.inicio}–{turno.fin}
              </span>
            </a>
          )}
          {prox && (
            <a href="#/mas/trabajo" class="between small" style={{ color: "inherit", textDecoration: "none", minHeight: "32px" }}>
              <span>Hoy libre. Próximo turno</span>
              <span>
                {fechaCorta(prox.fecha)} · {prox.inicio}
              </span>
            </a>
          )}
          {pruebas.map((e) => (
            <a key={e.id} href="#/mas/estudios" class="between" style={{ color: "inherit", textDecoration: "none", minHeight: "36px" }}>
              <span>{e.nombre}</span>
              <span class="small" style={{ color: "var(--amber)" }}>
                {e.fecha === n.date ? "hoy" : `en ${diffDays(e.fecha, n.date)} días`}
              </span>
            </a>
          ))}
          {tareas.map((t) => (
            <TareaFila key={t.id} t={t} hoy={n.date} />
          ))}
          {nada && <span class="small">Nada pendiente para hoy.</span>}
        </div>
      );
    },
    jarvis: () =>
      !frase ? null : (
        <div class="card" style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <span style={{ color: "var(--green)" }}>
            <Icon name="metas" size={18} />
          </span>
          <span style={{ fontSize: "14px" }}>{frase}</span>
        </div>
      ),
    equilibrio: () => (
      <Equilibrio
        vals={{
          dinero: equilibrioDinero(estados),
          metas: equilibrioMetas(data.metas, data, n.date),
          cuerpo: equilibrioCuerpo(data.planes.find((p) => p.id === "activo"), data.entrenos, n.date),
          futbol: equilibrioFutbol(data.partidos, mes, n.date),
          estudios: equilibrioEstudios(data.materias, data.sesiones, n.date),
          trabajo: equilibrioTrabajo(data.turnos, mes, n.date),
          bienestar: equilibrioHabitos(data.habitos, data.dias, n.date),
        }}
        areas={prefs.areas}
      />
    ),
  };

  const fecha = `${DAY_NAMES[n.dow][0].toUpperCase() + DAY_NAMES[n.dow].slice(1)} ${dia} de ${MESES[Number(mes.slice(5)) - 1]}`;
  return (
    <main class="page">
      <header class="head">
        <div class="stack" style={{ gap: "2px" }}>
          <span class="sub">
            {fecha}
            {climaHoy ? ` · ${climaHoy.min}° a ${climaHoy.max}°, ${describir(climaHoy.codigo)}${climaHoy.lluvia >= 40 ? ` (${climaHoy.lluvia}% lluvia)` : ""}` : ""}
          </span>
          <h1>Hola, Diego</h1>
        </div>
      </header>
      <p class="sub" style={{ margin: "-6px 0 4px" }}>
        {ahora}
      </p>
      {store.hasDemo() && <DemoBanner />}
      <SemanaDificil />
      <LogroNuevo />
      <BackupReminder />
      {prefs.cards.filter((c) => c.on && cardReady(c.id)).map((c) => (
        <div key={c.id}>{cards[c.id]()}</div>
      ))}
      {!tot.ingresos && !tot.egresos && (
        <button class="btn main" onClick={onAdd}>
          Registrar mi primer movimiento
        </button>
      )}
    </main>
  );
}

const diasRestantes = (mes: string, dia: number) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - dia;
};

function IO({ label, valor, max, color }: { label: string; valor: number; max: number; color: string }) {
  return (
    <div class="row" style={{ gap: "8px" }}>
      <span class="small" style={{ width: "40px" }}>
        {label}
      </span>
      <div style={{ flex: 1 }}>
        <Progress value={max ? (valor / max) * 100 : 0} color={color} label={`${label}: ${clp(valor)}`} />
      </div>
      <span class="num" style={{ width: "88px", textAlign: "right", fontSize: "13px" }}>
        {clp(valor)}
      </span>
    </div>
  );
}

function Equilibrio({ vals, areas }: { vals: Record<string, number | null>; areas: string[] }) {
  const { prefs } = useApp();
  const list = AREAS.filter((a) => areas.includes(a.id) && vals[a.id] != null);
  if (!list.length) return null;
  const rueda = prefs.vistaEquilibrio === "rueda" && list.length >= 3;
  return (
    <div class="card">
      <div class="between">
        <span class="lbl">{rueda ? "Rueda de la vida" : "Equilibrio del mes"}</span>
        {list.length >= 3 && (
          <button class="link" style={{ background: "none", border: 0, color: "var(--blue)", fontSize: "13px", minHeight: "32px" }} onClick={() => setPrefs({ vistaEquilibrio: rueda ? "barras" : "rueda" })}>
            {rueda ? "Ver en barras" : "Ver como rueda"}
          </button>
        )}
      </div>
      {rueda && <Rueda label="Rueda de la vida: equilibrio de cada área de 0 a 100" data={AREAS.filter((a) => areas.includes(a.id)).map((a) => ({ nombre: a.id === "cuerpo" ? "Cuerpo" : a.nombre, valor: vals[a.id] ?? null }))} />}
      <div style={{ display: rueda ? "none" : "grid", gridTemplateColumns: "96px minmax(0,1fr) 40px", gap: "8px 10px", alignItems: "center", fontSize: "13px" }}>
        {list.map((a) => {
          const v = vals[a.id];
          return [
            <span key={a.id + "n"}>{a.nombre}</span>,
            v == null ? <span key={a.id + "b"} class="small">sin datos aún</span> : <Progress key={a.id + "b"} thin value={v} color={v >= 80 ? "var(--green)" : v >= 50 ? "var(--amber)" : "var(--red)"} label={`${a.nombre}: ${v} de 100`} />,
            <span key={a.id + "v"} class="num" style={{ textAlign: "right" }}>
              {v == null ? "—" : v}
            </span>,
          ];
        })}
      </div>
      <details>
        <summary class="small" style={{ cursor: "pointer", minHeight: "32px" }}>
          ¿Cómo se calcula?
        </summary>
        <p class="small" style={{ margin: "4px 0 0" }}>
          Cada área va de 0 a 100 y compara lo que hiciste con lo que te propusiste. No es una nota sobre tu vida, es solo una guía. Dinero: si a esta altura del mes gastaste lo que te tocaba según tu presupuesto o menos, 100; si te pasaste, baja en proporción. Metas: qué tan al día va cada meta (su avance contra el tiempo que pasó), en promedio. Estudios: horas de esta semana contra las que tocaban hasta hoy según tu meta semanal. Trabajo: turnos a los que fuiste contra los que tenías hasta hoy. Entrenamiento: sesiones hechas esta semana contra las de tu rutina hasta hoy. Fútbol: partidos y entrenamientos del mes a los que fuiste. Hábitos: los que cumpliste en los últimos 7 días contra los que tocaban. Un área aparece cuando tiene datos.
        </p>
      </details>
    </div>
  );
}

function DemoBanner() {
  return (
    <div class="card" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
      <span class="small">Modo práctica: estás con datos de ejemplo. Lo que anotes ahora (también hablándole a JARVIS) se borra junto con ellos.</span>
      <button
        class="btn sm"
        onClick={async () => {
          if (!confirm("¿Borrar los datos de ejemplo y todo lo que anotaste mientras practicabas?")) return;
          await store.removeDemo();
        }}
      >
        Borrar ejemplos
      </button>
    </div>
  );
}

function BackupReminder() {
  const { prefs, data } = useApp();
  if (!data.movimientos.some((m) => !m.demo)) return null;
  const last = prefs.lastBackup;
  const dias = last ? Math.floor((Date.now() - Date.parse(last + "T12:00:00")) / 864e5) : 999;
  if (dias < 14) return null;
  return (
    <button class="card" onClick={() => go("/mas/ajustes")} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <span class="small">{last ? `Tu último respaldo es de hace ${dias} días.` : "Todavía no guardas un respaldo."} Si pierdes el teléfono, con él recuperas todo.</span>
      <span class="btn sm">Respaldar</span>
    </button>
  );
}

// Resumen automático: el lunes (o el domingo en la tarde) aparece el de la semana; los primeros días
// del mes, el del mes pasado; a fin de año, el link a "Mi año en números". Se cierra con "Listo".
function ResumenAuto() {
  const { data, prefs } = useApp();
  const n = chileNow();
  const hoy = n.date;
  let id = "";
  let titulo = "";
  let r: { texto: string } | null = null;
  const d = Number(hoy.slice(8, 10));
  if (d <= 3) {
    const finMes = addDays(`${hoy.slice(0, 7)}-01`, -1);
    id = `mes:${finMes.slice(0, 7)}`;
    titulo = `Tu ${nombreMes(finMes.slice(0, 7))}`;
    r = resumenMes(data, finMes, true);
  } else if (dow(hoy) === 0 || (dow(hoy) === 6 && n.minutes >= 18 * 60)) {
    const fin = dow(hoy) === 0 ? addDays(hoy, -1) : hoy;
    id = `sem:${lunesDe(fin)}`;
    titulo = dow(hoy) === 0 ? "Tu semana pasada" : "Tu semana";
    r = resumenSemana(data, fin, true);
  }
  const finAnio = hoy.slice(5) >= "12-26";
  if (!r && !finAnio) return null;
  if (r && prefs.resumenVisto === id) {
    if (!finAnio || prefs.resumenVisto === `anio:${hoy.slice(0, 4)}`) return null;
  }
  if (!r || prefs.resumenVisto === id) {
    id = `anio:${hoy.slice(0, 4)}`;
    if (prefs.resumenVisto === id) return null;
    return (
      <div class="card" style={{ borderColor: "var(--green)" }}>
        <span class="lbl">Se termina el año</span>
        <span>Mira tu {hoy.slice(0, 4)} en números: partidos, goles, entrenos, horas de estudio y en qué se te fue el tiempo.</span>
        <div class="row">
          <button class="btn sm main" onClick={() => go("/mas/tiempo?anio")}>
            Ver mi año
          </button>
          <button class="btn sm" onClick={() => setPrefs({ resumenVisto: id })}>
            Listo
          </button>
        </div>
      </div>
    );
  }
  const texto = r.texto.replace(/^[^:]+: /, "");
  return (
    <div class="card" style={{ borderColor: "var(--green)" }}>
      <span class="lbl">{titulo}</span>
      <span style={{ fontSize: "14px" }}>{texto}</span>
      <div class="row">
        <button
          class="btn sm main"
          onClick={() => {
            speaker.unlock();
            speaker.feed(`${titulo}. ${texto} `);
            speaker.flush();
          }}
        >
          Escuchar
        </button>
        <button class="btn sm" onClick={() => setPrefs({ resumenVisto: id })}>
          Listo
        </button>
      </div>
    </div>
  );
}

// Lo que viene: recordatorios de hoy y de los próximos días, lo que le contaste a JARVIS y cumpleaños.
function LoQueViene() {
  const { data } = useApp();
  const n = chileNow();
  const ahora = ahoraIso(n.date, n.minutes);
  const recs = proximos(data.recordatorios, ahora, 3).slice(0, 4);
  const fechas = proximasFechas(data.fechas, n.date, 14).slice(0, 3);
  const mem = data.recuerdos.filter((r) => r.fecha && r.fecha >= n.date && r.fecha <= addDays(n.date, 3)).slice(0, 3);
  const filas = [
    ...recs.map((r) => ({ k: r.id, t: r.texto, s: cuandoTxt(r.cuando, n.date), c: "var(--gold)" })),
    ...mem.map((r) => ({ k: r.id, t: r.texto, s: r.fecha === n.date ? "hoy" : r.fecha === addDays(n.date, 1) ? "mañana" : fechaCorta(r.fecha!), c: "var(--blue)" })),
    ...fechas.map((p) => ({ k: p.f.id, t: p.f.nombre, s: p.enDias === 0 ? "¡hoy!" : p.enDias === 1 ? "mañana" : `en ${p.enDias} días`, c: "var(--green)" })),
  ];
  return (
    <div class="card">
      <div class="between">
        <span class="lbl">Lo que viene</span>
        <a href="#/mas/recordatorios" class="small" style={{ color: "var(--blue)", minHeight: "32px", display: "inline-flex", alignItems: "center" }}>
          Ver todo
        </a>
      </div>
      {filas.length ? (
        filas.map((f) => (
          <div key={f.k} class="row" style={{ gap: "10px", minHeight: "32px" }}>
            <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "4px", background: f.c, flex: "none" }} />
            <span style={{ flex: 1, fontSize: "15px" }}>{f.t}</span>
            <span class="small num">{f.s}</span>
          </div>
        ))
      ) : (
        <span class="small">Nada en los próximos días. Dile a JARVIS "recuérdame…" o "acuérdate que…".</span>
      )}
    </div>
  );
}

// Modo semana difícil: aviso si está activo, o sugerencia si vienes cansado varios días.
function SemanaDificil() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const activo = enDificil(prefs.dificil, hoy);
  const mes = hoy.slice(0, 7);
  const exc = estadoPresupuestos(data.movimientos, data.presupuestos, data.categorias, mes, Number(hoy.slice(8, 10))).some((e) => e.estado === "excedido");
  const sug = !activo && kv.get<string>("dificilSugerido", "") !== hoy ? sugerirDificil(data, hoy, exc) : null;
  if (activo) {
    const p = prefs.dificil.find((x) => hoy >= x.desde && hoy <= x.hasta)!;
    return (
      <div class="card" style={{ borderColor: "var(--blue)", gap: "6px" }}>
        <span class="lbl" style={{ color: "var(--blue)" }}>Modo semana difícil · hasta el {fechaCorta(p.hasta)}</span>
        <span class="small">Entreno más corto y sin fallo, las rachas no se cortan y JARVIS te habla más suave. Lo importante es no soltar todo.</span>
        <button class="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setPrefs({ dificil: prefs.dificil.map((x) => (x === p ? { ...x, hasta: addDays(hoy, -1) } : x)).filter((x) => x.hasta >= x.desde) })}>
          Ya estoy bien
        </button>
      </div>
    );
  }
  if (!sug) return null;
  return (
    <div class="card" style={{ gap: "6px" }}>
      <span class="small">{sug} ¿Activamos el modo semana difícil? Baja las exigencias por unos días sin cortar tus rachas.</span>
      <div class="row">
        <button class="btn sm main" onClick={() => setPrefs({ dificil: [...prefs.dificil, { desde: hoy, hasta: addDays(hoy, 6) }] })}>
          Activar 7 días
        </button>
        <button
          class="btn sm"
          onClick={() => {
            kv.set("dificilSugerido", hoy);
            setPrefs({});
          }}
        >
          No, gracias
        </button>
      </div>
    </div>
  );
}

// Un logro nuevo, sutil: aparece una vez y se cierra.
function LogroNuevo() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const todos = logros(data, hoy);
  // La primera vez que se calcula, los logros que ya tenías no se anuncian (solo los nuevos de ahí en adelante).
  if (!prefs.logrosVistos.length && todos.length) {
    queueMicrotask(() => setPrefs({ logrosVistos: [...todos.map((l) => l.id), "_inicio"] }));
    return null;
  }
  const nuevo = todos.find((l) => !prefs.logrosVistos.includes(l.id));
  if (!nuevo || store.hasDemo()) return null;
  return (
    <div class="card" style={{ flexDirection: "row", alignItems: "center", gap: "12px", borderColor: "var(--gold)" }} role="status">
      <span style={{ color: "var(--gold)" }}>
        <Icon name="estrella" size={22} />
      </span>
      <span style={{ flex: 1 }}>
        <strong>{nuevo.titulo}</strong>
        <span class="small" style={{ display: "block" }}>
          {nuevo.texto}
        </span>
      </span>
      <button class="btn sm" onClick={() => setPrefs({ logrosVistos: [...prefs.logrosVistos, nuevo.id] })}>
        Bien
      </button>
    </div>
  );
}
