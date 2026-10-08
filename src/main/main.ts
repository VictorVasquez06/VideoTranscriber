import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { IPC_CHANNELS, type FileSelectionResult, type ProgressEvent, type SaveTranscriptRequest, type SaveTranscriptResponse, type TranscriptionRequest, type TranscriptionResponse } from '../shared/ipc';
import { detectWhisperRuntime, findExecutable, probeVideoDuration, runWhisperTranscription } from './whisper-runtime';

let mainWindow: BrowserWindow | null = null;
let currentJobCancelled = false;
let activeWhisperProcess: ChildProcess | null = null;
const tempArtifactPaths = new Set<string>();

async function cleanupTempArtifacts(): Promise<void> {
  const entries = [...tempArtifactPaths];
  for (const entry of entries) {
    try {
      await fs.promises.rm(entry, { recursive: true, force: true });
    } catch {
      // Ignoramos errores de limpieza de artefactos temporales.
    } finally {
      tempArtifactPaths.delete(entry);
    }
  }
}

function registerTemporaryFile(filePath: string): void {
  if (filePath) {
    tempArtifactPaths.add(filePath);
  }
}

function emitProgress(payload: ProgressEvent): void {
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.TRANSCRIPTION_PROGRESS, payload);
  }
}

function emitResult(payload: TranscriptionResponse): void {
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.TRANSCRIPTION_RESULT, payload);
  }
}

function emitError(error: string): void {
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.TRANSCRIPTION_ERROR, { error });
  }
}

function getRendererPath(): string {
  return path.resolve(__dirname, '..', 'renderer', 'index.html');
}

async function validateVideoFile(filePath: string): Promise<{ ok: boolean; error?: string }> {
  if (!filePath) {
    return { ok: false, error: 'No se recibió ninguna ruta de archivo.' };
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      return { ok: false, error: 'La ruta seleccionada no es un archivo válido.' };
    }

    if (stat.size <= 0) {
      return { ok: false, error: 'El archivo seleccionado está vacío.' };
    }

    const extension = path.extname(filePath).toLowerCase();
    if (!['.mp4', '.wmv'].includes(extension)) {
      return { ok: false, error: 'El archivo debe tener extensión MP4 o WMV.' };
    }
  } catch {
    return { ok: false, error: 'El archivo no existe o no se puede leer.' };
  }

  return { ok: true };
}

async function probeMedia(filePath: string): Promise<{ ok: boolean; duration: number | null; hasAudio: boolean; error?: string }> {
  const ffprobePath = await findExecutable(['ffprobe']);
  if (!ffprobePath) {
    return { ok: false, duration: null, hasAudio: false, error: 'FFprobe no está disponible en este equipo.' };
  }

  return await new Promise<{ ok: boolean; duration: number | null; hasAudio: boolean; error?: string }>((resolve) => {
    const child = spawn(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('error', () => {
      resolve({ ok: false, duration: null, hasAudio: false, error: 'No se pudo leer la información del video.' });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: false, duration: null, hasAudio: false, error: 'FFprobe no pudo leer este archivo de video.' });
        return;
      }

      try {
        const parsed = JSON.parse(output || '{}') as { streams?: Array<{ codec_type?: string }>; format?: { duration?: string } };
        const streams = parsed.streams ?? [];
        const hasAudio = streams.some((stream) => stream.codec_type === 'audio');
        const duration = parsed.format?.duration ? Number.parseFloat(parsed.format.duration) : null;
        resolve({
          ok: hasAudio,
          duration: Number.isFinite(duration) ? duration : null,
          hasAudio,
          error: hasAudio ? undefined : 'No se encontró una pista de audio válida en el archivo.'
        });
      } catch {
        resolve({ ok: false, duration: null, hasAudio: false, error: 'La información del video no tiene un formato válido.' });
      }
    });
  });
}

async function runFfmpegExtraction(inputPath: string, outputPath: string): Promise<void> {
  const ffmpegPath = await findExecutable(['ffmpeg']);
  if (!ffmpegPath) {
    throw new Error('FFmpeg no está instalado o no se encuentra en PATH.');
  }

  const mediaInfo = await probeMedia(inputPath);
  if (!mediaInfo.hasAudio) {
    throw new Error(mediaInfo.error ?? 'El archivo no contiene una pista de audio válida para transcribir.');
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      [
        '-y',
        '-i',
        inputPath,
        '-map',
        '0:a:0',
        '-vn',
        '-acodec',
        'pcm_s16le',
        '-ar',
        '16000',
        '-ac',
        '1',
        outputPath
      ],
      { stdio: 'ignore' }
    );

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg terminó con código ${code}.`));
      }
    });
  });
}

async function createWindows(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#0f172a',
    title: 'VideoTranscriber',
    webPreferences: {
      preload: path.resolve(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadFile(getRendererPath());
  if (process.env.TRANSCRIPCION_DEBUG === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

ipcMain.handle(IPC_CHANNELS.OPEN_FILE_DIALOG, async (): Promise<FileSelectionResult> => {
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, {
        title: 'Selecciona un video',
        properties: ['openFile'],
        filters: [{ name: 'Videos soportados', extensions: ['mp4', 'wmv'] }]
      })
    : await dialog.showOpenDialog({
        title: 'Selecciona un video',
        properties: ['openFile'],
        filters: [{ name: 'Videos soportados', extensions: ['mp4', 'wmv'] }]
      });

  if (result.canceled || !result.filePaths.length) {
    return { ok: false, error: 'No se seleccionó ningún archivo.' };
  }

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const fileExt = path.extname(filePath).toLowerCase();

  return { ok: true, filePath, fileName, fileExt };
});

ipcMain.handle(IPC_CHANNELS.SAVE_TRANSCRIPT, async (_event, payload: SaveTranscriptRequest): Promise<SaveTranscriptResponse> => {
  if (typeof payload?.transcript !== 'string' || !payload.transcript.trim()) {
    return { ok: false, error: 'No hay una transcripción para guardar.' };
  }

  const options = {
    title: 'Guardar transcripción',
    defaultPath: path.basename(payload.fileName || 'transcripcion.txt'),
    filters: [{ name: 'Archivo de texto', extensions: ['txt'] }]
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }

  try {
    await fs.promises.writeFile(result.filePath, payload.transcript, 'utf8');
    return { ok: true, outputPath: result.filePath };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se pudo guardar el archivo de transcripción.'
    };
  }
});

ipcMain.handle(IPC_CHANNELS.CANCEL_TRANSCRIPTION, async (): Promise<void> => {
  currentJobCancelled = true;
  if (activeWhisperProcess && !activeWhisperProcess.killed) {
    activeWhisperProcess.kill('SIGTERM');
  }

  emitProgress({
    stage: 'cancelado',
    percent: 0,
    message: 'Se solicita cancelar la transcripción.'
  });
});

ipcMain.handle(IPC_CHANNELS.START_TRANSCRIPTION, async (_event, payload: TranscriptionRequest): Promise<TranscriptionResponse> => {
  currentJobCancelled = false;
  activeWhisperProcess = null;

  const validation = await validateVideoFile(payload.filePath);
  if (!validation.ok) {
    emitError(validation.error ?? 'El archivo seleccionado no es válido.');
    return { ok: false, error: validation.error ?? 'El archivo seleccionado no es válido.' };
  }

  emitProgress({
    stage: 'validacion',
    percent: 5,
    message: 'Validando archivo y metadatos del video.'
  });

  const videoDuration = await probeVideoDuration(payload.filePath);
  if (videoDuration && videoDuration > 0) {
    emitProgress({
      stage: 'validacion',
      percent: 12,
      message: `Duración detectada: ${videoDuration.toFixed(1)} segundos.`
    });
  }

  const ffmpegPath = await findExecutable(['ffmpeg']);
  if (!ffmpegPath) {
    const errorMessage = 'FFmpeg no está disponible en este equipo. Instálalo y vuelve a intentarlo.';
    emitError(errorMessage);
    return { ok: false, error: errorMessage };
  }

  const tempDir = path.join(os.tmpdir(), 'transcripcionlocal');
  await fs.promises.mkdir(tempDir, { recursive: true });
  const audioFilePath = path.join(tempDir, `${Date.now()}-audio.wav`);  registerTemporaryFile(audioFilePath);
  emitProgress({
    stage: 'extraccion',
    percent: 20,
    message: 'Extrayendo audio del video para el motor local.'
  });

  try {
    await runFfmpegExtraction(payload.filePath, audioFilePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo extraer el audio del video.';
    emitError(message);
    return { ok: false, error: message };
  }

  if (currentJobCancelled) {
    try {
      await fs.promises.rm(audioFilePath, { force: true });
      tempArtifactPaths.delete(audioFilePath);
    } catch {
      // Ignoramos errores de limpieza durante la cancelación.
    }

    emitError('La transcripción fue cancelada por el usuario.');
    return { ok: false, error: 'La transcripción fue cancelada por el usuario.' };
  }

  const runtime = await detectWhisperRuntime();
  if (!runtime) {
    const message = 'No se encontró Whisper.cpp ni el modelo local necesario. Descárgalos en la carpeta bin/models o en un PATH accesible.';
    emitProgress({
      stage: 'modelo',
      percent: 80,
      message: 'Falta el motor Whisper.cpp o el modelo de idioma.'
    });
    emitError(message);
    return { ok: false, error: message };
  }

  emitProgress({
    stage: 'transcribiendo',
    percent: 65,
    message: 'Whisper.cpp está transcribiendo el audio localmente.'
  });

  try {
    const whisperResult = await runWhisperTranscription({
      whisperBinary: runtime.whisperBinary,
      modelPath: runtime.modelPath,
      audioPath: audioFilePath,
      language: payload.language || 'es',
      onProgress: (progress) => emitProgress({
        ...progress,
        percent: Math.max(65, Math.min(98, progress.percent))
      }),
      shouldCancel: () => currentJobCancelled,
      onProcessCreated: (child) => {
        activeWhisperProcess = child;
      }
    });

    emitProgress({
      stage: 'finalizado',
      percent: 100,
      message: 'Transcripción completada. Elige dónde guardar el archivo.'
    });

    const response: TranscriptionResponse = {
      ok: true,
      transcript: whisperResult.transcript
    };

    emitResult(response);

    try {
      await fs.promises.rm(audioFilePath, { force: true });
      tempArtifactPaths.delete(audioFilePath);
      await fs.promises.rm(path.dirname(whisperResult.outputPath), { recursive: true, force: true });
      tempArtifactPaths.delete(path.dirname(whisperResult.outputPath));
    } catch {
      // Ignoramos errores de limpieza de temporales para mantener la UX estable.
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'La transcripción falló sin un mensaje adicional.';
    emitError(message);
    return { ok: false, error: message };
  }
});

app.on('ready', async () => {
  await createWindows();
});

app.on('before-quit', async () => {
  await cleanupTempArtifacts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindows();
  }
});
