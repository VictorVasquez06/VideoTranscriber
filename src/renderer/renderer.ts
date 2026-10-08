const fileInput = document.getElementById('file-path') as HTMLInputElement | null;
const languageSelect = document.getElementById('language') as HTMLSelectElement | null;
const startButton = document.getElementById('start-transcription') as HTMLButtonElement | null;
const cancelButton = document.getElementById('cancel-transcription') as HTMLButtonElement | null;
const selectFileButton = document.getElementById('select-file') as HTMLButtonElement | null;
const copyButton = document.getElementById('copy-text') as HTMLButtonElement | null;
const saveTranscriptButton = document.getElementById('save-transcript') as HTMLButtonElement | null;
const phaseLabel = document.getElementById('phase-label') as HTMLSpanElement | null;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement | null;
const statusMessage = document.getElementById('status-message') as HTMLParagraphElement | null;
const transcriptOutput = document.getElementById('transcript-output') as HTMLTextAreaElement | null;

let selectedFilePath = '';
let transcriptText = '';
let transcriptFileName = 'transcripcion.txt';

function setTranscript(value: string): void {
  transcriptText = value;
  if (transcriptOutput) {
    transcriptOutput.value = value;
  }
  if (saveTranscriptButton) {
    saveTranscriptButton.hidden = !value.trim();
  }
}

function updateProgress(percent: number, stage: string, message: string): void {
  if (progressFill) {
    progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  if (phaseLabel) {
    phaseLabel.textContent = stage;
  }

  if (statusMessage) {
    statusMessage.textContent = message;
  }
}

async function openFileSelection(): Promise<void> {
  try {
    const result = await window.transcripcionLocal.openFileDialog();
    if (!result.ok || !result.filePath) {
      if (statusMessage) {
        statusMessage.textContent = result.error ?? 'No se pudo seleccionar el archivo.';
      }
      return;
    }

    selectedFilePath = result.filePath;
    const baseName = (result.fileName ?? 'transcripcion').replace(/\.[^.]+$/, '');
    transcriptFileName = `${baseName}_transcripcion.txt`;
    setTranscript('');

    if (fileInput) {
      fileInput.value = result.filePath;
    }

    updateProgress(0, 'Listo', `Archivo seleccionado: ${result.fileName ?? result.filePath}`);
  } catch (error) {
    console.error('No se pudo abrir el selector de archivos.', error);
    if (statusMessage) {
      statusMessage.textContent = 'No se pudo abrir el selector de archivos. Revisa la consola de depuración.';
    }
  }
}

async function startTranscription(): Promise<void> {
  if (!selectedFilePath) {
    if (statusMessage) {
      statusMessage.textContent = 'Primero selecciona un archivo MP4 o WMV.';
    }
    return;
  }

  const currentLanguage = languageSelect?.value ?? 'es';
  setTranscript('');
  updateProgress(0, 'Preparando', 'Validando archivo y preparando el flujo de transcripción.');

  const result = await window.transcripcionLocal.startTranscription(selectedFilePath, currentLanguage);
  if (!result.ok) {
    updateProgress(0, 'Error', result.error ?? 'No se pudo completar la transcripción.');
    return;
  }

  setTranscript(result.transcript ?? '');
  updateProgress(100, 'Completado', 'Transcripción lista. Pulsa "Descargar TXT" para elegir dónde guardarla.');
}

async function saveTranscript(): Promise<void> {
  if (!transcriptText.trim()) {
    return;
  }

  try {
    const result = await window.transcripcionLocal.saveTranscriptFile(transcriptText, transcriptFileName);
    if (result.canceled) {
      return;
    }
    if (!result.ok || !result.outputPath) {
      updateProgress(100, 'Error', result.error ?? 'No se pudo guardar la transcripción.');
      return;
    }
    updateProgress(100, 'Completado', `Transcripción guardada en: ${result.outputPath}`);
  } catch (error) {
    console.error('No se pudo guardar la transcripción.', error);
    updateProgress(100, 'Error', 'No se pudo guardar la transcripción. Revisa la consola de depuración.');
  }
}

async function cancelTranscription(): Promise<void> {
  await window.transcripcionLocal.cancelTranscription();
  updateProgress(0, 'Cancelado', 'Se ha solicitado cancelar la transcripción actual.');
}

selectFileButton?.addEventListener('click', () => {
  void openFileSelection();
});

startButton?.addEventListener('click', () => {
  void startTranscription();
});

saveTranscriptButton?.addEventListener('click', () => {
  void saveTranscript();
});

cancelButton?.addEventListener('click', () => {
  void cancelTranscription();
});

copyButton?.addEventListener('click', async () => {
  const value = transcriptOutput?.value ?? '';
  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(value);
  if (statusMessage) {
    statusMessage.textContent = 'Texto copiado al portapapeles.';
  }
});

window.transcripcionLocal.onProgress((event) => {
  updateProgress(event.percent, event.stage, event.message);
});

window.transcripcionLocal.onResult((result) => {
  if (!result.ok) {
    updateProgress(0, 'Error', result.error ?? 'La transcripción falló.');
    return;
  }

  setTranscript(result.transcript ?? '');
  updateProgress(100, 'Completado', 'Transcripción lista. Pulsa "Descargar TXT" para elegir dónde guardarla.');
});

window.transcripcionLocal.onError((error) => {
  updateProgress(0, 'Error', error.error);
});
