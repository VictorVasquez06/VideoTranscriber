# VideoTranscriber

Aplicación desktop local para transcribir audio de reuniones a partir de un video MP4 o WMV, con procesamiento offline y sin subir archivos a servicios externos.

## Instalar la aplicación

Descarga `VideoTranscriber-Setup-2.0.1.exe` desde la release privada `v2.0.1` y ejecútalo. El instalador incluye la aplicación, FFmpeg/FFprobe, Whisper.cpp, las DLL de Visual C++ necesarias y el modelo `ggml-base.bin`. No requiere Node.js ni conexión a Internet para transcribir.

## Crear el instalador desde el código fuente

Requisitos del equipo de build:

- Windows 10/11 x64 y Node.js LTS
- FFmpeg/FFprobe disponibles en PATH
- `whisper-cli.exe` y sus DLL en `%USERPROFILE%\whisper\`
- `ggml-base.bin` en `%USERPROFILE%\whisper\models\`

Ejecuta desde la raíz del proyecto:

```powershell
npm install
npm run dist:win
```

El instalador NSIS se genera en `release/VideoTranscriber-Setup-2.0.1.exe` y permite elegir la carpeta de instalación.

## Ejecutar desde el código fuente

```powershell
npm install
npm run dev
```

## Verificación del entorno

```powershell
node scripts/check-environment.js
```

El comando mostrará si falta FFmpeg, FFprobe, Whisper.cpp o el modelo local.

## Licencias de terceros

El instalador incluye el build compartido FFmpeg 9.0.2 de Gyan (GPLv3), Whisper.cpp (MIT), el modelo multilingüe `ggml-base.bin` y los redistribuibles de Microsoft Visual C++. Las licencias y referencias a las fuentes están en `resources/licenses` dentro de la instalación.

## Consideraciones de seguridad

- La aplicación se ejecuta con `contextIsolation` activo.
- El renderer no tiene `nodeIntegration`.
- La transcripción se hace en proceso principal y la ejecución del motor local se controla con argumentos explícitos, sin interpolación de shell.
