export const IPC_CHANNELS = {
  OPEN_FILE_DIALOG: 'app:open-file-dialog',
  FILE_SELECTED: 'app:file-selected',
  START_TRANSCRIPTION: 'app:start-transcription',
  SAVE_TRANSCRIPT: 'app:save-transcript',
  TRANSCRIPTION_PROGRESS: 'app:transcription-progress',
  TRANSCRIPTION_RESULT: 'app:transcription-result',
  TRANSCRIPTION_ERROR: 'app:transcription-error',
  CANCEL_TRANSCRIPTION: 'app:cancel-transcription'
} as const;

export type FileSelectionResult = {
  ok: boolean;
  filePath?: string;
  fileName?: string;
  fileExt?: string;
  error?: string;
};

export type ProgressEvent = {
  stage: string;
  percent: number;
  message: string;
  processedSeconds?: number;
  totalSeconds?: number;
};

export type TranscriptionRequest = {
  filePath: string;
  language: string;
};

export type TranscriptionResponse = {
  ok: boolean;
  transcript?: string;
  error?: string;
};

export type SaveTranscriptRequest = {
  transcript: string;
  fileName: string;
};

export type SaveTranscriptResponse = {
  ok: boolean;
  canceled?: boolean;
  outputPath?: string;
  error?: string;
};
