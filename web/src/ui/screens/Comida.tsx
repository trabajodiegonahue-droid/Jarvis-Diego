// Comida y suplementos: checklist del día, proteína estimada contra la meta (~110 g), agua,
// aviso si no subes de peso y gráficos (proteína, creatina, agua y peso).
import { useState } from "preact/hooks";
import { addDays, dow } from "../../core/dates";
import { chileNow } from "../../core/time";
import { store } from "../../data/store";
import type { Comida as TComida } from "../../data/types";
import { routine } from "../../jarvis/instance";
import { gramosDe, ITEMS, proteinaDia, rachaCreatina, sinSubir, type ConfigComida, type ItemComida } from "../../plan/comida";
import { pesoSemanal } from "../../plan/futbolCalc";
import { norm } from "../../routine/routine";
import { Bars, Line, Ring } from "../charts";
import { Icon } from "../icons";
import { getPrefs, setPrefs, toast, useApp } from "../state";
import { guardarDia } from "./Habitos";
import { sumarDiaMeta } from "../../jarvis/metasPlan";

const LETRA = ["L", "M", "M", "J", "V", "S", "D"];
export const configComida = (): ConfigComida => getPrefs().comida;

export async function marcarComida(k: ItemComida, fecha: string, valor?: boolean) {
  const x: TComida = store.data.comidas.find((c) => c.id === fecha) || { id: fecha };
  const nuevo = { ...x, [k]: valor ?? !x[k] };
  await store.put("comidas", nuevo);
  // Tacha el bloque de Mi Día que corresponde (si ya están todas las cosas de ese bloque).
  const it = ITEMS.find((i) => i.k === k)!;
  const t = routine.tasks.find((r) => norm(r.title) === norm(it.rutina));
  const todas = ITEMS.filter((i) => i.rutina === it.rutina).every((i) => nuevo[i.k]);
  if (t && todas && !t.done.includes(fecha)) routine.check(t, fecha);
  if (k === "creatina" && nuevo.creatina) void sumarDiaMeta("Creatina todos los días", fecha);
  return nuevo;
}

export function Comida() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const c = prefs.comida;
  const x = data.comidas.find((y) => y.id === hoy);
  const prot = proteinaDia(x, c);
  const agua = data.dias.find((d) => d.id === hoy)?.agua || 0;
  const aviso = sinSubir(data.pesos, hoy);
  const [editar, setEditar] = useState(false);
  const dias = Array.from({ length: 14 }, (_, i) => addDays(hoy, i - 13));
  const et = (f: string) => (f === hoy ? "Hoy" : `${LETRA[dow(f)]}${Number(f.slice(8))}`);
  const protSerie = dias.map((f) => ({ etiqueta: et(f), valor: proteinaDia(data.comidas.find((y) => y.id === f), c) }));
  const aguaSerie = dias.map((f) => ({ etiqueta: et(f), valor: data.dias.find((d) => d.id === f)?.agua || 0 }));
  const creatina = dias.map((f) => ({ f, ok: !!data.comidas.find((y) => y.id === f)?.creatina }));
  const pesos = pesoSemanal(data.pesos, addDays(hoy, -7 * 11), hoy);
  return (
    <main class="page">
      <header class="head">
        <h1>Comida</h1>
        <button class="btn sm" onClick={() => setEditar(!editar)} aria-expanded={editar}>
          Ajustar
        </button>
      </header>
      <section class="card" style={{ flexDirection: "row", alignItems: "center", gap: "16px" }}>
        <Ring value={(prot / c.meta) * 100} size={104} color="#e8772e" center={`${prot} g`} label={`Proteína de hoy: ${prot} de ${c.meta} gramos`} />
        <div class="stack" style={{ gap: "4px" }}>
          <span class="lbl">Proteína de hoy</span>
          <strong style={{ fontSize: "20px" }}>
            {prot} de {c.meta} g
          </strong>
          <span class="small">{prot >= c.meta ? "Meta cumplida. Bien ahí." : `Te faltan ${c.meta - prot} g.`}</span>
          <span class="small">Creatina: {x?.creatina ? "✓ tomada" : "pendiente"} · racha {rachaCreatina(data.comidas, hoy)} {rachaCreatina(data.comidas, hoy) === 1 ? "día" : "días"}</span>
        </div>
      </section>
      {aviso && (
        <section class="card" style={{ borderColor: "var(--amber)" }} role="status">
          <strong>No estás subiendo de peso</strong>
          <span class="small">
            Pasaste de {String(aviso.antes).replace(".", ",")} a {String(aviso.kg).replace(".", ",")} kg en 2–3 semanas. Agrega media taza más de avena al batido.
          </span>
        </section>
      )}
      {editar && (
        <section class="card">
          <span class="lbl">Ajustes (según la etiqueta de tu proteína)</span>
          {(
            [
              ["medida", "Gramos de proteína por medida"],
              ["meta", "Meta de proteína al día (g)"],
              ["almuerzo", "Proteína del almuerzo (g)"],
              ["once", "Proteína de la once/comida (g)"],
              ["colacion", "Proteína de la colación (g)"],
            ] as [keyof ConfigComida, string][]
          ).map(([k, n]) => (
            <label key={k} class="between">
              <span>{n}</span>
              <input inputMode="numeric" value={c[k]} onInput={(e) => setPrefs({ comida: { ...c, [k]: Number((e.target as HTMLInputElement).value) || 0 } })} style={{ width: "80px", minHeight: "44px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--card2)", color: "var(--ink)", textAlign: "center", fontSize: "16px" }} />
            </label>
          ))}
        </section>
      )}
      <section class="card">
        <span class="lbl">Hoy</span>
        {ITEMS.map((i) => {
          const ok = !!x?.[i.k];
          const g = gramosDe(i.k, c);
          return (
            <button key={i.k} class={`comida-item ${ok ? "ok" : ""}`} aria-pressed={ok} onClick={() => void marcarComida(i.k, hoy)}>
              <span class="comida-check">{ok && <Icon name="check" size={18} />}</span>
              <span class="stack" style={{ gap: "1px", minWidth: 0 }}>
                <strong>{i.nombre}</strong>
                <span class="small">
                  {i.hora}
                  {i.detalle ? ` · ${i.detalle}` : ""}
                  {g ? ` · ~${g} g de proteína` : ""}
                </span>
              </span>
            </button>
          );
        })}
        <div class="agua">
          <span>
            <strong>Agua</strong>
            <span class="small"> · {agua} de {prefs.aguaMeta} vasos</span>
          </span>
          <div class="row">
            <button class="btn grande" aria-label="Un vaso menos" onClick={() => void guardarDia(hoy, { agua: Math.max(0, agua - 1) })}>
              −
            </button>
            <button class="btn main grande" aria-label="Un vaso más" onClick={() => { void guardarDia(hoy, { agua: agua + 1 }); if (agua + 1 === prefs.aguaMeta) toast("¡Meta de agua cumplida!"); }}>
              + Vaso
            </button>
          </div>
        </div>
      </section>
      <section class="card">
        <span class="lbl">Proteína por día (meta {c.meta} g)</span>
        <Bars data={protSerie} label="Proteína estimada por día, últimos 14 días" meta={c.meta} color="#e8772e" fmt={(v) => `${Math.round(v)}`} />
      </section>
      <section class="card">
        <span class="lbl">Creatina (14 días)</span>
        <div class="creatina-fila" role="img" aria-label={`Creatina: ${creatina.filter((d) => d.ok).length} de 14 días`}>
          {creatina.map((d) => (
            <span key={d.f} class={`creatina-dia ${d.ok ? "ok" : ""} ${d.f === hoy ? "hoy" : ""}`} title={d.f}>
              {d.ok ? "✓" : ""}
            </span>
          ))}
        </div>
        <span class="small">Racha: {rachaCreatina(data.comidas, hoy)} {rachaCreatina(data.comidas, hoy) === 1 ? "día" : "días"}. Funciona por acumulación: tómala todos los días.</span>
      </section>
      <section class="card">
        <span class="lbl">Agua por día</span>
        <Bars data={aguaSerie} label="Vasos de agua por día, últimos 14 días" meta={prefs.aguaMeta} color="var(--t1)" />
      </section>
      <section class="card">
        <span class="lbl">Peso corporal</span>
        {pesos.length >= 2 ? <Line data={pesos} label="Peso por semana" cero={false} fmt={(v) => `${String(Math.round(v * 10) / 10).replace(".", ",")} kg`} /> : <span class="small">Anota tu peso una vez por semana en Fútbol › Físico › Tests (o dile a JARVIS "peso 70,5 kilos").</span>}
      </section>
    </main>
  );
}
