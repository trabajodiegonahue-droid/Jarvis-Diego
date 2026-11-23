import { useState } from "preact/hooks";
import { addDays, fechaLarga } from "../../core/dates";
import { chileNow } from "../../core/time";
import { store } from "../../data/store";
import { uid, type Area, type FuenteMeta, type Meta, type TipoMeta } from "../../data/types";
import { avance, faltaSemana, fechaEstimada, revisionMes } from "../../goals/calc";
import { simular } from "../../extras/calc";
import { AREAS_META, ESTADO_META, fmtValor } from "../../goals/format";
import { mesDe, nombreMes, sumarMeses } from "../../money/calc";
import { clp, parseCLP } from "../../money/format";
import { parseDecimal } from "../../study/calc";
import { Progress } from "../charts";
import { Empty, Sheet } from "../components";
import { Icon } from "../icons";
import { toast, useApp } from "../state";

const hoyCL = () => chileNow().date;

export function Metas() {
  const { data } = useApp();
  const hoy = hoyCL();
  const [nueva, setNueva] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const activas = data.metas.filter((m) => !m.archivada).sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
  const archivadas = data.metas.filter((m) => m.archivada);
  const meta = data.metas.find((m) => m.id === abierta);

  return (
    <main class="page">
      <header class="head">
        <h1>Metas</h1>
        <button class="btn sm" onClick={() => setNueva(true)}>
          <Icon name="plus" size={18} /> Nueva
        </button>
      </header>
      {!activas.length ? (
        <div class="card">
          <Empty text="Todavía no tienes metas. Parte por una: ahorrar para algo, llegar a una marca o un hábito." action="Crear mi primera meta" onAction={() => setNueva(true)} />
        </div>
      ) : (
        <>
          <Semana metas={activas} />
          {activas.map((m) => (
            <MetaCard key={m.id} m={m} onOpen={() => setAbierta(m.id)} />
          ))}
        </>
      )}
      <Revision />
      {archivadas.length > 0 && (
        <details class="card">
          <summary style={{ cursor: "pointer", minHeight: "32px" }}>Archivadas ({archivadas.length})</summary>
          {archivadas.map((m) => (
            <button key={m.id} class="item" style={{ background: "none", border: 0, borderTop: "1px solid var(--line)", width: "100%", textAlign: "left", color: "inherit" }} onClick={() => setAbierta(m.id)}>
              <span>{m.nombre}</span>
              <span class="small">{ESTADO_META[avance(m, data, hoy).estado].texto}</span>
              <Icon name="chevron" size={16} />
            </button>
          ))}
        </details>
      )}
      {nueva && (
        <Sheet title="Nueva meta" onClose={() => setNueva(false)}>
          <MetaForm onDone={() => setNueva(false)} />
        </Sheet>
      )}
      {meta && <MetaDetalle m={meta} onClose={() => setAbierta(null)} />}
    </main>
  );
}

export function MetaCard({ m, onOpen, compacta }: { m: Meta; onOpen: () => void; compacta?: boolean }) {
  const { data } = useApp();
  const hoy = hoyCL();
  const a = avance(m, data, hoy);
  const e = ESTADO_META[a.estado];
  return (
    <button class="card" onClick={onOpen} aria-label={`${m.nombre}: ${Math.round(a.pct)}%, ${e.texto}`} style={compacta ? { padding: "0", border: 0, boxShadow: "none", background: "none", gap: "4px" } : undefined}>
      <div class="between">
        <span style={{ fontWeight: 600 }}>
          {m.principal && !compacta ? "★ " : ""}
          {m.nombre}
        </span>
        <span class="gold num" style={{ fontWeight: 700 }}>
          {Math.min(999, Math.round(a.pct))}%
        </span>
      </div>
      <Progress thin={compacta} value={a.pct} color="var(--gold)" label={`${m.nombre}: ${Math.round(a.pct)}%`} />
      <div class="between small">
        <span>
          {fmtValor(m, a.actual)} de {fmtValor(m, a.objetivo)}
        </span>
        <span>
          <span style={{ color: e.color }}>
            {e.icono} {e.texto}
          </span>
          {" · "}
          {fechaLarga(m.fechaLimite)}
        </span>
      </div>
    </button>
  );
}

function Semana({ metas }: { metas: Meta[] }) {
  const { data } = useApp();
  const hoy = hoyCL();
  const filas = metas
    .map((m) => {
      const f = faltaSemana(m, data, hoy);
      if (!f || (!f.texto && f.valor <= 0)) return null;
      return { m, texto: f.texto || `Esta semana: ${fmtValor(m, m.tipo === "monto" ? Math.ceil(f.valor / 100) * 100 : Math.ceil(f.valor * 10) / 10)}` };
    })
    .filter(Boolean) as { m: Meta; texto: string }[];
  if (!filas.length) return null;
  return (
    <div class="card">
      <h2>Qué te falta esta semana</h2>
      <div class="stack" style={{ gap: "6px" }}>
        {filas.map((f) => (
          <div key={f.m.id} class="between" style={{ fontSize: "14px" }}>
            <span>{f.m.nombre}</span>
            <span class="num small" style={{ textAlign: "right" }}>
              {f.texto}
            </span>
          </div>
        ))}
      </div>
      <p class="small" style={{ margin: 0 }}>
        Es lo que te toca por semana para llegar a tiempo, repartiendo lo que falta en las semanas que quedan.
      </p>
    </div>
  );
}

function MetaDetalle({ m, onClose }: { m: Meta; onClose: () => void }) {
  const { data } = useApp();
  const hoy = hoyCL();
  const a = avance(m, data, hoy);
  const est = fechaEstimada(m, data, hoy);
  const [valor, setValor] = useState("");
  const [paso, setPaso] = useState("");
  const [editar, setEditar] = useState(false);
  const aportes = data.aportes.filter((x) => x.metaId === m.id).sort((x, y) => y.fecha.localeCompare(x.fecha));
  const hechoHoy = aportes.find((x) => x.fecha === hoy);
  const automatica = m.fuente !== "manual";

  if (editar)
    return (
      <Sheet title="Editar meta" onClose={() => setEditar(false)}>
        <MetaForm meta={m} onDone={() => setEditar(false)} />
      </Sheet>
    );

  return (
    <Sheet title={m.nombre} onClose={onClose}>
      <div class="stack" style={{ gap: "4px" }}>
        <span class="big gold">{Math.round(a.pct)}%</span>
        <Progress value={a.pct} color="var(--gold)" label={`Avance: ${Math.round(a.pct)}%`} />
        <span class="small">
          {fmtValor(m, a.actual)} de {fmtValor(m, a.objetivo)} · pasó {Math.round(a.pctTiempo)}% del plazo · {a.quedanDias >= 0 ? `quedan ${a.quedanDias} días` : "venció"}
        </span>
        <span class="small" style={{ color: ESTADO_META[a.estado].color }}>
          {ESTADO_META[a.estado].icono} {ESTADO_META[a.estado].texto}
          {est && a.estado !== "cumplida" ? ` · a este ritmo llegas el ${fechaLarga(est)}` : ""}
        </span>
        {automatica && (
          <span class="small">
            Se llena sola con {m.fuente === "ahorro" ? "lo que te sobra cada mes en Dinero" : m.fuente === "horas-estudio" ? "tus horas de estudio" : "tus horas de trabajo"} desde el {fechaLarga(m.inicio)}.
          </span>
        )}
      </div>

      {m.tipo === "monto" && a.estado !== "cumplida" && <Simulador m={m} />}

      {m.tipo === "pasos" && (
        <div class="stack">
          {(m.pasos || []).map((p) => (
            <label key={p.id} class="row" style={{ minHeight: "44px" }}>
              <input
                type="checkbox"
                checked={p.hecho}
                style={{ width: "22px", height: "22px" }}
                onChange={() => {
                  const antes = m;
                  store.put("metas", { ...m, pasos: (m.pasos || []).map((x) => (x.id === p.id ? { ...x, hecho: !x.hecho } : x)) });
                  if (!p.hecho) toast(`Listo: ${p.texto}.`, () => void store.put("metas", antes));
                }}
              />
              <span style={{ textDecoration: p.hecho ? "line-through" : "none", color: p.hecho ? "var(--muted)" : undefined }}>{p.texto}</span>
            </label>
          ))}
          <form
            class="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!paso.trim()) return;
              store.put("metas", { ...m, pasos: [...(m.pasos || []), { id: uid(), texto: paso.trim(), hecho: false }] });
              setPaso("");
            }}
          >
            <input aria-label="Nuevo paso" placeholder="Agregar un paso" value={paso} onInput={(e) => setPaso((e.target as HTMLInputElement).value)} style={{ flex: 1, minHeight: "44px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 12px" }} />
            <button class="btn sm">Agregar</button>
          </form>
        </div>
      )}

      {m.tipo === "habito" && (
        <button
          class={`btn full ${hechoHoy ? "" : "main"}`}
          onClick={async () => {
            if (hechoHoy) {
              const undo = await store.remove("aportes", hechoHoy.id);
              toast("Quitado lo de hoy.", undo);
            } else {
              const ap = { id: uid(), metaId: m.id, fecha: hoy, valor: 1 };
              await store.put("aportes", ap);
              toast("Anotado. Bien ahí.", async () => void (await store.remove("aportes", ap.id)));
            }
          }}
        >
          {hechoHoy ? "✓ Hoy cumplido (tocar para quitar)" : "Hoy lo hice"}
        </button>
      )}

      {(m.tipo === "monto" || m.tipo === "cantidad") && (
        <form
          class="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = m.tipo === "monto" ? parseCLP(valor) : parseDecimal(valor);
            if (v == null || !Number.isFinite(v) || v === 0) return toast(m.tipo === "monto" ? "Escribe el monto, por ejemplo 50.000." : "Escribe un número.");
            const ap = { id: uid(), metaId: m.id, fecha: hoy, valor: v };
            await store.put("aportes", ap);
            setValor("");
            toast(`Sumado ${fmtValor(m, v)}.`, async () => void (await store.remove("aportes", ap.id)));
          }}
        >
          <label class="lbl" for="ap-v">
            {automatica ? "Sumar algo aparte (por ejemplo, lo que ya tenías)" : "Sumar avance"}
          </label>
          <div class="row">
            <input id="ap-v" inputMode="decimal" value={valor} onInput={(e) => setValor((e.target as HTMLInputElement).value)} placeholder={m.tipo === "monto" ? "50.000" : m.unidad ? `en ${m.unidad}` : "1"} style={{ flex: 1, minHeight: "48px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 12px", fontSize: "16px" }} />
            <button class="btn main">Sumar</button>
          </div>
        </form>
      )}

      {aportes.length > 0 && m.tipo !== "pasos" && (
        <details>
          <summary class="small" style={{ cursor: "pointer", minHeight: "32px" }}>
            Historial ({aportes.length})
          </summary>
          <div class="list">
            {aportes.slice(0, 30).map((x) => (
              <div class="item" key={x.id}>
                <span class="small">{fechaLarga(x.fecha)}</span>
                <span class="num">{fmtValor(m, x.valor)}</span>
                <button
                  class="icon-btn"
                  aria-label="Borrar este avance"
                  onClick={async () => {
                    const undo = await store.remove("aportes", x.id);
                    toast("Avance borrado.", undo);
                  }}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      <div class="grid2">
        <button class="btn sm" onClick={() => store.put("metas", { ...m, principal: !m.principal })}>
          {m.principal ? "Quitar del inicio" : "★ Mostrar en inicio"}
        </button>
        <button class="btn sm" onClick={() => setEditar(true)}>
          Editar
        </button>
        <button
          class="btn sm"
          onClick={() => {
            store.put("metas", { ...m, archivada: !m.archivada });
            toast(m.archivada ? "Meta activa de nuevo." : "Meta archivada.");
            onClose();
          }}
        >
          {m.archivada ? "Reactivar" : "Archivar"}
        </button>
        <button
          class="btn sm danger"
          onClick={async () => {
            onClose();
            const ids = data.aportes.filter((x) => x.metaId === m.id).map((x) => x.id);
            const u1 = await store.remove("metas", m.id);
            const u2 = await store.remove("aportes", ...ids);
            toast("Meta borrada.", async () => {
              await u1();
              await u2();
            });
          }}
        >
          Borrar
        </button>
      </div>
    </Sheet>
  );
}

const TIPOS: { id: TipoMeta; nombre: string; ayuda: string }[] = [
  { id: "monto", nombre: "Plata", ayuda: "Juntar un monto, por ejemplo $1.000.000 para el viaje." },
  { id: "cantidad", nombre: "Cantidad", ayuda: "Llegar a un número: horas, kilos, libros, km." },
  { id: "habito", nombre: "Hábito", ayuda: "Hacer algo varias veces por semana." },
  { id: "pasos", nombre: "Pasos", ayuda: "Una lista de cosas por hacer, por ejemplo los trámites de la visa." },
];

export function MetaForm({ meta, onDone }: { meta?: Meta; onDone: () => void }) {
  const hoy = hoyCL();
  const [nombre, setNombre] = useState(meta?.nombre || "");
  const [area, setArea] = useState<Area>(meta?.area || "dinero");
  const [tipo, setTipo] = useState<TipoMeta>(meta?.tipo || "monto");
  const [obj, setObj] = useState(meta ? (meta.tipo === "monto" ? clp(meta.objetivo) : String(meta.objetivo).replace(".", ",")) : "");
  const [unidad, setUnidad] = useState(meta?.unidad || "");
  const [fuente, setFuente] = useState<FuenteMeta>(meta?.fuente || "manual");
  const [limite, setLimite] = useState(meta?.fechaLimite || addDays(hoy, 90));
  const [pasosTxt, setPasosTxt] = useState("");
  const [principal, setPrincipal] = useState(meta?.principal ?? true);
  const fuentes: { id: FuenteMeta; nombre: string }[] =
    tipo === "monto" ? [{ id: "manual", nombre: "La anoto yo" }, { id: "ahorro", nombre: "Se llena sola con lo que ahorro en Dinero" }] : tipo === "cantidad" ? [{ id: "manual", nombre: "La anoto yo" }, { id: "horas-estudio", nombre: "Horas de estudio (sola)" }, { id: "horas-trabajo", nombre: "Horas de trabajo (sola)" }] : [];

  async function guardar(e: Event) {
    e.preventDefault();
    if (!nombre.trim()) return toast("Ponle un nombre a la meta.");
    if (limite <= (meta?.inicio || hoy)) return toast("La fecha límite tiene que ser después de hoy.");
    let objetivo = 0;
    if (tipo === "monto") objetivo = parseCLP(obj) || 0;
    else if (tipo !== "pasos") objetivo = parseDecimal(obj);
    if (tipo !== "pasos" && !(objetivo > 0)) return toast(tipo === "habito" ? "¿Cuántas veces por semana?" : "Escribe a cuánto quieres llegar.");
    if (tipo === "habito" && objetivo > 7) return toast("Un hábito es de 1 a 7 veces por semana.");
    const pasosNuevos = pasosTxt.split("\n").map((t) => t.trim()).filter(Boolean).map((texto) => ({ id: uid(), texto, hecho: false }));
    if (tipo === "pasos" && !meta && !pasosNuevos.length) return toast("Escribe al menos un paso (uno por línea).");
    const fuenteOk = fuentes.some((f) => f.id === fuente) ? fuente : "manual";
    const m: Meta = {
      id: meta?.id || uid(),
      nombre: nombre.trim(),
      area,
      tipo,
      objetivo,
      unidad: tipo === "cantidad" ? (fuenteOk.startsWith("horas") ? "horas" : unidad.trim() || undefined) : undefined,
      inicio: meta?.inicio || hoy,
      fechaLimite: limite,
      fuente: fuenteOk,
      pasos: tipo === "pasos" ? [...(meta?.pasos || []), ...pasosNuevos] : undefined,
      principal,
      archivada: meta?.archivada,
      creado: meta?.creado || Date.now(),
    };
    await store.put("metas", m);
    onDone();
    toast(meta ? "Meta guardada." : `Meta creada: ${m.nombre}.`);
  }

  return (
    <form class="stack" style={{ gap: "16px" }} onSubmit={guardar}>
      <div class="field">
        <label class="lbl" for="m-n">
          Nombre
        </label>
        <input id="m-n" maxLength={60} value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} placeholder="Ahorro para la Working Holiday" />
      </div>
      <div class="field">
        <span class="lbl">Tipo</span>
        <div class="chips">
          {TIPOS.map((t) => (
            <button type="button" key={t.id} class={tipo === t.id ? "on" : ""} aria-pressed={tipo === t.id} onClick={() => (setTipo(t.id), setFuente("manual"), setObj(""))} disabled={!!meta && meta.tipo !== t.id}>
              {t.nombre}
            </button>
          ))}
        </div>
        <span class="small">{TIPOS.find((t) => t.id === tipo)!.ayuda}</span>
      </div>
      {tipo !== "pasos" && (
        <div class="grid2">
          <div class="field">
            <label class="lbl" for="m-o">
              {tipo === "monto" ? "Monto a juntar" : tipo === "habito" ? "Veces por semana" : "Llegar a"}
            </label>
            <input id="m-o" inputMode="decimal" value={obj} onInput={(e) => setObj((e.target as HTMLInputElement).value)} placeholder={tipo === "monto" ? "1.000.000" : tipo === "habito" ? "3" : "100"} />
          </div>
          {tipo === "cantidad" && !fuente.startsWith("horas") && (
            <div class="field">
              <label class="lbl" for="m-u">
                Unidad
              </label>
              <input id="m-u" maxLength={16} value={unidad} onInput={(e) => setUnidad((e.target as HTMLInputElement).value)} placeholder="horas, kg, libros" />
            </div>
          )}
        </div>
      )}
      {tipo === "pasos" && (
        <div class="field">
          <label class="lbl" for="m-p">
            {meta ? "Agregar pasos (uno por línea)" : "Pasos (uno por línea)"}
          </label>
          <textarea id="m-p" value={pasosTxt} onInput={(e) => setPasosTxt((e.target as HTMLTextAreaElement).value)} placeholder={"Sacar pasaporte\nPrueba de inglés\nJuntar los fondos"} />
        </div>
      )}
      {fuentes.length > 0 && (
        <div class="field">
          <span class="lbl">¿Cómo avanza?</span>
          <div class="seg">
            {fuentes.map((f) => (
              <button type="button" key={f.id} class={fuente === f.id ? "on" : ""} aria-pressed={fuente === f.id} onClick={() => setFuente(f.id)}>
                {f.nombre}
              </button>
            ))}
          </div>
        </div>
      )}
      <div class="field">
        <span class="lbl">Área</span>
        <div class="chips">
          {AREAS_META.map((a) => (
            <button type="button" key={a.id} class={area === a.id ? "on" : ""} aria-pressed={area === a.id} onClick={() => setArea(a.id as Area)}>
              {a.nombre}
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        <label class="lbl" for="m-f">
          Fecha límite
        </label>
        <input id="m-f" type="date" min={addDays(hoy, 1)} value={limite} onInput={(e) => setLimite((e.target as HTMLInputElement).value)} />
      </div>
      <label class="row" style={{ minHeight: "44px" }}>
        <input type="checkbox" checked={principal} onChange={(e) => setPrincipal((e.target as HTMLInputElement).checked)} style={{ width: "22px", height: "22px" }} />
        Mostrarla en el inicio
      </label>
      <button class="btn main full">{meta ? "Guardar" : "Crear meta"}</button>
    </form>
  );
}

function Revision() {
  const { data } = useApp();
  const hoy = hoyCL();
  const dia = Number(hoy.slice(8, 10));
  const [mes, setMes] = useState(dia <= 7 ? sumarMeses(mesDe(hoy), -1) : mesDe(hoy));
  const filas = revisionMes(data.metas, data, mes);
  const rev = data.revisiones.find((r) => r.id === mes);
  const [nota, setNota] = useState(rev?.nota || "");
  if (!data.metas.length) return null;
  const nombre = nombreMes(mes);
  return (
    <details class="card">
      <summary style={{ cursor: "pointer", minHeight: "32px", fontWeight: 600 }}>Revisión de {nombre}</summary>
      <div class="seg">
        {[sumarMeses(mesDe(hoy), -1), mesDe(hoy)].map((x) => (
          <button key={x} class={mes === x ? "on" : ""} onClick={() => (setMes(x), setNota(data.revisiones.find((r) => r.id === x)?.nota || ""))}>
            {nombreMes(x)[0].toUpperCase() + nombreMes(x).slice(1)}
          </button>
        ))}
      </div>
      {!filas.length ? (
        <span class="small">Ese mes no tenías metas activas.</span>
      ) : (
        <div class="list">
          {filas.map((f) => (
            <div class="item" key={f.meta.id}>
              <span>{f.meta.nombre}</span>
              <span class="num small">{f.ganado > 0 ? `+${fmtValor(f.meta, f.ganado)}` : "sin avance"}</span>
              <span class="small" style={{ color: ESTADO_META[f.estado].color }}>
                {ESTADO_META[f.estado].icono} {ESTADO_META[f.estado].texto}
              </span>
            </div>
          ))}
        </div>
      )}
      <div class="field">
        <label class="lbl" for="rev-n">
          ¿Qué cambio para el próximo mes?
        </label>
        <textarea id="rev-n" maxLength={600} value={nota} onInput={(e) => setNota((e.target as HTMLTextAreaElement).value)} placeholder="Por ejemplo: ahorrar las propinas apenas me las pagan." />
      </div>
      <button class="btn sm" onClick={() => store.put("revisiones", { id: mes, nota: nota.trim() }).then(() => toast("Revisión guardada."))}>
        Guardar revisión
      </button>
    </details>
  );
}

// "Si ahorro tanto al mes, ¿cuándo llego?" Se mueve el monto y se ve la fecha al tiro.
function Simulador({ m }: { m: Meta }) {
  const { data } = useApp();
  const hoy = hoyCL();
  const base = simular(m, data, hoy, 0);
  const sugerido = Math.max(5000, Math.min(base.necesario || 50000, 2_000_000));
  const [porMes, setPorMes] = useState(Math.round(sugerido / 5000) * 5000);
  const s = simular(m, data, hoy, porMes);
  const max = Math.max(200_000, Math.ceil(((base.necesario || 0) * 2) / 50_000) * 50_000);
  return (
    <div class="card" style={{ gap: "8px" }}>
      <h2>Simulador</h2>
      <label class="lbl" for={`sim-${m.id}`}>
        Si ahorro <strong class="num">{clp(porMes)}</strong> al mes…
      </label>
      <input id={`sim-${m.id}`} type="range" min={5000} max={max} step={5000} value={porMes} onInput={(e) => setPorMes(Number((e.target as HTMLInputElement).value))} style={{ width: "100%", accentColor: "var(--gold)" }} />
      <span style={{ fontSize: "15px" }}>
        {s.fecha ? (
          <>
            llegas el <strong>{fechaLarga(s.fecha)}</strong>
            {s.meses != null && s.meses > 0 ? ` (en ${s.meses} ${s.meses === 1 ? "mes" : "meses"})` : ""}.{" "}
            <span style={{ color: s.aTiempo ? "var(--green)" : "var(--amber)" }}>{s.aTiempo ? "Antes de la fecha límite." : "Después de la fecha límite."}</span>
          </>
        ) : (
          "no llegas."
        )}
      </span>
      {base.necesario != null && base.necesario > 0 && (
        <span class="small">
          Para llegar el {fechaLarga(m.fechaLimite)} necesitas unos {clp(base.necesario)} al mes.{" "}
          <button class="link" style={{ background: "none", border: 0, padding: 0, color: "var(--blue)", fontSize: "13px" }} onClick={() => setPorMes(Math.ceil(base.necesario! / 5000) * 5000)}>
            Usar ese monto
          </button>
        </span>
      )}
    </div>
  );
}
