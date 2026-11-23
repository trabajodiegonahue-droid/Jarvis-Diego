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
| 4 | JARVIS integrado: registrar hablando (gastos, ingresos, entrenos, goles, metas, estudio, turnos) con deshacer, consultas y resúmenes, resumen de la mañana, modo manos libres para entrenar, modo privado y Atajo de Siri | ✅ |
| 5 | Hábitos y bienestar (rachas, sueño, energía, ánimo, agua, diario), calendario unificado con choques, bitácora de tiempo al minuto (cronómetro, línea del día, semana, mes y año), «Mi año en números», resúmenes automáticos de la semana y del mes, clima (Open-Meteo) | ✅ |
| + | Recordatorios con avisos (en la app, en el iPhone con la app cerrada y exportables al Calendario), resumen del día en la mañana y de mañana en la noche, memoria de JARVIS, cumpleaños y fechas importantes, lista de compras, simulador de metas, rueda de la vida, modo semana difícil, logros y un pulido del diseño | ✅ |
| 6 | Pulido: JARVIS entiende cómo escribes (q, xq, nms, mns, toy, mñn, lukas, gambas, cansao, po, wn…), modo práctica con los datos de ejemplo, guía «¿Qué le puedo decir?», protección ante errores, accesibilidad revisada con axe en tema oscuro y claro, y velocidad medida | ✅ |

## Cómo está armado

```
web/        la app (TypeScript + Vite + Preact)
  src/ui/              pantallas, componentes, gráficos SVG propios y tema (theme.css)
  src/data/            tipos de datos, IndexedDB, respaldo, datos de ejemplo
  src/money/           cálculos de dinero (funciones puras, con pruebas), formato $1.234.567, CSV
  src/goals/ work/ study/   cálculos de metas, trabajo y estudios (funciones puras, con pruebas)
  src/core/            hora de Chile, ajustes, PIN
  src/jarvis/          JARVIS dentro de la app: intérprete de lo que registras, herramientas, resúmenes, buzón de Siri
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

**Qué se envía a Gemini** (también está en la app, en Ajustes → «Qué se le envía a Gemini»):
- Anotar y las consultas típicas se resuelven en el teléfono, sin enviar nada: «gasté 5 mil en comida», «hice gym», «metí un gol», «¿cuánto llevo gastado?», «resumen de la semana».
- Cuando JARVIS no entiende una frase, a Gemini va esa frase, tu rutina de hoy, el texto de «Sobre mí» y un resumen corto de la conversación.
- Si Gemini necesita un dato de la app, recibe solo el resultado ya calculado («llevas $80.000 este mes»), nunca la lista de movimientos.
- Con el **modo privado** ni eso sale: tú ves las cifras en pantalla, Gemini solo sabe que se respondió, y las frases con plata que JARVIS no entiende no se envían.

## JARVIS

**Cómo responde.** Primero, un intérprete en el teléfono intenta entender las órdenes comunes: «agrega estudiar inglés a las 18:00», «ya hice el gym», «quita el gym», «cambia el gym a las 19:30», «qué me toca ahora» o «qué tengo el viernes». Esas órdenes son instantáneas, funcionan sin internet y no gastan cuota. Todo lo demás va a Gemini, que puede usar las mismas herramientas (`agregar_tarea`, `tachar_tarea`, `quitar_tarea`, `cambiar_tarea`, `ver_rutina`, `que_me_toca_ahora` y `borrar_toda_la_rutina`) con function calling. En cada consulta Gemini recibe la fecha y la hora de Chile.

**Cómo razona y conversa:**
- En casos ambiguos pregunta en vez de adivinar. Por ejemplo, con «hice la rutina a medias» te lee lo pendiente numerado y te pregunta cuáles hiciste. Le puedes responder «la 1 y el perro», «todas menos el inglés» o «ninguna».
- Entiende «hice todo», «ya hice el gym y el inglés», «no hice nada, estoy reventado», «cómo voy», «qué me faltó ayer» y «cómo voy esta semana».
- Con Gemini conectado, piensa antes de responder (razonamiento con un tope de tokens, en `THINKING_BUDGET`). Recibe tu rutina completa, lo hecho, lo pendiente, lo de ayer y ejemplos de cómo actuar.
- Sabe datos útiles sin internet (`web/src/knowledge/facts.ts`): Servicio Militar 2027, Working Holiday en Australia, Puerto Varas, entrenamiento, inglés y números de emergencia.
- Con internet, busca información actual con la herramienta `buscar_en_internet`, que usa Google Search a través de Gemini.
- **Sobre mí** (en Ajustes): lo que JARVIS sabe de ti. Se guarda solo en tu teléfono, nunca en este repositorio público, y se le pasa a Gemini en cada consulta. No pongas nada que no quieras que Google pueda leer.

**Registrar y preguntar hablando (fase 4).** Toca el botón verde y dile, por ejemplo:
- Plata: «gasté 5 lucas en almuerzo», «pagué 30 mil de luz ayer», «me pagaron 40 mil de propina». La categoría la adivina por palabras del día a día (almuerzo → comida, uber → transporte); si no está claro, o el monto es muy alto, pregunta antes de anotar. Al anotar te dice cómo vas con el presupuesto de esa categoría.
- Entreno y fútbol: «hice gym» (también tacha el gimnasio de la rutina), «salí a correr 5 km», «metí un gol y una asistencia», «ganamos 3 a 1, jugué 80 minutos y me pongo un 7». Se suma al partido de ese día si ya existe.
- Metas, estudio y trabajo: «agrega una meta de ahorrar 200 mil para marzo», «aporté 20 mil a la meta», «estudié una hora de inglés», «trabajé de 18 a 23 y saqué 15 mil de propina».
- Preguntas: «¿qué me toca hoy?», «¿cuánto llevo gastado en comida?», «¿cómo voy con mis metas?», «¿cuántos goles llevo?», «¿qué entreno hoy?», «resumen de la semana», «¿cómo me fue este mes?».
- Todo lo que anota trae **Deshacer** en el chat, y también le puedes decir «deshaz eso».
- La primera vez que lo abres en el día te saluda con el **resumen de la mañana**: rutina, turno, entreno, partido, pruebas cercanas, lo pendiente de ayer y un aviso de presupuesto si corresponde.

**Tu vida registrada (fase 5).**
- **Mi tiempo** (Más → Mi tiempo, o la tarjeta del inicio): toca qué estás haciendo y corre un cronómetro; tócalo de nuevo para terminar. O dile a JARVIS «empecé a estudiar», «me voy a dormir», «terminé», «me desperté». Lo que ya pasó: «de 14 a 16 estuve estudiando», «estuve 2 horas en el celular», «dormí de 23:30 a 7».
  - **Día:** una línea de 24 horas, al minuto, con cada bloque en su color. Tocas un espacio vacío para anotarlo. Los turnos y los partidos con hora aparecen solos.
  - **Semana y mes:** horas por actividad y promedio por día. **Año:** «Mi año en números» (partidos, goles, entrenos, horas de estudio y trabajo, metas cumplidas, mejor racha, sueño) y en qué se te fue el tiempo.
  - Si dos cosas se pisan, cada minuto cuenta una sola vez, así un día nunca pasa de 24 horas.
- **Hábitos y bienestar:** marcas tus hábitos con un toque (con racha), y anotas sueño, energía, ánimo, agua y un diario corto. El sueño y la energía ajustan solos la carga del entreno.
- **Calendario:** la semana con turnos, partidos, físico, rutina, pruebas y metas, y te avisa si algo se cruza (por ejemplo, turno hasta las 22:30 y partido a las 19:00).
- **Resúmenes automáticos:** el lunes aparece en el inicio el resumen de la semana pasada (entrenos, músculos, récords, estudio, hábitos, sueño y bitácora), los primeros días del mes el del mes pasado y a fin de año el link a tu año. Con «Escuchar» te lo lee.
- **Clima:** en el inicio y en el resumen de la mañana, con un consejo si juegas con lluvia o frío. Lo da [Open-Meteo](https://open-meteo.com) (gratis para uso personal, licencia CC BY 4.0, sin clave). Solo recibe las coordenadas de tu ciudad, que cambias en Ajustes.

**Escríbele como hablas (fase 6).** Antes de interpretar una frase, JARVIS la pasa a español «de diccionario»: «oe wn gaste 5 lukas x un completo nms» se lee como «gasté 5 lucas por un completo». Entiende q, k, xq, x, d, pa, tb, mns (menos), nms (nomás), toy, tai, mñn, dsp, cn, celu, lukas, gamba ($100), quina ($500), palo, cansao/reventao, sipo, nica, y saca muletillas como po, wn, cachai o jaja. La lista está en `web/src/brain/chileno.ts`: si usas otra palabra, se agrega ahí.

**Modo práctica.** Si cargas los datos de ejemplo, todo lo que anotes después (también hablándole a JARVIS) queda marcado como ejemplo y se borra con «Borrar ejemplos». Así puedes probar sin miedo. La rutina, que vive aparte, no se borra con los ejemplos.

**¿Qué le puedo decir?** En la hoja de JARVIS hay una guía con frases por tema; tocas una y se la manda. Una prueba automática revisa que JARVIS entienda todas sin Gemini.

**Que responda todo.** Sin Gemini, JARVIS entiende en el teléfono lo que anotas y lo que cuentas (y lo guarda en su área). Para responder cualquier pregunta necesita Gemini: en la hoja de JARVIS aparece «Conecta a JARVIS para que responda todo», donde pegas una clave gratis de [Google AI Studio](https://aistudio.google.com/apikey) y queda listo. Las preguntas que hagas antes de conectarlo quedan guardadas y se responden con un toque cuando lo conectes. Con Gemini conectado, si el teléfono no encuentra algo (una meta, una tarea), se lo pasa a Gemini en vez de rendirse. También busca en todo lo que le has contado: «¿qué te dije de la rodilla?», «¿cuándo fue la última vez que fui al dentista?».

**Mi vida por áreas.** Tiene su propia pestaña («Mi vida»); Metas quedó en Más. Todo lo que le cuentas a JARVIS queda guardado en su bloque: salud, ánimo, dinero, amor, familia y amigos, entrenamiento, fútbol, estudios, trabajo, casa y trámites, metas y proyectos, y ocio. Por ejemplo, «me duele la rodilla» va a Salud, «salí con la polola» a Amor y «gasté 5 lukas en completos» a Dinero (además de anotarse el gasto). Las preguntas no se guardan. Cada bloque muestra un dato al día sacado de la app (sueño promedio, balance del mes, entrenos de la semana, próximo turno…) y lo último que contaste. Se ve en la tarjeta del inicio y en Más → Mi vida por áreas. Ahí puedes escribir algo, moverlo de área o borrarlo. Por voz: «¿qué he contado de salud?», «¿cómo voy en el amor?», «anota en salud: me tomé la presión».

**Recordatorios y lo que viene.** Dile a JARVIS «recuérdame pagar la luz mañana a las 10», «avísame en 30 minutos que saque la ropa» o «recuérdame la creatina todos los días a las 8». Entiende «el viernes», «pasado mañana en la noche», «el 3 de enero», «en 2 horas» y repeticiones (todos los días, todos los lunes, cada mes, cada año). Si no dices la hora, avisa a las 9. Con la app abierta, el aviso aparece arriba con «Listo», «En 10 min» y «En 1 hora». «¿Qué se viene los próximos días?» junta turnos, partidos, pruebas, recordatorios, cumpleaños y lo que le contaste.

**Memoria.** «Acuérdate que el viernes tengo prueba de inglés» o «acuérdate que me lesioné el tobillo»: JARVIS lo guarda en el teléfono, te lo menciona en el resumen del día que corresponde y, si usas Gemini, le pasa solo los recuerdos que tienen que ver con lo que preguntas. «¿Qué recuerdas?» y «olvida lo del tobillo». Nunca guarda claves, contraseñas ni datos de tarjetas.

**Fechas, compras y más.** «El cumpleaños de mi mamá es el 3 de mayo» (te avisa 3 días antes y la noche anterior), «agrega pan, leche y huevos a la lista», «compré el pan», «si ahorro 50 lukas al mes, ¿cuándo llego?» (también hay un simulador con deslizador dentro de cada meta de plata), «estoy en una semana pesada» (activa el modo semana difícil: entreno más corto, las rachas no se cortan y JARVIS habla más suave), «mis logros». En el inicio, el equilibrio se ve como **rueda de la vida**.

**Manos libres en el gimnasio.** En la sesión guiada (Fútbol → Físico → Entrenar hoy), toca «Entrenar con voz». JARVIS dice el ejercicio, la serie y la meta. Le respondes «listo», «hice 8» o «10 con 22,5 kilos», y él anota la serie, inicia el descanso, te avisa a los 10 segundos y te dice la siguiente. También entiende «siguiente ejercicio», «salta el descanso», «repite» y «terminé el entreno». Si el iPhone no deja escuchar dentro de la app, igual te habla y usas los botones grandes.

**Seguridad y cuota:**
- Las respuestas tienen un tope de 300 tokens.
- Las conversaciones largas se resumen.
- Borrar toda la rutina pide confirmación.
- Si se acaba la cuota o no hay internet, JARVIS lo dice con un mensaje amable y la página sigue funcionando.

## Calidad (fase 6)

- **Pruebas:** 193 pruebas automáticas en la app (`npm test` en `web/`) y 14 en el intermediario (`npm test` en `worker/`), incluida la firma de los avisos verificada con criptografía real.
- **Velocidad:** con el procesador 4 veces más lento y red 3G, la app abre en unos 1,3 s la primera vez y en 0,6 s después. Cambiar de pantalla toma menos de 0,1 s.
- **Accesibilidad:** las 16 pantallas y hojas principales pasan la revisión de [axe-core](https://github.com/dequelabs/axe-core) en tema oscuro y claro. Las hojas atrapan el foco y lo devuelven al cerrarse.
- **Errores amables:** si una pantalla falla, aparece un aviso con «Probar de nuevo» y el resto de la app sigue. Si abrir los datos demora más de 10 s, se ofrece recargar.
- **Corregido:** a veces la app quedaba en negro al abrir, porque los datos cargaban antes de que la pantalla alcanzara a escuchar. Se probó con 168 recargas seguidas.
- **Dependencias:** `npm audit` avisa de un problema en `picomatch` (lo usan Vite y Vitest al compilar). No tiene arreglo publicado todavía, solo corre en tu computador al compilar y no va dentro de la app.

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

### Atajo de Siri: «Oye Siri, Jarvis»

**Para hablarle sin abrir la app:** «Oye Siri, Jarvis» (también con el teléfono bloqueado o con AirPods), doble toque en la espalda del iPhone (Ajustes → Accesibilidad → Tocar → Tocar atrás), el botón de acción del iPhone 15 Pro o más nuevo, el control «Atajo» del centro de control o de la pantalla bloqueada, y la app Atajos del Apple Watch. Todos lanzan el mismo atajo «Jarvis».

**Qué hace el atajo:** todo lo que cuentas queda en el buzón y Siri te dice en qué área va («Listo, lo guardo en Salud»). Se anota en Vida apenas la abres, porque tus datos viven solo en el teléfono. «¿Qué tengo mañana?», «¿qué tengo el viernes?» y «¿qué tengo esta semana?» las responde al tiro con la agenda de los próximos 7 días que la app le manda al intermediario (turnos, partidos, pruebas, recordatorios y rutina; nunca montos de plata). Las preguntas generales las responde Gemini.

**Qué es posible y qué no.** En el iPhone, un atajo que abre una dirección web la abre en Safari, no en la app instalada en el inicio. Además, Safari y la app instalada guardan sus datos por separado. Por eso el atajo no abre la app: le habla al intermediario.
- **Para anotar** («gasté 5 mil en almuerzo», «hice gym», «metí un gol»): el intermediario lo deja en un **buzón** y responde «Listo, lo dejé anotado». Al abrir Vida, la app lo lee, lo anota (con Deshacer) y lo borra del buzón.
- **Preguntas generales:** las responde Gemini al tiro, y Siri te lee la respuesta.
- **Tus datos** (gastos, rutina, metas): viven solo en el teléfono, así que Siri no los puede leer. Esas preguntas házlas dentro de la app.
- Escuchar siempre sin decir «Oye Siri» no es posible en el iPhone.

**1. Crear el buzón** (gratis, en Cloudflare KV), desde la carpeta `worker`:

```bash
npx wrangler kv namespace create BUZON
```

Copia el `id` que te muestra, pégalo en `worker/wrangler.toml` (descomenta las tres líneas de `kv_namespaces`) y vuelve a publicar:

```bash
npx wrangler deploy
```

El buzón guarda solo la frase dictada, hasta que abres la app o por un máximo de 2 semanas. Si no lo creas, el atajo igual sirve para preguntas generales.

**2. Crear el atajo** en la app **Atajos** → **+** → nombre «Jarvis»:
1. **Dictar texto**, con el idioma en español (Chile) y «Dejar de escuchar» en «Después de una pausa».
2. **Obtener contenido de URL**:
   - URL: `https://jarvis.<tu-usuario>.workers.dev/siri`
   - Método: POST
   - Sin encabezados.
   - Cuerpo: JSON, con dos campos de texto: `texto` = «Texto dictado» y `codigo` = tu código de acceso.
   - (También sirve el encabezado `Authorization: Bearer <código>`, pero en algunos iPhone Cloudflare lo rechaza con «400»; el campo `codigo` evita eso.)
3. **Leer texto**, con «Contenido de URL», en español y con una voz en español.

Dile «Oye Siri, Jarvis», espera el sonido y habla. Si quieres un código distinto solo para el atajo (por si alguna vez se lo muestras a alguien), crea `SIRI_TOKEN` con `npx wrangler secret put SIRI_TOKEN` y úsalo en el campo `codigo`: el atajo acepta ese o el de la app.

La app también abre JARVIS con un texto si entras a `…/#/jarvis?q=gasté 5 mil en comida`. Por seguridad no lo ejecuta solo: lo deja escrito para que lo revises y lo envíes. Sirve, por ejemplo, desde un atajo cuando usas Vida en Safari sin instalarla.

### Avisos en el iPhone con la app cerrada (gratis)

Te llegan tus recordatorios, lo que te toca cada mañana (a la hora que elijas), lo de mañana en la noche, tu rutina 10 minutos antes, los cumpleaños y, si quieres, el agua.

**Qué es posible:** en el iPhone, una app web solo puede recibir notificaciones si está **agregada a la pantalla de inicio** (iOS 16.4 o más nuevo) y si das el permiso desde un botón dentro de la app. Las notificaciones las manda tu intermediario de Cloudflare: revisa cada 5 minutos qué toca y manda un «toque» sin contenido; el iPhone pide el texto después. En Cloudflare quedan solo los textos cortos de los avisos de los próximos 7 días (sin montos de plata), y se borran apenas se envían.

1. Crea el buzón (ver «Atajo de Siri», paso 1) si no lo hiciste.
2. Genera las claves de los avisos, desde `worker`:

```bash
node scripts/claves-avisos.mjs
```

3. Guarda la clave privada como secreto (pégala cuando te la pida):

```bash
npx wrangler secret put VAPID_PRIVATE
```

4. En `worker/wrangler.toml`, pega la clave pública en `VAPID_PUBLIC` y descomenta `[triggers]` y `crons`. Publica:

```bash
npx wrangler deploy
```

5. En el iPhone, abre Vida **desde el ícono de inicio** → Más → Recordatorios → pestaña **iPhone** → «Activar avisos» y acepta el permiso.

**Sin servidor:** en esa misma pestaña, «Exportar al Calendario (.ics)» crea un calendario con alarmas de tus recordatorios, tu rutina y tus fechas importantes. Lo abres en el iPhone y queda en la app Calendario. Si cambias algo, lo exportas de nuevo.

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

- **Versión 2 de JARVIS (avisos):** notificaciones push de la PWA. En iOS 16.4 o más nuevo funcionan solo con la app instalada en el inicio y con el permiso pedido desde un botón. Necesitan el intermediario: un cron de Cloudflare envía el aviso a su hora, con una copia mínima de la rutina (nombre, hora y día). Como alternativa sin servidor: exportar los avisos al Calendario del iPhone (.ics).
- **Versiones 4 y 5 de JARVIS:** memoria de lo que le cuentas, fotos y Google Calendar (solo lectura).
