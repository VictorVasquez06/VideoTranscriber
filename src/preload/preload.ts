import { contextBridge, ipcRenderer } from 'electron';

const IPC_CHANNELS = {
  OPEN_FILE_DIALOG: 'app:open-file-dialog',
  START_TRANSCRIPTION: 'app:start-transcription',
  SAVE_TRANSCRIPT: 'app:save-transcript',
  TRANSCRIPTION_PROGRESS: 'app:transcription-progress',
  TRANSCRIPTION_RESULT: 'app:transcription-result',
  TRANSCRIPTION_ERROR: 'app:transcription-error',
  CANCEL_TRANSCRIPTION: 'app:cancel-transcription'
} as const;

contextBridge.exposeInMainWorld('transcripcionLocal', {
  openFileDialog: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FILE_DIALOG),
  startTranscription: (filePath: string, language = 'es') =>
    ipcRenderer.invoke(IPC_CHANNELS.START_TRANSCRIPTION, { filePath, language }),
  saveTranscriptFile: (transcript: string, fileName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_TRANSCRIPT, { transcript, fileName }),
  cancelTranscription: () => ipcRenderer.invoke(IPC_CHANNELS.CANCEL_TRANSCRIPTION),
  onProgress: (callback: (event: { stage: string; percent: number; message: string; processedSeconds?: number; totalSeconds?: number }) => void) =>
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION_PROGRESS, (_event, value) => callback(value)),
  onResult: (callback: (result: { ok: boolean; transcript?: string; outputPath?: string; error?: string }) => void) =>
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION_RESULT, (_event, value) => callback(value)),
  onError: (callback: (error: { error: string }) => void) =>
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION_ERROR, (_event, value) => callback(value))
});
