import type { ComponentChildren } from "preact";
import { useErrorBoundary, useEffect, useRef, useState } from "preact/hooks";
import { chileNow } from "../core/time";
import { store } from "../data/store";
import { uid, type Movimiento, type Tipo } from "../data/types";
import { clp, parseCLP } from "../money/format";
import { Icon } from "./icons";
import { closeToast, toast, useToast } from "./state";

// Si algo falla dentro de una pantalla u hoja, se muestra un aviso amable y el resto de la app sigue.
export function Seguro({ children, onVolver, pagina }: { children: ComponentChildren; onVolver?: () => void; pagina?: boolean }) {
  const [err, reset] = useErrorBoundary((e) => console.error(e));
  if (!err) return <>{children}</>;
  const aviso = (
    <div class="card" role="alert">
      <h2>Esta parte tuvo un problema</h2>
      <p class="small" style={{ margin: 0 }}>
        Tus datos están bien guardados. Prueba de nuevo y, si se repite, cuéntame qué estabas haciendo.
      </p>
      <div class="row">
        <button class="btn sm main" onClick={() => reset()}>
          Probar de nuevo
        </button>
        {onVolver && (
          <button
            class="btn sm"
            onClick={() => {
              reset();
              onVolver();
            }}
          >
            Volver
          </button>
        )}
      </div>
    </div>
  );
  return pagina ? <main class="page">{aviso}</main> : aviso;
}

export function Sheet({ title, onClose, children, full }: { title: string; onClose: () => void; children: ComponentChildren; full?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Accesibilidad: el foco entra a la hoja, Tab no se escapa hacia atrás y al cerrar vuelve a donde estaba.
    const antes = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute("disabled"));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
      antes?.focus?.();
    };
  }, []);
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={full ? "sheet full" : "sheet"} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1} style={{ outline: "none" }}>
        <div class="grab" />
        <div class="between">
          <h2 style={{ margin: 0, fontSize: "20px" }}>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        <Seguro onVolver={onClose}>{children}</Seguro>
      </div>
    </div>
  );
}

export function Empty({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div class="empty">
      <p>{text}</p>
      {action && (
        <button class="btn sm" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export function Toast() {
  const t = useToast();
  if (!t) return null;
  return (
    <div class="toast" role="status" key={t.id}>
      <span>{t.text}</span>
      {t.undo ? (
        <button
          onClick={() => {
            t.undo!();
            closeToast();
          }}
        >
          Deshacer
        </button>
      ) : (
        <span style={{ width: "6px" }} />
      )}
    </div>
  );
}

// Registrar un gasto o ingreso en menos de 10 segundos: monto, categoría, guardar.
export function MovimientoForm({ tipo: tipo0 = "egreso", mov, onDone }: { tipo?: Tipo; mov?: Movimiento; onDone: () => void }) {
  const hoy = chileNow().date;
  const [tipo, setTipo] = useState<Tipo>(mov?.tipo || tipo0);
  const [monto, setMonto] = useState(mov ? String(mov.monto) : "");
  const [cat, setCat] = useState(mov?.categoriaId || "");
  const [fecha, setFecha] = useState(mov?.fecha || hoy);
  const [nota, setNota] = useState(mov?.nota || "");
  const [fijo, setFijo] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!mov) ref.current?.focus();
  }, []);
  const cats = store.data.categorias.filter((c) => c.tipo === tipo).sort((a, b) => a.orden - b.orden);
  const valor = parseCLP(monto);

  async function guardar(e: Event) {
    e.preventDefault();
    if (!valor) return setErr("Escribe el monto, por ejemplo 5.000.");
    const categoriaId = cat || cats[0]?.id;
    if (!categoriaId) return setErr("Elige una categoría.");
    const m: Movimiento = { id: mov?.id || uid(), tipo, monto: valor, categoriaId, fecha, nota: nota.trim() || undefined, creado: mov?.creado || Date.now(), ...(mov?.recurrenteId ? { recurrenteId: mov.recurrenteId } : {}) };
    if (fijo && !mov) {
      const rid = uid();
      await store.put("recurrentes", { id: rid, nombre: nota.trim() || store.data.categorias.find((c) => c.id === categoriaId)?.nombre || "Fijo", tipo, monto: valor, categoriaId, dia: Math.min(28, Number(fecha.slice(8, 10))), desde: fecha.slice(0, 7), activo: true });
      m.id = `rec:${rid}:${fecha.slice(0, 7)}`;
      m.recurrenteId = rid;
    }
    await store.put("movimientos", m);
    const nombre = store.data.categorias.find((c) => c.id === categoriaId)?.nombre.toLowerCase() || "";
    onDone();
    if (mov) toast("Cambio guardado.");
    else
      toast(`${tipo === "egreso" ? "Gasto" : "Ingreso"} de ${clp(valor)} en ${nombre} guardado.`, async () => {
        await store.remove("movimientos", m.id);
        if (m.recurrenteId && fijo) await store.remove("recurrentes", m.recurrenteId);
      });
  }

  return (
    <form class="stack" style={{ gap: "16px" }} onSubmit={guardar}>
      <div class="seg" role="group" aria-label="Tipo">
        <button type="button" class={tipo === "egreso" ? "on" : ""} aria-pressed={tipo === "egreso"} onClick={() => (setTipo("egreso"), setCat(""))}>
          Gasto
        </button>
        <button type="button" class={tipo === "ingreso" ? "on" : ""} aria-pressed={tipo === "ingreso"} onClick={() => (setTipo("ingreso"), setCat(""))}>
          Ingreso
        </button>
      </div>
      <div class="field">
        <label class="lbl" for="f-monto">
          Monto
        </label>
        <input ref={ref} id="f-monto" class="amount" inputMode="numeric" placeholder="$0" value={monto} onInput={(e) => (setMonto((e.target as HTMLInputElement).value), setErr(""))} aria-describedby="f-monto-v" />
        <span id="f-monto-v" class="small" style={{ textAlign: "center" }}>
          {valor ? clp(valor) : "Puedes escribir 5000, 5.000 o 5 mil"}
        </span>
      </div>
      <div class="field">
        <span class="lbl">{tipo === "egreso" ? "Categoría" : "De dónde viene"}</span>
        <div class="chips">
          {cats.map((c) => {
            const on = (cat || cats[0]?.id) === c.id;
            return (
              <button type="button" key={c.id} class={on ? "on" : ""} aria-pressed={on} onClick={() => setCat(c.id)}>
                {c.nombre}
              </button>
            );
          })}
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label class="lbl" for="f-fecha">
            Fecha
          </label>
          <input id="f-fecha" type="date" value={fecha} max={hoy} onInput={(e) => setFecha((e.target as HTMLInputElement).value || hoy)} />
        </div>
        <div class="field">
          <label class="lbl" for="f-nota">
            Nota (opcional)
          </label>
          <input id="f-nota" maxLength={80} value={nota} onInput={(e) => setNota((e.target as HTMLInputElement).value)} placeholder={tipo === "egreso" ? "Supermercado" : "Turno del sábado"} />
        </div>
      </div>
      {!mov && (
        <label class="row" style={{ minHeight: "44px" }}>
          <input type="checkbox" checked={fijo} onChange={(e) => setFijo((e.target as HTMLInputElement).checked)} style={{ width: "22px", height: "22px" }} />
          <span>Se repite todos los meses (gasto o ingreso fijo)</span>
        </label>
      )}
      {err && (
        <p class="neg" role="alert" style={{ margin: 0 }}>
          {err}
        </p>
      )}
      <button class="btn main full">{mov ? "Guardar cambio" : "Guardar"}</button>
    </form>
  );
}
