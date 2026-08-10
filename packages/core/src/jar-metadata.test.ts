import { deflateRawSync } from 'node:zlib';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readLocalJarMetadata } from './jar-metadata.js';

function createZip(name: string, content: string, declaredSize?: number): Buffer {
  const filename = Buffer.from(name);
  const data = Buffer.from(content);
  const compressed = deflateRawSync(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(declaredSize ?? data.length, 22);
  local.writeUInt16LE(filename.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(declaredSize ?? data.length, 24);
  central.writeUInt16LE(filename.length, 28);

  const centralOffset = local.length + filename.length + compressed.length;
  const centralDirectory = Buffer.concat([central, filename]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, filename, compressed, centralDirectory, eocd]);
}

async function withJar(name: string, content: string, run: (file: string) => Promise<void>, declaredSize?: number) {
  const root = await mkdtemp(path.join(tmpdir(), 'upmods-metadata-'));
  const jar = path.join(root, 'test.jar');
  try {
    await writeFile(jar, createZip(name, content, declaredSize));
    await run(jar);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('readLocalJarMetadata', () => {
  it('reads Fabric metadata and dependency types', async () => {
    await withJar('fabric.mod.json', JSON.stringify({
      id: 'example', name: 'Example Mod', version: '1.2.3',
      depends: { minecraft: '>=1.20', cloth_config: '*' },
      breaks: { bad_mod: '*' },
    }), async (jar) => {
      const metadata = await readLocalJarMetadata(jar);
      expect(metadata).toMatchObject({ format: 'fabric', id: 'example', name: 'Example Mod' });
      expect(metadata?.minecraftVersionRange).toBe('>=1.20');
      expect(metadata?.dependencies).toEqual(expect.arrayContaining([
        { id: 'cloth_config', type: 'required', versionRange: '*' },
        { id: 'bad_mod', type: 'incompatible', versionRange: '*' },
      ]));
    });
  });

  it('reads Quilt metadata', async () => {
    await withJar('quilt.mod.json', JSON.stringify({
      quilt_loader: {
        id: 'quilt-example', version: '2.0.0', metadata: { name: 'Quilt Example' },
        depends: [{ id: 'minecraft', versions: '1.21.1' }, { id: 'qsl' }],
      },
    }), async (jar) => {
      expect(await readLocalJarMetadata(jar)).toMatchObject({
        format: 'quilt', id: 'quilt-example', loaders: ['quilt'], minecraftVersionRange: '1.21.1',
      });
    });
  });

  it.each([
    ['META-INF/mods.toml', 'forge'],
    ['META-INF/neoforge.mods.toml', 'neoforge'],
  ] as const)('reads %s metadata', async (entry, format) => {
    const toml = `[[mods]]\nmodId="sample"\nversion="1.0"\ndisplayName="Sample"\n[[dependencies.sample]]\nmodId="minecraft"\nmandatory=true\nversionRange="[1.20,1.22)"\n[[dependencies.sample]]\nmodId="library"\nmandatory=true\nversionRange="[2,)"`;
    await withJar(entry, toml, async (jar) => {
      expect(await readLocalJarMetadata(jar)).toMatchObject({
        format, id: 'sample', minecraftVersionRange: '[1.20,1.22)',
        dependencies: [{ id: 'library', type: 'required', versionRange: '[2,)' }],
      });
    });
  });

  it('returns null for unsafe paths, malformed JSON, and oversized metadata declarations', async () => {
    await withJar('../fabric.mod.json', '{}', async (jar) => {
      expect(await readLocalJarMetadata(jar)).toBeNull();
    });
    await withJar('fabric.mod.json', '{bad', async (jar) => {
      expect(await readLocalJarMetadata(jar)).toBeNull();
    });
    await withJar('fabric.mod.json', '{}', async (jar) => {
      expect(await readLocalJarMetadata(jar)).toBeNull();
    }, 2 * 1024 * 1024);
  });
});
