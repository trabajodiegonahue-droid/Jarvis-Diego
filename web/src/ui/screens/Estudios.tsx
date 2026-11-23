import { useState } from "preact/hooks";
import { fechaCorta, fechaLarga, lunesDe } from "../../core/dates";
import { chileNow } from "../../core/time";
import { store } from "../../data/store";
import { uid, type Evaluacion, type Materia, type Tarea } from "../../data/types";
import { cumpleMeta, formatoResultado, horasEnSemana, metaSemanalTotal, parseDecimal, resultadoValido, serieSemanas } from "../../study/calc";
import { Bars, Line, Progress } from "../charts";
import { Empty, Sheet } from "../components";
import { Icon } from "../icons";
import { toast, useApp } from "../state";

const fh = (h: number) => (Math.round(h * 10) / 10).toLocaleString("es-CL");
const input = { minHeight: "44px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 12px" };

export function Estudios() {
  const { data } = useApp();
  const hoy = chileNow().date;
  const lunes = lunesDe(hoy);
  const [sheet, setSheet] = useState<null | "sesion" | "materia" | "tarea" | "prueba" | { materia: Materia } | { prueba: Evaluacion }>(null);
  const horas = horasEnSemana(data.sesiones, lunes);
  const meta = metaSemanalTotal(data.materias);
  const serie = serieSemanas(data.sesiones, hoy, 8);

  if (!data.materias.length)
    return (
      <main class="page">
        <header class="head">
          <h1>Estudios</h1>
        </header>
        <div class="card">
          <Empty text="Agrega lo que estás estudiando (inglés, la PAES, un curso) y cuántas horas a la semana te propones." action="Agregar una materia" onAction={() => setSheet("materia")} />
        </div>
        {sheet === "materia" && (
          <Sheet title="Nueva materia" onClose={() => setSheet(null)}>
            <MateriaForm onDone={() => setSheet(null)} />
          </Sheet>
        )}
      </main>
    );

  return (
    <main class="page">
      <header class="head">
        <h1>Estudios</h1>
        <button class="btn sm" onClick={() => setSheet("sesion")}>
          <Icon name="plus" size={18} /> Estudié
        </button>
      </header>

      <div class="card">
        <span class="lbl">Esta semana</span>
        <span class="big num">
          {fh(horas)} h{meta ? <span class="sub"> de {fh(meta)} h</span> : null}
        </span>
        {meta > 0 && <Progress value={(horas / meta) * 100} color="var(--green)" label={`Horas de estudio: ${fh(horas)} de ${fh(meta)}`} />}
        {data.materias.map((m) => {
          const h = horasEnSemana(data.sesiones, lunes, m.id);
          return (
            <button key={m.id} class="between" style={{ background: "none", border: 0, color: "inherit", minHeight: "40px", padding: 0, fontSize: "14px" }} onClick={() => setSheet({ materia: m })} aria-label={`Editar ${m.nombre}`}>
              <span>{m.nombre}</span>
              <span class="num small">
                {fh(h)} h{m.metaHorasSemana ? ` de ${fh(m.metaHorasSemana)}` : ""}
              </span>
            </button>
          );
        })}
        <button class="link" style={{ alignSelf: "flex-start" }} onClick={() => setSheet("materia")}>
          + Agregar materia
        </button>
      </div>

      <div class="card">
        <h2>Horas por semana</h2>
        <Bars label="Horas de estudio de las últimas 8 semanas" data={serie.map((p) => ({ etiqueta: fechaCorta(p.lunes).split(" ")[0], valor: p.horas }))} fmt={fh} meta={meta || undefined} />
        {meta > 0 && <span class="small">La línea dorada es tu meta semanal. Las barras verdes la cumplieron.</span>}
      </div>

      <Tareas onAdd={() => setSheet("tarea")} />
      <Pruebas onAdd={() => setSheet("prueba")} onOpen={(e) => setSheet({ prueba: e })} />

      {sheet === "sesion" && (
        <Sheet title="Registrar estudio" onClose={() => setSheet(null)}>
          <SesionForm onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "materia" && (
        <Sheet title="Nueva materia" onClose={() => setSheet(null)}>
          <MateriaForm onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet && typeof sheet === "object" && "materia" in sheet && (
        <Sheet title="Editar materia" onClose={() => setSheet(null)}>
          <MateriaForm materia={sheet.materia} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "tarea" && (
        <Sheet title="Nuevo pendiente" onClose={() => setSheet(null)}>
          <TareaForm onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "prueba" && (
        <Sheet title="Nueva prueba" onClose={() => setSheet(null)}>
          <PruebaForm onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet && typeof sheet === "object" && "prueba" in sheet && (
        <Sheet title={sheet.prueba.nombre} onClose={() => setSheet(null)}>
          <PruebaForm prueba={sheet.prueba} onDone={() => setSheet(null)} />
        </Sheet>
      )}
    </main>
  );
}

export function SesionForm({ onDone }: { onDone: () => void }) {
  const { data } = useApp();
  const hoy = chileNow().date;
  const [mat, setMat] = useState(data.materias[0]?.id || "");
  const [min, setMin] = useState("25");
  const [fecha, setFecha] = useState(hoy);
  const [nota, setNota] = useState("");
  if (!data.materias.length) return <Empty text="Primero agrega una materia en Más → Estudios." />;
  return (
    <form
      class="stack"
      style={{ gap: "16px" }}
      onSubmit={async (e) => {
        e.preventDefault();
        const m = Math.round(Number(min));
        if (!(m > 0 && m <= 720)) return toast("Escribe los minutos (de 1 a 720).");
        const s = { id: uid(), materiaId: mat, fecha, minutos: m, nota: nota.trim() || undefined };
        await store.put("sesiones", s);
        onDone();
        toast(`Anotado: ${m} min de ${data.materias.find((x) => x.id === mat)?.nombre.toLowerCase()}.`, async () => void (await store.remove("sesiones", s.id)));
      }}
    >
      <div class="field">
        <span class="lbl">Qué estudiaste</span>
        <div class="chips">
          {data.materias.map((m) => (
            <button type="button" key={m.id} class={mat === m.id ? "on" : ""} aria-pressed={mat === m.id} onClick={() => setMat(m.id)}>
              {m.nombre}
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        <label class="lbl" for="s-min">
          Minutos
        </label>
        <div class="chips">
          {["15", "25", "30", "45", "60", "90"].map((v) => (
            <button type="button" key={v} class={min === v ? "on" : ""} onClick={() => setMin(v)}>
              {v}
            </button>
          ))}
        </div>
        <input id="s-min" inputMode="numeric" value={min} onInput={(e) => setMin((e.target as HTMLInputElement).value)} />
      </div>
      <div class="grid2">
        <div class="field">
          <label class="lbl" for="s-f">
            Fecha
          </label>
          <input id="s-f" type="date" max={hoy} value={fecha} onInput={(e) => setFecha((e.target as HTMLInputElement).value || hoy)} />
        </div>
        <div class="field">
          <label class="lbl" for="s-n">
            Nota
          </label>
          <input id="s-n" maxLength={80} value={nota} onInput={(e) => setNota((e.target as HTMLInputElement).value)} placeholder="Vocabulario" />
        </div>
      </div>
      <button class="btn main full">Guardar</button>
    </form>
  );
}

function MateriaForm({ materia, onDone }: { materia?: Materia; onDone: () => void }) {
  const [nombre, setNombre] = useState(materia?.nombre || "");
  const [meta, setMeta] = useState(materia?.metaHorasSemana ? String(materia.metaHorasSemana).replace(".", ",") : "");
  return (
    <form
      class="stack"
      style={{ gap: "16px" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!nombre.trim()) return toast("Ponle nombre a la materia.");
        const h = meta.trim() ? parseDecimal(meta) : 0;
        if (!(h >= 0 && h <= 80)) return toast("Las horas por semana van de 0 a 80.");
        await store.put("materias", { id: materia?.id || uid(), nombre: nombre.trim(), metaHorasSemana: h || undefined });
        onDone();
        toast("Materia guardada.");
      }}
    >
      <div class="field">
        <label class="lbl" for="ma-n">
          Nombre
        </label>
        <input id="ma-n" maxLength={40} value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} placeholder="Inglés" />
      </div>
      <div class="field">
        <label class="lbl" for="ma-h">
          Meta de horas por semana (opcional)
        </label>
        <input id="ma-h" inputMode="decimal" value={meta} onInput={(e) => setMeta((e.target as HTMLInputElement).value)} placeholder="3" />
      </div>
      <button class="btn main full">Guardar</button>
      {materia && (
        <button
          type="button"
          class="btn danger full"
          onClick={async () => {
            onDone();
            const u = await store.remove("materias", materia.id);
            toast("Materia borrada. Sus horas anotadas se mantienen.", u);
          }}
        >
          Borrar materia
        </button>
      )}
    </form>
  );
}

function Tareas({ onAdd }: { onAdd: () => void }) {
  const { data } = useApp();
  const hoy = chileNow().date;
  const pend = data.tareas.filter((t) => !t.hecho).sort((a, b) => (a.fecha || "9").localeCompare(b.fecha || "9"));
  const hechas = data.tareas.filter((t) => t.hecho).length;
  return (
    <div class="card">
      <div class="between">
        <h2>Pendientes</h2>
        <button class="link" onClick={onAdd}>
          + Agregar
        </button>
      </div>
      {!pend.length ? (
        <span class="small">{hechas ? "Todo al día. Bien ahí." : "Sin pendientes."}</span>
      ) : (
        pend.map((t) => <TareaFila key={t.id} t={t} hoy={hoy} />)
      )}
    </div>
  );
}

export function TareaFila({ t, hoy }: { t: Tarea; hoy: string }) {
  const { data } = useApp();
  const mat = data.materias.find((m) => m.id === t.materiaId)?.nombre;
  const atrasada = t.fecha && t.fecha < hoy;
  return (
    <label class="row" style={{ minHeight: "44px" }}>
      <input
        type="checkbox"
        checked={t.hecho}
        style={{ width: "22px", height: "22px" }}
        onChange={async () => {
          await store.put("tareas", { ...t, hecho: !t.hecho });
          if (!t.hecho) toast(`Tachado: ${t.texto}.`, () => void store.put("tareas", t));
        }}
      />
      <span class="stack" style={{ gap: 0 }}>
        <span>{t.texto}</span>
        <span class="small" style={{ color: atrasada ? "var(--amber)" : undefined }}>
          {[mat, t.fecha ? (atrasada ? `atrasada · ${fechaCorta(t.fecha)}` : t.fecha === hoy ? "hoy" : fechaCorta(t.fecha)) : ""].filter(Boolean).join(" · ")}
        </span>
      </span>
    </label>
  );
}

function TareaForm({ onDone }: { onDone: () => void }) {
  const { data } = useApp();
  const [texto, setTexto] = useState("");
  const [mat, setMat] = useState("");
  const [fecha, setFecha] = useState("");
  return (
    <form
      class="stack"
      style={{ gap: "16px" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!texto.trim()) return toast("Escribe el pendiente.");
        await store.put("tareas", { id: uid(), texto: texto.trim(), materiaId: mat || undefined, fecha: fecha || undefined, hecho: false });
        onDone();
        toast("Pendiente agregado.");
      }}
    >
      <div class="field">
        <label class="lbl" for="ta-t">
          Qué hay que hacer
        </label>
        <input id="ta-t" maxLength={80} value={texto} onInput={(e) => setTexto((e.target as HTMLInputElement).value)} placeholder="Repasar los verbos irregulares" />
      </div>
      <div class="chips">
        <button type="button" class={!mat ? "on" : ""} onClick={() => setMat("")}>
          Sin materia
        </button>
        {data.materias.map((m) => (
          <button type="button" key={m.id} class={mat === m.id ? "on" : ""} onClick={() => setMat(m.id)}>
            {m.nombre}
          </button>
        ))}
      </div>
      <div class="field">
        <label class="lbl" for="ta-f">
          Para cuándo (opcional)
        </label>
        <input id="ta-f" type="date" value={fecha} onInput={(e) => setFecha((e.target as HTMLInputElement).value)} />
      </div>
      <button class="btn main full">Agregar</button>
    </form>
  );
}

function Pruebas({ onAdd, onOpen }: { onAdd: () => void; onOpen: (e: Evaluacion) => void }) {
  const { data } = useApp();
  const hoy = chileNow().date;
  const [mat, setMat] = useState(data.materias[0]?.id || "");
  const proximas = data.evaluaciones.filter((e) => e.resultado == null).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const conResultado = data.evaluaciones.filter((e) => e.resultado != null && e.materiaId === mat).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const nombreMat = (id: string) => data.materias.find((m) => m.id === id)?.nombre || "";
  return (
    <div class="card">
      <div class="between">
        <h2>Pruebas y ensayos</h2>
        <button class="link" onClick={onAdd}>
          + Agregar
        </button>
      </div>
      {!data.evaluaciones.length && <span class="small">Anota tus pruebas, ensayos o certificaciones (EF SET, PAES) con su fecha y la meta de puntaje.</span>}
      {proximas.map((e) => (
        <button key={e.id} class="between" style={{ background: "none", border: 0, color: "inherit", minHeight: "44px", padding: 0, textAlign: "left" }} onClick={() => onOpen(e)}>
          <span class="stack" style={{ gap: 0 }}>
            <span>{e.nombre}</span>
            <span class="small">
              {nombreMat(e.materiaId)}
              {e.meta != null ? ` · meta ${formatoResultado(e, e.meta)}` : ""}
            </span>
          </span>
          <span class="small" style={{ color: e.fecha < hoy ? "var(--amber)" : undefined }}>
            {e.fecha < hoy ? "anota el resultado" : fechaLarga(e.fecha)}
          </span>
        </button>
      ))}
      {data.evaluaciones.some((e) => e.resultado != null) && (
        <>
          <div class="chips">
            {data.materias.map((m) => (
              <button key={m.id} class={mat === m.id ? "on" : ""} onClick={() => setMat(m.id)}>
                {m.nombre}
              </button>
            ))}
          </div>
          {conResultado.length ? (
            <>
              <Line label={`Resultados de ${nombreMat(mat)}`} data={conResultado.map((e) => ({ etiqueta: fechaCorta(e.fecha), valor: e.resultado! }))} fmt={(v) => formatoResultado(conResultado[0], v)} cero={false} />
              {conResultado.map((e) => {
                const ok = cumpleMeta(e);
                return (
                  <button key={e.id} class="between" style={{ background: "none", border: 0, color: "inherit", minHeight: "40px", padding: 0, fontSize: "14px" }} onClick={() => onOpen(e)}>
                    <span>{e.nombre}</span>
                    <span class="num">
                      {formatoResultado(e)}
                      {ok == null ? "" : ok ? <span class="pos"> ✓ meta</span> : <span style={{ color: "var(--amber)" }}> ▼ meta {formatoResultado(e, e.meta)}</span>}
                    </span>
                  </button>
                );
              })}
            </>
          ) : (
            <span class="small">Sin resultados en esta materia todavía.</span>
          )}
        </>
      )}
    </div>
  );
}

function PruebaForm({ prueba, onDone }: { prueba?: Evaluacion; onDone: () => void }) {
  const { data } = useApp();
  const hoy = chileNow().date;
  const [nombre, setNombre] = useState(prueba?.nombre || "");
  const [mat, setMat] = useState(prueba?.materiaId || data.materias[0]?.id || "");
  const [fecha, setFecha] = useState(prueba?.fecha || hoy);
  const [escala, setEscala] = useState<Evaluacion["escala"]>(prueba?.escala || "nota");
  const [meta, setMeta] = useState(prueba?.meta != null ? String(prueba.meta).replace(".", ",") : "");
  const [res, setRes] = useState(prueba?.resultado != null ? String(prueba.resultado).replace(".", ",") : "");
  return (
    <form
      class="stack"
      style={{ gap: "16px" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!nombre.trim() || !mat) return toast("Falta el nombre o la materia.");
        const vm = meta.trim() ? parseDecimal(meta) : undefined;
        const vr = res.trim() ? parseDecimal(res) : undefined;
        const malo = (v?: number) => v != null && !resultadoValido(escala, v);
        if (malo(vm) || malo(vr)) return toast(escala === "nota" ? "La nota va de 1,0 a 7,0." : escala === "porcentaje" ? "El porcentaje va de 0 a 100." : "Revisa el puntaje.");
        await store.put("evaluaciones", { id: prueba?.id || uid(), nombre: nombre.trim(), materiaId: mat, fecha, escala, meta: vm, resultado: vr });
        onDone();
        toast(vr != null && vm != null ? (vr >= vm ? "Resultado anotado: llegaste a la meta. Bien ahí." : "Resultado anotado. La próxima se sube.") : "Prueba guardada.");
      }}
    >
      <div class="field">
        <label class="lbl" for="pr-n">
          Nombre
        </label>
        <input id="pr-n" maxLength={50} value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} placeholder="Ensayo PAES matemáticas" />
      </div>
      <div class="chips">
        {data.materias.map((m) => (
          <button type="button" key={m.id} class={mat === m.id ? "on" : ""} onClick={() => setMat(m.id)}>
            {m.nombre}
          </button>
        ))}
      </div>
      <div class="field">
        <label class="lbl" for="pr-f">
          Fecha
        </label>
        <input id="pr-f" type="date" value={fecha} onInput={(e) => setFecha((e.target as HTMLInputElement).value || hoy)} />
      </div>
      <div class="seg">
        {(["nota", "puntaje", "porcentaje"] as const).map((x) => (
          <button type="button" key={x} class={escala === x ? "on" : ""} onClick={() => setEscala(x)}>
            {{ nota: "Nota 1 a 7", puntaje: "Puntaje", porcentaje: "%" }[x]}
          </button>
        ))}
      </div>
      <div class="grid2">
        <div class="field">
          <label class="lbl" for="pr-m">
            Meta
          </label>
          <input id="pr-m" inputMode="decimal" value={meta} onInput={(e) => setMeta((e.target as HTMLInputElement).value)} placeholder={escala === "nota" ? "6,0" : escala === "puntaje" ? "750" : "60"} />
        </div>
        <div class="field">
          <label class="lbl" for="pr-r">
            Resultado
          </label>
          <input id="pr-r" inputMode="decimal" value={res} onInput={(e) => setRes((e.target as HTMLInputElement).value)} placeholder="cuando lo tengas" />
        </div>
      </div>
      <button class="btn main full">Guardar</button>
      {prueba && (
        <button
          type="button"
          class="btn danger full"
          onClick={async () => {
            onDone();
            const u = await store.remove("evaluaciones", prueba.id);
            toast("Prueba borrada.", u);
          }}
        >
          Borrar
        </button>
      )}
    </form>
  );
}

export const inputStyle = input;
