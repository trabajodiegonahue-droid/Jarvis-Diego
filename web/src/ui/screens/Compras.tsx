// Lista de compras: se llena hablando ("agrega pan y leche a la lista") o escribiendo, y se tacha con un toque.
import { useState } from "preact/hooks";
import { store } from "../../data/store";
import { uid, type Compra } from "../../data/types";
import { Empty } from "../components";
import { Icon } from "../icons";
import { toast, useApp } from "../state";

export function Compras() {
  const { data } = useApp();
  const [txt, setTxt] = useState("");
  const pend = data.compras.filter((c) => !c.hecho).sort((a, b) => a.creado - b.creado);
  const hechas = data.compras.filter((c) => c.hecho).sort((a, b) => b.creado - a.creado);

  async function agregar(e: Event) {
    e.preventDefault();
    const cosas = txt
      .split(/\s*(?:,|\by\b)\s*/i)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!cosas.length) return;
    const ya = new Set(pend.map((c) => c.texto.toLowerCase()));
    const nuevas: Compra[] = cosas.filter((c) => !ya.has(c.toLowerCase())).map((c, i) => ({ id: uid(), texto: c.charAt(0).toUpperCase() + c.slice(1), hecho: false, creado: Date.now() + i }));
    if (nuevas.length) await store.put("compras", ...nuevas);
    setTxt("");
  }

  return (
    <main class="page">
      <header class="head">
        <h1>Compras</h1>
        {hechas.length > 0 && (
          <button
            class="btn sm"
            onClick={async () => {
              const u = await store.remove("compras", ...hechas.map((c) => c.id));
              toast("Limpié lo comprado.", () => void u());
            }}
          >
            Limpiar
          </button>
        )}
      </header>
      <form class="card" onSubmit={agregar} style={{ gap: "8px" }}>
        <div class="row">
          <input aria-label="Agregar a la lista" placeholder="Pan, leche y huevos" value={txt} onInput={(e) => setTxt((e.target as HTMLInputElement).value)} style={{ flex: 1, minHeight: "48px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 14px" }} />
          <button class="btn main" aria-label="Agregar">
            <Icon name="plus" size={20} />
          </button>
        </div>
        <span class="small">O dile a JARVIS: "agrega pan y leche a la lista", "¿qué hay en la lista?", "compré el pan".</span>
      </form>
      <div class="card">
        {!pend.length ? (
          <Empty text="La lista está vacía." />
        ) : (
          pend.map((c) => (
            <label key={c.id} class="row" style={{ minHeight: "48px", borderTop: "1px solid var(--line)" }}>
              <input type="checkbox" checked={false} onChange={() => store.put("compras", { ...c, hecho: true })} style={{ width: "24px", height: "24px" }} aria-label={`Comprado: ${c.texto}`} />
              <span style={{ fontSize: "16px" }}>{c.texto}</span>
            </label>
          ))
        )}
      </div>
      {hechas.length > 0 && (
        <div class="card">
          <h2>Comprado</h2>
          {hechas.slice(0, 15).map((c) => (
            <label key={c.id} class="row" style={{ minHeight: "44px" }}>
              <input type="checkbox" checked onChange={() => store.put("compras", { ...c, hecho: false })} style={{ width: "22px", height: "22px" }} aria-label={`Volver a la lista: ${c.texto}`} />
              <span style={{ textDecoration: "line-through", color: "var(--muted)" }}>{c.texto}</span>
            </label>
          ))}
        </div>
      )}
    </main>
  );
}
