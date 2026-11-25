// JARVIS lee las 4 secciones del plan (Fútbol, Estudio, Comida y Mi Día) y responde:
// "¿qué me toca hoy?", "¿cómo voy esta semana?", "¿cuánta proteína me falta?", "¿qué estudio hoy?",
// "¿qué errores tengo que repasar?", "¿cuánto mejoré en el sprint?"; y anota comidas y peso.
import { agendaDia } from "./avisos";
import { addDays, lunesDe } from "../core/dates";
import { hhmm, joinY } from "../core/texto";
import type { ChileNow } from "../core/time";
import type { AppStore } from "../data/store";
import { uid, type Comida } from "../data/types";
import { bloqueActual, faseDe, horarioDelDia, planDelDia, type DiaPartido } from "../plan/bloque";
import { gramosDe, ITEMS, proteinaDia, rachaCreatina, type ConfigComida, type ItemComida } from "../plan/comida";
import { ejeDeLaSemana, estudioDeHoy, materia, TEMAS, temaDeLaSemana, tocanHoy, todasLasSesiones } from "../plan/estudio";
import { cumplimiento, serieTest } from "../plan/futbolCalc";
import { norm, type Routine } from "../routine/routine";
import type { Tool } from "../tools/registry";

export interface PlanDeps {
  store: AppStore;
  routine: Routine;
  clock: () => ChileNow;
  prefs: () => { partidoPorSemana: Record<string, DiaPartido>; fechaPrueba: string; comida: ConfigComida };
  metaHabito?: (nombre: string, fecha: string) => void; // suma un día a una meta de hábito ("Creatina todos los días")
}

const min = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function planTools({ store, routine, clock, prefs, metaHabito }: PlanDeps): Tool[] {
  const d = () => store.data;
  const textoPlan = (saludo: boolean) => {
    const n = clock();
    const p = planDelDia(n.date, prefs().partidoPorSemana);
    const fase = faseDe(n.date, undefined, prefs().fechaPrueba || null);
    const e = estudioDeHoy(n.date);
    const b = bloqueActual(horarioDelDia(n.date, prefs().partidoPorSemana), hhmm(n.minutes));
    const futbol = p.md === 0 ? "Hoy es día de partido: activación y a jugar." : `Mañana: ${min(p.manana.titulo)}; tarde: ${min(p.tarde.titulo)}.`;
    const estudio = e.materia ? `Estudio a las 13:45: ${materia(e.materia).nombre}.` : e.ensayo ? `Hoy puedes hacer un mini-ensayo de ${e.ensayo === "mate" ? "Matemática" : "Lenguaje"}.` : "Hoy no hay estudio.";
    const extra = `Perro: ${min(p.perro)}. ${p.mdTxt}, fase ${fase.nombre}${fase.diasPrueba != null ? `, faltan ${fase.diasPrueba} días para tu prueba` : ""}.`;
    // Lo demás de la agenda (turnos, pruebas, recordatorios, cumpleaños), sin la rutina.
    const otros = agendaDia(d(), [], n.date).filter((x) => !/^Físico/.test(x)).slice(0, 4);
    const ademas = otros.length ? ` Además: ${joinY(otros)}.` : "";
    if (saludo) return `Buenos días, Diego. ${futbol}\n${estudio}${ademas}\n${extra}`;
    return `${futbol} ${estudio}${ademas} ${extra}${b.actual ? ` Ahora: ${min(b.actual.titulo)}${b.siguiente ? `; después, a las ${b.siguiente.hora}, ${min(b.siguiente.titulo)}` : ""}.` : ""}`;
  };
  return [
    {
      name: "plan_de_hoy",
      description: "Lo que le toca hoy a Diego: sesión de fútbol de la mañana y la tarde (según el día al partido), materia de estudio, el perro y el bloque del día en que va.",
      parameters: { type: "object", properties: { saludo: { type: "boolean" } } },
      run: (a) => ({ ok: true, say: textoPlan(!!a.saludo) }),
    },
    {
      name: "como_voy_semana",
      description: "Cómo va la semana en entrenamiento (sesiones hechas vs planificadas), estudio (minutos y días) y comida (proteína y creatina).",
      parameters: { type: "object", properties: { detalle: { type: "string" } } },
      run: () => {
        const n = clock();
        const lunes = lunesDe(n.date);
        const c = cumplimiento(d().entrenos, lunes, addDays(lunes, 6), prefs().partidoPorSemana, n.date);
        const log = todasLasSesiones(d().estudio, d().sesiones, d().materias).filter((x) => x.fecha >= lunes);
        const minutos = log.reduce((t, x) => t + x.minutos, 0);
        const dias = new Set(log.filter((x) => x.minutos >= 15).map((x) => x.fecha)).size;
        const cs = d().comidas.filter((x) => x.id >= lunes && x.id <= n.date);
        const prom = cs.length ? Math.round(cs.reduce((t, x) => t + proteinaDia(x, prefs().comida), 0) / cs.length) : 0;
        const crea = cs.filter((x) => x.creatina).length;
        const diasSemana = Math.round((Date.parse(n.date) - Date.parse(lunes)) / 864e5) + 1;
        return {
          ok: true,
          say: `Esta semana: entrenamiento ${c.hechas} de ${c.plan} sesiones${c.plan && c.hechas >= c.plan ? ", al día" : ""}. Estudio ${minutos} minutos en ${dias} ${dias === 1 ? "día" : "días"}. Comida: ${cs.length ? `proteína promedio ${prom} g de ${prefs().comida.meta}` : "no has anotado comidas"}, creatina ${crea} de ${diasSemana} días.`,
        };
      },
    },
    {
      name: "proteina",
      description: "Cuánta proteína lleva hoy y cuánta le falta para la meta, con lo que le queda por comer.",
      parameters: { type: "object", properties: {} },
      run: () => {
        const n = clock();
        const x = d().comidas.find((c) => c.id === n.date);
        const c = prefs().comida;
        const lleva = proteinaDia(x, c);
        const faltan = ITEMS.filter((i) => i.k !== "creatina" && !x?.[i.k]);
        if (lleva >= c.meta) return { ok: true, say: `Llevas ${lleva} g de proteína: meta cumplida. Bien ahí.` };
        return { ok: true, say: `Llevas ${lleva} g de ${c.meta}: te faltan ${c.meta - lleva} g.${faltan.length ? ` Te queda: ${joinY(faltan.map((i) => `${min(i.nombre.split(":")[0])} (~${gramosDe(i.k, c)} g)`))}.` : " Te falta una porción extra: un batido o huevos."}${x?.creatina ? "" : " Y no olvides la creatina."}` };
      },
    },
    {
      name: "que_estudio",
      description: "Qué estudia hoy (materia del día, tema de la semana) y qué tarjetas o errores tiene para repasar.",
      parameters: { type: "object", properties: {} },
      run: () => {
        const n = clock();
        const e = estudioDeHoy(n.date);
        const t = tocanHoy(d().tarjetas, n.date).length;
        const er = tocanHoy(d().errores, n.date).length;
        let tema = "";
        if (e.materia === "mate") tema = ` Esta semana: ${ejeDeLaSemana(n.date).nombre}.`;
        if (e.materia === "ventas" || e.materia === "economia") tema = ` Tema de la semana: ${TEMAS[e.materia][temaDeLaSemana(n.date)].titulo}.`;
        return { ok: true, say: `${e.materia ? `Hoy a las 13:45: ${materia(e.materia).nombre}, ${materia(e.materia).como}.` : e.texto + "."}${tema}${t ? ` Tienes ${t} tarjetas de inglés para repasar.` : ""}${er ? ` Y ${er} ${er === 1 ? "error" : "errores"} del cuaderno para rehacer.` : ""}` };
      },
    },
    {
      name: "errores_repasar",
      description: "Los errores del cuaderno (Matemática y Lenguaje) que tiene que rehacer hoy.",
      parameters: { type: "object", properties: {} },
      run: () => {
        const n = clock();
        const er = tocanHoy(d().errores, n.date);
        if (!er.length) return { ok: true, say: `No tienes errores para repasar hoy.${d().errores.some((x) => !x.resuelto) ? " Los que quedan vuelven en unos días." : ""}` };
        return { ok: true, say: `Hoy rehaces sin mirar: ${joinY(er.slice(0, 5).map((x) => `${x.descripcion} (${materia(x.materia).corto})`))}${er.length > 5 ? `, y ${er.length - 5} más` : ""}. Están en Estudio.` };
      },
    },
    {
      name: "mejora_sprint",
      description: "Cuánto mejoró en los tests de sprint (10 m y 30 m) y 5-10-5 entre los tests del bloque.",
      parameters: { type: "object", properties: {} },
      run: () => {
        const partes = (["sprint10", "sprint30", "t5105"] as const)
          .map((k) => {
            const s = serieTest(d().tests, k);
            if (s.pts.length < 2) return null;
            const nombre = k === "sprint10" ? "sprint de 10 m" : k === "sprint30" ? "sprint de 30 m" : "5-10-5";
            const a = s.pts[0].valor;
            const b = s.pts[s.pts.length - 1].valor;
            return `${nombre}: de ${String(a).replace(".", ",")} a ${String(b).replace(".", ",")} s (${s.mejor ? `${String(Math.abs(s.cambio!)).replace(".", ",")}% más rápido` : s.mejor === false ? `${String(Math.abs(s.cambio!)).replace(".", ",")}% más lento` : "igual"})`;
          })
          .filter(Boolean);
        if (!partes.length) return { ok: true, say: d().tests.length ? "Necesito al menos dos tests para comparar. El próximo es en la semana 4." : "Todavía no anotas tests. Hazlos esta semana y anótalos en Fútbol › Físico › Tests." };
        return { ok: true, say: `${joinY(partes as string[])}.` };
      },
    },
    {
      name: "marcar_comida",
      description: "Marca algo de la comida de hoy: creatina, desayuno (avena + proteína), batido, almuerzo, colación u once.",
      parameters: { type: "object", properties: { item: { type: "string", enum: ["creatina", "desayuno", "batido", "almuerzo", "colacion", "once"] } }, required: ["item"] },
      run: async (a) => {
        const n = clock();
        const k = a.item as ItemComida;
        const it = ITEMS.find((i) => i.k === k);
        if (!it) return { ok: false, say: "¿Qué comiste? Creatina, desayuno, batido, almuerzo, colación u once." };
        const antes: Comida = d().comidas.find((c) => c.id === n.date) || { id: n.date };
        const nuevo = { ...antes, [k]: true };
        await store.put("comidas", nuevo);
        const t = routine.tasks.find((r) => norm(r.title) === norm(it.rutina));
        const tache = t && ITEMS.filter((i) => i.rutina === it.rutina).every((i) => nuevo[i.k]) && !t.done.includes(n.date);
        if (tache) routine.check(t!, n.date);
        if (k === "creatina") metaHabito?.("Creatina todos los días", n.date);
        const p = proteinaDia(nuevo, prefs().comida);
        const meta = prefs().comida.meta;
        return {
          ok: true,
          say: k === "creatina" ? `Anotada la creatina. Llevas ${rachaCreatina(d().comidas, n.date)} días seguidos.` : `Anotado: ${min(it.nombre.split(":")[0])}. Llevas ~${p} g de proteína${p >= meta ? ": meta cumplida" : `, te faltan ${meta - p} g`}.`,
          undo: async () => {
            await store.put("comidas", antes);
            if (tache) routine.uncheck(t!, n.date);
          },
        };
      },
    },
    {
      name: "anotar_peso",
      description: "Anota el peso corporal de hoy en kilos.",
      parameters: { type: "object", properties: { kg: { type: "number" } }, required: ["kg"] },
      run: async (a) => {
        const n = clock();
        const kg = Math.round(Number(a.kg) * 10) / 10;
        if (!(kg > 30 && kg < 200)) return { ok: false, say: "¿Cuánto pesas? Dime por ejemplo: peso 70,5 kilos." };
        const antes = d().pesos.find((p) => p.id === n.date);
        const prev = [...d().pesos].filter((p) => p.id < n.date).sort((x, y) => y.id.localeCompare(x.id))[0];
        await store.put("pesos", { id: n.date, kg });
        const dif = prev ? Math.round((kg - prev.kg) * 10) / 10 : null;
        return {
          ok: true,
          say: `Anotado: ${String(kg).replace(".", ",")} kg.${dif != null ? ` ${dif > 0 ? `Subiste ${String(dif).replace(".", ",")} kg` : dif < 0 ? `Bajaste ${String(-dif).replace(".", ",")} kg` : "Igual que la vez anterior"} desde el ${Number(prev!.id.slice(8))}/${Number(prev!.id.slice(5, 7))}.` : ""}`,
          undo: () => (antes ? store.put("pesos", antes) : store.remove("pesos", n.date).then(() => {})),
        };
      },
    },
  ];
}

// Frases → herramientas del plan.
export function parsePlan(t: string): { tool: string; args: Record<string, unknown> } | null {
  if (/^(que (me toca|tengo|hago) hoy|que toca hoy|mi plan (de|para) hoy|el plan de hoy|plan de hoy|que me toca hacer hoy)\b/.test(t)) return { tool: "plan_de_hoy", args: {} };
  if (/^como voy( esta semana| en la semana| con todo)?$|^como (va|vamos) (la|esta) semana con (el )?(plan|bloque)/.test(t)) return { tool: "como_voy_semana", args: {} };
  if (/\bcuanta proteina\b|\bproteina (me falta|llevo|tengo)\b|\bcuanto (me falta|llevo) de proteina\b/.test(t)) return { tool: "proteina", args: {} };
  if (/^que (estudio|me toca estudiar|tengo que estudiar)( hoy)?$|^que materia (toca|me toca)( hoy)?$/.test(t)) return { tool: "que_estudio", args: {} };
  if (/\bque errores\b|\berrores (tengo que|para|que tengo que) repasar\b|\bcuaderno de errores\b/.test(t)) return { tool: "errores_repasar", args: {} };
  if (/\bcuanto (mejore|he mejorado|mejore en)\b.*\b(sprint|velocidad|5-10-5|tests?)\b|\bcomo voy en (el )?sprint\b|\bmejore (en )?el sprint\b/.test(t)) return { tool: "mejora_sprint", args: {} };
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(?:ya )?(?:hoy )?(?:peso|pese|me pese|estoy pesando|ando pesando)\s+(\d{2,3}(?:[.,]\d+)?)\s*(?:kilos?|kg|k)?$/))) return { tool: "anotar_peso", args: { kg: Number(m[1].replace(",", ".")) } };
  if (/\b(?:me )?(?:tome|tomé) (?:la |mi )?creatina\b|\bcreatina (lista|tomada)\b/.test(t)) return { tool: "marcar_comida", args: { item: "creatina" } };
  if (/\b(?:me )?(?:tome|tomé|hice) (?:el |mi )?batido\b/.test(t)) return { tool: "marcar_comida", args: { item: "batido" } };
  if (/\b(?:desayune|desayuné|tome desayuno)\b/.test(t)) return { tool: "marcar_comida", args: { item: "desayuno" } };
  if (/\b(?:almorce|almorcé)\b/.test(t)) return { tool: "marcar_comida", args: { item: "almuerzo" } };
  if (/\b(?:tome|tomé|comi|comí) (?:la |mi )?colacion\b/.test(t)) return { tool: "marcar_comida", args: { item: "colacion" } };
  if (/\b(?:tome once|tomé once|cene|cené)\b/.test(t)) return { tool: "marcar_comida", args: { item: "once" } };
  return null;
}
void uid;
