// Estructura de los datos de la app. Todo vive en el teléfono (IndexedDB).
// Los montos son SIEMPRE pesos chilenos enteros: nada de decimales, así no hay errores de redondeo.

export type Tipo = "ingreso" | "egreso";

export interface Movimiento {
  id: string;
  tipo: Tipo;
  monto: number; // pesos enteros, siempre positivo; el tipo dice si suma o resta
  categoriaId: string;
  fecha: string; // AAAA-MM-DD
  nota?: string;
  recurrenteId?: string; // si lo creó un gasto fijo
  demo?: boolean; // dato de ejemplo (se borra con un toque)
  creado: number;
}

export interface Categoria {
  id: string;
  nombre: string;
  tipo: Tipo; // en ingresos, la categoría es la fuente: sueldo, propinas, trabajos extra
  orden: number;
  demo?: boolean;
}

// Presupuesto mensual de una categoría de gasto (vale para todos los meses).
export interface Presupuesto {
  id: string; // = categoriaId
  categoriaId: string;
  monto: number;
  demo?: boolean;
}

// Gasto o ingreso que se repite solo cada mes (arriendo, plan del celular, sueldo).
export interface Recurrente {
  id: string;
  nombre: string;
  tipo: Tipo;
  monto: number;
  categoriaId: string;
  dia: number; // 1 a 28
  desde: string; // AAAA-MM: primer mes en que corre
  activo: boolean;
  demo?: boolean;
}

export interface Datos {
  movimientos: Movimiento[];
  categorias: Categoria[];
  presupuestos: Presupuesto[];
  recurrentes: Recurrente[];
}

export type StoreName = keyof Datos;
export const STORES: StoreName[] = ["movimientos", "categorias", "presupuestos", "recurrentes"];

export const emptyDatos = (): Datos => ({ movimientos: [], categorias: [], presupuestos: [], recurrentes: [] });

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const CATEGORIAS_BASE: Omit<Categoria, "orden">[] = [
  { id: "c-comida", nombre: "Comida", tipo: "egreso" },
  { id: "c-transporte", nombre: "Transporte", tipo: "egreso" },
  { id: "c-salidas", nombre: "Salidas", tipo: "egreso" },
  { id: "c-deporte", nombre: "Deporte", tipo: "egreso" },
  { id: "c-celular", nombre: "Celular e internet", tipo: "egreso" },
  { id: "c-ropa", nombre: "Ropa", tipo: "egreso" },
  { id: "c-estudios", nombre: "Estudios", tipo: "egreso" },
  { id: "c-otros", nombre: "Otros gastos", tipo: "egreso" },
  { id: "i-sueldo", nombre: "Sueldo", tipo: "ingreso" },
  { id: "i-propinas", nombre: "Propinas", tipo: "ingreso" },
  { id: "i-extra", nombre: "Trabajos extra", tipo: "ingreso" },
  { id: "i-otros", nombre: "Otros ingresos", tipo: "ingreso" },
];

export const categoriasBase = (): Categoria[] => CATEGORIAS_BASE.map((c, i) => ({ ...c, orden: i }));
