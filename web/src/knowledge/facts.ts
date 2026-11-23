// Datos generales que JARVIS sabe sin internet. Son públicos (nada personal: tu perfil
// va en Ajustes → "Sobre mí", que se guarda solo en tu teléfono).
// Revisados en noviembre de 2026. Lo que cambia (fechas, montos) siempre lleva "confirma".

export interface Fact {
  id: string;
  title: string;
  keys: RegExp; // palabras que activan el tema (texto sin tildes, en minúscula)
  say: string; // respuesta corta para decir en voz alta
  detail: string; // más contexto para Gemini
  source?: string;
}

export const FACTS: Fact[] = [
  {
    id: "servicio",
    title: "Servicio Militar en Chile (ciclo 2027)",
    keys: /servicio militar|militar|canton|conscripto|acuartel|reclutamiento|dgmn|ejercito|soldado/,
    say: "Para el Servicio Militar 2027, la inscripción voluntaria es hasta febrero de 2027, en serviciomilitar.cl con ClaveÚnica o en el cantón de reclutamiento. La lista de llamados sale en febrero y el acuartelamiento suele ser a principios de abril. Confírmalo en serviciomilitar.cl.",
    detail:
      "Ciclo 2027: voluntarios de 18 a 24 años según ChileAtiende (otras fichas dicen 19 a 24). Inscripción voluntaria hasta febrero de 2027 en serviciomilitar.cl (ClaveÚnica) o en el cantón más cercano. Sorteo publicado en octubre de 2026; lista de llamados en febrero de 2027. En 2026 el acuartelamiento fue el 1 de abril; la fecha 2027 no estaba publicada en noviembre de 2026. Siempre confirmar en serviciomilitar.cl o ChileAtiende.",
    source: "https://www.chileatiende.gob.cl/fichas/1036-inscripcion-como-voluntario-en-el-servicio-militar",
  },
  {
    id: "working-holiday",
    title: "Working Holiday en Australia (visa 462) para chilenos",
    keys: /working holiday|work and holiday|visa|australia|462|nueva zelanda/,
    say: "La visa Work and Holiday 462 para chilenos es de 18 a 30 años y dura 12 meses. Piden inglés funcional y ahorros cercanos a 5.000 dólares australianos más el pasaje; los cupos por año son limitados. Los montos y el costo confírmalos en el sitio de Home Affairs.",
    detail:
      "Visa subclase 462 (Chile): 18 a 30 años; 12 meses; se puede estudiar hasta 4 meses; para una segunda visa se exigen 3 meses de trabajo específico. Requisitos que conviene confirmar: inglés funcional (suele equivaler a IELTS 4,5), fondos aprox. AUD 5.000 más el pasaje de vuelta, examen médico, no haber tenido antes una visa 417/462. Costo informado entre AUD 650 y 840 según la fuente. Cupo anual limitado. Fuente oficial: immi.homeaffairs.gov.au.",
    source: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-462",
  },
  {
    id: "puerto-varas",
    title: "Puerto Varas",
    keys: /puerto varas|llanquihue|osorno|calbuco|lago|los lagos/,
    say: "Puerto Varas está en la Región de Los Lagos, a orillas del lago Llanquihue, con los volcanes Osorno y Calbuco al frente. Llueve harto todo el año y el agua del lago es fría, entre 10 y 18 grados, así que se nada donde se hace pie y con tiempo límite.",
    detail:
      "Puerto Varas: Región de Los Lagos, junto al lago Llanquihue; volcanes Osorno y Calbuco. Clima templado lluvioso. Agua del lago aprox. 9-18 °C según la estación: shock de frío el primer minuto, nadar paralelo a la orilla, nunca apnea en el lago. Para el clima del día haría falta internet (versión 4 con Open-Meteo).",
  },
  {
    id: "entrenamiento",
    title: "Entrenamiento y fútbol",
    keys: /musculo|masa|proteina|series|gimnasio|gym|entren|futbol|mediocamp|desgarro|lesion|isquio|nordico|creatina|recuper/,
    say: "Para ganar músculo: unas 10 a 20 series por músculo a la semana, cerca del fallo, unos 2 gramos de proteína por kilo y dormir 7 a 9 horas. Para el fútbol, el nórdico y el Copenhague bajan las lesiones de isquiotibial e ingle. No soy médico: si un dolor no se va, ve a un kinesiólogo.",
    detail:
      "Hipertrofia: 10-20 series por músculo/semana (Schoenfeld), cerca del fallo (1-3 repeticiones en reserva); cargas livianas sirven si se llega cerca del fallo. Proteína 1,6-2 g/kg/día (Morton 2018). Para subir de peso: comer 10-20% más de lo que se gasta, subir 0,25-0,5% del peso por semana. Fútbol: 4x4 min al 90% mejora el VO2máx (Helgerud 2001); el nórdico reduce a la mitad los desgarros de isquiotibial (van Dyk 2019); el Copenhague reduce lesiones de ingle. Creatina monohidrato 3-5 g diarios es segura. JARVIS no es médico.",
  },
  {
    id: "ingles",
    title: "Inglés",
    keys: /ingles|english|efset|ielts|vocabulario/,
    say: "Para el inglés rinde más poco y diario: 25 minutos con vocabulario en Anki, escuchar 6 Minute English de la BBC y hablar o escribir un rato. Cada 3 meses puedes medirte gratis con la prueba EF SET.",
    detail: "Recursos gratis: BBC Learning English (6 Minute English), Anki, Write & Improve de Cambridge, prueba EF SET (efset.org, 50 min). Para Australia suele pedirse inglés funcional (IELTS 4,5 aprox.).",
  },
  {
    id: "emergencias",
    title: "Números de emergencia en Chile",
    keys: /emergencia|ambulancia|samu|bomberos|carabineros|accidente|urgencia/,
    say: "En Chile: ambulancia SAMU 131, bomberos 132, carabineros 133. Si es grave, llama primero y después me cuentas.",
    detail: "Chile: SAMU 131, Bomberos 132, Carabineros 133, PDI 134, Rescate marítimo 137.",
  },
  {
    id: "jarvis",
    title: "Qué puede hacer JARVIS",
    keys: /que puedes|que sabes hacer|ayuda|como funcionas|como te uso/,
    say: "Hoy puedo manejar tu rutina: agregar, tachar, cambiar y decirte qué te toca y cómo vas. Converso contigo con Gemini y, con internet, busco información actual. Los avisos, Siri, el clima y la agenda vienen en las próximas versiones.",
    detail: "Versión 1: rutina, conversación, búsqueda en internet con Gemini. Pendiente: avisos (v2), Siri (v3), resumen de la mañana, memoria, visión (v4), agenda (v5), preparador físico (v6).",
  },
];

const normq = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function findFact(q: string): Fact | null {
  const t = normq(q);
  return FACTS.find((f) => f.keys.test(t)) || null;
}

export const factsForPrompt = () => FACTS.filter((f) => f.id !== "jarvis").map((f) => `- ${f.title}: ${f.detail}`).join("\n");
