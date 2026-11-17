// Registro de herramientas. Cada fase (rutina, avisos, memoria, agenda, preparador
// físico) agrega las suyas aquí y el cerebro las usa sin cambiar nada más.

export interface ToolResult {
  ok: boolean;
  // Frase corta que JARVIS puede decir tal cual (el intérprete local la usa sin gastar cuota).
  say: string;
  data?: unknown;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema (formato que entiende Gemini)
  // Si devuelve un texto, la acción pide confirmación antes de hacerse.
  needsConfirm?: (args: any) => string | null;
  run: (args: any) => ToolResult;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  register(...tools: Tool[]) {
    for (const t of tools) this.tools.set(t.name, t);
  }
  get(name: string) {
    return this.tools.get(name);
  }
  list() {
    return [...this.tools.values()];
  }
  // Formato que espera la API de Gemini en "tools".
  declarations() {
    return [{ functionDeclarations: this.list().map(({ name, description, parameters }) => ({ name, description, parameters })) }];
  }
  call(name: string, args: any): ToolResult {
    const t = this.tools.get(name);
    if (!t) return { ok: false, say: "Esa herramienta todavía no la tengo." };
    try {
      return t.run(args || {});
    } catch (e) {
      return { ok: false, say: "Algo falló haciendo eso. Prueba de nuevo." };
    }
  }
}
