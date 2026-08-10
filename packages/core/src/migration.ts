import path from 'node:path';
import { copyFile } from 'node:fs/promises';
import fsExtra from 'fs-extra';
import pLimit from 'p-limit';
import { downloadFile } from './downloader.js';
import type {
  LoaderDetection,
  LoaderMigrationPlan,
  MigrationEntry,
  MigrationManifest,
  MigrationManifestFile,
  MigrationResult,
  Mod,
} from './types.js';
import { throwIfAborted } from './abort.js';

const { ensureDir, move, pathExists, readJson, remove, writeJson } = fsExtra;
export const MIGRATION_MANIFEST_FILENAME = '.upmods-migration.json';

const LOADER_PRIORITY = ['fabric', 'forge', 'neoforge', 'quilt'];

export function detectSourceLoader(mods: Mod[]): LoaderDetection {
  const counts = new Map<string, number>();

  for (const mod of mods) {
    for (const rawLoader of new Set(mod.loaders)) {
      const loader = rawLoader.toLowerCase();
      if (loader === 'minecraft') continue;
      counts.set(loader, (counts.get(loader) ?? 0) + 1);
    }
  }

  const candidates = [...counts.entries()]
    .map(([loader, count]) => ({ loader, count }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      const aPriority = LOADER_PRIORITY.indexOf(a.loader);
      const bPriority = LOADER_PRIORITY.indexOf(b.loader);
      if (aPriority !== bPriority) {
        if (aPriority === -1) return 1;
        if (bPriority === -1) return -1;
        return aPriority - bPriority;
      }
      return a.loader.localeCompare(b.loader);
    });
  const highest = candidates[0]?.count;

  return {
    detected: candidates[0]?.loader ?? null,
    candidates,
    ambiguous: highest !== undefined && candidates.filter((candidate) => candidate.count === highest).length > 1,
  };
}

function isEntryActive(entry: MigrationEntry, selectedOptionalEntryIds: Set<string>): boolean {
  return entry.activationKeys.includes('root')
    || entry.activationKeys.some((key) => selectedOptionalEntryIds.has(key));
}

async function assertManagedOutput(outputDir: string): Promise<void> {
  if (!await pathExists(outputDir)) return;

  const manifestPath = path.join(outputDir, MIGRATION_MANIFEST_FILENAME);
  if (!await pathExists(manifestPath)) {
    throw new Error(`Refusing to replace unmanaged migration directory: ${outputDir}`);
  }

  const manifest = await readJson(manifestPath) as Partial<MigrationManifest>;
  if (manifest.schemaVersion !== 1 || path.resolve(manifest.outputDir ?? '') !== path.resolve(outputDir)) {
    throw new Error(`Refusing to replace invalid migration directory: ${outputDir}`);
  }
}

export async function materializeMigrationPlan(
  plan: LoaderMigrationPlan,
  selectedOptionalIds: string[],
  outputDir: string,
  onProgress?: (entry: MigrationEntry, bytesReceived: number, totalBytes: number) => void,
  signal?: AbortSignal,
): Promise<MigrationResult> {
  throwIfAborted(signal);
  const resolvedOutputDir = path.resolve(outputDir);
  const parentDir = path.dirname(resolvedOutputDir);
  const outputName = path.basename(resolvedOutputDir);
  const stagingDir = path.join(parentDir, `.${outputName}.upmods-tmp-${Date.now()}`);
  const previousDir = path.join(parentDir, `.${outputName}.upmods-previous-${Date.now()}`);
  const selectedOptionalEntryIds = new Set(selectedOptionalIds);

  await assertManagedOutput(resolvedOutputDir);
  await ensureDir(parentDir);
  await remove(stagingDir);
  await ensureDir(stagingDir);

  const activeEntries = plan.entries.filter((entry) =>
    entry.status !== 'unavailable' && isEntryActive(entry, selectedOptionalEntryIds));
  const files: MigrationManifestFile[] = [];
  const filenames = new Map<string, string>();
  let downloadedCount = 0;
  let copiedCount = 0;
  let failedCount = 0;

  const registerFilename = (entry: MigrationEntry, filename: string): boolean => {
    const normalized = filename.toLowerCase();
    const owner = filenames.get(normalized);
    if (!owner) {
      filenames.set(normalized, entry.id);
      return true;
    }

    files.push({
      entryId: entry.id,
      projectId: entry.projectId,
      displayName: entry.displayName,
      filename,
      source: entry.status === 'compatible' ? 'copy' : 'download',
      dependencyType: entry.dependencyType,
      success: false,
      errorReason: `Filename conflicts with ${owner}`,
    });
    failedCount += 1;
    return false;
  };

  try {
    for (const entry of activeEntries.filter((item) => item.status === 'compatible')) {
      throwIfAborted(signal);
      const sourcePath = entry.sourceMod?.file.path;
      const filename = sourcePath ? path.basename(sourcePath) : '';
      if (!sourcePath || !filename || !registerFilename(entry, filename)) continue;

      try {
        await copyFile(sourcePath, path.join(stagingDir, filename));
        copiedCount += 1;
        files.push({
          entryId: entry.id,
          projectId: entry.projectId,
          displayName: entry.displayName,
          filename,
          source: 'copy',
          dependencyType: entry.dependencyType,
          success: true,
        });
      } catch (error) {
        failedCount += 1;
        files.push({
          entryId: entry.id,
          projectId: entry.projectId,
          displayName: entry.displayName,
          filename,
          source: 'copy',
          dependencyType: entry.dependencyType,
          success: false,
          errorReason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const limit = pLimit(5);
    const downloads = activeEntries.filter((entry) => entry.status !== 'compatible' && entry.update);
    await Promise.all(downloads.map((entry) => limit(async () => {
      throwIfAborted(signal);
      const update = entry.update!;
      const filename = update.downloadFilename;
      if (!registerFilename(entry, filename)) return;

      const result = await downloadFile(update, stagingDir, (bytes, total) => {
        onProgress?.(entry, bytes, total);
      }, signal);
      if (result.success) downloadedCount += 1;
      else failedCount += 1;
      files.push({
        entryId: entry.id,
        projectId: entry.projectId,
        displayName: entry.displayName,
        filename,
        source: 'download',
        dependencyType: entry.dependencyType,
        success: result.success,
        errorReason: result.errorReason,
      });
    })));

    throwIfAborted(signal);
    const complete = plan.complete && failedCount === 0;
    const manifest: MigrationManifest = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      sourceLoader: plan.sourceLoader,
      targetLoader: plan.targetLoader,
      mcVersion: plan.mcVersion,
      outputDir: resolvedOutputDir,
      complete,
      selectedOptionalEntryIds: [...selectedOptionalEntryIds],
      files,
      issues: plan.issues,
    };
    await writeJson(path.join(stagingDir, MIGRATION_MANIFEST_FILENAME), manifest, { spaces: 2 });

    // Cancellation is safe until this point. Once replacement begins, finish or restore atomically.
    throwIfAborted(signal);
    const hadPrevious = await pathExists(resolvedOutputDir);
    if (hadPrevious) await move(resolvedOutputDir, previousDir);
    try {
      await move(stagingDir, resolvedOutputDir);
      if (hadPrevious) await remove(previousDir);
    } catch (error) {
      if (hadPrevious && await pathExists(previousDir) && !await pathExists(resolvedOutputDir)) {
        await move(previousDir, resolvedOutputDir);
      }
      throw error;
    }

    return {
      outputDir: resolvedOutputDir,
      manifestPath: path.join(resolvedOutputDir, MIGRATION_MANIFEST_FILENAME),
      complete,
      downloadedCount,
      copiedCount,
      failedCount,
      unavailableCount: plan.entries.filter((entry) => entry.status === 'unavailable').length,
      manifest,
    };
  } catch (error) {
    await remove(stagingDir);
    throw error;
  }
}
