import { chileNow, DAY_NAMES } from "../../core/time";
import { store } from "../../data/store";
import { routine } from "../../jarvis/instance";
import { equilibrioDinero, estadoPresupuestos, fraseDinero, nombreMes, presupuestoTotal, totalesMes } from "../../money/calc";
import { clp } from "../../money/format";
import { timeLabel } from "../../routine/routine";
import { Progress } from "../charts";
import { Empty } from "../components";
import { Icon } from "../icons";
import { AREAS, cardReady, go, useApp, type CardId } from "../state";

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

  const cards: Record<CardId, () => preact.JSX.Element | null> = {
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
    metas: () =>
      !hay("metas") ? null : (
        <div class="card">
          <h2>Mis metas</h2>
          <Empty text="Las metas llegan en la fase 2: ahorro, prueba física, inglés y lo que quieras." />
        </div>
      ),
    entreno: () => {
      if (!hay("cuerpo")) return null;
      return (
        <div class="card">
          <span class="lbl">Entrenamiento de la semana</span>
          <div class="row" style={{ gap: "8px" }} aria-hidden="true">
            {DAY_NAMES.map((d, i) => (
              <span key={d} title={d} style={{ width: "16px", height: "16px", borderRadius: "8px", boxSizing: "border-box", border: i === n.dow ? "2px solid var(--blue)" : "0", background: i === n.dow ? "transparent" : "var(--line)" }} />
            ))}
          </div>
          <span class="small">El registro de entrenamientos llega en la fase 3.</span>
        </div>
      );
    },
    futbol: () =>
      !hay("futbol") ? null : (
        <div class="card">
          <span class="lbl">Fútbol</span>
          <span class="small">Tu próximo partido aparecerá aquí (fase 3).</span>
        </div>
      ),
    pendientes: () =>
      !hay("estudios") && !hay("trabajo") ? null : (
        <div class="card">
          <span class="lbl">Pendientes de hoy</span>
          <span class="small">Estudios y turnos llegan en la fase 2.</span>
        </div>
      ),
    jarvis: () =>
      !frase ? null : (
        <div class="card" style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <span style={{ color: "var(--green)" }}>
            <Icon name="metas" size={18} />
          </span>
          <span style={{ fontSize: "14px" }}>{frase}</span>
        </div>
      ),
    equilibrio: () => <Equilibrio din={equilibrioDinero(estados)} areas={prefs.areas} />,
  };

  const fecha = `${DAY_NAMES[n.dow][0].toUpperCase() + DAY_NAMES[n.dow].slice(1)} ${dia} de ${MESES[Number(mes.slice(5)) - 1]}`;
  return (
    <main class="page">
      <header class="head">
        <div class="stack" style={{ gap: "2px" }}>
          <span class="sub">{fecha}</span>
          <h1>Hola, Diego</h1>
        </div>
      </header>
      <p class="sub" style={{ margin: "-6px 0 4px" }}>
        {ahora}
      </p>
      {store.hasDemo() && <DemoBanner />}
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

function Equilibrio({ din, areas }: { din: number | null; areas: string[] }) {
  const vals: Record<string, number | null> = { dinero: din, metas: null, cuerpo: null, futbol: null, estudios: null, trabajo: null };
  const list = AREAS.filter((a) => areas.includes(a.id) && vals[a.id] != null);
  if (!list.length) return null;
  return (
    <div class="card">
      <span class="lbl">Equilibrio del mes</span>
      <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr) 40px", gap: "8px 10px", alignItems: "center", fontSize: "13px" }}>
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
          Cada área va de 0 a 100 y compara lo que hiciste con lo que te propusiste. No es una nota sobre tu vida, es solo una guía. Dinero: si a esta altura del mes gastaste lo que te tocaba según tu presupuesto o menos, 100; si te pasaste, baja en proporción. Metas, entrenamiento, fútbol, estudios y trabajo aparecen aquí cuando lleguen sus fases.
        </p>
      </details>
    </div>
  );
}

function DemoBanner() {
  return (
    <div class="card" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <span class="small">Estás viendo datos de ejemplo.</span>
      <button
        class="btn sm"
        onClick={async () => {
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
