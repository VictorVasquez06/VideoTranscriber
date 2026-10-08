# VideoTranscriber

Aplicación desktop local para transcribir audio de reuniones a partir de un video MP4 o WMV, con procesamiento offline y sin subir archivos a servicios externos.

## Requisitos

- Windows 10 o 11 (x64)
- Node.js LTS
- FFmpeg y FFprobe instalados en PATH
- Whisper.cpp compilado localmente siguiendo la referencia oficial del repositorio: https://github.com/ggml-org/whisper.cpp/tree/sync-ggml-26-07-30
- Un modelo local de Whisper compatible (por ejemplo, ggml-base.bin o ggml-small.bin)

## Instalación

1. Instala Node.js LTS.
2. Instala FFmpeg y asegúrate de que ffmpeg.exe y ffprobe.exe queden en PATH.
3. Clona la referencia recomendada de Whisper.cpp:

```powershell
git clone --branch sync-ggml-26-07-30 --depth 1 https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
```

4. Compila el binario en Windows según la guía del proyecto y genera whisper.exe.
5. Descarga o coloca el modelo local en una de estas rutas:
   - bin/
   - tools/
   - bin/models/
   - tools/models/
   - build/bin/
   - build/bin/Release/
   - %USERPROFILE%\whisper\
6. Ejecuta:

```powershell
npm install
npm run build
npm start
```

## Verificación del entorno

```powershell
node scripts/check-environment.js
```

El comando mostrará si falta FFmpeg, FFprobe, Whisper.cpp o el modelo local.

## Rutas de Whisper.cpp que esta app busca

La detección actual del proyecto contempla rutas típicas del build de whisper.cpp, por ejemplo:
- build/bin/whisper.exe
- build/bin/Release/whisper.exe
- build/Release/whisper.exe
- bin/whisper.exe
- tools/whisper.exe
- %USERPROFILE%\whisper\

Esto permite que la app reconozca el binario sin depender de un PATH global manual.

## Modelo recomendado para MVP

Para una primera versión estable en español, lo recomendado es probar con un modelo pequeño o base de Whisper.cpp y validar rendimiento real en el hardware objetivo antes de decidir el modelo definitivo.

## Consideraciones de seguridad

- La aplicación se ejecuta con `contextIsolation` activo.
- El renderer no tiene `nodeIntegration`.
- La transcripción se hace en proceso principal y la ejecución del motor local se controla con argumentos explícitos, sin interpolación de shell.
