import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

export type WhisperRuntime = {
  whisperBinary: string;
  modelPath: string;
};

const PACKAGED_RUNTIME_ROOTS = process.resourcesPath
  ? [
      path.join(process.resourcesPath, 'whisper', 'bin'),
      path.join(process.resourcesPath, 'ffmpeg', 'bin'),
      path.join(process.resourcesPath, 'whisper')
    ]
  : [];

const SEARCH_ROOTS = [
  ...PACKAGED_RUNTIME_ROOTS,
  process.cwd(),
  path.resolve(process.cwd(), 'bin'),
  path.resolve(process.cwd(), 'tools'),
  path.resolve(process.cwd(), 'vendor'),
  path.resolve(process.cwd(), 'build'),
  path.resolve(process.cwd(), 'build', 'bin'),
  path.resolve(process.cwd(), 'build', 'bin', 'Release'),
  path.resolve(process.cwd(), 'build', 'Release'),
  path.join(os.homedir(), 'whisper'),
  path.join(os.homedir(), 'AppData', 'Local', 'whisper'),
  'C:\\tools\\whisper',
  'C:\\whisper',
  'C:\\Program Files\\whisper',
  'C:\\Program Files\\Whisper'
];

export async function findExecutable(executableNames: string[], searchRoots: string[] = SEARCH_ROOTS): Promise<string | null> {
  const executableFiles: string[] = [];
  for (const name of executableNames) {
    executableFiles.push(name, `${name}.exe`);
  }

  const candidates = [...executableFiles];
  for (const root of searchRoots) {
    for (const executableFile of executableFiles) {
      candidates.push(path.join(root, executableFile));
    }
  }

  const envEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const entry of envEntries) {
    for (const executableFile of executableFiles) {
      candidates.push(path.join(entry, executableFile));
    }
  }

  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    try {
      await fs.promises.access(candidate);
      return candidate;
    } catch {
      // Continuamos buscando una ruta válida.
    }
  }

  return null;
}

function getModelCandidates(): string[] {
  return [
    'ggml-large-v3-turbo.bin',
    'ggml-large-v3.bin',
    'ggml-medium.bin',
    'ggml-base.bin',
    'ggml-small.bin',
    'ggml-tiny.bin'
  ];
}

async function findFirstExistingFile(fileNames: string[], searchRoots: string[] = SEARCH_ROOTS): Promise<string | null> {
  const candidateDirectories = new Set<string>();

  for (const root of searchRoots) {
    candidateDirectories.add(root);
    candidateDirectories.add(path.join(root, 'models'));
    candidateDirectories.add(path.join(root, 'bin', 'models'));
    candidateDirectories.add(path.join(root, 'tools', 'models'));
    candidateDirectories.add(path.join(root, 'vendor', 'models'));
  }

  for (const directory of candidateDirectories) {
    for (const fileName of fileNames) {
      const fullPath = path.join(directory, fileName);
      try {
        await fs.promises.access(fullPath);
        return fullPath;
      } catch {
        // Continuamos buscando.
      }
    }
  }

  return null;
}

export async function detectWhisperRuntime(): Promise<WhisperRuntime | null> {
  const whisperBinary = await findExecutable(['whisper-cli', 'whisper', 'main'], SEARCH_ROOTS);
  if (!whisperBinary) {
    return null;
  }

  const modelPath = await findFirstExistingFile(getModelCandidates(), SEARCH_ROOTS);
  if (!modelPath) {
    return null;
  }

  return { whisperBinary, modelPath };
}

export async function probeVideoDuration(filePath: string): Promise<number | null> {
  const ffprobePath = await findExecutable(['ffprobe'], SEARCH_ROOTS);
  if (!ffprobePath) {
    return null;
  }

  return await new Promise<number | null>((resolve) => {
    const child = spawn(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      const parsed = Number.parseFloat(output.trim());
      resolve(Number.isFinite(parsed) ? parsed : null);
    });
  });
}

export async function runWhisperTranscription({
  whisperBinary,
  modelPath,
  audioPath,
  language,
  onProgress,
  shouldCancel,
  onProcessCreated
}: {
  whisperBinary: string;
  modelPath: string;
  audioPath: string;
  language: string;
  onProgress?: (payload: { stage: string; percent: number; message: string }) => void;
  shouldCancel?: () => boolean;
  onProcessCreated?: (child: ChildProcess) => void;
}): Promise<{ transcript: string; outputPath: string }> {
  const outputDir = path.join(os.tmpdir(), 'transcripcionlocal', `whisper-${Date.now()}`);
  await fs.promises.mkdir(outputDir, { recursive: true });

  const fileBaseName = path.basename(audioPath, path.extname(audioPath));
  const child: ChildProcess = spawn(
    whisperBinary,
    ['-m', modelPath, '-f', audioPath, '-l', language, '-otxt', '-of', path.join(outputDir, fileBaseName)],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  onProcessCreated?.(child);

  let combinedOutput = '';
  child.stdout?.on('data', (chunk) => {
    combinedOutput += chunk.toString();
  });

  child.stderr?.on('data', (chunk) => {
    combinedOutput += chunk.toString();
    if (onProgress) {
      onProgress({
        stage: 'transcribiendo',
        percent: 72,
        message: 'Whisper.cpp está procesando el audio en local.'
      });
    }
  });

  return await new Promise<{ transcript: string; outputPath: string }>((resolve, reject) => {
    child.on('error', (error) => reject(error));

    child.on('close', async (code) => {
      if (shouldCancel?.()) {
        reject(new Error('La transcripción fue cancelada por el usuario.'));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Whisper.cpp falló con código ${code}. Salida: ${combinedOutput.slice(-400)}`));
        return;
      }

      try {
        const files = await fs.promises.readdir(outputDir);
        const transcriptFile = files.find((file) => file.startsWith(`${fileBaseName}.`) && file.toLowerCase().endsWith('.txt'));

        if (!transcriptFile) {
          reject(new Error('Whisper.cpp terminó sin generar el archivo de texto esperado.'));
          return;
        }

        const finalFilePath = path.join(outputDir, transcriptFile);
        const transcript = await fs.promises.readFile(finalFilePath, 'utf8');

        resolve({
          transcript,
          outputPath: finalFilePath
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error('No se pudo leer la salida generada por Whisper.cpp.'));
      }
    });
  });
}
