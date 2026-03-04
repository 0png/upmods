export { UpmodsCore } from './updater.js';
export type { CoreEvents } from './events.js';
export type {
  ModFile,
  Mod,
  ModUpdate,
  MCVersion,
  ScanResult,
  DownloadResult,
  UpdateStatus,
  // V1 types
  ModDisposition,
  OperationStatus,
  MigrationResult,
  SnapshotOperation,
  SessionSnapshot,
} from './types.js';

export { sanitizeVersionString, SANITIZER_PATTERNS } from './sanitizer.js';
