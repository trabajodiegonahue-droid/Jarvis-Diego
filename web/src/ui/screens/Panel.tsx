// El panel del inicio: todo de un vistazo, ordenado. Tu día (línea de tiempo), la semana (calendario),
// los números clave (tarjetas) y dos gráficos.
// Pensado para abrir la app pocas veces y entender todo al tiro.
import { Fragment } from "preact";
import { getNombreMascota } from "../../areas/calc";
import { eventosDia, type Evento } from "../../calendar/calc";
import { kmTxt, salidas } from "../../cardio/calc";
import { addDays, dow, lunesDe } from "../../core/dates";
import { hhmm } from "../../core/texto";
import { chileNow } from "../../core/time";
import type { Datos } from "../../data/types";
import { activos, aplica, hecho } from "../../habits/calc";
import { routine } from "../../jarvis/instance";
import { eventosMascota, minutosSinSalir } from "../../mascota/calc";
import { totalesMes } from "../../money/calc";
import { clp } from "../../money/format";
import { Bars } from "../charts";
import { Icon } from "../icons";
import { getPrefs, go, useApp } from "../state";
import { bloqueActual, COLOR_SESION, faseDe, horarioDelDia, INICIO_BLOQUE, planDelDia } from "../../plan/bloque";
import { cumplimiento, planificadas, racha } from "../../plan/futbolCalc";
import { estudioDeHoy, tocanHoy, todasLasSesiones } from "../../plan/estudio";
import { proteinaDia } from "../../plan/comida";

const LETRA = ["L", "M", "M", "J", "V", "S", "D"];
const COLOR: Record<string, string> = { turno: "var(--t2)", partido: "var(--t3)", equipo: "var(--t3)", fisico: "var(--t3)", tarea: "var(--t1)", prueba: "var(--t1)", meta: "var(--gold)", rutina: "var(--t7)", recordatorio: "var(--amber)", cumple: "var(--t5)" };

export interface Item {
  id: string;
  hora?: string;
  fin?: string;
  titulo: string;
  color: string;
  ruta: string;
  hecho?: boolean;
}

export function itemsDelDia(d: Datos, fecha: string): Item[] {
  const pr = getPrefs();
  // Con Mi Día cargado: la rutina ya está en Mi Día y el físico es el del bloque (mañana 9:30 y tarde 17:00).
  const bloque: Item[] = [];
  if (pr.miDia) {
    const p = planDelDia(fecha, pr.partidoPorSemana);
    if (p.manana.tipo !== "descanso") bloque.push({ id: `bm:${fecha}`, hora: p.md === 0 ? undefined : "09:30", titulo: p.manana.titulo, color: COLOR_SESION[p.manana.tipo], ruta: "/futbol?fisico", hecho: d.entrenos.some((e) => e.fecha === fecha && e.sesion === p.manana.sesion) });
    if (p.tarde.tipo !== "descanso") bloque.push({ id: `bt:${fecha}`, hora: "17:00", titulo: p.tarde.titulo, color: COLOR_SESION[p.tarde.tipo], ruta: "/futbol?fisico", hecho: d.entrenos.some((e) => e.fecha === fecha && e.sesion === p.tarde.sesion) });
  }
  const ev: Item[] = [...bloque, ...eventosDia(d, routine.tasks, fecha).eventos.filter((e: Evento) => !(pr.miDia && (e.tipo === "rutina" || e.tipo === "fisico"))).map((e: Evento) => ({ id: e.id, hora: e.inicio, fin: e.fin, titulo: e.titulo, color: COLOR[e.tipo] || "var(--blue)", ruta: e.ruta, hecho: e.hecho }))];
  for (const r of d.recordatorios.filter((x) => !x.hecho && x.cuando.startsWith(fecha))) ev.push({ id: `r:${r.id}`, hora: r.cuando.slice(11), titulo: r.texto, color: COLOR.recordatorio, ruta: "/mas/recordatorios" });
  for (const f of d.fechas.filter((x) => x.dia === fecha.slice(5))) ev.push({ id: `f:${f.id}`, titulo: f.nombre, color: COLOR.cumple, ruta: "/mas/recordatorios" });
  return ev.sort((a, b) => (a.hora || "00:00").localeCompare(b.hora || "00:00"));
}

// ---------- Hoy: línea de tiempo ----------
export function HoyLinea({ data }: { data: Datos }) {
  const n = chileNow();
  const ahora = hhmm(n.minutes);
  const items = itemsDelDia(data, n.date);
  const sinHora = items.filter((i) => !i.hora);
  const conHora = items.filter((i) => i.hora);
  const iAhora = conHora.findIndex((i) => i.hora! > ahora);
  return (
    <section class="card panel-hoy" aria-labelledby="p-hoy">
      <div class="between">
        <h2 id="p-hoy" class="lbl">
          Hoy
        </h2>
        <a href="#/mas/calendario" class="small ver">
          Calendario ›
        </a>
      </div>
      {!items.length && <span class="small">Nada agendado. Dile a JARVIS "tengo fútbol a las 6" o "recuérdame…".</span>}
      {sinHora.map((i) => (
        <button key={i.id} class="linea-todo" onClick={() => go(i.ruta)}>
          <span class="dot" style={{ background: i.color }} />
          {i.titulo}
        </button>
      ))}
      {conHora.length > 0 && (
        <ol class="linea">
          {conHora.map((i, k) => (
            <Fragment key={i.id}>
              {k === (iAhora < 0 ? conHora.length : iAhora) && <li key="ahora" class="linea-ahora" aria-label={`Ahora, ${ahora}`}><span>{ahora}</span></li>}
              <li class={`linea-item ${i.hora! < ahora || i.hecho ? "pasado" : ""}`}>
                <button onClick={() => go(i.ruta)}>
                  <span class="hora">{i.hora}</span>
                  <span class="punto" style={{ background: i.color }} />
                  <span class="titulo">
                    {i.titulo}
                    {i.fin && i.fin !== "24:00" && <span class="small"> · hasta {i.fin}</span>}
                  </span>
                </button>
              </li>
            </Fragment>
          ))}
          {iAhora < 0 && conHora.length > 0 && <li class="linea-ahora" aria-label={`Ahora, ${ahora}`}><span>{ahora}</span></li>}
        </ol>
      )}
    </section>
  );
}

// ---------- La semana: calendario en una fila ----------
export function SemanaFila({ data }: { data: Datos }) {
  const hoy = chileNow().date;
  const lunes = lunesDe(hoy);
  const dias = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
  return (
    <section class="card" aria-labelledby="p-sem">
      <div class="between">
        <h2 id="p-sem" class="lbl">
          Esta semana
        </h2>
        <a href="#/mas/calendario" class="small ver">
          Ver ›
        </a>
      </div>
      <div class="semana-fila">
        {dias.map((f) => {
          const its = itemsDelDia(data, f);
          const colores = [...new Set(its.map((i) => i.color))].slice(0, 3);
          const ent = data.entrenos.some((e) => e.fecha === f);
          return (
            <button key={f} class={`sem-dia ${f === hoy ? "hoy" : ""} ${f < hoy ? "pasado" : ""}`} onClick={() => go("/mas/calendario")} aria-label={`${LETRA[dow(f)]} ${Number(f.slice(8))}: ${its.length} cosas${ent ? ", entrenaste" : ""}`}>
              <span class="sem-letra">{LETRA[dow(f)]}</span>
              <span class="sem-num">{Number(f.slice(8))}</span>
              <span class="sem-dots">
                {colores.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
                {ent && <i class="ok" />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Los números clave ----------
export function Numeros({ data }: { data: Datos }) {
  const n = chileNow();
  const hoy = n.date;
  const lunes = lunesDe(hoy);
  const tot = totalesMes(data.movimientos, hoy.slice(0, 7));
  const balance = tot.ingresos - tot.egresos;
  const ss = salidas(data.entrenos).filter((s) => s.fecha >= lunes);
  const ents = data.entrenos.filter((e) => e.fecha >= lunes && e.fecha <= hoy);
  const km = ss.reduce((t, s) => t + (s.km || 0), 0);
  const ult7 = data.dias.filter((x) => x.id > addDays(hoy, -7) && x.id <= hoy);
  const prom = (k: "sueno" | "animo") => {
    const v = ult7.map((x) => x[k]).filter((x): x is number => typeof x === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const sueno = prom("sueno");
  const animo = prom("animo");
  const hs = activos(data.habitos).filter((h) => aplica(h, hoy));
  const hechos = hs.filter((h) => hecho(data.dias, h.id, hoy)).length;
  const masc = getNombreMascota();
  const sin = minutosSinSalir(eventosMascota(data.notas), `${hoy}T${hhmm(n.minutes)}`);
  const f1 = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
  const tiles: { id: string; nombre: string; valor: string; sub: string; icono: string; color: string; ruta: string; alerta?: boolean }[] = [
    { id: "dinero", nombre: "Balance del mes", valor: `${balance < 0 ? "−" : "+"}${clp(Math.abs(balance))}`, sub: `gastaste ${clp(tot.egresos)}`, icono: "dinero", color: "var(--t6)", ruta: "/dinero", alerta: balance < 0 },
    { id: "entreno", nombre: "Entrenos semana", valor: String(ents.length), sub: km ? `${kmTxt(km)} de cardio` : "sin cardio aún", icono: "pesa", color: "var(--t3)", ruta: "/mas/cardio" },
    { id: "sueno", nombre: "Sueño (7 días)", valor: sueno != null ? `${f1(sueno)} h` : "—", sub: sueno == null ? "dile «dormí 7 horas»" : sueno < 7 ? "menos de lo ideal" : "bien ahí", icono: "reloj", color: "var(--t1)", ruta: "/mas/habitos", alerta: sueno != null && sueno < 6.5 },
    { id: "animo", nombre: "Ánimo (7 días)", valor: animo != null ? `${f1(animo)}/5` : "—", sub: animo == null ? "dile cómo andas" : animo >= 3.5 ? "buena semana" : "semana pesada", icono: "animo", color: "var(--t7)", ruta: "/mas/habitos" },
    ...(hs.length ? [{ id: "habitos", nombre: "Hábitos hoy", valor: `${hechos}/${hs.length}`, sub: hechos === hs.length ? "todos listos" : `te faltan ${hs.length - hechos}`, icono: "habitos", color: "var(--t4)", ruta: "/mas/habitos" }] : []),
    ...(masc || sin != null ? [{ id: "mascota", nombre: masc || "Mascota", valor: sin == null ? "—" : sin < 60 ? `${sin} min` : `${Math.floor(sin / 60)} h`, sub: sin == null ? "sin paseos anotados" : "desde la última salida", icono: "pata", color: "var(--t2)", ruta: "/mas/mascota", alerta: sin != null && sin >= 480 }] : []),
  ];
  return (
    <section aria-label="Tus números" class="numeros">
      {tiles.map((t) => (
        <button key={t.id} class={`numero ${t.alerta ? "alerta" : ""}`} onClick={() => go(t.ruta)} style={{ "--c": t.color } as any}>
          <span class="numero-top">
            <span class="numero-ico" aria-hidden="true">
              <Icon name={t.icono} size={15} />
            </span>
            <span class="numero-nombre">{t.nombre}</span>
          </span>
          <strong class="numero-valor">{t.valor}</strong>
          <span class="numero-sub">{t.sub}</span>
        </button>
      ))}
    </section>
  );
}

// ---------- Dos gráficos: gastos y sueño de los últimos 7 días ----------
export function Graficos({ data }: { data: Datos }) {
  const hoy = chileNow().date;
  const dias = Array.from({ length: 7 }, (_, i) => addDays(hoy, i - 6));
  const et = (f: string) => (f === hoy ? "Hoy" : LETRA[dow(f)]);
  const gastos = dias.map((f) => ({ etiqueta: et(f), valor: data.movimientos.filter((m) => m.fecha === f && m.tipo === "egreso").reduce((t, m) => t + m.monto, 0) }));
  const sueno = dias.map((f) => ({ etiqueta: et(f), valor: data.dias.find((x) => x.id === f)?.sueno ?? 0 }));
  return (
    <div class="graficos">
      <section class="card" aria-labelledby="p-gas">
        <div class="between">
          <h2 id="p-gas" class="lbl">
            Gastos, 7 días
          </h2>
          <a href="#/dinero" class="small ver">
            Dinero ›
          </a>
        </div>
        <Bars data={gastos} label="Gastos por día, últimos 7 días" fmt={(x) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x))} color="#f08a7e" />
      </section>
      <section class="card" aria-labelledby="p-sue">
        <div class="between">
          <h2 id="p-sue" class="lbl">
            Sueño, 7 días
          </h2>
          <a href="#/mas/habitos" class="small ver">
            Hábitos ›
          </a>
        </div>
        <Bars data={sueno} label="Horas de sueño por día, últimos 7 días" fmt={(x) => (x ? String(Math.round(x * 10) / 10).replace(".", ",") : "")} meta={7} color="var(--t1)" />
      </section>
    </div>
  );
}

// ---------- Tu plan: Fútbol, Estudio, Comida y Mi Día ----------
export function PlanInicio({ data }: { data: Datos }) {
  const { prefs } = useApp();
  const n = chileNow();
  const hoy = n.date;
  const lunes = lunesDe(hoy);
  const p = planDelDia(hoy, prefs.partidoPorSemana);
  const fase = faseDe(hoy, undefined, prefs.fechaPrueba || null);
  const cum = cumplimiento(data.entrenos, lunes, addDays(lunes, 6), prefs.partidoPorSemana, hoy);
  const semPlan = planificadas(lunes, addDays(lunes, 6), prefs.partidoPorSemana).length;
  const rachaF = racha(data.entrenos, hoy, prefs.partidoPorSemana);
  const prox = fase.diasPrueba != null ? `Prueba en ${fase.diasPrueba} días` : fase.semana < 4 ? `Tests en ${Math.max(0, 4 * 7 - (fase.semana * 7 + dow(hoy) - dow(INICIO_BLOQUE)))} días` : fase.semana < 8 ? `Tests en ${Math.max(0, 8 * 7 - (fase.semana * 7 + dow(hoy) - dow(INICIO_BLOQUE)))} días` : fase.nombre;
  const e = estudioDeHoy(hoy);
  const log = todasLasSesiones(data.estudio, data.sesiones, data.materias);
  const minSem = log.filter((x) => x.fecha >= lunes).reduce((t, x) => t + x.minutos, 0);
  const pendientes = tocanHoy(data.tarjetas, hoy).length + tocanHoy(data.errores, hoy).length;
  const com = data.comidas.find((c) => c.id === hoy);
  const prot = proteinaDia(com, prefs.comida);
  const bloques = horarioDelDia(hoy, prefs.partidoPorSemana);
  const tarea = (t: string) => routine.tasks.find((r) => r.title === t);
  const hechos = bloques.filter((b) => tarea(b.titulo)?.done.includes(hoy)).length;
  const sig = bloqueActual(bloques, hhmm(n.minutes)).siguiente;
  // Mini-gráficos: barras de los últimos 7 días.
  const dias7 = Array.from({ length: 7 }, (_, i) => addDays(hoy, i - 6));
  const mini = (vals: number[], color: string, max = Math.max(1, ...vals)) => (
    <svg viewBox="0 0 70 24" width="70" height="24" aria-hidden="true" class="mini">
      {vals.map((v, i) => (
        <rect key={i} x={i * 10 + 1} y={24 - Math.max(2, (v / max) * 22)} width="7" height={Math.max(2, (v / max) * 22)} rx="2" fill={color} opacity={i === 6 ? 1 : 0.55} />
      ))}
    </svg>
  );
  const tarjetas = [
    {
      id: "futbol",
      ruta: "/futbol?fisico",
      color: COLOR_SESION[p.manana.tipo],
      icono: "futbol",
      titulo: "Fútbol",
      valor: p.md === 0 ? "Partido" : `${p.mdTxt} · ${p.manana.titulo.split(" (")[0]}`,
      sub: `${semPlan ? Math.round((cum.hechas / semPlan) * 100) : 0}% de la semana · racha ${rachaF} · ${prox}`,
      g: mini(dias7.map((f) => data.entrenos.filter((x) => x.fecha === f).length), "#1f9d55", 2),
    },
    {
      id: "estudio",
      ruta: "/mas/estudios",
      color: e.materia ? "#3a86c8" : "#7b4fd0",
      icono: "libro",
      titulo: "Estudio",
      valor: e.materia ? e.texto.split(":")[0] : e.ensayo ? "Mini-ensayo" : "Libre",
      sub: `${minSem} min esta semana${pendientes ? ` · ${pendientes} para repasar` : ""}`,
      g: mini(dias7.map((f) => log.filter((x) => x.fecha === f).reduce((t, x) => t + x.minutos, 0)), "#3a86c8", 45),
    },
    {
      id: "comida",
      ruta: "/mas/comida",
      color: "#e8772e",
      icono: "estrella",
      titulo: "Comida",
      valor: `${prot}/${prefs.comida.meta} g proteína`,
      sub: com?.creatina ? "Creatina ✓" : "Creatina pendiente",
      g: mini(dias7.map((f) => proteinaDia(data.comidas.find((c) => c.id === f), prefs.comida)), "#e8772e", prefs.comida.meta),
    },
    {
      id: "midia",
      ruta: "/mas/midia",
      color: "#159a9c",
      icono: "reloj",
      titulo: "Mi Día",
      valor: `${Math.round((hechos / bloques.length) * 100)}% cumplido`,
      sub: sig ? `Próximo: ${sig.hora} ${sig.titulo.toLowerCase()}` : "Día terminado",
      g: mini(dias7.map((f) => bloques.filter((b) => tarea(b.titulo)?.done.includes(f)).length), "#159a9c", bloques.length),
    },
  ];
  return (
    <section class="plan-grid" aria-label="Tu plan">
      {tarjetas.map((t) => (
        <button key={t.id} class="plan-card" style={{ "--c": t.color } as any} onClick={() => go(t.ruta)}>
          <span class="numero-top">
            <span class="numero-ico" aria-hidden="true">
              <Icon name={t.icono} size={15} />
            </span>
            <span class="numero-nombre">{t.titulo}</span>
          </span>
          <strong class="plan-valor">{t.valor}</strong>
          <span class="numero-sub">{t.sub}</span>
          {t.g}
        </button>
      ))}
    </section>
  );
}
