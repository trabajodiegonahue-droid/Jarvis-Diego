import { describe, expect, it } from "vitest";
import { forSpeech, pickVoice, splitSentences } from "../src/voice/speech";

describe("voz", () => {
  it("corta en frases completas sin romper horas", () => {
    expect(splitSentences("Ya po, son las 18.30 ahora. Te toca ")).toEqual({ done: ["Ya po, son las 18.30 ahora."], rest: "Te toca " });
    expect(splitSentences("Hola Diego, ¿cómo te ayudo? ")).toEqual({ done: ["Hola Diego, ¿cómo te ayudo?"], rest: "" });
    expect(splitSentences("sin punto todavía").done).toEqual([]);
  });
  it("lee las horas como se dicen", () => {
    expect(forSpeech("a las 18:00 y a las 7:30 **ya**")).toBe("a las 18 horas y a las 7 y 30 ya");
  });
  it("elige una voz en español", () => {
    const v = (lang: string, name = lang) => ({ lang, name, voiceURI: name }) as SpeechSynthesisVoice;
    expect(pickVoice([v("en-US"), v("es-ES"), v("es-MX")])?.lang).toBe("es-MX");
    expect(pickVoice([v("en-US")])).toBeNull();
    expect(pickVoice([v("es-ES"), v("es-MX")], "es-ES")?.lang).toBe("es-ES");
  });
});
