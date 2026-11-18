// Herramientas de JARVIS sobre los datos de la app (dinero, metas, fútbol, entreno,
// estudio, trabajo). Las usa el intérprete local y también Gemini con function calling.
// Todo lo que anota devuelve "undo" para deshacerlo con un toque o diciendo "deshaz eso".
import { addDays, dow, fechaCorta } from "../core/dates";
import type { ChileNow } from "../core/time";
import type { AppStore } from "../data/store";
import { uid, type Area, type Entreno, type Materia, type Meta, type Movimiento, type Partido, type Sesion, type Turno } from "../data/types";
import { mesDe } from "../money/calc";
import { clp } from "../money/format";
import { norm, type Routine } from "../routine/routine";
import type { Tool, ToolResult } from "../tools/registry";
import { horasTurno, movPropinas } from "../work/calc";
import { fraseClima, type Clima } from "../weather/clima";
import { buscarMeta, resumenAnio, categoriaPara, consultaDinero, consultaFutbol, consultaMetas, entrenoDeHoy, resumenHoy, resumenMes, resumenSemana } from "./resumenes";

export interface VidaDeps {
  store: AppStore;
  routine: Routine;
  clock: () => ChileNow;
  clima?: () => Promise<Clima | null>; // para el resumen de la mañana
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const cuando = (fecha: string, hoy: string) => (fecha === hoy ? "hoy" : fecha === addDays(hoy, -1) ? "ayer" : `el ${fechaCorta(fecha)}`);
const fechaOk = (f: unknown, hoy: string) => (typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoy ? f : hoy);
const entero = (v: unknown) => (typeof v === "number" ? Math.round(v) : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
const TILDES: Record<string, string> = { ingles: "Inglés", matematicas: "Matemáticas", matematica: "Matemática", fisica: "Física", quimica: "Química", biologia: "Biología", programacion: "Programación", musica: "Música", frances: "Francés", aleman: "Alemán", portugues: "Portugués", calculo: "Cálculo" };
const NOMBRE_ENTRENO: Record<string, string> = { gym: "Gimnasio", gim: "Gimnasio", gimnasio: "Gimnasio", pesas: "Gimnasio", pierna: "Pierna", piernas: "Pierna", correr: "Correr", trote: "Correr", core: "Core", cardio: "Cardio" };

export function vidaTools({ store, routine, clock, clima }: VidaDeps): Tool[] {
  const d = () => store.data;
  const hoy = () => clock().date;

  function movimiento(tipo: "ingreso" | "egreso", a: any): ToolResult {
    const monto = entero(a.monto);
    if (!monto || monto <= 0) return { ok: false, say: "¿De cuánto fue? Dímelo con el monto, por ejemplo 5 mil." };
    const desc = String(a.descripcion || "").trim();
    const cat = categoriaPara(a.categoria || desc, d().categorias, tipo) || d().categorias.find((c) => c.id === (tipo === "egreso" ? "c-otros" : "i-otros")) || d().categorias.find((c) => c.tipo === tipo);
    if (!cat) return { ok: false, say: "No tengo categorías de dinero. Revísalas en Dinero." };
    const fecha = fechaOk(a.fecha, hoy());
    const m: Movimiento = { id: uid(), tipo, monto, categoriaId: cat.id, fecha, nota: desc ? cap(desc) : undefined, creado: Date.now() };
    void store.put("movimientos", m);
    let say = `Anotado: ${tipo === "egreso" ? "gasto" : "ingreso"} de ${clp(monto)} en ${cat.nombre.toLowerCase()}${desc && norm(desc) !== norm(cat.nombre) ? ` (${desc})` : ""}, ${cuando(fecha, hoy())}.`;
    const pres = tipo === "egreso" ? d().presupuestos.find((p) => p.categoriaId === cat.id) : null;
    if (pres && mesDe(fecha) === mesDe(hoy())) {
      const llevas = d().movimientos.filter((x) => x.tipo === "egreso" && x.categoriaId === cat.id && mesDe(x.fecha) === mesDe(fecha)).reduce((s, x) => s + x.monto, 0);
      say += llevas > pres.monto ? ` Ojo: con esto te pasaste del presupuesto de ${cat.nombre.toLowerCase()} (${clp(llevas)} de ${clp(pres.monto)}).` : ` Llevas ${clp(llevas)} de ${clp(pres.monto)} este mes.`;
    }
    return { ok: true, say, privado: true, undo: () => store.remove("movimientos", m.id).then(() => {}) };
  }

  // Pide confirmación si no está claro dónde va o si el monto parece mal escuchado.
  function confirmarMov(tipo: "ingreso" | "egreso") {
    return (a: any): string | null => {
      const monto = entero(a.monto);
      if (!monto) return null;
      const cat = categoriaPara(a.categoria || a.descripcion, d().categorias, tipo);
      if (monto >= 1_000_000 && tipo === "egreso") return `¿Seguro que fueron ${clp(monto)}? Es harta plata. ¿Lo anoto?`;
      if (!cat) return `Anoto ${tipo === "egreso" ? "un gasto" : "un ingreso"} de ${clp(monto)}${a.descripcion ? ` por ${a.descripcion}` : ""} en ${tipo === "egreso" ? "otros gastos" : "otros ingresos"}, ¿ya? Si es otra categoría, dímelo así: "gasté ${monto >= 1000 ? `${Math.round(monto / 1000)} mil` : monto} en comida".`;
      return null;
    };
  }

  const montoParam = { type: "integer", description: "Monto en pesos chilenos, entero. '5 lucas' = 5000, '1,5 palos' = 1500000." };
  const fechaParam = { type: "string", description: "AAAA-MM-DD. Omitir si es hoy." };

  return [
    {
      name: "registrar_gasto",
      description: "Anota un gasto en Dinero. Úsala cuando Diego cuenta que gastó, pagó o compró algo.",
      parameters: { type: "object", properties: { monto: montoParam, descripcion: { type: "string", description: "En qué fue, en pocas palabras (almuerzo, micro, zapatillas)." }, categoria: { type: "string", description: "Categoría si la dijo: comida, transporte, salidas, deporte, celular e internet, ropa, estudios u otros." }, fecha: fechaParam }, required: ["monto"] },
      needsConfirm: confirmarMov("egreso"),
      run: (a) => movimiento("egreso", a),
    },
    {
      name: "registrar_ingreso",
      description: "Anota un ingreso en Dinero: sueldo, propinas, trabajos extra u otros.",
      parameters: { type: "object", properties: { monto: montoParam, descripcion: { type: "string", description: "De dónde vino: sueldo, propina, pololo…" }, fecha: fechaParam }, required: ["monto"] },
      needsConfirm: confirmarMov("ingreso"),
      run: (a) => movimiento("ingreso", a),
    },
    {
      name: "registrar_entreno",
      description: "Anota que Diego entrenó (gimnasio, correr, pierna, core…). También tacha la tarea de la rutina que calce.",
      parameters: { type: "object", properties: { tipo: { type: "string" }, minutos: { type: "integer" }, km: { type: "number" }, esfuerzo: { type: "integer", description: "1 a 10" }, fecha: fechaParam }, required: ["tipo"] },
      run: (a) => {
        const fecha = fechaOk(a.fecha, hoy());
        const tipo = norm(String(a.tipo || "entrenamiento"));
        const plan = d().planes.find((p) => p.id === "activo");
        const ses = plan?.sesiones.find((s) => s.dia === dow(fecha));
        const generico = /^(gym|gim|gimnasio|pesas|entrenamiento|entreno|fisico|rutina)$/.test(tipo);
        const nombre = generico && ses ? ses.nombre : NOMBRE_ENTRENO[tipo] || cap(tipo);
        const ya = d().entrenos.find((e) => e.fecha === fecha && norm(e.nombre) === norm(nombre));
        if (ya) return { ok: true, say: `Ya tenías anotado ${nombre.toLowerCase()} ${cuando(fecha, hoy())}. No lo dupliqué.` };
        const extra = [a.minutos ? `${entero(a.minutos)} min` : "", a.km ? `${a.km} km` : ""].filter(Boolean).join(" · ");
        const esf = entero(a.esfuerzo);
        const e: Entreno = { id: uid(), fecha, nombre, items: [], ...(generico && ses ? { sesionId: ses.id } : {}), ...(esf && esf <= 10 ? { rpe: esf } : {}), ...(extra ? { nota: extra } : {}) };
        void store.put("entrenos", e);
        // Si en la rutina hay algo que calce (gym, entrenar), se tacha también.
        const task = fecha === hoy() ? routine.find(tipo, dow(fecha)) || (generico ? routine.find("entrenar", dow(fecha)) : null) : null;
        const yaHecha = task ? routine.dayStatus(fecha, dow(fecha)).done.includes(task) : true;
        if (task && !yaHecha) routine.check(task, fecha);
        const semana = d().entrenos.filter((x) => x.fecha >= addDays(fecha, -dow(fecha)) && x.fecha <= addDays(fecha, 6 - dow(fecha))).length;
        const say = `Anotado: ${nombre.toLowerCase()} ${cuando(fecha, hoy())}${extra ? ` (${extra})` : ""}.${task && !yaHecha ? ` Taché ${task.title} en la rutina.` : ""} Llevas ${semana} ${semana === 1 ? "entreno" : "entrenos"} esta semana. Bien ahí.`;
        return {
          ok: true,
          say,
          undo: async () => {
            await store.remove("entrenos", e.id);
            if (task && !yaHecha) routine.uncheck(task, fecha);
          },
        };
      },
    },
    {
      name: "registrar_partido",
      description: "Anota lo que hizo Diego en un partido: goles, asistencias, minutos, resultado, nota (1 a 10), rival. Se suma al partido de ese día si existe.",
      parameters: { type: "object", properties: { goles: { type: "integer" }, asistencias: { type: "integer" }, minutos: { type: "integer" }, resultado: { type: "string", enum: ["ganado", "perdido", "empate"] }, goles_favor: { type: "integer" }, goles_contra: { type: "integer" }, calificacion: { type: "integer" }, rival: { type: "string" }, fecha: fechaParam } },
      run: (a) => {
        const h = hoy();
        const fecha = fechaOk(a.fecha, h);
        const ps = d().partidos;
        // El partido de ese día; si no, uno reciente sin registrar; si no, uno nuevo.
        const target =
          ps.find((p) => p.fecha === fecha && p.tipo === "partido") ||
          (!a.fecha ? ps.filter((p) => p.tipo === "partido" && p.fui == null && p.fecha < h && p.fecha >= addDays(h, -2)).sort((x, z) => z.fecha.localeCompare(x.fecha))[0] : undefined);
        const antes = target ? { ...target } : null;
        const p: Partido = target ? { ...target } : { id: uid(), tipo: "partido", fecha, temporada: fecha.slice(0, 4) };
        p.fui = true;
        const n = (k: string) => entero(a[k]);
        if (n("goles") != null) p.goles = n("goles");
        if (n("asistencias") != null) p.asistencias = n("asistencias");
        if (n("minutos") != null) p.minutos = Math.min(130, n("minutos")!);
        if (n("calificacion") != null && n("calificacion")! >= 1 && n("calificacion")! <= 10) p.calificacion = n("calificacion");
        if (a.rival && !p.rival) p.rival = cap(String(a.rival));
        if (n("goles_favor") != null && n("goles_contra") != null) {
          p.golesFavor = n("goles_favor");
          p.golesContra = n("goles_contra");
        } else if (a.resultado === "empate" && p.golesFavor == null) {
          p.golesFavor = 0;
          p.golesContra = 0;
        }
        void store.put("partidos", p);
        const lo: string[] = [];
        if (p.goles) lo.push(`${p.goles} ${p.goles === 1 ? "gol" : "goles"}`);
        if (p.asistencias) lo.push(`${p.asistencias} ${p.asistencias === 1 ? "asistencia" : "asistencias"}`);
        if (p.minutos) lo.push(`${p.minutos} minutos`);
        if (p.calificacion) lo.push(`nota ${p.calificacion}`);
        if (p.golesFavor != null && p.golesContra != null) lo.push(`${p.golesFavor > p.golesContra ? "ganaron" : p.golesFavor < p.golesContra ? "perdieron" : "empataron"} ${p.golesFavor} a ${p.golesContra}`);
        const falta = [p.minutos == null ? "los minutos" : "", p.calificacion == null ? "qué nota te pones del 1 al 10" : ""].filter(Boolean);
        const say = `Anotado en el partido ${cuando(p.fecha, h)}${p.rival ? ` contra ${p.rival}` : ""}: ${lo.join(", ") || "que jugaste"}.${(p.goles || 0) > 0 ? " ¡Bien ahí!" : ""}${falta.length ? ` Si quieres, dime ${falta.join(" y ")}.` : ""}`;
        return { ok: true, say, undo: () => (antes ? store.put("partidos", antes) : store.remove("partidos", p.id).then(() => {})) };
      },
    },
    {
      name: "crear_meta",
      description: "Crea una meta. tipo: monto (plata), cantidad (un número con unidad), habito (veces por semana) o pasos.",
      parameters: { type: "object", properties: { nombre: { type: "string" }, tipo: { type: "string", enum: ["monto", "cantidad", "habito", "pasos"] }, objetivo: { type: "number" }, unidad: { type: "string" }, fecha_limite: { type: "string", description: "AAAA-MM-DD" } }, required: ["nombre", "tipo"] },
      run: (a) => {
        const h = hoy();
        const tipo = (["monto", "cantidad", "habito", "pasos"].includes(a.tipo) ? a.tipo : "pasos") as Meta["tipo"];
        const objetivo = Number(a.objetivo) || 0;
        if (tipo !== "pasos" && objetivo <= 0) return { ok: false, say: "¿Cuánto es la meta? Dímelo con un número, por ejemplo: meta de ahorrar 200 mil para marzo." };
        let nombre = cap(String(a.nombre || "").trim());
        if (tipo === "monto" && /^(ahorrar|juntar|ahorro)$/i.test(nombre)) nombre = `Ahorrar ${clp(objetivo)}`;
        if (tipo === "habito") nombre = `${nombre} ${objetivo} ${objetivo === 1 ? "vez" : "veces"} por semana`;
        const sinFecha = !(typeof a.fecha_limite === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.fecha_limite) && a.fecha_limite > h);
        const fechaLimite = sinFecha ? addDays(h, 90) : a.fecha_limite;
        const t = norm(nombre);
        const area: Area = tipo === "monto" ? "dinero" : /ingles|estudi|leer|libro|curso|prueba|paes/.test(t) ? "estudios" : /futbol|gol|partido|club/.test(t) ? "futbol" : /correr|gym|gimnasio|kilo|kg|peso|entren|nadar|abdominal/.test(t) ? "cuerpo" : /trabaj|turno|horas extra/.test(t) ? "trabajo" : "otro";
        const m: Meta = { id: uid(), nombre, area, tipo, objetivo, ...(tipo === "cantidad" && a.unidad ? { unidad: String(a.unidad) } : {}), inicio: h, fechaLimite, fuente: "manual", ...(tipo === "pasos" ? { pasos: [] } : {}), creado: Date.now() };
        void store.put("metas", m);
        const say = `Creé la meta "${nombre}" para el ${fechaCorta(fechaLimite)}${sinFecha ? " (no me dijiste fecha, así que le puse 3 meses; cámbiala en Metas si quieres)" : ""}.${tipo === "monto" ? ' Cuando guardes plata, dime "aporté 20 mil a la meta" y la voy llenando.' : tipo === "pasos" ? " Agrégale los pasos en Metas." : ""}`;
        return { ok: true, say, undo: () => store.remove("metas", m.id).then(() => {}) };
      },
    },
    {
      name: "aportar_meta",
      description: "Suma un avance a una meta manual (plata ahorrada, unidades, una vez del hábito).",
      parameters: { type: "object", properties: { meta: { type: "string", description: "Nombre o parte del nombre de la meta" }, valor: { type: "number" } }, required: ["meta", "valor"] },
      run: (a) => {
        const manuales = d().metas.filter((x) => !x.archivada && x.fuente === "manual" && (Number(a.valor) >= 100 ? x.tipo === "monto" : x.tipo !== "pasos"));
        // "aporté 20 lucas a la meta" sin decir cuál: si hay una sola meta donde se pueda aportar, va ahí.
        const sinNombre = !norm(String(a.meta || "")).replace(/^(la |mi )?meta$/, "");
        const m = sinNombre ? (manuales.length === 1 ? manuales[0] : null) : buscarMeta(d().metas.filter((x) => !x.archivada), String(a.meta || ""));
        if (!m && sinNombre && manuales.length > 1) return { ok: false, say: `¿A cuál meta? Tienes ${manuales.map((x) => x.nombre).join(", ")}. Dímelo así: "aporté 20 lucas a la meta ${manuales[0].nombre.toLowerCase()}".` };
        if (!m) return { ok: false, say: `No encontré esa meta. Tienes ${d().metas.filter((x) => !x.archivada).map((x) => x.nombre).join(", ") || "ninguna"}.` };
        if (m.fuente !== "manual") return { ok: false, say: `"${m.nombre}" se llena sola desde ${m.fuente === "ahorro" ? "lo que te sobra en Dinero" : m.fuente === "horas-estudio" ? "tus horas de estudio" : "tus horas de trabajo"}, no hace falta anotarle nada.` };
        if (m.tipo === "pasos") return { ok: false, say: `"${m.nombre}" va por pasos: márcalos en Metas.` };
        const valor = Number(a.valor);
        if (!(valor > 0)) return { ok: false, say: "¿Cuánto le sumo?" };
        const ap = { id: uid(), metaId: m.id, fecha: hoy(), valor };
        void store.put("aportes", ap);
        const total = d().aportes.filter((x) => x.metaId === m.id).reduce((s, x) => s + x.valor, 0);
        const pct = m.objetivo ? Math.round((total / (m.tipo === "habito" ? m.objetivo : m.objetivo)) * 100) : 0;
        const say = m.tipo === "monto" ? `Sumé ${clp(valor)} a "${m.nombre}". Llevas ${clp(total)} de ${clp(m.objetivo)} (${pct}%).` : `Sumé ${valor}${m.unidad ? " " + m.unidad : ""} a "${m.nombre}".`;
        return { ok: true, say, privado: m.tipo === "monto", undo: () => store.remove("aportes", ap.id).then(() => {}) };
      },
    },
    {
      name: "registrar_estudio",
      description: "Anota minutos de estudio de una materia (inglés, matemáticas…).",
      parameters: { type: "object", properties: { materia: { type: "string" }, minutos: { type: "integer" }, fecha: fechaParam }, required: ["materia", "minutos"] },
      needsConfirm: (a) => {
        const mats = d().materias;
        return mats.length && !buscarMateria(mats, a.materia) ? `No tienes la materia "${a.materia}". ¿La creo y te anoto ${entero(a.minutos)} minutos?` : null;
      },
      run: (a) => {
        const minutos = entero(a.minutos);
        if (!minutos || minutos <= 0) return { ok: false, say: "¿Cuánto rato estudiaste?" };
        const fecha = fechaOk(a.fecha, hoy());
        let mat = buscarMateria(d().materias, a.materia);
        const nueva = !mat;
        if (!mat) {
          const nom = norm(String(a.materia || "estudio"));
          mat = { id: uid(), nombre: TILDES[nom] || cap(nom) };
          void store.put("materias", mat);
        }
        const s: Sesion = { id: uid(), materiaId: mat.id, fecha, minutos };
        void store.put("sesiones", s);
        const lunes = addDays(fecha, -dow(fecha));
        const semana = d().sesiones.filter((x) => x.materiaId === mat!.id && x.fecha >= lunes && x.fecha <= addDays(lunes, 6)).reduce((t, x) => t + x.minutos, 0) / 60;
        const meta = mat.metaHorasSemana;
        const hrs = (v: number) => (Math.round(v * 10) / 10).toLocaleString("es-CL");
        const say = `Anotado: ${minutos} minutos de ${mat.nombre.toLowerCase()} ${cuando(fecha, hoy())}.${nueva ? " Creé la materia." : ""} Esta semana llevas ${hrs(semana)} ${semana === 1 ? "hora" : "horas"}${meta ? ` de ${hrs(meta)}` : ""}.`;
        return {
          ok: true,
          say,
          undo: async () => {
            await store.remove("sesiones", s.id);
            if (nueva) await store.remove("materias", mat!.id);
          },
        };
      },
    },
    {
      name: "registrar_turno",
      description: "Anota un turno de trabajo con hora de inicio y fin (HH:MM), pausa en minutos y propinas en pesos.",
      parameters: { type: "object", properties: { inicio: { type: "string" }, fin: { type: "string" }, pausa_min: { type: "integer" }, propinas: { type: "integer" }, fecha: fechaParam }, required: ["inicio", "fin"] },
      run: (a) => {
        if (!/^\d{2}:\d{2}$/.test(a.inicio || "") || !/^\d{2}:\d{2}$/.test(a.fin || "")) return { ok: false, say: "¿De qué hora a qué hora fue el turno?" };
        const fecha = fechaOk(a.fecha, hoy());
        const t: Turno = { id: uid(), fecha, inicio: a.inicio, fin: a.fin, pausaMin: entero(a.pausa_min) || 0, ...(entero(a.propinas) ? { propinas: entero(a.propinas) } : {}) };
        void store.put("turnos", t);
        const mov = movPropinas(t);
        if (mov) void store.put("movimientos", mov);
        const h = (Math.round(horasTurno(t) * 10) / 10).toLocaleString("es-CL");
        return {
          ok: true,
          say: `Anotado: turno ${cuando(fecha, hoy())} de ${t.inicio} a ${t.fin}, ${h} horas${mov ? ` y ${clp(mov.monto)} de propinas en Dinero` : ""}.`,
          privado: !!mov,
          undo: async () => {
            await store.remove("turnos", t.id);
            if (mov) await store.remove("movimientos", mov.id);
          },
        };
      },
    },
    {
      name: "consultar_dinero",
      description: "Cuánto lleva gastado o le ha entrado, calculado en el teléfono. periodo: hoy, semana, mes o mes-pasado. tipo: egreso o ingreso.",
      parameters: { type: "object", properties: { periodo: { type: "string", enum: ["hoy", "semana", "mes", "mes-pasado"] }, tipo: { type: "string", enum: ["egreso", "ingreso"] }, categoria: { type: "string" } } },
      run: (a) => {
        const r = consultaDinero(d(), hoy(), a);
        return { ok: true, say: r.texto, privado: r.privado };
      },
    },
    {
      name: "consultar_metas",
      description: "Cómo va con sus metas (todas o una por nombre).",
      parameters: { type: "object", properties: { nombre: { type: "string" } } },
      run: (a) => {
        const r = consultaMetas(d(), hoy(), a.nombre);
        return { ok: true, say: r.texto, privado: r.privado };
      },
    },
    {
      name: "consultar_futbol",
      description: "Estadísticas de fútbol de la temporada y el próximo partido o entrenamiento.",
      parameters: { type: "object", properties: {} },
      run: () => ({ ok: true, say: consultaFutbol(d(), hoy()).texto }),
    },
    {
      name: "entreno_de_hoy",
      description: "Qué sesión de entrenamiento físico le toca hoy según su plan, ajustada a cómo está y a los partidos.",
      parameters: { type: "object", properties: {} },
      run: () => ({ ok: true, say: entrenoDeHoy(d(), hoy()).texto }),
    },
    {
      name: "resumen",
      description: "Resumen corto: tipo hoy (lo que le toca), manana (resumen de la mañana, con el clima), semana, mes o anio (mi año en números).",
      parameters: { type: "object", properties: { tipo: { type: "string", enum: ["hoy", "manana", "semana", "mes", "anio"] } }, required: ["tipo"] },
      run: async (a) => {
        const n = clock();
        let r;
        if (a.tipo === "semana") r = resumenSemana(d(), n.date);
        else if (a.tipo === "mes") r = resumenMes(d(), n.date);
        else if (a.tipo === "anio") r = resumenAnio(d(), n.date);
        else {
          const c = a.tipo === "manana" && clima ? await clima().catch(() => null) : null;
          const partidoHoy = d().partidos.some((p) => p.fecha === n.date && p.fui == null);
          const climaTxt = fraseClima(c, n.date, { partido: partidoHoy });
          const { done, pending } = routine.dayStatus(n.date, n.dow);
          const ay = routine.dayStatus(addDays(n.date, -1), (n.dow + 6) % 7);
          r = resumenHoy(d(), n.date, n.minutes, { hechas: done.map((t) => t.title), pendientes: pending.map((t) => ({ titulo: t.title, hora: t.time })), ayerPendientes: ay.pending.map((t) => t.title) }, a.tipo === "manana", { clima: climaTxt });
        }
        return { ok: true, say: r.texto, privado: r.privado };
      },
    },
  ];
}

function buscarMateria(mats: Materia[], q: unknown): Materia | null {
  const t = norm(String(q || ""));
  if (!t) return null;
  return mats.find((m) => norm(m.nombre) === t) || mats.find((m) => norm(m.nombre).includes(t) || t.includes(norm(m.nombre))) || mats.find((m) => norm(m.nombre).split(" ").some((w) => w.length > 3 && t.split(" ").includes(w))) || null;
}
