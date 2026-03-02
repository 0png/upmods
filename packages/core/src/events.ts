import type { ModFile, Mod, ModUpdate, ScanResult, DownloadResult } from './types.js';

export type CoreEvents = {
  // --- Identify phase ---
  'scan:start': (dir: string, totalFiles: number) => void;
  'scan:progress': (done: number, total: number) => void;
  'scan:complete': (result: ScanResult) => void;
  'mod:identified': (mod: Mod) => void;
  'identify:complete': (mods: Mod[], unidentified: ModFile[]) => void;

  // --- Update check phase ---
  'check:complete': (updates: ModUpdate[], upToDate: Mod[]) => void;

  // --- Download phase ---
  'download:start': (update: ModUpdate) => void;
  'download:progress': (update: ModUpdate, bytesReceived: number, totalBytes: number) => void;
  'download:complete': (result: DownloadResult) => void;
  'download:error': (update: ModUpdate, error: Error) => void;
  'all:done': (results: DownloadResult[]) => void;

  // --- Error ---
  'error': (error: Error) => void;
};
