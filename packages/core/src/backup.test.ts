import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { Mod, ModUpdate } from './types.js';
import { applyDownloadedUpdates, rollbackLatestBackupSession } from './backup.js';

function makeMod(modsDir: string, filename: string, slug: string): Mod {
  const filePath = path.join(modsDir, filename);
  return {
    file: {
      path: filePath,
      filename,
      sha1: `${slug}-sha1`,
      sizeBytes: 128,
    },
    projectId: `${slug}-project`,
    projectSlug: slug,
    displayName: slug,
    installedVersionId: `${slug}-installed`,
    installedVersionNumber: '1.0.0',
    loaders: ['fabric'],
    supportedMcVersions: ['1.21.1'],
  };
}

function makeUpdate(mod: Mod, downloadedFilename: string): ModUpdate {
  return {
    mod,
    latestVersionId: `${mod.projectSlug}-latest`,
    latestVersionNumber: '2.0.0',
    downloadUrl: `https://example.com/${downloadedFilename}`,
    downloadFilename: downloadedFilename,
    downloadSizeBytes: 256,
    status: 'pending',
  };
}

describe('backup/apply/rollback', () => {
  it('creates a backup session manifest and restores the latest session', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');

    await mkdir(modsDir, { recursive: true });
    await mkdir(downloadedDir, { recursive: true });

    const mod = makeMod(modsDir, 'sodium.jar', 'sodium');
    const update = makeUpdate(mod, 'sodium-2.0.0.jar');

    await writeFile(mod.file.path, 'old-version');
    await writeFile(path.join(downloadedDir, update.downloadFilename), 'new-version');

    const applyResult = await applyDownloadedUpdates([update], downloadedDir, modsDir);

    expect(applyResult.appliedCount).toBe(1);
    expect(await readFile(mod.file.path, 'utf8')).toBe('new-version');
    expect(await readFile(applyResult.session.manifestPath, 'utf8')).toContain('"sessionId"');
    expect(await readFile(applyResult.session.entries[0].backupPath, 'utf8')).toBe('old-version');

    const rollbackResult = await rollbackLatestBackupSession(modsDir);

    expect(rollbackResult.restoredCount).toBe(1);
    expect(rollbackResult.sessionId).toBe(applyResult.session.sessionId);
    expect(await readFile(mod.file.path, 'utf8')).toBe('old-version');

    await rm(rootDir, { recursive: true, force: true });
  });

  it('refuses to restore a manifest entry outside the mods directory', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');
    const outsideDir = path.join(rootDir, 'outside');

    await mkdir(modsDir, { recursive: true });
    await mkdir(downloadedDir, { recursive: true });
    await mkdir(outsideDir, { recursive: true });

    const mod = makeMod(modsDir, 'iris.jar', 'iris');
    const update = makeUpdate(mod, 'iris-2.0.0.jar');

    await writeFile(mod.file.path, 'old-iris');
    await writeFile(path.join(downloadedDir, update.downloadFilename), 'new-iris');

    const applyResult = await applyDownloadedUpdates([update], downloadedDir, modsDir);
    const manifest = JSON.parse(await readFile(applyResult.session.manifestPath, 'utf8')) as {
      entries: Array<{ appliedPath: string }>;
    };
    manifest.entries[0].appliedPath = path.join(outsideDir, 'evil.jar');
    await writeFile(
      applyResult.session.manifestPath,
      JSON.stringify(manifest, null, 2),
    );

    await expect(rollbackLatestBackupSession(modsDir)).rejects.toThrow(
      'Refusing to restore outside mods directory',
    );

    await rm(rootDir, { recursive: true, force: true });
  });
});
