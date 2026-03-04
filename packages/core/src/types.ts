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
  status: UpdateStatus;
  errorReason?: string;
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
