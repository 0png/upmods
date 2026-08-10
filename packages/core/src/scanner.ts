import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import pLimit from 'p-limit';
import type { ModFile, ScanOptions } from './types.js';
import { normalizeCancellation, throwIfAborted } from './abort.js';

const CACHE_VERSION = 1;
const CACHE_DIRECTORY = '.upmods-cache';
const CACHE_FILENAME = 'scan-v1.json';
const DEFAULT_HASH_CONCURRENCY = 4;

interface HashCacheEntry {
  sizeBytes: number;
  mtimeMs: number;
  ctimeMs: number;
  sha1: string;
}

interface HashCache {
  version: number;
  entries: Record<string, HashCacheEntry>;
}

function isHashCacheEntry(value: unknown): value is HashCacheEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<HashCacheEntry>;
  return typeof entry.sizeBytes === 'number'
    && typeof entry.mtimeMs === 'number'
    && typeof entry.ctimeMs === 'number'
    && typeof entry.sha1 === 'string'
    && /^[0-9a-f]{40}$/.test(entry.sha1);
}

async function readHashCache(cachePath: string): Promise<HashCache> {
  try {
    const parsed = JSON.parse(await readFile(cachePath, 'utf8')) as Partial<HashCache>;
    if (parsed.version !== CACHE_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
      return { version: CACHE_VERSION, entries: {} };
    }
    return {
      version: CACHE_VERSION,
      entries: Object.fromEntries(
        Object.entries(parsed.entries).filter((entry): entry is [string, HashCacheEntry] => (
          isHashCacheEntry(entry[1])
        )),
      ),
    };
  } catch {
    return { version: CACHE_VERSION, entries: {} };
  }
}

async function writeHashCache(cachePath: string, cache: HashCache): Promise<void> {
  const cacheDir = dirname(cachePath);
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(tempPath, `${JSON.stringify(cache)}\n`, 'utf8');
    await rename(tempPath, cachePath);
  } catch {
    // Caching is an optimization. Read-only directories must remain scannable.
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}

/**
 * Compute SHA-1 hash of a file using streaming to handle large files efficiently.
 * @param filePath Absolute path to the file
 * @returns Lowercase hex SHA-1 hash (40 characters)
 */
export async function hashFile(filePath: string, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  try {
    return await new Promise((resolve, reject) => {
      const hash = createHash('sha1');
      const stream = createReadStream(filePath, { signal });

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
      stream.on('error', (err) => reject(err));
    });
  } catch (error) {
    throw normalizeCancellation(error, signal);
  }
}

/**
 * Scan a directory for .jar files and compute their SHA-1 hashes.
 * @param dir Absolute path to the directory to scan
 * @param onProgress Optional callback invoked after each file is hashed
 * @returns Array of ModFile objects (one per .jar file found)
 */
export async function scanDirectory(
  dir: string,
  onProgress?: (done: number, total: number) => void,
  options: ScanOptions = {},
): Promise<ModFile[]> {
  const { signal } = options;
  throwIfAborted(signal);
  const entries = await readdir(dir, { withFileTypes: true });
  throwIfAborted(signal);
  const jarFiles = entries
    .filter((entry) => (
      (entry.isFile() || entry.isSymbolicLink())
        && /\.jar(?:\.(?:disabled|old|bak))?$/i.test(entry.name)
    ))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const total = jarFiles.length;
  if (total === 0) return [];

  const cacheEnabled = options.cache !== false;
  const cachePath = join(dir, CACHE_DIRECTORY, CACHE_FILENAME);
  const cache = cacheEnabled
    ? await readHashCache(cachePath)
    : { version: CACHE_VERSION, entries: {} };
  const nextEntries: Record<string, HashCacheEntry> = {};
  const requestedConcurrency = options.hashConcurrency ?? DEFAULT_HASH_CONCURRENCY;
  const concurrency = Number.isFinite(requestedConcurrency)
    ? Math.max(1, Math.floor(requestedConcurrency))
    : DEFAULT_HASH_CONCURRENCY;
  const limit = pLimit(concurrency);
  let done = 0;

  const results = await Promise.all(jarFiles.map((filename) => limit(async (): Promise<ModFile> => {
    throwIfAborted(signal);
    const filePath = join(dir, filename);
    const stats = await stat(filePath);
    throwIfAborted(signal);
    const cached = cache.entries[filename];
    const sha1 = cached
      && cached.sizeBytes === stats.size
      && cached.mtimeMs === stats.mtimeMs
      && cached.ctimeMs === stats.ctimeMs
      ? cached.sha1
      : await hashFile(filePath, signal);

    nextEntries[filename] = {
      sizeBytes: stats.size,
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
      sha1,
    };
    done += 1;
    onProgress?.(done, total);

    return {
      path: filePath,
      filename,
      sha1,
      sizeBytes: stats.size,
      disabled: /\.jar\.(?:disabled|old|bak)$/i.test(filename),
    };
  })));

  throwIfAborted(signal);
  if (cacheEnabled) {
    await writeHashCache(cachePath, { version: CACHE_VERSION, entries: nextEntries });
  }

  return results;
}
