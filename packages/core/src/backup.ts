import path from 'node:path';
import { copyFile } from 'node:fs/promises';
import fsExtra from 'fs-extra';
import type {
  ApplyResult,
  BackupEntry,
  BackupSessionManifest,
  ModUpdate,
  RollbackResult,
} from './types.js';

const { ensureDir, pathExists, readJson, writeJson } = fsExtra;

const BACKUP_DIRNAME = '.upmods-backup';
const BACKUP_MODS_DIRNAME = 'mods';
const MANIFEST_FILENAME = 'manifest.json';

function getBackupRootDir(modsDir: string): string {
  return path.join(modsDir, BACKUP_DIRNAME);
}

function createSessionId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

function isPathInsideDir(targetPath: string, baseDir: string): boolean {
  const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function assertFileExists(filePath: string, message: string): Promise<void> {
  if (!await pathExists(filePath)) {
    throw new Error(message);
  }
}

export async function applyDownloadedUpdates(
  updates: ModUpdate[],
  downloadedDir: string,
  modsDir: string,
): Promise<ApplyResult> {
  if (updates.length === 0) {
    throw new Error('No downloaded updates available to apply');
  }

  const resolvedModsDir = path.resolve(modsDir);
  const sessionId = createSessionId();
  const backupDir = path.join(getBackupRootDir(resolvedModsDir), sessionId);
  const backupModsDir = path.join(backupDir, BACKUP_MODS_DIRNAME);
  const manifestPath = path.join(backupDir, MANIFEST_FILENAME);

  await ensureDir(backupModsDir);

  const entries: BackupEntry[] = [];
  for (const [index, update] of updates.entries()) {
    const downloadedPath = path.resolve(downloadedDir, update.downloadFilename);
    const appliedPath = path.resolve(update.mod.file.path);

    if (!isPathInsideDir(appliedPath, resolvedModsDir)) {
      throw new Error(`Refusing to apply outside mods directory: ${appliedPath}`);
    }

    await assertFileExists(
      downloadedPath,
      `Downloaded update not found: ${downloadedPath}`,
    );
    await assertFileExists(
      appliedPath,
      `Original mod file not found for backup: ${appliedPath}`,
    );

    const backupFilename = `${String(index + 1).padStart(2, '0')}-${path.basename(appliedPath)}`;
    const backupPath = path.join(backupModsDir, backupFilename);

    entries.push({
      projectId: update.mod.projectId,
      projectSlug: update.mod.projectSlug,
      displayName: update.mod.displayName,
      installedVersionId: update.mod.installedVersionId,
      latestVersionId: update.latestVersionId,
      originalPath: appliedPath,
      backupPath,
      downloadedPath,
      appliedPath,
    });
  }

  for (const entry of entries) {
    await copyFile(entry.originalPath, entry.backupPath);
  }

  const manifest: BackupSessionManifest = {
    sessionId,
    createdAt: new Date().toISOString(),
    modsDir: resolvedModsDir,
    backupDir,
    manifestPath,
    entries,
  };

  await writeJson(manifestPath, manifest, { spaces: 2 });

  for (const entry of entries) {
    await copyFile(entry.downloadedPath, entry.appliedPath);
  }

  return {
    session: manifest,
    appliedCount: entries.length,
    appliedPaths: entries.map((entry) => entry.appliedPath),
  };
}

export async function rollbackLatestBackupSession(modsDir: string): Promise<RollbackResult> {
  const resolvedModsDir = path.resolve(modsDir);
  const backupRootDir = getBackupRootDir(resolvedModsDir);
  if (!await pathExists(backupRootDir)) {
    throw new Error(`No rollback session found in ${backupRootDir}`);
  }

  const { readdir } = await import('node:fs/promises');
  const sessions = (await readdir(backupRootDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  for (const sessionId of sessions) {
    const manifestPath = path.join(backupRootDir, sessionId, MANIFEST_FILENAME);
    if (!await pathExists(manifestPath)) continue;

    const manifest = await readJson(manifestPath) as BackupSessionManifest;
    if (path.resolve(manifest.modsDir) !== resolvedModsDir) {
      continue;
    }

    if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
      throw new Error(`Rollback manifest is invalid: ${manifestPath}`);
    }

    for (const entry of manifest.entries) {
      if (!isPathInsideDir(entry.appliedPath, resolvedModsDir)) {
        throw new Error(`Refusing to restore outside mods directory: ${entry.appliedPath}`);
      }
      await assertFileExists(
        entry.backupPath,
        `Backup file missing for rollback: ${entry.backupPath}`,
      );
    }

    for (const entry of manifest.entries) {
      await copyFile(entry.backupPath, entry.appliedPath);
    }

    return {
      sessionId: manifest.sessionId,
      backupDir: manifest.backupDir,
      restoredCount: manifest.entries.length,
      restoredPaths: manifest.entries.map((entry) => entry.appliedPath),
    };
  }

  throw new Error(`No rollback session found in ${backupRootDir}`);
}
