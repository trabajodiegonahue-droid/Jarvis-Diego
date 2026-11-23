import { useState } from "preact/hooks";
import { chileNow } from "../../core/time";
import { store } from "../../data/store";
import { uid, type Movimiento } from "../../data/types";
import { ahorroAcumulado, compararMes, estadoPresupuestos, mesDe, nombreMes, porCategoria, presupuestoTotal, serieMensual, sumarMeses, totalesMes } from "../../money/calc";
import { mapear, parseCSV, type Mapeo } from "../../money/csv";
import { clp, parseCLP } from "../../money/format";
import { BarsH, BarsIO, colorEstado, Line, Progress, textoEstado } from "../charts";
import { Empty, MovimientoForm, Sheet } from "../components";
import { Icon } from "../icons";
import { toast, useApp } from "../state";

type Tab = "resumen" | "movimientos" | "presupuesto" | "fijos";

export function Dinero({ onAdd }: { onAdd: () => void }) {
  const { data } = useApp();
  const hoy = chileNow().date;
  const [mes, setMes] = useState(mesDe(hoy));
  const [tab, setTab] = useState<Tab>("resumen");
  const [edit, setEdit] = useState<Movimiento | null>(null);
  const [importar, setImportar] = useState(false);
  const esActual = mes === mesDe(hoy);
  const dia = esActual ? Number(hoy.slice(8, 10)) : 31;
  const tot = totalesMes(data.movimientos, mes);

  return (
    <main class="page">
      <header class="head">
        <h1>Dinero</h1>
      </header>
      <div class="between">
        <button class="icon-btn" aria-label="Mes anterior" onClick={() => setMes(sumarMeses(mes, -1))}>
          <Icon name="back" />
        </button>
        <strong style={{ fontSize: "17px" }}>
          {nombreMes(mes)[0].toUpperCase() + nombreMes(mes).slice(1)} {mes.slice(0, 4)}
        </strong>
        <button class="icon-btn" aria-label="Mes siguiente" disabled={esActual} style={{ opacity: esActual ? 0.3 : 1 }} onClick={() => setMes(sumarMeses(mes, 1))}>
          <Icon name="chevron" />
        </button>
      </div>
      <div class="card" style={{ alignItems: "center", textAlign: "center" }}>
        <span class="lbl">Balance (entra menos sale)</span>
        <span class={`big ${tot.balance >= 0 ? "pos" : "neg"}`}>{clp(tot.balance, { signo: true })}</span>
        <div class="grid2" style={{ width: "100%" }}>
          <div class="stack" style={{ gap: "2px" }}>
            <span class="small">Entró</span>
            <span class="mid pos">{clp(tot.ingresos)}</span>
          </div>
          <div class="stack" style={{ gap: "2px" }}>
            <span class="small">Salió</span>
            <span class="mid neg">{clp(tot.egresos)}</span>
          </div>
        </div>
      </div>
      <div class="seg tabs4" role="tablist" aria-label="Secciones de Dinero">
        {(["resumen", "movimientos", "presupuesto", "fijos"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} class={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {{ resumen: "Resumen", movimientos: "Movimientos", presupuesto: "Presupuesto", fijos: "Fijos" }[t]}
          </button>
        ))}
      </div>
      {tab === "resumen" && <Resumen mes={mes} dia={dia} />}
      {tab === "movimientos" && <Movimientos mes={mes} onEdit={setEdit} onAdd={onAdd} onImport={() => setImportar(true)} />}
      {tab === "presupuesto" && <Presupuestos mes={mes} dia={dia} />}
      {tab === "fijos" && <Fijos />}
      {edit && (
        <Sheet title="Editar movimiento" onClose={() => setEdit(null)}>
          <MovimientoForm mov={edit} onDone={() => setEdit(null)} />
          <button
            class="btn danger full"
            onClick={async () => {
              const m = edit;
              setEdit(null);
              const undo = await store.remove("movimientos", m.id);
              toast("Movimiento borrado.", undo);
            }}
          >
            <Icon name="trash" size={18} /> Borrar
          </button>
        </Sheet>
      )}
      {importar && <ImportarCSV onClose={() => setImportar(false)} />}
    </main>
  );
}

function Resumen({ mes, dia }: { mes: string; dia: number }) {
  const { data } = useApp();
  const serie = serieMensual(data.movimientos, mes, 6);
  const gastos = porCategoria(data.movimientos, data.categorias, mes, "egreso");
  const totalG = gastos.reduce((a, g) => a + g.total, 0);
  const cmp = compararMes(data.movimientos, mes, dia);
  const hayAlgo = serie.some((p) => p.ingresos || p.egresos);
  if (!hayAlgo) return <Empty text="Cuando anotes gastos e ingresos, aquí verás tus gráficos." />;
  return (
    <>
      <div class="card">
        <h2>Comparado con {nombreMes(sumarMeses(mes, -1))}</h2>
        <p class="sub" style={{ margin: 0 }}>
          Hasta el mismo día:{" "}
          {cmp.difEgresos === 0 ? "gastaste lo mismo" : cmp.difEgresos > 0 ? <span class="neg">gastaste {clp(cmp.difEgresos)} más ▲</span> : <span class="pos">gastaste {clp(-cmp.difEgresos)} menos ▼</span>}
          {" y "}
          {cmp.difIngresos === 0 ? "te entró lo mismo" : cmp.difIngresos > 0 ? <span class="pos">te entró {clp(cmp.difIngresos)} más ▲</span> : <span class="neg">te entró {clp(-cmp.difIngresos)} menos ▼</span>}.
        </p>
      </div>
      <div class="card">
        <h2>Entra y sale por mes</h2>
        <BarsIO label="Ingresos contra egresos de los últimos 6 meses" data={serie.map((p) => ({ etiqueta: nombreMes(p.mes, true), ingresos: p.ingresos, egresos: p.egresos }))} />
      </div>
      <div class="card">
        <h2>En qué se va la plata</h2>
        {gastos.length ? <BarsH label="Gasto por categoría" total={totalG} data={gastos.map((g) => ({ nombre: g.nombre, valor: g.total }))} /> : <span class="small">Sin gastos este mes.</span>}
      </div>
      <div class="card">
        <h2>Ahorro acumulado</h2>
        <Line label="Ahorro acumulado de los últimos 6 meses" data={ahorroAcumulado(serie).map((p) => ({ etiqueta: nombreMes(p.mes, true), valor: p.valor }))} />
        <span class="small">Suma de lo que te sobró (o faltó) cada mes.</span>
      </div>
    </>
  );
}

function Movimientos({ mes, onEdit, onAdd, onImport }: { mes: string; onEdit: (m: Movimiento) => void; onAdd: () => void; onImport: () => void }) {
  const { data } = useApp();
  const list = data.movimientos.filter((m) => mesDe(m.fecha) === mes).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
  const cat = (id: string) => data.categorias.find((c) => c.id === id)?.nombre || "Sin categoría";
  const porDia = new Map<string, Movimiento[]>();
  list.forEach((m) => porDia.set(m.fecha, [...(porDia.get(m.fecha) || []), m]));
  return (
    <>
      <div class="row">
        <button class="btn sm" onClick={onAdd}>
          <Icon name="plus" size={18} /> Agregar
        </button>
        <button class="btn sm ghost" onClick={onImport}>
          <Icon name="upload" size={18} /> Importar cartola (CSV)
        </button>
      </div>
      {!list.length ? (
        <div class="card">
          <Empty text="No hay movimientos este mes." action="Registrar uno" onAction={onAdd} />
        </div>
      ) : (
        [...porDia.entries()].map(([fecha, ms]) => (
          <div class="card" key={fecha} style={{ gap: "0" }}>
            <span class="lbl" style={{ marginBottom: "4px" }}>
              {Number(fecha.slice(8))} de {nombreMes(fecha.slice(0, 7))}
            </span>
            <div class="list">
              {ms.map((m) => (
                <button key={m.id} class="item" style={{ background: "none", border: 0, borderTop: "1px solid var(--line)", textAlign: "left", width: "100%", color: "inherit" }} onClick={() => onEdit(m)} aria-label={`${m.tipo === "egreso" ? "Gasto" : "Ingreso"} de ${clp(m.monto)} en ${cat(m.categoriaId)}. Editar`}>
                  <span class="stack" style={{ gap: "0" }}>
                    <span class="t">{m.nota || cat(m.categoriaId)}</span>
                    <span class="small">
                      {cat(m.categoriaId)}
                      {m.recurrenteId ? " · fijo" : ""}
                      {m.demo ? " · ejemplo" : ""}
                    </span>
                  </span>
                  <span class={`num ${m.tipo === "ingreso" ? "pos" : ""}`} style={{ fontWeight: 600 }}>
                    {m.tipo === "ingreso" ? "+" : "−"}
                    {clp(m.monto)}
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function Presupuestos({ mes, dia }: { mes: string; dia: number }) {
  const { data } = useApp();
  const estados = estadoPresupuestos(data.movimientos, data.presupuestos, data.categorias, mes, dia);
  const tot = presupuestoTotal(estados);
  const gastos = porCategoria(data.movimientos, data.categorias, mes, "egreso");
  const cats = data.categorias.filter((c) => c.tipo === "egreso").sort((a, b) => a.orden - b.orden);
  return (
    <>
      {tot.monto > 0 && (
        <div class="card">
          <div class="between">
            <h2>Total del mes</h2>
            <span class="num">
              {clp(tot.gastado)} de {clp(tot.monto)}
            </span>
          </div>
          <Progress value={tot.pct} color={tot.pct > 100 ? "var(--red)" : "var(--green)"} label={`Presupuesto total: ${Math.round(tot.pct)}% usado`} />
          <span class="small">
            {Math.round(tot.pct)}% usado · va pasado {Math.round(estados[0]?.esperado || 0)}% del mes
          </span>
        </div>
      )}
      <div class="card">
        <h2>Por categoría</h2>
        <p class="small" style={{ margin: 0 }}>
          Escribe cuánto quieres gastar al mes en cada cosa. Vale para todos los meses.
        </p>
        {cats.map((c) => {
          const p = data.presupuestos.find((x) => x.categoriaId === c.id);
          const e = estados.find((x) => x.categoriaId === c.id);
          const g = gastos.find((x) => x.categoriaId === c.id)?.total || 0;
          return (
            <div key={c.id} class="stack" style={{ gap: "6px", paddingTop: "10px", borderTop: "1px solid var(--line)" }}>
              <div class="between">
                <label for={`p-${c.id}`} style={{ fontWeight: 500 }}>
                  {c.nombre}
                </label>
                <input
                  id={`p-${c.id}`}
                  inputMode="numeric"
                  placeholder="Sin límite"
                  value={p ? clp(p.monto) : ""}
                  style={{ width: "130px", minHeight: "44px", textAlign: "right", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 10px" }}
                  onChange={async (ev) => {
                    const raw = (ev.target as HTMLInputElement).value.trim();
                    if (!raw) {
                      if (p) await store.remove("presupuestos", p.id);
                      return;
                    }
                    const v = parseCLP(raw);
                    if (v == null) return toast("No entendí el monto. Escríbelo así: 50.000");
                    await store.put("presupuestos", { id: c.id, categoriaId: c.id, monto: v });
                  }}
                />
              </div>
              {e ? (
                <>
                  <Progress thin value={e.pct} color={colorEstado(e.estado)} label={`${c.nombre}: ${Math.round(e.pct)}% usado`} />
                  <span class="small">
                    {textoEstado(e.estado)} · {clp(e.gastado)} de {clp(e.monto)} ({Math.round(e.pct)}%)
                  </span>
                </>
              ) : (
                g > 0 && <span class="small">Gastado: {clp(g)}</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Fijos() {
  const { data } = useApp();
  const [nuevo, setNuevo] = useState(false);
  const cat = (id: string) => data.categorias.find((c) => c.id === id)?.nombre || "";
  return (
    <>
      <div class="card">
        <h2>Gastos e ingresos fijos</h2>
        <p class="small" style={{ margin: 0 }}>
          Se anotan solos cada mes en su día: arriendo, plan del celular, suscripciones o el sueldo.
        </p>
        {!data.recurrentes.length ? (
          <Empty text="No tienes fijos todavía." action="Agregar un fijo" onAction={() => setNuevo(true)} />
        ) : (
          <div class="list">
            {data.recurrentes.map((r) => (
              <div class="item" key={r.id}>
                <span class="stack" style={{ gap: "0" }}>
                  <span class="t">{r.nombre}</span>
                  <span class="small">
                    {cat(r.categoriaId)} · día {r.dia} · {r.activo ? "activo" : "en pausa"}
                  </span>
                </span>
                <span class={`num ${r.tipo === "ingreso" ? "pos" : ""}`}>{clp(r.monto)}</span>
                <div class="row" style={{ gap: "0" }}>
                  <button class="link" onClick={() => store.put("recurrentes", { ...r, activo: !r.activo })}>
                    {r.activo ? "Pausar" : "Activar"}
                  </button>
                  <button
                    class="icon-btn"
                    aria-label={`Borrar ${r.nombre}`}
                    onClick={async () => {
                      const undo = await store.remove("recurrentes", r.id);
                      toast(`${r.nombre} ya no se repite. Lo anotado antes queda igual.`, undo);
                    }}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {data.recurrentes.length > 0 && (
          <button class="btn sm" onClick={() => setNuevo(true)}>
            <Icon name="plus" size={18} /> Agregar un fijo
          </button>
        )}
      </div>
      {nuevo && (
        <Sheet title="Nuevo fijo" onClose={() => setNuevo(false)}>
          <FijoForm onDone={() => setNuevo(false)} />
        </Sheet>
      )}
    </>
  );
}

function FijoForm({ onDone }: { onDone: () => void }) {
  const { data } = useApp();
  const [tipo, setTipo] = useState<"egreso" | "ingreso">("egreso");
  const cats = data.categorias.filter((c) => c.tipo === tipo);
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [cat, setCat] = useState("");
  const [dia, setDia] = useState("1");
  const hoy = chileNow().date;
  return (
    <form
      class="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const v = parseCLP(monto);
        const d = Number(dia);
        if (!nombre.trim() || !v || !(d >= 1 && d <= 28)) return toast("Falta el nombre, el monto o el día (1 a 28).");
        await store.put("recurrentes", { id: uid(), nombre: nombre.trim(), tipo, monto: v, categoriaId: cat || cats[0].id, dia: d, desde: mesDe(hoy), activo: true });
        await store.runRecurrentes();
        onDone();
        toast(`Listo: ${nombre.trim()} se anota solo el día ${d} de cada mes.`);
      }}
    >
      <div class="seg">
        <button type="button" class={tipo === "egreso" ? "on" : ""} onClick={() => (setTipo("egreso"), setCat(""))}>
          Gasto
        </button>
        <button type="button" class={tipo === "ingreso" ? "on" : ""} onClick={() => (setTipo("ingreso"), setCat(""))}>
          Ingreso
        </button>
      </div>
      <div class="field">
        <label class="lbl" for="fj-n">
          Nombre
        </label>
        <input id="fj-n" maxLength={40} value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} placeholder="Plan del celular" />
      </div>
      <div class="grid2">
        <div class="field">
          <label class="lbl" for="fj-m">
            Monto
          </label>
          <input id="fj-m" inputMode="numeric" value={monto} onInput={(e) => setMonto((e.target as HTMLInputElement).value)} placeholder="25.000" />
        </div>
        <div class="field">
          <label class="lbl" for="fj-d">
            Día del mes
          </label>
          <input id="fj-d" inputMode="numeric" value={dia} onInput={(e) => setDia((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      <div class="chips">
        {cats.map((c) => (
          <button type="button" key={c.id} class={(cat || cats[0]?.id) === c.id ? "on" : ""} onClick={() => setCat(c.id)}>
            {c.nombre}
          </button>
        ))}
      </div>
      <button class="btn main full">Guardar fijo</button>
    </form>
  );
}

function ImportarCSV({ onClose }: { onClose: () => void }) {
  const { data } = useApp();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Mapeo>({ fecha: 0, descripcion: 1, monto: 2, saltarPrimera: true });
  const [modo, setModo] = useState<"uno" | "dos">("uno");
  const res = rows ? mapear(rows, modo === "uno" ? { ...map, cargo: undefined, abono: undefined } : { ...map, monto: undefined }) : null;
  const cols = rows?.[0]?.map((c, i) => ({ i, name: map.saltarPrimera ? c || `Columna ${i + 1}` : `Columna ${i + 1}` })) || [];
  const pick = (k: keyof Mapeo, label: string) => (
    <div class="field">
      <label class="lbl">{label}</label>
      <select value={String(map[k] ?? "")} onChange={(e) => setMap({ ...map, [k]: Number((e.target as HTMLSelectElement).value) })}>
        {cols.map((c) => (
          <option key={c.i} value={c.i}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <Sheet title="Importar cartola" onClose={onClose}>
      <p class="small" style={{ margin: 0 }}>
        Descarga los movimientos de tu banco en CSV o Excel guardado como CSV. El archivo se lee aquí mismo y no sale del teléfono. Nunca te voy a pedir claves del banco.
      </p>
      {!rows ? (
        <label class="btn main full">
          Elegir archivo CSV
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={async (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (!f) return;
              const r = parseCSV(await f.text());
              if (!r.length) return toast("Ese archivo está vacío.");
              setRows(r);
              setMap({ fecha: 0, descripcion: Math.min(1, r[0].length - 1), monto: Math.min(2, r[0].length - 1), cargo: Math.min(2, r[0].length - 1), abono: Math.min(3, r[0].length - 1), saltarPrimera: true });
            }}
          />
        </label>
      ) : (
        <>
          <label class="row" style={{ minHeight: "44px" }}>
            <input type="checkbox" checked={map.saltarPrimera} onChange={(e) => setMap({ ...map, saltarPrimera: (e.target as HTMLInputElement).checked })} style={{ width: "22px", height: "22px" }} />
            La primera fila son los títulos
          </label>
          {pick("fecha", "Columna de la fecha")}
          {pick("descripcion", "Columna de la descripción")}
          <div class="seg">
            <button class={modo === "uno" ? "on" : ""} onClick={() => setModo("uno")}>
              Un monto con signo
            </button>
            <button class={modo === "dos" ? "on" : ""} onClick={() => setModo("dos")}>
              Cargo y abono separados
            </button>
          </div>
          {modo === "uno" ? pick("monto", "Columna del monto (negativo = gasto)") : [pick("cargo", "Columna de cargos (gastos)"), pick("abono", "Columna de abonos (ingresos)")]}
          {res && (
            <div class="card">
              <span>
                Se importarán <b>{res.ok.length}</b> movimientos{res.malas ? ` (${res.malas} filas no se entendieron y se saltan)` : ""}.
              </span>
              {res.ok.slice(0, 3).map((x, i) => (
                <span class="small" key={i}>
                  {x.fecha} · {x.descripcion} · {x.tipo === "egreso" ? "−" : "+"}
                  {clp(x.monto)}
                </span>
              ))}
              <span class="small">Quedan en «Otros» y después les cambias la categoría.</span>
            </div>
          )}
          <button
            class="btn main full"
            disabled={!res?.ok.length}
            onClick={async () => {
              const otrosE = data.categorias.find((c) => c.id === "c-otros")?.id || data.categorias.find((c) => c.tipo === "egreso")!.id;
              const otrosI = data.categorias.find((c) => c.id === "i-otros")?.id || data.categorias.find((c) => c.tipo === "ingreso")!.id;
              const movs: Movimiento[] = res!.ok.map((x, i) => ({ id: `csv-${Date.now().toString(36)}-${i}`, tipo: x.tipo, monto: x.monto, categoriaId: x.tipo === "egreso" ? otrosE : otrosI, fecha: x.fecha, nota: x.descripcion, creado: Date.now() }));
              await store.put("movimientos", ...movs);
              onClose();
              toast(`Importé ${movs.length} movimientos.`, async () => void (await store.remove("movimientos", ...movs.map((m) => m.id))));
            }}
          >
            Importar
          </button>
        </>
      )}
    </Sheet>
  );
}
