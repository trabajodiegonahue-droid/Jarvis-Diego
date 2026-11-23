// La ficha de la mascota: cuándo salió, comió o hizo caca, el veterinario y cuántas horas lleva sin salir.
import { useState } from "preact/hooks";
import { getNombreMascota } from "../../areas/calc";
import { fechaCorta } from "../../core/dates";
import { hhmm } from "../../core/texto";
import { chileNow } from "../../core/time";
import { store } from "../../data/store";
import { uid, type Nota } from "../../data/types";
import { eventosMascota, minutosSinSalir, porDia, ultimo, type TipoMascota } from "../../mascota/calc";
import { Bars } from "../charts";
import { Empty } from "../components";
import { Icon } from "../icons";
import { go, toast, useApp } from "../state";

const NOMBRE: Record<TipoMascota, string> = { paseo: "Paseo", comida: "Comida", caca: "Caca / pipí", salud: "Veterinario", bano: "Baño", otro: "Otro" };

export function Mascota() {
  const { data, prefs } = useApp();
  const n = chileNow();
  const hoy = n.date;
  const nombre = prefs.mascota || getNombreMascota() || "Tu mascota";
  const ev = eventosMascota(data.notas);
  const sin = minutosSinSalir(ev, `${hoy}T${hhmm(n.minutes)}`);
  const [nuevo, setNuevo] = useState("");
  const anotar = async (texto: string) => {
    const t = texto.trim();
    if (!t) return;
    const nota: Nota = { id: uid(), fecha: `${hoy}T${hhmm(chileNow().minutes)}`, area: "mascota", texto: t, origen: "app" };
    await store.put("notas", nota);
    toast(`Anotado: ${t.toLowerCase()}.`, () => void store.remove("notas", nota.id));
  };
  const cuando = (f: string) => (f.startsWith(hoy) ? `hoy ${f.slice(11)}` : `${fechaCorta(f.slice(0, 10))} ${f.slice(11)}`);
  return (
    <main class="page">
      <header class="head">
        <button class="icon-btn" aria-label="Volver" onClick={() => history.back()}>
          <Icon name="izq" />
        </button>
        <h1 style={{ flex: 1 }}>{nombre}</h1>
        <span class="ico" style={{ background: "var(--t2)", width: "36px", height: "36px", borderRadius: "10px", display: "grid", placeItems: "center", color: "#fff" }} aria-hidden="true">
          <Icon name="pata" size={20} />
        </span>
      </header>
      {!prefs.mascota && (
        <div class="card">
          <span class="small">Ponle el nombre en Más › Ajustes › Tu mascota (o dile a JARVIS "mi perro se llama…").</span>
        </div>
      )}
      {sin != null && (
        <div class="card" style={{ borderColor: sin >= 480 ? "var(--amber)" : "var(--line)" }}>
          <span class="lbl">Última salida</span>
          <strong style={{ fontSize: "22px" }}>{sin < 60 ? `hace ${sin} min` : `hace ${Math.floor(sin / 60)} h ${sin % 60 ? `${sin % 60} min` : ""}`}</strong>
          {sin >= 480 && <span class="small" style={{ color: "var(--amber)" }}>Lleva harto sin salir. ¿Lo sacas un rato?</span>}
        </div>
      )}
      <div class="chips">
        {[
          ["Lo saqué a pasear", "paseo"],
          ["Comió", "comida"],
          ["Hizo caca", "caca"],
          ["Le di agua", "comida"],
        ].map(([t]) => (
          <button key={t} onClick={() => anotar(t)}>
            {t}
          </button>
        ))}
      </div>
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          void anotar(nuevo);
          setNuevo("");
        }}
      >
        <input aria-label={`Anotar algo de ${nombre}`} placeholder={`Algo de ${nombre}: vacuna, veterinario…`} value={nuevo} onInput={(e) => setNuevo((e.target as HTMLInputElement).value)} style={{ flex: 1, minWidth: 0, minHeight: "48px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--card2)", color: "var(--ink)", padding: "0 14px" }} />
        <button class="btn main" aria-label="Anotar">
          <Icon name="plus" size={20} />
        </button>
      </form>
      <div class="kpis dos">
        {(["paseo", "comida", "caca", "salud"] as TipoMascota[]).map((t) => {
          const u = ultimo(ev, t);
          return (
            <div key={t} class="kpi">
              <span class="lbl">{NOMBRE[t]}</span>
              <strong style={{ fontSize: "16px" }}>{u ? cuando(u.nota.fecha) : "—"}</strong>
            </div>
          );
        })}
      </div>
      <div class="card">
        <span class="lbl">Paseos de la semana</span>
        <Bars data={porDia(ev, "paseo", hoy, 7)} label={`Paseos de ${nombre} por día, últimos 7 días`} color="var(--t2)" />
      </div>
      <div class="card">
        <span class="lbl">Todo lo de {nombre}</span>
        {!ev.length ? (
          <Empty text={`Cuéntale a JARVIS: "saqué a ${nombre}", "${nombre} comió", "lo llevé al veterinario".`} />
        ) : (
          ev.slice(0, 40).map((e) => (
            <div key={e.nota.id} class="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <div class="stack" style={{ gap: "2px" }}>
                <span>{e.nota.texto}</span>
                <span class="small">
                  {cuando(e.nota.fecha)} · {e.pendiente ? "pendiente" : NOMBRE[e.tipo]}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      <button class="btn full" onClick={() => go("/mas/recordatorios")}>
        Recordatorios de {nombre}
      </button>
    </main>
  );
}
