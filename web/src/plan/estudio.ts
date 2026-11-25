// Estudio: 5 materias (Matemática M1, Inglés, Lenguaje, Ventas, Economía), una por día a las 13:45,
// temarios del bloque, mini-quiz, mazo de inglés de fútbol, repetición espaciada y calculadoras. Funciones puras.
import { addDays, dow, lunesDe } from "../core/dates";
import type { ErrorCuaderno, EstudioLog, MateriaBloque, Sesion, Tarjeta } from "../data/types";
import { INICIO_BLOQUE } from "./bloque";

export const MATERIAS: { id: MateriaBloque; nombre: string; corto: string; color: string; dia: number; como: string; emoji: string }[] = [
  { id: "mate", nombre: "Matemática M1", corto: "Matemática", color: "#3a86c8", dia: 0, como: "45 min de ejercicios + corregir", emoji: "📐" },
  { id: "ingles", nombre: "Inglés", corto: "Inglés", color: "#1f9d55", dia: 1, como: "45 min: escuchar + vocabulario + hablar", emoji: "🇬🇧" },
  { id: "lenguaje", nombre: "Lenguaje (Competencia Lectora)", corto: "Lenguaje", color: "#7b4fd0", dia: 2, como: "2 textos con preguntas, con tiempo", emoji: "📖" },
  { id: "ventas", nombre: "Ventas", corto: "Ventas", color: "#e8772e", dia: 3, como: "30–45 min, un tema por semana", emoji: "💼" },
  { id: "economia", nombre: "Economía", corto: "Economía", color: "#d4a017", dia: 4, como: "30–45 min, un tema por semana", emoji: "📊" },
];
export const materia = (id: MateriaBloque) => MATERIAS.find((m) => m.id === id)!;

export const semanaBloque = (fecha: string, inicio = INICIO_BLOQUE) => Math.floor((Date.parse(fecha) - Date.parse(inicio)) / (7 * 864e5));

// Lo que toca hoy: lunes a viernes una materia; sábado mini-ensayo (una semana Matemática y otra Lenguaje); domingo libre.
export function estudioDeHoy(fecha: string): { materia: MateriaBloque | null; ensayo?: MateriaBloque; texto: string } {
  const d = dow(fecha);
  if (d <= 4) {
    const m = MATERIAS.find((x) => x.dia === d)!;
    return { materia: m.id, texto: `${m.nombre}: ${m.como}` };
  }
  if (d === 5) {
    const e = semanaBloque(fecha) % 2 === 0 ? "mate" : "lenguaje";
    return { materia: null, ensayo: e, texto: `Mini-ensayo opcional de ${e === "mate" ? "Matemática" : "Lenguaje"}: 15–20 preguntas` };
  }
  return { materia: null, texto: "Libre" };
}

// ---------- Matemática M1 ----------
export const EJES_MATE: { id: string; nombre: string; semanas: string; subtemas: string[] }[] = [
  { id: "numeros", nombre: "Números", semanas: "1–2", subtemas: ["Enteros", "Fracciones y decimales", "Porcentajes", "Potencias y raíces"] },
  { id: "algebra", nombre: "Álgebra y funciones", semanas: "3–4", subtemas: ["Expresiones", "Ecuaciones", "Sistemas", "Función lineal", "Función cuadrática"] },
  { id: "geometria", nombre: "Geometría", semanas: "5–6", subtemas: ["Pitágoras", "Perímetro y área", "Volumen", "Transformaciones"] },
  { id: "probabilidad", nombre: "Probabilidad y estadística", semanas: "7–8", subtemas: ["Gráficos y tablas", "Promedio, mediana y moda", "Probabilidades"] },
];
export function ejeDeLaSemana(fecha: string) {
  const s = Math.max(1, semanaBloque(fecha));
  return EJES_MATE[Math.min(3, Math.floor((s - 1) / 2))];
}
export const ejeDeTema = (tema?: string) => EJES_MATE.find((e) => e.subtemas.some((s) => s === tema) || e.nombre === tema);

// ---------- Ventas y Economía ----------
type Q = { p: string; o: string[]; c: number };
export const TEMAS: Record<"ventas" | "economia", { titulo: string; quiz: Q[] }[]> = {
  ventas: [
    { titulo: "Conocer al cliente", quiz: [{ p: "¿Qué es lo primero en una venta?", o: ["Hablar del precio", "Entender qué necesita el cliente", "Mostrar todos los productos"], c: 1 }, { p: "Una buena pregunta para el cliente es…", o: ["¿Me compras?", "¿Qué problema quieres resolver?", "¿Tienes plata?"], c: 1 }, { p: "Escuchar más que hablar sirve para…", o: ["Perder tiempo", "Ofrecer lo que de verdad le sirve", "Nada"], c: 1 }] },
    { titulo: "Encontrar clientes (prospección)", quiz: [{ p: "Prospectar es…", o: ["Buscar posibles clientes", "Cobrar", "Hacer boletas"], c: 0 }, { p: "Un buen lugar para empezar a buscar es…", o: ["Gente que ya conoces y negocios del barrio", "Desconocidos al azar", "Nadie"], c: 0 }, { p: "Es mejor tener…", o: ["Una lista de contactos con seguimiento", "Todo en la cabeza", "Un solo cliente"], c: 0 }] },
    { titulo: "Pitch de 30 segundos", quiz: [{ p: "Un pitch debe decir…", o: ["Tu vida completa", "Qué haces, para quién y qué gana", "Solo el precio"], c: 1 }, { p: "¿Cuánto debe durar?", o: ["5 minutos", "Unos 30 segundos", "1 hora"], c: 1 }, { p: "Termina con…", o: ["Una pregunta o siguiente paso", "Un chiste", "Nada"], c: 0 }] },
    { titulo: "Responder objeciones", quiz: [{ p: "\"Está caro\" se responde…", o: ["Bajando el precio al tiro", "Mostrando el valor que recibe", "Enojándose"], c: 1 }, { p: "Una objeción es…", o: ["Una duda que hay que resolver", "Un no definitivo", "Una ofensa"], c: 0 }, { p: "Antes de responder conviene…", o: ["Preguntar por qué lo piensa", "Interrumpir", "Cambiar de tema"], c: 0 }] },
    { titulo: "Precio, costo y margen", quiz: [{ p: "Margen = …", o: ["Precio − costo", "Costo − precio", "Precio + costo"], c: 0 }, { p: "Si cuesta $6.000 y vendes a $10.000, el margen es…", o: ["$4.000", "$16.000", "$6.000"], c: 0 }, { p: "El precio debe cubrir…", o: ["Solo los materiales", "Costos y tu ganancia", "Nada"], c: 1 }] },
    { titulo: "Vender por Instagram y WhatsApp", quiz: [{ p: "En Instagram ayuda mucho…", o: ["Mostrar trabajos reales y testimonios", "Publicar una vez al año", "No responder"], c: 0 }, { p: "Por WhatsApp conviene…", o: ["Mensajes cortos y claros", "Audios de 10 minutos", "Escribir a las 3 am"], c: 0 }, { p: "Un catálogo sirve para…", o: ["Que vean precios y opciones fácil", "Nada", "Confundir"], c: 0 }] },
    { titulo: "Cierre y seguimiento", quiz: [{ p: "Cerrar es…", o: ["Pedir la decisión", "Esperar que el cliente decida solo", "Olvidarse"], c: 0 }, { p: "El seguimiento se hace…", o: ["Unos días después, con amabilidad", "Nunca", "Cada 5 minutos"], c: 0 }, { p: "Después de vender…", o: ["Pides recomendación o reseña", "Desapareces", "Subes el precio"], c: 0 }] },
    { titulo: "Práctica real con 3 clientes", quiz: [{ p: "La meta de esta semana es…", o: ["Ofrecer a 3 clientes reales", "Leer más teoría", "Nada"], c: 0 }, { p: "Después de cada oferta anotas…", o: ["Qué aprendiste", "Nada", "Solo si vendiste"], c: 0 }, { p: "Un \"no\" sirve para…", o: ["Aprender y mejorar el pitch", "Rendirse", "Nada"], c: 0 }] },
  ],
  economia: [
    { titulo: "Presupuesto personal (50/30/20)", quiz: [{ p: "En el 50/30/20, el 20% va a…", o: ["Ahorro", "Gustos", "Necesidades"], c: 0 }, { p: "El 50% es para…", o: ["Necesidades", "Ahorro", "Carretes"], c: 0 }, { p: "Un presupuesto sirve para…", o: ["Saber a dónde va tu plata", "Gastar más", "Nada"], c: 0 }] },
    { titulo: "Ahorro e interés compuesto", quiz: [{ p: "El interés compuesto es…", o: ["Ganar interés sobre el interés", "Un impuesto", "Una deuda"], c: 0 }, { p: "Lo que más ayuda al interés compuesto es…", o: ["El tiempo", "La suerte", "Gastar"], c: 0 }, { p: "Ahorrar poco pero todos los meses…", o: ["Suma harto con los años", "No sirve", "Es ilegal"], c: 0 }] },
    { titulo: "Crédito y deudas", quiz: [{ p: "La CAE indica…", o: ["El costo total anual del crédito", "El sueldo", "La UF"], c: 0 }, { p: "Pagar solo el mínimo de la tarjeta…", o: ["Hace crecer la deuda", "Es lo ideal", "No cambia nada"], c: 0 }, { p: "Una deuda buena es la que…", o: ["Te ayuda a generar más (estudios, negocio)", "Es para carretear", "No existe"], c: 0 }] },
    { titulo: "Oferta y demanda", quiz: [{ p: "Si sube la demanda y la oferta no cambia, el precio…", o: ["Sube", "Baja", "Queda igual"], c: 0 }, { p: "Si hay mucha oferta, el precio…", o: ["Tiende a bajar", "Sube", "Desaparece"], c: 0 }, { p: "El precio de equilibrio es donde…", o: ["Oferta y demanda se igualan", "Todo es gratis", "Nadie compra"], c: 0 }] },
    { titulo: "Inflación, IPC y UF", quiz: [{ p: "La inflación es…", o: ["El alza general de precios", "Una baja de precios", "Un banco"], c: 0 }, { p: "El IPC mide…", o: ["Cómo cambian los precios de una canasta", "El dólar", "El sueldo mínimo"], c: 0 }, { p: "La UF…", o: ["Se reajusta con la inflación", "Nunca cambia", "Es una moneda de oro"], c: 0 }] },
    { titulo: "Banco Central y tasas", quiz: [{ p: "El Banco Central sube la tasa para…", o: ["Bajar la inflación", "Regalar plata", "Subir los sueldos"], c: 0 }, { p: "Si sube la tasa, los créditos…", o: ["Se encarecen", "Se abaratan", "Desaparecen"], c: 0 }, { p: "La meta de inflación en Chile es…", o: ["Alrededor de 3% al año", "50%", "0% siempre"], c: 0 }] },
    { titulo: "Costos fijos y variables", quiz: [{ p: "El arriendo de un local es un costo…", o: ["Fijo", "Variable", "Ninguno"], c: 0 }, { p: "El punto de equilibrio es cuando…", o: ["Ingresos = costos totales", "Ganas el doble", "No vendes"], c: 0 }, { p: "Los materiales por unidad son costo…", o: ["Variable", "Fijo", "Ninguno"], c: 0 }] },
    { titulo: "Impuestos para emprender", quiz: [{ p: "Para dar boletas primero haces…", o: ["Inicio de actividades en el SII", "Nada", "Un crédito"], c: 0 }, { p: "El IVA en Chile es…", o: ["19%", "5%", "50%"], c: 0 }, { p: "La boleta de honorarios es para…", o: ["Servicios de una persona", "Vender pan", "Pagar el arriendo"], c: 0 }] },
  ],
};
export const temaDeLaSemana = (fecha: string) => Math.min(7, Math.max(0, semanaBloque(fecha) - 1 < 0 ? 0 : semanaBloque(fecha) - 1));

// ---------- Inglés: mazo inicial de fútbol ----------
export const MAZO_FUTBOL: [string, string, string][] = [
  ["goalkeeper", "arquero", "The goalkeeper made a great save."],
  ["defender", "defensa", "He plays as a central defender."],
  ["midfielder", "mediocampista", "I'm a defensive midfielder."],
  ["holding midfielder", "volante de contención", "As a holding midfielder, I protect the back four."],
  ["winger", "puntero", "The winger crossed the ball."],
  ["striker", "delantero", "The striker scored twice."],
  ["full-back", "lateral", "Our full-back overlaps a lot."],
  ["pitch", "cancha", "The pitch is wet today."],
  ["penalty area", "área", "Don't foul inside the penalty area."],
  ["halfway line", "línea de mitad de cancha", "Stay behind the halfway line."],
  ["corner flag", "banderín del córner", "Take it to the corner flag."],
  ["goal line", "línea de gol", "The ball crossed the goal line."],
  ["touchline", "línea de banda", "Stay wide, near the touchline."],
  ["kick-off", "saque inicial", "Kick-off is at 3 pm."],
  ["throw-in", "saque de banda", "It's our throw-in."],
  ["free kick", "tiro libre", "He scored from a free kick."],
  ["offside", "fuera de juego", "The goal was offside."],
  ["tackle", "barrida / quite", "Great tackle!"],
  ["through ball", "pase filtrado", "Play a through ball to the striker."],
  ["first touch", "primer toque / control", "Work on your first touch."],
  ["man on!", "¡te marcan!", "Man on! Play it back!"],
  ["time!", "¡tienes tiempo!", "Time! Turn and play."],
  ["switch play", "cambia de frente", "Switch play to the other side."],
  ["press!", "¡presiona!", "Press high when they have the ball."],
  ["track back", "volver a marcar", "Track back and help the defense."],
  ["hold the line", "mantener la línea", "Hold the line, don't drop."],
  ["mark your man", "marca a tu hombre", "Mark your man at corners."],
  ["give and go", "pared", "Use a give and go."],
  ["clean sheet", "valla invicta", "We kept a clean sheet."],
  ["bench", "banca", "I started on the bench."],
  ["substitute", "suplente / cambio", "He came on as a substitute."],
  ["trial", "prueba (en un club)", "I have a trial next month."],
  ["coach", "entrenador", "The coach wants more intensity."],
  ["drill", "ejercicio de entrenamiento", "Let's start the passing drill."],
  ["warm-up", "calentamiento", "Do a good warm-up."],
  ["I play as a number 5", "juego de 5", "I play as a number 5, a holding midfielder."],
  ["my strongest foot is…", "mi pierna hábil es…", "My strongest foot is my right."],
  ["I'm comfortable on the ball", "me siento cómodo con el balón", "I'm comfortable on the ball under pressure."],
  ["I read the game well", "leo bien el juego", "I read the game well and intercept passes."],
  ["Nice to meet you, I'm Diego", "un gusto, soy Diego", "Nice to meet you, I'm Diego, I'm 18."],
];

// ---------- Repetición espaciada ----------
// Tarjetas: acierto duplica el intervalo (1, 2, 4, 8…); fallo vuelve a 1 día.
export function repasarTarjeta(t: Tarjeta, acierto: boolean, hoy: string): Tarjeta {
  const intervalo = acierto ? Math.min(120, Math.max(1, t.intervalo) * 2) : 1;
  return { ...t, intervalo, proximaRevision: addDays(hoy, intervalo), aciertos: t.aciertos + (acierto ? 1 : 0), fallos: t.fallos + (acierto ? 0 : 1) };
}
// Cuaderno de errores: vuelve a los 2 días; si lo haces bien sube el intervalo (y a la 3.ª vez queda resuelto), si fallas vuelve a 2 días.
export function repasarError(e: ErrorCuaderno, acierto: boolean, hoy: string): ErrorCuaderno {
  if (!acierto) return { ...e, intervalo: 2, proximaRevision: addDays(hoy, 2) };
  const intervalo = e.intervalo * 2;
  return { ...e, intervalo, proximaRevision: addDays(hoy, intervalo), resuelto: intervalo >= 16 };
}
export const tocanHoy = <T extends { proximaRevision: string }>(xs: T[], hoy: string) => xs.filter((x) => x.proximaRevision <= hoy && !(x as any).resuelto);
export const aprendida = (t: Tarjeta) => t.intervalo >= 4;

// ---------- Minutos, días y racha ----------
// También cuenta lo que anotaste antes con JARVIS ("estudié 1 hora de inglés") si la materia se llama parecido.
export function materiaDeNombre(nombre: string): MateriaBloque | null {
  const t = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/mate|m1|algebra|geometr/.test(t)) return "mate";
  if (/ingles|english/.test(t)) return "ingles";
  if (/lenguaje|lectora|lectura/.test(t)) return "lenguaje";
  if (/venta/.test(t)) return "ventas";
  if (/econom/.test(t)) return "economia";
  return null;
}
export function todasLasSesiones(log: EstudioLog[], viejas: Sesion[], materias: { id: string; nombre: string }[]): EstudioLog[] {
  const extra = viejas
    .map((s) => {
      const m = materiaDeNombre(materias.find((x) => x.id === s.materiaId)?.nombre || "");
      return m ? ({ id: `v:${s.id}`, fecha: s.fecha, materia: m, minutos: s.minutos } as EstudioLog) : null;
    })
    .filter((x): x is EstudioLog => !!x);
  return [...log, ...extra];
}
export function minutosPorSemana(log: EstudioLog[], desde: string, hasta: string) {
  const out: ({ etiqueta: string } & Record<string, number | string>)[] = [];
  for (let l = lunesDe(desde); l <= hasta; l = addDays(l, 7)) {
    const fila: { etiqueta: string } & Record<string, number | string> = { etiqueta: `${Number(l.slice(8))}/${Number(l.slice(5, 7))}` };
    for (const m of MATERIAS) fila[m.id] = log.filter((x) => x.materia === m.id && x.fecha >= l && x.fecha <= addDays(l, 6)).reduce((t, x) => t + x.minutos, 0);
    out.push(fila);
  }
  return out;
}
// Días planificados: lunes a viernes. Estudiado: al menos 15 minutos ese día.
export function diasEstudiados(log: EstudioLog[], desde: string, hasta: string): { hechos: number; plan: number } {
  let hechos = 0;
  let plan = 0;
  for (let f = desde; f <= hasta; f = addDays(f, 1)) {
    if (dow(f) <= 4) plan++;
    if (log.filter((x) => x.fecha === f).reduce((t, x) => t + x.minutos, 0) >= 15) hechos++;
  }
  return { hechos, plan };
}
export function rachaEstudio(log: EstudioLog[], hoy: string): number {
  let n = 0;
  for (let f = hoy; ; f = addDays(f, -1)) {
    const hizo = log.some((x) => x.fecha === f && x.minutos >= 15);
    if (hizo) n++;
    else if (f === hoy || dow(f) >= 5) continue; // hoy todavía, y el fin de semana no corta la racha
    else break;
    if (n > 400) break;
  }
  return n;
}
export const pct = (a = 0, t = 0) => (t ? Math.round((a / t) * 100) : 0);

// ---------- Calculadoras ----------
// Ahorro mensual con interés compuesto: cuánto tienes al final de cada año.
export function interesCompuesto(mensual: number, tasaAnual: number, anios: number): { etiqueta: string; valor: number; aportado: number }[] {
  const r = tasaAnual / 100 / 12;
  let saldo = 0;
  const out: { etiqueta: string; valor: number; aportado: number }[] = [];
  for (let m = 1; m <= anios * 12; m++) {
    saldo = saldo * (1 + r) + mensual;
    if (m % 12 === 0) out.push({ etiqueta: `Año ${m / 12}`, valor: Math.round(saldo), aportado: mensual * m });
  }
  return out;
}
export const presupuesto503020 = (ingreso: number) => ({ necesidades: Math.round(ingreso * 0.5), gustos: Math.round(ingreso * 0.3), ahorro: Math.round(ingreso * 0.2) });
export function puntoEquilibrio(fijos: number, precio: number, variable: number): number | null {
  const m = precio - variable;
  return m > 0 ? Math.ceil(fijos / m) : null;
}
