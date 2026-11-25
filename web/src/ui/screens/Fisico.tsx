// Preparación física: cómo me siento, rutina generada, sesión guiada, biblioteca y récords.
import { HoyFutbol } from "./Entrenar";
import { EjerciciosBloque, GraficosFutbol, SemanaBloque, TestsBloque } from "./FutbolBloque";
import { enDificil } from "../../extras/calc";
import { useEffect, useRef, useState } from "preact/hooks";
import { fechaCorta, lunesDe } from "../../core/dates";
import { chileNow, DAY_NAMES } from "../../core/time";
import { store } from "../../data/store";
import { uid, type Chequeo, type Entreno, type ItemPlan, type Objetivo, type Plan, type SesionPlan } from "../../data/types";
import { CALENTAMIENTO, EJERCICIOS, EQUIPOS, ejercicio, MUSCULOS, NOTA_EMG, VUELTA_CALMA, type Ejercicio, type Equipo, type Musculo } from "../../training/ejercicios";
import { chequeoDeHoy, cargaDelDia, generarRutina, records, recordsNuevos, seriesAjustadas, sugerencia, volumenPorMusculo } from "../../training/calc";
import { Progress } from "../charts";
import { Sheet } from "../components";

import { Icon } from "../icons";
import { toast, useApp, getPrefs } from "../state";
import { speaker } from "../../jarvis/instance";
import { canListen, listenOnce } from "../../voice/speech";
import { comandoEntreno, type ComandoEntreno } from "../../training/voz";

// Dice algo y espera a que termine (si la voz está apagada, sigue al tiro).
function hablar(t: string): Promise<void> {
  return new Promise((res) => {
    if (!speaker.enabled || !speaker.supported) return res();
    const prev = speaker.onEnd;
    speaker.onEnd = () => {
      speaker.onEnd = prev;
      res();
    };
    speaker.feed(t + " ");
    speaker.flush();
  });
}

const inp = { minHeight: "44px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 10px", width: "100%" };

export type SubFisico = "hoy" | "semana" | "ejercicios" | "tests" | "graficos";
export function Fisico({ sub: subExt }: { sub?: SubFisico } = {}) {
  const { data } = useApp();
  const plan = data.planes.find((p) => p.id === "activo");
  const [gen, setGen] = useState(false);
  const [sesion, setSesion] = useState<SesionPlan | null>(null);
  const [ej, setEj] = useState<string | null>(null);
  const [subInt, setSub] = useState<SubFisico>("hoy");
  const sub = subExt || subInt;

  return (
    <>
      {/* El plan del físico es el bloque de 8 semanas (según el día del partido). */}
      {!subExt && (
        <div class="seg sub">
          {(["hoy", "semana", "ejercicios", "tests", "graficos"] as const).map((k) => (
            <button key={k} class={sub === k ? "on" : ""} onClick={() => setSub(k)}>
              {{ hoy: "Hoy", semana: "Semana", ejercicios: "Ejercicios", tests: "Tests", graficos: "Gráficos" }[k]}
            </button>
          ))}
        </div>
      )}
      {sub === "semana" && <SemanaBloque />}
      {sub === "ejercicios" && <EjerciciosBloque />}
      {sub === "tests" && <TestsBloque />}
      {sub === "graficos" && <GraficosFutbol />}
      {sub === "hoy" && <HoyFutbol />}
      {sub === "hoy" && <ChequeoCard />}
      {sub === "hoy" && <Volumen />}
      {sub === "hoy" && <Historial />}
      {sub === "ejercicios" && <Biblioteca onOpen={setEj} />}
      {gen && (
        <Sheet title="Armar mi rutina" onClose={() => setGen(false)}>
          <Generador plan={plan} onDone={() => setGen(false)} />
        </Sheet>
      )}
      {sesion && <SesionGuiada s={sesion} onClose={() => setSesion(null)} onEj={setEj} />}
      {ej && <EjercicioSheet id={ej} onClose={() => setEj(null)} onOther={setEj} />}
    </>
  );
}

function ChequeoCard() {
  const { data } = useApp();
  const hoy = chileNow().date;
  const ch: Chequeo = data.chequeos.find((c) => c.id === hoy) || { id: hoy, cansancio: 0, dolor: 0 };
  const listo = data.chequeos.some((c) => c.id === hoy);
  const carga = cargaDelDia(listo ? ch : undefined, data.partidos, hoy, data.chequeos);
  const set = (o: Partial<Chequeo>) => store.put("chequeos", { ...ch, cansancio: ch.cansancio || 2, ...o });
  const color = { normal: "var(--green)", suave: "var(--amber)", "muy-suave": "var(--amber)", activacion: "var(--blue)", parar: "var(--red)" }[carga.nivel];
  return (
    <div class="card">
      <h2>¿Cómo estás hoy?</h2>
      <div class="field">
        <span class="lbl">Cansancio</span>
        <div class="chips">
          {[
            [1, "Fresco"],
            [2, "Bien"],
            [3, "Normal"],
            [4, "Cansado"],
            [5, "Reventado"],
          ].map(([v, l]) => (
            <button key={v} class={ch.cansancio === v ? "on" : ""} aria-pressed={ch.cansancio === v} onClick={() => set({ cansancio: v as number })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label class="lbl" for="ch-d">
            Dolor (0 a 10)
          </label>
          <select id="ch-d" style={inp} value={String(ch.dolor)} onChange={(e) => set({ dolor: Number((e.target as HTMLSelectElement).value) })}>
            {Array.from({ length: 11 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? "0 · nada" : i >= 7 ? `${i} · fuerte` : i}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label class="lbl" for="ch-s">
            Horas de sueño
          </label>
          <input id="ch-s" style={inp} inputMode="decimal" value={ch.sueno != null ? String(ch.sueno).replace(".", ",") : ""} placeholder="8" onChange={(e) => {
            const v = parseFloat((e.target as HTMLInputElement).value.replace(",", "."));
            set({ sueno: v >= 0 && v <= 16 ? v : undefined });
          }} />
        </div>
      </div>
      {ch.dolor > 0 && (
        <>
          <div class="field">
            <label class="lbl" for="ch-z">
              ¿Dónde?
            </label>
            <input id="ch-z" style={inp} maxLength={40} value={ch.zona || ""} onChange={(e) => set({ zona: (e.target as HTMLInputElement).value })} placeholder="Rodilla derecha" />
          </div>
          <label class="row" style={{ minHeight: "44px" }}>
            <input type="checkbox" checked={!!ch.agudo} onChange={(e) => set({ agudo: (e.target as HTMLInputElement).checked || undefined })} style={{ width: "22px", height: "22px" }} />
            Es un dolor punzante o que no se me pasa
          </label>
        </>
      )}
      <p style={{ margin: 0, fontSize: "14px", borderLeft: `3px solid ${color}`, paddingLeft: "10px" }}>
        {listo ? carga.motivo : "Cuéntame cómo amaneciste y te ajusto la carga de hoy."}
      </p>
    </div>
  );
}

function Generador({ plan, onDone }: { plan?: Plan; onDone: () => void }) {
  const { prefs } = useApp();
  const [obj, setObj] = useState<Objetivo>(plan?.objetivo || "futbol");
  const [dias, setDias] = useState<number[]>(plan?.dias || [0, 2, 4]);
  const [min, setMin] = useState(plan?.minutos || 60);
  const [eq, setEq] = useState<Equipo[]>((plan?.equipo as Equipo[]) || ["mancuernas", "banda", "barra-dominadas", "mochila"]);
  const [nivel, setNivel] = useState<1 | 2 | 3>(plan?.nivel || 2);
  const partido = prefs.futbol.diasPartido;
  const preview = generarRutina({ objetivo: obj, dias, minutos: min, equipo: eq, nivel, diasPartido: partido });
  return (
    <div class="stack" style={{ gap: "16px" }}>
      <div class="field">
        <span class="lbl">Objetivo</span>
        <div class="seg">
          {(
            [
              ["futbol", "Rendimiento en fútbol"],
              ["fuerza", "Fuerza"],
              ["masa", "Masa muscular"],
            ] as [Objetivo, string][]
          ).map(([k, l]) => (
            <button key={k} class={obj === k ? "on" : ""} onClick={() => setObj(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        <span class="lbl">Días que puedo entrenar</span>
        <div class="chips">
          {DAY_NAMES.map((d, i) => {
            const on = dias.includes(i);
            return (
              <button key={d} class={on ? "on" : ""} aria-pressed={on} onClick={() => (on ? setDias(dias.filter((x) => x !== i)) : dias.length >= 6 ? toast("Máximo 6 días: deja al menos uno de descanso.") : setDias([...dias, i].sort()))}>
                {d.slice(0, 3)}
                {partido.includes(i) ? " ⚽" : ""}
              </button>
            );
          })}
        </div>
        {dias.length > 5 && <span class="small" style={{ color: "var(--amber)" }}>Con más de 5 días casi no queda descanso: el músculo crece cuando descansas.</span>}
      </div>
      <div class="field">
        <span class="lbl">Tiempo por sesión</span>
        <div class="chips">
          {[30, 45, 60, 75, 90].map((m) => (
            <button key={m} class={min === m ? "on" : ""} onClick={() => setMin(m)}>
              {m} min
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        <span class="lbl">Equipo que tengo</span>
        <div class="chips">
          {(Object.keys(EQUIPOS) as Equipo[])
            .filter((k) => k !== "cuerpo")
            .map((k) => {
              const on = eq.includes(k);
              return (
                <button key={k} class={on ? "on" : ""} aria-pressed={on} onClick={() => setEq(on ? eq.filter((x) => x !== k) : [...eq, k])}>
                  {EQUIPOS[k]}
                </button>
              );
            })}
        </div>
      </div>
      <div class="field">
        <span class="lbl">Nivel</span>
        <div class="seg">
          {(
            [
              [1, "Principiante"],
              [2, "Intermedio"],
              [3, "Avanzado"],
            ] as [1 | 2 | 3, string][]
          ).map(([k, l]) => (
            <button key={k} class={nivel === k ? "on" : ""} onClick={() => setNivel(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div class="card">
        <span class="lbl">Así queda</span>
        {preview.length ? (
          preview.map((s) => (
            <div key={s.id} class="stack" style={{ gap: "2px" }}>
              <strong style={{ fontSize: "14px" }}>
                {s.nombre} · {s.minutos} min
              </strong>
              <span class="small">{s.items.map((i) => ejercicio(i.ejId)?.nombre).join(" · ")}</span>
            </div>
          ))
        ) : (
          <span class="small">Elige al menos un día.</span>
        )}
      </div>
      <button
        class="btn main full"
        disabled={!preview.length}
        onClick={async () => {
          await store.put("planes", { id: "activo", objetivo: obj, dias, minutos: min, equipo: eq, nivel, sesiones: preview, creado: chileNow().date });
          onDone();
          toast("Rutina lista. Los días sin sesión son de descanso.");
        }}
      >
        Usar esta rutina
      </button>
    </div>
  );
}

// Sesión paso a paso: calentamiento, ejercicios con su meta, descanso con temporizador y vuelta a la calma.
function SesionGuiada({ s, onClose, onEj }: { s: SesionPlan; onClose: () => void; onEj: (id: string) => void }) {
  const { data } = useApp();
  const hoy = chileNow().date;
  const carga = cargaDelDia(chequeoDeHoy(data, hoy), data.partidos, hoy, data.chequeos, enDificil(getPrefs().dificil, hoy));
  const plan = data.planes.find((p) => p.id === "activo");
  const gimnasio = !!plan?.equipo.includes("gimnasio");
  const items = s.items.filter((it) => !(carga.sinPierna && ejercicio(it.ejId)?.pesado));
  const [reg, setReg] = useState<Record<string, { reps: string; kg: string }[]>>(() =>
    Object.fromEntries(
      items.map((it) => {
        const sug = sugerencia(data.entrenos, it, gimnasio);
        const n = seriesAjustadas(it.series, carga);
        return [it.ejId, Array.from({ length: n }, () => ({ reps: "", kg: sug.kg ? String(sug.kg).replace(".", ",") : "" }))];
      }),
    ),
  );
  const [rpe, setRpe] = useState<number | null>(null);
  const [timer, setTimer] = useState<{ fin: number; total: number } | null>(null);
  const [, tick] = useState(0);
  const iv = useRef<number>();
  useEffect(() => {
    iv.current = window.setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(iv.current);
  }, []);
  const quedan = timer ? Math.max(0, Math.ceil((timer.fin - Date.now()) / 1000)) : 0;
  useEffect(() => {
    if (timer && quedan === 0) {
      try {
        navigator.vibrate?.(300);
      } catch {}
      setTimer(null);
      if (manosRef.current) void decir(manosRef.current);
    }
    if (timer && quedan === 10 && manosRef.current) void hablar("10 segundos.");
  }, [quedan]);

  // ---------- Manos libres: JARVIS dice el ejercicio y la serie; Diego responde hablando ----------
  const [manos, setManos] = useState<{ i: number; j: number } | null>(null);
  const [oido, setOido] = useState("");
  const manosRef = useRef(manos);
  manosRef.current = manos;
  const regRef = useRef(reg);
  regRef.current = reg;
  const stopEsc = useRef<null | (() => void)>(null);
  useEffect(() => () => {
    manosRef.current = null;
    stopEsc.current?.();
    speaker.stop();
  }, []);

  const metaTxt = (it: ItemPlan) => `${it.repsMin === it.repsMax ? it.repsMax : `${it.repsMin} a ${it.repsMax}`} ${ejercicio(it.ejId)?.porTiempo ? "segundos" : "repeticiones"}`;
  async function decir(c: { i: number; j: number }) {
    const it = items[c.i];
    if (!it) return;
    const e = ejercicio(it.ejId)!;
    const total = (regRef.current[it.ejId] || []).length;
    const sug = sugerencia(data.entrenos, it, gimnasio);
    const t = `${c.j === 0 ? `${e.nombre.split(" (")[0]}. ` : ""}Serie ${c.j + 1} de ${total}: ${metaTxt(it)}${sug.kg ? ` con ${String(sug.kg).replace(".", ",")} kilos` : ""}. Cuando termines, dime listo o cuántas hiciste.`;
    setOido(t);
    await hablar(t);
    escuchar();
  }
  function escuchar() {
    if (!manosRef.current) return;
    if (!canListen()) return setOido((o) => `${o} (Aquí no puedo escucharte: usa los botones.)`);
    stopEsc.current?.();
    const l = listenOnce((p) => setOido(`Escuché: ${p}`), { silencio: 1500 });
    stopEsc.current = l.stop;
    l.promise
      .then((txt) => {
        const cmd = comandoEntreno(txt);
        if (cmd) return manejar(cmd);
        setOido(`No te entendí ("${txt}"). Di listo, siguiente o terminar.`);
        return hablar("No te entendí. Di listo, siguiente, o terminar.").then(escuchar);
      })
      .catch(() => setOido("No te escuché. Toca el micrófono o usa los botones."));
  }
  async function manejar(cmd: ComandoEntreno) {
    const c = manosRef.current;
    if (!c) return;
    if (cmd.tipo === "salir") {
      setManos(null);
      speaker.stop();
      return;
    }
    if (cmd.tipo === "terminar") {
      setManos(null);
      return guardar();
    }
    if (cmd.tipo === "repite") return decir(c);
    if (cmd.tipo === "saltar") {
      setTimer(null);
      return decir(c);
    }
    if (cmd.tipo === "siguiente") {
      setTimer(null);
      const n = { i: c.i + 1, j: 0 };
      if (n.i >= items.length) return fin();
      setManos(n);
      return decir(n);
    }
    // Serie hecha: se anota lo que dijo (o la meta sugerida) y empieza el descanso.
    const it = items[c.i];
    const sug = sugerencia(data.entrenos, it, gimnasio);
    const filas = regRef.current[it.ejId] || [];
    const reps = String(cmd.reps ?? sug.reps);
    const nuevas = filas.map((x, k) => (k === c.j ? { reps, kg: cmd.kg != null ? String(cmd.kg).replace(".", ",") : x.kg } : x));
    setReg((r) => ({ ...r, [it.ejId]: nuevas }));
    regRef.current = { ...regRef.current, [it.ejId]: nuevas };
    const n = c.j + 1 < filas.length ? { i: c.i, j: c.j + 1 } : { i: c.i + 1, j: 0 };
    if (n.i >= items.length) return fin();
    setManos(n);
    manosRef.current = n;
    setTimer({ fin: Date.now() + it.descanso * 1000, total: it.descanso });
    const t = `Anotada: ${reps} ${ejercicio(it.ejId)?.porTiempo ? "segundos" : "repeticiones"}${cmd.kg ? ` con ${String(cmd.kg).replace(".", ",")} kilos` : ""}. Descansa ${it.descanso >= 60 && it.descanso % 60 === 0 ? `${it.descanso / 60} ${it.descanso === 60 ? "minuto" : "minutos"}` : `${it.descanso} segundos`}.`;
    setOido(t);
    await hablar(t);
  }
  async function fin() {
    setManos(null);
    manosRef.current = null;
    setTimer(null);
    const t = "Listo, terminaste todo. Haz la vuelta a la calma, marca qué tan duro fue y toca Terminar y guardar.";
    setOido(t);
    await hablar(t);
  }

  async function guardar() {
    const en: Entreno = {
      id: uid(),
      fecha: hoy,
      nombre: s.nombre.replace(/^[^:]+: /, ""),
      sesionId: s.id,
      items: items
        .map((it) => ({ ejId: it.ejId, series: (reg[it.ejId] || []).filter((x) => x.reps.trim()).map((x) => ({ reps: Math.round(Number(x.reps)), ...(x.kg.trim() ? { kg: parseFloat(x.kg.replace(",", ".")) } : {}) })).filter((x) => x.reps > 0) }))
        .filter((it) => it.series.length),
      rpe: rpe || undefined,
    };
    if (!en.items.length) return toast("Anota al menos una serie (las repeticiones que hiciste).");
    const nuevos = recordsNuevos(data.entrenos, en);
    await store.put("entrenos", en);
    onClose();
    toast(nuevos.length ? `Entreno guardado. Récord: ${nuevos[0]}.` : "Entreno guardado. Bien ahí.", async () => void (await store.remove("entrenos", en.id)));
  }

  return (
    <Sheet title={s.nombre.replace(/^[^:]+: /, "")} onClose={onClose}>
      {carga.nivel !== "normal" && <p style={{ margin: 0, fontSize: "14px", borderLeft: "3px solid var(--amber)", paddingLeft: "10px" }}>{carga.motivo}</p>}
      {manos ? (
        <div class="card" style={{ gap: "10px", borderColor: "var(--green)" }} aria-live="polite">
          <div class="between">
            <strong>Manos libres</strong>
            <span class="small num">
              {ejercicio(items[manos.i]?.ejId)?.nombre.split(" (")[0]} · serie {manos.j + 1}
            </span>
          </div>
          {oido && <span class="small">{oido}</span>}
          <div class="row" style={{ gap: "8px", flexWrap: "wrap" }}>
            <button class="btn main" aria-label="Hablar" onClick={escuchar}>
              <Icon name="mic" size={18} />
            </button>
            <button class="btn main" onClick={() => manejar({ tipo: "serie" })}>
              Serie hecha
            </button>
            <button class="btn" onClick={() => manejar({ tipo: "siguiente" })}>
              Siguiente
            </button>
            <button class="btn" onClick={() => manejar({ tipo: "salir" })}>
              Salir
            </button>
          </div>
        </div>
      ) : (
        items.length > 0 && (
          <button
            class="btn full"
            onClick={() => {
              speaker.unlock();
              const c = { i: 0, j: Math.max(0, (reg[items[0].ejId] || []).findIndex((x) => !x.reps)) };
              setManos(c);
              manosRef.current = c;
              void decir(c);
            }}
          >
            <Icon name="mic" size={18} /> Entrenar con voz (manos libres)
          </button>
        )
      )}
      <details>
        <summary style={{ cursor: "pointer", minHeight: "36px", fontWeight: 600 }}>Calentamiento (10 min)</summary>
        <ul class="small" style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
          {CALENTAMIENTO.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>
      {items.map((it) => (
        <ItemSesion key={it.ejId} it={it} filas={reg[it.ejId] || []} gimnasio={gimnasio} onEj={onEj} onChange={(f) => setReg({ ...reg, [it.ejId]: f })} onRest={() => setTimer({ fin: Date.now() + it.descanso * 1000, total: it.descanso })} />
      ))}
      <details>
        <summary style={{ cursor: "pointer", minHeight: "36px", fontWeight: 600 }}>Vuelta a la calma (5 min)</summary>
        <ul class="small" style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
          {VUELTA_CALMA.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>
      <div class="field">
        <span class="lbl">¿Qué tan duro fue? (1 a 10)</span>
        <div class="chips">
          {[5, 6, 7, 8, 9, 10].map((n) => (
            <button key={n} class={rpe === n ? "on" : ""} onClick={() => setRpe(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <button class="btn main full" onClick={guardar}>
        Terminar y guardar
      </button>
      {timer && (
        <div role="timer" aria-live="polite" class="toast" style={{ bottom: "calc(env(safe-area-inset-bottom) + 20px)" }}>
          <span>Descanso: {Math.floor(quedan / 60)}:{String(quedan % 60).padStart(2, "0")}</span>
          <button onClick={() => setTimer(null)}>Saltar</button>
        </div>
      )}
    </Sheet>
  );
}

function ItemSesion({ it, filas, gimnasio, onChange, onRest, onEj }: { it: ItemPlan; filas: { reps: string; kg: string }[]; gimnasio: boolean; onChange: (f: { reps: string; kg: string }[]) => void; onRest: () => void; onEj: (id: string) => void }) {
  const { data } = useApp();
  const e = ejercicio(it.ejId)!;
  const sug = sugerencia(data.entrenos, it, gimnasio);
  const conPeso = e.equipo.some((q) => q === "mancuernas" || q === "gimnasio" || q === "mochila");
  return (
    <div class="card" style={{ gap: "8px" }}>
      <div class="between">
        <button class="link" style={{ color: "var(--ink)", fontWeight: 600, fontSize: "16px", textAlign: "left" }} onClick={() => onEj(e.id)}>
          {e.nombre} ›
        </button>
        <span class="small num">
          {filas.length} × {it.repsMin === it.repsMax ? it.repsMin : `${it.repsMin}–${it.repsMax}`}
          {e.porTiempo ? " s" : ""}
        </span>
      </div>
      <span class="small">{sug.texto}</span>
      {filas.map((f, i) => (
        <div key={i} class="row" style={{ gap: "8px" }}>
          <span class="small" style={{ width: "56px" }}>
            Serie {i + 1}
          </span>
          <input aria-label={`Serie ${i + 1}: ${e.porTiempo ? "segundos" : "repeticiones"}`} style={{ ...inp, width: "86px" }} inputMode="numeric" placeholder={String(sug.reps)} value={f.reps} onInput={(ev) => onChange(filas.map((x, j) => (j === i ? { ...x, reps: (ev.target as HTMLInputElement).value.replace(/\D/g, "") } : x)))} />
          <span class="small">{e.porTiempo ? "s" : "reps"}</span>
          {conPeso && (
            <>
              <input aria-label={`Serie ${i + 1}: kilos`} style={{ ...inp, width: "76px" }} inputMode="decimal" placeholder="kg" value={f.kg} onInput={(ev) => onChange(filas.map((x, j) => (j === i ? { ...x, kg: (ev.target as HTMLInputElement).value } : x)))} />
              <span class="small">kg</span>
            </>
          )}
          <button class="icon-btn" aria-label="Descanso" title={`Descanso ${it.descanso} s`} onClick={onRest}>
            ⏱
          </button>
        </div>
      ))}
      <button class="link" style={{ alignSelf: "flex-start", fontSize: "13px" }} onClick={() => onChange(filas.map((x) => ({ ...x, reps: x.reps || String(sug.reps) })))}>
        Hice la meta en todas
      </button>
    </div>
  );
}

function Volumen() {
  const { data } = useApp();
  const v = volumenPorMusculo(data.entrenos, lunesDe(chileNow().date));
  const filas = (Object.keys(MUSCULOS) as Musculo[]).filter((m) => (v[m] || 0) > 0);
  if (!filas.length) return null;
  return (
    <div class="card">
      <h2>Series por músculo esta semana</h2>
      {filas.map((m) => (
        <div key={m} class="stack" style={{ gap: "3px" }}>
          <div class="between small">
            <span style={{ color: "var(--ink)" }}>{MUSCULOS[m]}</span>
            <span class="num">{Math.round((v[m] || 0) * 10) / 10} de 10</span>
          </div>
          <Progress thin value={((v[m] || 0) / 10) * 100} color={(v[m] || 0) >= 10 ? "var(--green)" : "var(--blue)"} label={`${MUSCULOS[m]}: ${v[m]} series`} />
        </div>
      ))}
      <span class="small">Para ganar músculo se recomiendan unas 10 a 20 series por músculo a la semana. Los músculos que ayudan cuentan como media serie (participación alta) o un cuarto (media).</span>
    </div>
  );
}

function Historial() {
  const { data } = useApp();
  const ents = [...data.entrenos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!ents.length) return null;
  const ejs = [...new Set(ents.flatMap((e) => e.items.map((i) => i.ejId)))];
  return (
    <details class="card">
      <summary style={{ cursor: "pointer", minHeight: "32px", fontWeight: 600 }}>Historial y récords</summary>
      <div class="list">
        {ents.slice(0, 10).map((e) => (
          <div class="item" key={e.id}>
            <span class="stack" style={{ gap: 0 }}>
              <span>{e.nombre}</span>
              <span class="small">
                {fechaCorta(e.fecha)} · {e.items.length ? `${e.items.reduce((a, i) => a + i.series.length, 0)} series` : e.nota || "sin detalle"}{e.rpe ? ` · esfuerzo ${e.rpe}` : ""}
              </span>
              {e.items.length > 0 && (
                <span class="small">
                  {e.items.map((i) => `${(ejercicio(i.ejId)?.nombre || i.ejId.replace(/^libre:/, "")).split(" (")[0]} ${i.series.length}×${i.series[0]?.reps ?? "?"}${i.series[0]?.kg ? ` ${String(i.series[0].kg).replace(".", ",")} kg` : ""}`).join(" · ")}
                </span>
              )}
            </span>
            <span />
            <button
              class="icon-btn"
              aria-label="Borrar entreno"
              onClick={async () => {
                const u = await store.remove("entrenos", e.id);
                toast("Entreno borrado.", u);
              }}
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
      </div>
      <h2 style={{ marginTop: "8px" }}>Récords personales</h2>
      {ejs.map((id) => {
        const r = records(data.entrenos, id);
        const e = ejercicio(id);
        return (
          <div key={id} class="between small">
            <span style={{ color: "var(--ink)" }}>{e?.nombre || id.replace(/^libre:/, "")}</span>
            <span class="num">{r.maxKg ? `${String(r.maxKg.kg).replace(".", ",")} kg × ${r.maxKg.reps}` : r.maxReps ? `${r.maxReps.reps}${e?.porTiempo ? " s" : " reps"}` : "—"}</span>
          </div>
        );
      })}
    </details>
  );
}

function Biblioteca({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [zona, setZona] = useState<string>("todas");
  const t = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const list = EJERCICIOS.filter((e) => (zona === "todas" || e.zona === zona || e.tipo === zona) && (!t || (e.nombre + " " + MUSCULOS[e.principal]).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(t)));
  return (
    <details class="card">
      <summary style={{ cursor: "pointer", minHeight: "32px", fontWeight: 600 }}>Biblioteca de ejercicios ({EJERCICIOS.length})</summary>
      <input aria-label="Buscar ejercicio" placeholder="Buscar: sentadilla, glúteos…" style={inp} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="chips">
        {[
          ["todas", "Todos"],
          ["inferior", "Pierna"],
          ["superior", "Tren superior"],
          ["core", "Core"],
          ["potencia", "Potencia"],
          ["prevencion", "Prevención"],
        ].map(([k, l]) => (
          <button key={k} class={zona === k ? "on" : ""} onClick={() => setZona(k)}>
            {l}
          </button>
        ))}
      </div>
      {list.map((e) => (
        <button key={e.id} class="between" style={{ background: "none", border: 0, color: "inherit", minHeight: "44px", padding: 0, textAlign: "left" }} onClick={() => onOpen(e.id)}>
          <span class="stack" style={{ gap: 0 }}>
            <span>{e.nombre}</span>
            <span class="small">
              {MUSCULOS[e.principal]} · {["", "principiante", "intermedio", "avanzado"][e.nivel]}
            </span>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      ))}
    </details>
  );
}

function EjercicioSheet({ id, onClose, onOther }: { id: string; onClose: () => void; onOther: (id: string) => void }) {
  const e = ejercicio(id) as Ejercicio;
  if (!e) return null;
  const nivelTxt = { alta: "alta", media: "media", baja: "baja" };
  return (
    <Sheet title={e.nombre} onClose={onClose}>
      <div class="stack" style={{ gap: "6px" }}>
        <span class="lbl">Músculos</span>
        <div class="between">
          <strong>{MUSCULOS[e.principal]}</strong>
          <span class="small">principal</span>
        </div>
        {e.secundarios.map((s) => (
          <div class="between" key={s.m}>
            <span>{MUSCULOS[s.m]}</span>
            <span class="small">participación {nivelTxt[s.nivel]}</span>
          </div>
        ))}
        <span class="small">{NOTA_EMG}</span>
        <span class="small">{e.fuente ? `Fuente: ${e.fuente}` : "Fuente: no tengo un estudio específico de este ejercicio; los niveles son orientativos, según cómo trabaja cada músculo."}</span>
      </div>
      <div class="stack" style={{ gap: "4px" }}>
        <span class="lbl">Equipo y nivel</span>
        <span>
          {e.equipo.map((q) => EQUIPOS[q]).join(", ")} · {["", "principiante", "intermedio", "avanzado"][e.nivel]}
        </span>
      </div>
      <div class="stack" style={{ gap: "4px" }}>
        <span class="lbl">Errores comunes</span>
        <ul style={{ margin: 0, paddingLeft: "18px" }}>
          {e.errores.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      {(e.facil || e.dificil || e.alternativa) && (
        <div class="stack" style={{ gap: "4px" }}>
          <span class="lbl">Variantes</span>
          {e.facil && (
            <button class="link" style={{ textAlign: "left" }} onClick={() => onOther(e.facil!)}>
              Más fácil: {ejercicio(e.facil)?.nombre}
            </button>
          )}
          {e.dificil && (
            <button class="link" style={{ textAlign: "left" }} onClick={() => onOther(e.dificil!)}>
              Más difícil: {ejercicio(e.dificil)?.nombre}
            </button>
          )}
          {e.alternativa && <span class="small">Con otro equipo: {e.alternativa}</span>}
        </div>
      )}
      <p class="small" style={{ margin: 0 }}>
        JARVIS no reemplaza a un entrenador ni a un kinesiólogo. Si algo duele de forma aguda, para.
      </p>
    </Sheet>
  );
}
