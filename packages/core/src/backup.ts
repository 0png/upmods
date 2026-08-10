import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import {
  copyFile,
  link,
  lstat,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import fsExtra from 'fs-extra';
import type {
  ApplyResult,
  BackupEntry,
  BackupSessionManifest,
  ModUpdate,
  RollbackResult,
} from './types.js';

const { ensureDir, pathExists, readJson } = fsExtra;

const BACKUP_DIRNAME = '.upmods-backup';
const BACKUP_MODS_DIRNAME = 'mods';
const MANIFEST_FILENAME = 'manifest.json';
const COPY_EXCLUSIVE = constants.COPYFILE_EXCL;

function getBackupRootDir(modsDir: string): string {
  return path.join(modsDir, BACKUP_DIRNAME);
}

function createSessionId(now = new Date()): string {
  return `${now.toISOString().replace(/[:.]/g, '-')}-${process.pid}-${randomUUID().slice(0, 8)}`;
}

function isPathInsideDir(targetPath: string, baseDir: string): boolean {
  const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function pathKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function pathsEqual(left: string, right: string): boolean {
  return pathKey(left) === pathKey(right);
}

async function assertRegularFile(filePath: string, message: string): Promise<void> {
  try {
    const file = await lstat(filePath);
    if (!file.isFile() || file.isSymbolicLink()) throw new Error(message);
  } catch (error) {
    if (error instanceof Error && error.message === message) throw error;
    throw new Error(message);
  }
}

async function verifyStagedSnapshot(update: ModUpdate, stagedPath: string): Promise<void> {
  const expectedSha512 = update.downloadSha512?.toLowerCase();
  const expectedSha1 = update.downloadSha1?.toLowerCase();
  if (!expectedSha512 && !expectedSha1) return;

  const sha512 = expectedSha512 ? createHash('sha512') : null;
  const sha1 = expectedSha1 ? createHash('sha1') : null;
  try {
    for await (const chunk of createReadStream(stagedPath)) {
      sha512?.update(chunk);
      sha1?.update(chunk);
    }
  } catch (error) {
    throw new Error(
      `Cannot verify staged update ${update.downloadFilename}: ${error instanceof Error ? error.message : String(error)}. `
      + 'Download it again and retry Apply; no installed files were changed.',
    );
  }

  const actualSha512 = sha512?.digest('hex');
  const actualSha1 = sha1?.digest('hex');
  const mismatch = actualSha512 !== expectedSha512
    ? 'SHA-512'
    : actualSha1 !== expectedSha1 ? 'SHA-1' : null;
  if (mismatch) {
    throw new Error(
      `Staged update checksum mismatch (${mismatch}) for ${update.downloadFilename}. `
      + 'Delete the staged copy, download it again, and retry Apply; no installed files were changed.',
    );
  }
}

async function writeManifest(manifestPath: string, manifest: BackupSessionManifest): Promise<void> {
  const tempPath = `${manifestPath}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await rename(tempPath, manifestPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function validateUniquePaths(entries: BackupEntry[]): void {
  const originalOwners = new Map<string, BackupEntry>();
  const targetOwners = new Map<string, BackupEntry>();
  for (const entry of entries) {
    const originalKey = pathKey(entry.originalPath);
    const targetKey = pathKey(entry.appliedPath);
    const originalOwner = originalOwners.get(originalKey);
    if (originalOwner) {
      throw new Error(`Multiple updates target the same installed file: ${entry.originalPath}`);
    }
    originalOwners.set(originalKey, entry);

    const targetOwner = targetOwners.get(targetKey);
    if (targetOwner) {
      throw new Error(
        `Update filename collision: ${entry.displayName} and ${targetOwner.displayName} both install ${path.basename(entry.appliedPath)}`,
      );
    }
    targetOwners.set(targetKey, entry);
  }

  for (const entry of entries) {
    const owner = originalOwners.get(pathKey(entry.appliedPath));
    if (owner && owner !== entry) {
      throw new Error(
        `Update filename collision: ${entry.displayName} would replace the installed file for ${owner.displayName}`,
      );
    }
  }
}

async function buildBackupEntries(
  updates: ModUpdate[],
  downloadedDir: string,
  modsDir: string,
  backupModsDir: string,
): Promise<BackupEntry[]> {
  const entries: BackupEntry[] = [];
  for (const [index, update] of updates.entries()) {
    if (path.basename(update.downloadFilename) !== update.downloadFilename) {
      throw new Error(`Unsafe download filename: ${update.downloadFilename}`);
    }

    const downloadedPath = path.resolve(downloadedDir, update.downloadFilename);
    const originalPath = path.resolve(update.mod.file.path);
    const requestedTargetPath = path.resolve(modsDir, update.downloadFilename);
    const appliedPath = pathsEqual(originalPath, requestedTargetPath)
      ? originalPath
      : requestedTargetPath;

    if (!isPathInsideDir(originalPath, modsDir)) {
      throw new Error(`Refusing to apply outside mods directory: ${originalPath}`);
    }
    if (!isPathInsideDir(appliedPath, modsDir)) {
      throw new Error(`Refusing to install outside mods directory: ${appliedPath}`);
    }
    if (!isPathInsideDir(downloadedPath, downloadedDir)) {
      throw new Error(`Refusing to read a download outside the staging directory: ${downloadedPath}`);
    }

    await assertRegularFile(downloadedPath, `Downloaded update not found or not a file: ${downloadedPath}`);
    await assertRegularFile(originalPath, `Original mod file not found for backup: ${originalPath}`);

    const backupFilename = `${String(index + 1).padStart(3, '0')}-${path.basename(originalPath)}`;
    entries.push({
      projectId: update.mod.projectId,
      projectSlug: update.mod.projectSlug,
      displayName: update.mod.displayName,
      installedVersionId: update.mod.installedVersionId,
      latestVersionId: update.latestVersionId,
      originalPath,
      backupPath: path.join(backupModsDir, backupFilename),
      downloadedPath,
      appliedPath,
      operation: pathsEqual(originalPath, appliedPath) ? 'replace-in-place' : 'rename',
    });
  }

  validateUniquePaths(entries);
  for (const entry of entries) {
    if (!pathsEqual(entry.originalPath, entry.appliedPath) && await pathExists(entry.appliedPath)) {
      throw new Error(
        `Refusing to overwrite existing target ${entry.appliedPath}. Move the conflicting file and retry.`,
      );
    }
  }
  return entries;
}

async function restoreApplyEntries(entries: BackupEntry[], stagedPaths: string[]): Promise<string[]> {
  const failures: string[] = [];
  for (const entry of entries) {
    try {
      await rm(entry.appliedPath, { force: true });
    } catch (error) {
      failures.push(`${entry.displayName} target cleanup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const entry of entries) {
    try {
      await copyFile(entry.backupPath, entry.originalPath);
    } catch (error) {
      failures.push(`${entry.displayName} restore: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const stagedPath of stagedPaths) {
    await rm(stagedPath, { force: true }).catch(() => undefined);
  }
  return failures;
}

export async function applyDownloadedUpdates(
  updates: ModUpdate[],
  downloadedDir: string,
  modsDir: string,
): Promise<ApplyResult> {
  if (updates.length === 0) throw new Error('No downloaded updates available to apply');

  const resolvedModsDir = path.resolve(modsDir);
  const resolvedDownloadedDir = path.resolve(downloadedDir);
  const sessionId = createSessionId();
  const backupDir = path.join(getBackupRootDir(resolvedModsDir), sessionId);
  const backupModsDir = path.join(backupDir, BACKUP_MODS_DIRNAME);
  const manifestPath = path.join(backupDir, MANIFEST_FILENAME);
  await ensureDir(backupModsDir);

  let entries: BackupEntry[];
  try {
    entries = await buildBackupEntries(
      updates,
      resolvedDownloadedDir,
      resolvedModsDir,
      backupModsDir,
    );
  } catch (error) {
    await rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  const manifest: BackupSessionManifest = {
    schemaVersion: 2,
    sessionId,
    createdAt: new Date().toISOString(),
    modsDir: resolvedModsDir,
    backupDir,
    manifestPath,
    entries,
    status: 'prepared',
  };
  const stagedPaths = entries.map((_, index) => (
    path.join(resolvedModsDir, `.upmods-apply-${sessionId}-${String(index + 1).padStart(3, '0')}.tmp`)
  ));

  try {
    // Snapshot every download onto the target filesystem, then verify that
    // immutable transaction input before backing up or touching installed files.
    for (const [index, entry] of entries.entries()) {
      await copyFile(entry.downloadedPath, stagedPaths[index]!, COPY_EXCLUSIVE);
      await verifyStagedSnapshot(updates[index]!, stagedPaths[index]!);
    }
    for (const entry of entries) {
      await copyFile(entry.originalPath, entry.backupPath, COPY_EXCLUSIVE);
    }
    await writeManifest(manifestPath, manifest);
  } catch (error) {
    await Promise.all(stagedPaths.map((stagedPath) => rm(stagedPath, { force: true }).catch(() => undefined)));
    await rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  try {
    for (const entry of entries) await rm(entry.originalPath);
    for (const [index, entry] of entries.entries()) {
      // The temporary file is on the same filesystem. A hard link publishes the
      // complete file atomically and fails if a competing process created the
      // destination after validation, instead of overwriting it.
      await link(stagedPaths[index]!, entry.appliedPath);
      await rm(stagedPaths[index]!);
    }

    manifest.status = 'applied';
    manifest.completedAt = new Date().toISOString();
    await writeManifest(manifestPath, manifest);
  } catch (error) {
    const applyMessage = error instanceof Error ? error.message : String(error);
    const restoreFailures = await restoreApplyEntries(entries, stagedPaths);
    manifest.status = 'failed';
    manifest.failureReason = applyMessage;
    let manifestFailure: string | null = null;
    try {
      await writeManifest(manifestPath, manifest);
    } catch (manifestError) {
      manifestFailure = manifestError instanceof Error ? manifestError.message : String(manifestError);
    }

    if (restoreFailures.length > 0) {
      throw new Error(
        `Apply failed (${applyMessage}) and automatic restore was incomplete: ${restoreFailures.join('; ')}`,
      );
    }
    const suffix = manifestFailure ? ` Manifest status could not be recorded: ${manifestFailure}` : '';
    throw new Error(`Apply failed and all attempted changes were restored: ${applyMessage}.${suffix}`);
  }

  return {
    session: manifest,
    appliedCount: entries.length,
    appliedPaths: entries.map((entry) => entry.appliedPath),
  };
}

function isRollbackCandidate(manifest: BackupSessionManifest): boolean {
  return manifest.status === undefined || manifest.status === 'applied';
}

function validateRollbackManifest(
  manifest: BackupSessionManifest,
  manifestPath: string,
  modsDir: string,
): void {
  const sessionDir = path.dirname(manifestPath);
  if (manifest.schemaVersion !== undefined && manifest.schemaVersion !== 2) {
    throw new Error(`Unsupported rollback manifest schema: ${manifestPath}`);
  }
  if (path.resolve(manifest.backupDir) !== path.resolve(sessionDir)) {
    throw new Error(`Rollback manifest backup directory is invalid: ${manifestPath}`);
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error(`Rollback manifest is invalid: ${manifestPath}`);
  }
  validateUniquePaths(manifest.entries);
  for (const entry of manifest.entries) {
    if (!isPathInsideDir(entry.originalPath, modsDir)) {
      throw new Error(`Refusing to restore outside mods directory: ${entry.originalPath}`);
    }
    if (!isPathInsideDir(entry.appliedPath, modsDir)) {
      throw new Error(`Refusing to remove outside mods directory: ${entry.appliedPath}`);
    }
    if (!isPathInsideDir(entry.backupPath, sessionDir)) {
      throw new Error(`Refusing to read a backup outside its session directory: ${entry.backupPath}`);
    }
  }
}

interface QuarantinedFile {
  appliedPath: string;
  quarantinePath: string;
}

async function restoreUpdatedState(
  entries: BackupEntry[],
  restoredPaths: string[],
  quarantined: QuarantinedFile[],
  restoreTemps: string[],
): Promise<string[]> {
  const failures: string[] = [];
  for (const restoredPath of restoredPaths) {
    await rm(restoredPath, { force: true }).catch((error: unknown) => {
      failures.push(`cleanup ${restoredPath}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  for (const item of [...quarantined].reverse()) {
    try {
      await rename(item.quarantinePath, item.appliedPath);
    } catch (error) {
      failures.push(`restore updated file ${item.appliedPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const restoreTemp of restoreTemps) {
    await rm(restoreTemp, { force: true }).catch(() => undefined);
  }
  // Keep the parameter tied to the transaction shape and protect future refactors from mismatched lists.
  if (entries.length !== restoreTemps.length) failures.push('rollback transaction entry count mismatch');
  return failures;
}

export async function rollbackLatestBackupSession(modsDir: string): Promise<RollbackResult> {
  const resolvedModsDir = path.resolve(modsDir);
  const backupRootDir = getBackupRootDir(resolvedModsDir);
  if (!await pathExists(backupRootDir)) {
    throw new Error(`No rollback session found in ${backupRootDir}`);
  }

  const sessions = (await readdir(backupRootDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  for (const sessionId of sessions) {
    const manifestPath = path.join(backupRootDir, sessionId, MANIFEST_FILENAME);
    if (!await pathExists(manifestPath)) continue;
    const manifest = await readJson(manifestPath) as BackupSessionManifest;
    if (path.resolve(manifest.modsDir) !== resolvedModsDir || !isRollbackCandidate(manifest)) continue;
    validateRollbackManifest(manifest, manifestPath, resolvedModsDir);

    for (const entry of manifest.entries) {
      await assertRegularFile(entry.backupPath, `Backup file missing for rollback: ${entry.backupPath}`);
      if (!pathsEqual(entry.originalPath, entry.appliedPath) && await pathExists(entry.originalPath)) {
        throw new Error(
          `Cannot rollback because the original path is occupied: ${entry.originalPath}. Move that file and retry.`,
        );
      }
    }

    const transactionId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const quarantineDir = path.join(path.dirname(manifestPath), `rollback-current-${transactionId}`);
    const restoreTemps = manifest.entries.map((_, index) => (
      path.join(resolvedModsDir, `.upmods-rollback-${transactionId}-${String(index + 1).padStart(3, '0')}.tmp`)
    ));
    await ensureDir(quarantineDir);

    try {
      for (const [index, entry] of manifest.entries.entries()) {
        await copyFile(entry.backupPath, restoreTemps[index]!, COPY_EXCLUSIVE);
      }
    } catch (error) {
      for (const restoreTemp of restoreTemps) await rm(restoreTemp, { force: true }).catch(() => undefined);
      await rm(quarantineDir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }

    const quarantined: QuarantinedFile[] = [];
    const restoredPaths: string[] = [];
    try {
      for (const [index, entry] of manifest.entries.entries()) {
        if (!await pathExists(entry.appliedPath)) continue;
        await assertRegularFile(entry.appliedPath, `Applied mod path is not a file: ${entry.appliedPath}`);
        const quarantinePath = path.join(
          quarantineDir,
          `${String(index + 1).padStart(3, '0')}-${path.basename(entry.appliedPath)}`,
        );
        await rename(entry.appliedPath, quarantinePath);
        quarantined.push({ appliedPath: entry.appliedPath, quarantinePath });
      }
      for (const [index, entry] of manifest.entries.entries()) {
        await rename(restoreTemps[index]!, entry.originalPath);
        restoredPaths.push(entry.originalPath);
      }

      manifest.schemaVersion = 2;
      manifest.status = 'rolled-back';
      manifest.rolledBackAt = new Date().toISOString();
      await writeManifest(manifestPath, manifest);
    } catch (error) {
      const rollbackMessage = error instanceof Error ? error.message : String(error);
      const recoveryFailures = await restoreUpdatedState(
        manifest.entries,
        restoredPaths,
        quarantined,
        restoreTemps,
      );
      if (recoveryFailures.length > 0) {
        throw new Error(
          `Rollback failed (${rollbackMessage}) and recovery was incomplete: ${recoveryFailures.join('; ')}`,
        );
      }
      throw new Error(`Rollback failed and the updated state was restored: ${rollbackMessage}`);
    }

    await rm(quarantineDir, { recursive: true, force: true }).catch(() => undefined);
    return {
      sessionId: manifest.sessionId,
      backupDir: manifest.backupDir,
      restoredCount: manifest.entries.length,
      restoredPaths,
      removedPaths: quarantined.map((entry) => entry.appliedPath),
    };
  }

  throw new Error(`No rollback session found in ${backupRootDir}`);
}
