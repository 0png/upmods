/** A .jar file found on disk */
export interface ModFile {
  path: string;
  filename: string;
  sha1: string;
  sizeBytes: number;
  disabled?: boolean;
  metadata?: LocalModMetadata;
}

export type SupportedModLoader = 'fabric' | 'forge' | 'neoforge' | 'quilt';

export interface LocalModDependency {
  id: string;
  type: 'required' | 'optional' | 'incompatible';
  versionRange?: string;
}

/** Bounded, best-effort metadata read from an otherwise unidentified local JAR. */
export interface LocalModMetadata {
  format: 'fabric' | 'quilt' | 'forge' | 'neoforge';
  id: string;
  name: string;
  version?: string;
  loaders: SupportedModLoader[];
  minecraftVersionRange?: string;
  dependencies: LocalModDependency[];
  sourceEntry: string;
  warnings: string[];
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
  dependencies?: ModDependency[];
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

/** Controls local scanning without coupling callers to the scanner implementation. */
export interface ScanOptions {
  /** Reuse SHA-1 values for files whose name, size, and modification time are unchanged. */
  cache?: boolean;
  /** Maximum number of JAR files hashed concurrently. */
  hashConcurrency?: number;
  /** Read bounded metadata from JARs that Modrinth cannot identify. */
  metadataFallback?: boolean;
  /** Stop hashing, metadata reads, and identification as soon as practical. */
  signal?: AbortSignal;
}

export type UpdateChannel = 'stable-only' | 'allow-beta';

export interface InstanceConfig {
  schemaVersion: 1;
  minecraftVersion?: string;
  loader?: SupportedModLoader;
  channel: UpdateChannel;
  ignored: string[];
  pinned: Record<string, string>;
}

export interface InstanceConfigPatch {
  minecraftVersion?: string | null;
  loader?: SupportedModLoader | null;
  channel?: UpdateChannel;
  addIgnored?: string[];
  removeIgnored?: string[];
  setPinned?: Record<string, string>;
  removePinned?: string[];
}

export interface InstanceConfigUpdateResult {
  configPath: string;
  config: InstanceConfig;
}

export type InstanceKind = 'mods-directory' | 'minecraft' | 'prism' | 'modrinth' | 'curseforge' | 'unknown';
export type DetectionConfidence = 'high' | 'medium' | 'low';

export interface InstanceSuggestion {
  value: string;
  source: string;
  confidence: DetectionConfidence;
}

export interface InstanceResolution {
  inputDir: string;
  instanceDir: string;
  modsDir: string;
  kind: InstanceKind;
  minecraftVersion: string | null;
  loader: SupportedModLoader | null;
  suggestions: {
    minecraftVersions: InstanceSuggestion[];
    loaders: InstanceSuggestion[];
  };
  ambiguous: boolean;
  configPath: string;
  config: InstanceConfig;
  warnings: string[];
}

export interface UpdatePolicy {
  channel: UpdateChannel;
  ignored: string[];
  pinned: Record<string, string>;
}

export type UpdatePlanAction = 'update' | 'up-to-date' | 'ignored' | 'pinned' | 'incompatible';

export interface UpdatePlanItem {
  mod: Mod;
  action: UpdatePlanAction;
  reason: string;
  update?: ModUpdate;
  pinnedVersion?: string;
}

export interface UpdatePlan {
  minecraftVersion: string;
  loader: string;
  channel: UpdateChannel;
  items: UpdatePlanItem[];
  updates: ModUpdate[];
}

export interface UpdateExecutionResult {
  plan: UpdatePlan;
  downloads: DownloadResult[];
  applyResult?: ApplyResult;
  applied: boolean;
  failureReason?: string;
}

export type AuditSeverity = 'info' | 'warning' | 'error';
export type AuditIssueKind =
  | 'duplicate-project'
  | 'duplicate-content'
  | 'loader-incompatible'
  | 'minecraft-incompatible'
  | 'missing-required-dependency'
  | 'incompatible-dependency'
  | 'unidentified-jar'
  | 'disabled-or-legacy-jar'
  | 'lockfile-drift';

export interface AuditIssue {
  id: string;
  kind: AuditIssueKind;
  severity: AuditSeverity;
  message: string;
  files: string[];
  remediation: string;
}

export interface AuditOptions {
  minecraftVersion?: string | null;
  loader?: string | null;
  lockfileVerification?: LockfileVerificationResult | null;
}

export interface AuditReport {
  directory: string;
  issues: AuditIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  healthy: boolean;
}

export interface UpdateSafetyBlocker {
  source: 'audit' | 'plan' | 'update-dependency';
  kind: AuditIssueKind | 'incompatible-update-plan';
  message: string;
  files: string[];
  remediation: string;
}

export interface UpdateSafetyReport {
  safe: boolean;
  blockers: UpdateSafetyBlocker[];
}

export interface LockedMod {
  projectId: string;
  projectSlug: string;
  displayName: string;
  versionId: string;
  versionNumber: string;
  filename: string;
  sha1: string;
  sizeBytes: number;
}

export interface LockedUnidentifiedFile {
  filename: string;
  sha1: string;
  sizeBytes: number;
}

export interface ModpackLockfile {
  schemaVersion: 1;
  createdAt: string;
  mods: LockedMod[];
  unidentified: LockedUnidentifiedFile[];
}

export type LockfileChangeKind = 'added' | 'removed' | 'changed';

export interface LockfileChange {
  kind: LockfileChangeKind;
  displayName: string;
  projectId?: string;
  expected?: LockedMod | LockedUnidentifiedFile;
  actual?: LockedMod | LockedUnidentifiedFile;
}

export interface LockfileVerificationResult {
  valid: boolean;
  lockfilePath: string;
  changes: LockfileChange[];
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
  /** Installed target path. In schema v1 this was always the same as originalPath. */
  appliedPath: string;
  operation?: 'replace-in-place' | 'rename';
}

export type BackupSessionStatus = 'prepared' | 'applied' | 'failed' | 'rolled-back';

/** Manifest for one apply session that can later be rolled back */
export interface BackupSessionManifest {
  /** Missing means the legacy pre-schema manifest format. */
  schemaVersion?: 2;
  sessionId: string;
  createdAt: string;
  modsDir: string;
  backupDir: string;
  manifestPath: string;
  entries: BackupEntry[];
  status?: BackupSessionStatus;
  completedAt?: string;
  failureReason?: string;
  rolledBackAt?: string;
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
  removedPaths?: string[];
}
