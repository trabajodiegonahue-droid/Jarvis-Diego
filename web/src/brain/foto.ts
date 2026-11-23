// Fotos para JARVIS: una boleta (gasto) o la pantalla del reloj/app de trote (entreno).
// Gemini lee la foto y devuelve los datos; JARVIS los anota como si se los hubieras dicho.
import { askGemini, type Connection } from "./gemini";

// Achica la foto (máx. 1024 px, JPEG) para que viaje rápido y no gaste cuota de más.
export async function fotoABase64(file: File, max = 1024): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72).split(",")[1];
}

export interface LecturaFoto {
  tipo: "gasto" | "entreno" | "otro";
  frase: string; // lo que JARVIS anota, como si Diego lo hubiera dicho
  resumen: string;
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    tipo: { type: "STRING", enum: ["gasto", "entreno", "otro"] },
    monto: { type: "INTEGER" },
    comercio: { type: "STRING" },
    actividad: { type: "STRING", enum: ["trote", "correr", "bici", "caminata", "natación", "gimnasio", ""] },
    km: { type: "NUMBER" },
    minutos: { type: "INTEGER" },
    segundos: { type: "INTEGER" },
    calorias: { type: "INTEGER" },
    resumen: { type: "STRING" },
  },
  required: ["tipo", "resumen"],
};

export async function leerFoto(c: Connection, base64: string, nota = ""): Promise<LecturaFoto> {
  const txt = await askGemini(c, {
    system:
      "Lees fotos que Diego (Chile) le manda a su asistente. Si es una boleta o comprobante: tipo gasto, monto total en pesos chilenos (entero, sin puntos) y comercio corto. Si es la pantalla de un reloj o app deportiva: tipo entreno, actividad, km (con decimales), minutos y segundos de duración, calorías. Si no es nada de eso: tipo otro. resumen = una frase corta en español de lo que ves. No inventes números que no se ven.",
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: base64 } }, { text: nota || "¿Qué es esto? Saca los datos." }] }],
    maxTokens: 300,
    think: false,
    schema: SCHEMA,
  });
  const j = JSON.parse(txt || "{}");
  if (j.tipo === "gasto" && j.monto > 0) return { tipo: "gasto", frase: `gasté ${Math.round(j.monto)} en ${String(j.comercio || "compra").slice(0, 40)}`, resumen: j.resumen || "" };
  if (j.tipo === "entreno" && (j.km > 0 || j.minutos > 0)) {
    const verbo = { trote: "troté", correr: "corrí", bici: "salí en bici", caminata: "caminé", "natación": "nadé", gimnasio: "entrené" }[j.actividad as string] || "troté";
    const partes = [j.km > 0 ? `${String(Math.round(j.km * 100) / 100).replace(".", ",")} km` : "", j.minutos > 0 ? `en ${j.minutos} minutos${j.segundos > 0 ? ` ${j.segundos} segundos` : ""}` : "", j.calorias > 0 ? `y quemé ${j.calorias} calorías` : ""].filter(Boolean);
    return { tipo: "entreno", frase: `${verbo} ${partes.join(" ")}`.trim(), resumen: j.resumen || "" };
  }
  return { tipo: "otro", frase: "", resumen: j.resumen || "No pude sacar datos de la foto." };
}
