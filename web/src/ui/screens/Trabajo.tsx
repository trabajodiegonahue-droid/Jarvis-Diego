import { useState } from "preact/hooks";
import { addDays, dow, fechaCorta, lunesDe } from "../../core/dates";
import { chileNow, DAY_NAMES } from "../../core/time";
import { store } from "../../data/store";
import { uid, type Turno } from "../../data/types";
import { mesDe, nombreMes } from "../../money/calc";
import { clp, parseCLP } from "../../money/format";
import { horasMes, horasSemana, horasTurno, idPropinas, movPropinas, serieHoras, sueldoEstimado } from "../../work/calc";
import { Bars } from "../charts";
import { Sheet } from "../components";
import { Icon } from "../icons";
import { getPrefs, setPrefs, toast, useApp } from "../state";

const fh = (h: number) => (Math.round(h * 10) / 10).toLocaleString("es-CL");

// Guarda el turno y deja sus propinas en Dinero (o las quita si se borraron).
export async function guardarTurno(t: Turno) {
  await store.put("turnos", t);
  const mov = movPropinas(t);
  if (mov) await store.put("movimientos", mov);
  else if (store.data.movimientos.some((m) => m.id === idPropinas(t.id))) await store.remove("movimientos", idPropinas(t.id));
}

export async function borrarTurno(t: Turno) {
  const u1 = await store.remove("turnos", t.id);
  const tenia = store.data.movimientos.some((m) => m.id === idPropinas(t.id));
  const u2 = tenia ? await store.remove("movimientos", idPropinas(t.id)) : async () => {};
  toast("Turno borrado.", async () => {
    await u1();
    await u2();
  });
}

export function Trabajo() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const mes = mesDe(hoy);
  const [lunes, setLunes] = useState(lunesDe(hoy));
  const [form, setForm] = useState<{ t?: Turno; fecha?: string } | null>(null);
  const horas = horasMes(data.turnos, mes);
  // Todas las propinas del mes en Dinero (las de los turnos y las que anotaste aparte).
  const propinas = data.movimientos.filter((m) => m.tipo === "ingreso" && m.categoriaId === "i-propinas" && m.fecha.startsWith(mes)).reduce((a, m) => a + m.monto, 0);
  const serie = serieHoras(data.turnos, mes, 6);
  const semana = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));

  return (
    <main class="page">
      <header class="head">
        <h1>Trabajo</h1>
        <button class="btn sm" onClick={() => setForm({ fecha: hoy })}>
          <Icon name="plus" size={18} /> Turno
        </button>
      </header>

      <div class="card">
        <span class="lbl">Horas trabajadas en {nombreMes(mes)}</span>
        <span class="big num">{fh(horas)} h</span>
        <div class="grid2">
          <div class="stack" style={{ gap: "2px" }}>
            <span class="small">Sueldo estimado</span>
            <span class="mid">{prefs.tarifaHora ? clp(sueldoEstimado(horas, prefs.tarifaHora)) : "—"}</span>
          </div>
          <div class="stack" style={{ gap: "2px" }}>
            <span class="small">Propinas del mes</span>
            <span class="mid pos">{clp(propinas)}</span>
          </div>
        </div>
        <details>
          <summary class="small" style={{ cursor: "pointer", minHeight: "32px" }}>
            {prefs.tarifaHora ? `Valor por hora: ${clp(prefs.tarifaHora)}` : "Pon tu valor por hora para estimar el sueldo"}
          </summary>
          <div class="row">
            <input
              aria-label="Valor por hora"
              inputMode="numeric"
              placeholder="3.200"
              defaultValue={prefs.tarifaHora ? clp(prefs.tarifaHora) : ""}
              onChange={(e) => {
                const v = parseCLP((e.target as HTMLInputElement).value);
                setPrefs({ tarifaHora: v || 0 });
                toast(v ? "Valor por hora guardado." : "Valor por hora quitado.");
              }}
              style={{ flex: 1, minHeight: "44px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 12px" }}
            />
          </div>
          <p class="small" style={{ margin: "6px 0 0" }}>
            Es solo una estimación. El sueldo de verdad lo anotas en Dinero cuando te pagan (o como ingreso fijo). Las propinas de cada turno pasan solas a Dinero.
          </p>
        </details>
      </div>

      <div class="card">
        <div class="between">
          <button class="icon-btn" aria-label="Semana anterior" onClick={() => setLunes(addDays(lunes, -7))}>
            <Icon name="back" />
          </button>
          <strong>
            Semana del {fechaCorta(lunes)} · {fh(horasSemana(data.turnos, lunes))} h
          </strong>
          <button class="icon-btn" aria-label="Semana siguiente" onClick={() => setLunes(addDays(lunes, 7))}>
            <Icon name="chevron" />
          </button>
        </div>
        <div class="list">
          {semana.map((f) => {
            const ts = data.turnos.filter((t) => t.fecha === f).sort((a, b) => a.inicio.localeCompare(b.inicio));
            return (
              <div key={f} class="item" style={{ gridTemplateColumns: "64px minmax(0,1fr) auto", background: f === hoy ? "color-mix(in srgb, var(--blue) 8%, transparent)" : undefined }}>
                <span class="small">
                  {DAY_NAMES[dow(f)].slice(0, 3)} {Number(f.slice(8))}
                </span>
                <span class="stack" style={{ gap: "2px" }}>
                  {ts.length ? (
                    ts.map((t) => (
                      <button key={t.id} class="link" style={{ textAlign: "left", color: t.falte ? "var(--muted)" : "var(--ink)", textDecoration: t.falte ? "line-through" : "none", minHeight: "36px" }} onClick={() => setForm({ t })}>
                        {t.inicio}–{t.fin} · {fh(horasTurno(t))} h{t.propinas ? ` · ${clp(t.propinas)}` : ""}
                        {t.falte ? " (falté)" : ""}
                      </button>
                    ))
                  ) : (
                    <span class="small">Libre</span>
                  )}
                </span>
                <button class="icon-btn" aria-label={`Agregar turno el ${DAY_NAMES[dow(f)]} ${Number(f.slice(8))}`} onClick={() => setForm({ fecha: f })}>
                  <Icon name="plus" size={18} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          class="btn sm"
          onClick={async () => {
            const ts = data.turnos.filter((t) => t.fecha >= lunes && t.fecha <= addDays(lunes, 6));
            if (!ts.length) return toast("Esta semana no tiene turnos para copiar.");
            const nuevos = ts.filter((t) => !data.turnos.some((x) => x.fecha === addDays(t.fecha, 7) && x.inicio === t.inicio)).map((t) => ({ ...t, id: uid(), fecha: addDays(t.fecha, 7), propinas: undefined, falte: undefined, demo: undefined }));
            await store.put("turnos", ...nuevos);
            setLunes(addDays(lunes, 7));
            toast(`Copié ${nuevos.length} turnos a la semana siguiente.`, async () => void (await store.remove("turnos", ...nuevos.map((x) => x.id))));
          }}
        >
          <Icon name="repeat" size={18} /> Repetir esta semana en la siguiente
        </button>
      </div>

      <div class="card">
        <h2>Horas por mes</h2>
        <Bars label="Horas trabajadas en los últimos 6 meses" data={serie.map((p) => ({ etiqueta: nombreMes(p.mes, true), valor: p.horas }))} fmt={fh} />
      </div>

      {form && (
        <Sheet title={form.t ? "Editar turno" : "Nuevo turno"} onClose={() => setForm(null)}>
          <TurnoForm turno={form.t} fecha={form.fecha} onDone={() => setForm(null)} />
        </Sheet>
      )}
    </main>
  );
}

export function TurnoForm({ turno, fecha: fecha0, onDone }: { turno?: Turno; fecha?: string; onDone: () => void }) {
  const hoy = chileNow().date;
  // Por defecto, el horario del último turno anotado.
  const ultimo = [...store.data.turnos].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const [fecha, setFecha] = useState(turno?.fecha || fecha0 || hoy);
  const [inicio, setInicio] = useState(turno?.inicio || ultimo?.inicio || "14:00");
  const [fin, setFin] = useState(turno?.fin || ultimo?.fin || "22:30");
  const [pausa, setPausa] = useState(String(turno?.pausaMin ?? ultimo?.pausaMin ?? 30));
  const [propinas, setPropinas] = useState(turno?.propinas ? clp(turno.propinas) : "");
  const [falte, setFalte] = useState(!!turno?.falte);
  const t: Turno = { id: turno?.id || uid(), fecha, inicio, fin, pausaMin: Math.max(0, Number(pausa) || 0) };
  const horas = horasTurno(t);
  const tarifa = getPrefs().tarifaHora;
  return (
    <form
      class="stack"
      style={{ gap: "16px" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fin)) return toast("Revisa la hora de entrada y de salida.");
        const p = propinas.trim() ? parseCLP(propinas) : 0;
        if (p == null) return toast("No entendí las propinas. Escríbelas así: 15.000");
        await guardarTurno({ ...t, propinas: p || undefined, falte: falte || undefined, ...(turno?.demo ? { demo: true } : {}) });
        onDone();
        toast(turno ? "Turno guardado." : `Turno anotado: ${inicio}–${fin}.${p ? " Las propinas quedaron en Dinero." : ""}`);
      }}
    >
      <div class="field">
        <label class="lbl" for="t-f">
          Día
        </label>
        <input id="t-f" type="date" value={fecha} onInput={(e) => setFecha((e.target as HTMLInputElement).value || hoy)} />
      </div>
      <div class="grid2">
        <div class="field">
          <label class="lbl" for="t-i">
            Entrada
          </label>
          <input id="t-i" type="time" value={inicio} onInput={(e) => setInicio((e.target as HTMLInputElement).value)} />
        </div>
        <div class="field">
          <label class="lbl" for="t-s">
            Salida
          </label>
          <input id="t-s" type="time" value={fin} onInput={(e) => setFin((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label class="lbl" for="t-p">
            Colación (min)
          </label>
          <input id="t-p" inputMode="numeric" value={pausa} onInput={(e) => setPausa((e.target as HTMLInputElement).value)} />
        </div>
        <div class="field">
          <label class="lbl" for="t-pr">
            Propinas
          </label>
          <input id="t-pr" inputMode="numeric" placeholder="$0" value={propinas} onInput={(e) => setPropinas((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      <span class="small">
        {fh(horas)} horas{tarifa ? ` · estimado ${clp(sueldoEstimado(horas, tarifa))}` : ""}
        {fin < inicio ? " · termina al día siguiente" : ""}
      </span>
      {(turno || fecha < hoy) && (
        <label class="row" style={{ minHeight: "44px" }}>
          <input type="checkbox" checked={falte} onChange={(e) => setFalte((e.target as HTMLInputElement).checked)} style={{ width: "22px", height: "22px" }} />
          No fui a este turno
        </label>
      )}
      <button class="btn main full">{turno ? "Guardar" : "Anotar turno"}</button>
      {turno && (
        <button
          type="button"
          class="btn danger full"
          onClick={async () => {
            onDone();
            await borrarTurno(turno);
          }}
        >
          <Icon name="trash" size={18} /> Borrar turno
        </button>
      )}
    </form>
  );
}
