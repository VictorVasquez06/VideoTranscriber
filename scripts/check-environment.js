const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function hasCommand(commandName) {
  const result = spawnSync(commandName, ['-version'], {
    encoding: 'utf8'
  });
  return result.status === 0;
}

function resolvePossiblePaths() {
  const roots = [
    process.cwd(),
    path.join(process.cwd(), 'bin'),
    path.join(process.cwd(), 'tools'),
    path.join(process.cwd(), 'vendor'),
    path.join(process.cwd(), 'build'),
    path.join(process.cwd(), 'build', 'bin'),
    path.join(process.cwd(), 'build', 'bin', 'Release'),
    path.join(process.cwd(), 'build', 'Release'),
    path.join(process.env.USERPROFILE || '', 'whisper'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'whisper')
  ];

  const whisperCandidates = [
    'whisper-cli.exe',
    'whisper-cli',
    'main.exe',
    'main',
    'whisper.exe',
    'whisper',
    path.join('bin', 'whisper.exe'),
    path.join('bin', 'whisper'),
    path.join('tools', 'whisper.exe'),
    path.join('tools', 'whisper'),
    path.join('build', 'bin', 'whisper.exe'),
    path.join('build', 'bin', 'Release', 'whisper.exe'),
    path.join('build', 'Release', 'whisper.exe')
  ];

  const modelCandidates = [
    'ggml-base.bin',
    'ggml-small.bin',
    'ggml-medium.bin',
    'ggml-large-v3-turbo.bin'
  ];

  const existing = { whisper: null, model: null };

  for (const root of roots) {
    for (const candidate of whisperCandidates) {
      const full = path.join(root, candidate);
      if (fs.existsSync(full)) {
        existing.whisper = full;
        break;
      }
    }

    if (!existing.whisper) {
      for (const candidate of modelCandidates) {
        const full = path.join(root, candidate);
        if (fs.existsSync(full)) {
          existing.model = full;
        }
      }
    }

    if (existing.whisper) {
      for (const candidate of modelCandidates) {
        const full = path.join(root, 'models', candidate);
        if (fs.existsSync(full)) {
          existing.model = full;
          break;
        }
      }
    }
  }

  return existing;
}

const envState = {
  ffmpeg: hasCommand('ffmpeg'),
  ffprobe: hasCommand('ffprobe'),
  whisper: resolvePossiblePaths().whisper,
  model: resolvePossiblePaths().model
};

console.log('Estado del entorno para VideoTranscriber');
console.log('-----------------------------------------');
console.log('FFmpeg: ', envState.ffmpeg ? 'OK' : 'FALTA');
console.log('FFprobe: ', envState.ffprobe ? 'OK' : 'FALTA');
console.log('Whisper.exe: ', envState.whisper || 'NO ENCONTRADO');
console.log('Modelo: ', envState.model || 'NO ENCONTRADO');

if (!envState.ffmpeg || !envState.ffprobe) {
  console.log('\nInstalar FFmpeg y FFprobe desde: https://www.ffmpeg.org/download.html');
  console.log('En Windows: asegúrate de que ffmpeg.exe y ffprobe.exe estén en PATH.');
}

if (!envState.whisper || !envState.model) {
  console.log('\nFalta Whisper.cpp o el modelo local.');
  console.log('Pasos recomendados:');
  console.log('1. Descarga whisper-cli.exe desde una release oficial de whisper.cpp.');
  console.log('2. Descarga un modelo GGML, por ejemplo ggml-base.bin.');
  console.log('3. Coloca el ejecutable en %USERPROFILE%\\whisper\\ y el modelo en %USERPROFILE%\\whisper\\models\\.');
}

process.exit(0);
