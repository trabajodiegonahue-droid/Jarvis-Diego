// Consultas y resúmenes de JARVIS. Todo se calcula aquí, en el teléfono: Gemini nunca
// recibe la lista de movimientos. Cada respuesta dice si trae cifras de plata ("privado"),
// para no mandarlas al modelo cuando el modo privado está activo.
import { addDays, diffDays, dow, fechaCorta, lunesDe } from "../core/dates";
import { DAY_NAMES } from "../core/time";
import type { Categoria, Datos, Meta } from "../data/types";
import { proximoEvento, statsTemporada, sinRegistrar } from "../futbol/calc";
import { avance, faltaSemana } from "../goals/calc";
import { ESTADO_META, fmtValor } from "../goals/format";
import { diasDelMes, estadoPresupuestos, fraseDinero, mesDe, nombreMes, porCategoria, sumarMeses, totalesMes } from "../money/calc";
import { clp } from "../money/format";
import { norm } from "../routine/routine";
import { horasEnSemana, metaSemanalTotal, proximasEvaluaciones, tareasPendientes } from "../study/calc";
import { ejercicio } from "../training/ejercicios";
import { cargaDelDia, semanaEntreno, sesionDeHoy, seriesAjustadas } from "../training/calc";
import { horasSemana, horasMes, turnoDeHoy } from "../work/calc";

export interface Respuesta {
  texto: string;
  privado: boolean; // trae montos de dinero
}

export interface RutinaHoy {
  hechas: string[];
  pendientes: { titulo: string; hora: string }[];
  ayerPendientes: string[];
}

const horas = (h: number) => {
  const r = Math.round(h * 10) / 10;
  return `${r.toLocaleString("es-CL")} ${r === 1 ? "hora" : "horas"}`;
};
const y = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const veces = (n: number) => `${n} ${n === 1 ? "vez" : "veces"}`;
const diaDe = (fecha: string, hoy: string) => {
  const d = diffDays(fecha, hoy);
  return d === 0 ? "hoy" : d === 1 ? "mañana" : d === -1 ? "ayer" : d > 1 && d < 7 ? `el ${DAY_NAMES[dow(fecha)]}` : `el ${fechaCorta(fecha)}`;
};

// Palabras del día a día que caen en cada categoría base. Las categorías propias se buscan por nombre.
export const PISTAS: Record<string, string[]> = {
  "c-comida": ["comida", "almuerzo", "almorzar", "once", "desayuno", "cena", "super", "supermercado", "lider", "jumbo", "unimarc", "tottus", "santa isabel", "pan", "completo", "sushi", "pizza", "cafe", "colacion", "bebida", "snack", "mcdonald", "burger", "empanada", "feria", "verdura", "fruta", "carne", "delivery", "rappi", "pedidosya", "uber eats", "helado", "churrasco"],
  "c-transporte": ["micro", "bus", "uber", "didi", "cabify", "taxi", "colectivo", "bencina", "combustible", "pasaje", "metro", "peaje", "estacionamiento", "transporte", "bip", "auto", "moto", "mecanico"],
  "c-salidas": ["carrete", "salida", "cine", "copete", "bar", "cerveza", "chela", "piscola", "entrada", "disco", "junta", "fiesta", "concierto", "previa", "regalo"],
  "c-deporte": ["gym", "gimnasio", "cancha", "arriendo de cancha", "futbol", "chuteador", "chuteadores", "canilleras", "suplemento", "proteina", "creatina", "deporte", "club", "cuota del club", "mensualidad"],
  "c-celular": ["plan", "celular", "internet", "recarga", "spotify", "netflix", "youtube", "icloud", "telefono", "wifi", "disney", "hbo", "prime"],
  "c-ropa": ["ropa", "polera", "zapatillas", "zapatos", "pantalon", "jeans", "chaqueta", "poleron", "calcetines", "short", "parka", "gorro"],
  "c-estudios": ["libro", "curso", "ingles", "cuaderno", "matricula", "fotocopia", "fotocopias", "universidad", "preu", "examen", "certificado", "efset", "toefl", "ielts", "clase", "clases"],
  "i-sueldo": ["sueldo", "liquidacion", "pago del mes", "remuneracion", "salario"],
  "i-propinas": ["propina", "propinas"],
  "i-extra": ["pololo", "pega", "trabajo extra", "extra", "freelance", "cachureo", "venta", "vendi"],
};

// Busca la categoría que corresponde a lo que dijo Diego. null si no hay cómo saberlo.
export function categoriaPara(desc: string | undefined, cats: Categoria[], tipo: "ingreso" | "egreso"): Categoria | null {
  if (!desc) return null;
  const t = ` ${norm(desc)} `;
  const delTipo = cats.filter((c) => c.tipo === tipo);
  const porNombre = delTipo.find((c) => t.includes(` ${norm(c.nombre)} `) || norm(c.nombre).split(" ").some((w) => w.length > 3 && t.includes(` ${w} `)));
  if (porNombre) return porNombre;
  for (const c of delTipo) if ((PISTAS[c.id] || []).some((p) => t.includes(` ${p} `) || t.includes(` ${p}s `))) return c;
  return null;
}

// ---------- Dinero ----------
export function consultaDinero(d: Datos, hoy: string, a: { periodo?: string; tipo?: string; categoria?: string }): Respuesta {
  const tipo = a.tipo === "ingreso" ? "ingreso" : "egreso";
  const mes = a.periodo === "mes-pasado" ? sumarMeses(mesDe(hoy), -1) : mesDe(hoy);
  const desde = a.periodo === "hoy" ? hoy : a.periodo === "semana" ? lunesDe(hoy) : `${mes}-01`;
  const hasta = a.periodo === "mes-pasado" ? `${mes}-${diasDelMes(mes)}` : hoy;
  const cuando = a.periodo === "hoy" ? "hoy" : a.periodo === "semana" ? "esta semana" : a.periodo === "mes-pasado" ? `en ${nombreMes(mes)}` : "este mes";
  const cat = a.categoria ? categoriaPara(a.categoria, d.categorias, tipo) : null;
  if (a.categoria && !cat) return { texto: `No tengo una categoría que se llame "${a.categoria}". Tus categorías de ${tipo === "egreso" ? "gasto" : "ingreso"} son ${y(d.categorias.filter((c) => c.tipo === tipo).map((c) => c.nombre.toLowerCase()))}.`, privado: false };
  const movs = d.movimientos.filter((m) => m.tipo === tipo && m.fecha >= desde && m.fecha <= hasta && (!cat || m.categoriaId === cat.id));
  const total = movs.reduce((s, m) => s + m.monto, 0);
  if (cat) {
    const pres = d.presupuestos.find((p) => p.categoriaId === cat.id);
    let txt = `${cuando[0].toUpperCase()}${cuando.slice(1)} llevas ${clp(total)} en ${cat.nombre.toLowerCase()}.`;
    if (pres && a.periodo !== "hoy" && a.periodo !== "semana") {
      const quedan = pres.monto - total;
      txt += quedan >= 0 ? ` Te quedan ${clp(quedan)} de los ${clp(pres.monto)} del presupuesto.` : ` Te pasaste por ${clp(-quedan)} del presupuesto de ${clp(pres.monto)}.`;
    }
    return { texto: txt, privado: true };
  }
  if (a.periodo === "hoy" || a.periodo === "semana") {
    if (!movs.length) return { texto: `${cuando[0].toUpperCase()}${cuando.slice(1)} no tienes ${tipo === "egreso" ? "gastos" : "ingresos"} anotados.`, privado: false };
    const top = Object.entries(movs.reduce<Record<string, number>>((acc, m) => ((acc[m.categoriaId] = (acc[m.categoriaId] || 0) + m.monto), acc), {})).sort((x, z) => z[1] - x[1])[0];
    const nom = d.categorias.find((c) => c.id === top[0])?.nombre.toLowerCase() || "otros";
    return { texto: `${cuando[0].toUpperCase()}${cuando.slice(1)} llevas ${clp(total)} en ${tipo === "egreso" ? "gastos" : "ingresos"}${movs.length > 1 ? `, lo más en ${nom}` : ""}.`, privado: true };
  }
  const tot = totalesMes(d.movimientos, mes);
  if (!tot.ingresos && !tot.egresos) return { texto: `${cuando[0].toUpperCase()}${cuando.slice(1)} no tienes nada anotado en Dinero todavía.`, privado: false };
  if (tipo === "ingreso") return { texto: `${cuando[0].toUpperCase()}${cuando.slice(1)} te han entrado ${clp(tot.ingresos)}.`, privado: true };
  const dia = a.periodo === "mes-pasado" ? diasDelMes(mes) : Number(hoy.slice(8, 10));
  const estados = estadoPresupuestos(d.movimientos, d.presupuestos, d.categorias, mes, dia);
  const top = porCategoria(d.movimientos, d.categorias, mes, "egreso")[0];
  let txt = `${cuando[0].toUpperCase()}${cuando.slice(1)} llevas ${clp(tot.egresos)} gastados y ${clp(tot.ingresos)} de ingresos, así que vas ${tot.balance >= 0 ? `${clp(tot.balance)} a favor` : `${clp(-tot.balance)} en contra`}.`;
  if (top) txt += ` Donde más se va es ${top.nombre.toLowerCase()}, con ${clp(top.total)}.`;
  const frase = a.periodo === "mes-pasado" ? null : fraseDinero(estados, tot, mes, dia);
  if (frase && !/^Vas bien/.test(frase)) txt += ` ${frase}`;
  return { texto: txt, privado: true };
}

// ---------- Metas ----------
const activas = (d: Datos, hoy: string) => d.metas.filter((m) => !m.archivada && avance(m, d, hoy).estado !== "cumplida");

export function buscarMeta(metas: Meta[], q: string): Meta | null {
  const t = norm(q).replace(/^(la |el |mi )?(meta )?(de |del |de la )?/, "");
  if (!t) return null;
  const ws = t.split(" ").filter((w) => w.length > 2);
  let best: Meta | null = null;
  let score = 0;
  for (const m of metas) {
    const n = norm(m.nombre);
    const s = n.includes(t) ? 10 : ws.filter((w) => n.includes(w) || n.includes(w.replace(/s$/, ""))).length;
    if (s > score) [best, score] = [m, s];
  }
  return best;
}

export function consultaMetas(d: Datos, hoy: string, nombre?: string): Respuesta {
  const lista = activas(d, hoy);
  if (nombre) {
    const m = buscarMeta(d.metas.filter((x) => !x.archivada), nombre);
    if (!m) return { texto: `No encontré una meta así. Tus metas son ${y(lista.map((x) => x.nombre)) || "ninguna todavía"}.`, privado: false };
    return { texto: lineaMeta(m, d, hoy, true), privado: m.tipo === "monto" };
  }
  if (!lista.length) return { texto: d.metas.length ? "Tienes todas tus metas cumplidas o archivadas. ¿Te pongo una nueva?" : 'Todavía no tienes metas. Dime por ejemplo: "agrega una meta de ahorrar 200 mil para marzo".', privado: false };
  const orden = [...lista].sort((a, b) => Number(!!b.principal) - Number(!!a.principal)).slice(0, 3);
  const atras = lista.filter((m) => avance(m, d, hoy).estado === "atrasada").length;
  const txt = orden.map((m) => lineaMeta(m, d, hoy, false)).join(" ");
  return { texto: `${txt}${lista.length > 3 ? ` Y ${lista.length - 3} más en Metas.` : ""}${atras ? ` Ojo: ${atras === 1 ? "una va atrasada" : `${atras} van atrasadas`}.` : ""}`, privado: orden.some((m) => m.tipo === "monto") };
}

function lineaMeta(m: Meta, d: Datos, hoy: string, detalle: boolean): string {
  const a = avance(m, d, hoy);
  const est = ESTADO_META[a.estado].texto.toLowerCase();
  const vas = (e: string) => (e === "al día" ? "vas al día" : e === "venció" ? "ya venció" : e === "cumplida" ? "¡cumplida!" : `vas ${e.replace(/a$/, "o")}`);
  let txt = `${m.nombre}: ${Math.round(a.pct)}%, ${vas(est)}.`;
  if (detalle) {
    txt = `${m.nombre}: llevas ${fmtValor(m, a.actual)} de ${fmtValor(m, a.objetivo)} (${Math.round(a.pct)}%), ${vas(est)}.`;
    const f = faltaSemana(m, d, hoy);
    if (f && a.estado !== "cumplida") txt += ` Esta semana te falta ${f.texto}.`;
    if (a.quedanDias >= 0 && a.estado !== "cumplida") txt += ` Quedan ${a.quedanDias} días.`;
  }
  return txt;
}

// ---------- Fútbol ----------
export function consultaFutbol(d: Datos, hoy: string): Respuesta {
  const s = statsTemporada(d.partidos, hoy.slice(0, 4));
  const prox = proximoEvento(d.partidos.filter((p) => p.fui == null), hoy);
  const partes: string[] = [];
  if (s.partidos) partes.push(`Esta temporada llevas ${s.partidos} ${s.partidos === 1 ? "partido" : "partidos"}, ${s.goles} ${s.goles === 1 ? "gol" : "goles"} y ${s.asistencias} ${s.asistencias === 1 ? "asistencia" : "asistencias"}${s.nota != null ? `, con nota promedio ${String(s.nota).replace(".", ",")}` : ""}.`);
  else partes.push("Esta temporada todavía no tienes partidos registrados.");
  if (prox) partes.push(`Lo próximo es ${prox.tipo === "partido" ? `partido${prox.rival ? ` contra ${prox.rival}` : ""}` : "entrenamiento con el equipo"} ${diaDe(prox.fecha, hoy)}${prox.hora ? ` a las ${prox.hora}` : ""}.`);
  const sin = sinRegistrar(d.partidos, hoy);
  if (sin.length) partes.push(`Tienes ${sin.length === 1 ? "uno sin registrar" : `${sin.length} sin registrar`}: cuéntame cómo te fue.`);
  return { texto: partes.join(" "), privado: false };
}

// ---------- Entrenamiento ----------
export function entrenoDeHoy(d: Datos, hoy: string): Respuesta {
  const plan = d.planes.find((p) => p.id === "activo");
  const ses = sesionDeHoy(plan, hoy);
  const ch = d.chequeos.find((c) => c.id === hoy);
  const carga = cargaDelDia(ch, d.partidos, hoy, d.chequeos);
  if (!plan) return { texto: "Todavía no tienes una rutina armada. Ve a Fútbol, pestaña Físico, y en un minuto te armo una según tus días y tu equipo.", privado: false };
  if (!ses) return { texto: `Hoy no tienes sesión en el plan: toca descanso.${carga.nivel === "activacion" ? ` ${carga.motivo}` : ""}`, privado: false };
  if (d.entrenos.some((e) => e.fecha === hoy)) return { texto: `Hoy ya registraste entreno. Bien ahí. Lo que tocaba era ${ses.nombre}.`, privado: false };
  if (carga.nivel === "parar") return { texto: `Hoy tocaba ${ses.nombre}, pero ${carga.motivo.charAt(0).toLowerCase()}${carga.motivo.slice(1)}`, privado: false };
  const items = ses.items.slice(0, 4).map((it) => `${ejercicio(it.ejId)?.nombre.split(" (")[0] || it.ejId} ${seriesAjustadas(it.series, carga)} por ${it.repsMin === it.repsMax ? it.repsMax : `${it.repsMin} a ${it.repsMax}`}${ejercicio(it.ejId)?.porTiempo ? " segundos" : ""}`);
  return { texto: `Hoy te toca ${ses.nombre}, unos ${ses.minutos} minutos: ${y(items)}${ses.items.length > 4 ? ", y más" : ""}.${carga.nivel !== "normal" ? ` ${carga.motivo}` : ""} Lo haces con la sesión guiada en Físico.`, privado: false };
}

// ---------- Resúmenes ----------
export function resumenHoy(d: Datos, hoy: string, minutos: number, r: RutinaHoy, manana: boolean): Respuesta {
  const partes: string[] = [];
  let privado = false;
  const prox = r.pendientes.filter((p) => toMin(p.hora) > minutos);
  if (r.pendientes.length || r.hechas.length) {
    if (manana && r.pendientes.length) partes.push(`En la rutina tienes ${y(r.pendientes.slice(0, 4).map((p) => `${p.titulo} a las ${p.hora}`))}${r.pendientes.length > 4 ? " y más" : ""}.`);
    else if (prox.length) partes.push(`De la rutina te queda ${y(prox.slice(0, 3).map((p) => `${p.titulo} a las ${p.hora}`))}.`);
    else if (!r.pendientes.length) partes.push("La rutina de hoy ya está completa. Bien ahí.");
  }
  const turno = turnoDeHoy(d.turnos, hoy);
  if (turno) partes.push(`Trabajas de ${turno.inicio} a ${turno.fin}.`);
  const evHoy = d.partidos.filter((p) => p.fecha === hoy).sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
  for (const p of evHoy.filter((x) => x.fui == null)) partes.push(p.tipo === "partido" ? `Hoy juegas${p.rival ? ` contra ${p.rival}` : ""}${p.hora ? ` a las ${p.hora}` : ""}.` : `Tienes entrenamiento con el equipo${p.hora ? ` a las ${p.hora}` : ""}.`);
  const plan = d.planes.find((p) => p.id === "activo");
  const ses = sesionDeHoy(plan, hoy);
  if (ses && !d.entrenos.some((e) => e.fecha === hoy)) {
    const c = cargaDelDia(d.chequeos.find((x) => x.id === hoy), d.partidos, hoy, d.chequeos);
    partes.push(c.nivel === "activacion" || c.nivel === "parar" ? `En el físico tocaba ${ses.nombre}, pero ${c.motivo.charAt(0).toLowerCase()}${c.motivo.slice(1)}` : `En el físico toca ${ses.nombre}, unos ${ses.minutos} minutos.`);
  }
  const manianaP = d.partidos.find((p) => p.fecha === addDays(hoy, 1) && p.tipo === "partido");
  if (manianaP) partes.push(`Mañana juegas${manianaP.rival ? ` contra ${manianaP.rival}` : ""}: descansa bien.`);
  const evs = proximasEvaluaciones(d.evaluaciones, hoy, 3);
  if (evs.length) partes.push(`Ojo con ${y(evs.map((e) => `${e.nombre} ${diaDe(e.fecha, hoy)}`))}.`);
  const tareas = tareasPendientes(d.tareas, hoy).filter((t) => t.fecha);
  if (tareas.length) partes.push(`Tienes ${tareas.length === 1 ? `pendiente ${tareas[0].texto}` : `${tareas.length} tareas de estudio pendientes`}.`);
  if (manana && r.ayerPendientes.length) partes.push(`De ayer quedó ${y(r.ayerPendientes.slice(0, 3))}.`);
  const sin = sinRegistrar(d.partidos, hoy);
  if (sin.length) partes.push(`Te falta registrar ${sin.length === 1 ? `el ${sin[0].tipo} del ${fechaCorta(sin[0].fecha)}` : `${sin.length} partidos o entrenamientos`}.`);
  const mes = mesDe(hoy);
  const dia = Number(hoy.slice(8, 10));
  const frase = fraseDinero(estadoPresupuestos(d.movimientos, d.presupuestos, d.categorias, mes, dia), totalesMes(d.movimientos, mes), mes, dia);
  if (frase && !/^(Vas bien|Ponle)/.test(frase)) {
    partes.push(frase);
    privado = true;
  }
  const inicio = manana ? `Buenos días Diego.` : "";
  if (!partes.length) return { texto: `${inicio} Hoy no tienes nada anotado: día libre. Si quieres, dime qué vas a hacer y lo agrego.`.trim(), privado: false };
  return { texto: `${inicio} ${partes.join(" ")}`.trim(), privado };
}

const toMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

export function resumenSemana(d: Datos, hoy: string): Respuesta {
  const l = lunesDe(hoy);
  const partes: string[] = [];
  let privado = false;
  const plan = d.planes.find((p) => p.id === "activo");
  const sem = semanaEntreno(plan, d.entrenos, hoy).filter((x) => x.dia <= dow(hoy));
  const hechos = d.entrenos.filter((e) => e.fecha >= l && e.fecha <= hoy).length;
  const tocaban = sem.filter((x) => x.plan).length;
  if (hechos || tocaban) partes.push(`Entrenaste ${veces(hechos)}${tocaban ? ` de ${tocaban} que tocaban hasta hoy` : ""}.`);
  const jug = d.partidos.filter((p) => p.fecha >= l && p.fecha <= hoy && p.fui && p.tipo === "partido");
  if (jug.length) {
    const g = jug.reduce((a, p) => a + (p.goles || 0), 0);
    const as = jug.reduce((a, p) => a + (p.asistencias || 0), 0);
    partes.push(`Jugaste ${jug.length === 1 ? "un partido" : `${jug.length} partidos`}${g || as ? ` con ${[g ? `${g} ${g === 1 ? "gol" : "goles"}` : "", as ? `${as} ${as === 1 ? "asistencia" : "asistencias"}` : ""].filter(Boolean).join(" y ")}` : ""}.`);
  }
  const hEst = horasEnSemana(d.sesiones, l);
  const metaEst = metaSemanalTotal(d.materias);
  if (hEst || metaEst) partes.push(`Estudiaste ${horas(hEst)}${metaEst ? ` de ${horas(metaEst)} de meta` : ""}.`);
  const hTrab = horasSemana(d.turnos, hoy);
  if (hTrab) partes.push(`Trabajaste ${horas(hTrab)}.`);
  const gastos = d.movimientos.filter((m) => m.tipo === "egreso" && m.fecha >= l && m.fecha <= hoy).reduce((a, m) => a + m.monto, 0);
  if (gastos) {
    partes.push(`Gastaste ${clp(gastos)}.`);
    privado = true;
  }
  if (!partes.length) return { texto: "Esta semana todavía no tienes nada registrado. Cuéntame qué hiciste y lo anoto.", privado: false };
  const atras = activas(d, hoy).filter((m) => avance(m, d, hoy).estado === "atrasada");
  if (atras.length) partes.push(`Para la próxima: ${atras.length === 1 ? `la meta ${atras[0].nombre} va atrasada` : `${atras.length} metas van atrasadas`}.`);
  return { texto: `Tu semana: ${partes.join(" ")}`, privado };
}

export function resumenMes(d: Datos, hoy: string): Respuesta {
  const mes = mesDe(hoy);
  const dia = Number(hoy.slice(8, 10));
  const partes: string[] = [];
  let privado = false;
  const tot = totalesMes(d.movimientos, mes);
  if (tot.ingresos || tot.egresos) {
    privado = true;
    partes.push(`En plata: entraron ${clp(tot.ingresos)}, gastaste ${clp(tot.egresos)} y vas ${tot.balance >= 0 ? `${clp(tot.balance)} a favor` : `${clp(-tot.balance)} en contra`}.`);
    const exc = estadoPresupuestos(d.movimientos, d.presupuestos, d.categorias, mes, dia).filter((e) => e.estado === "excedido");
    if (exc.length) partes.push(`Te pasaste en ${y(exc.map((e) => e.nombre.toLowerCase()))}.`);
  }
  const s = d.partidos.filter((p) => p.fecha.startsWith(mes) && p.fui && p.tipo === "partido");
  if (s.length) partes.push(`Jugaste ${s.length} ${s.length === 1 ? "partido" : "partidos"} con ${s.reduce((a, p) => a + (p.goles || 0), 0)} goles y ${s.reduce((a, p) => a + (p.asistencias || 0), 0)} asistencias.`);
  const ent = d.entrenos.filter((e) => e.fecha.startsWith(mes)).length;
  if (ent) partes.push(`Entrenaste ${veces(ent)}.`);
  const hEst = d.sesiones.filter((x) => x.fecha.startsWith(mes)).reduce((a, x) => a + x.minutos, 0) / 60;
  if (hEst) partes.push(`Estudiaste ${horas(hEst)}.`);
  const hTrab = horasMes(d.turnos, mes, hoy);
  if (hTrab) partes.push(`Trabajaste ${horas(hTrab)}.`);
  const act = activas(d, hoy);
  if (act.length) {
    const est = act.map((m) => avance(m, d, hoy).estado);
    const bien = est.filter((e) => e === "adelantada" || e === "a-tiempo").length;
    partes.push(`De tus ${act.length} metas activas, ${bien === act.length ? "todas van bien" : `${bien} van bien y ${act.length - bien} necesitan empuje`}.`);
  }
  if (!partes.length) return { texto: `En ${nombreMes(mes)} todavía no tienes nada registrado.`, privado: false };
  return { texto: `Tu ${nombreMes(mes)} hasta ahora: ${partes.join(" ")}`, privado };
}
