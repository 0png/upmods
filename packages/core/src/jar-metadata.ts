import { open, stat } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import type { LocalModDependency, LocalModMetadata, SupportedModLoader } from './types.js';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_JAR_BYTES = 1024 * 1024 * 1024;
const MAX_CENTRAL_DIRECTORY_BYTES = 8 * 1024 * 1024;
const MAX_ENTRY_COUNT = 10_000;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_COMPRESSED_METADATA_BYTES = 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const TARGET_ENTRIES = new Map<string, LocalModMetadata['format']>([
  ['fabric.mod.json', 'fabric'],
  ['quilt.mod.json', 'quilt'],
  ['meta-inf/mods.toml', 'forge'],
  ['meta-inf/neoforge.mods.toml', 'neoforge'],
]);

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function isSafeEntryName(name: string): boolean {
  const normalized = name.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return false;
  return !normalized.split('/').some((segment) => segment === '..');
}

async function readExactly(
  file: Awaited<ReturnType<typeof open>>,
  length: number,
  position: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  if (bytesRead !== length) throw new Error('Unexpected end of ZIP file');
  return buffer;
}

function findEocd(buffer: Buffer): number {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function parseCentralDirectory(buffer: Buffer, expectedEntries: number): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset + 46 <= buffer.length && entries.length < expectedEntries) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error('Invalid central directory');
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const end = offset + 46 + filenameLength + extraLength + commentLength;
    if (end > buffer.length) throw new Error('Invalid central directory entry');
    const filenameBuffer = buffer.subarray(offset + 46, offset + 46 + filenameLength);
    const name = filenameBuffer.toString((flags & 0x800) !== 0 ? 'utf8' : 'latin1');
    if (!isSafeEntryName(name)) throw new Error('Unsafe ZIP entry path');
    entries.push({ name, flags, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset = end;
  }
  if (entries.length !== expectedEntries) throw new Error('ZIP entry count mismatch');
  return entries;
}

async function readZipEntry(
  file: Awaited<ReturnType<typeof open>>,
  entry: ZipEntry,
  fileSize: number,
): Promise<Buffer> {
  if ((entry.flags & 1) !== 0) throw new Error('Encrypted metadata entry');
  if (entry.uncompressedSize > MAX_METADATA_BYTES || entry.compressedSize > MAX_COMPRESSED_METADATA_BYTES) {
    throw new Error('Metadata entry exceeds size limit');
  }
  if (entry.compressedSize === 0 && entry.uncompressedSize > 0) throw new Error('Invalid metadata compression size');
  if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO) {
    throw new Error('Metadata entry exceeds compression ratio limit');
  }
  const local = await readExactly(file, 30, entry.localHeaderOffset);
  if (local.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new Error('Invalid local ZIP header');
  const filenameLength = local.readUInt16LE(26);
  const extraLength = local.readUInt16LE(28);
  const dataOffset = entry.localHeaderOffset + 30 + filenameLength + extraLength;
  if (dataOffset < 0 || dataOffset + entry.compressedSize > fileSize) throw new Error('ZIP entry is outside the archive');
  const compressed = await readExactly(file, entry.compressedSize, dataOffset);
  let output: Buffer;
  if (entry.method === 0) output = compressed;
  else if (entry.method === 8) output = inflateRawSync(compressed, { maxOutputLength: MAX_METADATA_BYTES });
  else throw new Error(`Unsupported metadata compression method: ${entry.method}`);
  if (output.length !== entry.uncompressedSize || output.length > MAX_METADATA_BYTES) {
    throw new Error('Metadata size does not match ZIP directory');
  }
  return output;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function dependencyEntries(
  value: unknown,
  type: LocalModDependency['type'],
): LocalModDependency[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([id, range]) => ({
    id,
    type,
    ...(typeof range === 'string' ? { versionRange: range } : {}),
  }));
}

function parseFabric(text: string, sourceEntry: string): LocalModMetadata | null {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  const id = stringValue(value['id']);
  if (!id) return null;
  const depends = dependencyEntries(value['depends'], 'required');
  const minecraft = depends.find((dependency) => dependency.id === 'minecraft')?.versionRange;
  return {
    format: 'fabric',
    id,
    name: stringValue(value['name']) ?? id,
    ...(stringValue(value['version']) ? { version: stringValue(value['version']) } : {}),
    loaders: ['fabric'],
    ...(minecraft ? { minecraftVersionRange: minecraft } : {}),
    dependencies: [
      ...depends.filter((dependency) => dependency.id !== 'minecraft' && dependency.id !== 'fabricloader'),
      ...dependencyEntries(value['suggests'], 'optional'),
      ...dependencyEntries(value['breaks'], 'incompatible'),
      ...dependencyEntries(value['conflicts'], 'incompatible'),
    ],
    sourceEntry,
    warnings: [],
  };
}

function quiltDependencyEntries(value: unknown, type: LocalModDependency['type']): LocalModDependency[] {
  if (!Array.isArray(value)) return [];
  const result: LocalModDependency[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') result.push({ id: entry, type });
    else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const dependency = entry as Record<string, unknown>;
      const id = stringValue(dependency['id']);
      if (id) result.push({ id, type, ...(stringValue(dependency['versions']) ? { versionRange: stringValue(dependency['versions']) } : {}) });
    }
  }
  return result;
}

function parseQuilt(text: string, sourceEntry: string): LocalModMetadata | null {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const root = parsed as Record<string, unknown>;
  const loader = root['quilt_loader'];
  if (!loader || typeof loader !== 'object' || Array.isArray(loader)) return null;
  const value = loader as Record<string, unknown>;
  const id = stringValue(value['id']);
  if (!id) return null;
  const metadata = value['metadata'];
  const metadataObject = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
  const depends = quiltDependencyEntries(value['depends'], 'required');
  const minecraft = depends.find((dependency) => dependency.id === 'minecraft')?.versionRange;
  return {
    format: 'quilt',
    id,
    name: stringValue(metadataObject['name']) ?? id,
    ...(stringValue(value['version']) ? { version: stringValue(value['version']) } : {}),
    loaders: ['quilt'],
    ...(minecraft ? { minecraftVersionRange: minecraft } : {}),
    dependencies: [
      ...depends.filter((dependency) => dependency.id !== 'minecraft' && dependency.id !== 'quilt_loader'),
      ...quiltDependencyEntries(value['breaks'], 'incompatible'),
    ],
    sourceEntry,
    warnings: [],
  };
}

function tomlString(block: string, key: string): string | undefined {
  const match = block.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, 'mi'));
  return match?.[1];
}

function tomlBoolean(block: string, key: string): boolean | undefined {
  const match = block.match(new RegExp(`^\\s*${key}\\s*=\\s*(true|false)`, 'mi'));
  return match ? match[1]?.toLowerCase() === 'true' : undefined;
}

function parseToml(
  text: string,
  sourceEntry: string,
  format: 'forge' | 'neoforge',
): LocalModMetadata | null {
  const modBlock = text.match(/\[\[mods\]\]([\s\S]*?)(?=\[\[|$)/i)?.[1];
  if (!modBlock) return null;
  const id = tomlString(modBlock, 'modId');
  if (!id) return null;
  const dependencies: LocalModDependency[] = [];
  const dependencyPattern = /\[\[dependencies\.[^\]]+\]\]([\s\S]*?)(?=\[\[|$)/gi;
  for (const match of text.matchAll(dependencyPattern)) {
    const block = match[1] ?? '';
    const dependencyId = tomlString(block, 'modId');
    if (!dependencyId || ['minecraft', 'forge', 'neoforge', 'java'].includes(dependencyId.toLowerCase())) continue;
    const explicitType = tomlString(block, 'type')?.toLowerCase();
    const type: LocalModDependency['type'] = explicitType === 'incompatible'
      ? 'incompatible'
      : explicitType === 'optional' || tomlBoolean(block, 'mandatory') === false
        ? 'optional'
        : 'required';
    dependencies.push({
      id: dependencyId,
      type,
      ...(tomlString(block, 'versionRange') ? { versionRange: tomlString(block, 'versionRange') } : {}),
    });
  }
  const minecraftBlock = [...text.matchAll(dependencyPattern)]
    .map((match) => match[1] ?? '')
    .find((block) => tomlString(block, 'modId')?.toLowerCase() === 'minecraft');
  return {
    format,
    id,
    name: tomlString(modBlock, 'displayName') ?? id,
    ...(tomlString(modBlock, 'version') ? { version: tomlString(modBlock, 'version') } : {}),
    loaders: [format as SupportedModLoader],
    ...(minecraftBlock && tomlString(minecraftBlock, 'versionRange')
      ? { minecraftVersionRange: tomlString(minecraftBlock, 'versionRange') }
      : {}),
    dependencies,
    sourceEntry,
    warnings: [],
  };
}

function parseMetadata(format: LocalModMetadata['format'], text: string, sourceEntry: string): LocalModMetadata | null {
  if (format === 'fabric') return parseFabric(text, sourceEntry);
  if (format === 'quilt') return parseQuilt(text, sourceEntry);
  return parseToml(text, sourceEntry, format);
}

/** Reads only known metadata entries and returns null for malformed or unsafe archives. */
export async function readLocalJarMetadata(jarPath: string): Promise<LocalModMetadata | null> {
  let file: Awaited<ReturnType<typeof open>> | null = null;
  try {
    const stats = await stat(jarPath);
    if (!stats.isFile() || stats.size < 22 || stats.size > MAX_JAR_BYTES) return null;
    file = await open(jarPath, 'r');
    const tailLength = Math.min(stats.size, 65_557);
    const tail = await readExactly(file, tailLength, stats.size - tailLength);
    const eocdOffset = findEocd(tail);
    if (eocdOffset < 0) return null;
    const entryCount = tail.readUInt16LE(eocdOffset + 10);
    const centralSize = tail.readUInt32LE(eocdOffset + 12);
    const centralOffset = tail.readUInt32LE(eocdOffset + 16);
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) return null;
    if (entryCount > MAX_ENTRY_COUNT || centralSize > MAX_CENTRAL_DIRECTORY_BYTES) return null;
    if (centralOffset + centralSize > stats.size) return null;
    const central = await readExactly(file, centralSize, centralOffset);
    const entries = parseCentralDirectory(central, entryCount);
    for (const entry of entries) {
      const normalized = entry.name.replace(/\\/g, '/').toLowerCase();
      const format = TARGET_ENTRIES.get(normalized);
      if (!format) continue;
      const content = await readZipEntry(file, entry, stats.size);
      return parseMetadata(format, content.toString('utf8'), entry.name);
    }
    return null;
  } catch {
    return null;
  } finally {
    await file?.close().catch(() => undefined);
  }
}
