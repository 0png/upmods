export { UpmodsCore } from './updater.js';
export type { CoreEvents } from './events.js';
export type {
  ModFile,
  Mod,
  ModUpdate,
  MCVersion,
  ScanResult,
  DownloadResult,
  BackupEntry,
  BackupSessionManifest,
  ApplyResult,
  RollbackResult,
  UpdateStatus,
  DependencyType,
  ModDependency,
  ModLoader,
  LoaderCandidate,
  LoaderDetection,
  MigrationEntryStatus,
  MigrationEntry,
  MigrationIssueKind,
  MigrationIssue,
  LoaderMigrationPlan,
  MigrationManifestFile,
  MigrationManifest,
  MigrationResult,
} from './types.js';
export { detectSourceLoader } from './migration.js';
