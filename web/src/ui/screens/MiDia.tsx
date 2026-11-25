// Mi Día: el horario de 7:30 a 23:00 con check en cada bloque y el bloque actual destacado.
// Los bloques son tu rutina: JARVIS los tacha por voz ("ya saqué al perro") y te avisa 10 minutos antes.
import { useState } from "preact/hooks";
import { addDays, dow, lunesDe } from "../../core/dates";
import { hhmm } from "../../core/texto";
import { chileNow } from "../../core/time";
import { bloqueActual, COLOR_SESION, faseDe, HORARIO, horarioDelDia, planDelDia } from "../../plan/bloque";
import { routine } from "../../jarvis/instance";
import { ALL_DAYS, norm, type Task } from "../../routine/routine";
import { Bars, BarsH, Line, Ring } from "../charts";
import { Icon } from "../icons";
import { crearMetasPlan } from "../../jarvis/metasPlan";
import { go, setPrefs, toast, useApp } from "../state";

const tareaDe = (titulo: string): Task | undefined => routine.tasks.find((t) => norm(t.title) === norm(titulo));
const DIAS = ["L", "M", "M", "J", "V", "S", "D"];

export function cargarMiDia() {
  routine.removeAll();
  for (const h of HORARIO) routine.add(h.titulo, h.hora, ALL_DAYS);
  setPrefs({ miDia: true });
  void crearMetasPlan(chileNow().date);
}

export function MiDia() {
  const { data, prefs } = useApp();
  const [, redraw] = useState(0);
  const n = chileNow();
  const hoy = n.date;
  const ahora = hhmm(n.minutes);
  const lunes = lunesDe(hoy);
  const plan = planDelDia(hoy, prefs.partidoPorSemana);
  const fase = faseDe(hoy, undefined, prefs.fechaPrueba || null);
  const bloques = horarioDelDia(hoy, prefs.partidoPorSemana);
  const { actual, siguiente } = bloqueActual(bloques, ahora);
  const cargado = HORARIO.every((h) => tareaDe(h.titulo));
  const hechos = bloques.filter((b) => tareaDe(b.titulo)?.done.includes(hoy)).length;

  // % cumplido por semana (últimas 6), con los días que ya pasaron.
  const semanas = Array.from({ length: 6 }, (_, i) => {
    const l = addDays(lunes, -7 * (5 - i));
    const dias = Array.from({ length: 7 }, (_, k) => addDays(l, k)).filter((f) => f <= hoy);
    const total = dias.length * HORARIO.length;
    const hecho = dias.reduce((t, f) => t + HORARIO.filter((h) => tareaDe(h.titulo)?.done.includes(f)).length, 0);
    return { etiqueta: `${Number(l.slice(8))}/${Number(l.slice(5, 7))}`, valor: total ? Math.round((hecho / total) * 100) : 0 };
  });
  // Bloques que más te saltas (últimos 14 días, sin contar hoy).
  const ult = Array.from({ length: 14 }, (_, k) => addDays(hoy, -14 + k));
  const saltados = HORARIO.map((h) => ({ nombre: h.titulo, valor: ult.filter((f) => !tareaDe(h.titulo)?.done.includes(f)).length }))
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 6);
  // Hora en que te dormiste (de la bitácora: "me voy a dormir"), últimos 14 días.
  const dormir = ult
    .concat(hoy)
    .map((f) => {
      const s = data.actividades.filter((a) => a.cat === "sueno" && (a.inicio.startsWith(f) && a.inicio.slice(11) >= "18:00" || a.inicio.startsWith(addDays(f, 1)) && a.inicio.slice(11) < "06:00")).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
      if (!s) return null;
      const [h, m] = s.inicio.slice(11).split(":").map(Number);
      return { etiqueta: `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`, valor: (h < 12 ? h + 24 : h) * 60 + m };
    })
    .filter((x): x is { etiqueta: string; valor: number } => !!x);

  const tachar = (titulo: string) => {
    const t = tareaDe(titulo);
    if (!t) return toast('Primero toca "Usar este horario".');
    if (t.done.includes(hoy)) routine.uncheck(t, hoy);
    else routine.check(t, hoy);
    redraw((x) => x + 1);
  };

  return (
    <main class="page">
      <header class="head">
        <h1 style={{ flex: 1 }}>Mi Día</h1>
        <span class="pill" style={{ borderColor: COLOR_SESION[plan.manana.tipo] }}>
          {plan.mdTxt} · {fase.nombre}
        </span>
      </header>
      {!cargado && (
        <div class="card" style={{ borderColor: "var(--green)" }}>
          <strong>Tu horario de 7:30 a 23:00</strong>
          <span class="small">Lo dejo como tu rutina diaria: JARVIS lo tacha por voz ("ya saqué al perro") y te avisa 10 minutos antes de cada bloque. Reemplaza la rutina que tienes ahora.</span>
          <button
            class="btn main full"
            onClick={() => {
              if (routine.tasks.length && !confirm(`Esto reemplaza tu rutina actual (${routine.tasks.length} tareas) por el horario de Mi Día. ¿Seguir?`)) return;
              cargarMiDia();
              toast("Listo: Mi Día quedó como tu rutina.");
              redraw((x) => x + 1);
            }}
          >
            Usar este horario
          </button>
        </div>
      )}
      <div class="card" style={{ flexDirection: "row", alignItems: "center", gap: "16px" }}>
        <Ring value={(hechos / bloques.length) * 100} center={`${Math.round((hechos / bloques.length) * 100)}%`} label={`Día cumplido: ${hechos} de ${bloques.length} bloques`} />
        <div class="stack" style={{ gap: "4px", minWidth: 0 }}>
          <span class="lbl">Ahora</span>
          <strong style={{ fontSize: "17px" }}>{actual ? actual.titulo : "Todavía no parte el día"}</strong>
          {actual?.detalle && <span class="small">{actual.detalle}</span>}
          {siguiente && (
            <span class="small">
              Después, {siguiente.hora}: {siguiente.titulo.toLowerCase()}
            </span>
          )}
        </div>
      </div>
      <div class="card">
        <div class="between">
          <span class="lbl">¿Cuándo es el partido esta semana?</span>
        </div>
        <div class="seg">
          {(["sab", "dom"] as const).map((d) => (
            <button key={d} class={(prefs.partidoPorSemana[lunes] || "dom") === d ? "on" : ""} onClick={() => setPrefs({ partidoPorSemana: { ...prefs.partidoPorSemana, [lunes]: d } })}>
              {d === "sab" ? "Sábado" : "Domingo"}
            </button>
          ))}
        </div>
        <div class="semana-fila" aria-label="La semana según el partido">
          {Array.from({ length: 7 }, (_, k) => addDays(lunes, k)).map((f) => {
            const p = planDelDia(f, prefs.partidoPorSemana);
            return (
              <div key={f} class={`sem-dia ${f === hoy ? "hoy" : ""}`} style={{ minHeight: "64px" }} aria-label={`${DIAS[dow(f)]}: ${p.mdTxt}, ${p.manana.titulo}`}>
                <span class="sem-letra">{DIAS[dow(f)]}</span>
                <span style={{ fontSize: "11px", fontWeight: 700 }}>{p.md === 0 ? "⚽" : p.mdTxt.replace("MD", "")}</span>
                <span class="sem-dots">
                  <i style={{ background: COLOR_SESION[p.manana.tipo] }} />
                  <i style={{ background: COLOR_SESION[p.tarde.tipo] }} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <section class="card" aria-label="Horario de hoy">
        <span class="lbl">Hoy</span>
        <ol class="midia">
          {bloques.map((b) => {
            const ok = !!tareaDe(b.titulo)?.done.includes(hoy);
            const esAhora = actual?.hora === b.hora;
            return (
              <li key={b.hora} class={`midia-b ${esAhora ? "ahora" : ""} ${ok ? "ok" : ""} ${b.hora < ahora && !esAhora ? "paso" : ""}`}>
                <button class="midia-check" aria-pressed={ok} aria-label={`${ok ? "Desmarcar" : "Marcar"} ${b.titulo}`} onClick={() => tachar(b.titulo)}>
                  {ok && <Icon name="check" size={16} />}
                </button>
                <button class="midia-txt" onClick={() => b.ruta && go(b.ruta)} disabled={!b.ruta}>
                  <span class="midia-hora">{b.hora}</span>
                  <span class="stack" style={{ gap: "1px", minWidth: 0 }}>
                    <strong>{b.titulo}</strong>
                    {b.detalle && <span class="small">{b.detalle}</span>}
                  </span>
                  {b.ruta && <Icon name="der" size={16} />}
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      <section class="card" aria-label="Cumplimiento por semana">
        <span class="lbl">% del día cumplido, por semana</span>
        <Bars data={semanas} label="Porcentaje de bloques cumplidos por semana" fmt={(x) => `${x}%`} color="var(--green)" />
      </section>
      {saltados.length > 0 && (
        <section class="card" aria-label="Bloques que más te saltas">
          <span class="lbl">Lo que más te saltas (14 días)</span>
          <BarsH data={saltados.map((x) => ({ ...x, color: "var(--amber)" }))} total={14} label="Días saltados por bloque" fmt={(x) => `${x} ${x === 1 ? "día" : "días"}`} />
        </section>
      )}
      <section class="card" aria-label="Hora de dormir">
        <span class="lbl">Hora de dormir</span>
        {dormir.length >= 2 ? (
          <Line data={dormir} label="Hora en que te dormiste" cero={false} fmt={(x) => `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(Math.round(x % 60)).padStart(2, "0")}`} />
        ) : (
          <span class="small">Dile a JARVIS "me voy a dormir" cada noche y aquí verás a qué hora te acuestas (la meta: 23:00 para dormir 8,5 h).</span>
        )}
      </section>
    </main>
  );
}
