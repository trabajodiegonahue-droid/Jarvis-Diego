// Fútbol › Físico: Semana (calendario por tipo de sesión), Ejercicios (biblioteca del bloque),
// Tests (semanas 0, 4 y 8, más el peso) y Gráficos (con filtro Semana · 4 semanas · Bloque).
import { useState } from "preact/hooks";
import { addDays, dow, fechaCorta, lunesDe } from "../../core/dates";
import { chileNow } from "../../core/time";
import { store } from "../../data/store";
import { uid, type TestFisico } from "../../data/types";
import { COLOR_SESION, faseDe, NOMBRE_SESION, planDelDia, type TipoSesion } from "../../plan/bloque";
import { cargaSemanal, cumplimiento, diasEntrenados, fuerzaSerie, hecha, pesoSemanal, planificadas, racha, rango, rpeDiario, serieTest, sesionesPorSemana, seriesPorSemana, TESTS, type Filtro } from "../../plan/futbolCalc";
import { CALENTAMIENTO, dosis, EJ, SESIONES, type EjB } from "../../plan/sesiones";
import { records } from "../../training/calc";
import { ejercicio } from "../../training/ejercicios";
import { BarsApiladas, Heatmap, Line, Ring } from "../charts";
import { Empty, Sheet } from "../components";
import { Figura } from "../figura";
import { Icon } from "../icons";
import { toast, useApp } from "../state";

const LETRA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const TIPOS: TipoSesion[] = ["fuerza", "velocidad", "agilidad", "tecnica", "resistencia", "preparador", "activacion", "recuperacion", "partido"];
const ejId = (e: EjB) => (ejercicio(e.id) ? e.id : `libre:${e.nombre}`);
const f1 = (x: number) => String(Math.round(x * 100) / 100).replace(".", ",");

// ---------- Semana ----------
export function SemanaBloque() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const [lunes, setLunes] = useState(lunesDe(hoy));
  const pl = planificadas(lunes, addDays(lunes, 6), prefs.partidoPorSemana);
  const hechas = pl.filter((p) => p.fecha <= hoy && hecha(p, data.entrenos)).length;
  const hasta = pl.filter((p) => p.fecha <= hoy).length;
  const r = racha(data.entrenos, hoy, prefs.partidoPorSemana);
  return (
    <>
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
      <div class="kpis">
        <div class="kpi">
          <span class="lbl">Semana</span>
          <strong>
            {hechas}/{hasta || pl.length}
          </strong>
          <span class="small">sesiones hechas</span>
        </div>
        <div class="kpi">
          <span class="lbl">Racha</span>
          <strong>{r} días</strong>
          <span class="small">cumpliendo el plan</span>
        </div>
        <div class="kpi">
          <span class="lbl">Fase</span>
          <strong style={{ fontSize: "16px" }}>{faseDe(lunes < hoy ? hoy : lunes, undefined, prefs.fechaPrueba || null).nombre}</strong>
          <span class="small">semana {Math.max(0, faseDe(lunes).semana)}</span>
        </div>
      </div>
      <div class="card" style={{ gap: "6px" }}>
        {Array.from({ length: 7 }, (_, k) => addDays(lunes, k)).map((f) => {
          const p = planDelDia(f, prefs.partidoPorSemana);
          const bloques = [p.manana, p.tarde];
          return (
            <div key={f} class={`sem-fila ${f === hoy ? "hoy" : ""}`}>
              <span class="sem-dia-n">
                <strong>{LETRA[dow(f)]}</strong>
                <span class="small">{p.mdTxt}</span>
              </span>
              <div class="sem-bloques">
                {bloques.map((b, i) => {
                  const ok = b.sesion && hecha({ fecha: f, turno: i ? "tarde" : "manana", tipo: b.tipo, sesion: b.sesion }, data.entrenos);
                  return (
                    <span key={i} class={`sem-bloque ${ok ? "ok" : ""} ${f < hoy && b.sesion && !ok ? "falto" : ""}`} style={{ "--c": COLOR_SESION[b.tipo] } as any}>
                      {ok ? "✓ " : ""}
                      {b.titulo.replace(/ \(.*\)$/, "")}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <Leyenda />
    </>
  );
}
function Leyenda() {
  return (
    <div class="chips" aria-label="Colores" style={{ gap: "10px" }}>
      {TIPOS.map((t) => (
        <span key={t} class="small row" style={{ gap: "4px" }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: COLOR_SESION[t] }} />
          {NOMBRE_SESION[t]}
        </span>
      ))}
    </div>
  );
}

// ---------- Ejercicios ----------
const GRUPOS: { nombre: string; ids: string[] }[] = [
  { nombre: "Calentamiento FIFA 11+", ids: CALENTAMIENTO },
  ...(["fuerzaA", "fuerzaB", "velocidad", "resistencia", "agilidad", "activacion", "tecnica", "recuperacion", "preparador"] as const).map((k) => ({ nombre: SESIONES[k].nombre, ids: SESIONES[k].ejercicios })),
];
export function EjerciciosBloque() {
  const { data, prefs } = useApp();
  const [filtro, setFiltro] = useState("Todos");
  const [sel, setSel] = useState<EjB | null>(null);
  const fase = faseDe(chileNow().date, undefined, prefs.fechaPrueba || null).nombre;
  const grupos = GRUPOS.filter((g) => filtro === "Todos" || g.nombre === filtro);
  return (
    <>
      <div class="jv-sugerencias" style={{ margin: "0 -4px" }}>
        {["Todos", ...GRUPOS.map((g) => g.nombre)].map((g) => (
          <button key={g} class={filtro === g ? "on" : ""} style={filtro === g ? { background: "var(--green)", color: "var(--on-accent)", borderColor: "var(--green)" } : {}} onClick={() => setFiltro(g)}>
            {g.replace(/ \(.*\)/, "")}
          </button>
        ))}
      </div>
      {grupos.map((g) => (
        <section key={g.nombre} class="card">
          <span class="lbl">{g.nombre}</span>
          <div class="ej-grid">
            {[...new Set(g.ids)].map((id) => {
              const e = EJ[id];
              const r = records(data.entrenos, ejId(e));
              return (
                <button key={id} class="ej-item" onClick={() => setSel(e)}>
                  <Figura pose={e.pose} size={64} label={e.nombre} />
                  <span class="stack" style={{ gap: "2px", minWidth: 0 }}>
                    <strong>{e.nombre}</strong>
                    <span class="small">
                      {dosis(e, fase).series} × {e.reps}
                      {r.maxKg ? ` · récord ${f1(r.maxKg.kg)} kg × ${r.maxKg.reps}` : r.maxReps ? ` · récord ${r.maxReps.reps}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {sel && <EjercicioDetalle e={sel} fase={fase} onClose={() => setSel(null)} />}
    </>
  );
}
function EjercicioDetalle({ e, fase, onClose }: { e: EjB; fase: string; onClose: () => void }) {
  const { data } = useApp();
  const id = ejId(e);
  const r = records(data.entrenos, id);
  const hist = [...data.entrenos].sort((a, b) => b.fecha.localeCompare(a.fecha)).filter((en) => en.items.some((i) => i.ejId === id && i.series.length)).slice(0, 6);
  const d = dosis(e, fase);
  return (
    <Sheet title={e.nombre} onClose={onClose}>
      <div style={{ display: "grid", placeItems: "center" }}>
        <Figura pose={e.pose} size={200} label={`Cómo se hace: ${e.nombre}`} />
      </div>
      <span class="pill" style={{ alignSelf: "flex-start" }}>
        {d.series} × {e.reps}
        {e.porLado ? " por lado" : ""}
        {e.descanso ? ` · descanso ${e.descanso >= 120 ? `${Math.round(e.descanso / 60)} min` : `${e.descanso} s`}` : ""}
      </span>
      {d.nota && <span class="small" style={{ color: "var(--amber)" }}>{d.nota}</span>}
      <span class="lbl">Cómo hacerlo</span>
      <ul class="consejos">
        {e.consejos.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <span class="lbl">Mi récord</span>
      <span>{r.maxKg ? `${f1(r.maxKg.kg)} kg × ${r.maxKg.reps} (${fechaCorta(r.maxKg.fecha)})` : r.maxReps ? `${r.maxReps.reps} ${e.porTiempo ? "s" : "reps"} (${fechaCorta(r.maxReps.fecha)})` : "Todavía no lo registras."}</span>
      <span class="lbl">Historial</span>
      {!hist.length ? (
        <span class="small">Aparece cuando lo hagas en el modo entrenamiento.</span>
      ) : (
        hist.map((en) => {
          const it = en.items.find((i) => i.ejId === id)!;
          return (
            <div key={en.id} class="between small">
              <span>{fechaCorta(en.fecha)}</span>
              <span class="num">{it.series.map((s) => `${s.kg ? `${f1(s.kg)}×` : ""}${s.reps}`).join(" · ")}</span>
            </div>
          );
        })
      )}
    </Sheet>
  );
}

// ---------- Tests y peso ----------
export function TestsBloque() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const semana = Math.max(0, faseDe(hoy, undefined, prefs.fechaPrueba || null).semana);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [peso, setPeso] = useState("");
  const tests = [...data.tests].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <>
      <section class="card">
        <div class="between">
          <span class="lbl">Nuevo test · semana {semana}</span>
          <span class="small">{semana === 0 || semana === 4 || semana === 8 ? "¡Toca test esta semana!" : "Tests: semanas 0, 4 y 8"}</span>
        </div>
        <div class="test-grid">
          {TESTS.map((t) => (
            <label key={t.k} class="test-in">
              <span class="small">{t.nombre}</span>
              <span class="row" style={{ gap: "4px" }}>
                <input inputMode="decimal" placeholder="—" value={vals[t.k] || ""} onInput={(e) => setVals({ ...vals, [t.k]: (e.target as HTMLInputElement).value })} />
                <span class="small">{t.unidad}</span>
              </span>
            </label>
          ))}
        </div>
        <button
          class="btn main full grande"
          onClick={async () => {
            const t: TestFisico = { id: uid(), fecha: hoy, semana };
            let n = 0;
            for (const x of TESTS) {
              const v = Number(String(vals[x.k] || "").replace(",", "."));
              if (v > 0) {
                (t as any)[x.k] = v;
                n++;
              }
            }
            if (!n) return toast("Anota al menos un resultado.");
            await store.put("tests", t);
            setVals({});
            toast(`Test guardado: ${n} resultados.`, () => void store.remove("tests", t.id));
          }}
        >
          Guardar test
        </button>
      </section>
      <section class="card">
        <span class="lbl">Peso semanal</span>
        <form
          class="row"
          onSubmit={async (e) => {
            e.preventDefault();
            const kg = Number(peso.replace(",", "."));
            if (!(kg > 30 && kg < 200)) return toast("Anota tu peso en kilos, por ejemplo 70,5.");
            await store.put("pesos", { id: hoy, kg });
            setPeso("");
            toast(`Peso anotado: ${f1(kg)} kg.`);
          }}
        >
          <input inputMode="decimal" placeholder="kg (ej: 70,5)" aria-label="Peso en kilos" value={peso} onInput={(e) => setPeso((e.target as HTMLInputElement).value)} style={{ flex: 1, minHeight: "52px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--card2)", color: "var(--ink)", padding: "0 14px", fontSize: "18px" }} />
          <button class="btn main grande">Anotar</button>
        </form>
        <span class="small">Mejor en ayunas, una vez por semana. Se guarda solo en tu teléfono.</span>
      </section>
      <section class="card">
        <span class="lbl">Tus tests</span>
        {!tests.length ? (
          <Empty text="Haz los tests de la semana 0 y anótalos aquí. Los repites en la semana 4 y en la 8 para ver cuánto mejoras." />
        ) : (
          TESTS.map((t) => {
            const s = serieTest(data.tests, t.k);
            if (!s.pts.length) return null;
            return (
              <div key={t.k} class="between" style={{ minHeight: "40px" }}>
                <span>{t.nombre}</span>
                <span class="num" style={{ textAlign: "right" }}>
                  {s.pts.map((p) => f1(p.valor)).join(" → ")} {t.unidad}
                  {s.cambio != null && (
                    <strong style={{ color: s.mejor == null ? "var(--muted)" : s.mejor ? "var(--green)" : "var(--red)", marginLeft: "6px" }}>
                      {s.cambio > 0 ? "+" : ""}
                      {f1(s.cambio)}%
                    </strong>
                  )}
                </span>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}

// ---------- Gráficos ----------
export function GraficosFutbol() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const [filtro, setFiltro] = useState<Filtro>("4sem");
  const { desde, hasta } = rango(filtro, hoy);
  const ents = data.entrenos;
  const porSem = sesionesPorSemana(ents, desde, hasta, prefs.partidoPorSemana);
  const cum = cumplimiento(ents, rango("bloque", hoy).desde, hoy, prefs.partidoPorSemana, hoy);
  const carga = cargaSemanal(ents, desde, hasta);
  const rpe = rpeDiario(ents, hoy, filtro === "semana" ? 7 : 28);
  const nc = seriesPorSemana(ents, ["nordico", `libre:Nórdico`, "copenhague-x", "libre:Copenhague"], desde, hasta).map((x: any) => ({ etiqueta: x.etiqueta, nordico: (x.nordico || 0) + (x["libre:Nórdico"] || 0), copenhague: (x["libre:Copenhague"] || 0) + (x["copenhague-x"] || 0) }));
  const pesos = pesoSemanal(data.pesos, desde, hasta);
  const fuerza = [
    { id: "bulgara", nombre: "Sentadilla búlgara" },
    { id: "libre:Remo a 1 brazo", nombre: "Remo a 1 brazo" },
    { id: "libre:Press de pecho en el suelo", nombre: "Press de pecho" },
  ].map((x) => ({ ...x, ...fuerzaSerie(ents, x.id, desde, hasta) }));
  const tecnica = [
    { k: "dominadasMala" as const, nombre: "Dominadas pierna mala" },
    { k: "paredIzq" as const, nombre: "Pared 30 s (izquierda)" },
    { k: "paredDer" as const, nombre: "Pared 30 s (derecha)" },
  ].map((x) => ({ ...x, ...serieTest(data.tests, x.k) }));
  const dom = ents.filter((e) => e.items.some((i) => i.ejId === "libre:Dominadas de balón con la pierna mala")).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((e) => ({ etiqueta: `${Number(e.fecha.slice(8))}/${Number(e.fecha.slice(5, 7))}`, valor: Math.max(...e.items.find((i) => i.ejId === "libre:Dominadas de balón con la pierna mala")!.series.map((s) => s.reps)) }));
  return (
    <>
      <div class="seg">
        {(
          [
            ["semana", "Semana"],
            ["4sem", "4 semanas"],
            ["bloque", "Bloque"],
          ] as [Filtro, string][]
        ).map(([k, n]) => (
          <button key={k} class={filtro === k ? "on" : ""} onClick={() => setFiltro(k)}>
            {n}
          </button>
        ))}
      </div>
      <section class="card" style={{ flexDirection: "row", alignItems: "center", gap: "16px" }}>
        <Ring value={cum.plan ? (cum.hechas / cum.plan) * 100 : 0} size={96} center={`${cum.plan ? Math.round((cum.hechas / cum.plan) * 100) : 0}%`} label={`Cumplimiento del bloque: ${cum.hechas} de ${cum.plan} sesiones`} />
        <div class="stack" style={{ gap: "4px" }}>
          <span class="lbl">Cumplimiento del bloque</span>
          <strong style={{ fontSize: "18px" }}>
            {cum.hechas} de {cum.plan} sesiones
          </strong>
          <span class="small">Racha: {racha(ents, hoy, prefs.partidoPorSemana)} días</span>
        </div>
      </section>
      <section class="card">
        <span class="lbl">Sesiones por semana</span>
        <BarsApiladas data={porSem.map((s) => ({ etiqueta: s.etiqueta, ...s.tipos }))} plan={porSem.map((s) => s.plan)} series={TIPOS.map((t) => ({ k: t, nombre: NOMBRE_SESION[t], color: COLOR_SESION[t] }))} label="Sesiones hechas por semana y tipo, contra las planificadas" />
      </section>
      <section class="card">
        <span class="lbl">Carga semanal (minutos × esfuerzo)</span>
        {carga.some((c) => c.valor) ? <Line data={carga} label="Carga semanal" fmt={(x) => String(Math.round(x))} /> : <Vacio />}
        <span class="small">Si sube más de un 30% de una semana a otra, ojo con las lesiones.</span>
      </section>
      <section class="card">
        <span class="lbl">Esfuerzo (RPE) por día</span>
        {rpe.length >= 2 ? <Line data={rpe} label="Esfuerzo por día, de 1 a 10" cero={false} fmt={(x) => String(Math.round(x))} /> : <Vacio />}
      </section>
      <section class="card">
        <span class="lbl">Tests (semana 0, 4 y 8)</span>
        {TESTS.map((t) => {
          const s = serieTest(data.tests, t.k);
          if (s.pts.length < 2) return null;
          return (
            <div key={t.k} class="stack" style={{ gap: "2px" }}>
              <div class="between">
                <strong style={{ fontSize: "14px" }}>{t.nombre}</strong>
                <strong style={{ color: s.mejor == null ? "var(--muted)" : s.mejor ? "var(--green)" : "var(--red)" }}>
                  {s.cambio! > 0 ? "+" : ""}
                  {f1(s.cambio!)}% {s.mejor ? "mejor" : s.mejor === false ? "peor" : ""}
                </strong>
              </div>
              <Line data={s.pts} label={`${t.nombre} en cada test`} cero={false} fmt={(x) => `${f1(x)} ${t.unidad}`} />
            </div>
          );
        })}
        {data.tests.length < 2 && <span class="small">Aparece cuando tengas 2 tests (semana 0 y semana 4). En sprint y 5-10-5, menos es mejor.</span>}
      </section>
      <section class="card">
        <span class="lbl">Fuerza (kg × reps, mejor serie)</span>
        {fuerza.some((f) => f.pts.length) ? (
          fuerza
            .filter((f) => f.pts.length)
            .map((f) => (
              <div key={f.id} class="stack" style={{ gap: "2px" }}>
                <div class="between">
                  <strong style={{ fontSize: "14px" }}>{f.nombre}</strong>
                  <span class="small">Récord: {f.record}</span>
                </div>
                <Line data={f.pts} label={`${f.nombre}: kilos por repeticiones`} cero={false} fmt={(x) => String(Math.round(x))} />
              </div>
            ))
        ) : (
          <Vacio />
        )}
      </section>
      <section class="card">
        <span class="lbl">Nórdicos y Copenhague (series por semana)</span>
        <BarsApiladas data={nc} series={[{ k: "nordico", nombre: "Nórdico", color: "var(--t1)" }, { k: "copenhague", nombre: "Copenhague", color: "var(--t7)" }]} label="Series de nórdico y Copenhague por semana" />
        <span class="small">No te los saltes: protegen isquiotibiales y aductores.</span>
      </section>
      <section class="card">
        <span class="lbl">Peso corporal</span>
        {pesos.length >= 2 ? <Line data={pesos} label="Peso por semana" cero={false} fmt={(x) => `${f1(x)} kg`} /> : <span class="small">Anota tu peso en Tests una vez por semana.</span>}
        <span class="small">Meta para ganar músculo: subir ~0,25 kg por semana.</span>
      </section>
      <section class="card">
        <span class="lbl">Días entrenados</span>
        <Heatmap dias={diasEntrenados(ents, filtro === "semana" ? addDays(lunesDe(hoy), -21) : desde, hasta)} label="Días entrenados" hoy={hoy} />
      </section>
      <section class="card">
        <span class="lbl">Técnica</span>
        {tecnica.filter((t) => t.pts.length >= 2).map((t) => (
          <div key={t.k} class="stack" style={{ gap: "2px" }}>
            <strong style={{ fontSize: "14px" }}>{t.nombre}</strong>
            <Line data={t.pts} label={t.nombre} cero={false} fmt={(x) => String(Math.round(x))} />
          </div>
        ))}
        {dom.length >= 2 && (
          <div class="stack" style={{ gap: "2px" }}>
            <strong style={{ fontSize: "14px" }}>Récord de dominadas (pierna mala), en entrenamientos</strong>
            <Line data={dom} label="Dominadas de balón con la pierna mala" cero={false} fmt={(x) => String(Math.round(x))} />
          </div>
        )}
        {!tecnica.some((t) => t.pts.length >= 2) && dom.length < 2 && <span class="small">Aparece con tus tests de pared y dominadas de balón.</span>}
      </section>
    </>
  );
}
const Vacio = () => <span class="small">Todavía no hay datos: aparecen cuando entrenes con el modo entrenamiento.</span>;
