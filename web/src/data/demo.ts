// Datos de ejemplo para la bienvenida (opcionales). Todos llevan demo: true y se borran con un toque.
import { sumarMeses } from "../money/calc";
import type { Datos, Movimiento } from "./types";

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
  };
}
