# App de vida con JARVIS: brief para Claude Code

> Brief principal. Si algo choca con `JARVIS.md`, manda este.

## Qué quiero construir

Una PWA (página web instalable en el iPhone) que sea el panel de control de mi vida: ver en un solo lugar cómo voy en dinero, metas, entrenamiento, fútbol, estudios y trabajo, con gráficos claros que muestren mi progreso. JARVIS va integrado para hacerlo todo más fácil: registrar cosas hablando, preguntarle cómo voy y recibir resúmenes.

Principios que mandan sobre todo lo demás:

1. Simple primero: alguien que la abre por primera vez no se pierde.
2. Lo importante al frente: el inicio responde "¿cómo voy?" en cinco segundos.
3. Tranquila y cara a la vista: se siente profesional y ordenada, sin ruido.
4. Rápida de usar: registrar un gasto o un entrenamiento toma menos de 10 segundos.
5. Gratis y privada: usarla cuesta US$0 y mis datos se quedan en mi dispositivo.

## Mi contexto

- Me llamo Diego. Mi celular es un iPhone y mi computador es un Mac.
- Voy a construirlo con Claude Code (plan Pro). No voy a pagar la API de Claude: el cerebro de JARVIS es Gemini en su nivel gratuito.
- Moneda: pesos chilenos, con formato $1.234.567 y sin decimales. Idioma: español de Chile.
- Ya hice una app propia con mi rutina diaria. Antes de construir, pídeme su código y revisa qué conviene reutilizar y qué rehacer.
- Existe otro documento, JARVIS: brief para Claude Code, con el detalle del asistente (personalidad chilena, voz, Atajo de Siri, preparador físico). Guárdalo en la carpeta como `JARVIS.md` y úsalo para el módulo de JARVIS. Si algo choca con este documento, manda este y me avisas.

## Diseño visual

Estilo premium, sobrio y minimalista: mucho espacio libre, números grandes, pocas cosas por pantalla, nada que distraiga.

- Tema oscuro por defecto, con opción de tema claro.
- Paleta propuesta (ajustable si encuentras algo mejor): fondo azul noche `#0B0F1A`, tarjetas `#131A2A`, bordes muy sutiles `#1F2937`, texto principal `#E8ECF4`, texto secundario `#8B95A7`. Acento principal verde esmeralda `#2DD4A7` para progreso e ingresos, dorado suave `#E5B567` para metas y detalles de lujo, rojo suave `#F0616D` para egresos y alertas, azul `#5B8DEF` para información neutra. Máximo un color de acento protagonista por pantalla.
- Tipografía: la fuente del sistema del iPhone o Inter, con cifras tabulares para que los números se alineen.
- Componentes: tarjetas con esquinas redondeadas (16 a 20 px), sombras muy suaves, íconos de línea con el mismo grosor en toda la app.
- Gráficos, cada uno con su función:
  - Barras para comparar (ingresos contra egresos por mes, gasto por categoría, minutos jugados).
  - Barras de progreso con porcentaje para metas y presupuestos.
  - Líneas para tendencias (ahorro acumulado, calificación por partido, peso, horas de estudio).
  - Anillos para lo completado del día o de la semana.
  - Un solo estilo para todos, con colores de significado fijo: verde a favor, rojo en contra, ámbar atención. Nunca depender solo del color: siempre etiqueta o ícono.
- iPhone primero: respetar las zonas seguras, botones táctiles de al menos 44 px, navegación abajo al alcance del pulgar, animaciones suaves y cortas, y respetar la opción de reducir movimiento.
- Accesible: buen contraste, textos legibles y alternativas de texto en los gráficos.

Antes de construir, muéstrame 2 o 3 maquetas de la pantalla de inicio (pueden ser HTML simples) para que yo elija el estilo.

## Navegación y facilidad de uso

- Barra inferior con 5 pestañas: Inicio, Dinero, Metas, Fútbol y Más. En Más van Estudios, Trabajo, Hábitos y bienestar, Calendario y Ajustes.
- Botón flotante de JARVIS visible en todas las pantallas.
- Botón "+" rápido para registrar un gasto, un ingreso, un entrenamiento, un partido o un hábito.
- Primera vez: bienvenida de máximo 3 pasos (qué quiero seguir, mes de inicio, listo), con datos de ejemplo opcionales que se borran con un toque.
- Estados vacíos con una frase simple y un botón claro, nunca una pantalla en blanco.
- Un solo camino para cada acción, textos cortos en español chileno y sin jerga financiera.
- Deshacer al borrar o tachar cualquier cosa.

## Pantalla de inicio

Debe mostrar lo más importante, en este orden, y caber casi sin scroll:

1. Saludo corto y qué me toca ahora, según mi rutina.
2. Dinero del mes: balance (ingresos menos egresos) en número grande, una barra de ingresos contra egresos y cuánto llevo del presupuesto.
3. Mis 3 metas principales, con barra de porcentaje y fecha.
4. Semana de entrenamiento: anillo o puntos por día, hechos y pendientes.
5. Fútbol: mi próximo partido o entrenamiento.
6. Pendientes de hoy de estudios y trabajo.
7. Una frase de JARVIS con lo más destacable (por ejemplo, "vas en 85% del presupuesto de comida y quedan 9 días").

Cada tarjeta lleva a su sección. Yo puedo elegir qué tarjetas ver y en qué orden.

También un indicador de equilibrio: una barra de 0 a 100 por área (dinero, metas, cuerpo, fútbol, estudios, trabajo) que compara lo que hice contra lo que me propuse. Debe explicarse cómo se calcula y no ser una nota sobre mi vida, solo una guía.

## Módulos

### Dinero

- Ingresos y egresos con categorías editables, fecha, nota y fuente de ingreso (sueldo, propinas, trabajos extra).
- Presupuesto mensual por categoría, con barra de avance y alertas suaves.
- Ahorro y metas de ahorro: barra de avance, aportes y un cálculo del tipo "a este ritmo llegas en X meses".
- Gastos fijos y suscripciones que se repiten solos.
- Gráficos: barras de ingresos contra egresos por mes, barras por categoría, línea de ahorro acumulado y comparación del mes actual con el anterior.
- Importar desde CSV movimientos de la cartola del banco, como algo opcional.
- Nunca conectar a bancos ni pedir claves bancarias o números de tarjeta.

### Metas y objetivos

- Cada meta tiene nombre, área, fecha límite y tipo: monto, cantidad, hábito o pasos.
- Barra de porcentaje y avance contra el tiempo que queda.
- Pueden alimentarse solas desde otros módulos (ahorro desde Dinero, sesiones desde Entrenamiento).
- Vista de qué me falta esta semana para cumplirlas.
- Revisión mensual: qué cumplí, qué no y qué cambio.

### Fútbol

- Mi perfil: posición (mediocampista), equipo y objetivos de la temporada.
- Calendario de partidos y entrenamientos, con rival, lugar, hora y resultado.
- Registro por partido: minutos jugados, goles, asistencias, pases, calificación propia de 1 a 10, qué hice bien y qué debo mejorar.
- Estadísticas con gráficos: línea de calificación por partido, barras de minutos, goles y asistencias por mes, y comparación entre temporadas.
- Preparación física: biblioteca de ejercicios con músculo principal y secundario (porcentajes orientativos, con fuentes), generador de rutinas, calentamiento, prevención de lesiones, registro de series y progresión, y modo de entrenamiento por voz. El detalle está en `JARVIS.md`, versión 6.
- Carga y descanso: cómo me siento, dolor y sueño, con ajuste de la carga antes de partidos importantes.
- Pruebas y clubes: seguimiento de pruebas y postulaciones con fecha, estado y contactos, y una lista de enlaces a mis mejores videos con notas. No subir videos pesados a la app.

### Estudios

- Materias o temas, horas de estudio por semana en barras, pendientes, fechas de pruebas o ensayos, resultados con línea de progreso y metas de puntaje.

### Trabajo

- Calendario de turnos y horas, horas trabajadas del mes en barras e ingresos asociados, conectados con Dinero.

### Hábitos y bienestar

- Hábitos diarios con racha, sueño, energía y ánimo del día con un toque, y agua. Diario corto opcional.

### Calendario unificado

- Una vista semanal que junte turnos, entrenamientos, partidos, estudios, rutina y metas, para que no se choquen.

## JARVIS integrado

Mismo asistente de `JARVIS.md` (personalidad chilena, saludo "Hola Diego", voz, Atajo de Siri "Oye Siri, Jarvis", Gemini gratis), ahora conectado a toda la app:

- Botón flotante en todas las pantallas para hablar o escribir.
- Registrar hablando: "gasté 5 mil en comida", "me pagaron 40 mil de propina", "hice gym", "metí un gol y una asistencia", "agrega una meta de ahorrar 200 mil para marzo". Siempre mostrar lo que entendió y pedir confirmación si hay duda, con deshacer fácil.
- Consultar: "¿cuánto llevo gastado este mes?", "¿cómo voy con mis metas?", "¿qué me toca hoy?".
- Resúmenes cortos y por voz: de la mañana, semanal y mensual.
- Consejos prácticos de ahorro y entrenamiento, en tono realista. No es asesor financiero ni médico y debe decirlo cuando corresponda.

Privacidad con el modelo gratuito: Gemini en su nivel gratis puede usar lo que recibe para mejorar productos de Google. Por eso:

- Los cálculos (totales, porcentajes, gráficos) se hacen en la app, no en el modelo.
- A Gemini se le envía solo lo mínimo: por ejemplo la frase que dije para interpretarla, o cifras resumidas. Nunca el historial completo de movimientos.
- Un ajuste de modo privado que apague el envío de datos de dinero al modelo.
- Explícame con claridad qué se envía en cada función.

## Datos y seguridad

- Primero local: todo se guarda en el dispositivo (por ejemplo IndexedDB), sin servidor y sin costo.
- Riesgo real: puedo perder el celular o el navegador puede borrar datos. Incluir exportar e importar respaldo (JSON y CSV) y un recordatorio de respaldo cada cierto tiempo. Verifica cómo trata iOS el almacenamiento de las apps instaladas en la pantalla de inicio.
- Más adelante, evaluar una sincronización gratuita entre dispositivos, verificando qué opciones gratis existen en ese momento.
- Bloqueo con PIN al abrir la app.
- La clave de Gemini nunca se sube a GitHub ni queda en un repositorio público.

## Fases de construcción

Construye en este orden y deja cada fase funcionando y probada antes de pasar a la siguiente:

- Fase 0, fundamentos: sistema de diseño (colores, tipografía, componentes), navegación, almacenamiento, respaldo, instalación como PWA y bienvenida.
- Fase 1, Inicio y Dinero.
- Fase 2, Metas, Trabajo y Estudios.
- Fase 3, Fútbol y Entrenamiento: partidos, estadísticas, pruebas y clubes, preparación física.
- Fase 4, JARVIS integrado: chat y voz dentro de la app, registro por voz y Atajo de Siri.
- Fase 5, hábitos, calendario unificado y resúmenes.
- Fase 6, pulido final: rendimiento, accesibilidad y pruebas.

## Calidad

- Abrir en menos de 2 segundos y moverse con fluidez.
- Pruebas automáticas de todos los cálculos de dinero, metas y fechas: son números y no pueden fallar.
- Errores amables, sin que la app se rompa.
- Código ordenado, carpetas claras, un `README`, Git con commits pequeños y una clave de ejemplo en `.env.example`.

## Costos

Objetivo: US$0 al usarla (hosting gratis como GitHub Pages, voz del navegador y de Apple, Gemini gratis). El único gasto es el plan Pro de Claude para construirla, que se puede cancelar al terminar. Verifica los precios y límites vigentes.

## Ideas para después

- Rueda de la vida: un gráfico de radar con el equilibrio entre áreas.
- Mi año en números: resumen anual con lo que logré.
- Logros y rachas, sutiles y sin infantilizar.
- Notificaciones push (verificar qué permite iOS en apps web instaladas).
- Simulador de metas: "si ahorro tanto por mes, llego en tanto".
- Lista de compras, cumpleaños y fechas importantes.
- Modo semana difícil: baja las exigencias cuando estoy cansado o con poca plata.

## Cómo quiero que trabajes

1. Lee `JARVIS.md` y el código de mi app de rutina actual.
2. Antes de escribir código, muéstrame un plan corto: tecnología (librería de gráficos liviana y gratuita), estructura de los datos, sistema de diseño y las maquetas del inicio para que yo elija.
3. Construye por fases, probando cada una.
4. Explícame cómo correrlo en mi Mac, publicarlo gratis e instalarlo en la pantalla de inicio del iPhone.
5. Si algo del brief no es posible o hay una opción mejor, avísame en vez de hacerlo en silencio a tu manera.
