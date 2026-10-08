# Plan de desarrollo: VideoTranscriber

## Objetivo

Crear una aplicacion de escritorio para Windows que permita seleccionar un video MP4 o WMV, transcribir el audio de una reunion, mostrar el avance de forma comprensible y exportar la transcripcion a un archivo de texto. La primera version prioriza procesamiento local y no requiere subir el video a un servicio externo.

## Alcance del MVP

- Seleccionar un archivo MP4 o WMV desde el equipo.
- Validar formato, existencia, legibilidad y duracion del archivo.
- Extraer y convertir el audio a un formato compatible con el motor de reconocimiento.
- Transcribir en espanol, con seleccion de idioma cuando sea viable.
- Mostrar estado, porcentaje, tiempo procesado y errores recuperables.
- Permitir cancelar el trabajo sin bloquear la interfaz.
- Exportar TXT con marcas de tiempo; dejar SRT como formato adicional del MVP si el motor entrega segmentos temporizados de forma fiable.
- Funcionar sin conexion una vez descargados los componentes y modelos requeridos.

## Fuera del alcance inicial

- Identificar nominalmente a las personas que hablan.
- Resumen automatico, traduccion, notas o envio por correo.
- Procesamiento en la nube o gestion de claves de API.
- Edicion colaborativa o sincronizacion entre equipos.

**Nota sobre voces:** reconocer las palabras habladas no es lo mismo que separar a los participantes. La diarizacion (por ejemplo, «Participante 1» y «Participante 2») debe tratarse como una capacidad posterior, con pruebas propias y una decision explicita sobre el modelo a utilizar.

## Arquitectura propuesta

- **Aplicacion de escritorio:** Electron con interfaz web sencilla y proceso principal separado del renderer. Mantener el acceso al sistema de archivos y la ejecucion de procesos fuera del renderer.
- **Extraccion de audio:** FFmpeg, invocado como proceso hijo. Comprobar su licencia, forma de distribucion y empaquetado antes de incluir binarios en el instalador.
- **Reconocimiento de voz:** evaluar `whisper.cpp` como primera opcion offline. Confirmar compatibilidad del modelo, calidad en espanol, rendimiento en el hardware objetivo, memoria necesaria y licencia antes de fijar la dependencia.
- **Progreso:** procesar el audio en segmentos secuenciales. Calcular el avance de transcripcion como duracion de audio completada / duracion total. Mostrar por separado la etapa de preparacion, la transcripcion, la finalizacion y la exportacion. No simular progreso durante una operacion que no informe avance.
- **Datos:** guardar resultados localmente, con eleccion del usuario para la carpeta de salida. No conservar audio temporal una vez finalizado o cancelado el trabajo, salvo que sea necesario para recuperacion y se informe claramente.
- **Reutilizacion del proyecto fuente:** revisar `utils/srt.js` y las funciones de formato de `utils/openai-api.js` como referencia. No importar directamente el flujo de extension ni sus llamadas `chrome.*`; la nueva aplicacion tendra un ciclo de vida y permisos distintos.

## Fases de desarrollo

### Fase 0: decisiones y prueba tecnica

1. Confirmar que «local» significa que el video y el audio no salen del equipo.
2. Definir sistema objetivo (Windows 10/11), arquitectura x64 y requisitos minimos de RAM/CPU; decidir si se necesita soporte GPU.
3. Probar FFmpeg con archivos MP4 y WMV representativos, incluidos videos largos y con distintas pistas de audio.
4. Comparar uno o dos modelos offline de reconocimiento en espanol con muestras reales: precision, velocidad, memoria y licencia.
5. Fijar formatos de salida, comportamiento de marcas de tiempo y politica para archivos temporales.

**Criterio de salida:** una prueba local convierte ambos formatos y transcribe una muestra en espanol con calidad y rendimiento aceptables en el equipo objetivo.

### Fase 1: esqueleto de la aplicacion

1. Crear el proyecto Electron, scripts de desarrollo y empaquetado para Windows.
2. Implementar una ventana principal con seleccion de archivo, idioma, boton de iniciar/cancelar y area de estado.
3. Definir una API pequena entre renderer y proceso principal mediante IPC validado; exponer solo las operaciones necesarias.
4. Configurar formato, lint y pruebas automatizadas basicas.

**Criterio de salida:** la aplicacion inicia, selecciona un archivo y comunica errores sin bloquear la interfaz.

### Fase 2: inspeccion y preparacion del video

1. Validar extension y contenido real del archivo; no confiar unicamente en el nombre.
2. Obtener duracion y metadatos con FFmpeg/ffprobe.
3. Extraer una pista de audio mono a la frecuencia recomendada por el modelo.
4. Gestionar rutas con espacios, caracteres Unicode, permisos insuficientes, falta de espacio y videos sin pista de audio.
5. Crear y limpiar archivos temporales con seguridad, incluso al cancelar o cerrar la aplicacion.

**Criterio de salida:** MP4 y WMV validos producen audio de trabajo, y los casos invalidos muestran mensajes accionables.

### Fase 3: motor de transcripcion y progreso

1. Integrar el motor offline elegido desde el proceso principal, con argumentos controlados y sin shell interpolation.
2. Dividir el audio en segmentos de duracion configurable, conservando offsets para recomponer marcas de tiempo correctas.
3. Ejecutar un segmento a la vez inicialmente para controlar memoria y facilitar cancelacion.
4. Emitir eventos de progreso con etapa, segmento actual, total de segmentos y porcentaje basado en duracion de audio completada.
5. Mostrar estado indeterminado solo durante tareas cuya duracion no se pueda calcular (por ejemplo, carga inicial del modelo).
6. Permitir cancelar; terminar el proceso hijo y limpiar temporales sin perder una transcripcion parcial cuando esta sea valida.
7. Manejar errores de modelo ausente, modelo incompatible, proceso interrumpido y salida malformada.

**Criterio de salida:** el progreso avanza de forma monotona, termina en 100% solo al completar el trabajo y la interfaz sigue respondiendo durante la transcripcion.

### Fase 4: resultado y exportacion

1. Presentar el texto completo en una vista legible y permitir copiarlo.
2. Exportar TXT con nombre derivado del video, idioma y marcas de tiempo configurables.
3. Agregar exportacion SRT si los segmentos y offsets pasan las pruebas de sincronizacion.
4. Permitir elegir destino y confirmar sobrescritura de archivos.
5. Comprobar que cancelaciones o fallos no generen un archivo final que parezca completo.

**Criterio de salida:** TXT (y SRT, si se incluye) se abre correctamente y conserva orden, acentos y tiempos.

### Fase 5: endurecimiento, pruebas y distribucion

1. Probar videos cortos, largos, sin audio, corruptos, con audio de bajo volumen y con varias pistas.
2. Verificar cancelacion, cierre durante un trabajo, recuperacion de errores y limpieza de temporales.
3. Probar interfaz con archivos de gran duracion y revisar consumo de CPU/RAM.
4. Revisar seguridad de Electron: `contextIsolation` activo, `nodeIntegration` desactivado en renderer, IPC con validacion de origen y argumentos, y sin ejecucion de comandos construidos con entrada del usuario.
5. Documentar instalacion, modelos requeridos, espacio en disco, privacidad y limitaciones conocidas.
6. Crear instalador Windows y probar instalacion/ejecucion en una maquina limpia.

**Criterio de salida:** instalador reproducible, flujo principal validado y documentacion suficiente para instalar y usar sin asistencia.

## Criterios de aceptacion del MVP

- El usuario puede elegir un MP4 o WMV local y comenzar la transcripcion.
- La interfaz muestra claramente la etapa actual y un porcentaje coherente con el audio procesado.
- La ventana permanece utilizable y la tarea se puede cancelar.
- Se obtiene una transcripcion en espanol y se puede guardar como TXT.
- El flujo no envia video, audio ni transcripcion a internet.
- Los errores de formato, pista de audio, modelo o permisos se presentan de forma comprensible.
- Los temporales se limpian al completar, cancelar o fallar, salvo que el usuario elija conservarlos.

## Riesgos y decisiones pendientes

- **Rendimiento:** la transcripcion offline puede tardar mas que la duracion del video, especialmente en CPU. Medir en hardware real antes de prometer tiempos.
- **Calidad:** ruido, voces superpuestas y acentos reducen la precision; definir muestras representativas para evaluar modelos.
- **WMV:** algunos contenedores o codecs pueden no ser compatibles con el binario FFmpeg empaquetado; comprobar los archivos objetivo.
- **Progreso:** el porcentaje refleja audio ya transcrito, no una estimacion de calidad ni el trabajo interno exacto del modelo.
- **Tiempos:** los offsets de segmentos deben compensar correctamente el recorte de audio para evitar marcas de tiempo desplazadas.
- **Diarizacion:** decidir despues del MVP si es necesaria y si debe ser completamente offline.
- **Distribucion/licencias:** revisar las licencias de Electron, FFmpeg, el motor y los modelos, y definir como se distribuyen.

## Orden recomendado para ejecutar el plan

1. Completar la Fase 0 antes de implementar la interfaz completa.
2. Registrar en este documento las decisiones tecnicas y los resultados de las pruebas.
3. Implementar una fase a la vez y comprobar su criterio de salida antes de avanzar.
4. Mantener los archivos fuente de la extension sin cambios; desarrollar la aplicacion en esta carpeta.
5. Al iniciar el trabajo en esta ruta, revisar este plan y convertir las fases en tareas concretas del repositorio.

## Decisiones adoptadas en esta ejecucion

- Sistema objetivo: Windows 10/11, arquitectura x64.
- Stack base: Electron + TypeScript con IPC entre proceso principal y renderer.
- Motor principal propuesto: Whisper.cpp, con evaluacion comparativa frente a alternativas de rendimiento como Faster-Whisper y decision final guiada por la prioridad de calidad en espanol.
- Entorno de desarrollo: proyecto funcional en esta carpeta, con flujo base de seleccion de archivo, validacion, control de progreso y exportacion local de salida.
- Estado actual del MVP: se ha inicializado la estructura base y la compilacion pasa en esta sesion, quedando pendiente la integracion final del motor real y la limpieza de casos de uso avanzados de Fase 2 en adelante.
