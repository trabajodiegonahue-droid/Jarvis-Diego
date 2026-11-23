// Mi vida por áreas: un bloque por área (salud, ánimo, dinero, amor…) con su dato al día
// y lo último que le contaste a JARVIS. Tocas un bloque y ves todo lo de esa área.
import { useEffect, useState } from "preact/hooks";
import { area, AREAS_VIDA, clasificarArea, estadoArea, type AreaVida } from "../../areas/calc";
import { fechaCorta } from "../../core/dates";
import { hhmm } from "../../core/texto";
import { chileNow } from "../../core/time";
import { store } from "../../data/store";
import { uid, type Nota } from "../../data/types";
import { Empty } from "../components";
import { Icon } from "../icons";
import { go, toast, useApp } from "../state";

const cuando = (iso: string, hoy: string) => (iso.startsWith(hoy) ? `hoy ${iso.slice(11)}` : fechaCorta(iso.slice(0, 10)));
const RUTA: Partial<Record<AreaVida, string>> = { dinero: "/dinero", entreno: "/mas/cardio", mascota: "/mas/mascota", futbol: "/futbol", estudios: "/mas/estudios", trabajo: "/mas/trabajo", salud: "/mas/habitos", animo: "/mas/habitos", casa: "/mas/compras", metas: "/metas", social: "/mas/recordatorios" };

export function Areas() {
  const { data } = useApp();
  const hoy = chileNow().date;
  // El área elegida va en la dirección (#/areas?a=salud), así el botón atrás del teléfono funciona.
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  const sel = (hash.match(/[?&]a=(\w+)/) || [])[1] as AreaVida | undefined;
  if (sel && AREAS_VIDA.some((a) => a.id === sel)) return <DetalleArea id={sel} />;
  // Las áreas con algo primero (lo más reciente arriba); las vacías al final.
  const orden = AREAS_VIDA.map((a) => ({ a, e: estadoArea(a.id, data, hoy) })).sort((x, y) => Number(!!(y.e.dato || y.e.notas.length)) - Number(!!(x.e.dato || x.e.notas.length)) || (y.e.notas[0]?.fecha || "").localeCompare(x.e.notas[0]?.fecha || ""));
  return (
    <main class="page">
      <header class="head">
        <h1>Mi vida</h1>
      </header>
      <p class="sub" style={{ margin: "-6px 0 0" }}>
        Todo lo que le cuentas a JARVIS queda en su área. Toca un bloque para ver su historia.
      </p>
      <NuevaNota />
      <div class="areas-grid">
        {orden.map(({ a, e }) => (
          <button key={a.id} class="card area-card" onClick={() => go(`/areas?a=${a.id}`)} aria-label={`${a.nombre}${e.dato ? `: ${e.dato}` : ""}`}>
            <span class="row" style={{ gap: "8px" }}>
              <span class="ico" style={{ background: a.color }} aria-hidden="true">
                <Icon name={a.icono} size={16} />
              </span>
              <strong style={{ fontSize: "15px" }}>{a.nombre}</strong>
            </span>
            {e.dato && <span class="small" style={{ color: "var(--ink)" }}>{e.dato}</span>}
            {e.notas[0] ? (
              <span class="small area-ultima">“{e.notas[0].texto}”</span>
            ) : (
              !e.dato && <span class="small">Nada todavía.</span>
            )}
          </button>
        ))}
      </div>
    </main>
  );
}

function NuevaNota({ fija }: { fija?: AreaVida }) {
  const [txt, setTxt] = useState("");
  return (
    <form
      class="row"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = txt.trim();
        if (!t) return;
        const n = chileNow();
        const nota: Nota = { id: uid(), fecha: `${n.date}T${hhmm(n.minutes)}`, area: fija || clasificarArea(t), texto: t, origen: "app" };
        await store.put("notas", nota);
        setTxt("");
        toast(`Guardado en ${area(nota.area).nombre}.`, () => void store.remove("notas", nota.id));
      }}
    >
      <input aria-label="Contar algo" placeholder={fija ? `Algo de ${area(fija).nombre.toLowerCase()}` : "Cuéntame algo: me duele la rodilla, salí con la polola…"} value={txt} onInput={(e) => setTxt((e.target as HTMLInputElement).value)} style={{ flex: 1, minHeight: "48px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 14px" }} />
      <button class="btn main" aria-label="Guardar">
        <Icon name="plus" size={20} />
      </button>
    </form>
  );
}

function DetalleArea({ id }: { id: AreaVida }) {
  const { data } = useApp();
  const hoy = chileNow().date;
  const a = area(id);
  const e = estadoArea(id, data, hoy);
  const [mover, setMover] = useState<Nota | null>(null);
  return (
    <main class="page">
      <header class="head">
        <button class="icon-btn" aria-label="Volver a Mi vida" onClick={() => go("/areas")}>
          <Icon name="izq" />
        </button>
        <h1 style={{ flex: 1 }}>{a.nombre}</h1>
        <span class="ico" style={{ background: a.color, width: "36px", height: "36px", borderRadius: "10px", display: "grid", placeItems: "center", color: "#fff" }} aria-hidden="true">
          <Icon name={a.icono} size={20} />
        </span>
      </header>
      {(e.dato || RUTA[id]) && (
        <div class="card" style={{ gap: "6px" }}>
          <span class="lbl">Al día</span>
          <span style={{ fontSize: "16px", fontWeight: 600 }}>{e.dato || "Sin datos todavía."}</span>
          {RUTA[id] && (
            <a href={`#${RUTA[id]}`} class="small" style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}>
              Ver el detalle ›
            </a>
          )}
        </div>
      )}
      <NuevaNota fija={id} />
      <div class="card">
        <span class="lbl">Lo que has contado</span>
        {!e.notas.length ? (
          <Empty text={`Todavía no hay nada en ${a.nombre.toLowerCase()}. Cuéntaselo a JARVIS o escríbelo arriba.`} />
        ) : (
          e.notas.map((n) => (
            <div key={n.id} class="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <div class="stack" style={{ gap: "2px" }}>
                <span>{n.texto}</span>
                <span class="small">
                  {cuando(n.fecha, hoy)} · {n.origen === "siri" ? "por Siri" : n.origen === "app" ? "escrito" : "a JARVIS"}
                  {n.registro ? " · anotado" : ""}
                </span>
              </div>
              <button class="icon-btn" aria-label={`Opciones: ${n.texto}`} onClick={() => setMover(mover?.id === n.id ? null : n)}>
                <Icon name="mas" size={18} />
              </button>
              {mover?.id === n.id && (
                <div class="chips" style={{ gridColumn: "1 / -1" }}>
                  {AREAS_VIDA.filter((x) => x.id !== id).map((x) => (
                    <button
                      key={x.id}
                      onClick={async () => {
                        await store.put("notas", { ...n, area: x.id });
                        setMover(null);
                        toast(`Movido a ${x.nombre}.`, () => void store.put("notas", n));
                      }}
                    >
                      → {x.nombre}
                    </button>
                  ))}
                  <button
                    onClick={async () => {
                      const u = await store.remove("notas", n.id);
                      setMover(null);
                      toast("Nota borrada.", () => void u());
                    }}
                  >
                    Borrar
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}

// Para el inicio: los bloques en una grilla compacta.
export function AreasCard() {
  const { data } = useApp();
  const hoy = chileNow().date;
  const conAlgo = AREAS_VIDA.map((a) => ({ a, e: estadoArea(a.id, data, hoy) })).filter((x) => x.e.dato || x.e.notas.length);
  return (
    <div class="card">
      <div class="between">
        <span class="lbl">Mi vida por áreas</span>
        <a href="#/areas" class="small" style={{ color: "var(--blue)", minHeight: "32px", display: "inline-flex", alignItems: "center" }}>
          Ver todo
        </a>
      </div>
      {!conAlgo.length ? (
        <span class="small">Cuéntale a JARVIS cómo te fue, qué te duele o con quién saliste: cada cosa queda en su área.</span>
      ) : (
        <div class="areas-mini">
          {conAlgo.slice(0, 6).map(({ a, e }) => (
            <a key={a.id} href={`#/areas?a=${a.id}`} class="area-mini">
              <span class="ico" style={{ background: a.color }} aria-hidden="true">
                <Icon name={a.icono} size={14} />
              </span>
              <span class="stack" style={{ gap: 0, minWidth: 0 }}>
                <strong style={{ fontSize: "13px" }}>{a.nombre}</strong>
                <span class="small area-ultima">{e.dato || e.notas[0]?.texto}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
