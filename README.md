# Vida, con JARVIS

El panel de control de la vida de Diego: dinero, metas, entrenamiento, fútbol, estudios y trabajo en un solo lugar, con gráficos claros. **JARVIS** va integrado: el asistente de voz en español chileno que usa **Gemini** en su nivel gratuito. Es una PWA, una página web que se instala en el iPhone como una app.

- **Costo al usarla: US$0.** Se hospeda en GitHub Pages, usa la voz del navegador y Gemini gratis.
- **Privada:** tus datos se quedan en el teléfono.

Los briefs están en [`docs/APP_VIDA.md`](docs/APP_VIDA.md) (manda este) y [`docs/JARVIS.md`](docs/JARVIS.md).

## Estado

| Fase | Qué incluye | Estado |
|---|---|---|
| 0 | Sistema de diseño (tema oscuro y claro), navegación, IndexedDB, respaldo JSON/CSV, PWA, bienvenida y PIN | ✅ |
| 1 | Inicio (maqueta A) y Dinero: movimientos, presupuesto, fijos, gráficos e importación de cartola CSV | ✅ |
| 2 | Metas (plata, cantidad, hábito y pasos; avance contra el tiempo; qué falta esta semana; revisión mensual), Trabajo (turnos, horas, sueldo estimado, propinas que pasan a Dinero) y Estudios (materias, horas por semana, pendientes, pruebas y resultados) | ✅ |
| 3 | Fútbol y Entrenamiento | ✅ |
| 4 | JARVIS integrado: registrar hablando («gasté 5 mil en comida»), Atajo de Siri | Parcial: chat, voz y rutina ya funcionan |
| 5 | Hábitos, calendario unificado y resúmenes | Pendiente |
| 6 | Pulido final | Pendiente |

## Cómo está armado

```
web/        la app (TypeScript + Vite + Preact)
  src/ui/              pantallas, componentes, gráficos SVG propios y tema (theme.css)
  src/data/            tipos de datos, IndexedDB, respaldo, datos de ejemplo
  src/money/           cálculos de dinero (funciones puras, con pruebas), formato $1.234.567, CSV
  src/goals/ work/ study/   cálculos de metas, trabajo y estudios (funciones puras, con pruebas)
  src/core/            hora de Chile, ajustes, PIN
  src/jarvis/          la instancia de JARVIS que comparten las pantallas
  src/brain/ tools/ routine/ voice/ knowledge/   el asistente (ver abajo)
  test/                pruebas automáticas (Vitest)
worker/     intermediario opcional en Cloudflare Workers (guarda la clave de Gemini)
docs/       los briefs
```

**Por qué estas decisiones:**
- **Preact** (unos 4 KB) para armar las pantallas sin el peso de React.
- **Gráficos hechos a mano en SVG**: no pesan nada, tienen un solo estilo y traen texto alternativo. Chart.js pesa unos 70 KB y cuesta más dejarlo con un solo estilo.
- **Montos en pesos enteros**, para que nunca haya errores de redondeo.
- **Los totales y porcentajes se calculan en el teléfono**, nunca en Gemini.

**Datos y seguridad:**
- Todo vive en IndexedDB, en el teléfono.
- Se guarda en IndexedDB: movimientos, categorías, presupuestos, fijos, metas y sus avances, turnos, materias, sesiones de estudio, pendientes y pruebas. La rutina, los ajustes y las preferencias van en `localStorage` porque son pocos datos.
- La app pide al navegador almacenamiento persistente. En iOS, una app instalada en la pantalla de inicio no se borra a los 7 días sin uso, como pasa con Safari, pero el sistema puede liberar espacio si el teléfono se llena. Por eso hay respaldo y la app te lo recuerda cada 14 días.
- El **PIN** pide un código al abrir la app y al volver después de 5 minutos fuera. Es una pantalla de privacidad: no cifra los datos. Si lo olvidas, borras los datos del sitio y restauras tu respaldo.

**Qué se envía a Gemini:** la frase que le dices a JARVIS, tu rutina de hoy y el texto de «Sobre mí». Nunca tus movimientos. Con el **modo privado** no se manda nada de dinero; se ocupa desde la fase 4, que es cuando JARVIS empieza a manejar dinero.

## JARVIS

**Cómo responde.** Primero, un intérprete en el teléfono intenta entender las órdenes comunes: «agrega estudiar inglés a las 18:00», «ya hice el gym», «quita el gym», «cambia el gym a las 19:30», «qué me toca ahora» o «qué tengo el viernes». Esas órdenes son instantáneas, funcionan sin internet y no gastan cuota. Todo lo demás va a Gemini, que puede usar las mismas herramientas (`agregar_tarea`, `tachar_tarea`, `quitar_tarea`, `cambiar_tarea`, `ver_rutina`, `que_me_toca_ahora` y `borrar_toda_la_rutina`) con function calling. En cada consulta Gemini recibe la fecha y la hora de Chile.

**Cómo razona y conversa:**
- En casos ambiguos pregunta en vez de adivinar. Por ejemplo, con «hice la rutina a medias» te lee lo pendiente numerado y te pregunta cuáles hiciste. Le puedes responder «la 1 y el perro», «todas menos el inglés» o «ninguna».
- Entiende «hice todo», «ya hice el gym y el inglés», «no hice nada, estoy reventado», «cómo voy», «qué me faltó ayer» y «cómo voy esta semana».
- Con Gemini conectado, piensa antes de responder (razonamiento con un tope de tokens, en `THINKING_BUDGET`). Recibe tu rutina completa, lo hecho, lo pendiente, lo de ayer y ejemplos de cómo actuar.
- Sabe datos útiles sin internet (`web/src/knowledge/facts.ts`): Servicio Militar 2027, Working Holiday en Australia, Puerto Varas, entrenamiento, inglés y números de emergencia.
- Con internet, busca información actual con la herramienta `buscar_en_internet`, que usa Google Search a través de Gemini.
- **Sobre mí** (en Ajustes): lo que JARVIS sabe de ti. Se guarda solo en tu teléfono, nunca en este repositorio público, y se le pasa a Gemini en cada consulta. No pongas nada que no quieras que Google pueda leer.

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
3. Abre **Vida** desde el ícono y sigue la bienvenida (3 pasos).
4. Para JARVIS: **Más → Ajustes → JARVIS y Gemini**, pega tu clave o el intermediario y toca «Probar conexión».
5. El botón verde abre JARVIS; el botón + registra un gasto o ingreso.

**Qué esperar en el iPhone:**
- **Escuchar:** el reconocimiento de voz de Safari a veces falla dentro de una app instalada en el inicio. Si pasa, usa el cuadro de texto con el **micrófono del teclado** (el dictado de Apple), que funciona siempre.
- **Hablar:** usa las voces del iPhone. La más natural se descarga en Ajustes → Accesibilidad → Contenido leído → Voces → Español.

## Respaldo

Todo vive solo en el teléfono. En **Más → Ajustes → Respaldo** guardas un archivo JSON con todo: movimientos, presupuestos, fijos, rutina y preferencias, sin tu clave de Gemini. Guárdalo en Archivos, Drive o un correo para ti; con **Restaurar** lo recuperas en otro teléfono. También puedes exportar los movimientos a CSV para abrirlos en Excel o Sheets.

## Créditos y referencias

La arquitectura toma **ideas, no código**, de [Julian-Ivanov/jarvis-voice-assistant](https://github.com/Julian-Ivanov/jarvis-voice-assistant):
- el prompt con la hora y las tareas en cada consulta;
- la regla «todo se lee en voz alta»;
- el historial limitado;
- hablar frase por frase.

Ese repositorio dice MIT en el README, pero no tiene archivo LICENSE, así que no se copió código. Tampoco se usó código de los otros proyectos de referencia.

## Pendientes

- **Fases 3 a 6** de `docs/APP_VIDA.md`.
- **Versión 2 de JARVIS (avisos):** notificaciones push de la PWA. En iOS 16.4 o más nuevo funcionan solo con la app instalada en el inicio y con el permiso pedido desde un botón. Necesitan el intermediario: un cron de Cloudflare envía el aviso a su hora, con una copia mínima de la rutina (nombre, hora y día). Como alternativa sin servidor: exportar los avisos al Calendario del iPhone (.ics).
- **Versión 3 (Siri):** un Atajo «Jarvis» que dicta, consulta al intermediario y lee la respuesta en voz alta, con los pasos exactos para crearlo en la app Atajos. Escuchar siempre sin decir «Oye Siri» no es posible en el iPhone.
- **Versiones 4 a 6:** resumen de la mañana con el clima de Puerto Varas (Open-Meteo), memoria, fotos, Google Calendar (solo lectura) y el preparador físico, reutilizando la biblioteca de ejercicios y la lógica de progresión de la app «Atleta Híbrido».
