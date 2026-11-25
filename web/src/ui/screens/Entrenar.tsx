// Fútbol › Físico › Hoy: la sesión de la mañana y de la tarde según el bloque, el modo entrenamiento
// (ejercicio por ejercicio, con ✓ por serie, kg y reps, y descanso automático) y los temporizadores.
import { useEffect, useRef, useState } from "preact/hooks";
import { localKV } from "../../core/storage";
import { chileNow } from "../../core/time";
import { store } from "../../data/store";
import { uid, type Entreno } from "../../data/types";
import { routine, speaker } from "../../jarvis/instance";
import { COLOR_SESION, faseDe, NOMBRE_SESION, planDelDia, type Bloque, type SesionId } from "../../plan/bloque";
import { dosis, EJ, SESIONES, TIMER_4X4, TIMER_BALL, TIMER_FIFA, type EjB, type FaseTimer } from "../../plan/sesiones";
import { norm } from "../../routine/routine";
import { ejercicio } from "../../training/ejercicios";
import { Sheet } from "../components";
import { Figura } from "../figura";
import { Icon } from "../icons";
import { setPrefs, toast, useApp } from "../state";

// ---------- Sonido y vibración ----------
let ctx: AudioContext | null = null;
export function pitido(veces = 1) {
  try {
    navigator.vibrate?.(veces > 1 ? [200, 100, 200, 100, 400] : 300);
    ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
    for (let i = 0; i < veces; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = i === veces - 1 ? 1180 : 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.23);
    }
  } catch {
    /* sin sonido */
  }
}
// Pantalla encendida mientras entrenas (si el iPhone lo permite).
function usePantallaEncendida() {
  useEffect(() => {
    let lock: any = null;
    (navigator as any).wakeLock?.request?.("screen").then((l: any) => (lock = l)).catch(() => {});
    return () => lock?.release?.();
  }, []);
}
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

// ---------- Hoy ----------
export function HoyFutbol() {
  const { prefs, data } = useApp();
  const hoy = chileNow().date;
  const plan = planDelDia(hoy, prefs.partidoPorSemana);
  const fase = faseDe(hoy, undefined, prefs.fechaPrueba || null);
  const [sesion, setSesion] = useState<{ id: SesionId; turno: "manana" | "tarde" } | null>(() => {
    const g = localKV.get<{ id: SesionId; turno: "manana" | "tarde" } | null>("entrenoEnCursoSesion", null);
    return g && localKV.get<any>("entrenoEnCurso", null)?.fecha === hoy ? g : null;
  });
  const [timer, setTimer] = useState<{ titulo: string; fases: FaseTimer[] } | null>(null);
  const hechas = data.entrenos.filter((e) => e.fecha === hoy).map((e) => e.sesion);
  const abrir = (id: SesionId, turno: "manana" | "tarde") => {
    localKV.set("entrenoEnCursoSesion", { id, turno });
    setSesion({ id, turno });
  };
  const Tarjeta = ({ b, turno }: { b: Bloque; turno: "manana" | "tarde" }) => {
    const s = b.sesion ? SESIONES[b.sesion] : null;
    const lista = hechas.includes(b.sesion);
    return (
      <div class="sesion-card" style={{ "--c": COLOR_SESION[b.tipo] } as any}>
        <div class="between">
          <span class="lbl">{turno === "manana" ? "Mañana" : "Tarde"}</span>
          <span class="tipo-chip">{NOMBRE_SESION[b.tipo]}</span>
        </div>
        <strong style={{ fontSize: "18px" }}>{b.titulo}</strong>
        {s && (
          <span class="small">
            ~{s.minutos} min · {s.ejercicios.map((x) => EJ[x].nombre).slice(0, 4).join(" · ")}
            {s.ejercicios.length > 4 ? "…" : ""}
          </span>
        )}
        {s?.regla && <span class="small" style={{ color: "var(--ink)" }}>{s.regla}</span>}
        {b.sesion &&
          (lista ? (
            <span class="small" style={{ color: "var(--green)", fontWeight: 700 }}>
              ✓ Hecha hoy
            </span>
          ) : (
            <button class="btn main full grande" onClick={() => abrir(b.sesion!, turno)}>
              Empezar
            </button>
          ))}
      </div>
    );
  };
  return (
    <>
      <div class="card hoy-futbol">
        <div class="between">
          <span class="lbl">Hoy</span>
          <span class="small">Semana {Math.max(0, fase.semana)} del bloque</span>
        </div>
        <div class="row" style={{ gap: "8px", flexWrap: "wrap" }}>
          <span class="pill">{plan.mdTxt}</span>
          <span class="pill">{fase.nombre}</span>
          {fase.diasPrueba != null && <span class="pill ahora">Prueba en {fase.diasPrueba} {fase.diasPrueba === 1 ? "día" : "días"}</span>}
        </div>
        <span class="small">{fase.ajuste}</span>
        <details>
          <summary class="small" style={{ cursor: "pointer", minHeight: "32px" }}>
            Mi prueba es el día…
          </summary>
          <div class="row">
            <input type="date" value={prefs.fechaPrueba} aria-label="Fecha de la prueba" onChange={(e) => setPrefs({ fechaPrueba: (e.target as HTMLInputElement).value })} style={{ flex: 1, minHeight: "44px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--card2)", color: "var(--ink)", padding: "0 10px" }} />
            {prefs.fechaPrueba && (
              <button class="btn sm" onClick={() => setPrefs({ fechaPrueba: "" })}>
                Quitar
              </button>
            )}
          </div>
          <span class="small">Los 7 días antes de la prueba pasan a fase Afinar, con cuenta regresiva.</span>
        </details>
      </div>
      <Tarjeta b={plan.manana} turno="manana" />
      <Tarjeta b={plan.tarde} turno="tarde" />
      <div class="card">
        <span class="lbl">Temporizadores</span>
        <div class="grid3">
          <button class="btn grande" onClick={() => setTimer({ titulo: "Calentamiento FIFA 11+", fases: TIMER_FIFA })}>
            FIFA 11+
          </button>
          <button class="btn grande" onClick={() => setTimer({ titulo: "4×4 con balón", fases: TIMER_4X4(fase.nombre === "Intensificación" ? 4 : /Descarga|Afinar/.test(fase.nombre) ? 2 : 3) })}>
            4×4
          </button>
          <button class="btn grande" onClick={() => setTimer({ titulo: "Ball mastery", fases: TIMER_BALL(4) })}>
            Ball mastery
          </button>
        </div>
        <span class="small">Perro hoy: {plan.perro}.</span>
      </div>
      {sesion && <ModoEntrenamiento id={sesion.id} turno={sesion.turno} fase={fase.nombre} onClose={() => { localKV.remove("entrenoEnCursoSesion"); setSesion(null); }} abrirTimer={(t, f) => setTimer({ titulo: t, fases: f })} />}
      {timer && <Temporizador titulo={timer.titulo} fases={timer.fases} onClose={() => setTimer(null)} />}
    </>
  );
}

// ---------- Modo entrenamiento ----------
interface Fila {
  hecho: boolean;
  kg: string;
  reps: string;
}
interface EnCurso {
  fecha: string;
  sesion: SesionId;
  inicio: number;
  calentamiento: boolean;
  filas: Record<string, Fila[]>;
}

function ModoEntrenamiento({ id, turno, fase, onClose, abrirTimer }: { id: SesionId; turno: "manana" | "tarde"; fase: string; onClose: () => void; abrirTimer: (t: string, f: FaseTimer[]) => void }) {
  usePantallaEncendida();
  const s = SESIONES[id];
  const hoy = chileNow().date;
  const ejs: EjB[] = s.ejercicios.map((x) => EJ[x]);
  const [st, setSt] = useState<EnCurso>(() => {
    const g = localKV.get<EnCurso | null>("entrenoEnCurso", null);
    if (g && g.fecha === hoy && g.sesion === id) return g;
    // Precarga con lo que hiciste la última vez (kg y reps).
    const filas: Record<string, Fila[]> = {};
    for (const e of ejs) {
      const prev = [...store.data.entrenos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((en) => en.items.find((i) => i.ejId === ejId(e))).find(Boolean);
      filas[e.id] = Array.from({ length: dosis(e, fase).series }, (_, k) => ({ hecho: false, kg: prev?.series[k]?.kg ? String(prev.series[k].kg) : "", reps: String(prev?.series[k]?.reps || e.repsNum || "") }));
    }
    return { fecha: hoy, sesion: id, inicio: Date.now(), calentamiento: false, filas };
  });
  const [i, setI] = useState(0);
  const [descanso, setDescanso] = useState<{ hasta: number; total: number } | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [fin, setFin] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => localKV.set("entrenoEnCurso", st), [st]);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // Fin del descanso: pitido y vibración.
  useEffect(() => {
    if (!descanso) return;
    const ms = descanso.hasta - Date.now();
    const t = setTimeout(() => {
      pitido(3);
      setDescanso(null);
    }, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [descanso]);

  const e = ejs[i];
  const d = dosis(e, fase);
  const filas = st.filas[e.id] || [];
  const setFila = (k: number, patch: Partial<Fila>) => setSt({ ...st, filas: { ...st.filas, [e.id]: filas.map((f, j) => (j === k ? { ...f, ...patch } : f)) } });
  const marcar = (k: number) => {
    const ya = filas[k].hecho;
    setFila(k, { hecho: !ya });
    if (!ya && e.descanso && k < filas.length - 1) setDescanso({ hasta: Date.now() + e.descanso * 1000, total: e.descanso });
    if (!ya && k === filas.length - 1 && i < ejs.length - 1) setTimeout(() => setI(i + 1), 400);
  };
  const series = Object.values(st.filas).flat().filter((f) => f.hecho).length;
  const transcurrido = Math.round((Date.now() - st.inicio) / 1000);
  const restante = descanso ? Math.round((descanso.hasta - Date.now()) / 1000) : 0;

  async function guardar() {
    const items = ejs
      .map((x) => ({ ejId: ejId(x), series: (st.filas[x.id] || []).filter((f) => f.hecho).map((f) => ({ reps: Number(f.reps) || 0, ...(Number(f.kg) > 0 ? { kg: Number(f.kg) } : {}) })) }))
      .filter((x) => x.series.length);
    const en: Entreno = { id: uid(), fecha: hoy, nombre: s.nombre, items, sesion: id, tipoSesion: s.tipo, seg: transcurrido, ...(rpe ? { rpe } : {}), nota: `${fase}${st.calentamiento ? " · con FIFA 11+" : ""}` };
    await store.put("entrenos", en);
    // Tacha el bloque de Mi Día que corresponde.
    const t = routine.tasks.find((x) => norm(x.title) === norm(turno === "manana" ? "Sesión 1 (física)" : "Sesión 2 (técnica)"));
    if (t) routine.check(t, hoy);
    if (st.calentamiento) {
      const c = routine.tasks.find((x) => norm(x.title) === norm("Calentamiento FIFA 11+"));
      if (c) routine.check(c, hoy);
    }
    localKV.remove("entrenoEnCurso");
    toast(`Guardado: ${s.nombre.toLowerCase()}, ${series} series en ${Math.round(transcurrido / 60)} min.`, () => void store.remove("entrenos", en.id));
    onClose();
  }

  if (fin)
    return (
      <Sheet title="¿Cómo te sentiste?" onClose={() => setFin(false)}>
        <span class="small">
          {series} series · {mmss(transcurrido)} · ¿Qué tan duro fue? (1 = muy suave, 10 = máximo)
        </span>
        <div class="rpe-grid">
          {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
            <button key={n} class={rpe === n ? "on" : ""} onClick={() => setRpe(n)} aria-pressed={rpe === n}>
              {n}
            </button>
          ))}
        </div>
        <button class="btn main full grande" onClick={guardar}>
          Guardar entreno
        </button>
      </Sheet>
    );

  return (
    <Sheet title={s.nombre} onClose={onClose} full>
      <div class="between">
        <span class="small">
          Ejercicio {i + 1} de {ejs.length} · {mmss(transcurrido)}
        </span>
        <span class="small">{series} series</span>
      </div>
      <div class="ent-scroll">
        {!st.calentamiento && i === 0 && (
          <button class="btn full" onClick={() => { setSt({ ...st, calentamiento: true }); abrirTimer("Calentamiento FIFA 11+", TIMER_FIFA); }}>
            Antes: calentamiento FIFA 11+ (15 min)
          </button>
        )}
        <div class="ent-ej">
          <Figura pose={e.pose} size={132} label={`Cómo se hace: ${e.nombre}`} />
          <div class="stack" style={{ gap: "4px", minWidth: 0 }}>
            <strong style={{ fontSize: "19px" }}>{e.nombre}</strong>
            <span class="pill" style={{ alignSelf: "flex-start" }}>
              {d.series} × {e.reps}
              {e.porLado ? " por lado" : ""}
            </span>
            {d.nota && <span class="small" style={{ color: "var(--amber)" }}>{d.nota}</span>}
            {e.descanso > 0 && <span class="small">Descanso {e.descanso >= 120 ? `${Math.round(e.descanso / 60)} min` : `${e.descanso} s`}</span>}
          </div>
        </div>
        <ul class="consejos">
          {e.consejos.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {e.id === "4x4" && (
          <button class="btn full grande" onClick={() => abrirTimer("4×4 con balón", TIMER_4X4(d.series))}>
            Abrir temporizador 4×4
          </button>
        )}
        {e.id === "ball-mastery" && (
          <button class="btn full grande" onClick={() => abrirTimer("Ball mastery", TIMER_BALL(4))}>
            Abrir temporizador ball mastery
          </button>
        )}
        <div class="series">
          {filas.map((f, k) => (
            <div key={k} class={`serie ${f.hecho ? "ok" : ""}`}>
              <span class="serie-n">{k + 1}</span>
              {e.kg && (
                <label class="serie-in">
                  <input inputMode="decimal" value={f.kg} placeholder="kg" aria-label={`Kilos serie ${k + 1}`} onInput={(ev) => setFila(k, { kg: (ev.target as HTMLInputElement).value })} />
                  <span>kg</span>
                </label>
              )}
              <label class="serie-in">
                <input inputMode="numeric" value={f.reps} placeholder={e.porTiempo ? "s" : "reps"} aria-label={`${e.porTiempo ? "Segundos" : "Repeticiones"} serie ${k + 1}`} onInput={(ev) => setFila(k, { reps: (ev.target as HTMLInputElement).value })} />
                <span>{e.porTiempo ? "s" : / m$/.test(e.reps) ? "m" : "reps"}</span>
              </label>
              <button class="serie-ok" aria-pressed={f.hecho} aria-label={`Serie ${k + 1} ${f.hecho ? "hecha" : "marcar como hecha"}`} onClick={() => marcar(k)}>
                <Icon name="check" size={22} />
              </button>
            </div>
          ))}
        </div>
      </div>
      {descanso && restante > 0 && (
        <div class="descanso" role="timer" aria-live="polite">
          <span class="lbl">Descanso</span>
          <strong>{mmss(restante)}</strong>
          <div class="row">
            <button class="btn sm" onClick={() => setDescanso({ ...descanso, hasta: descanso.hasta + 15000 })}>
              +15 s
            </button>
            <button class="btn sm" onClick={() => setDescanso(null)}>
              Saltar
            </button>
          </div>
        </div>
      )}
      <div class="ent-nav">
        <button class="btn grande" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Ejercicio anterior">
          <Icon name="izq" />
        </button>
        {i < ejs.length - 1 ? (
          <button class="btn main grande" style={{ flex: 1 }} onClick={() => setI(i + 1)}>
            Siguiente: {ejs[i + 1].nombre}
          </button>
        ) : (
          <button class="btn main grande" style={{ flex: 1 }} onClick={() => setFin(true)}>
            Terminar
          </button>
        )}
      </div>
      {s.tipo === "velocidad" && (
        <button class="btn full stop" onClick={() => setFin(true)}>
          STOP · Me siento lento, termino
        </button>
      )}
    </Sheet>
  );
}
// Mismo id que la biblioteca si existe (así se juntan los récords); si no, por nombre.
const ejId = (e: EjB) => (ejercicio(e.id) ? e.id : `libre:${e.nombre}`);

// ---------- Temporizador por fases (4×4, ball mastery, FIFA 11+) ----------
export function Temporizador({ titulo, fases, onClose }: { titulo: string; fases: FaseTimer[]; onClose: () => void }) {
  usePantallaEncendida();
  const [k, setK] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const [quedan, setQuedan] = useState(fases[0].seg);
  const ultimo = useRef(Date.now());
  useEffect(() => {
    if (!corriendo) return;
    ultimo.current = Date.now();
    const t = setInterval(() => {
      const ahora = Date.now();
      const paso = Math.round((ahora - ultimo.current) / 1000);
      if (paso < 1) return;
      ultimo.current = ahora;
      setQuedan((q) => q - paso);
    }, 250);
    return () => clearInterval(t);
  }, [corriendo, k]);
  useEffect(() => {
    if (quedan > 0) {
      if (corriendo && quedan <= 3) pitido(1);
      return;
    }
    if (k >= fases.length - 1) {
      pitido(3);
      setCorriendo(false);
      speaker.feed("Terminaste. Bien ahí. ");
      speaker.flush();
      return;
    }
    pitido(2);
    const sig = k + 1;
    setK(sig);
    setQuedan(fases[sig].seg);
    speaker.feed(`${fases[sig].nombre}. `);
    speaker.flush();
  }, [quedan]);
  const f = fases[k];
  const total = fases.reduce((t, x) => t + x.seg, 0);
  const hecho = fases.slice(0, k).reduce((t, x) => t + x.seg, 0) + (f.seg - Math.max(0, quedan));
  return (
    <Sheet title={titulo} onClose={onClose}>
      <div class={`timer ${f.trabajo ? "trabajo" : "pausa"}`} role="timer" aria-live="polite">
        <span class="lbl">
          {k + 1} de {fases.length}
        </span>
        <strong class="timer-nombre">{f.nombre}</strong>
        <span class="timer-num">{mmss(Math.max(0, quedan))}</span>
        {fases[k + 1] && <span class="small">Después: {fases[k + 1].nombre}</span>}
        <div class="timer-barra">
          <i style={{ width: `${Math.min(100, (hecho / total) * 100)}%` }} />
        </div>
      </div>
      <div class="row">
        <button class="btn grande" onClick={() => { setK(0); setQuedan(fases[0].seg); setCorriendo(false); }}>
          Reiniciar
        </button>
        <button class="btn main grande" style={{ flex: 1 }} onClick={() => { speaker.unlock(); setCorriendo(!corriendo); }}>
          {corriendo ? "Pausa" : quedan === fases[0].seg && k === 0 ? "Empezar" : "Seguir"}
        </button>
        <button class="btn grande" onClick={() => setQuedan(0)} aria-label="Saltar a la siguiente">
          <Icon name="der" />
        </button>
      </div>
    </Sheet>
  );
}

