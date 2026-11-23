import { enDificil } from "../../extras/calc";
// Hábitos y bienestar: un toque para marcar hábitos, sueño, energía, ánimo y agua; rachas y tendencias.
import { useState } from "preact/hooks";
import { addDays, dow, fechaCorta } from "../../core/dates";
import { chileNow, DAY_NAMES } from "../../core/time";
import { store } from "../../data/store";
import { uid, type Dia, type Habito } from "../../data/types";
import { activos, aplica, cumplimiento, ESCALA_ANIMO, ESCALA_ENERGIA, fraseBienestar, hecho, mejorRacha, promedios, racha, serieBienestar, SUGERIDOS } from "../../habits/calc";
import { Line, Progress } from "../charts";
import { Empty, Sheet } from "../components";
import { Icon } from "../icons";
import { toast, useApp, getPrefs } from "../state";

export async function guardarDia(fecha: string, patch: Partial<Dia>) {
  const antes = store.data.dias.find((x) => x.id === fecha);
  await store.put("dias", { ...(antes || { id: fecha, habitos: [] }), ...patch });
}

export async function toggleHabito(h: Habito, fecha: string) {
  const d = store.data.dias.find((x) => x.id === fecha);
  const hs = d?.habitos || [];
  await guardarDia(fecha, { habitos: hs.includes(h.id) ? hs.filter((x) => x !== h.id) : [...hs, h.id] });
}

const fnum = (v: number) => String(v).replace(".", ",");

export function Habitos() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const [fecha, setFecha] = useState(hoy);
  const [edit, setEdit] = useState<Habito | "nuevo" | null>(null);
  const dia = data.dias.find((x) => x.id === fecha);
  const hs = activos(data.habitos);
  const deHoy = hs.filter((h) => aplica(h, fecha));
  const serie = serieBienestar(data.dias, hoy, 14);
  const prom = promedios(data.dias, hoy);
  const cum = cumplimiento(data.habitos, data.dias, hoy);
  const frase = fraseBienestar(data.dias, hoy);

  return (
    <main class="page">
      <header class="head">
        <h1>Hábitos</h1>
        <button class="btn sm" onClick={() => setEdit("nuevo")}>
          <Icon name="plus" size={18} /> Hábito
        </button>
      </header>

      <div class="seg" role="tablist" aria-label="Día">
        {[
          { f: hoy, n: "Hoy" },
          { f: addDays(hoy, -1), n: "Ayer" },
        ].map((x) => (
          <button key={x.f} role="tab" aria-selected={fecha === x.f} class={fecha === x.f ? "on" : ""} onClick={() => setFecha(x.f)}>
            {x.n}
          </button>
        ))}
      </div>

      <div class="card">
        <h2>Mis hábitos {fecha === hoy ? "de hoy" : `del ${DAY_NAMES[dow(fecha)]}`}</h2>
        {!hs.length ? (
          <div class="stack">
            <span class="small">Elige uno para partir o crea el tuyo. Mejor pocos y que se cumplan.</span>
            <div class="chips">
              {SUGERIDOS.map((s) => (
                <button key={s} onClick={() => store.put("habitos", { id: uid(), nombre: s, dias: [], orden: data.habitos.length })}>
                  + {s}
                </button>
              ))}
            </div>
          </div>
        ) : !deHoy.length ? (
          <span class="small">Hoy no te toca ningún hábito.</span>
        ) : (
          deHoy.map((h) => {
            const ok = hecho(data.dias, h.id, fecha);
            const r = racha(h, data.dias, hoy, (f) => enDificil(getPrefs().dificil, f));
            return (
              <div key={h.id} class="item" style={{ gridTemplateColumns: "44px minmax(0,1fr) auto" }}>
                <button
                  aria-pressed={ok}
                  aria-label={`${h.nombre}: ${ok ? "cumplido" : "sin marcar"}`}
                  onClick={() => toggleHabito(h, fecha)}
                  style={{ width: "36px", height: "36px", borderRadius: "18px", border: ok ? "0" : "2px solid var(--muted)", background: ok ? "var(--green)" : "transparent", color: "var(--on-accent)", display: "grid", placeItems: "center" }}
                >
                  {ok && <Icon name="habitos" size={20} />}
                </button>
                <button class="link" style={{ textAlign: "left", color: "var(--ink)", background: "none", border: 0, padding: 0 }} onClick={() => setEdit(h)}>
                  <span class="t" style={{ display: "block" }}>{h.nombre}</span>
                  <Semana h={h} hoy={hoy} />
                </button>
                <span class="small num" title="Racha">
                  {r ? `${r} ${r === 1 ? "día" : "días"}` : ""}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div class="card">
        <h2>¿Cómo {fecha === hoy ? "estás" : "estuviste"}?</h2>
        <div class="between">
          <span>Sueño</span>
          <div class="row" style={{ gap: "6px" }}>
            <button class="icon-btn" aria-label="Menos sueño" onClick={() => guardarDia(fecha, { sueno: Math.max(0, (dia?.sueno ?? 7.5) - 0.5) })}>
              −
            </button>
            <span class="num" style={{ minWidth: "64px", textAlign: "center", fontWeight: 600 }}>{dia?.sueno != null ? `${fnum(dia.sueno)} h` : "—"}</span>
            <button class="icon-btn" aria-label="Más sueño" onClick={() => guardarDia(fecha, { sueno: dia?.sueno != null ? Math.min(14, dia.sueno + 0.5) : 7 })}>
              +
            </button>
          </div>
        </div>
        <Escala titulo="Energía" valores={ESCALA_ENERGIA} valor={dia?.energia} onPick={(v) => guardarDia(fecha, { energia: v })} />
        <Escala titulo="Ánimo" valores={ESCALA_ANIMO} valor={dia?.animo} onPick={(v) => guardarDia(fecha, { animo: v })} />
        <div class="between">
          <span>Agua</span>
          <div class="row" style={{ gap: "6px" }}>
            <button class="icon-btn" aria-label="Un vaso menos" onClick={() => guardarDia(fecha, { agua: Math.max(0, (dia?.agua || 0) - 1) })}>
              −
            </button>
            <span class="num" style={{ minWidth: "64px", textAlign: "center", fontWeight: 600 }}>
              {dia?.agua || 0} de {prefs.aguaMeta}
            </span>
            <button class="icon-btn" aria-label="Un vaso más" onClick={() => guardarDia(fecha, { agua: (dia?.agua || 0) + 1 })}>
              +
            </button>
          </div>
        </div>
        <Progress thin value={((dia?.agua || 0) / prefs.aguaMeta) * 100} color="var(--blue)" label={`Agua: ${dia?.agua || 0} de ${prefs.aguaMeta} vasos`} />
        <label class="lbl" for="diario">
          Diario (opcional)
        </label>
        <textarea
          id="diario"
          key={fecha}
          maxLength={2000}
          placeholder="Algo que quieras recordar de este día."
          defaultValue={dia?.diario || ""}
          onBlur={(e) => {
            const v = (e.target as HTMLTextAreaElement).value.trim();
            if (v !== (dia?.diario || "")) void guardarDia(fecha, { diario: v || undefined }).then(() => toast("Diario guardado."));
          }}
        />
        <span class="small">El diario queda solo en tu teléfono: JARVIS no se lo manda a Gemini.</span>
      </div>

      <div class="card">
        <h2>Últimos 14 días</h2>
        {frase && <p style={{ margin: 0, fontSize: "14px", borderLeft: "3px solid var(--blue)", paddingLeft: "10px" }}>{frase}</p>}
        <div class="grid2">
          <Dato t="Hábitos (7 días)" v={cum.pct != null ? `${cum.pct}%` : "—"} />
          <Dato t="Sueño promedio" v={prom.sueno != null ? `${fnum(prom.sueno)} h` : "—"} />
          <Dato t="Energía promedio" v={prom.energia != null ? `${fnum(prom.energia)} de 5` : "—"} />
          <Dato t="Ánimo promedio" v={prom.animo != null ? `${fnum(prom.animo)} de 5` : "—"} />
        </div>
        {serie.some((x) => x.sueno != null) && <Line label="Horas de sueño por día" cero={false} fmt={(n) => `${fnum(Math.round(n * 10) / 10)} h`} data={serie.filter((x) => x.sueno != null).map((x) => ({ etiqueta: fechaCorta(x.fecha), valor: x.sueno! }))} />}
        {serie.some((x) => x.animo != null) && <Line label="Ánimo (1 a 5)" cero={false} fmt={(n) => fnum(Math.round(n * 10) / 10)} data={serie.filter((x) => x.animo != null).map((x) => ({ etiqueta: fechaCorta(x.fecha), valor: x.animo! }))} />}
        {!serie.some((x) => x.sueno != null || x.animo != null) && <Empty text="Marca tu sueño y tu ánimo unos días y acá verás cómo vas." />}
      </div>

      {hs.length > 0 && (
        <div class="card">
          <h2>Rachas</h2>
          {hs.map((h) => (
            <div key={h.id} class="between" style={{ minHeight: "36px" }}>
              <span>{h.nombre}</span>
              <span class="small num">
                ahora {racha(h, data.dias, hoy, (f) => enDificil(getPrefs().dificil, f))} · mejor {mejorRacha(h, data.dias, hoy)}
              </span>
            </div>
          ))}
        </div>
      )}

      {edit && <HabitoForm h={edit === "nuevo" ? undefined : edit} onClose={() => setEdit(null)} />}
    </main>
  );
}

function Semana({ h, hoy }: { h: Habito; hoy: string }) {
  const { data } = useApp();
  return (
    <span class="row" style={{ gap: "4px", marginTop: "4px" }} aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => addDays(hoy, i - 6)).map((f) => {
        const ap = aplica(h, f);
        const ok = hecho(data.dias, h.id, f);
        return <span key={f} style={{ width: "10px", height: "10px", borderRadius: "5px", background: ok ? "var(--green)" : "transparent", border: ok ? "0" : ap ? "1.5px solid var(--muted)" : "1.5px dashed var(--line)", boxSizing: "border-box" }} />;
      })}
    </span>
  );
}

function Escala({ titulo, valores, valor, onPick }: { titulo: string; valores: string[]; valor?: number; onPick: (v: number) => void }) {
  return (
    <div class="stack" style={{ gap: "6px" }}>
      <span>
        {titulo}
        {valor ? <span class="small"> · {valores[valor - 1]}</span> : null}
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: "6px" }} role="radiogroup" aria-label={titulo}>
        {valores.map((v, i) => (
          <button key={v} role="radio" aria-checked={valor === i + 1} aria-label={`${titulo}: ${v}`} onClick={() => onPick(i + 1)} style={{ minHeight: "44px", borderRadius: "12px", border: "1px solid var(--line)", background: valor === i + 1 ? "var(--ink)" : "var(--card2)", color: valor === i + 1 ? "var(--bg)" : "var(--ink)", fontWeight: 600 }}>
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div class="stack" style={{ gap: "2px" }}>
      <span class="small">{t}</span>
      <span class="mid num">{v}</span>
    </div>
  );
}

function HabitoForm({ h, onClose }: { h?: Habito; onClose: () => void }) {
  const [nombre, setNombre] = useState(h?.nombre || "");
  const [dias, setDias] = useState<number[]>(h?.dias || []);
  const todos = !dias.length || dias.length === 7;
  async function guardar() {
    if (!nombre.trim()) return toast("Ponle un nombre al hábito.");
    await store.put("habitos", { ...(h || { id: uid(), orden: store.data.habitos.length }), nombre: nombre.trim(), dias: dias.length === 7 ? [] : dias });
    onClose();
  }
  return (
    <Sheet title={h ? "Editar hábito" : "Nuevo hábito"} onClose={onClose}>
      <div class="field">
        <label class="lbl" for="h-n">
          Nombre
        </label>
        <input id="h-n" value={nombre} maxLength={60} placeholder="Leer 15 minutos" onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
      </div>
      <div class="field">
        <span class="lbl">Qué días</span>
        <div class="chips">
          <button class={todos ? "on" : ""} aria-pressed={todos} onClick={() => setDias([])}>
            Todos
          </button>
          {DAY_NAMES.map((n, i) => {
            const on = !todos && dias.includes(i);
            return (
              <button key={n} class={on ? "on" : ""} aria-pressed={on} onClick={() => setDias(on ? dias.filter((x) => x !== i) : [...(todos ? [] : dias), i].sort())}>
                {n.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </div>
      <button class="btn main full" onClick={guardar}>
        Guardar
      </button>
      {h && (
        <div class="row">
          <button
            class="btn sm"
            onClick={async () => {
              await store.put("habitos", { ...h, archivado: true });
              onClose();
              toast("Hábito archivado. Sus días quedan en el historial.", () => void store.put("habitos", h));
            }}
          >
            Archivar
          </button>
          <button
            class="btn sm danger"
            onClick={async () => {
              const u = await store.remove("habitos", h.id);
              onClose();
              toast("Hábito borrado.", () => void u());
            }}
          >
            Borrar
          </button>
        </div>
      )}
    </Sheet>
  );
}
