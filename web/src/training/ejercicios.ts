// Biblioteca de ejercicios: un archivo de datos propio (el modelo no inventa ejercicios).
//
// Sobre la participación de cada músculo: los estudios de electromiografía (EMG) miden
// cuánto se activa un músculo comparado con su máximo, no "qué porcentaje del trabajo"
// hace cada uno. Por eso NO damos porcentajes (serían inventados): damos un nivel
// orientativo (alta, media, baja) y la fuente cuando hay un estudio claro. Varía según la
// técnica, el rango de movimiento y la persona.

export type Musculo = "cuadriceps" | "isquiotibiales" | "gluteos" | "aductores" | "gemelos" | "pectoral" | "dorsal" | "espalda-alta" | "hombros" | "biceps" | "triceps" | "core" | "lumbares";

export const MUSCULOS: Record<Musculo, string> = {
  cuadriceps: "Cuádriceps",
  isquiotibiales: "Isquiotibiales",
  gluteos: "Glúteos",
  aductores: "Aductores",
  gemelos: "Gemelos",
  pectoral: "Pectoral",
  dorsal: "Dorsal",
  "espalda-alta": "Espalda alta",
  hombros: "Hombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  core: "Abdomen (core)",
  lumbares: "Zona lumbar",
};

export type Equipo = "cuerpo" | "mancuernas" | "banda" | "barra-dominadas" | "mochila" | "cajon" | "gimnasio";
export const EQUIPOS: Record<Equipo, string> = {
  cuerpo: "Peso corporal",
  mancuernas: "Mancuernas",
  banda: "Banda elástica",
  "barra-dominadas": "Barra de dominadas",
  mochila: "Mochila con peso",
  cajon: "Cajón o escalón",
  gimnasio: "Gimnasio (barra, máquinas)",
};

export type Tipo = "fuerza" | "potencia" | "prevencion" | "core" | "acondicionamiento";
export type Nivel = 1 | 2 | 3; // 1 principiante, 2 intermedio, 3 avanzado

export interface Ejercicio {
  id: string;
  nombre: string;
  tipo: Tipo;
  zona: "inferior" | "superior" | "core" | "todo";
  principal: Musculo;
  secundarios: { m: Musculo; nivel: "alta" | "media" | "baja" }[];
  equipo: Equipo[]; // basta con tener uno
  nivel: Nivel;
  errores: string[];
  facil?: string; // id de una variante más fácil
  dificil?: string; // id de una variante más difícil
  alternativa?: string; // texto: con otro equipo
  fuente?: string; // estudio que respalda la activación o el beneficio
  porTiempo?: boolean; // se mide en segundos, no en repeticiones
  pesado?: boolean; // carga alta de pierna (no conviene el día antes de un partido)
}

export const EJERCICIOS: Ejercicio[] = [
  // ---------- Tren inferior ----------
  {
    id: "sentadilla-goblet", nombre: "Sentadilla goblet", tipo: "fuerza", zona: "inferior", principal: "cuadriceps",
    secundarios: [{ m: "gluteos", nivel: "alta" }, { m: "aductores", nivel: "media" }, { m: "core", nivel: "baja" }],
    equipo: ["mancuernas"], nivel: 1, pesado: true,
    errores: ["Talones que se despegan del suelo", "Rodillas que se van hacia adentro", "Espalda que se redondea abajo"],
    facil: "sentadilla-cajon", dificil: "bulgara", alternativa: "Con la mochila abrazada al pecho.",
  },
  {
    id: "sentadilla-cajon", nombre: "Sentadilla a un cajón", tipo: "fuerza", zona: "inferior", principal: "cuadriceps",
    secundarios: [{ m: "gluteos", nivel: "media" }], equipo: ["cuerpo", "cajon"], nivel: 1, pesado: false,
    errores: ["Dejarse caer sobre el cajón", "Rodillas hacia adentro"], dificil: "sentadilla-goblet",
  },
  {
    id: "sentadilla-barra", nombre: "Sentadilla con barra", tipo: "fuerza", zona: "inferior", principal: "cuadriceps",
    secundarios: [{ m: "gluteos", nivel: "alta" }, { m: "aductores", nivel: "media" }, { m: "lumbares", nivel: "media" }, { m: "core", nivel: "media" }],
    equipo: ["gimnasio"], nivel: 2, pesado: true,
    errores: ["Bajar sin control", "Rodillas hacia adentro al subir", "Inclinar demasiado el tronco"], facil: "sentadilla-goblet",
  },
  {
    id: "bulgara", nombre: "Sentadilla búlgara", tipo: "fuerza", zona: "inferior", principal: "cuadriceps",
    secundarios: [{ m: "gluteos", nivel: "alta" }, { m: "aductores", nivel: "media" }, { m: "core", nivel: "baja" }],
    equipo: ["cuerpo", "mancuernas", "mochila"], nivel: 2, pesado: true,
    errores: ["Pie de adelante muy cerca del banco", "Rodilla que se va hacia adentro", "Rebotar abajo"],
    facil: "zancada", alternativa: "Sin peso o con la mochila.",
  },
  {
    id: "zancada", nombre: "Zancada hacia atrás", tipo: "fuerza", zona: "inferior", principal: "cuadriceps",
    secundarios: [{ m: "gluteos", nivel: "media" }, { m: "aductores", nivel: "baja" }], equipo: ["cuerpo", "mancuernas", "mochila"], nivel: 1,
    errores: ["Paso muy corto", "Tronco que se va adelante"], dificil: "bulgara",
  },
  {
    id: "peso-muerto-rumano", nombre: "Peso muerto rumano", tipo: "fuerza", zona: "inferior", principal: "isquiotibiales",
    secundarios: [{ m: "gluteos", nivel: "alta" }, { m: "lumbares", nivel: "media" }, { m: "espalda-alta", nivel: "baja" }],
    equipo: ["mancuernas", "gimnasio", "mochila"], nivel: 1, pesado: true,
    errores: ["Redondear la espalda", "Doblar mucho las rodillas (se vuelve sentadilla)", "Peso lejos de las piernas"],
    dificil: "peso-muerto-1pierna",
  },
  {
    id: "peso-muerto-1pierna", nombre: "Peso muerto a una pierna", tipo: "fuerza", zona: "inferior", principal: "isquiotibiales",
    secundarios: [{ m: "gluteos", nivel: "alta" }, { m: "core", nivel: "media" }], equipo: ["cuerpo", "mancuernas"], nivel: 2,
    errores: ["Abrir la cadera hacia un lado", "Redondear la espalda"], facil: "peso-muerto-rumano",
  },
  {
    id: "hip-thrust", nombre: "Hip thrust (puente de cadera con apoyo)", tipo: "fuerza", zona: "inferior", principal: "gluteos",
    secundarios: [{ m: "isquiotibiales", nivel: "media" }, { m: "cuadriceps", nivel: "baja" }], equipo: ["cuerpo", "mancuernas", "mochila", "gimnasio"], nivel: 1,
    errores: ["Arquear la zona lumbar arriba en vez de apretar el glúteo", "Pies muy lejos"],
    fuente: "Contreras y cols. 2015 (J Appl Biomech): más activación del glúteo mayor que en la sentadilla.",
  },
  {
    id: "gemelos", nombre: "Elevación de talones a una pierna", tipo: "fuerza", zona: "inferior", principal: "gemelos",
    secundarios: [], equipo: ["cuerpo", "mancuernas"], nivel: 1,
    errores: ["Rebotar", "No bajar el talón bajo el escalón"], alternativa: "En un escalón, con la mochila.",
  },
  // ---------- Potencia y velocidad (fútbol) ----------
  {
    id: "salto-cajon", nombre: "Salto al cajón", tipo: "potencia", zona: "inferior", principal: "cuadriceps",
    secundarios: [{ m: "gluteos", nivel: "alta" }, { m: "gemelos", nivel: "media" }], equipo: ["cajon"], nivel: 1,
    errores: ["Caer con las rodillas hacia adentro", "Cajón demasiado alto", "Bajar saltando (baja caminando)"], dificil: "salto-largo",
  },
  {
    id: "salto-largo", nombre: "Salto largo a pies juntos", tipo: "potencia", zona: "inferior", principal: "gluteos",
    secundarios: [{ m: "cuadriceps", nivel: "alta" }, { m: "gemelos", nivel: "media" }], equipo: ["cuerpo"], nivel: 2,
    errores: ["Caer rígido", "Seguir cuando ya estás cansado: la calidad manda"],
  },
  {
    id: "skater", nombre: "Saltos laterales (skater)", tipo: "potencia", zona: "inferior", principal: "gluteos",
    secundarios: [{ m: "aductores", nivel: "media" }, { m: "cuadriceps", nivel: "media" }], equipo: ["cuerpo"], nivel: 1,
    errores: ["No frenar al caer", "Rodilla hacia adentro al aterrizar"],
  },
  {
    id: "sprint-10", nombre: "Aceleraciones de 10 a 20 m", tipo: "potencia", zona: "todo", principal: "isquiotibiales",
    secundarios: [{ m: "gluteos", nivel: "alta" }, { m: "gemelos", nivel: "media" }], equipo: ["cuerpo"], nivel: 1,
    errores: ["Hacerlas cansado", "Descansar poco: la velocidad se entrena fresco"],
  },
  {
    id: "5-10-5", nombre: "Cambio de dirección 5-10-5", tipo: "potencia", zona: "todo", principal: "cuadriceps",
    secundarios: [{ m: "aductores", nivel: "media" }, { m: "gluteos", nivel: "media" }], equipo: ["cuerpo"], nivel: 1,
    errores: ["Frenar con la pierna estirada", "Girar sin bajar la cadera"],
  },
  // ---------- Prevención de lesiones ----------
  {
    id: "nordico", nombre: "Nórdico de isquiotibiales", tipo: "prevencion", zona: "inferior", principal: "isquiotibiales",
    secundarios: [{ m: "gluteos", nivel: "baja" }], equipo: ["cuerpo"], nivel: 2,
    errores: ["Doblar la cadera en vez de bajar recto", "Bajar rápido: lo que sirve es frenar lento"],
    fuente: "van Dyk y cols. 2019 (Br J Sports Med): los programas con nórdico reducen cerca de la mitad las lesiones de isquiotibiales.",
    alternativa: "Con alguien que te sujete los tobillos o con los pies bajo un sillón.",
  },
  {
    id: "copenhague", nombre: "Plancha Copenhague (aductores)", tipo: "prevencion", zona: "inferior", principal: "aductores",
    secundarios: [{ m: "core", nivel: "media" }], equipo: ["cuerpo"], nivel: 2, porTiempo: true,
    errores: ["Cadera que se cae", "Empezar con la versión larga: parte apoyando la rodilla"],
    fuente: "Harøy y cols. 2019 (Br J Sports Med): el programa Copenhague redujo los problemas de ingle en futbolistas.",
  },
  {
    id: "tobillo-1pie", nombre: "Equilibrio en un pie (tobillo)", tipo: "prevencion", zona: "inferior", principal: "gemelos",
    secundarios: [{ m: "core", nivel: "baja" }], equipo: ["cuerpo"], nivel: 1, porTiempo: true,
    errores: ["Mirar el pie", "Hacerlo siempre en suelo firme: después súbelo a un cojín"],
    fuente: "Forma parte del calentamiento FIFA 11+, que redujo las lesiones en jugadoras jóvenes (Soligard y cols. 2008, BMJ).",
  },
  // ---------- Tren superior ----------
  {
    id: "flexiones", nombre: "Flexiones", tipo: "fuerza", zona: "superior", principal: "pectoral",
    secundarios: [{ m: "triceps", nivel: "alta" }, { m: "hombros", nivel: "media" }, { m: "core", nivel: "media" }], equipo: ["cuerpo"], nivel: 1,
    errores: ["Cadera que se hunde", "Codos muy abiertos", "No bajar hasta cerca del suelo"],
    facil: "flexiones-inclinadas", dificil: "flexiones-mochila",
    fuente: "Calatayud y cols. 2015 (J Strength Cond Res): con una activación muscular parecida, las flexiones dieron ganancias de fuerza similares al press de banca.",
  },
  {
    id: "flexiones-inclinadas", nombre: "Flexiones con manos en alto", tipo: "fuerza", zona: "superior", principal: "pectoral",
    secundarios: [{ m: "triceps", nivel: "media" }, { m: "hombros", nivel: "media" }], equipo: ["cuerpo"], nivel: 1,
    errores: ["Cadera hundida"], dificil: "flexiones",
  },
  {
    id: "flexiones-mochila", nombre: "Flexiones con mochila", tipo: "fuerza", zona: "superior", principal: "pectoral",
    secundarios: [{ m: "triceps", nivel: "alta" }, { m: "hombros", nivel: "media" }, { m: "core", nivel: "media" }], equipo: ["mochila"], nivel: 2,
    errores: ["Mochila suelta que se corre", "Perder la línea recta del cuerpo"], facil: "flexiones",
  },
  {
    id: "press-banca", nombre: "Press de banca", tipo: "fuerza", zona: "superior", principal: "pectoral",
    secundarios: [{ m: "triceps", nivel: "alta" }, { m: "hombros", nivel: "media" }], equipo: ["gimnasio"], nivel: 2,
    errores: ["Rebotar la barra en el pecho", "Despegar los glúteos del banco"], facil: "flexiones",
  },
  {
    id: "press-mancuernas", nombre: "Press de pecho con mancuernas", tipo: "fuerza", zona: "superior", principal: "pectoral",
    secundarios: [{ m: "triceps", nivel: "media" }, { m: "hombros", nivel: "media" }], equipo: ["mancuernas"], nivel: 1,
    errores: ["Bajar sin control", "Codos a 90° del cuerpo (mejor unos 45°)"], alternativa: "En el suelo si no tienes banco.",
  },
  {
    id: "dominadas", nombre: "Dominadas", tipo: "fuerza", zona: "superior", principal: "dorsal",
    secundarios: [{ m: "biceps", nivel: "alta" }, { m: "espalda-alta", nivel: "media" }, { m: "core", nivel: "baja" }], equipo: ["barra-dominadas", "gimnasio"], nivel: 2,
    errores: ["Balancearse", "No estirar los brazos abajo", "Subir solo hasta la mitad"],
    facil: "dominadas-banda", alternativa: "Con agarre supino (palmas hacia ti) trabaja más el bíceps.",
    fuente: "Youdas y cols. 2010 (J Strength Cond Res): el dorsal es el músculo más activo; con palmas hacia ti sube el bíceps.",
  },
  {
    id: "dominadas-banda", nombre: "Dominadas con banda", tipo: "fuerza", zona: "superior", principal: "dorsal",
    secundarios: [{ m: "biceps", nivel: "alta" }, { m: "espalda-alta", nivel: "media" }], equipo: ["barra-dominadas", "banda"], nivel: 1,
    errores: ["Rebotar con la banda abajo"], dificil: "dominadas",
  },
  {
    id: "remo-invertido", nombre: "Remo invertido", tipo: "fuerza", zona: "superior", principal: "espalda-alta",
    secundarios: [{ m: "dorsal", nivel: "media" }, { m: "biceps", nivel: "media" }, { m: "core", nivel: "baja" }], equipo: ["barra-dominadas", "cuerpo"], nivel: 1,
    errores: ["Cadera caída", "Tirar con el cuello"], dificil: "dominadas", alternativa: "Bajo una mesa firme.",
  },
  {
    id: "remo-mancuerna", nombre: "Remo con mancuerna a una mano", tipo: "fuerza", zona: "superior", principal: "dorsal",
    secundarios: [{ m: "espalda-alta", nivel: "media" }, { m: "biceps", nivel: "media" }], equipo: ["mancuernas", "mochila"], nivel: 1,
    errores: ["Girar el tronco para subir el peso", "Tirar con el brazo y no con la espalda"],
  },
  {
    id: "press-militar", nombre: "Press militar con mancuernas", tipo: "fuerza", zona: "superior", principal: "hombros",
    secundarios: [{ m: "triceps", nivel: "media" }, { m: "core", nivel: "media" }], equipo: ["mancuernas", "gimnasio"], nivel: 1,
    errores: ["Arquear la zona lumbar", "No estirar los brazos arriba"],
  },
  {
    id: "face-pull", nombre: "Face pull con banda", tipo: "fuerza", zona: "superior", principal: "espalda-alta",
    secundarios: [{ m: "hombros", nivel: "media" }], equipo: ["banda", "gimnasio"], nivel: 1,
    errores: ["Tirar hacia el pecho en vez de hacia la cara", "Usar impulso"],
  },
  {
    id: "fondos", nombre: "Fondos en paralelas", tipo: "fuerza", zona: "superior", principal: "triceps",
    secundarios: [{ m: "pectoral", nivel: "alta" }, { m: "hombros", nivel: "media" }], equipo: ["barra-dominadas", "gimnasio"], nivel: 2,
    errores: ["Bajar demasiado si te molesta el hombro", "Encoger los hombros"],
  },
  {
    id: "curl", nombre: "Curl de bíceps", tipo: "fuerza", zona: "superior", principal: "biceps",
    secundarios: [], equipo: ["mancuernas", "banda", "gimnasio"], nivel: 1, errores: ["Balancear el cuerpo", "Mover los codos hacia adelante"],
  },
  // ---------- Core ----------
  {
    id: "plancha", nombre: "Plancha", tipo: "core", zona: "core", principal: "core", secundarios: [{ m: "hombros", nivel: "baja" }],
    equipo: ["cuerpo"], nivel: 1, porTiempo: true, errores: ["Cadera muy alta o hundida", "Aguantar la respiración"], dificil: "rueda",
  },
  {
    id: "plancha-lateral", nombre: "Plancha lateral", tipo: "core", zona: "core", principal: "core", secundarios: [{ m: "gluteos", nivel: "baja" }],
    equipo: ["cuerpo"], nivel: 1, porTiempo: true, errores: ["Cadera que se cae"], dificil: "copenhague",
  },
  {
    id: "pallof", nombre: "Pallof press con banda", tipo: "core", zona: "core", principal: "core", secundarios: [],
    equipo: ["banda"], nivel: 1, errores: ["Dejar que la banda te gire", "Alejarte poco del anclaje"],
  },
  {
    id: "rueda", nombre: "Rueda abdominal", tipo: "core", zona: "core", principal: "core", secundarios: [{ m: "dorsal", nivel: "media" }],
    equipo: ["gimnasio", "cuerpo"], nivel: 3, errores: ["Hundir la zona lumbar", "Ir más lejos de lo que controlas"], facil: "plancha",
  },
  // ---------- Acondicionamiento ----------
  {
    id: "4x4", nombre: "Intervalos 4×4 minutos", tipo: "acondicionamiento", zona: "todo", principal: "cuadriceps", secundarios: [],
    equipo: ["cuerpo"], nivel: 2, porTiempo: true,
    errores: ["Partir demasiado rápido en el primero", "Pararte en las pausas: trota suave 3 minutos"],
    fuente: "Helgerud y cols. 2001 (Med Sci Sports Exerc): 4×4 al 90–95% del pulso máximo subió el VO₂máx y lo que corrían en el partido.",
  },
  {
    id: "rsa", nombre: "Sprints repetidos 6 × 30 m", tipo: "acondicionamiento", zona: "todo", principal: "isquiotibiales", secundarios: [{ m: "gluteos", nivel: "alta" }],
    equipo: ["cuerpo"], nivel: 2, errores: ["Bajar la intensidad: cada sprint a tope", "Hacerlo con dolor en el isquiotibial"],
  },
];

export const ejercicio = (id: string) => EJERCICIOS.find((e) => e.id === id);

export const NOTA_EMG =
  "Participación orientativa. Los estudios de electromiografía miden cuánto se activa cada músculo comparado con su máximo; no dicen qué porcentaje del trabajo hace cada uno, así que aquí no hay porcentajes inventados. Cambia según la técnica, el rango de movimiento y la persona.";

// Calentamiento y vuelta a la calma (basados en la idea del FIFA 11+: movilidad, activación y carrera).
export const CALENTAMIENTO = [
  "Trote suave 3 min con cambios de ritmo",
  "Movilidad: 10 balanceos de pierna adelante-atrás y de lado, 10 círculos de cadera",
  "Activación: 10 sentadillas sin peso, 10 puentes de glúteo, 10 zancadas caminando",
  "2 aceleraciones suaves de 20 m",
];
export const VUELTA_CALMA = ["Trote o caminata suave 3 min", "Estirar cuádriceps, isquiotibiales, aductores, gemelos y cadera: 30 s por lado cada uno"];
