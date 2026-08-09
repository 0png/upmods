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

export type UpdateStatus = 'pending' | 'downloading' | 'done' | 'error';

/** An update available for an identified mod */
export interface ModUpdate {
  mod: Mod;
  latestVersionId: string;
  latestVersionNumber: string;
  downloadUrl: string;
  downloadFilename: string;
  downloadSizeBytes: number;
  downloadSha1?: string;
  downloadSha512?: string;
  dependencies?: ModDependency[];
  status: UpdateStatus;
  errorReason?: string;
}

export type DependencyType = 'required' | 'optional' | 'incompatible' | 'embedded';

/** A dependency declared by a specific Modrinth version. */
export interface ModDependency {
  versionId: string | null;
  projectId: string | null;
  fileName: string | null;
  dependencyType: DependencyType;
}

/** A loader advertised by Modrinth for mod projects. */
export interface ModLoader {
  name: string;
  supportedProjectTypes: string[];
}

export interface LoaderCandidate {
  loader: string;
  count: number;
}

/** Best-effort source-loader detection from the installed versions. */
export interface LoaderDetection {
  detected: string | null;
  candidates: LoaderCandidate[];
  ambiguous: boolean;
}

export type MigrationEntryStatus =
  | 'compatible'
  | 'convertible'
  | 'required'
  | 'optional'
  | 'unavailable';

/** One source mod or dependency considered by a loader migration. */
export interface MigrationEntry {
  id: string;
  displayName: string;
  projectId: string | null;
  projectSlug: string;
  sourceMod?: Mod;
  sourceLoader: string;
  targetLoader: string;
  targetVersionId?: string;
  targetVersionNumber?: string;
  status: MigrationEntryStatus;
  dependencyType: 'root' | 'required' | 'optional';
  locked: boolean;
  /** `root` means always active; other values are optional entry IDs that activate this entry. */
  activationKeys: string[];
  update?: ModUpdate;
}

export type MigrationIssueKind =
  | 'unavailable'
  | 'unresolved-required'
  | 'incompatible'
  | 'invalid-target';

export interface MigrationIssue {
  id: string;
  kind: MigrationIssueKind;
  displayName: string;
  projectId: string | null;
  message: string;
}

export interface LoaderMigrationPlan {
  sourceLoader: string;
  targetLoader: string;
  mcVersion: string;
  entries: MigrationEntry[];
  issues: MigrationIssue[];
  complete: boolean;
}

export interface MigrationManifestFile {
  entryId: string;
  projectId: string | null;
  displayName: string;
  filename: string;
  source: 'download' | 'copy';
  dependencyType: 'root' | 'required' | 'optional';
  success: boolean;
  errorReason?: string;
}

export interface MigrationManifest {
  schemaVersion: 1;
  createdAt: string;
  sourceLoader: string;
  targetLoader: string;
  mcVersion: string;
  outputDir: string;
  complete: boolean;
  selectedOptionalEntryIds: string[];
  files: MigrationManifestFile[];
  issues: MigrationIssue[];
}

export interface MigrationResult {
  outputDir: string;
  manifestPath: string;
  complete: boolean;
  downloadedCount: number;
  copiedCount: number;
  failedCount: number;
  unavailableCount: number;
  manifest: MigrationManifest;
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
}

/** A single mod file backup created before applying an update */
export interface BackupEntry {
  projectId: string;
  projectSlug: string;
  displayName: string;
  installedVersionId: string;
  latestVersionId: string;
  originalPath: string;
  backupPath: string;
  downloadedPath: string;
  appliedPath: string;
}

/** Manifest for one apply session that can later be rolled back */
export interface BackupSessionManifest {
  sessionId: string;
  createdAt: string;
  modsDir: string;
  backupDir: string;
  manifestPath: string;
  entries: BackupEntry[];
}

/** Outcome of applying downloaded updates into the real mods directory */
export interface ApplyResult {
  session: BackupSessionManifest;
  appliedCount: number;
  appliedPaths: string[];
}

/** Outcome of restoring the latest backup session */
export interface RollbackResult {
  sessionId: string;
  backupDir: string;
  restoredCount: number;
  restoredPaths: string[];
}
