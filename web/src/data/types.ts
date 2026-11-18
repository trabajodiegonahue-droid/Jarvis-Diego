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

// ---------- Metas ----------
export type Area = "dinero" | "cuerpo" | "futbol" | "estudios" | "trabajo" | "otro";
// monto: plata; cantidad: un número (horas, kilos, libros); habito: veces por semana; pasos: lista de cosas por hacer.
export type TipoMeta = "monto" | "cantidad" | "habito" | "pasos";
// De dónde sale el avance: a mano, o solo desde otro módulo.
export type FuenteMeta = "manual" | "ahorro" | "horas-estudio" | "horas-trabajo";

export interface Paso {
  id: string;
  texto: string;
  hecho: boolean;
}

export interface Meta {
  id: string;
  nombre: string;
  area: Area;
  tipo: TipoMeta;
  objetivo: number; // monto en pesos, cantidad, o veces por semana (hábito); en pasos no se usa
  unidad?: string; // "horas", "kg", "libros"…
  inicio: string; // AAAA-MM-DD
  fechaLimite: string; // AAAA-MM-DD
  fuente: FuenteMeta;
  pasos?: Paso[];
  principal?: boolean; // aparece en el inicio
  archivada?: boolean;
  demo?: boolean;
  creado: number;
}

// Avance anotado a mano (un aporte de plata, horas, una vez que cumpliste el hábito).
export interface Aporte {
  id: string;
  metaId: string;
  fecha: string;
  valor: number;
  nota?: string;
  demo?: boolean;
}

// Revisión mensual: qué cambio para el mes siguiente.
export interface Revision {
  id: string; // AAAA-MM
  nota: string;
}

// ---------- Trabajo ----------
export interface Turno {
  id: string;
  fecha: string; // día en que empieza
  inicio: string; // HH:MM
  fin: string; // HH:MM (si es menor que el inicio, terminó al día siguiente)
  pausaMin: number;
  falte?: boolean; // turno planificado al que no fui
  propinas?: number; // pesos; si se anotan, pasan a Dinero como ingreso
  nota?: string;
  demo?: boolean;
}

// ---------- Estudios ----------
export interface Materia {
  id: string;
  nombre: string;
  metaHorasSemana?: number;
  demo?: boolean;
}

export interface Sesion {
  id: string;
  materiaId: string;
  fecha: string;
  minutos: number;
  nota?: string;
  demo?: boolean;
}

export interface Tarea {
  id: string;
  texto: string;
  materiaId?: string;
  fecha?: string; // para cuándo
  hecho: boolean;
  demo?: boolean;
}

// Prueba, ensayo o certificación. Escala: nota chilena 1,0 a 7,0, puntaje o porcentaje.
export interface Evaluacion {
  id: string;
  materiaId: string;
  nombre: string;
  fecha: string;
  escala: "nota" | "puntaje" | "porcentaje";
  resultado?: number;
  meta?: number;
  demo?: boolean;
}

// ---------- Fútbol ----------
export interface Partido {
  id: string;
  tipo: "partido" | "entrenamiento"; // entrenamiento = con el equipo
  fecha: string;
  hora?: string;
  rival?: string;
  lugar?: string;
  importante?: boolean;
  temporada: string; // "2026"
  fui?: boolean; // se marca al registrar; un evento pasado sin registrar queda pendiente
  golesFavor?: number;
  golesContra?: number;
  minutos?: number;
  goles?: number;
  asistencias?: number;
  pases?: number;
  calificacion?: number; // 1 a 10
  bien?: string;
  mejorar?: string;
  demo?: boolean;
}

export interface Club {
  id: string;
  club: string;
  fecha?: string;
  estado: "pendiente" | "postule" | "prueba" | "aceptado" | "no-quede";
  contacto?: string;
  nota?: string;
  demo?: boolean;
}

export interface Video {
  id: string;
  titulo: string;
  url: string;
  fecha?: string;
  nota?: string;
  demo?: boolean;
}

// ---------- Entrenamiento ----------
export type Objetivo = "futbol" | "fuerza" | "masa";

export interface ItemPlan {
  ejId: string;
  series: number;
  repsMin: number;
  repsMax: number; // en ejercicios por tiempo: segundos
  descanso: number; // segundos
}

export interface SesionPlan {
  id: string;
  dia: number; // 0 = lunes … 6 = domingo
  nombre: string;
  items: ItemPlan[];
  minutos: number; // estimado
}

export interface Plan {
  id: string; // "activo"
  objetivo: Objetivo;
  dias: number[];
  minutos: number;
  equipo: string[];
  nivel: 1 | 2 | 3;
  sesiones: SesionPlan[];
  creado: string;
}

export interface SerieHecha {
  reps: number; // o segundos
  kg?: number;
}

export interface Entreno {
  id: string;
  fecha: string;
  nombre: string;
  sesionId?: string;
  items: { ejId: string; series: SerieHecha[] }[];
  rpe?: number; // esfuerzo percibido 1 a 10
  nota?: string;
  demo?: boolean;
}

// Cómo me siento hoy (carga y descanso).
export interface Chequeo {
  id: string; // fecha AAAA-MM-DD
  cansancio: number; // 1 (fresco) a 5 (reventado)
  dolor: number; // 0 a 10
  zona?: string;
  agudo?: boolean; // dolor punzante o que no se va
  sueno?: number; // horas
  demo?: boolean;
}

// ---------- Hábitos y bienestar ----------
export interface Habito {
  id: string;
  nombre: string;
  dias: number[]; // días de la semana en que aplica (0 = lunes); todos = diario
  orden: number;
  archivado?: boolean;
  demo?: boolean;
}

// Cómo estuvo el día: hábitos cumplidos, sueño, energía, ánimo, agua y un diario corto.
export interface Dia {
  id: string; // fecha AAAA-MM-DD
  habitos: string[]; // ids de los hábitos cumplidos
  sueno?: number; // horas
  energia?: number; // 1 a 5
  animo?: number; // 1 a 5
  agua?: number; // vasos
  diario?: string;
  demo?: boolean;
}

// ---------- Bitácora de tiempo ----------
// Un bloque de lo que hiciste, al minuto. Sin "fin" = está corriendo ahora (cronómetro).
export type CatTiempo = "sueno" | "trabajo" | "estudio" | "entreno" | "futbol" | "traslado" | "comida" | "casa" | "social" | "ocio" | "pantallas" | "otro";

export interface Actividad {
  id: string;
  cat: CatTiempo;
  inicio: string; // AAAA-MM-DDTHH:MM, hora de Chile
  fin?: string; // AAAA-MM-DDTHH:MM
  nota?: string;
  demo?: boolean;
}

// ---------- Memoria de JARVIS ----------
// Lo que Diego le cuenta para que se acuerde ("mañana tengo prueba", "me lesioné el tobillo").
export interface Recuerdo {
  id: string;
  texto: string;
  creado: string; // AAAA-MM-DD
  fecha?: string; // si habla de un día en particular
  demo?: boolean;
}

// ---------- Cumpleaños y fechas importantes ----------
export interface FechaImportante {
  id: string;
  nombre: string; // "Cumpleaños de la Cata"
  dia: string; // MM-DD, se repite todos los años
  anio?: number; // año de nacimiento o de inicio, para decir cuántos cumple
  tipo: "cumple" | "aniversario" | "otro";
  demo?: boolean;
}

// ---------- Recordatorios ----------
// "Recuérdame pagar la luz el viernes a las 10". Suenan en la app y, con los avisos activados, en el teléfono.
export interface Recordatorio {
  id: string;
  texto: string;
  cuando: string; // AAAA-MM-DDTHH:MM (hora de Chile)
  repetir?: "diario" | "semanal" | "mensual" | "anual";
  hecho?: boolean; // ya avisó (o lo marcaste listo)
  demo?: boolean;
}

// ---------- Lista de compras ----------
export interface Compra {
  id: string;
  texto: string;
  hecho: boolean;
  creado: number;
  demo?: boolean;
}

export interface Datos {
  movimientos: Movimiento[];
  categorias: Categoria[];
  presupuestos: Presupuesto[];
  recurrentes: Recurrente[];
  metas: Meta[];
  aportes: Aporte[];
  revisiones: Revision[];
  turnos: Turno[];
  materias: Materia[];
  sesiones: Sesion[];
  tareas: Tarea[];
  evaluaciones: Evaluacion[];
  partidos: Partido[];
  clubes: Club[];
  videos: Video[];
  planes: Plan[];
  entrenos: Entreno[];
  chequeos: Chequeo[];
  habitos: Habito[];
  dias: Dia[];
  actividades: Actividad[];
  recuerdos: Recuerdo[];
  fechas: FechaImportante[];
  compras: Compra[];
  recordatorios: Recordatorio[];
}

export type StoreName = keyof Datos;
export const STORES: StoreName[] = ["movimientos", "categorias", "presupuestos", "recurrentes", "metas", "aportes", "revisiones", "turnos", "materias", "sesiones", "tareas", "evaluaciones", "partidos", "clubes", "videos", "planes", "entrenos", "chequeos", "habitos", "dias", "actividades", "recuerdos", "fechas", "compras", "recordatorios"];

export const emptyDatos = (): Datos => ({ movimientos: [], categorias: [], presupuestos: [], recurrentes: [], metas: [], aportes: [], revisiones: [], turnos: [], materias: [], sesiones: [], tareas: [], evaluaciones: [], partidos: [], clubes: [], videos: [], planes: [], entrenos: [], chequeos: [], habitos: [], dias: [], actividades: [], recuerdos: [], fechas: [], compras: [], recordatorios: [] });

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
