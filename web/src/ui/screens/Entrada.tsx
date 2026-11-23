// Bienvenida (3 pasos) y pantalla de bloqueo con PIN.
import { useState } from "preact/hooks";
import { checkPin } from "../../core/pin";
import { chileNow } from "../../core/time";
import { datosEjemplo } from "../../data/demo";
import { pedirPersistencia } from "../../data/backup";
import { store } from "../../data/store";
import { nombreMes, sumarMeses } from "../../money/calc";
import { AREAS, kv, setPrefs } from "../state";

export function Bienvenida() {
  const hoy = chileNow().date;
  const mes = hoy.slice(0, 7);
  const [paso, setPaso] = useState(1);
  const [areas, setAreas] = useState<string[]>(AREAS.map((a) => a.id));
  const [inicio, setInicio] = useState(mes);
  const [ejemplo, setEjemplo] = useState(false);
  const meses = [0, -1, -2].map((n) => sumarMeses(mes, n));

  async function listo() {
    if (ejemplo) {
      const d = datosEjemplo(hoy);
      for (const k of Object.keys(d) as (keyof typeof d)[]) if (d[k]?.length) await store.put(k, ...(d[k] as any[]));
    }
    void pedirPersistencia();
    setPrefs({ onboarded: true, areas, startMonth: inicio });
  }

  return (
    <main class="page" style={{ paddingTop: "calc(env(safe-area-inset-top) + 48px)", gap: "20px" }}>
      <span class="sub" aria-live="polite">
        Paso {paso} de 3
      </span>
      {paso === 1 && (
        <>
          <h1 style={{ margin: 0, fontSize: "30px" }}>Hola, Diego. ¿Qué quieres seguir?</h1>
          <p class="sub" style={{ margin: 0 }}>
            Puedes cambiarlo después en Ajustes.
          </p>
          <div class="chips">
            {AREAS.map((a) => {
              const on = areas.includes(a.id);
              return (
                <button key={a.id} class={on ? "on" : ""} aria-pressed={on} onClick={() => setAreas(on ? areas.filter((x) => x !== a.id) : [...areas, a.id])}>
                  {a.nombre}
                </button>
              );
            })}
          </div>
          <button class="btn main full" disabled={!areas.length} onClick={() => setPaso(2)}>
            Seguir
          </button>
        </>
      )}
      {paso === 2 && (
        <>
          <h1 style={{ margin: 0, fontSize: "30px" }}>¿Desde qué mes partimos?</h1>
          <div class="seg">
            {meses.map((m) => (
              <button key={m} class={inicio === m ? "on" : ""} aria-pressed={inicio === m} onClick={() => setInicio(m)}>
                {nombreMes(m)[0].toUpperCase() + nombreMes(m).slice(1)}
              </button>
            ))}
          </div>
          <label class="card" style={{ flexDirection: "row", alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={ejemplo} onChange={(e) => setEjemplo((e.target as HTMLInputElement).checked)} style={{ width: "22px", height: "22px" }} />
            <span>
              Cargar datos de ejemplo para ver cómo se ve
              <br />
              <span class="small">Se borran con un toque cuando quieras.</span>
            </span>
          </label>
          <div class="grid2">
            <button class="btn" onClick={() => setPaso(1)}>
              Atrás
            </button>
            <button class="btn main" onClick={() => setPaso(3)}>
              Seguir
            </button>
          </div>
        </>
      )}
      {paso === 3 && (
        <>
          <h1 style={{ margin: 0, fontSize: "30px" }}>Listo.</h1>
          <p style={{ margin: 0 }}>Toca + para anotar un gasto o un ingreso, y el botón verde para hablar con JARVIS.</p>
          <p class="sub" style={{ margin: 0 }}>
            Todo se guarda solo en este teléfono. Te voy a recordar guardar un respaldo de vez en cuando.
          </p>
          <button class="btn main full" onClick={listo}>
            Empezar
          </button>
        </>
      )}
    </main>
  );
}

export function Bloqueo({ onOpen }: { onOpen: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  async function tecla(k: string) {
    setErr(false);
    const p = k === "←" ? pin.slice(0, -1) : (pin + k).slice(0, 6);
    setPin(p);
    if (p.length >= 4 && (await checkPin(kv, p))) onOpen();
    else if (p.length === 6) {
      setErr(true);
      setPin("");
    }
  }
  return (
    <main class="pin">
      <h1 style={{ margin: 0, fontSize: "22px" }}>Ingresa tu PIN</h1>
      <div class="dots" aria-label={`${pin.length} números escritos`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => i).map((i) => (
          <i key={i} class={i < pin.length ? "on" : ""} />
        ))}
      </div>
      <p class="small" role="alert" style={{ margin: 0, minHeight: "18px", color: err ? "var(--red)" : undefined }}>
        {err ? "PIN incorrecto." : ""}
      </p>
      <div class="keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map((k, i) =>
          k ? (
            <button key={i} onClick={() => tecla(k)} aria-label={k === "←" ? "Borrar" : k}>
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </main>
  );
}
