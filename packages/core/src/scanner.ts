import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModFile } from './types.js';

/**
 * Compute SHA-1 hash of a file using streaming to handle large files efficiently.
 * @param filePath Absolute path to the file
 * @returns Lowercase hex SHA-1 hash (40 characters)
 */
export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Scan a directory for .jar files and compute their SHA-1 hashes.
 * @param dir Absolute path to the directory to scan
 * @param onProgress Optional callback invoked after each file is hashed
 * @returns Array of ModFile objects (one per .jar file found)
 */
export async function scanDirectory(
  dir: string,
  onProgress?: (done: number, total: number) => void
): Promise<ModFile[]> {
  const entries = await readdir(dir);
  const jarFiles = entries.filter((name) => name.toLowerCase().endsWith('.jar'));

  const total = jarFiles.length;
  const results: ModFile[] = [];

  for (let i = 0; i < jarFiles.length; i++) {
    const filename = jarFiles[i];
    const path = join(dir, filename);
    const stats = await stat(path);
    const sha1 = await hashFile(path);

    results.push({
      path,
      filename,
      sha1,
      sizeBytes: stats.size,
    });

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return results;
}
