import { useState } from "preact/hooks";
import { dow, fechaCorta, fechaLarga } from "../../core/dates";
import { chileNow, DAY_NAMES } from "../../core/time";
import { store } from "../../data/store";
import { uid, type Club, type Partido, type Video } from "../../data/types";
import { porMes, proximoEvento, resultado, serieNotas, sinRegistrar, statsTemporada, temporadas } from "../../futbol/calc";
import { nombreMes } from "../../money/calc";
import { Bars, Line } from "../charts";
import { Empty, Sheet } from "../components";
import { Icon } from "../icons";
import { setPrefs, toast, useApp } from "../state";
import { Fisico } from "./Fisico";

type Tab = "partidos" | "stats" | "fisico" | "clubes";
const inp = { minHeight: "44px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--card2)", padding: "0 12px", width: "100%" };

export function Futbol() {
  const [tab, setTab] = useState<Tab>(() => (location.hash.includes("fisico") ? "fisico" : "partidos"));
  return (
    <main class="page">
      <header class="head">
        <h1>Fútbol</h1>
      </header>
      <Perfil />
      <div class="seg tabs4" role="tablist" aria-label="Secciones de Fútbol">
        {(["partidos", "stats", "fisico", "clubes"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} class={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {{ partidos: "Partidos", stats: "Números", fisico: "Físico", clubes: "Clubes" }[t]}
          </button>
        ))}
      </div>
      {tab === "partidos" && <Partidos />}
      {tab === "stats" && <Stats />}
      {tab === "fisico" && <Fisico />}
      {tab === "clubes" && <Clubes />}
    </main>
  );
}

function Perfil() {
  const { prefs } = useApp();
  const f = prefs.futbol;
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(f);
  return (
    <>
      <button class="card" onClick={() => (setV(prefs.futbol), setEdit(true))} aria-label="Editar mi perfil de fútbol" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <span class="stack" style={{ gap: "2px" }}>
          <strong>
            {f.posicion || "Tu posición"}
            {f.equipo ? ` · ${f.equipo}` : ""}
          </strong>
          <span class="small">{f.objetivos || "Toca para poner tu equipo y tus objetivos de la temporada."}</span>
        </span>
        <Icon name="chevron" size={18} />
      </button>
      {edit && (
        <Sheet title="Mi perfil de fútbol" onClose={() => setEdit(false)}>
          <form
            class="stack"
            style={{ gap: "14px" }}
            onSubmit={(e) => {
              e.preventDefault();
              setPrefs({ futbol: { ...v, posicion: v.posicion.trim(), equipo: v.equipo.trim(), objetivos: v.objetivos.trim() } });
              setEdit(false);
              toast("Perfil guardado.");
            }}
          >
            <div class="field">
              <label class="lbl" for="fp-p">
                Posición
              </label>
              <input id="fp-p" style={inp} maxLength={30} value={v.posicion} onInput={(e) => setV({ ...v, posicion: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="field">
              <label class="lbl" for="fp-e">
                Equipo
              </label>
              <input id="fp-e" style={inp} maxLength={40} value={v.equipo} onInput={(e) => setV({ ...v, equipo: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="field">
              <label class="lbl" for="fp-o">
                Objetivos de la temporada
              </label>
              <textarea id="fp-o" maxLength={200} value={v.objetivos} onInput={(e) => setV({ ...v, objetivos: (e.target as HTMLTextAreaElement).value })} placeholder="Ser titular, 5 asistencias, mejorar el pase largo" />
            </div>
            <div class="field">
              <span class="lbl">Días en que juegas o entrenas con el equipo</span>
              <div class="chips">
                {DAY_NAMES.map((d, i) => {
                  const on = v.diasPartido.includes(i);
                  return (
                    <button type="button" key={d} class={on ? "on" : ""} aria-pressed={on} onClick={() => setV({ ...v, diasPartido: on ? v.diasPartido.filter((x) => x !== i) : [...v.diasPartido, i] })}>
                      {d.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
              <span class="small">Así la rutina del gimnasio no te pone pierna pesada el día antes.</span>
            </div>
            <button class="btn main full">Guardar</button>
          </form>
        </Sheet>
      )}
    </>
  );
}

function Partidos() {
  const { data } = useApp();
  const hoy = chileNow().date;
  const [form, setForm] = useState<Partido | "nuevo" | null>(null);
  const prox = proximoEvento(data.partidos, hoy);
  const pend = sinRegistrar(data.partidos, hoy);
  const futuros = data.partidos.filter((p) => p.fecha >= hoy && p !== prox).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pasados = data.partidos.filter((p) => p.fecha < hoy && p.fui != null).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <>
      <button class="btn sm" onClick={() => setForm("nuevo")}>
        <Icon name="plus" size={18} /> Partido o entrenamiento
      </button>
      {prox ? (
        <button class="card" onClick={() => setForm(prox)}>
          <span class="lbl">Próximo {prox.tipo === "partido" ? "partido" : "entrenamiento"}</span>
          <span class="mid">{prox.tipo === "partido" ? `vs. ${prox.rival || "rival por definir"}` : "Entrenamiento con el equipo"}</span>
          <span class="small">
            {prox.fecha === hoy ? "Hoy" : fechaLarga(prox.fecha)}
            {prox.hora ? ` · ${prox.hora}` : ""}
            {prox.lugar ? ` · ${prox.lugar}` : ""}
            {prox.importante ? " · ★ importante" : ""}
          </span>
        </button>
      ) : (
        <div class="card">
          <Empty text="No tienes partidos ni entrenamientos anotados." action="Anotar uno" onAction={() => setForm("nuevo")} />
        </div>
      )}
      {pend.length > 0 && (
        <div class="card">
          <h2>¿Cómo te fue?</h2>
          {pend.map((p) => (
            <button key={p.id} class="between" style={{ background: "none", border: 0, color: "inherit", minHeight: "44px", padding: 0 }} onClick={() => setForm(p)}>
              <span>{p.tipo === "partido" ? `vs. ${p.rival || "—"}` : "Entrenamiento"}</span>
              <span class="small" style={{ color: "var(--amber)" }}>
                {fechaCorta(p.fecha)} · registrar
              </span>
            </button>
          ))}
        </div>
      )}
      {futuros.length > 0 && (
        <div class="card" style={{ gap: 0 }}>
          <span class="lbl" style={{ marginBottom: "4px" }}>
            Lo que viene
          </span>
          {futuros.slice(0, 8).map((p) => (
            <EventoFila key={p.id} p={p} onOpen={() => setForm(p)} />
          ))}
        </div>
      )}
      {pasados.length > 0 && (
        <div class="card" style={{ gap: 0 }}>
          <span class="lbl" style={{ marginBottom: "4px" }}>
            Jugados
          </span>
          {pasados.slice(0, 15).map((p) => (
            <EventoFila key={p.id} p={p} onOpen={() => setForm(p)} />
          ))}
        </div>
      )}
      {form && (
        <Sheet title={form === "nuevo" ? "Nuevo" : form.tipo === "partido" ? `vs. ${form.rival || "—"}` : "Entrenamiento"} onClose={() => setForm(null)}>
          <PartidoForm partido={form === "nuevo" ? undefined : form} onDone={() => setForm(null)} />
        </Sheet>
      )}
    </>
  );
}

function EventoFila({ p, onOpen }: { p: Partido; onOpen: () => void }) {
  const r = resultado(p);
  return (
    <button class="item" style={{ background: "none", border: 0, borderTop: "1px solid var(--line)", width: "100%", textAlign: "left", color: "inherit" }} onClick={onOpen}>
      <span class="stack" style={{ gap: 0 }}>
        <span class="t">
          {p.tipo === "partido" ? `vs. ${p.rival || "—"}` : "Entrenamiento"}
          {p.importante ? " ★" : ""}
        </span>
        <span class="small">
          {fechaCorta(p.fecha)}
          {p.hora ? ` · ${p.hora}` : ""}
          {p.fui === false ? " · no fui" : p.minutos ? ` · ${p.minutos} min` : ""}
          {p.goles ? ` · ${p.goles} gol${p.goles > 1 ? "es" : ""}` : ""}
          {p.asistencias ? ` · ${p.asistencias} asist.` : ""}
        </span>
      </span>
      <span class="small num">
        {r ? `${p.golesFavor}–${p.golesContra} ${r === "Ganado" ? "G" : r === "Perdido" ? "P" : "E"}` : ""}
        {p.calificacion ? ` · ${p.calificacion}` : ""}
      </span>
      <Icon name="chevron" size={16} />
    </button>
  );
}

const num = (s: string) => (s.trim() === "" ? undefined : Math.max(0, Math.round(Number(s))));

export function PartidoForm({ partido, onDone }: { partido?: Partido; onDone: () => void }) {
  const hoy = chileNow().date;
  const [p, setP] = useState<Partido>(partido || { id: uid(), tipo: "partido", fecha: hoy, temporada: hoy.slice(0, 4) });
  const [txt, setTxt] = useState({ gf: str(p.golesFavor), gc: str(p.golesContra), min: str(p.minutos), goles: str(p.goles), asist: str(p.asistencias), pases: str(p.pases) });
  const jugado = p.fecha <= hoy;
  const set = (o: Partial<Partido>) => setP({ ...p, ...o });
  return (
    <form
      class="stack"
      style={{ gap: "14px" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (p.tipo === "partido" && !p.rival?.trim() && !partido) return toast("¿Contra quién juegas?");
        const final: Partido = { ...p, temporada: p.temporada || p.fecha.slice(0, 4), rival: p.rival?.trim() || undefined, lugar: p.lugar?.trim() || undefined };
        if (jugado && final.fui !== false) {
          final.fui = final.fui ?? true;
          Object.assign(final, { golesFavor: num(txt.gf), golesContra: num(txt.gc), minutos: num(txt.min), goles: num(txt.goles), asistencias: num(txt.asist), pases: num(txt.pases) });
          if (final.minutos != null && final.minutos > 130) return toast("Los minutos van de 0 a 130.");
        }
        await store.put("partidos", final);
        onDone();
        toast(jugado && final.fui ? "Registrado. Bien ahí." : "Guardado.");
      }}
    >
      <div class="seg">
        <button type="button" class={p.tipo === "partido" ? "on" : ""} onClick={() => set({ tipo: "partido" })}>
          Partido
        </button>
        <button type="button" class={p.tipo === "entrenamiento" ? "on" : ""} onClick={() => set({ tipo: "entrenamiento" })}>
          Entrenamiento del equipo
        </button>
      </div>
      <div class="grid2">
        <div class="field">
          <label class="lbl" for="pa-f">
            Fecha
          </label>
          <input id="pa-f" type="date" style={inp} value={p.fecha} onInput={(e) => set({ fecha: (e.target as HTMLInputElement).value || hoy })} />
        </div>
        <div class="field">
          <label class="lbl" for="pa-h">
            Hora
          </label>
          <input id="pa-h" type="time" style={inp} value={p.hora || ""} onInput={(e) => set({ hora: (e.target as HTMLInputElement).value || undefined })} />
        </div>
      </div>
      {p.tipo === "partido" && (
        <div class="field">
          <label class="lbl" for="pa-r">
            Rival
          </label>
          <input id="pa-r" style={inp} maxLength={40} value={p.rival || ""} onInput={(e) => set({ rival: (e.target as HTMLInputElement).value })} />
        </div>
      )}
      <div class="field">
        <label class="lbl" for="pa-l">
          Lugar
        </label>
        <input id="pa-l" style={inp} maxLength={40} value={p.lugar || ""} onInput={(e) => set({ lugar: (e.target as HTMLInputElement).value })} />
      </div>
      <label class="row" style={{ minHeight: "44px" }}>
        <input type="checkbox" checked={!!p.importante} onChange={(e) => set({ importante: (e.target as HTMLInputElement).checked || undefined })} style={{ width: "22px", height: "22px" }} />
        Importante (bajo la carga del gimnasio los días antes)
      </label>
      {jugado && (
        <>
          <div class="seg">
            <button type="button" class={p.fui !== false ? "on" : ""} onClick={() => set({ fui: true })}>
              Fui
            </button>
            <button type="button" class={p.fui === false ? "on" : ""} onClick={() => set({ fui: false })}>
              No fui
            </button>
          </div>
          {p.fui !== false && p.tipo === "partido" && (
            <>
              <div class="grid2">
                <NumF id="gf" label="Goles de mi equipo" v={txt.gf} on={(x) => setTxt({ ...txt, gf: x })} />
                <NumF id="gc" label="Goles del rival" v={txt.gc} on={(x) => setTxt({ ...txt, gc: x })} />
                <NumF id="min" label="Minutos jugados" v={txt.min} on={(x) => setTxt({ ...txt, min: x })} />
                <NumF id="pases" label="Pases (aprox.)" v={txt.pases} on={(x) => setTxt({ ...txt, pases: x })} />
                <NumF id="goles" label="Mis goles" v={txt.goles} on={(x) => setTxt({ ...txt, goles: x })} />
                <NumF id="asist" label="Mis asistencias" v={txt.asist} on={(x) => setTxt({ ...txt, asist: x })} />
              </div>
              <div class="field">
                <span class="lbl">Mi nota (1 a 10)</span>
                <div class="chips">
                  {[4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button type="button" key={n} class={p.calificacion === n ? "on" : ""} aria-pressed={p.calificacion === n} onClick={() => set({ calificacion: n })}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {p.fui !== false && (
            <>
              <div class="field">
                <label class="lbl" for="pa-b">
                  Qué hice bien
                </label>
                <input id="pa-b" style={inp} maxLength={120} value={p.bien || ""} onInput={(e) => set({ bien: (e.target as HTMLInputElement).value })} />
              </div>
              <div class="field">
                <label class="lbl" for="pa-m">
                  Qué debo mejorar
                </label>
                <input id="pa-m" style={inp} maxLength={120} value={p.mejorar || ""} onInput={(e) => set({ mejorar: (e.target as HTMLInputElement).value })} />
              </div>
            </>
          )}
        </>
      )}
      <button class="btn main full">Guardar</button>
      {partido && (
        <button
          type="button"
          class="btn danger full"
          onClick={async () => {
            onDone();
            const u = await store.remove("partidos", partido.id);
            toast("Borrado.", u);
          }}
        >
          Borrar
        </button>
      )}
    </form>
  );
}
const str = (n?: number) => (n == null ? "" : String(n));
function NumF({ id, label, v, on }: { id: string; label: string; v: string; on: (x: string) => void }) {
  return (
    <div class="field">
      <label class="lbl" for={`pa-${id}`}>
        {label}
      </label>
      <input id={`pa-${id}`} style={inp} inputMode="numeric" value={v} onInput={(e) => on((e.target as HTMLInputElement).value.replace(/\D/g, ""))} />
    </div>
  );
}

function Stats() {
  const { data } = useApp();
  const hoy = chileNow().date;
  const temps = temporadas(data.partidos);
  const [temp, setTemp] = useState(temps.includes(hoy.slice(0, 4)) ? hoy.slice(0, 4) : temps[temps.length - 1] || hoy.slice(0, 4));
  const st = statsTemporada(data.partidos, temp);
  const notas = serieNotas(data.partidos, temp);
  const meses = porMes(data.partidos, hoy.slice(0, 7), 6);
  if (!st.partidos && temps.length <= 1) return <div class="card"><Empty text="Cuando registres tus partidos (minutos, goles, asistencias y tu nota) aquí vas a ver tus números." /></div>;
  return (
    <>
      {temps.length > 1 && (
        <div class="seg">
          {temps.map((t) => (
            <button key={t} class={temp === t ? "on" : ""} onClick={() => setTemp(t)}>
              Temporada {t}
            </button>
          ))}
        </div>
      )}
      <div class="card">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "12px", textAlign: "center" }}>
          {[
            ["Partidos", st.partidos],
            ["Minutos", st.minutos],
            ["Nota", st.nota == null ? "—" : String(st.nota).replace(".", ",")],
            ["Goles", st.goles],
            ["Asistencias", st.asistencias],
            ["G · E · P", `${st.ganados}·${st.empatados}·${st.perdidos}`],
          ].map(([l, v]) => (
            <div key={l as string} class="stack" style={{ gap: "2px" }}>
              <span class="mid">{v}</span>
              <span class="small">{l}</span>
            </div>
          ))}
        </div>
      </div>
      {notas.length > 0 && (
        <div class="card">
          <h2>Tu nota por partido</h2>
          <Line label="Tu calificación por partido" data={notas.map((n) => ({ etiqueta: fechaCorta(n.fecha), valor: n.nota }))} fmt={(v) => String(Math.round(v * 10) / 10).replace(".", ",")} cero={false} />
        </div>
      )}
      <div class="card">
        <h2>Minutos por mes</h2>
        <Bars label="Minutos jugados por mes" data={meses.map((m) => ({ etiqueta: nombreMes(m.mes, true), valor: m.minutos }))} />
        <h2>Goles y asistencias por mes</h2>
        <div class="list">
          {meses.map((m) => (
            <div class="item" key={m.mes} style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
              <span>{nombreMes(m.mes)}</span>
              <span class="num">{m.goles} goles</span>
              <span class="num">{m.asistencias} asist.</span>
            </div>
          ))}
        </div>
      </div>
      {temps.length > 1 && (
        <div class="card">
          <h2>Temporadas</h2>
          <div class="list">
            {temps.map((t) => {
              const s = statsTemporada(data.partidos, t);
              return (
                <div class="item" key={t} style={{ gridTemplateColumns: "60px repeat(4, minmax(0,1fr))", fontSize: "13px" }}>
                  <strong>{t}</strong>
                  <span>{s.partidos} PJ</span>
                  <span>{s.goles} G</span>
                  <span>{s.asistencias} A</span>
                  <span>nota {s.nota ?? "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

const ESTADOS: Record<Club["estado"], string> = { pendiente: "Por postular", postule: "Postulé", prueba: "Prueba agendada", aceptado: "Quedé", "no-quede": "No quedé" };

function Clubes() {
  const { data } = useApp();
  const [club, setClub] = useState<Club | "nuevo" | null>(null);
  const [video, setVideo] = useState<Video | "nuevo" | null>(null);
  return (
    <>
      <div class="card">
        <div class="between">
          <h2>Pruebas y postulaciones</h2>
          <button class="link" onClick={() => setClub("nuevo")}>
            + Agregar
          </button>
        </div>
        {!data.clubes.length && <span class="small">Anota los clubes a los que quieres postular, con la fecha, el estado y el contacto.</span>}
        {[...data.clubes].sort((a, b) => (a.fecha || "9").localeCompare(b.fecha || "9")).map((c) => (
          <button key={c.id} class="between" style={{ background: "none", border: 0, color: "inherit", minHeight: "44px", padding: 0, textAlign: "left" }} onClick={() => setClub(c)}>
            <span class="stack" style={{ gap: 0 }}>
              <span>{c.club}</span>
              <span class="small">{[c.fecha ? fechaLarga(c.fecha) : "", c.contacto].filter(Boolean).join(" · ")}</span>
            </span>
            <span class="small" style={{ color: c.estado === "aceptado" ? "var(--green)" : c.estado === "no-quede" ? "var(--muted)" : "var(--blue)" }}>
              {ESTADOS[c.estado]}
            </span>
          </button>
        ))}
      </div>
      <div class="card">
        <div class="between">
          <h2>Mis mejores videos</h2>
          <button class="link" onClick={() => setVideo("nuevo")}>
            + Agregar
          </button>
        </div>
        <span class="small">Solo enlaces (YouTube, Drive): los videos no se suben a la app para que no pese.</span>
        {data.videos.map((v) => (
          <div key={v.id} class="between" style={{ minHeight: "44px" }}>
            <a href={v.url} target="_blank" rel="noopener noreferrer" class="stack" style={{ gap: 0, textDecoration: "none" }}>
              <span>{v.titulo}</span>
              {v.nota && <span class="small">{v.nota}</span>}
            </a>
            <button class="icon-btn" aria-label={`Editar ${v.titulo}`} onClick={() => setVideo(v)}>
              <Icon name="chevron" size={16} />
            </button>
          </div>
        ))}
      </div>
      {club && (
        <Sheet title={club === "nuevo" ? "Nuevo club" : club.club} onClose={() => setClub(null)}>
          <ClubForm club={club === "nuevo" ? undefined : club} onDone={() => setClub(null)} />
        </Sheet>
      )}
      {video && (
        <Sheet title={video === "nuevo" ? "Nuevo video" : video.titulo} onClose={() => setVideo(null)}>
          <VideoForm video={video === "nuevo" ? undefined : video} onDone={() => setVideo(null)} />
        </Sheet>
      )}
    </>
  );
}

function ClubForm({ club, onDone }: { club?: Club; onDone: () => void }) {
  const [c, setC] = useState<Club>(club || { id: uid(), club: "", estado: "pendiente" });
  return (
    <form
      class="stack"
      style={{ gap: "14px" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!c.club.trim()) return toast("Escribe el nombre del club.");
        await store.put("clubes", { ...c, club: c.club.trim() });
        onDone();
        toast("Guardado.");
      }}
    >
      <div class="field">
        <label class="lbl" for="cl-n">
          Club
        </label>
        <input id="cl-n" style={inp} maxLength={50} value={c.club} onInput={(e) => setC({ ...c, club: (e.target as HTMLInputElement).value })} />
      </div>
      <div class="chips">
        {(Object.keys(ESTADOS) as Club["estado"][]).map((k) => (
          <button type="button" key={k} class={c.estado === k ? "on" : ""} onClick={() => setC({ ...c, estado: k })}>
            {ESTADOS[k]}
          </button>
        ))}
      </div>
      <div class="field">
        <label class="lbl" for="cl-f">
          Fecha (prueba o postulación)
        </label>
        <input id="cl-f" type="date" style={inp} value={c.fecha || ""} onInput={(e) => setC({ ...c, fecha: (e.target as HTMLInputElement).value || undefined })} />
      </div>
      <div class="field">
        <label class="lbl" for="cl-c">
          Contacto
        </label>
        <input id="cl-c" style={inp} maxLength={80} value={c.contacto || ""} onInput={(e) => setC({ ...c, contacto: (e.target as HTMLInputElement).value })} placeholder="Nombre y teléfono o correo" />
      </div>
      <div class="field">
        <label class="lbl" for="cl-o">
          Nota
        </label>
        <textarea id="cl-o" maxLength={300} value={c.nota || ""} onInput={(e) => setC({ ...c, nota: (e.target as HTMLTextAreaElement).value })} />
      </div>
      <button class="btn main full">Guardar</button>
      {club && (
        <button
          type="button"
          class="btn danger full"
          onClick={async () => {
            onDone();
            const u = await store.remove("clubes", club.id);
            toast("Borrado.", u);
          }}
        >
          Borrar
        </button>
      )}
    </form>
  );
}

function VideoForm({ video, onDone }: { video?: Video; onDone: () => void }) {
  const [v, setV] = useState<Video>(video || { id: uid(), titulo: "", url: "" });
  return (
    <form
      class="stack"
      style={{ gap: "14px" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v.titulo.trim() || !/^https:\/\//.test(v.url.trim())) return toast("Pon un título y un enlace que empiece con https://");
        await store.put("videos", { ...v, titulo: v.titulo.trim(), url: v.url.trim() });
        onDone();
        toast("Video guardado.");
      }}
    >
      <div class="field">
        <label class="lbl" for="vi-t">
          Título
        </label>
        <input id="vi-t" style={inp} maxLength={60} value={v.titulo} onInput={(e) => setV({ ...v, titulo: (e.target as HTMLInputElement).value })} placeholder="Asistencia vs. Llanquihue" />
      </div>
      <div class="field">
        <label class="lbl" for="vi-u">
          Enlace
        </label>
        <input id="vi-u" style={inp} inputMode="url" autoCapitalize="off" value={v.url} onInput={(e) => setV({ ...v, url: (e.target as HTMLInputElement).value })} placeholder="https://youtu.be/…" />
      </div>
      <div class="field">
        <label class="lbl" for="vi-n">
          Nota
        </label>
        <input id="vi-n" style={inp} maxLength={120} value={v.nota || ""} onInput={(e) => setV({ ...v, nota: (e.target as HTMLInputElement).value })} placeholder="Minuto 2:15, pase al espacio" />
      </div>
      <button class="btn main full">Guardar</button>
      {video && (
        <button
          type="button"
          class="btn danger full"
          onClick={async () => {
            onDone();
            const u = await store.remove("videos", video.id);
            toast("Video borrado.", u);
          }}
        >
          Borrar
        </button>
      )}
    </form>
  );
}

export const diaNombre = (d: string) => DAY_NAMES[dow(d)];
