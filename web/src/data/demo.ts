// Datos de ejemplo para la bienvenida (opcionales). Todos llevan demo: true y se borran con un toque.
import { sumarMeses } from "../money/calc";
import { addDays, dow, lunesDe } from "../core/dates";
import type { Actividad, Datos, Dia, Entreno, Habito, Movimiento, Partido, Sesion, Turno } from "./types";
import { generarRutina } from "../training/calc";

export function datosEjemplo(hoy: string): Partial<Datos> {
  const mes = hoy.slice(0, 7);
  const dia = Number(hoy.slice(8, 10));
  const movs: Movimiento[] = [];
  let n = 0;
  const add = (m: string, d: number, tipo: Movimiento["tipo"], monto: number, categoriaId: string, nota: string, fijo = false) => {
    if (m === mes && d > dia) return;
    movs.push({ id: `demo-${n++}`, tipo, monto, categoriaId, fecha: `${m}-${String(d).padStart(2, "0")}`, nota, demo: true, creado: Date.now(), ...(fijo ? { recurrenteId: "demo-fijo" } : {}) });
  };
  for (let k = 3; k >= 0; k--) {
    const m = sumarMeses(mes, -k);
    add(m, 1, "ingreso", 420000, "i-sueldo", "Sueldo");
    [3, 8, 13, 18, 23, 28].forEach((d, i) => add(m, d, "ingreso", 18000 + i * 2500, "i-propinas", "Propinas"));
    add(m, 2, "egreso", 25000, "c-celular", "Plan del celular", true);
    [4, 9, 14, 19, 24].forEach((d) => add(m, d, "egreso", 22000 + ((d * 37) % 9) * 1000, "c-comida", "Supermercado"));
    [6, 16, 26].forEach((d) => add(m, d, "egreso", 9500, "c-transporte", "Micro y colectivo"));
    add(m, 11, "egreso", 32000 - k * 3000, "c-salidas", "Salida con amigos");
    add(m, 20, "egreso", 15000, "c-deporte", "Cancha");
  }
  return {
    movimientos: movs,
    presupuestos: [
      { id: "c-comida", categoriaId: "c-comida", monto: 130000, demo: true },
      { id: "c-transporte", categoriaId: "c-transporte", monto: 35000, demo: true },
      { id: "c-salidas", categoriaId: "c-salidas", monto: 40000, demo: true },
      { id: "c-celular", categoriaId: "c-celular", monto: 25000, demo: true },
    ],
    recurrentes: [],
    ...ejemploFase2(hoy),
    ...ejemploFase3(hoy),
    ...ejemploFase5(hoy),
  };
}

function ejemploFase3(hoy: string): Partial<Datos> {
  const D = { demo: true as const };
  const t = hoy.slice(0, 4);
  const partidos: Partido[] = [];
  const rivales = ["Llanquihue FC", "Deportes Frutillar", "Unión Ensenada", "Puerto Octay", "Club Alerce", "Los Muermos"];
  // Partidos los sábados de las últimas 6 semanas y los próximos 2; entrenamientos los miércoles.
  for (let k = -6; k <= 2; k++) {
    const sab = addDays(lunesDe(hoy), 5 + 7 * k);
    const mie = addDays(lunesDe(hoy), 2 + 7 * k);
    const jugado = sab < hoy;
    const i = (k + 6) % rivales.length;
    partidos.push({
      id: `demo-p${k}`, tipo: "partido", fecha: sab, hora: "11:00", rival: rivales[i], lugar: "Cancha municipal", temporada: sab.slice(0, 4), importante: k === 0,
      ...(jugado ? { fui: true, minutos: [90, 75, 90, 60, 90, 85][i], goles: [0, 1, 0, 0, 1, 0][i], asistencias: [1, 0, 2, 0, 0, 1][i], pases: [42, 35, 51, 28, 47, 39][i], calificacion: [7, 6, 8, 5, 7, 7][i], golesFavor: [2, 1, 3, 0, 2, 1][i], golesContra: [1, 1, 1, 2, 2, 0][i], bien: "Buen primer toque", mejorar: "Llegar más al área" } : {}),
      ...D,
    });
    if (mie < hoy || k >= 0) partidos.push({ id: `demo-e${k}`, tipo: "entrenamiento", fecha: mie, hora: "19:30", lugar: "Cancha municipal", temporada: mie.slice(0, 4), ...(mie < hoy ? { fui: k !== -3 } : {}), ...D });
  }
  partidos.push({ id: "demo-pv", tipo: "partido", fecha: `${Number(t) - 1}-11-08`, rival: "Llanquihue FC", temporada: String(Number(t) - 1), fui: true, minutos: 45, goles: 0, asistencias: 1, calificacion: 6, ...D });
  const sesiones = generarRutina({ objetivo: "futbol", dias: [0, 2, 4], minutos: 60, equipo: ["mancuernas", "banda", "barra-dominadas", "mochila", "cajon"], nivel: 2, diasPartido: [2, 5] });
  const entrenos: Entreno[] = [];
  for (let w = 3; w >= 0; w--) {
    for (const s of sesiones) {
      const f = addDays(lunesDe(hoy), s.dia - 7 * w);
      if (f >= hoy) continue;
      entrenos.push({
        id: `demo-en${w}-${s.dia}`, fecha: f, nombre: s.nombre.replace(/^[^:]+: /, ""), sesionId: s.id, rpe: 7,
        items: s.items.map((it) => ({ ejId: it.ejId, series: Array.from({ length: it.series }, () => ({ reps: Math.min(it.repsMax, it.repsMin + (3 - w)) })) })),
        ...D,
      });
    }
  }
  return {
    partidos,
    planes: [{ id: "activo", objetivo: "futbol", dias: [0, 2, 4], minutos: 60, equipo: ["mancuernas", "banda", "barra-dominadas", "mochila", "cajon"], nivel: 2, sesiones, creado: hoy }],
    entrenos,
    clubes: [{ id: "demo-c1", club: "Deportes Puerto Montt (juveniles)", estado: "postule", fecha: addDays(hoy, 20), contacto: "Coordinador de cadetes", ...D }],
    videos: [{ id: "demo-v1", titulo: "Asistencia vs. Unión Ensenada", url: "https://www.youtube.com/", nota: "Minuto 2:15, pase al espacio", ...D }],
  };
}

function ejemploFase2(hoy: string): Partial<Datos> {
  const D = { demo: true as const };
  const turnos: Turno[] = [];
  const sesiones: Sesion[] = [];
  // Últimas 4 semanas y la que viene: turnos de martes a sábado.
  for (let k = -28; k <= 7; k++) {
    const f = addDays(hoy, k);
    const d = dow(f);
    if (d >= 1 && d <= 5) turnos.push({ id: `demo-t${k}`, fecha: f, inicio: d === 5 ? "16:00" : "14:00", fin: d === 5 ? "00:30" : "22:30", pausaMin: 30, ...(k === -9 ? { falte: true } : {}), ...D });
    if (k <= 0 && d !== 6) sesiones.push({ id: `demo-s${k}`, materiaId: "demo-ing", fecha: f, minutos: d % 2 ? 25 : 30, ...D });
    if (k <= 0 && (d === 0 || d === 3)) sesiones.push({ id: `demo-m${k}`, materiaId: "demo-mat", fecha: f, minutos: 45, ...D });
  }
  const inicio = addDays(hoy, -45);
  return {
    turnos,
    sesiones,
    materias: [
      { id: "demo-ing", nombre: "Inglés", metaHorasSemana: 3, ...D },
      { id: "demo-mat", nombre: "Matemáticas PAES", metaHorasSemana: 1.5, ...D },
    ],
    tareas: [
      { id: "demo-ta1", texto: "Repasar verbos irregulares", materiaId: "demo-ing", fecha: hoy, hecho: false, ...D },
      { id: "demo-ta2", texto: "Ensayo de comprensión lectora", materiaId: "demo-mat", fecha: addDays(hoy, 3), hecho: false, ...D },
    ],
    evaluaciones: [
      { id: "demo-e1", materiaId: "demo-ing", nombre: "EF SET (1)", fecha: addDays(hoy, -60), escala: "porcentaje", resultado: 38, meta: 45, ...D },
      { id: "demo-e2", materiaId: "demo-ing", nombre: "EF SET (2)", fecha: addDays(hoy, -20), escala: "porcentaje", resultado: 46, meta: 45, ...D },
      { id: "demo-e3", materiaId: "demo-ing", nombre: "EF SET (3)", fecha: addDays(hoy, 5), escala: "porcentaje", meta: 51, ...D },
    ],
    metas: [
      { id: "demo-g1", nombre: "Ahorro Working Holiday", area: "dinero", tipo: "monto", objetivo: 3000000, inicio, fechaLimite: addDays(hoy, 400), fuente: "ahorro", principal: true, creado: 0, ...D },
      { id: "demo-g2", nombre: "60 horas de inglés", area: "estudios", tipo: "cantidad", objetivo: 60, unidad: "horas", inicio, fechaLimite: addDays(hoy, 120), fuente: "horas-estudio", principal: true, creado: 0, ...D },
      { id: "demo-g3", nombre: "Correr 3 veces por semana", area: "cuerpo", tipo: "habito", objetivo: 3, inicio: lunesDe(addDays(hoy, -21)), fechaLimite: addDays(hoy, 60), fuente: "manual", principal: true, creado: 0, ...D },
      {
        id: "demo-g4", nombre: "Trámites de la visa", area: "otro", tipo: "pasos", objetivo: 0, inicio, fechaLimite: addDays(hoy, 300), fuente: "manual", creado: 0,
        pasos: [
          { id: "p1", texto: "Pasaporte al día", hecho: true },
          { id: "p2", texto: "Prueba de inglés", hecho: false },
          { id: "p3", texto: "Juntar los fondos", hecho: false },
          { id: "p4", texto: "Postular a la visa", hecho: false },
        ],
        ...D,
      },
    ],
    aportes: [
      { id: "demo-a0", metaId: "demo-g1", fecha: inicio, valor: 600000, nota: "Lo que ya tenía", ...D },
      ...[-20, -18, -15, -13, -11, -8, -6, -2].map((k) => ({ id: `demo-a${k}`, metaId: "demo-g3", fecha: addDays(hoy, k), valor: 1, ...D })),
    ],
  };
}

// Hábitos, bienestar y bitácora de tiempo de ejemplo (últimas semanas).
function ejemploFase5(hoy: string): Partial<Datos> {
  const D = { demo: true as const };
  const habitos: Habito[] = [
    { id: "demo-h1", nombre: "Leer 15 minutos", dias: [], orden: 0, ...D },
    { id: "demo-h2", nombre: "Estirar 10 minutos", dias: [], orden: 1, ...D },
    { id: "demo-h3", nombre: "Inglés 20 minutos", dias: [0, 1, 2, 3, 4], orden: 2, ...D },
  ];
  const dias: Dia[] = [];
  for (let k = 1; k <= 20; k++) {
    const f = addDays(hoy, -k);
    const hs = [k % 3 !== 0 ? "demo-h1" : "", k % 4 !== 1 ? "demo-h2" : "", k % 5 !== 2 && dow(f) < 5 ? "demo-h3" : ""].filter(Boolean);
    dias.push({ id: f, habitos: hs, sueno: [7.5, 6.5, 8, 7, 6, 7.5, 8.5][k % 7], energia: [4, 3, 4, 3, 2, 4, 5][k % 7], animo: [4, 4, 3, 4, 3, 5, 4][k % 7], agua: [6, 8, 5, 7, 8, 4, 6][k % 7], ...D });
  }
  dias.push({ id: hoy, habitos: ["demo-h2"], sueno: 7.5, agua: 2, ...D });
  const actividades: Actividad[] = [];
  const b = (id: string, cat: Actividad["cat"], ini: string, fin: string, nota?: string) => actividades.push({ id, cat, inicio: ini, fin, ...(nota ? { nota } : {}), ...D });
  for (let k = 0; k <= 6; k++) {
    const f = addDays(hoy, -k);
    const ayer = addDays(f, -1);
    b(`demo-t${k}s`, "sueno", `${ayer}T23:45`, `${f}T07:15`);
    if (k === 0) continue;
    b(`demo-t${k}d`, "comida", `${f}T07:30`, `${f}T08:00`, "Desayuno");
    b(`demo-t${k}e`, "estudio", `${f}T08:30`, `${f}T${k % 2 ? "10:00" : "09:30"}`, "Inglés");
    b(`demo-t${k}c`, "pantallas", `${f}T10:00`, `${f}T${k % 3 ? "10:40" : "11:30"}`);
    b(`demo-t${k}a`, "comida", `${f}T13:00`, `${f}T13:40`, "Almuerzo");
    b(`demo-t${k}m`, "traslado", `${f}T13:40`, `${f}T14:00`, "Micro al trabajo");
    if (dow(f) >= 5) b(`demo-t${k}o`, "social", `${f}T16:00`, `${f}T19:00`, "Con amigos");
    b(`demo-t${k}n`, "pantallas", `${f}T22:45`, `${f}T23:40`);
  }
  return { habitos, dias, actividades };
}
