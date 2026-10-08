interface Window {
  transcripcionLocal: {
    openFileDialog: () => Promise<{ ok: boolean; filePath?: string; fileName?: string; fileExt?: string; error?: string }>;
    startTranscription: (filePath: string, language?: string) => Promise<{ ok: boolean; transcript?: string; error?: string }>;
    saveTranscriptFile: (transcript: string, fileName: string) => Promise<{ ok: boolean; canceled?: boolean; outputPath?: string; error?: string }>;
    cancelTranscription: () => Promise<void>;
    onProgress: (callback: (event: { stage: string; percent: number; message: string; processedSeconds?: number; totalSeconds?: number }) => void) => void;
    onResult: (callback: (result: { ok: boolean; transcript?: string; error?: string }) => void) => void;
    onError: (callback: (error: { error: string }) => void) => void;
  };
}