// Las sesiones del bloque (Fuerza A, Fuerza B, Velocidad…) con sus ejercicios, dosis, descanso y consejos.
// La dosis se ajusta sola según la fase (base, descarga, intensificación, afinar).
import type { SesionId, TipoSesion } from "./bloque";

export type Pose =
  | "trote" | "plancha" | "plancha-lateral" | "equilibrio" | "sentadilla" | "salto" | "sprint" | "bulgara" | "bisagra" | "stepup" | "puente" | "nordico"
  | "copenhague" | "gemelo" | "flexion" | "remo" | "press-suelo" | "press-hombro" | "dominada" | "core-hombros" | "curl" | "skipping" | "pogo" | "salto-largo"
  | "lateral" | "conduccion" | "giro" | "reaccion" | "movilidad" | "pared" | "tiro" | "toques" | "pase-largo" | "dominadas-balon" | "estirar";

export interface EjB {
  id: string;
  nombre: string;
  pose: Pose;
  series: number;
  reps: string; // "8–12", "20 m", "30 s", "máx"
  repsNum: number; // para precargar el registro
  porTiempo?: boolean; // reps = segundos
  kg?: boolean; // se registra peso
  descanso: number; // segundos entre series
  porLado?: boolean;
  consejos: string[];
}

const E = (id: string, nombre: string, pose: Pose, series: number, reps: string, descanso: number, consejos: string[], extra: Partial<EjB> = {}): EjB => ({
  id, nombre, pose, series, reps, repsNum: Number((reps.match(/\d+/) || ["0"])[0]), descanso, consejos, ...extra,
});

export const EJ: Record<string, EjB> = Object.fromEntries(
  [
    // Calentamiento FIFA 11+
    E("fifa-trote", "Trote con variaciones", "trote", 1, "4 min", 0, ["Adelante, cadera afuera y adentro, rodeando al compañero", "Ritmo suave: es para entrar en calor"], { porTiempo: true, repsNum: 240 }),
    E("fifa-plancha", "Plancha", "plancha", 3, "20–30 s", 20, ["Cuerpo recto de cabeza a talones", "Aprieta glúteos y abdomen"], { porTiempo: true }),
    E("fifa-lateral", "Plancha lateral", "plancha-lateral", 2, "20 s", 20, ["Cadera arriba, no la dejes caer", "Cada lado"], { porTiempo: true, porLado: true }),
    E("fifa-equilibrio", "Equilibrio a una pierna", "equilibrio", 1, "30 s", 10, ["Rodilla levemente flectada", "Mira al frente; si es fácil, cierra los ojos"], { porTiempo: true, porLado: true }),
    E("fifa-sentadilla", "Sentadillas", "sentadilla", 2, "10", 20, ["Rodillas en línea con la punta del pie", "Baja controlado"]),
    E("fifa-saltos", "Saltos", "salto", 2, "10", 20, ["Cae suave, sobre la parte delantera del pie", "Rodillas nunca hacia adentro"]),
    E("fifa-aceleraciones", "Aceleraciones progresivas", "sprint", 3, "60–75–90%", 30, ["Primera al 60%, segunda al 75%, tercera al 90%", "Camina de vuelta"]),
    // Fuerza A (piernas)
    E("bulgara", "Sentadilla búlgara", "bulgara", 4, "8–12", 75, ["Bajada de 3 segundos", "Las últimas 1–3 repeticiones tienen que costar", "Rodilla de adelante alineada con el pie"], { kg: true, porLado: true }),
    E("pm-1pierna", "Peso muerto rumano a 1 pierna", "bisagra", 3, "8–10", 75, ["Espalda recta, la cadera va atrás", "Siente el isquiotibial de la pierna de apoyo"], { kg: true, porLado: true }),
    E("stepup", "Step-up con rodilla arriba", "stepup", 3, "8", 60, ["Empuja con la pierna de arriba, no te impulses con la de abajo", "Sube la rodilla contraria a la cadera"], { kg: true, porLado: true }),
    E("hipthrust-1", "Hip thrust a 1 pierna", "puente", 3, "10–12", 60, ["Pausa 1 s arriba", "Empuja con el talón"], { kg: true, porLado: true }),
    E("nordico", "Nórdico", "nordico", 3, "4–6", 90, ["Baja lo más lento que puedas", "Clave para prevenir lesiones de isquiotibial: no te lo saltes"]),
    E("copenhague", "Copenhague", "copenhague", 3, "6–10", 60, ["Pierna de arriba apoyada en una banca o silla", "Protege los aductores (pubalgia)"], { porLado: true }),
    E("gemelo-1", "Gemelo a 1 pierna", "gemelo", 3, "15", 45, ["Sube y baja completo, pausa arriba"], { kg: true, porLado: true }),
    // Fuerza B (tren superior)
    E("flexion-pies", "Flexiones con pies elevados", "flexion", 4, "1–2 del fallo", 75, ["Cuerpo recto, codos a 45°", "Para cuando te queden 1–2 en el estanque"], { repsNum: 12 }),
    E("remo-1", "Remo a 1 brazo", "remo", 4, "10–12", 60, ["Lleva el codo a la cadera", "Espalda plana"], { kg: true, porLado: true }),
    E("press-suelo", "Press de pecho en el suelo", "press-suelo", 3, "12–15", 60, ["Codos tocan el suelo suave", "Junta los discos en una mancuerna si te queda corto"], { kg: true }),
    E("press-hombro", "Press de hombro", "press-hombro", 3, "10–12", 60, ["No arquees la espalda", "Sube en línea recta"], { kg: true }),
    E("dominadas", "Dominadas", "dominada", 3, "máx", 90, ["Desde brazos estirados", "Si no salen, baja lento desde arriba"], { repsNum: 6 }),
    E("plancha-hombros", "Plancha tocándote los hombros", "core-hombros", 3, "20", 30, ["Que la cadera no se mueva"]),
    E("brazos", "Bíceps + tríceps", "curl", 3, "12–15", 45, ["Sin balancearte"], { kg: true }),
    // Velocidad + saltos
    E("skipping", "Skipping A y B", "skipping", 2, "20 m", 45, ["Rodillas arriba, brazos activos", "Apoyos rápidos"]),
    E("pogo", "Pogo", "pogo", 3, "15", 45, ["Saltitos rápidos con tobillos rígidos", "Poco tiempo en el suelo"]),
    E("salto-largo", "Salto largo", "salto-largo", 3, "4", 60, ["Brazos atrás y explota", "Cae amortiguando"]),
    E("salto-escalon", "Salto al escalón", "salto", 3, "5", 60, ["Baja caminando, no saltando"]),
    E("lateral-1", "Saltos laterales a 1 pierna", "lateral", 3, "5", 45, ["Aguanta 1 s al caer"], { porLado: true }),
    E("acel-10", "Aceleraciones 10 m", "sprint", 5, "10 m", 60, ["Cuerpo inclinado los primeros pasos", "Máxima intención"]),
    E("vmax", "Velocidad máxima 30–40 m", "sprint", 4, "30–40 m", 150, ["Al 90–95%", "2–3 min de pausa: tienes que estar fresco", "Si te sientes lento, termina: STOP"]),
    // Resistencia 4×4
    E("4x4", "4×4 con balón", "conduccion", 3, "4 min", 180, ["Conducción fuerte en un circuito de ~40×20 m (slalom + conducción rápida)", "3 min de trote entre bloques", "Tienes que terminar cansado pero entero"], { porTiempo: true, repsNum: 240 }),
    // Agilidad
    E("5-10-5", "5-10-5", "lateral", 6, "1", 45, ["Toca la línea con la mano", "Bajo y explosivo en el cambio"]),
    E("giros-180", "Giros de 180°", "giro", 6, "1", 30, ["Frena en dos apoyos y sal rápido"]),
    E("slalom", "Slalom con balón", "conduccion", 6, "1", 30, ["Toques cortos, con las dos piernas"]),
    E("reaccion", "Reacción 5 m", "reaccion", 7, "1", 30, ["Que alguien te dé la señal (o usa un video)"]),
    // Activación
    E("act-movilidad", "Movilidad", "movilidad", 1, "10 min", 0, ["Cadera, tobillos y columna"], { porTiempo: true, repsNum: 600 }),
    E("act-sprints", "Sprints cortos 10 m", "sprint", 4, "10 m", 45, ["Rápidos pero sin fatigarte"]),
    E("act-pared", "Pared a un toque", "pared", 1, "5 min", 0, ["Un toque, con las dos piernas"], { porTiempo: true, repsNum: 300 }),
    E("act-tiros", "Tiros o cambios de frente", "tiro", 1, "10", 0, ["Calidad, no cantidad"]),
    // Técnica
    E("ball-mastery", "Ball mastery", "toques", 1, "15–20 min", 0, ["30 s por movimiento: toques internos, suela adelante y atrás, suela lateral, V-pull, L-turn, croqueta, interno-externo, cruce por detrás", "Usa el temporizador de ball mastery"], { porTiempo: true, repsNum: 1080 }),
    E("pared-15", "Pared: control orientado", "pared", 1, "15 min", 0, ["Recibe orientado hacia donde vas a jugar", "La mitad con la pierna mala", "Escanea (mira atrás) antes de recibir"], { porTiempo: true, repsNum: 900 }),
    E("conduccion-giros", "Conducción y giros", "conduccion", 1, "10 min", 0, ["Cambios de ritmo y de dirección"], { porTiempo: true, repsNum: 600 }),
    E("pase-largo", "Pase largo", "pase-largo", 1, "10 min", 0, ["Superficie de contacto: empeine interior", "Pie de apoyo al lado del balón"], { porTiempo: true, repsNum: 600 }),
    E("dominadas-mala", "Dominadas de balón con la pierna mala", "dominadas-balon", 1, "récord", 0, ["Anota tu récord: es uno de tus tests"], { repsNum: 0 }),
    // Recuperación y preparador
    E("rec-movilidad", "Movilidad", "movilidad", 1, "20 min", 0, ["Suave, que se sienta bien"], { porTiempo: true, repsNum: 1200 }),
    E("rec-core", "Core corto", "plancha", 3, "30 s", 30, ["Plancha frontal y lateral"], { porTiempo: true }),
    E("rec-estirar", "Estirar", "estirar", 1, "10 min", 0, ["Cuádriceps, isquios, aductores, gemelos y cadera: 30 s por lado"], { porTiempo: true, repsNum: 600 }),
    E("prep-fullbody", "Full body con el preparador", "sentadilla", 1, "sesión", 0, ["Anota lo que hiciste y el esfuerzo"], { repsNum: 0 }),
    E("prep-10x10", "Test 10×10", "sprint", 10, "10 m", 30, ["Anota el tiempo del primer y del último sprint en Tests"]),
  ].map((e) => [e.id, e]),
);

export const CALENTAMIENTO = ["fifa-trote", "fifa-plancha", "fifa-lateral", "fifa-equilibrio", "fifa-sentadilla", "fifa-saltos", "fifa-aceleraciones"];

export const SESIONES: Record<SesionId, { nombre: string; tipo: TipoSesion; minutos: number; ejercicios: string[]; regla?: string }> = {
  fuerzaA: { nombre: "Fuerza A (piernas)", tipo: "fuerza", minutos: 60, ejercicios: ["bulgara", "pm-1pierna", "stepup", "hipthrust-1", "nordico", "copenhague", "gemelo-1"], regla: "Bajada de 3 s y las últimas 1–3 repeticiones tienen que costar." },
  fuerzaB: { nombre: "Fuerza B (tren superior)", tipo: "fuerza", minutos: 50, ejercicios: ["flexion-pies", "remo-1", "press-suelo", "press-hombro", "dominadas", "plancha-hombros", "brazos"] },
  velocidad: { nombre: "Velocidad + saltos", tipo: "velocidad", minutos: 50, ejercicios: ["skipping", "pogo", "salto-largo", "salto-escalon", "lateral-1", "acel-10", "vmax"], regla: "Si te sientes lento en la velocidad máxima, termina (STOP)." },
  resistencia: { nombre: "Resistencia 4×4 con balón", tipo: "resistencia", minutos: 45, ejercicios: ["4x4"] },
  agilidad: { nombre: "Agilidad + técnica", tipo: "agilidad", minutos: 60, ejercicios: ["5-10-5", "giros-180", "slalom", "reaccion", "ball-mastery", "pared-15"] },
  activacion: { nombre: "Activación", tipo: "activacion", minutos: 35, ejercicios: ["act-movilidad", "act-sprints", "act-pared", "act-tiros"] },
  tecnica: { nombre: "Técnica", tipo: "tecnica", minutos: 45, ejercicios: ["ball-mastery", "pared-15", "conduccion-giros", "pase-largo", "dominadas-mala"] },
  recuperacion: { nombre: "Recuperación", tipo: "recuperacion", minutos: 30, ejercicios: ["rec-movilidad", "rec-core", "rec-estirar"] },
  preparador: { nombre: "Preparador físico", tipo: "preparador", minutos: 75, ejercicios: ["prep-fullbody", "prep-10x10"] },
};

// La dosis según la fase del bloque.
export function dosis(e: EjB, fase: string): { series: number; nota?: string } {
  if (/Descarga|Afinar/.test(fase)) return { series: Math.max(1, Math.ceil(e.series / 2)), nota: "Volumen a la mitad" };
  if (fase === "Intensificación") {
    if (e.id === "4x4") return { series: 4, nota: "4 bloques" };
    if (e.kg) return { series: e.series, nota: "Usa la mancuerna de ~20 kg" };
    if (["pogo", "salto-largo", "salto-escalon", "lateral-1"].includes(e.id)) return { series: e.series + 1, nota: "80–100 saltos en total" };
    if (e.id === "vmax") return { series: e.series, nota: "Al 95%" };
  }
  if (fase === "Base") {
    if (e.kg) return { series: e.series, nota: "A 2–3 reps del fallo" };
    if (e.id === "vmax") return { series: e.series, nota: "Al 85–90%" };
  }
  return { series: e.series };
}

// ---------- Temporizadores ----------
export interface FaseTimer {
  nombre: string;
  seg: number;
  trabajo?: boolean;
}
export const TIMER_4X4 = (bloques: number): FaseTimer[] => Array.from({ length: bloques }, (_, i) => [{ nombre: `Bloque ${i + 1}: conducción fuerte`, seg: 240, trabajo: true }, ...(i < bloques - 1 ? [{ nombre: "Trote suave", seg: 180 }] : [])]).flat();
export const MOVIMIENTOS_BALL = ["Toques internos", "Suela adelante y atrás", "Suela lateral", "V-pull", "L-turn", "Croqueta", "Interno-externo", "Cruce por detrás"];
export const TIMER_BALL = (vueltas = 4): FaseTimer[] => Array.from({ length: vueltas }, () => MOVIMIENTOS_BALL.map((m) => ({ nombre: m, seg: 30, trabajo: true }))).flat();
export const TIMER_FIFA: FaseTimer[] = [
  { nombre: "Trote con variaciones", seg: 240, trabajo: true },
  { nombre: "Plancha (1/3)", seg: 25, trabajo: true }, { nombre: "Pausa", seg: 15 }, { nombre: "Plancha (2/3)", seg: 25, trabajo: true }, { nombre: "Pausa", seg: 15 }, { nombre: "Plancha (3/3)", seg: 25, trabajo: true },
  { nombre: "Plancha lateral derecha", seg: 20, trabajo: true }, { nombre: "Plancha lateral izquierda", seg: 20, trabajo: true }, { nombre: "Plancha lateral derecha", seg: 20, trabajo: true }, { nombre: "Plancha lateral izquierda", seg: 20, trabajo: true },
  { nombre: "Equilibrio pierna derecha", seg: 30, trabajo: true }, { nombre: "Equilibrio pierna izquierda", seg: 30, trabajo: true },
  { nombre: "Sentadillas 2×10", seg: 60, trabajo: true }, { nombre: "Saltos 2×10", seg: 60, trabajo: true },
  { nombre: "Aceleración al 60%", seg: 20, trabajo: true }, { nombre: "Aceleración al 75%", seg: 20, trabajo: true }, { nombre: "Aceleración al 90%", seg: 20, trabajo: true },
];
