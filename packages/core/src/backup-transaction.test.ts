import { describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    link: async (existingPath: string, newPath: string) => {
      if (String(newPath).replaceAll('\\', '/').endsWith('/second-new.jar')) {
        throw new Error('simulated publish failure');
      }
      return actual.link(existingPath, newPath);
    },
  };
});

const { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } = await import('node:fs/promises');
const { applyDownloadedUpdates } = await import('./backup.js');
const { createHash } = await import('node:crypto');
import type { Mod, ModUpdate } from './types.js';

function makeUpdate(modsDir: string, oldFilename: string, newFilename: string, id: string): ModUpdate {
  const mod: Mod = {
    file: {
      path: path.join(modsDir, oldFilename),
      filename: oldFilename,
      sha1: createHash('sha1').update(oldFilename).digest('hex'),
      sizeBytes: 3,
    },
    projectId: id,
    projectSlug: id,
    displayName: id,
    installedVersionId: `${id}-old`,
    installedVersionNumber: '1.0.0',
  };
  return {
    mod,
    latestVersionId: `${id}-new`,
    latestVersionNumber: '2.0.0',
    downloadUrl: `https://example.invalid/${newFilename}`,
    downloadFilename: newFilename,
    changelog: null,
  };
}

describe('Apply transaction failure recovery', () => {
  it('restores every original after a later publish fails', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-transaction-test-'));
    const modsDir = path.join(rootDir, 'mods');
    const downloadedDir = path.join(modsDir, 'mods-updated');
    await mkdir(downloadedDir, { recursive: true });
    const updates = [
      makeUpdate(modsDir, 'first-old.jar', 'first-new.jar', 'first'),
      makeUpdate(modsDir, 'second-old.jar', 'second-new.jar', 'second'),
    ];
    await writeFile(updates[0]!.mod.file.path, 'first-old');
    await writeFile(updates[1]!.mod.file.path, 'second-old');
    await writeFile(path.join(downloadedDir, 'first-new.jar'), 'first-new');
    await writeFile(path.join(downloadedDir, 'second-new.jar'), 'second-new');

    await expect(applyDownloadedUpdates(updates, downloadedDir, modsDir))
      .rejects.toThrow('all attempted changes were restored');

    expect(await readFile(updates[0]!.mod.file.path, 'utf8')).toBe('first-old');
    expect(await readFile(updates[1]!.mod.file.path, 'utf8')).toBe('second-old');
    await expect(stat(path.join(modsDir, 'first-new.jar'))).rejects.toThrow();
    await expect(stat(path.join(modsDir, 'second-new.jar'))).rejects.toThrow();

    const sessions = await readdir(path.join(modsDir, '.upmods-backup'));
    expect(sessions).toHaveLength(1);
    const manifest = JSON.parse(await readFile(
      path.join(modsDir, '.upmods-backup', sessions[0]!, 'manifest.json'),
      'utf8',
    ));
    expect(manifest).toMatchObject({ schemaVersion: 2, status: 'failed' });

    await rm(rootDir, { recursive: true, force: true });
  });
});
