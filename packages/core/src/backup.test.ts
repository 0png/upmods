import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
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
    const installedPath = path.join(modsDir, update.downloadFilename);

    expect(applyResult.appliedCount).toBe(1);
    expect(applyResult.appliedPaths).toEqual([installedPath]);
    await expect(stat(mod.file.path)).rejects.toThrow();
    expect(await readFile(installedPath, 'utf8')).toBe('new-version');
    expect(await readFile(applyResult.session.manifestPath, 'utf8')).toContain('"schemaVersion": 2');
    expect(applyResult.session.status).toBe('applied');
    expect(applyResult.session.entries[0].operation).toBe('rename');
    expect(await readFile(applyResult.session.entries[0].backupPath, 'utf8')).toBe('old-version');

    const rollbackResult = await rollbackLatestBackupSession(modsDir);

    expect(rollbackResult.restoredCount).toBe(1);
    expect(rollbackResult.sessionId).toBe(applyResult.session.sessionId);
    expect(await readFile(mod.file.path, 'utf8')).toBe('old-version');
    await expect(stat(installedPath)).rejects.toThrow();
    expect(rollbackResult.removedPaths).toEqual([installedPath]);
    expect(JSON.parse(await readFile(applyResult.session.manifestPath, 'utf8')).status).toBe('rolled-back');
    await expect(rollbackLatestBackupSession(modsDir)).rejects.toThrow('No rollback session found');

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
      'Refusing to remove outside mods directory',
    );

    await rm(rootDir, { recursive: true, force: true });
  });

  it('does not mutate installed files when a staged update is invalid', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');
    await mkdir(downloadedDir, { recursive: true });

    const firstMod = makeMod(modsDir, 'first.jar', 'first');
    const secondMod = makeMod(modsDir, 'second.jar', 'second');
    const firstUpdate = makeUpdate(firstMod, 'first-new.jar');
    const secondUpdate = makeUpdate(secondMod, 'second-new.jar');
    await writeFile(firstMod.file.path, 'first-old');
    await writeFile(secondMod.file.path, 'second-old');
    await writeFile(path.join(downloadedDir, firstUpdate.downloadFilename), 'first-new');
    await mkdir(path.join(downloadedDir, secondUpdate.downloadFilename));

    await expect(applyDownloadedUpdates(
      [firstUpdate, secondUpdate],
      downloadedDir,
      modsDir,
    )).rejects.toThrow('Downloaded update not found or not a file');

    expect(await readFile(firstMod.file.path, 'utf8')).toBe('first-old');
    expect(await readFile(secondMod.file.path, 'utf8')).toBe('second-old');
    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects a staged file changed after download verification before touching installed mods', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-checksum-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');
    await mkdir(downloadedDir, { recursive: true });
    const mod = makeMod(modsDir, 'guarded.jar', 'guarded');
    const update = makeUpdate(mod, 'guarded-2.0.0.jar');
    const verifiedContent = Buffer.from('verified-download');
    update.downloadSha512 = createHash('sha512').update(verifiedContent).digest('hex');
    update.downloadSha1 = createHash('sha1').update(verifiedContent).digest('hex');
    await writeFile(mod.file.path, 'installed-version');
    await writeFile(path.join(downloadedDir, update.downloadFilename), 'changed-after-download');

    await expect(applyDownloadedUpdates([update], downloadedDir, modsDir)).rejects.toThrow(
      'no installed files were changed',
    );

    expect(await readFile(mod.file.path, 'utf8')).toBe('installed-version');
    await expect(stat(path.join(modsDir, update.downloadFilename))).rejects.toThrow();
    expect(await readdir(path.join(modsDir, '.upmods-backup'))).toEqual([]);
    expect((await readdir(modsDir)).some((name) => name.startsWith('.upmods-apply-'))).toBe(false);
    await rm(rootDir, { recursive: true, force: true });
  });

  it('refuses to read rollback content outside its backup session', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');
    const outsideBackup = path.join(rootDir, 'outside-backup.jar');
    await mkdir(downloadedDir, { recursive: true });
    const mod = makeMod(modsDir, 'old.jar', 'unsafe-backup');
    const update = makeUpdate(mod, 'new.jar');
    await writeFile(mod.file.path, 'old');
    await writeFile(path.join(downloadedDir, 'new.jar'), 'new');
    await writeFile(outsideBackup, 'attacker-controlled');
    const applied = await applyDownloadedUpdates([update], downloadedDir, modsDir);
    const manifest = JSON.parse(await readFile(applied.session.manifestPath, 'utf8'));
    manifest.entries[0].backupPath = outsideBackup;
    await writeFile(applied.session.manifestPath, JSON.stringify(manifest));

    await expect(rollbackLatestBackupSession(modsDir))
      .rejects.toThrow('outside its session directory');
    expect(await readFile(path.join(modsDir, 'new.jar'), 'utf8')).toBe('new');
    await rm(rootDir, { recursive: true, force: true });
  });

  it('replaces in place when Modrinth keeps the installed filename', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');
    await mkdir(downloadedDir, { recursive: true });
    const mod = makeMod(modsDir, 'same-name.jar', 'same-name');
    const update = makeUpdate(mod, 'same-name.jar');
    await writeFile(mod.file.path, 'old');
    await writeFile(path.join(downloadedDir, update.downloadFilename), 'new');

    const applied = await applyDownloadedUpdates([update], downloadedDir, modsDir);
    expect(applied.session.entries[0].operation).toBe('replace-in-place');
    expect(await readFile(mod.file.path, 'utf8')).toBe('new');
    await rollbackLatestBackupSession(modsDir);
    expect(await readFile(mod.file.path, 'utf8')).toBe('old');
    await rm(rootDir, { recursive: true, force: true });
  });

  it('refuses to overwrite a pre-existing target filename before changing installed files', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');
    await mkdir(downloadedDir, { recursive: true });
    const mod = makeMod(modsDir, 'old.jar', 'collision');
    const update = makeUpdate(mod, 'new.jar');
    await writeFile(mod.file.path, 'old');
    await writeFile(path.join(modsDir, 'new.jar'), 'unrelated');
    await writeFile(path.join(downloadedDir, 'new.jar'), 'download');

    await expect(applyDownloadedUpdates([update], downloadedDir, modsDir))
      .rejects.toThrow('Refusing to overwrite existing target');
    expect(await readFile(mod.file.path, 'utf8')).toBe('old');
    expect(await readFile(path.join(modsDir, 'new.jar'), 'utf8')).toBe('unrelated');
    await rm(rootDir, { recursive: true, force: true });
  });

  it('refuses two updates that resolve to the same target filename', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');
    await mkdir(downloadedDir, { recursive: true });
    const first = makeUpdate(makeMod(modsDir, 'first.jar', 'first'), 'shared.jar');
    const second = makeUpdate(makeMod(modsDir, 'second.jar', 'second'), 'shared.jar');
    await writeFile(first.mod.file.path, 'first-old');
    await writeFile(second.mod.file.path, 'second-old');
    await writeFile(path.join(downloadedDir, 'shared.jar'), 'new');

    await expect(applyDownloadedUpdates([first, second], downloadedDir, modsDir))
      .rejects.toThrow('Update filename collision');
    expect(await readFile(first.mod.file.path, 'utf8')).toBe('first-old');
    expect(await readFile(second.mod.file.path, 'utf8')).toBe('second-old');
    await rm(rootDir, { recursive: true, force: true });
  });

  it('refuses rollback when a renamed original path has been reoccupied', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');
    await mkdir(downloadedDir, { recursive: true });
    const mod = makeMod(modsDir, 'old.jar', 'occupied');
    const update = makeUpdate(mod, 'new.jar');
    await writeFile(mod.file.path, 'old');
    await writeFile(path.join(downloadedDir, 'new.jar'), 'new');
    await applyDownloadedUpdates([update], downloadedDir, modsDir);
    await writeFile(mod.file.path, 'manual-file');

    await expect(rollbackLatestBackupSession(modsDir)).rejects.toThrow('original path is occupied');
    expect(await readFile(mod.file.path, 'utf8')).toBe('manual-file');
    expect(await readFile(path.join(modsDir, 'new.jar'), 'utf8')).toBe('new');
    await rm(rootDir, { recursive: true, force: true });
  });

  it('skips newer failed manifests and rolls back the latest successful apply', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');
    await mkdir(downloadedDir, { recursive: true });
    const mod = makeMod(modsDir, 'old.jar', 'skip-failed');
    const update = makeUpdate(mod, 'new.jar');
    await writeFile(mod.file.path, 'old');
    await writeFile(path.join(downloadedDir, 'new.jar'), 'new');
    const applied = await applyDownloadedUpdates([update], downloadedDir, modsDir);
    const failedDir = path.join(modsDir, '.upmods-backup', 'zzzz-failed');
    await mkdir(failedDir, { recursive: true });
    await writeFile(path.join(failedDir, 'manifest.json'), JSON.stringify({
      schemaVersion: 2,
      sessionId: 'zzzz-failed',
      createdAt: new Date().toISOString(),
      modsDir,
      backupDir: failedDir,
      manifestPath: path.join(failedDir, 'manifest.json'),
      entries: [],
      status: 'failed',
    }));

    const rolledBack = await rollbackLatestBackupSession(modsDir);
    expect(rolledBack.sessionId).toBe(applied.session.sessionId);
    expect(await readFile(mod.file.path, 'utf8')).toBe('old');
    await rm(rootDir, { recursive: true, force: true });
  });

  it('rolls back legacy manifests without schema or status fields', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const sessionDir = path.join(modsDir, '.upmods-backup', '2026-legacy');
    const backupDir = path.join(sessionDir, 'mods');
    const installedPath = path.join(modsDir, 'legacy.jar');
    const backupPath = path.join(backupDir, '001-legacy.jar');
    const manifestPath = path.join(sessionDir, 'manifest.json');
    await mkdir(backupDir, { recursive: true });
    await writeFile(installedPath, 'updated');
    await writeFile(backupPath, 'old');
    await writeFile(manifestPath, JSON.stringify({
      sessionId: '2026-legacy',
      createdAt: '2026-01-01T00:00:00.000Z',
      modsDir,
      backupDir: sessionDir,
      manifestPath,
      entries: [{
        projectId: 'legacy-project',
        projectSlug: 'legacy',
        displayName: 'Legacy',
        installedVersionId: 'old-version',
        latestVersionId: 'new-version',
        originalPath: installedPath,
        backupPath,
        downloadedPath: path.join(modsDir, 'mods-updated', 'legacy.jar'),
        appliedPath: installedPath,
      }],
    }));

    const result = await rollbackLatestBackupSession(modsDir);
    expect(result.sessionId).toBe('2026-legacy');
    expect(await readFile(installedPath, 'utf8')).toBe('old');
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toMatchObject({ schemaVersion: 2, status: 'rolled-back' });
    await rm(rootDir, { recursive: true, force: true });
  });

  it('refuses staged downloads outside the staging directory', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-backup-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');
    await mkdir(downloadedDir, { recursive: true });
    const mod = makeMod(modsDir, 'safe.jar', 'safe');
    const update = makeUpdate(mod, path.join('..', 'escaped.jar'));
    await writeFile(mod.file.path, 'old');
    await writeFile(path.join(modsDir, 'escaped.jar'), 'outside-stage');

    await expect(applyDownloadedUpdates([update], downloadedDir, modsDir))
      .rejects.toThrow('Unsafe download filename');

    expect(await readFile(mod.file.path, 'utf8')).toBe('old');
    await rm(rootDir, { recursive: true, force: true });
  });
});
