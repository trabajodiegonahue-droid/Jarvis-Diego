# JARVIS

Asistente personal de Diego. Es una página web que se instala en el iPhone como una app (PWA). Le hablas con un botón y te responde con voz en español chileno. Maneja tu rutina diaria y conversa contigo usando **Gemini** en su nivel gratuito.

Costo esperado al usarlo: **US$0**. Se hospeda gratis en GitHub Pages, usa la voz del navegador y Gemini gratis. El intermediario de Cloudflare es opcional y también es gratis.

## Estado

| Versión | Qué hace | Estado |
|---|---|---|
| 1 | Botón para hablar, voz, rutina, conversación y respaldo | ✅ Lista y probada |
| 2 | Avisos a la hora de cada tarea | Pendiente |
| 3 | «Oye Siri, Jarvis» con un Atajo | Pendiente |
| 4–6 | Resumen de la mañana, memoria, visión, agenda y preparador físico | Pendiente |

## Cómo está armado

```
web/        la página (TypeScript + Vite, sin framework)
  src/config.ts        modelo de Gemini, tope de tokens y zona horaria (todo en un lugar)
  src/core/            hora de Chile, guardado en el teléfono y ajustes
  src/routine/         la rutina: tareas con hora y días, y qué toca ahora
  src/tools/           registro de herramientas (cada versión agrega las suyas aquí)
  src/brain/           intérprete local de órdenes, cliente de Gemini, personalidad y orquestador
  src/voice/           escuchar (Web Speech API) y hablar frase por frase
  src/main.ts          la pantalla
  test/                pruebas automáticas (Vitest)
worker/     intermediario opcional en Cloudflare Workers (guarda la clave de Gemini)
data/       ejemplo de respaldo de rutina
```

**Cómo responde.** Primero, un intérprete en el teléfono intenta entender las órdenes comunes: «agrega estudiar inglés a las 18:00», «ya hice el gym», «quita el gym», «cambia el gym a las 19:30», «qué me toca ahora» o «qué tengo el viernes». Esas órdenes son instantáneas, funcionan sin internet y no gastan cuota. Todo lo demás va a Gemini, que puede usar las mismas herramientas (`agregar_tarea`, `tachar_tarea`, `quitar_tarea`, `cambiar_tarea`, `ver_rutina`, `que_me_toca_ahora` y `borrar_toda_la_rutina`) con function calling. En cada consulta Gemini recibe la fecha y la hora de Chile.

**Seguridad y cuota:**
- Las respuestas tienen un tope de 300 tokens.
- Las conversaciones largas se resumen.
- Borrar toda la rutina pide confirmación.
- Si se acaba la cuota o no hay internet, JARVIS lo dice con un mensaje amable y la página sigue funcionando.

## Correrlo en tu Mac

Necesitas Node 20 o más nuevo (`brew install node`).

```bash
cd web
```

```bash
npm install
```

```bash
npm run dev
```

Abre `http://localhost:5173` en Chrome o Safari. Para correr las pruebas:

```bash
npm test
```

> El micrófono del navegador solo funciona con `https` o en `localhost`. Para probar en el iPhone, usa la versión publicada en GitHub Pages.

## La clave de Gemini

1. Entra a [Google AI Studio](https://aistudio.google.com/), crea una clave (**Get API key**) y **no actives la facturación**: así nunca te cobran.
2. Revisa ahí los límites gratis vigentes y que el modelo de `web/src/config.ts` siga existiendo. Hoy es `gemini-flash-lite-latest`, un alias que Google apunta al Flash-Lite actual.
3. En Google Cloud → Credenciales, restringe la clave a **Generative Language API** y nada más.
4. Lo que mandas al nivel gratis puede usarse para mejorar productos de Google, así que no le pases datos sensibles.

Hay dos formas de usar la clave. Las dos funcionan y se eligen en **Ajustes**.

| Opción | Cómo funciona | Riesgo |
|---|---|---|
| **Clave en el teléfono** | La pegas en Ajustes y queda guardada solo en ese teléfono | Si alguien usa tu teléfono desbloqueado, podría copiarla. Nunca está en GitHub |
| **Intermediario** (recomendado) | La clave vive en Cloudflare; el teléfono solo tiene un código de acceso | Si te roban el código, lo cambias en un minuto. Además, las versiones 2 y 3 lo necesitan |

### Instalar el intermediario (Cloudflare Workers, gratis)

```bash
cd worker
```

```bash
npm install
```

```bash
npx wrangler login
```

```bash
npx wrangler secret put GEMINI_API_KEY
```

```bash
npx wrangler secret put ACCESS_TOKEN
```

```bash
npx wrangler deploy
```

- En `GEMINI_API_KEY` pegas tu clave de AI Studio.
- En `ACCESS_TOKEN` inventas un código largo, por ejemplo uno generado con `openssl rand -hex 24`.
- `wrangler deploy` te devuelve una dirección del tipo `https://jarvis.<tu-usuario>.workers.dev`. Pégala en JARVIS → Ajustes → Intermediario, junto con tu código.

El intermediario solo acepta pedidos que vienen de tu página (`ALLOWED_ORIGIN` en `worker/wrangler.toml`) y que traen el código. Además, el modelo lo decide el intermediario: nadie puede pedir otro modelo.

## Publicarlo gratis (GitHub Pages)

1. En GitHub, ve al repositorio → **Settings → Pages → Source: GitHub Actions**.
2. Si usas el intermediario y no quieres escribir su dirección en cada teléfono, agrégala en **Settings → Secrets and variables → Actions → Variables** con el nombre `WORKER_URL`. No es secreta.
3. Cada vez que se sube algo a `main`, el workflow corre las pruebas y publica la página en `https://trabajodiegonahue-droid.github.io/Jarvis-Diego/`.

## Instalarlo en el iPhone

1. Abre la dirección de arriba en **Safari**.
2. Toca **Compartir → Agregar a inicio**.
3. Abre JARVIS desde el ícono, ve a **Ajustes** y conecta Gemini.
4. Toca el botón grande: la primera vez te saluda y después te escucha.

**Qué esperar en el iPhone:**
- **Escuchar:** el reconocimiento de voz de Safari a veces falla dentro de una app instalada en el inicio. Si pasa, usa el cuadro de texto con el **micrófono del teclado** (el dictado de Apple), que funciona siempre.
- **Hablar:** usa las voces del iPhone. La más natural se descarga en Ajustes → Accesibilidad → Contenido leído → Voces → Español.

## Respaldo

Tu rutina vive solo en el teléfono. En **Rutina → Descargar copia** guardas un archivo (en Archivos, Drive o un correo para ti) y con **Restaurar copia** lo recuperas.

## Créditos y referencias

La arquitectura toma **ideas, no código**, de [Julian-Ivanov/jarvis-voice-assistant](https://github.com/Julian-Ivanov/jarvis-voice-assistant):
- el prompt con la hora y las tareas en cada consulta;
- la regla «todo se lee en voz alta»;
- el historial limitado;
- hablar frase por frase.

Ese repositorio dice MIT en el README, pero no tiene archivo LICENSE, así que no se copió código. Tampoco se usó código de los otros proyectos de referencia.

## Pendientes

- **Versión 2 (avisos):** notificaciones push de la PWA. En iOS 16.4 o más nuevo funcionan solo con la app instalada en el inicio y con el permiso pedido desde un botón. Necesitan el intermediario: un cron de Cloudflare envía el aviso a su hora, con una copia mínima de la rutina (nombre, hora y día). Como alternativa sin servidor: exportar los avisos al Calendario del iPhone (.ics).
- **Versión 3 (Siri):** un Atajo «Jarvis» que dicta, consulta al intermediario y lee la respuesta en voz alta, con los pasos exactos para crearlo en la app Atajos. Escuchar siempre sin decir «Oye Siri» no es posible en el iPhone.
- **Versiones 4 a 6:** resumen de la mañana con el clima de Puerto Varas (Open-Meteo), memoria, fotos, Google Calendar (solo lectura) y el preparador físico, reutilizando la biblioteca de ejercicios y la lógica de progresión de la app «Atleta Híbrido».
