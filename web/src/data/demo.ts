// Datos de ejemplo para la bienvenida (opcionales). Todos llevan demo: true y se borran con un toque.
import { sumarMeses } from "../money/calc";
import { addDays, dow, lunesDe } from "../core/dates";
import type { Datos, Movimiento, Sesion, Turno } from "./types";

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
