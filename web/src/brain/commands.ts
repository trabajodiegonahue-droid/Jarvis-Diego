import { parseHour, type ChileNow } from "../core/time";
import { norm, parseDays } from "../routine/routine";

// Intérprete local de las órdenes más comunes. Si entiende la frase, la acción se
// hace al tiro y sin gastar cuota de Gemini. Si no, devuelve null y decide el modelo.

export interface LocalCommand {
  tool: string;
  args: Record<string, unknown>;
}

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/^\s*(oye\s+)?jarvis[,\s]*/i, "")
    .replace(/[¿?¡!.]+$/g, "")
    .replace(/[¿¡]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const stripTitle = (s: string) =>
  s
    .replace(/\b(a|en|de)\s+(mi|la)\s+rutina\b/g, "")
    .replace(/^(el|la|los|las|lo de|con el|con la|con)\s+/, "")
    .replace(/\s+(ya|po|nomas|nomás)$/, "")
    .trim();

export function parseCommand(text: string, n: ChileNow): LocalCommand | null {
  const raw = clean(text);
  const t = norm(raw);
  if (!t) return null;

  // ¿Qué me toca?
  if (/\bque me toca\b|\bque (hago|sigue) ahora\b|\bque hay ahora\b|\bque toca\b/.test(t)) return { tool: "que_me_toca_ahora", args: {} };

  // Agregar: "agrega estudiar inglés a las 18:00 de lunes a viernes"
  let m = raw.match(/^(agrega|agregar|añade|añadir|anade|pon|ponme|anota|anotame|anótame|agéndame|agendame)\s+(.+?)\s+(?:a las|a la|para las|tipo)\s+(.+)$/);
  if (m) {
    const time = parseHour(m[3]);
    const title = stripTitle(m[2]);
    if (time && title) {
      const days = parseDays(m[3], n);
      return { tool: "agregar_tarea", args: { titulo: title, hora: time, ...(days ? { dias: days } : {}) } };
    }
  }

  // Cambiar: "cambia el gym a las 19:00"
  m = raw.match(/^(cambia|cambiar|mueve|mover|corre|pasa)\s+(.+?)\s+(?:a las|para las|a la)\s+(.+)$/);
  if (m) {
    const time = parseHour(m[3]);
    if (time) return { tool: "cambiar_tarea", args: { titulo: stripTitle(m[2]), nueva_hora: time } };
  }

  // Casos que piden razonar o preguntar (los maneja el asistente con un diálogo).
  if (/\ba medias\b|\bla mitad\b|\buna parte\b|\balgunas?\b|\balgunos\b|\bcasi todo\b|\bno (hice|termine|alcance a hacer) todo\b|\bno la termine\b|\bincomplet/.test(t)) return { tool: "__elegir", args: {} };
  if (/\bno (hice|alcance|pude hacer|pude) nada\b|\bme salte todo\b|\bno hice ninguna\b/.test(t)) return { tool: "__nada", args: {} };
  if (/^(ya )?(hice|termine|cumpli|complete|tache|tacha|marca) (todo|todas|toda la rutina|la rutina completa|todo lo de hoy)\b|^(ya )?(hice|cumpli) (con )?todo\b|\bdia completo\b/.test(t)) return { tool: "tachar_todo_hoy", args: {} };
  if (/\bcomo voy\b|\bque me falta\b|\bque me queda\b|\bque (he hecho|hice) hoy\b|\bresumen\b|\bcomo (va|ando)\b/.test(t)) {
    if (/\bsemana\b/.test(t)) return { tool: "ver_semana", args: {} };
    return { tool: "resumen_dia", args: /\bayer\b/.test(t) ? { dias_atras: 1 } : {} };
  }
  if (/\bque (hice|me falto|deje pendiente) ayer\b|\bcomo me fue ayer\b/.test(t)) return { tool: "resumen_dia", args: { dias_atras: 1 } };

  // Tachar: "ya hice el gym", "tacha el gym", "listo el gym", "terminé de estudiar"
  m = raw.match(/^(?:ya\s+)?(?:hice|termine|terminé|acabé|acabe|tacha|tachar|tachame|táchame|marca|completé|complete|listo)\s+(?:de\s+)?(.+)$/);
  if (m && !/^(todo|toda|todas)\b/.test(m[1])) {
    const title = stripTitle(m[1]);
    if (/^(la )?rutina( de hoy)?$/.test(norm(title))) return { tool: "__elegir", args: {} };
    const many = title.split(/\s*(?:,|\by\b|\be\b|\btambien\b|\btambién\b)\s*/).map(stripTitle).filter(Boolean);
    if (many.length > 1) return { tool: "tachar_tareas", args: { titulos: many } };
    if (title) return { tool: "tachar_tarea", args: { titulo: title } };
  }

  // Desmarcar
  m = raw.match(/^(?:desmarca|destacha|no hice)\s+(.+)$/);
  if (m) return { tool: "destachar_tarea", args: { titulo: stripTitle(m[1]) } };

  // Quitar: "quita el gym", "borra toda la rutina"
  m = raw.match(/^(?:quita|quitar|quítame|quitame|borra|borrar|bórrame|borrame|elimina|eliminar|saca|sácame|sacame)\s+(.+)$/);
  if (m) {
    if (/^(todo|toda la rutina|todas( las tareas)?|la rutina( entera| completa)?)$/.test(norm(m[1]))) return { tool: "borrar_toda_la_rutina", args: {} };
    const title = stripTitle(m[1]);
    if (title) return { tool: "quitar_tarea", args: { titulo: title } };
  }

  // ¿Qué tengo hoy / el martes? · mi rutina
  if (/^(y )?que tengo\b|^(ver|lee|leeme|dime|muestrame)( la| mi)? rutina\b|^(la |mi )?rutina( de hoy)?$/.test(t)) {
    const d = parseDays(raw, n);
    return { tool: "ver_rutina", args: d && d.length === 1 ? { dia: d[0] } : {} };
  }

  return null;
}

export const isYes = (s: string) => /^(si|sí|dale|ya|ok|okay|confirmo|hazlo|bueno|de una|obvio)\b/.test(norm(s).replace(/^si$/, "si"));
export const isNo = (s: string) => /^(no|nop|cancela|cancelar|mejor no|para|olvidalo)\b/.test(norm(s));
