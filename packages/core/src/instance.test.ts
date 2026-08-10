import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  patchInstanceConfig,
  readInstanceConfig,
  resolveInstance,
  updateInstanceConfig,
  writeInstanceConfig,
} from './instance.js';

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'upmods-instance-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('resolveInstance', () => {
  it('accepts an exact mods directory', async () => withRoot(async (root) => {
    const mods = path.join(root, 'mods');
    await mkdir(mods);
    const result = await resolveInstance(mods);
    expect(result.modsDir).toBe(mods);
    expect(result.instanceDir).toBe(root);
    expect(result.kind).toBe('mods-directory');
  }));

  it('detects a Prism instance from mmc-pack.json', async () => withRoot(async (root) => {
    await mkdir(path.join(root, '.minecraft', 'mods'), { recursive: true });
    await writeFile(path.join(root, 'mmc-pack.json'), JSON.stringify({
      components: [
        { uid: 'net.minecraft', version: '1.21.1' },
        { uid: 'net.fabricmc.fabric-loader', version: '0.16.0' },
      ],
    }));
    const result = await resolveInstance(root);
    expect(result).toMatchObject({ kind: 'prism', minecraftVersion: '1.21.1', loader: 'fabric' });
    expect(result.modsDir).toBe(path.join(root, '.minecraft', 'mods'));
  }));

  it('detects CurseForge manifests', async () => withRoot(async (root) => {
    await mkdir(path.join(root, 'mods'));
    await writeFile(path.join(root, 'minecraftinstance.json'), JSON.stringify({
      gameVersion: '1.20.1', baseModLoader: { name: 'forge-47.2.0' },
    }));
    expect(await resolveInstance(root)).toMatchObject({
      kind: 'curseforge', minecraftVersion: '1.20.1', loader: 'forge',
    });
  }));

  it('prefers saved settings over conflicting launcher metadata', async () => withRoot(async (root) => {
    await mkdir(path.join(root, 'mods'));
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify({
      minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0' }] },
    }));
    await writeInstanceConfig(root, {
      schemaVersion: 1,
      minecraftVersion: '1.21.1',
      loader: 'neoforge',
      channel: 'allow-beta',
      ignored: ['example'],
      pinned: { sodium: '1.0.0' },
    });
    const result = await resolveInstance(root);
    expect(result.minecraftVersion).toBe('1.21.1');
    expect(result.loader).toBe('neoforge');
    expect(result.config.channel).toBe('allow-beta');
    expect(await readInstanceConfig(result.configPath)).toEqual(result.config);
  }));

  it('fails with an actionable message when no mods directory exists', async () => withRoot(async (root) => {
    await expect(resolveInstance(root)).rejects.toThrow('Create a mods folder or pass its exact path');
  }));

  it('refuses to guess when an instance root contains multiple mods directories', async () => withRoot(async (root) => {
    const direct = path.join(root, 'mods');
    const nested = path.join(root, '.minecraft', 'mods');
    await mkdir(direct, { recursive: true });
    await mkdir(nested, { recursive: true });

    await expect(resolveInstance(root)).rejects.toThrow('Pass the exact mods directory');
    await expect(resolveInstance(direct)).resolves.toMatchObject({ modsDir: direct });
    await expect(resolveInstance(nested)).resolves.toMatchObject({ modsDir: nested });
  }));
});

describe('instance configuration updates', () => {
  it('applies environment, ignore, and pin changes without losing existing settings', () => {
    const updated = patchInstanceConfig({
      schemaVersion: 1,
      minecraftVersion: '1.20.1',
      loader: 'forge',
      channel: 'stable-only',
      ignored: ['Sodium', 'keep-me'],
      pinned: { Lithium: 'old', keep: '1.0.0' },
    }, {
      minecraftVersion: '1.21.1',
      loader: 'fabric',
      channel: 'allow-beta',
      addIgnored: ['sodium', 'new-project'],
      removeIgnored: ['KEEP-ME'],
      setPinned: { lithium: 'mc1.21-0.14.0', new_project: 'abc123' },
      removePinned: ['KEEP'],
    });

    expect(updated).toEqual({
      schemaVersion: 1,
      minecraftVersion: '1.21.1',
      loader: 'fabric',
      channel: 'allow-beta',
      ignored: ['Sodium', 'new-project'],
      pinned: { lithium: 'mc1.21-0.14.0', new_project: 'abc123' },
    });
  });

  it('can clear saved environment fields', () => {
    expect(patchInstanceConfig({
      schemaVersion: 1,
      minecraftVersion: '1.21.1',
      loader: 'fabric',
      channel: 'stable-only',
      ignored: [],
      pinned: {},
    }, { minecraftVersion: null, loader: null })).toEqual({
      schemaVersion: 1,
      channel: 'stable-only',
      ignored: [],
      pinned: {},
    });
  });

  it('creates and persists a normalized config through the filesystem API', async () => withRoot(async (root) => {
    const result = await updateInstanceConfig(root, {
      minecraftVersion: '1.21.1',
      loader: 'neoforge',
      channel: 'allow-beta',
      addIgnored: ['example'],
      setPinned: { sodium: 'mc1.21-0.6.13' },
    });
    expect(result.configPath).toBe(path.join(root, '.upmods.json'));
    expect(await readInstanceConfig(result.configPath)).toEqual(result.config);
  }));

  it('refuses to overwrite malformed settings and provides a repair action', async () => withRoot(async (root) => {
    const configPath = path.join(root, '.upmods.json');
    await writeFile(configPath, '{ definitely not JSON');
    await expect(updateInstanceConfig(root, { channel: 'allow-beta' }))
      .rejects.toThrow('Fix the file or delete it and retry');
    expect(await readFile(configPath, 'utf8')).toBe('{ definitely not JSON');
  }));

  it('rejects invalid project references and Minecraft versions', () => {
    const config = {
      schemaVersion: 1 as const,
      channel: 'stable-only' as const,
      ignored: [],
      pinned: {},
    };
    expect(() => patchInstanceConfig(config, { addIgnored: ['../escape'] })).toThrow('Invalid project ID or slug');
    expect(() => patchInstanceConfig(config, { minecraftVersion: 'latest' })).toThrow('Use a version such as 1.21.1');
  });
});
