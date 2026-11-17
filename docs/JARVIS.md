# JARVIS: brief para Claude Code

## Qué quiero construir

Un asistente personal tipo JARVIS (el de Tony Stark) que corra como página web instalable en el celular (PWA). Lo uso hablándole con un botón, y él me responde con voz. Debe hacer lo que yo le diga, sumando herramientas de a poco.

El cerebro es Gemini, de Google, usado por su API gratuita (Google AI Studio, nivel gratis, sin facturación). Usar un modelo Flash o Flash-Lite y dejar el nombre del modelo en una sola variable de configuración, porque los modelos y los límites gratuitos cambian. Revisar los límites vigentes en la consola de Google AI Studio antes de construir. Las consultas del nivel gratis pueden usarse para mejorar productos de Google, así que no enviarle contenido sensible (por ejemplo correos completos). Objetivo: gastar US$0 al usar el asistente.

## Quién soy y cómo me trata
- Me llamo Diego.
- Al abrir la conversación o al activarlo, me saluda con algo como: "Hola Diego, ¿cómo te ayudo?"
- Siempre responde en español.

## Mi contexto técnico
- Mi celular es un iPhone y mi computador es un Mac.
- No es mi primera vez programando, pero explícame las decisiones importantes en vez de asumir que las conozco.
- Voy a contratar solo el plan Pro de Claude (unos US$20 al mes; verificar el precio actual) para usar Claude Code y construir esto. No voy a pagar la API de Claude: el cerebro es Gemini gratis.
- Ya hice una app propia con mi rutina diaria, pero quiero cambiarla. Antes de construir, pídeme el código o una descripción de cómo funciona, revisa qué conviene reutilizar y qué conviene rehacer. Si es más simple empezar de cero, dímelo.

## Personalidad

Habla relajado y chileno, cercano pero útil, sin exagerar la jerga ni caer en caricatura. Respuestas cortas, porque las voy a escuchar, no a leer. Ejemplos del tono:
- "Hola Diego, ¿cómo te ayudo?"
- "Listo, tachado el gym. Bien ahí."
- "Ya po, son las 18:00, te toca estudiar inglés."
- "Ahí no tengo la info, mejor revísalo para no equivocarnos."

Si no sabe algo, lo dice. No inventa.

## Alcance y ambición

Quiero el proyecto completo y pulido, no un prototipo. Diseña desde el inicio la arquitectura para todo el alcance (voz, rutina, avisos, activación por "jarvis" y herramientas futuras) para que cada fase se enchufe sin rehacer lo anterior. Construye por fases, en este orden, dejando cada una funcionando y probada antes de pasar a la siguiente. Si una parte no es posible en mi iPhone, dímelo con claridad y propón la mejor alternativa real en vez de prometerla.

## Punto de partida: proyecto existente

No quiero empezar de cero. Quiero partir de lo que otros ya hicieron. Si esta sección choca con otra parte del brief, esta sección manda y me avisas qué cambió.

Referencia principal: el repositorio Julian-Ivanov/jarvis-voice-assistant en GitHub, que según su página tiene licencia MIT. Ojo: es una app de escritorio para Mac que usa la API de Claude y una voz de pago, así que no sirve tal cual. Quiero sus ideas, no su configuración de pago.

Pasos:
- Revisa ese repositorio como referencia de arquitectura (cómo detecta la voz, cómo llama al modelo, cómo habla y cómo guarda la configuración) y dime qué ideas conviene aprovechar. Si copias código, verifica el archivo LICENSE, conserva el aviso de licencia y el crédito al autor.
- Estos otros proyectos son solo referencia de ideas: ethanplusai/jarvis, Zeffut/Jarvis, ArhanCodes/jarvis y enochko/jarvis. No copies su código salvo que su licencia lo permita de forma expresa.
- Todo lo que construyas debe funcionar en mi iPhone y costar US$0 al usarlo: página web instalable con la voz del navegador, el dictado del iPhone como respaldo y un Atajo de Siri llamado "Jarvis" para activarlo diciendo "Oye Siri, Jarvis".
- Revisa cualquier código de terceros antes de ejecutarlo y no uses claves que tengan acceso a nada más que a esto.

## Versión 1 (lo primero que hay que construir)

La base de todo lo demás: debe quedar sólida y pulida antes de pasar a la versión 2.
- Pantalla simple con un botón grande para hablar, pensada para el celular.
- Voz: usar la API de voz del navegador (Web Speech API) para escuchar y hablar, que es gratis. En iPhone el reconocimiento de voz puede fallar dentro de una web instalada: verifícalo y deja como respaldo un cuadro de texto para usar el dictado del teclado del iPhone.
- Rutina: una lista de tareas con hora y día de la semana. Debe permitir agregar una tarea ("agrega estudiar inglés a las 18:00"), tachar una hecha ("ya hice el gym"), quitar o cambiar una tarea, y decirme qué me toca ahora cruzando la hora y el día actual con la rutina. La rutina puede ser distinta según el día.
- Conversación: responder mis dudas del día a día con Gemini.
- Guardado: la rutina queda guardada en el propio celular (almacenamiento del navegador), sin servidor ni base de datos de pago. Incluir exportar e importar un respaldo para no perderla.

Las acciones sobre la rutina se hacen con function calling de la API de Gemini, apoyado en un intérprete de comandos simple para las órdenes más comunes (que además ahorra cuota gratuita). El modelo entiende lo que digo y llama a herramientas como agregar_tarea, tachar_tarea, quitar_tarea, ver_rutina y que_me_toca_ahora. La hora y fecha actuales (zona horaria de Chile) se le entregan en cada consulta.

## Versión 2: avisos

Que me avise por sí solo a la hora de cada tarea (notificaciones push de la PWA). Mi celular es un iPhone: verificar qué requisitos tienen hoy las notificaciones push de una PWA en iOS (por ejemplo, que esté instalada en la pantalla de inicio) y decirme qué es realista antes de prometer algo.

## Versión 3: activarlo diciendo "jarvis"

Que se active por voz sin tocar la pantalla. Es la parte más difícil:
- En iPhone la forma realista y gratis es un Atajo de Siri llamado "Jarvis": digo "Oye Siri, Jarvis", el atajo dicta lo que digo, consulta a Gemini y responde hablando. Constrúyelo y dame los pasos exactos para crearlo en la app Atajos.
- Escuchar siempre sin decir "Oye Siri" no es posible en una web en iPhone. No lo prometas.
- Investiga si el atajo puede abrir la página instalada y pasarle lo dictado.

## Versión 4: resumen de la mañana, memoria y visión
- Resumen de la mañana: la primera vez que lo abro en el día (o a la hora que yo elija), me saluda y me cuenta qué tengo en la rutina de hoy, el clima de mi ciudad y lo que quedó pendiente de ayer. Corto, por voz y en tono chileno. Para el clima usar una API gratuita (por ejemplo Open-Meteo, verificando sus condiciones de uso).
- Memoria: recuerda lo que le cuento y lo usa después (por ejemplo "mañana tengo prueba"). Guardar las notas en el propio celular y entregarle al modelo solo las relevantes en cada consulta. Debo poder pedirle que me diga qué recuerda y que olvide algo. No guardar claves ni datos sensibles sin que yo lo pida.
- Visión: poder sacarle una foto con la cámara del iPhone o subir una imagen para que la analice. Verifica que el modelo gratuito elegido acepte imágenes y reduce el tamaño antes de enviarla.

## Versión 5: agenda y correo
- Conectarlo a mi Google Calendar para ver mi agenda y crear eventos.
- Correo: solo si se puede hacer sin enviar el contenido completo de mis correos a un servicio que usa los datos del nivel gratuito para mejorar sus productos. Si no, dejarlo fuera.
- Permisos mínimos (solo lectura salvo que yo pida más), nunca enviar nada sin mi confirmación y credenciales fuera del repositorio.

## Versión 6: preparador físico

Que JARVIS sea mi preparador físico, con foco en lo que necesito como futbolista (mediocampista) que también va al gimnasio.
- Biblioteca de ejercicios, como un archivo de datos propio dentro de la app, no inventada por el modelo en el momento. Por cada ejercicio: músculo principal y músculos secundarios con un porcentaje aproximado de participación (por ejemplo 60% / 25% / 15%), equipo necesario, nivel, errores de técnica comunes y variantes más fáciles, más difíciles o con otro equipo. Basar los porcentajes en estudios de electromiografía publicados y avisar que son estimaciones orientativas, porque cambian según la técnica, el rango de movimiento y la persona. Si no hay una fuente razonable, decir "no tengo un dato confiable" en vez de inventar un número.
- Generador de rutinas según mi objetivo (rendimiento en fútbol, fuerza o masa muscular), cuántos días puedo entrenar, cuánto tiempo tengo, el equipo disponible y mi nivel. Que reparta los músculos durante la semana y deje días de descanso.
- Preparación específica de fútbol: resistencia, sprints repetidos, cambios de dirección, potencia, trabajo de core y prevención de lesiones (tobillo, rodilla, isquiotibiales), ajustada a mis días de partido y entrenamiento.
- Calentamiento y movilidad antes de cada sesión, y vuelta a la calma después.
- Registro de entrenamientos: series, repeticiones y peso, con historial, récords personales y sugerencia de progresión (cuándo subir peso o repeticiones). Guardado en el propio celular, con respaldo.
- Modo entrenamiento por voz, manos libres: "terminé la serie", "siguiente ejercicio" y un temporizador de descanso hablado.
- Cómo me siento: preguntarme por cansancio, dolor o sueño y ajustar la carga del día. Si cuento un dolor agudo o que no se va, recomendar que lo vea un kinesiólogo o un médico en vez de seguir entrenando.
- Revisión de técnica con foto o video corto, usando la visión de la versión 4, avisando que no reemplaza a un entrenador presencial.
- Progreso: peso corporal y medidas opcionales, con gráficos simples.
- Hábitos básicos: recordatorios de hidratación y sugerencias de comidas simples, sin dietas extremas ni cálculos que reemplacen a un nutricionista.
- Plan de la semana: que junte mis entrenamientos con la rutina diaria y mis horarios, y proponga en qué día y a qué hora entrenar sin chocar con lo que ya tengo. Si un día no puedo, que reacomode la semana.
- Resumen semanal: cada semana me cuenta cuántas sesiones hice, qué músculos trabajé más, qué récords rompí y qué me faltó, en tono chileno y corto, por voz.
- Descanso antes de partidos: cuando le anoto un partido importante, que me recuerde bajar la carga los días previos y me avise de descansar, hidratarme y dormir bien.

JARVIS no es médico ni reemplaza a un profesional de la salud, y debe decirlo cuando corresponda.

## Ideas para después de la versión 5

Ideas para sumar cuando lo básico ande. No construir nada de esto todavía:
- Controlar mi Mac (abrir apps, buscar archivos), con permisos y confirmaciones.
- Buscar información actual en internet.
- Recordatorios repetidos (todos los lunes, etc.).
- Controlar dispositivos de la casa.

## Calidad y pulido
- Interfaz cuidada, pensada primero para iPhone: modo oscuro con estilo de panel futurista inspirado en JARVIS (sin copiar logos ni material de las películas), respetando las zonas seguras de la pantalla y con buena instalación en la pantalla de inicio.
- Estados claros y visibles: escuchando, pensando, hablando y error, con una animación sutil mientras habla.
- Respuestas rápidas: mostrar el texto a medida que llega (streaming) y empezar a hablar apenas haya una frase completa.
- Errores amables, en el tono chileno de JARVIS, para casos como falta de internet, micrófono sin permiso o caída de la API. La página no debe romperse.
- Pruebas automáticas para la lógica de la rutina y de las herramientas.
- Accesible: botón grande, buen contraste y alternativa por texto.
- Costo bajo control: tope de tokens por respuesta y resumen de conversaciones largas para no gastar de más.

## Reglas y seguridad
- La clave de Gemini nunca se sube a GitHub ni queda en un repositorio público. Como la página corre en el celular, evalúa dos opciones y explícame el riesgo de cada una: pegar la clave yo mismo en un ajuste que se guarda solo en mi dispositivo, o usar un intermediario gratuito (por ejemplo Cloudflare Workers, verificando que siga siendo gratis).
- Acciones que cambian cosas importantes piden confirmación antes de hacerse: mandar mensajes a otras personas, borrar muchas tareas de golpe, gastar plata. Agregar o tachar una tarea no necesita confirmación.
- Manejar el límite gratuito: si se agota la cuota, mostrar un mensaje amable en vez de romperse.
- Proteger el acceso: si la página queda pública, cualquiera podría gastar mi cuota; usar una clave restringida y limitar quién puede usarla.

## Costos esperados

Objetivo: US$0 al usar el asistente (hosting gratis como GitHub Pages, la voz del navegador y de Apple, y Gemini en nivel gratuito). El único gasto es el plan Pro de Claude (unos US$20 al mes; verificar el precio actual) para construirlo con Claude Code, y se puede cancelar al terminar.

## Orden del proyecto
- Estructura de carpetas clara, separando servidor, página (frontend) y datos.
- Un README con qué es, cómo instalarlo, cómo correrlo y qué variables de entorno necesita, sin claves reales.
- Repositorio con Git, commits pequeños y con mensajes claros.
- Un archivo .env.example con los nombres de las variables; la clave real nunca se sube al repositorio.
- Código con nombres claros y comentarios solo donde hagan falta.
- Al final del README, una lista corta de pendientes (versión 2 y versión 3).

## Cómo quiero que trabajes
- Antes de escribir código, muéstrame un plan corto con la tecnología elegida (lenguaje, framework, dónde se guarda la rutina y dónde se publica) y por qué. Prefiere opciones simples y gratuitas.
- Construye todo el alcance por fases (versión 1, 2 y 3) y deja cada fase funcionando y probada de punta a punta antes de pasar a la siguiente.
- Explícame cómo correrlo en mi Mac para probarlo, cómo publicarlo gratis (por ejemplo en GitHub Pages), cómo instalarlo en la pantalla de inicio del iPhone y cómo crear el Atajo de Siri.
- Cuando termines, dime qué probar y qué quedó pendiente.
- Si algo del brief no es posible o hay una opción mejor, avísame en vez de hacerlo en silencio a tu manera.
