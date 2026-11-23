// Cardio: tus trotes y salidas, kilómetros por semana, ritmo y récords.
import { fechaCorta } from "../../core/dates";
import { chileNow } from "../../core/time";
import { kmPorSemana, kmTxt, mmss, records, salidas, tendenciaRitmo } from "../../cardio/calc";
import { Bars } from "../charts";
import { Empty } from "../components";
import { Icon } from "../icons";
import { go, useApp } from "../state";
import { abrirJarvis } from "./Jarvis";

export function Cardio() {
  const { data } = useApp();
  const hoy = chileNow().date;
  const ss = salidas(data.entrenos);
  const rec = records(ss, hoy);
  const sem = kmPorSemana(ss, hoy, 8);
  const tend = tendenciaRitmo(ss);
  return (
    <main class="page">
      <header class="head">
        <button class="icon-btn" aria-label="Volver" onClick={() => history.back()}>
          <Icon name="izq" />
        </button>
        <h1 style={{ flex: 1 }}>Cardio</h1>
        <button class="btn sm main" onClick={() => abrirJarvis({ borrador: "troté " })}>
          Anotar
        </button>
      </header>
      {!ss.length ? (
        <div class="card">
          <Empty text='Todavía no hay trotes. Dile a JARVIS: "troté 3 km en 20 minutos y quemé 250 calorías".' />
        </div>
      ) : (
        <>
          <div class="kpis">
            <div class="kpi">
              <span class="lbl">Este mes</span>
              <strong>{kmTxt(rec.kmMes)}</strong>
              <span class="small">{rec.salidasMes} {rec.salidasMes === 1 ? "salida" : "salidas"}</span>
            </div>
            <div class="kpi">
              <span class="lbl">Mejor ritmo</span>
              <strong>{rec.mejorRitmo?.ritmo ? mmss(rec.mejorRitmo.ritmo) : "—"}</strong>
              <span class="small">{rec.mejorRitmo ? `por km · ${fechaCorta(rec.mejorRitmo.fecha)}` : "falta km y tiempo"}</span>
            </div>
            <div class="kpi">
              <span class="lbl">Total</span>
              <strong>{kmTxt(rec.kmTotal)}</strong>
              <span class="small">{ss.length} {ss.length === 1 ? "salida" : "salidas"}</span>
            </div>
          </div>
          <div class="card">
            <span class="lbl">Kilómetros por semana</span>
            <Bars data={sem} label="Kilómetros por semana, últimas 8 semanas" fmt={(n) => String(n).replace(".", ",")} color="var(--t3)" />
            {tend != null && (
              <span class="small" style={{ color: tend < 0 ? "var(--green)" : tend > 0 ? "var(--amber)" : "var(--muted)" }}>
                {tend < 0 ? `Vas ${mmss(-tend)} más rápido por km que en tus salidas anteriores. Bien ahí.` : tend > 0 ? `Vas ${mmss(tend)} más lento por km que antes: puede ser cansancio, ojo con el descanso.` : "Tu ritmo se mantiene parejo."}
              </span>
            )}
          </div>
          <div class="card">
            <span class="lbl">Récords</span>
            <div class="item" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>Más larga</span>
              <strong>{rec.masLarga?.km ? `${kmTxt(rec.masLarga.km)} · ${fechaCorta(rec.masLarga.fecha)}` : "—"}</strong>
            </div>
            <div class="item" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>Mejor ritmo</span>
              <strong>{rec.mejorRitmo?.ritmo ? `${mmss(rec.mejorRitmo.ritmo)} /km · ${kmTxt(rec.mejorRitmo.km!)}` : "—"}</strong>
            </div>
            <div class="item" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>Más calorías</span>
              <strong>{rec.masCalorias?.kcal ? `${rec.masCalorias.kcal} kcal · ${fechaCorta(rec.masCalorias.fecha)}` : "—"}</strong>
            </div>
          </div>
          <div class="card">
            <span class="lbl">Tus salidas</span>
            {ss.slice(0, 30).map((s) => (
              <div key={s.id} class="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <div class="stack" style={{ gap: "2px" }}>
                  <strong>{s.nombre}</strong>
                  <span class="small">{[s.fecha === hoy ? "hoy" : fechaCorta(s.fecha), s.seg ? mmss(s.seg) : "", s.ritmo ? `${mmss(s.ritmo)} /km` : "", s.kcal ? `${s.kcal} kcal` : ""].filter(Boolean).join(" · ")}</span>
                </div>
                <strong style={{ fontSize: "17px" }}>{s.km ? kmTxt(s.km) : ""}</strong>
              </div>
            ))}
          </div>
        </>
      )}
      <button class="btn full" onClick={() => go("/futbol?fisico")}>
        Ver el plan del físico
      </button>
    </main>
  );
}
