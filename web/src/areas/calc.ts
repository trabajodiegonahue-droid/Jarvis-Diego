// Mi vida por áreas: todo lo que le dices a JARVIS queda guardado en su bloque
// (salud, ánimo, dinero, amor, familia y amigos, entrenamiento, fútbol, estudios, trabajo, casa, metas).
// Cada bloque muestra un dato al día y lo último que contaste. Funciones puras, con pruebas.
import { addDays, lunesDe } from "../core/dates";
import type { Datos, Nota } from "../data/types";

export type AreaVida = Nota["area"];

export interface InfoArea {
  id: AreaVida;
  nombre: string;
  color: string;
  icono: string;
}

// Colores: los 8 tonos validados para gráficos y gris para lo secundario.
export const AREAS_VIDA: InfoArea[] = [
  { id: "salud", nombre: "Salud", color: "var(--t8)", icono: "salud" },
  { id: "animo", nombre: "Ánimo", color: "var(--t7)", icono: "animo" },
  { id: "dinero", nombre: "Dinero", color: "var(--t6)", icono: "dinero" },
  { id: "amor", nombre: "Amor", color: "var(--t5)", icono: "corazon" },
  { id: "social", nombre: "Familia y amigos", color: "var(--t4)", icono: "personas" },
  { id: "entreno", nombre: "Entrenamiento", color: "var(--t3)", icono: "pesa" },
  { id: "futbol", nombre: "Fútbol", color: "var(--t3)", icono: "futbol" },
  { id: "estudios", nombre: "Estudios", color: "var(--t1)", icono: "libro" },
  { id: "trabajo", nombre: "Trabajo", color: "var(--t2)", icono: "trabajo" },
  { id: "casa", nombre: "Casa y trámites", color: "var(--t-gris2)", icono: "casa" },
  { id: "metas", nombre: "Metas y proyectos", color: "var(--gold)", icono: "metas" },
  { id: "ocio", nombre: "Ocio y hobbies", color: "var(--t7)", icono: "estrella" },
  { id: "otro", nombre: "Otros", color: "var(--t-gris1)", icono: "mas" },
];
export const area = (id: AreaVida) => AREAS_VIDA.find((a) => a.id === id) || AREAS_VIDA[AREAS_VIDA.length - 1];

const sinTilde = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Palabras de cada área, de la más específica a la más general (gana la primera que calce).
const PISTAS: [AreaVida, RegExp][] = [
  ["amor", /\b(polola|pololo|pololear|pololeo|novia|novio|pareja|mi amor|cita|citas|aniversario|beso|besos|me gusta una|me gusta un|crush|mi ex\b|terminamos|terminé con|enamorad|tinder|romantic|san valentin|celos|peleamos|pelea con la (polola|novia)|regalo para la (polola|novia))/],
  ["salud", /\b(duele|dolor|me lesion|lesion|esguince|tobillo|rodilla|espalda|cabeza|resfri|gripe|fiebre|tos|enferm|medico|doctor|dentista|kine|kinesiolog|remedio|pastilla|vacuna|examen de sangre|alergia|dormi|sueno|insomnio|me desperte|peso\b|kilos|presion|hidrat|agua|nutricion|dieta|comi mal|comi bien)/],
  ["animo", /\b(triste|feliz|contento|bajoneado|bajon|ansios|ansiedad|estres|estresado|angustia|me siento|motivad|desmotivad|agradecido|orgullos|frustrad|enojad|rabia|soledad|me siento solo|me siento sola|medit|respir|psicolog|terapia|animo|mental)/],
  ["dinero", /\b(gaste|pague|compre|me pagaron|sueldo|propina|plata|lucas|luca|pesos|\$|ahorr|deuda|debo|prestamo|presupuesto|banco|tarjeta|cuota|precio|cobre|vendi|inverti|gasto|ingreso)/],
  ["futbol", /\b(futbol|partido|gol|goles|asistencia|cancha|club|equipo|entrenador|dt|pichanga|baby|campeonato|liga|chuteador|prueba en el club)/],
  ["entreno", /\b(gym|gimnasio|entren|pesas|pierna|core|correr|corri|trote|km|sentadilla|press|series|repeticiones|crossfit|nadar|bici|cardio|estirar|movilidad|creatina|proteina)/],
  ["estudios", /\b(estudi|ingles|clase|clases|prueba|examen|ensayo|nota|curso|universidad|preu|paes|tarea|certificado de alumno|profe|profesor|apuntes|efset|toefl|ielts)/],
  ["trabajo", /\b(trabaj|turno|pega|jefe|jefa|cliente|clientes|restaurant|sueldo|contrato|entrevista de trabajo|postule a un trabajo|horas extra|colega)/],
  ["social", /\b(mama|papa|abuel|herman|tia|tio|prim|familia|amigo|amiga|amigos|amigas|carrete|junta|juntarme|cumpleanos|cumple|asado|visita|sobrin|suegr)/],
  ["casa", /\b(casa|pieza|depto|departamento|arriendo|aseo|limpi|ordenar|lavar|ropa|supermercado|super|compras|tramite|tramites|banco|municipalidad|registro civil|carnet|pasaporte|visa|auto|mecanico|cuentas|luz|agua potable|gas|internet)/],
  ["ocio", /\b(pelicula|peli|serie|netflix|anime|cine|concierto|musica|cancion|guitarra|tocar|jugar play|videojuego|play|leer|lei|libro|dibuj|foto|hobby|pasatiempo|paseo|playa|lago|volcan|pesca|camping)/],
  ["metas", /\b(meta|metas|proyecto|sueno es|quiero lograr|plan|planes|objetivo|working holiday|australia|viaje|viajar|emprend|negocio|algun dia)/],
];

export function clasificarArea(texto: string): AreaVida {
  const t = ` ${sinTilde(texto).replace(/[¿?¡!.,]/g, " ")} `;
  for (const [a, re] of PISTAS) if (re.test(t)) return a;
  return "otro";
}

// Lo que anota cada herramienta de JARVIS, en qué área queda.
const POR_HERRAMIENTA: Record<string, AreaVida> = {
  registrar_gasto: "dinero", registrar_ingreso: "dinero", aportar_meta: "metas", crear_meta: "metas", simular_meta: "dinero",
  registrar_entreno: "entreno", registrar_partido: "futbol", registrar_estudio: "estudios", registrar_turno: "trabajo",
  registrar_dia: "salud", marcar_habito: "animo", crear_habito: "animo", agregar_compras: "casa", marcar_compras: "casa",
  agregar_fecha: "social", recordar: "otro", crear_recordatorio: "otro", iniciar_actividad: "otro", registrar_bloque: "otro",
  agregar_tarea: "otro", tachar_tarea: "otro", tachar_tareas: "otro", semana_dificil: "animo",
};

// El área de lo que se anotó: si la herramienta lo dice, esa; si es general (recordar, rutina…), por las palabras.
export function areaDeHerramienta(tool: string, args: any, texto: string): AreaVida {
  if (tool === "registrar_dia" && (args?.animo != null || args?.energia != null) && args?.sueno == null) return "animo";
  if (tool === "agregar_fecha" && args?.tipo === "aniversario") return "amor";
  const a = POR_HERRAMIENTA[tool];
  return a && a !== "otro" ? a : clasificarArea(texto);
}

// En qué parte de la app queda lo que anota cada herramienta (para decirle a Diego dónde quedó).
const SECCION: Record<string, [string, string]> = {
  registrar_gasto: ["Dinero", "/dinero"],
  registrar_ingreso: ["Dinero", "/dinero"],
  registrar_turno: ["Trabajo", "/mas/trabajo"],
  registrar_entreno: ["Fútbol › Físico", "/futbol?fisico"],
  registrar_partido: ["Fútbol", "/futbol"],
  registrar_estudio: ["Estudios", "/mas/estudios"],
  registrar_dia: ["Hábitos", "/mas/habitos"],
  marcar_habito: ["Hábitos", "/mas/habitos"],
  crear_habito: ["Hábitos", "/mas/habitos"],
  crear_meta: ["Metas", "/metas"],
  aportar_meta: ["Metas", "/metas"],
  crear_recordatorio: ["Recordatorios", "/mas/recordatorios"],
  agregar_compras: ["Compras", "/mas/compras"],
  marcar_compras: ["Compras", "/mas/compras"],
  agregar_fecha: ["Calendario", "/mas/calendario"],
  agregar_tarea: ["Rutina de hoy", "/"],
  cambiar_tarea: ["Rutina de hoy", "/"],
  tachar_tarea: ["Rutina de hoy", "/"],
  tachar_tareas: ["Rutina de hoy", "/"],
  tachar_todo_hoy: ["Rutina de hoy", "/"],
  iniciar_actividad: ["Mi tiempo", "/mas/tiempo"],
  terminar_actividad: ["Mi tiempo", "/mas/tiempo"],
  registrar_bloque: ["Mi tiempo", "/mas/tiempo"],
  recordar: ["Memoria de JARVIS", "/mas"],
};
export const seccionDe = (tool?: string): { nombre: string; ruta: string } | null => {
  const s = tool ? SECCION[tool] : undefined;
  return s ? { nombre: s[0], ruta: s[1] } : null;
};

// ¿Es una pregunta o un pedido (para Gemini), o algo que Diego cuenta (para guardar en su área)?
export function esPregunta(texto: string): boolean {
  const t = sinTilde(texto).trim();
  return /\?|^¿/.test(texto) || /^(que|como|cuando|cuanto|cuanta|cuantos|cuantas|donde|por que|porque|cual|cuales|quien|puedes|podrias|me puedes|dime|explicame|ayudame|recomiendame|sabes|crees|opinas|deberia|conviene|hay|es verdad|busca|traduce|escribe|dame|necesito que|ensename)\b/.test(t);
}

export interface EstadoArea {
  dato: string | null; // el dato al día del bloque ("7,2 h de sueño promedio")
  notas: Nota[]; // lo último contado
}

const hace = (n: number) => (n === 0 ? "última nota hoy" : n === 1 ? "última nota ayer" : `última nota hace ${n} días`);
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("es-CL");
const clp = (n: number) => `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

// El estado al día de cada área, calculado con los datos de la app (no hace falta anotar dos veces).
export function estadoArea(id: AreaVida, d: Datos, hoy: string): EstadoArea {
  const notas = d.notas.filter((n) => n.area === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const sem = (f: string) => f >= addDays(hoy, -6) && f <= hoy;
  let dato: string | null = null;
  if (id === "salud") {
    const s = d.dias.filter((x) => sem(x.id) && typeof x.sueno === "number").map((x) => x.sueno!);
    const dolor = [...d.chequeos].filter((c) => sem(c.id) && c.dolor >= 3).sort((a, b) => b.id.localeCompare(a.id))[0];
    dato = [s.length ? `${fmt1(s.reduce((a, b) => a + b, 0) / s.length)} h de sueño promedio` : "", dolor ? `dolor ${dolor.dolor}/10${dolor.zona ? ` en ${dolor.zona}` : ""}` : ""].filter(Boolean).join(" · ") || null;
  } else if (id === "animo") {
    const a = d.dias.filter((x) => sem(x.id) && typeof x.animo === "number").map((x) => x.animo!);
    dato = a.length ? `ánimo ${fmt1(a.reduce((x, y) => x + y, 0) / a.length)} de 5 esta semana` : null;
  } else if (id === "dinero") {
    const mes = hoy.slice(0, 7);
    const ing = d.movimientos.filter((m) => m.fecha.startsWith(mes) && m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
    const egr = d.movimientos.filter((m) => m.fecha.startsWith(mes) && m.tipo === "egreso").reduce((s, m) => s + m.monto, 0);
    dato = ing || egr ? `balance del mes ${ing - egr >= 0 ? "+" : "-"}${clp(Math.abs(ing - egr))}` : null;
  } else if (id === "amor" || id === "social") {
    const f = d.fechas
      .filter((x) => (id === "amor" ? x.tipo === "aniversario" || /polol|novi|pareja/i.test(x.nombre) : x.tipo === "cumple" && !/polol|novi|pareja/i.test(x.nombre)))
      .map((x) => {
        let fecha = `${hoy.slice(0, 4)}-${x.dia}`;
        if (fecha < hoy) fecha = `${Number(hoy.slice(0, 4)) + 1}-${x.dia}`;
        return { x, dias: Math.round((Date.parse(fecha) - Date.parse(hoy)) / 864e5) };
      })
      .sort((a, b) => a.dias - b.dias)[0];
    dato = f ? `${f.x.nombre.charAt(0).toLowerCase()}${f.x.nombre.slice(1)} ${f.dias === 0 ? "es hoy" : `en ${f.dias} días`}` : notas[0] ? hace(Math.max(0, Math.round((Date.parse(hoy) - Date.parse(notas[0].fecha.slice(0, 10))) / 864e5))) : null;
  } else if (id === "entreno") {
    const l = lunesDe(hoy);
    const n = d.entrenos.filter((e) => e.fecha >= l && e.fecha <= hoy).length;
    const plan = d.planes.find((p) => p.id === "activo");
    dato = n || plan ? `${n}${plan ? ` de ${plan.sesiones.length}` : ""} entrenos esta semana` : null;
  } else if (id === "futbol") {
    const jug = d.partidos.filter((p) => p.fui && p.tipo === "partido" && p.temporada === hoy.slice(0, 4));
    const prox = d.partidos.filter((p) => p.fecha >= hoy && p.fui == null && p.tipo === "partido").sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    dato = [jug.length ? `${jug.reduce((s, p) => s + (p.goles || 0), 0)} goles y ${jug.reduce((s, p) => s + (p.asistencias || 0), 0)} asistencias en ${hoy.slice(0, 4)}` : "", prox ? `próximo partido ${prox.fecha === hoy ? "hoy" : prox.fecha.slice(8) + "/" + prox.fecha.slice(5, 7)}` : ""].filter(Boolean).join(" · ") || null;
  } else if (id === "estudios") {
    const l = lunesDe(hoy);
    const h = d.sesiones.filter((s) => s.fecha >= l && s.fecha <= hoy).reduce((s, x) => s + x.minutos, 0) / 60;
    const meta = d.materias.reduce((s, m) => s + (m.metaHorasSemana || 0), 0);
    dato = h || meta ? `${fmt1(h)}${meta ? ` de ${fmt1(meta)}` : ""} horas esta semana` : null;
  } else if (id === "trabajo") {
    const prox = d.turnos.filter((t) => t.fecha >= hoy && !t.falte).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicio.localeCompare(b.inicio))[0];
    dato = prox ? `próximo turno ${prox.fecha === hoy ? "hoy" : prox.fecha.slice(8) + "/" + prox.fecha.slice(5, 7)} a las ${prox.inicio}` : null;
  } else if (id === "casa") {
    const c = d.compras.filter((x) => !x.hecho).length;
    dato = c ? `${c} ${c === 1 ? "cosa" : "cosas"} en la lista de compras` : null;
  } else if (id === "metas") {
    const activas = d.metas.filter((m) => !m.archivada);
    dato = activas.length ? `${activas.length} ${activas.length === 1 ? "meta activa" : "metas activas"}` : null;
  }
  return { dato, notas };
}
