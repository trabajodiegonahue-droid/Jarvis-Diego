// El botón +: registrar plata, un turno, una sesión de estudio o el avance de una meta.
import { useState } from "preact/hooks";
import { chileNow } from "../../core/time";
import { store } from "../../data/store";
import { uid } from "../../data/types";
import { avance } from "../../goals/calc";
import { fmtValor } from "../../goals/format";
import { parseCLP } from "../../money/format";
import { parseDecimal } from "../../study/calc";
import { Empty, MovimientoForm } from "../components";
import { go, toast, useApp } from "../state";
import { SesionForm } from "./Estudios";
import { TurnoForm } from "./Trabajo";
import { PartidoForm } from "./Futbol";
import { sinRegistrar } from "../../futbol/calc";

type Que = "plata" | "turno" | "estudio" | "meta" | "entreno" | "partido";

export function Registrar({ onDone }: { onDone: () => void }) {
  const [que, setQue] = useState<Que>("plata");
  return (
    <>
      <div class="seg" role="tablist" aria-label="Qué registrar" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "6px" }}>
        {(["plata", "entreno", "partido", "turno", "estudio", "meta"] as Que[]).map((q) => (
          <button key={q} role="tab" aria-selected={que === q} class={que === q ? "on" : ""} onClick={() => setQue(q)}>
            {{ plata: "Plata", turno: "Turno", estudio: "Estudio", meta: "Meta", entreno: "Entreno", partido: "Partido" }[q]}
          </button>
        ))}
      </div>
      {que === "plata" && <MovimientoForm onDone={onDone} />}
      {que === "turno" && <TurnoForm onDone={onDone} />}
      {que === "estudio" && <SesionForm onDone={onDone} />}
      {que === "meta" && <AvanceMeta onDone={onDone} />}
      {que === "partido" && <PartidoForm partido={sinRegistrar(store.data.partidos, chileNow().date).slice(-1)[0]} onDone={onDone} />}
      {que === "entreno" && (
        <Empty
          text={store.data.planes.length ? "El entreno se registra serie por serie en Fútbol → Físico → Entrenar hoy." : "Primero arma tu rutina en Fútbol → Físico."}
          action="Ir a Físico"
          onAction={() => {
            onDone();
            go("/futbol?fisico");
          }}
        />
      )}
    </>
  );
}

function AvanceMeta({ onDone }: { onDone: () => void }) {
  const { data } = useApp();
  const hoy = chileNow().date;
  // Solo las metas que se anotan a mano (las automáticas se llenan solas).
  const metas = data.metas.filter((m) => !m.archivada && avance(m, data, hoy).estado !== "cumplida" && (m.tipo === "habito" || ((m.tipo === "monto" || m.tipo === "cantidad") && m.fuente === "manual")));
  const [id, setId] = useState(metas[0]?.id || "");
  const [valor, setValor] = useState("");
  const m = metas.find((x) => x.id === id);
  if (!metas.length)
    return (
      <Empty
        text="No tienes metas que se anoten a mano. Las de ahorro y horas se llenan solas."
        action="Ir a Metas"
        onAction={() => {
          onDone();
          go("/metas");
        }}
      />
    );
  return (
    <form
      class="stack"
      style={{ gap: "16px" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!m) return;
        const v = m.tipo === "habito" ? 1 : m.tipo === "monto" ? parseCLP(valor) : parseDecimal(valor);
        if (v == null || !Number.isFinite(v) || v <= 0) return toast("Escribe cuánto avanzaste.");
        if (m.tipo === "habito" && data.aportes.some((a) => a.metaId === m.id && a.fecha === hoy)) return toast("Hoy ya está anotado.");
        const ap = { id: uid(), metaId: m.id, fecha: hoy, valor: v };
        await store.put("aportes", ap);
        onDone();
        toast(m.tipo === "habito" ? `${m.nombre}: hoy cumplido.` : `${m.nombre}: +${fmtValor(m, v)}.`, async () => void (await store.remove("aportes", ap.id)));
      }}
    >
      <div class="chips">
        {metas.map((x) => (
          <button type="button" key={x.id} class={id === x.id ? "on" : ""} aria-pressed={id === x.id} onClick={() => setId(x.id)}>
            {x.nombre}
          </button>
        ))}
      </div>
      {m && m.tipo !== "habito" && (
        <div class="field">
          <label class="lbl" for="av-v">
            Cuánto avanzaste{m.unidad ? ` (${m.unidad})` : ""}
          </label>
          <input id="av-v" class="amount" inputMode="decimal" value={valor} onInput={(e) => setValor((e.target as HTMLInputElement).value)} placeholder={m.tipo === "monto" ? "$0" : "0"} />
        </div>
      )}
      <button class="btn main full">{m?.tipo === "habito" ? "Hoy lo hice" : "Sumar"}</button>
    </form>
  );
}
