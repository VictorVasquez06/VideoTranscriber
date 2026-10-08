const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const runtimeRoot = path.join(projectRoot, 'packaging', 'runtime');
const expectedBaseModelSha256 = '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe';
const modelFileName = 'ggml-base.bin';
const msvcRuntimeFiles = [
  'vcruntime140.dll',
  'vcruntime140_1.dll',
  'msvcp140.dll',
  'msvcp140_1.dll',
  'msvcp140_2.dll',
  'concrt140.dll'
];

function executableFromPath(executableName) {
  const result = spawnSync('where.exe', [executableName], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || !result.stdout) {
    return null;
  }

  return result.stdout.split(/\r?\n/).map((entry) => entry.trim()).find(Boolean) ?? null;
}

function findFfmpegDirectory() {
  const ffmpegPath = executableFromPath('ffmpeg.exe');
  const ffprobePath = executableFromPath('ffprobe.exe');
  if (ffmpegPath && ffprobePath && path.dirname(ffmpegPath).toLowerCase() === path.dirname(ffprobePath).toLowerCase()) {
    return path.dirname(ffmpegPath);
  }

  const packageRoot = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(packageRoot)) {
    for (const packageName of fs.readdirSync(packageRoot).filter((name) => name.startsWith('Gyan.FFmpeg.Shared_'))) {
      const packagePath = path.join(packageRoot, packageName);
      for (const buildName of fs.readdirSync(packagePath)) {
        const binDirectory = path.join(packagePath, buildName, 'bin');
        if (fs.existsSync(path.join(binDirectory, 'ffmpeg.exe')) && fs.existsSync(path.join(binDirectory, 'ffprobe.exe'))) {
          return binDirectory;
        }
      }
    }
  }

  throw new Error('No se encontró una carpeta que contenga ffmpeg.exe y ffprobe.exe.');
}

function findWhisperDirectory() {
  const candidates = [
    path.join(os.homedir(), 'whisper'),
    path.join(os.homedir(), 'AppData', 'Local', 'whisper'),
    path.join(projectRoot, 'bin'),
    path.join(projectRoot, 'tools'),
    path.join(projectRoot, 'vendor')
  ];

  return candidates.find((directory) =>
    ['whisper-cli.exe', 'main.exe', 'whisper.exe'].some((name) => fs.existsSync(path.join(directory, name)))
  ) ?? null;
}

function findBaseModel(whisperDirectory) {
  const candidates = [
    path.join(whisperDirectory, 'models', modelFileName),
    path.join(os.homedir(), 'whisper', 'models', modelFileName),
    path.join(projectRoot, 'models', modelFileName)
  ];

  return candidates.find((filePath) => fs.existsSync(filePath)) ?? null;
}

function copyExecutablesAndLibraries(sourceDirectory, destinationDirectory, executableNames, normalizedExecutableName) {
  fs.mkdirSync(destinationDirectory, { recursive: true });
  const executable = executableNames.find((name) => fs.existsSync(path.join(sourceDirectory, name)));
  if (!executable) {
    throw new Error(`No se encontró ${executableNames.join(' o ')} en ${sourceDirectory}.`);
  }

  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const isExecutable = executableNames.includes(entry.name);
    if (isExecutable || path.extname(entry.name).toLowerCase() === '.dll') {
      const destinationName = entry.name === executable && normalizedExecutableName ? normalizedExecutableName : entry.name;
      fs.copyFileSync(path.join(sourceDirectory, entry.name), path.join(destinationDirectory, destinationName));
    }
  }
}

function copyMsvcRuntime(destinationDirectories) {
  const systemDirectory = path.join(process.env.WINDIR || 'C:\\Windows', 'System32');
  for (const fileName of msvcRuntimeFiles) {
    const sourcePath = path.join(systemDirectory, fileName);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    for (const destinationDirectory of destinationDirectories) {
      fs.copyFileSync(sourcePath, path.join(destinationDirectory, fileName));
    }
  }
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function main() {
  const ffmpegDirectory = findFfmpegDirectory();
  const whisperDirectory = findWhisperDirectory();
  if (!whisperDirectory) {
    throw new Error('No se encontró whisper-cli.exe. Instálalo en %USERPROFILE%\\whisper antes de empaquetar.');
  }

  const modelPath = findBaseModel(whisperDirectory);
  if (!modelPath) {
    throw new Error(`No se encontró ${modelFileName}. Colócalo en %USERPROFILE%\\whisper\\models antes de empaquetar.`);
  }

  const modelHash = await sha256(modelPath);
  if (modelHash !== expectedBaseModelSha256) {
    throw new Error(`El SHA-256 de ${modelFileName} no coincide con el modelo oficial esperado.`);
  }

  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  const ffmpegRuntimeDirectory = path.join(runtimeRoot, 'ffmpeg', 'bin');
  const whisperRuntimeDirectory = path.join(runtimeRoot, 'whisper', 'bin');
  copyExecutablesAndLibraries(ffmpegDirectory, ffmpegRuntimeDirectory, ['ffmpeg.exe', 'ffprobe.exe']);
  copyExecutablesAndLibraries(whisperDirectory, whisperRuntimeDirectory, ['whisper-cli.exe', 'main.exe', 'whisper.exe'], 'whisper-cli.exe');
  copyMsvcRuntime([ffmpegRuntimeDirectory, whisperRuntimeDirectory]);
  fs.mkdirSync(path.join(runtimeRoot, 'whisper', 'models'), { recursive: true });
  fs.copyFileSync(modelPath, path.join(runtimeRoot, 'whisper', 'models', modelFileName));

  const licensesDirectory = path.join(runtimeRoot, 'licenses');
  fs.mkdirSync(licensesDirectory, { recursive: true });
  const ffmpegLicensePath = path.resolve(ffmpegDirectory, '..', 'LICENSE');
  if (!fs.existsSync(ffmpegLicensePath)) {
    throw new Error('No se encontró la licencia de FFmpeg junto al paquete fuente.');
  }
  fs.copyFileSync(ffmpegLicensePath, path.join(licensesDirectory, 'FFmpeg-GPL-3.0.txt'));
  fs.copyFileSync(path.resolve(ffmpegDirectory, '..', 'README.txt'), path.join(licensesDirectory, 'FFmpeg-build-README.txt'));
  for (const fileName of ['whisper.cpp.LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    fs.copyFileSync(path.join(projectRoot, 'packaging', 'licenses', fileName), path.join(licensesDirectory, fileName));
  }

  console.log(`FFmpeg runtime: ${ffmpegDirectory}`);
  console.log(`Whisper runtime: ${whisperDirectory}`);
  console.log(`Verified model: ${modelFileName} (${modelHash})`);
  console.log('Runtime preparado para el instalador offline.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
