/** A .jar file found on disk */
export interface ModFile {
  path: string;
  filename: string;
  sha1: string;
  sizeBytes: number;
}

/** A ModFile matched to a Modrinth project */
export interface Mod {
  file: ModFile;
  projectId: string;
  projectSlug: string;
  displayName: string;
  installedVersionId: string;
  installedVersionNumber: string;
  loaders: string[];
  supportedMcVersions: string[];
}

export type UpdateStatus = 'pending' | 'downloading' | 'done' | 'error' | 'integrity_failed';

/** An update available for an identified mod */
export interface ModUpdate {
  mod: Mod;
  latestVersionId: string;
  latestVersionNumber: string;
  downloadUrl: string;
  downloadFilename: string;
  downloadSizeBytes: number;
  status: UpdateStatus;
  errorReason?: string;
  expectedSha512?: string;
  integrityPassed?: boolean;
}

/** A Minecraft game version from Modrinth tags */
export interface MCVersion {
  version: string;
  versionType: 'release' | 'snapshot' | 'beta' | 'alpha';
  releaseDate: string;
  major: boolean;
}

/** Summary of a completed scan + identify pass */
export interface ScanResult {
  directory: string;
  totalFiles: number;
  identifiedCount: number;
  unidentifiedCount: number;
  durationMs: number;
  identified: Mod[];
  unidentified: ModFile[];
}

/** Outcome of a single file download */
export interface DownloadResult {
  update: ModUpdate;
  success: boolean;
  outputPath?: string;
  errorReason?: string;
  integrityPassed?: boolean;
}

/** V1: Disposition of a mod relative to the target MC version */
export type ModDisposition = 'download' | 'migrate' | 'incompatible' | 'unidentified';

/** V1: Status of a snapshot operation */
export type OperationStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

/** V1: Outcome of migrating a single compatible mod */
export interface MigrationResult {
  mod: Mod;
  success: boolean;
  outputPath?: string;
  sourceDeleted: boolean;
  errorReason?: string;
}

/** V1: A single operation recorded in a session snapshot */
export interface SnapshotOperation {
  modName: string;
  sourceFile: string;
  destinationFile: string;
  operationType: 'download' | 'migrate';
  status: OperationStatus;
}

/** V1: Session snapshot written before Step 4 for interruption recovery */
export interface SessionSnapshot {
  version: 1;
  sessionId: string;
  timestamp: string;
  workingDir: string;
  operations: SnapshotOperation[];
}
