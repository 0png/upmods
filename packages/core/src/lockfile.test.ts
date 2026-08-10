import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Mod, ModFile, ScanResult } from './types.js';
import {
  compareModpackLockfile,
  createModpackLockfile,
  readModpackLockfile,
  writeModpackLockfile,
} from './lockfile.js';

function makeFile(filename: string, sha1: string): ModFile {
  return { path: path.join('/mods', filename), filename, sha1, sizeBytes: 100 };
}

function makeMod(projectId: string, versionId: string, sha1: string): Mod {
  return {
    file: makeFile(`${projectId}.jar`, sha1),
    projectId,
    projectSlug: projectId,
    displayName: projectId,
    installedVersionId: versionId,
    installedVersionNumber: versionId,
    loaders: ['fabric'],
    supportedMcVersions: ['1.21.1'],
  };
}

function makeScan(directory: string, identified: Mod[], unidentified: ModFile[] = []): ScanResult {
  return {
    directory,
    totalFiles: identified.length + unidentified.length,
    identifiedCount: identified.length,
    unidentifiedCount: unidentified.length,
    durationMs: 10,
    identified,
    unidentified,
  };
}

describe('modpack lockfile', () => {
  it('creates a deterministic, portable inventory', () => {
    const scan = makeScan('/mods', [
      makeMod('z-project', 'v2', 'b'.repeat(40)),
      makeMod('a-project', 'v1', 'a'.repeat(40)),
    ], [makeFile('manual.jar', 'c'.repeat(40))]);

    const lockfile = createModpackLockfile(scan, new Date('2026-08-10T00:00:00.000Z'));

    expect(lockfile.createdAt).toBe('2026-08-10T00:00:00.000Z');
    expect(lockfile.mods.map((mod) => mod.projectId)).toEqual(['a-project', 'z-project']);
    expect(JSON.stringify(lockfile)).not.toContain('/mods');
  });

  it('writes and reads a lockfile atomically', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'upmods-lock-test-'));
    try {
      const scan = makeScan(directory, [makeMod('sodium', 'v1', 'a'.repeat(40))]);
      const written = await writeModpackLockfile(scan);
      const lockfilePath = path.join(directory, '.upmods-lock.json');
      const read = await readModpackLockfile(lockfilePath);

      expect(read).toEqual(written);
      expect(await readFile(lockfilePath, 'utf8')).toContain('"schemaVersion": 1');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('detects added, removed, and changed projects', () => {
    const original = makeScan('/mods', [
      makeMod('changed', 'v1', '1'.repeat(40)),
      makeMod('removed', 'v1', '2'.repeat(40)),
    ]);
    const current = makeScan('/mods', [
      makeMod('changed', 'v2', '3'.repeat(40)),
      makeMod('added', 'v1', '4'.repeat(40)),
    ]);

    const result = compareModpackLockfile(createModpackLockfile(original), current);

    expect(result.valid).toBe(false);
    expect(result.changes.map((change) => `${change.kind}:${change.displayName}`).sort()).toEqual([
      'added:added',
      'changed:changed',
      'removed:removed',
    ]);
  });

  it('treats unidentified content as portable across filename changes', () => {
    const hash = 'a'.repeat(40);
    const original = makeScan('/mods', [], [makeFile('old-name.jar', hash)]);
    const current = makeScan('/mods', [], [makeFile('new-name.jar', hash)]);

    const result = compareModpackLockfile(createModpackLockfile(original), current);

    expect(result.valid).toBe(true);
  });

  it('rejects malformed lockfiles', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'upmods-lock-test-'));
    const lockfilePath = path.join(directory, '.upmods-lock.json');
    try {
      await writeFile(lockfilePath, '{"schemaVersion":99}', 'utf8');
      await expect(readModpackLockfile(lockfilePath)).rejects.toThrow('Invalid upmods lockfile');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
