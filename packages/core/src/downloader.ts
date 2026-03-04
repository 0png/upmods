import { request } from 'undici';
import { createWriteStream } from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import path from 'node:path';
import { ensureDir } from 'fs-extra';
import type { ModUpdate, DownloadResult } from './types.js';

const USER_AGENT = 'upmods/0.1.0 (https://github.com/user/upmods)';

/**
 * Download a single mod update to a file.
 * Writes to a .tmp file first, then renames to the final name on success.
 * Deletes the .tmp file on failure (no partial files left behind).
 * @param update The mod update to download
 * @param outputDir Absolute path to the output directory (created if absent)
 * @param onProgress Called with (bytesReceived, totalBytes) as data arrives
 * @returns DownloadResult — never throws
 */
export async function downloadFile(
  update: ModUpdate,
  outputDir: string,
  onProgress: (bytesReceived: number, totalBytes: number) => void,
): Promise<DownloadResult> {
  const tempPath = path.join(outputDir, `${update.downloadFilename}.tmp`);
  const finalPath = path.join(outputDir, update.downloadFilename);

  await ensureDir(outputDir);

  try {
    const { statusCode, headers, body } = await request(update.downloadUrl, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (statusCode < 200 || statusCode >= 300) {
      // Drain the body to avoid memory leaks
      body.resume();
      throw new Error(`HTTP ${statusCode} from ${update.downloadUrl}`);
    }

    const totalBytes = parseInt(
      String(headers['content-length'] ?? update.downloadSizeBytes),
      10,
    );
    let bytesReceived = 0;

    const progressTransform = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytesReceived += chunk.length;
        onProgress(bytesReceived, totalBytes);
        callback(null, chunk);
      },
    });

    const writeStream = createWriteStream(tempPath);
    await pipeline(body, progressTransform, writeStream);
    await rename(tempPath, finalPath);

    return {
      update,
      success: true,
      outputPath: finalPath,
    };
  } catch (err) {
    // Clean up temp file if it exists
    try {
      await unlink(tempPath);
    } catch {
      // Ignore — temp file may not exist if the error occurred before writing
    }

    return {
      update,
      success: false,
      errorReason: err instanceof Error ? err.message : String(err),
    };
  }
}
