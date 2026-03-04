import type { ModFile, Mod, ModUpdate, ScanResult, DownloadResult, MigrationResult, SessionSnapshot } from './types.js';

export type CoreEvents = {
  // --- Identify phase ---
  'scan:start': (dir: string, totalFiles: number) => void;
  'scan:progress': (done: number, total: number) => void;
  'scan:complete': (result: ScanResult) => void;
  'mod:identified': (mod: Mod) => void;
  'identify:complete': (mods: Mod[], unidentified: ModFile[]) => void;

  // --- Update check phase ---
  'check:complete': (updates: ModUpdate[], upToDate: Mod[]) => void;
  // V1: extended update check with incompatible mods
  'check:complete:v1': (updates: ModUpdate[], upToDate: Mod[], incompatible: Mod[]) => void;

  // --- Download phase ---
  'download:start': (update: ModUpdate) => void;
  'download:progress': (update: ModUpdate, bytesReceived: number, totalBytes: number) => void;
  'download:complete': (result: DownloadResult) => void;
  'download:error': (update: ModUpdate, error: Error) => void;
  'all:done': (results: DownloadResult[]) => void;

  // V1: Integrity validation events
  'integrity:pass': (update: ModUpdate) => void;
  'integrity:fail': (update: ModUpdate, expected: string, actual: string) => void;

  // V1: Migration events
  'migrate:start': (mod: Mod) => void;
  'migrate:complete': (result: MigrationResult) => void;
  'migrate:error': (mod: Mod, error: Error) => void;
  'all:migrations:done': (results: MigrationResult[]) => void;

  // V1: Recovery events
  'recovery:start': (snapshot: SessionSnapshot) => void;
  'recovery:complete': (restoredCount: number, failedCount: number) => void;

  // --- Error ---
  'error': (error: Error) => void;
};
