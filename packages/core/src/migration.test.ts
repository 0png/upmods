import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { LoaderMigrationPlan, MigrationEntry, Mod } from './types.js';

vi.mock('./downloader.js', () => ({
  downloadFile: vi.fn(async (update, outputDir) => {
    const outputPath = path.join(outputDir, update.downloadFilename);
    await writeFile(outputPath, 'downloaded');
    return { update, success: true, outputPath };
  }),
}));

import { detectSourceLoader, materializeMigrationPlan } from './migration.js';
import { downloadFile } from './downloader.js';

function makeMod(name: string, loaders: string[]): Mod {
  return {
    file: { path: `/mods/${name}.jar`, filename: `${name}.jar`, sha1: name, sizeBytes: 10 },
    projectId: name,
    projectSlug: name,
    displayName: name,
    installedVersionId: `${name}-v1`,
    installedVersionNumber: '1.0.0',
    loaders,
    supportedMcVersions: ['1.21.1'],
  };
}

describe('detectSourceLoader', () => {
  it('detects the most common loader', () => {
    const result = detectSourceLoader([
      makeMod('one', ['forge']),
      makeMod('two', ['forge']),
      makeMod('three', ['fabric']),
    ]);

    expect(result.detected).toBe('forge');
    expect(result.ambiguous).toBe(false);
  });

  it('marks a tie as ambiguous and uses common-loader priority deterministically', () => {
    const result = detectSourceLoader([
      makeMod('one', ['forge']),
      makeMod('two', ['fabric']),
    ]);

    expect(result.detected).toBe('fabric');
    expect(result.ambiguous).toBe(true);
  });

  it('returns null when no loader metadata exists', () => {
    expect(detectSourceLoader([makeMod('one', [])])).toEqual({
      detected: null,
      candidates: [],
      ambiguous: false,
    });
  });
});

describe('materializeMigrationPlan', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'upmods-migration-'));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  function makePlan(entries: MigrationEntry[], complete = true): LoaderMigrationPlan {
    return {
      sourceLoader: 'forge',
      targetLoader: 'fabric',
      mcVersion: '1.21.1',
      entries,
      issues: complete ? [] : [{
        id: 'unavailable:test',
        kind: 'unavailable',
        displayName: 'Missing',
        projectId: 'missing',
        message: 'No Fabric version',
      }],
      complete,
    };
  }

  it('copies compatible roots and excludes unselected optional dependencies', async () => {
    const sourcePath = path.join(rootDir, 'universal.jar');
    await writeFile(sourcePath, 'universal');
    const sourceMod = makeMod('universal', ['forge', 'fabric']);
    sourceMod.file.path = sourcePath;
    const compatible: MigrationEntry = {
      id: 'root:universal',
      displayName: 'Universal',
      projectId: 'universal',
      projectSlug: 'universal',
      sourceMod,
      sourceLoader: 'forge',
      targetLoader: 'fabric',
      targetVersionId: 'universal-v1',
      targetVersionNumber: '1.0.0',
      status: 'compatible',
      dependencyType: 'root',
      locked: true,
      activationKeys: ['root'],
    };
    const optionalMod = makeMod('optional', ['fabric']);
    const optional: MigrationEntry = {
      id: 'dependency:optional',
      displayName: 'Optional',
      projectId: 'optional',
      projectSlug: 'optional',
      sourceLoader: 'forge',
      targetLoader: 'fabric',
      targetVersionId: 'optional-v1',
      targetVersionNumber: '1.0.0',
      status: 'optional',
      dependencyType: 'optional',
      locked: false,
      activationKeys: ['dependency:optional'],
      update: {
        mod: optionalMod,
        latestVersionId: 'optional-v1',
        latestVersionNumber: '1.0.0',
        downloadUrl: 'https://example.com/optional.jar',
        downloadFilename: 'optional.jar',
        downloadSizeBytes: 10,
        status: 'pending',
      },
    };
    const outputDir = path.join(rootDir, 'mods-updated', 'fabric-1.21.1');

    const result = await materializeMigrationPlan(makePlan([compatible, optional]), [], outputDir);

    expect(await readFile(path.join(outputDir, 'universal.jar'), 'utf8')).toBe('universal');
    await expect(readFile(path.join(outputDir, 'optional.jar'))).rejects.toThrow();
    expect(result.copiedCount).toBe(1);
    expect(result.downloadedCount).toBe(0);
  });

  it('refuses to replace an output directory without a valid manifest', async () => {
    const outputDir = path.join(rootDir, 'mods-updated', 'fabric-1.21.1');
    await fsEnsureDir(outputDir);
    await writeFile(path.join(outputDir, 'user-file.jar'), 'keep');

    await expect(materializeMigrationPlan(makePlan([]), [], outputDir))
      .rejects.toThrow('Refusing to replace unmanaged migration directory');
  });

  it('publishes partial plans with an incomplete manifest', async () => {
    const outputDir = path.join(rootDir, 'mods-updated', 'fabric-1.21.1');
    const result = await materializeMigrationPlan(makePlan([], false), [], outputDir);
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8')) as { complete: boolean };

    expect(result.complete).toBe(false);
    expect(manifest.complete).toBe(false);
  });

  it('publishes an incomplete result when an individual download fails', async () => {
    const mod = makeMod('convertible', ['forge']);
    const entry: MigrationEntry = {
      id: 'root:convertible',
      displayName: 'Convertible',
      projectId: 'convertible',
      projectSlug: 'convertible',
      sourceMod: mod,
      sourceLoader: 'forge',
      targetLoader: 'fabric',
      targetVersionId: 'convertible-fabric',
      targetVersionNumber: '2.0.0',
      status: 'convertible',
      dependencyType: 'root',
      locked: true,
      activationKeys: ['root'],
      update: {
        mod,
        latestVersionId: 'convertible-fabric',
        latestVersionNumber: '2.0.0',
        downloadUrl: 'https://example.com/convertible.jar',
        downloadFilename: 'convertible-fabric.jar',
        downloadSizeBytes: 10,
        status: 'pending',
      },
    };
    vi.mocked(downloadFile).mockResolvedValueOnce({
      update: entry.update!,
      success: false,
      errorReason: 'network failed',
    });
    const outputDir = path.join(rootDir, 'mods-updated', 'fabric-1.21.1');

    const result = await materializeMigrationPlan(makePlan([entry]), [], outputDir);

    expect(result.complete).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.manifest.files[0]?.errorReason).toBe('network failed');
  });
});

async function fsEnsureDir(directory: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(directory, { recursive: true });
}
