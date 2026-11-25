// Estudio: la materia de hoy con "Empezar 45 min", las 5 materias (Matemática M1, Inglés, Lenguaje, Ventas, Economía)
// cada una con su subsección, y los gráficos. Lo antiguo (pendientes y pruebas) sigue en su pestaña.
import { useEffect, useState } from "preact/hooks";
import { addDays, lunesDe } from "../../core/dates";
import { localKV } from "../../core/storage";
import { chileNow } from "../../core/time";
import { store } from "../../data/store";
import { uid, type ErrorCuaderno, type EstudioLog, type MateriaBloque, type Tarjeta } from "../../data/types";
import { routine } from "../../jarvis/instance";
import { totalesMes } from "../../money/calc";
import { clp } from "../../money/format";
import { INICIO_BLOQUE } from "../../plan/bloque";
import {
  aprendida, diasEstudiados, EJES_MATE, ejeDeLaSemana, ejeDeTema, estudioDeHoy, interesCompuesto, MATERIAS, materia, MAZO_FUTBOL, minutosPorSemana, pct, presupuesto503020, puntoEquilibrio, rachaEstudio, repasarError, repasarTarjeta, TEMAS, temaDeLaSemana, tocanHoy, todasLasSesiones,
} from "../../plan/estudio";
import { rango, type Filtro } from "../../plan/futbolCalc";
import { norm } from "../../routine/routine";
import { Bars, BarsApiladas, BarsH, Line, Progress, Ring, Rueda } from "../charts";
import { Empty, Sheet } from "../components";
import { setPrefs, toast, useApp } from "../state";
import { Estudios } from "./Estudios";
import { sumarDiaMeta } from "../../jarvis/metasPlan";

type Seccion = "hoy" | MateriaBloque | "progreso" | "otros";
const inp = { width: "100%", minWidth: 0, minHeight: "48px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--card2)", color: "var(--ink)", padding: "0 12px", fontSize: "16px" } as const;
const tachar = (titulo: string, fecha: string) => {
  const t = routine.tasks.find((x) => norm(x.title) === norm(titulo));
  if (t && !t.done.includes(fecha)) routine.check(t, fecha);
};
interface Repaso {
  fecha: string;
  ok: boolean;
  aprendida?: boolean;
}
const repasos = () => localKV.get<Repaso[]>("repasosIngles", []);

export function Estudio() {
  const { data } = useApp();
  const [sec, setSec] = useState<Seccion>("hoy");
  // El mazo de inglés de fútbol se carga solo la primera vez.
  useEffect(() => {
    if (!store.ready || data.tarjetas.length || localKV.get("mazoCargado", false)) return;
    const hoy = chileNow().date;
    void store.put("tarjetas", ...MAZO_FUTBOL.map(([palabra, traduccion, ejemplo]): Tarjeta => ({ id: uid(), palabra, traduccion, ejemplo, intervalo: 1, proximaRevision: hoy, aciertos: 0, fallos: 0, mazo: "fútbol" })));
    localKV.set("mazoCargado", true);
  }, [data.tarjetas.length]);
  if (sec === "otros")
    return (
      <>
        <Secciones sec={sec} setSec={setSec} flotante />
        <Estudios />
      </>
    );
  return (
    <main class="page">
      <header class="head">
        <h1>Estudio</h1>
      </header>
      <Secciones sec={sec} setSec={setSec} />
      {sec === "hoy" && <Hoy ir={setSec} modo="hoy" />}
      {sec === "progreso" && <Hoy ir={setSec} modo="progreso" />}
      {sec === "mate" && <Mate />}
      {sec === "ingles" && <Ingles />}
      {sec === "lenguaje" && <Lenguaje />}
      {sec === "ventas" && <Ventas />}
      {sec === "economia" && <Economia />}
    </main>
  );
}

function Secciones({ sec, setSec, flotante }: { sec: Seccion; setSec: (s: Seccion) => void; flotante?: boolean }) {
  const items: [Seccion, string][] = [["hoy", "Hoy"], ["progreso", "Progreso"], ...MATERIAS.map((m): [Seccion, string] => [m.id, `${m.emoji} ${m.corto}`]), ["otros", "Pendientes y pruebas"]];
  return (
    <div class="jv-sugerencias secciones" style={flotante ? { padding: "calc(env(safe-area-inset-top) + 12px) 20px 0", maxWidth: "560px", margin: "0 auto" } : {}}>
      {items.map(([k, n]) => (
        <button key={k} class={sec === k ? "on" : ""} onClick={() => setSec(k)} aria-pressed={sec === k}>
          {n}
        </button>
      ))}
    </div>
  );
}

// ---------- Hoy ----------
function Hoy({ ir, modo }: { ir: (s: Seccion) => void; modo: "hoy" | "progreso" }) {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const e = estudioDeHoy(hoy);
  const [timer, setTimer] = useState<MateriaBloque | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("4sem");
  const log = todasLasSesiones(data.estudio, data.sesiones, data.materias);
  const lunes = lunesDe(hoy);
  const { desde, hasta } = rango(filtro, hoy);
  const semana = log.filter((x) => x.fecha >= lunes).reduce((t, x) => t + x.minutos, 0);
  const d = diasEstudiados(log, filtro === "semana" ? lunes : desde, hoy);
  const tarjetasHoy = tocanHoy(data.tarjetas, hoy).length;
  const erroresHoy = tocanHoy(data.errores, hoy).length;
  const ensayos = (m: MateriaBloque) => log.filter((x) => x.ensayo && x.materia === m && x.total).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => ({ etiqueta: `${Number(x.fecha.slice(8))}/${Number(x.fecha.slice(5, 7))}`, valor: pct(x.aciertos, x.total) }));
  const avance = (m: MateriaBloque) => {
    if (m === "mate") return pct(EJES_MATE.flatMap((x) => x.subtemas).filter((s) => prefs.estudioChecks[`mate:${s}`]).length, EJES_MATE.flatMap((x) => x.subtemas).length);
    if (m === "ventas" || m === "economia") return pct(TEMAS[m].filter((_, i) => prefs.estudioChecks[`${m}:${i}`]).length, 8);
    if (m === "ingles") return pct(data.tarjetas.filter(aprendida).length, Math.max(40, data.tarjetas.length));
    const l = log.filter((x) => x.materia === "lenguaje" && x.total);
    return l.length ? pct(l.reduce((t, x) => t + (x.aciertos || 0), 0), l.reduce((t, x) => t + (x.total || 0), 0)) : 0;
  };
  return (
    <>
      {modo === "hoy" && (
        <>
      <section class="card estudio-hoy" style={{ "--c": e.materia ? materia(e.materia).color : "var(--accent)" } as any}>
        <span class="lbl">Hoy, 13:45</span>
        <strong style={{ fontSize: "22px" }}>{e.materia ? `${materia(e.materia).emoji} ${materia(e.materia).nombre}` : e.ensayo ? "Mini-ensayo (opcional)" : "Libre"}</strong>
        <span class="small">{e.materia ? materia(e.materia).como : e.texto}</span>
        {e.materia && (
          <button class="btn main full grande" onClick={() => setTimer(e.materia)}>
            Empezar 45 min
          </button>
        )}
        {e.ensayo && (
          <button class="btn main full grande" onClick={() => ir(e.ensayo!)}>
            Registrar mini-ensayo de {e.ensayo === "mate" ? "Matemática" : "Lenguaje"}
          </button>
        )}
      </section>
      <InglesManana />
      {(tarjetasHoy > 0 || erroresHoy > 0) && (
        <section class="card">
          <span class="lbl">Para repasar hoy</span>
          {tarjetasHoy > 0 && (
            <button class="btn full" onClick={() => ir("ingles")}>
              🇬🇧 {tarjetasHoy} {tarjetasHoy === 1 ? "tarjeta" : "tarjetas"} de inglés
            </button>
          )}
          {erroresHoy > 0 && (
            <button class="btn full" onClick={() => ir(data.errores.find((x) => x.proximaRevision <= hoy && !x.resuelto)?.materia || "mate")}>
              📝 {erroresHoy} {erroresHoy === 1 ? "error" : "errores"} del cuaderno para rehacer sin mirar
            </button>
          )}
        </section>
      )}
      <div class="materias-grid">
        {MATERIAS.map((m) => {
          const min = log.filter((x) => x.materia === m.id && x.fecha >= lunes).reduce((t, x) => t + x.minutos, 0);
          return (
            <button key={m.id} class="materia-card" style={{ "--c": m.color } as any} onClick={() => ir(m.id)}>
              <span class="materia-emoji" aria-hidden="true">
                {m.emoji}
              </span>
              <strong>{m.corto}</strong>
              <span class="small">{min} min esta semana</span>
              <Progress thin value={avance(m.id)} color={m.color} label={`${m.corto}: ${avance(m.id)}% de avance`} />
            </button>
          );
        })}
      </div>
        </>
      )}
      {modo === "progreso" && (
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
        <Ring value={pct(d.hechos, d.plan)} size={96} center={`${d.hechos}/${d.plan}`} label={`Días estudiados: ${d.hechos} de ${d.plan}`} />
        <div class="stack" style={{ gap: "4px" }}>
          <span class="lbl">Días estudiados / planificados</span>
          <strong style={{ fontSize: "18px" }}>{semana} min esta semana</strong>
          <span class="small">Racha: {rachaEstudio(log, hoy)} días (el finde no la corta)</span>
        </div>
      </section>
      <section class="card">
        <span class="lbl">Minutos por materia, por semana</span>
        <BarsApiladas data={minutosPorSemana(log, desde, hasta)} series={MATERIAS.map((m) => ({ k: m.id, nombre: m.corto, color: m.color }))} label="Minutos de estudio por materia y semana" />
      </section>
      <section class="card">
        <span class="lbl">Mini-ensayos (% de aciertos)</span>
        {ensayos("mate").length + ensayos("lenguaje").length ? (
          <>
            {ensayos("mate").length >= 2 && <Line data={ensayos("mate")} label="Mini-ensayos de Matemática" cero={false} fmt={(x) => `${x}%`} />}
            {ensayos("lenguaje").length >= 2 && <Line data={ensayos("lenguaje")} label="Mini-ensayos de Lenguaje" cero={false} fmt={(x) => `${x}%`} />}
            <span class="small">{ensayos("mate").length} de Matemática · {ensayos("lenguaje").length} de Lenguaje</span>
          </>
        ) : (
          <span class="small">Los sábados: 15–20 preguntas. Regístralos en Matemática o Lenguaje.</span>
        )}
      </section>
      <section class="card">
        <span class="lbl">Avance por materia</span>
        <Rueda data={MATERIAS.map((m) => ({ nombre: m.corto, valor: avance(m.id) }))} label="Avance del temario por materia" />
      </section>
        </>
      )}
      {timer && <TimerEstudio m={timer} onClose={() => setTimer(null)} />}
    </>
  );
}

function InglesManana() {
  const { prefs } = useApp();
  const hoy = chileNow().date;
  const checks: [string, string][] = [
    ["escuchar", "Escuchar (podcast o video)"],
    ["palabras", "10 palabras nuevas"],
    ["shadowing", "Shadowing 5 min"],
  ];
  const marcar = (k: string) => {
    const key = `ing:${hoy}:${k}`;
    const nuevo = { ...prefs.estudioChecks, [key]: !prefs.estudioChecks[key] };
    setPrefs({ estudioChecks: nuevo });
    if (checks.every(([x]) => nuevo[`ing:${hoy}:${x}`])) tachar("Inglés suave", hoy);
  };
  return (
    <section class="card">
      <span class="lbl">🇬🇧 Inglés de la mañana (8:00)</span>
      <div class="chips">
        {checks.map(([k, n]) => (
          <button key={k} class={prefs.estudioChecks[`ing:${hoy}:${k}`] ? "on" : ""} aria-pressed={!!prefs.estudioChecks[`ing:${hoy}:${k}`]} onClick={() => marcar(k)}>
            {prefs.estudioChecks[`ing:${hoy}:${k}`] ? "✓ " : ""}
            {n}
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------- Temporizador de estudio ----------
function TimerEstudio({ m, onClose }: { m: MateriaBloque; onClose: () => void }) {
  const [inicio] = useState(Date.now());
  const [pausa, setPausa] = useState<number | null>(null);
  const [extra, setExtra] = useState(0);
  const [tema, setTema] = useState("");
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const total = 45 * 60;
  const pasado = Math.round(((pausa ?? Date.now()) - inicio) / 1000) - extra;
  const quedan = Math.max(0, total - pasado);
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  useEffect(() => {
    if (quedan === 0) navigator.vibrate?.([300, 100, 300]);
  }, [quedan === 0]);
  async function guardar() {
    const minutos = Math.max(1, Math.round(pasado / 60));
    const hoy = chileNow().date;
    const l: EstudioLog = { id: uid(), fecha: hoy, materia: m, minutos, ...(tema.trim() ? { tema: tema.trim() } : {}) };
    await store.put("estudio", l);
    tachar("Estudio", hoy);
    if (minutos >= 15) void sumarDiaMeta("Estudiar 5 días por semana", hoy);
    toast(`Guardado: ${minutos} min de ${materia(m).corto}.`, () => void store.remove("estudio", l.id));
    onClose();
  }
  return (
    <Sheet title={materia(m).nombre} onClose={onClose}>
      <div class="timer trabajo" role="timer">
        <span class="lbl">{quedan ? "Quedan" : "¡Listo! 45 minutos"}</span>
        <span class="timer-num">{mm(quedan)}</span>
        <span class="small">{materia(m).como}</span>
        <div class="timer-barra">
          <i style={{ width: `${Math.min(100, (pasado / total) * 100)}%` }} />
        </div>
      </div>
      <span class="small">Principio: ponte a prueba (ejercicios, preguntas) en vez de releer.</span>
      <input style={inp} placeholder="Tema (opcional): fracciones, listening…" value={tema} onInput={(e) => setTema((e.target as HTMLInputElement).value)} aria-label="Tema" />
      <div class="row">
        <button
          class="btn grande"
          style={{ flex: 1 }}
          onClick={() => {
            if (pausa != null) {
              setExtra(extra + Math.round((Date.now() - pausa) / 1000));
              setPausa(null);
            } else setPausa(Date.now());
          }}
        >
          {pausa != null ? "Seguir" : "Pausa"}
        </button>
        <button class="btn main grande" style={{ flex: 2 }} onClick={guardar}>
          Terminar y guardar
        </button>
      </div>
    </Sheet>
  );
}

// ---------- Cuaderno de errores (Matemática y Lenguaje) ----------
function Cuaderno({ m, motivos }: { m: MateriaBloque; motivos?: string[] }) {
  const { data } = useApp();
  const hoy = chileNow().date;
  const [txt, setTxt] = useState("");
  const [motivo, setMotivo] = useState(motivos?.[0] || "");
  const todos = data.errores.filter((e) => e.materia === m);
  const hoyE = tocanHoy(todos, hoy);
  const pend = todos.filter((e) => !e.resuelto).length;
  return (
    <section class="card">
      <div class="between">
        <span class="lbl">📝 Cuaderno de errores</span>
        <span class="small">
          {pend} pendientes · {todos.length - pend} resueltos
        </span>
      </div>
      <Progress value={pct(todos.length - pend, todos.length)} color="var(--green)" label={`Errores resueltos: ${todos.length - pend} de ${todos.length}`} />
      {hoyE.map((e) => (
        <div key={e.id} class="error-item">
          <span>{e.descripcion}</span>
          {e.motivo && <span class="small">{e.motivo}</span>}
          <span class="small">Rehazlo sin mirar:</span>
          <div class="row">
            <button class="btn sm" style={{ flex: 1 }} onClick={() => void store.put("errores", repasarError(e, false, hoy))}>
              Fallé
            </button>
            <button class="btn sm main" style={{ flex: 1 }} onClick={() => { const n = repasarError(e, true, hoy); void store.put("errores", n); toast(n.resuelto ? "¡Resuelto! Sale del cuaderno." : `Bien: vuelve en ${n.intervalo} días.`); }}>
              Lo hice bien
            </button>
          </div>
        </div>
      ))}
      {!hoyE.length && todos.length > 0 && <span class="small">Nada que repasar hoy. Te aviso cuando toque.</span>}
      <form
        class="stack"
        style={{ gap: "8px" }}
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (!txt.trim()) return;
          const e: ErrorCuaderno = { id: uid(), materia: m, descripcion: txt.trim(), ...(motivo ? { motivo } : {}), fechaCreado: hoy, proximaRevision: addDays(hoy, 2), intervalo: 2, resuelto: false };
          await store.put("errores", e);
          setTxt("");
          toast("Al cuaderno: te lo recuerdo en 2 días.");
        }}
      >
        <input style={inp} placeholder="El ejercicio o pregunta que te salió mal" value={txt} onInput={(e) => setTxt((e.target as HTMLInputElement).value)} aria-label="Error para el cuaderno" />
        {motivos && (
          <select style={inp} value={motivo} onChange={(e) => setMotivo((e.target as HTMLSelectElement).value)} aria-label="Motivo">
            {motivos.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        )}
        <button class="btn full">Agregar al cuaderno</button>
      </form>
    </section>
  );
}

// ---------- Matemática M1 ----------
function Mate() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const eje = ejeDeLaSemana(hoy);
  const [tema, setTema] = useState(eje.subtemas[0]);
  const [buenos, setBuenos] = useState("");
  const [malos, setMalos] = useState("");
  const [min, setMin] = useState("");
  const [ensayo, setEnsayo] = useState(false);
  const log = data.estudio.filter((x) => x.materia === "mate" && x.total);
  const todos = EJES_MATE.flatMap((x) => x.subtemas);
  const hechos = todos.filter((s) => prefs.estudioChecks[`mate:${s}`]).length;
  const porEje = EJES_MATE.map((e) => {
    const l = log.filter((x) => !x.ensayo && ejeDeTema(x.tema)?.id === e.id);
    return { etiqueta: e.nombre.split(" ")[0], valor: pct(l.reduce((t, x) => t + (x.aciertos || 0), 0), l.reduce((t, x) => t + (x.total || 0), 0)) };
  });
  const tiempo = [...log].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => ({ etiqueta: `${Number(x.fecha.slice(8))}/${Number(x.fecha.slice(5, 7))}`, valor: pct(x.aciertos, x.total) }));
  return (
    <>
      <section class="card">
        <span class="lbl">Eje de estas semanas</span>
        <strong style={{ fontSize: "20px" }}>
          {eje.nombre} <span class="small">(semanas {eje.semanas})</span>
        </strong>
        <Progress value={pct(hechos, todos.length)} color="#3a86c8" label={`Subtemas completados: ${hechos} de ${todos.length}`} />
        <span class="small">
          {hechos} de {todos.length} subtemas completados
        </span>
      </section>
      <section class="card">
        <span class="lbl">Registrar ejercicios</span>
        <select style={inp} value={tema} onChange={(e) => setTema((e.target as HTMLSelectElement).value)} aria-label="Tema">
          {EJES_MATE.map((e) => (
            <optgroup key={e.id} label={e.nombre}>
              {e.subtemas.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <div class="grid3">
          <input style={inp} inputMode="numeric" placeholder="Buenos" value={buenos} onInput={(e) => setBuenos((e.target as HTMLInputElement).value)} aria-label="Buenos" />
          <input style={inp} inputMode="numeric" placeholder="Malos" value={malos} onInput={(e) => setMalos((e.target as HTMLInputElement).value)} aria-label="Malos" />
          <input style={inp} inputMode="numeric" placeholder="Min" value={min} onInput={(e) => setMin((e.target as HTMLInputElement).value)} aria-label="Minutos" />
        </div>
        <label class="row small">
          <input type="checkbox" checked={ensayo} onChange={(e) => setEnsayo((e.target as HTMLInputElement).checked)} style={{ width: "22px", height: "22px" }} />
          Es un mini-ensayo
        </label>
        <button
          class="btn main full grande"
          onClick={async () => {
            const b = Number(buenos) || 0;
            const m = Number(malos) || 0;
            if (!b && !m) return toast("Anota cuántos buenos y malos.");
            const l: EstudioLog = { id: uid(), fecha: hoy, materia: "mate", minutos: Number(min) || 0, tema: ensayo ? "Mini-ensayo" : tema, aciertos: b, total: b + m, ...(ensayo ? { ensayo: true } : {}) };
            await store.put("estudio", l);
            setBuenos("");
            setMalos("");
            setMin("");
            toast(`Anotado: ${pct(b, b + m)}% de aciertos.${m ? " Agrega los malos al cuaderno de errores 👇" : ""}`, () => void store.remove("estudio", l.id));
          }}
        >
          Guardar
        </button>
      </section>
      <Cuaderno m="mate" />
      <section class="card">
        <span class="lbl">Temario</span>
        {EJES_MATE.map((e) => (
          <div key={e.id} class="stack" style={{ gap: "6px" }}>
            <strong style={{ fontSize: "14px" }}>
              {e.nombre} <span class="small">· semanas {e.semanas}</span>
            </strong>
            <div class="chips">
              {e.subtemas.map((s) => (
                <button key={s} class={prefs.estudioChecks[`mate:${s}`] ? "on" : ""} aria-pressed={!!prefs.estudioChecks[`mate:${s}`]} onClick={() => setPrefs({ estudioChecks: { ...prefs.estudioChecks, [`mate:${s}`]: !prefs.estudioChecks[`mate:${s}`] } })}>
                  {prefs.estudioChecks[`mate:${s}`] ? "✓ " : ""}
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section class="card">
        <span class="lbl">% de aciertos por eje</span>
        {porEje.some((x) => x.valor) ? <Bars data={porEje} label="Porcentaje de aciertos por eje" fmt={(x) => `${x}%`} color="#3a86c8" /> : <span class="small">Aparece cuando registres ejercicios.</span>}
      </section>
      <section class="card">
        <span class="lbl">% de aciertos en el tiempo</span>
        {tiempo.length >= 2 ? <Line data={tiempo} label="Porcentaje de aciertos por sesión" cero={false} fmt={(x) => `${x}%`} /> : <span class="small">Aparece con 2 registros.</span>}
      </section>
    </>
  );
}

// ---------- Inglés ----------
function Ingles() {
  const { data } = useApp();
  const hoy = chileNow().date;
  const cola = tocanHoy(data.tarjetas, hoy);
  const [ver, setVer] = useState(false);
  const [nueva, setNueva] = useState({ palabra: "", traduccion: "", ejemplo: "" });
  const t = cola[0];
  const rep = repasos();
  const ok = rep.filter((r) => r.ok).length;
  const log = todasLasSesiones(data.estudio, data.sesiones, data.materias).filter((x) => x.materia === "ingles");
  const lunes = lunesDe(hoy);
  const semanas = Array.from({ length: 6 }, (_, i) => addDays(lunes, -7 * (5 - i))).map((l) => ({ etiqueta: `${Number(l.slice(8))}/${Number(l.slice(5, 7))}`, valor: log.filter((x) => x.fecha >= l && x.fecha <= addDays(l, 6)).reduce((s, x) => s + x.minutos, 0) }));
  // Palabras aprendidas acumuladas (según los repasos).
  const acum: { etiqueta: string; valor: number }[] = [];
  let n = 0;
  for (const f of [...new Set(rep.map((r) => r.fecha))].sort()) {
    n += rep.filter((r) => r.fecha === f && r.aprendida).length;
    acum.push({ etiqueta: `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`, valor: n });
  }
  // Racha del inglés de la mañana.
  const { prefs } = useApp();
  let racha = 0;
  for (let f = hoy; ; f = addDays(f, -1)) {
    const hizo = ["escuchar", "palabras", "shadowing"].some((k) => prefs.estudioChecks[`ing:${f}:${k}`]);
    if (hizo) racha++;
    else if (f !== hoy) break;
    if (racha > 400 || f < INICIO_BLOQUE) break;
  }
  const responder = (bien: boolean) => {
    const nuevo = repasarTarjeta(t, bien, hoy);
    void store.put("tarjetas", nuevo);
    localKV.set("repasosIngles", [...rep, { fecha: hoy, ok: bien, ...(aprendida(nuevo) && !aprendida(t) ? { aprendida: true } : {}) }].slice(-3000));
    setVer(false);
  };
  return (
    <>
      <div class="kpis">
        <div class="kpi">
          <span class="lbl">Para hoy</span>
          <strong>{cola.length}</strong>
          <span class="small">tarjetas</span>
        </div>
        <div class="kpi">
          <span class="lbl">Aprendidas</span>
          <strong>{data.tarjetas.filter(aprendida).length}</strong>
          <span class="small">de {data.tarjetas.length}</span>
        </div>
        <div class="kpi">
          <span class="lbl">Aciertos</span>
          <strong>{pct(ok, rep.length)}%</strong>
          <span class="small">racha mañana: {racha}</span>
        </div>
      </div>
      <section class="card">
        <span class="lbl">Repasar</span>
        {!t ? (
          <Empty text="¡Al día! No te quedan tarjetas para hoy." />
        ) : (
          <>
            <button class="tarjeta" onClick={() => setVer(true)} aria-label={ver ? `${t.palabra}: ${t.traduccion}` : `${t.palabra}. Toca para ver la traducción`}>
              <strong>{t.palabra}</strong>
              {ver ? (
                <>
                  <span class="tarjeta-trad">{t.traduccion}</span>
                  {t.ejemplo && <span class="small">“{t.ejemplo}”</span>}
                </>
              ) : (
                <span class="small">Dila en voz alta y toca para ver</span>
              )}
            </button>
            {ver && (
              <div class="row">
                <button class="btn grande" style={{ flex: 1 }} onClick={() => responder(false)}>
                  No me la sabía
                </button>
                <button class="btn main grande" style={{ flex: 1 }} onClick={() => responder(true)}>
                  Me la sabía
                </button>
              </div>
            )}
            <span class="small">Quedan {cola.length}. Si aciertas, vuelve cada vez más tarde; si fallas, mañana.</span>
          </>
        )}
      </section>
      <InglesManana />
      <section class="card">
        <span class="lbl">Agregar palabra</span>
        <input style={inp} placeholder="Palabra o frase en inglés" value={nueva.palabra} onInput={(e) => setNueva({ ...nueva, palabra: (e.target as HTMLInputElement).value })} aria-label="Palabra" />
        <input style={inp} placeholder="Traducción" value={nueva.traduccion} onInput={(e) => setNueva({ ...nueva, traduccion: (e.target as HTMLInputElement).value })} aria-label="Traducción" />
        <input style={inp} placeholder="Ejemplo (opcional)" value={nueva.ejemplo} onInput={(e) => setNueva({ ...nueva, ejemplo: (e.target as HTMLInputElement).value })} aria-label="Ejemplo" />
        <button
          class="btn full"
          onClick={async () => {
            if (!nueva.palabra.trim() || !nueva.traduccion.trim()) return toast("Falta la palabra o la traducción.");
            await store.put("tarjetas", { id: uid(), palabra: nueva.palabra.trim(), traduccion: nueva.traduccion.trim(), ...(nueva.ejemplo.trim() ? { ejemplo: nueva.ejemplo.trim() } : {}), intervalo: 1, proximaRevision: hoy, aciertos: 0, fallos: 0 });
            setNueva({ palabra: "", traduccion: "", ejemplo: "" });
            toast("Tarjeta agregada.");
          }}
        >
          Agregar tarjeta
        </button>
      </section>
      <section class="card">
        <span class="lbl">Palabras aprendidas (acumulado)</span>
        {acum.length >= 2 ? <Line data={acum} label="Palabras aprendidas acumuladas" cero fmt={(x) => String(x)} /> : <span class="small">Aparece cuando repases varios días.</span>}
      </section>
      <section class="card">
        <span class="lbl">Minutos de inglés por semana</span>
        <Bars data={semanas} label="Minutos de inglés por semana" fmt={(x) => `${x}`} color="#1f9d55" />
      </section>
    </>
  );
}

// ---------- Lenguaje (Competencia Lectora) ----------
const HABS = [
  ["localizar", "Localizar", "encontrar información"],
  ["interpretar", "Interpretar", "lo que más pesa"],
  ["evaluar", "Evaluar", "propósito y argumentos"],
] as const;
function Lenguaje() {
  const { data } = useApp();
  const hoy = chileNow().date;
  const [tipo, setTipo] = useState<"literario" | "no literario">("literario");
  const [min, setMin] = useState("");
  const [v, setV] = useState<Record<string, { b: string; t: string }>>({});
  const [ensayo, setEnsayo] = useState(false);
  const log = data.estudio.filter((x) => x.materia === "lenguaje" && x.total);
  const porHab = HABS.map(([k, n]) => {
    const l = log.filter((x) => x.habilidad === k);
    return { etiqueta: n, valor: pct(l.reduce((t, x) => t + (x.aciertos || 0), 0), l.reduce((t, x) => t + (x.total || 0), 0)) };
  });
  const porTipo = (["literario", "no literario"] as const).map((k) => {
    const l = log.filter((x) => x.tipoTexto === k);
    return { nombre: k === "literario" ? "Literario" : "No literario", valor: pct(l.reduce((t, x) => t + (x.aciertos || 0), 0), l.reduce((t, x) => t + (x.total || 0), 0)), color: k === "literario" ? "#7b4fd0" : "#b79cf0" };
  });
  const textos = data.estudio.filter((x) => x.materia === "lenguaje" && x.minutos > 0 && x.tipoTexto).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => ({ etiqueta: `${Number(x.fecha.slice(8))}/${Number(x.fecha.slice(5, 7))}`, valor: x.minutos }));
  const evol = (k: string) => [...log].filter((x) => x.habilidad === k).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => ({ etiqueta: `${Number(x.fecha.slice(8))}/${Number(x.fecha.slice(5, 7))}`, valor: pct(x.aciertos, x.total) }));
  return (
    <>
      <section class="card">
        <span class="lbl">Registrar un texto (miércoles: 1 literario y 1 no literario)</span>
        <div class="seg">
          {(["literario", "no literario"] as const).map((k) => (
            <button key={k} class={tipo === k ? "on" : ""} onClick={() => setTipo(k)}>
              {k === "literario" ? "Literario" : "No literario"}
            </button>
          ))}
        </div>
        {HABS.map(([k, n, d]) => (
          <div key={k} class="hab-fila">
            <span>
              <strong>{n}</strong> <span class="small">· {d}</span>
            </span>
            <input inputMode="numeric" placeholder="buenas" aria-label={`${n}: buenas`} value={v[k]?.b || ""} onInput={(e) => setV({ ...v, [k]: { ...(v[k] || { t: "" }), b: (e.target as HTMLInputElement).value } })} />
            <span class="small">de</span>
            <input inputMode="numeric" placeholder="total" aria-label={`${n}: total`} value={v[k]?.t || ""} onInput={(e) => setV({ ...v, [k]: { ...(v[k] || { b: "" }), t: (e.target as HTMLInputElement).value } })} />
          </div>
        ))}
        <input style={inp} inputMode="numeric" placeholder="Minutos que te tomó" value={min} onInput={(e) => setMin((e.target as HTMLInputElement).value)} aria-label="Minutos" />
        <label class="row small">
          <input type="checkbox" checked={ensayo} onChange={(e) => setEnsayo((e.target as HTMLInputElement).checked)} style={{ width: "22px", height: "22px" }} />
          Es un mini-ensayo
        </label>
        <button
          class="btn main full grande"
          onClick={async () => {
            const filas = HABS.filter(([k]) => Number(v[k]?.t) > 0).map(([k], i): EstudioLog => ({ id: uid(), fecha: hoy, materia: "lenguaje", minutos: i === 0 ? Number(min) || 0 : 0, habilidad: k, tipoTexto: tipo, aciertos: Math.min(Number(v[k]?.b) || 0, Number(v[k]?.t)), total: Number(v[k]?.t), ...(ensayo ? { ensayo: true } : {}) }));
            if (!filas.length) return toast("Anota buenas y total de al menos una habilidad.");
            await store.put("estudio", ...filas);
            setV({});
            setMin("");
            toast("Texto registrado.");
          }}
        >
          Guardar texto
        </button>
      </section>
      <Cuaderno m="lenguaje" motivos={["No encontré el dato", "Interpreté mal", "No entendí el propósito"]} />
      <section class="card">
        <span class="lbl">% de aciertos por habilidad</span>
        {porHab.some((x) => x.valor) ? <Bars data={porHab} label="Porcentaje de aciertos por habilidad" fmt={(x) => `${x}%`} color="#7b4fd0" /> : <span class="small">Aparece cuando registres textos.</span>}
      </section>
      <section class="card">
        <span class="lbl">Evolución por habilidad</span>
        {HABS.map(([k, n]) => (evol(k).length >= 2 ? (
          <div key={k} class="stack" style={{ gap: "2px" }}>
            <strong style={{ fontSize: "14px" }}>{n}</strong>
            <Line data={evol(k)} label={`Evolución de ${n}`} cero={false} fmt={(x) => `${x}%`} />
          </div>
        ) : null))}
        {!HABS.some(([k]) => evol(k).length >= 2) && <span class="small">Aparece con 2 textos registrados.</span>}
      </section>
      <section class="card">
        <span class="lbl">Literario vs. no literario</span>
        <BarsH data={porTipo} total={100} label="Aciertos por tipo de texto" fmt={(x) => `${x}%`} />
      </section>
      <section class="card">
        <span class="lbl">Tiempo por texto (min)</span>
        {textos.length >= 2 ? <Line data={textos} label="Minutos por texto" cero={false} fmt={(x) => `${x} min`} /> : <span class="small">Aparece con 2 textos con tiempo.</span>}
      </section>
    </>
  );
}

// ---------- Ventas y Economía: temario, quiz ----------
function Temario({ m }: { m: "ventas" | "economia" }) {
  const { prefs } = useApp();
  const hoy = chileNow().date;
  const actual = temaDeLaSemana(hoy);
  const hechos = TEMAS[m].filter((_, i) => prefs.estudioChecks[`${m}:${i}`]).length;
  return (
    <section class="card">
      <div class="between">
        <span class="lbl">Temario de 8 semanas</span>
        <span class="small">
          {hechos}/8 completados
        </span>
      </div>
      <Progress value={pct(hechos, 8)} color={materia(m).color} label={`Temas completados: ${hechos} de 8`} />
      {TEMAS[m].map((t, i) => {
        const k = `${m}:${i}`;
        return (
          <button key={k} class={`tema ${i === actual ? "actual" : ""} ${prefs.estudioChecks[k] ? "ok" : ""}`} aria-pressed={!!prefs.estudioChecks[k]} onClick={() => setPrefs({ estudioChecks: { ...prefs.estudioChecks, [k]: !prefs.estudioChecks[k] } })}>
            <span class="tema-n">{prefs.estudioChecks[k] ? "✓" : i + 1}</span>
            <span>
              {t.titulo}
              {i === actual && <span class="small"> · esta semana</span>}
            </span>
          </button>
        );
      })}
    </section>
  );
}
function Quiz({ m }: { m: "ventas" | "economia" }) {
  const { prefs } = useApp();
  const hoy = chileNow().date;
  const i = Math.max(0, temaDeLaSemana(hoy) - 1);
  const key = `${m}:${i}`;
  const [resp, setResp] = useState<number[]>([]);
  const t = TEMAS[m][i];
  const hecho = prefs.quiz[key] != null;
  if (hecho)
    return (
      <section class="card">
        <span class="lbl">Mini-quiz: {t.titulo}</span>
        <strong>
          {prefs.quiz[key]}/3 correctas {prefs.quiz[key] === 3 ? "🎉" : ""}
        </strong>
        <button class="link" style={{ alignSelf: "flex-start" }} onClick={() => { const q = { ...prefs.quiz }; delete q[key]; setPrefs({ quiz: q }); setResp([]); }}>
          Repetir
        </button>
      </section>
    );
  return (
    <section class="card">
      <span class="lbl">{temaDeLaSemana(hoy) > 0 ? "Mini-quiz del tema anterior" : "Mini-quiz"}: {t.titulo}</span>
      {t.quiz.map((q, k) => (
        <div key={k} class="stack" style={{ gap: "6px" }}>
          <strong style={{ fontSize: "15px" }}>{q.p}</strong>
          {q.o.map((o, j) => (
            <button key={j} class={`quiz-op ${resp[k] === j ? (j === q.c ? "bien" : "mal") : resp[k] != null && j === q.c ? "bien" : ""}`} disabled={resp[k] != null} onClick={() => { const r = [...resp]; r[k] = j; setResp(r); if (r.filter((x) => x != null).length === 3) setPrefs({ quiz: { ...prefs.quiz, [key]: t.quiz.filter((qq, z) => r[z] === qq.c).length } }); }}>
              {o}
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}

function Ventas() {
  const { data } = useApp();
  const hoy = chileNow().date;
  const [f, setF] = useState({ cliente: "", oferta: "", resultado: "pendiente" as "si" | "no" | "pendiente", nota: "" });
  const pr = data.estudio.filter((x) => x.materia === "ventas" && x.cliente);
  const si = pr.filter((x) => x.resultado === "si").length;
  return (
    <>
      <Quiz m="ventas" />
      <Temario m="ventas" />
      <section class="card">
        <span class="lbl">Práctica real</span>
        <input style={inp} placeholder="¿A quién le ofreciste?" value={f.cliente} onInput={(e) => setF({ ...f, cliente: (e.target as HTMLInputElement).value })} aria-label="Cliente" />
        <input style={inp} placeholder="¿Qué ofreciste? (página web, reventa…)" value={f.oferta} onInput={(e) => setF({ ...f, oferta: (e.target as HTMLInputElement).value })} aria-label="Oferta" />
        <div class="seg">
          {(["si", "no", "pendiente"] as const).map((r) => (
            <button key={r} class={f.resultado === r ? "on" : ""} onClick={() => setF({ ...f, resultado: r })}>
              {r === "si" ? "Sí" : r === "no" ? "No" : "Pendiente"}
            </button>
          ))}
        </div>
        <input style={inp} placeholder="¿Qué aprendiste?" value={f.nota} onInput={(e) => setF({ ...f, nota: (e.target as HTMLInputElement).value })} aria-label="Aprendizaje" />
        <button
          class="btn main full grande"
          onClick={async () => {
            if (!f.cliente.trim()) return toast("¿A quién le ofreciste?");
            await store.put("estudio", { id: uid(), fecha: hoy, materia: "ventas", minutos: 0, cliente: f.cliente.trim(), oferta: f.oferta.trim(), resultado: f.resultado, ...(f.nota.trim() ? { nota: f.nota.trim() } : {}) });
            setF({ cliente: "", oferta: "", resultado: "pendiente", nota: "" });
            toast("Oferta registrada.");
          }}
        >
          Guardar
        </button>
      </section>
      <section class="card">
        <div class="between">
          <span class="lbl">Ofertas y cierres</span>
          <strong>{pct(si, pr.length)}% de cierre</strong>
        </div>
        <BarsH
          data={[
            { nombre: "Ofertas hechas", valor: pr.length, color: "#e8772e" },
            { nombre: "Cerradas (sí)", valor: si, color: "var(--green)" },
            { nombre: "Pendientes", valor: pr.filter((x) => x.resultado === "pendiente").length, color: "var(--amber)" },
          ]}
          total={Math.max(1, pr.length)}
          label="Embudo de ventas"
          fmt={(x) => String(x)}
        />
        {pr.slice(-5).reverse().map((x) => (
          <div key={x.id} class="between small">
            <span>
              {x.cliente} · {x.oferta}
            </span>
            <span>{x.resultado === "si" ? "✅" : x.resultado === "no" ? "❌" : "⏳"}</span>
          </div>
        ))}
      </section>
      <section class="card">
        <span class="lbl">Recursos</span>
        <a href="https://capacitacion.sercotec.cl" target="_blank" rel="noopener">Cursos gratis de Sercotec</a>
      </section>
    </>
  );
}

function Economia() {
  const { data, prefs } = useApp();
  const hoy = chileNow().date;
  const [mensual, setMensual] = useState("30000");
  const [tasa, setTasa] = useState("5");
  const [eq, setEq] = useState({ fijos: "50000", precio: "15000", variable: "6000" });
  const serie = interesCompuesto(Number(mensual) || 0, Number(tasa) || 0, 10);
  const ingreso = totalesMes(data.movimientos, hoy.slice(0, 7)).ingresos;
  const p = presupuesto503020(ingreso);
  const pe = puntoEquilibrio(Number(eq.fijos) || 0, Number(eq.precio) || 0, Number(eq.variable) || 0);
  const quiz = TEMAS.economia.map((_t, i) => ({ etiqueta: String(i + 1), valor: prefs.quiz[`economia:${i}`] ?? 0 })).filter((_, i) => prefs.quiz[`economia:${i}`] != null);
  return (
    <>
      <Quiz m="economia" />
      <Temario m="economia" />
      <section class="card">
        <span class="lbl">Interés compuesto: ahorro mensual en 10 años</span>
        <div class="grid2">
          <label class="test-in">
            <span class="small">Ahorro al mes ($)</span>
            <input inputMode="numeric" value={mensual} onInput={(e) => setMensual((e.target as HTMLInputElement).value.replace(/\D/g, ""))} />
          </label>
          <label class="test-in">
            <span class="small">Interés anual (%)</span>
            <input inputMode="decimal" value={tasa} onInput={(e) => setTasa((e.target as HTMLInputElement).value.replace(",", "."))} />
          </label>
        </div>
        <Line data={serie} label="Cómo crece el ahorro" fmt={clp} />
        <span class="small">
          En 10 años: {clp(serie[serie.length - 1]?.valor || 0)} (pusiste {clp(serie[serie.length - 1]?.aportado || 0)}; el resto es interés).
        </span>
      </section>
      <section class="card">
        <span class="lbl">Presupuesto 50/30/20 con tus ingresos de este mes</span>
        {ingreso ? (
          <BarsH
            data={[
              { nombre: "Necesidades (50%)", valor: p.necesidades, color: "var(--t1)" },
              { nombre: "Gustos (30%)", valor: p.gustos, color: "var(--t5)" },
              { nombre: "Ahorro (20%)", valor: p.ahorro, color: "var(--green)" },
            ]}
            total={ingreso}
            label="Presupuesto 50/30/20"
          />
        ) : (
          <span class="small">Anota tus ingresos en Dinero y aquí ves cómo repartirlos.</span>
        )}
      </section>
      <section class="card">
        <span class="lbl">Punto de equilibrio</span>
        <div class="grid3">
          <label class="test-in">
            <span class="small">Costos fijos</span>
            <input inputMode="numeric" value={eq.fijos} onInput={(e) => setEq({ ...eq, fijos: (e.target as HTMLInputElement).value.replace(/\D/g, "") })} />
          </label>
          <label class="test-in">
            <span class="small">Precio</span>
            <input inputMode="numeric" value={eq.precio} onInput={(e) => setEq({ ...eq, precio: (e.target as HTMLInputElement).value.replace(/\D/g, "") })} />
          </label>
          <label class="test-in">
            <span class="small">Costo x unidad</span>
            <input inputMode="numeric" value={eq.variable} onInput={(e) => setEq({ ...eq, variable: (e.target as HTMLInputElement).value.replace(/\D/g, "") })} />
          </label>
        </div>
        <strong>{pe != null ? `Necesitas vender ${pe} unidades al mes para no perder.` : "El precio tiene que ser mayor que el costo por unidad."}</strong>
      </section>
      {quiz.length > 0 && (
        <section class="card">
          <span class="lbl">Resultados de los quiz (de 3)</span>
          <Bars data={quiz} label="Resultados de los mini-quiz por tema" fmt={(x) => `${x}/3`} color="#d4a017" />
        </section>
      )}
      <section class="card">
        <span class="lbl">Recursos</span>
        <a href="https://www.cmfeduca.cl" target="_blank" rel="noopener">CMF Educa</a>
        <a href="https://es.khanacademy.org" target="_blank" rel="noopener">Khan Academy</a>
      </section>
    </>
  );
}


