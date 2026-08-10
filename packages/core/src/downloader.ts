import { request } from 'undici';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import path from 'node:path';
import { ensureDir } from 'fs-extra';
import type { ModUpdate, DownloadResult } from './types.js';
import {
  isOperationCancelledError,
  normalizeCancellation,
  throwIfAborted,
} from './abort.js';

const USER_AGENT = 'upmods/0.2.0 (https://github.com/0png/upmods)';
const PROGRESS_INTERVAL_MS = 50;

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
  signal?: AbortSignal,
): Promise<DownloadResult> {
  throwIfAborted(signal);
  if (path.basename(update.downloadFilename) !== update.downloadFilename) {
    return {
      update,
      success: false,
      errorReason: `Unsafe download filename: ${update.downloadFilename}`,
    };
  }

  const tempPath = path.join(outputDir, `${update.downloadFilename}.tmp`);
  const finalPath = path.join(outputDir, update.downloadFilename);

  await ensureDir(outputDir);
  throwIfAborted(signal);

  try {
    const { statusCode, headers, body } = await request(update.downloadUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal,
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
    let lastReportedBytes = 0;
    let lastReportedAt = 0;
    const sha512 = update.downloadSha512 ? createHash('sha512') : null;
    const sha1 = update.downloadSha1 ? createHash('sha1') : null;

    const reportProgress = () => {
      lastReportedBytes = bytesReceived;
      lastReportedAt = Date.now();
      onProgress(bytesReceived, totalBytes);
    };

    const progressTransform = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytesReceived += chunk.length;
        sha512?.update(chunk);
        sha1?.update(chunk);
        const now = Date.now();
        if (bytesReceived === totalBytes || now - lastReportedAt >= PROGRESS_INTERVAL_MS) {
          reportProgress();
        }
        callback(null, chunk);
      },
      flush(callback) {
        if (lastReportedBytes !== bytesReceived) reportProgress();
        callback();
      },
    });

    const writeStream = createWriteStream(tempPath);
    await pipeline(body, progressTransform, writeStream, { signal });

    const actualSha512 = sha512?.digest('hex');
    if (actualSha512 && actualSha512 !== update.downloadSha512?.toLowerCase()) {
      throw new Error(`SHA-512 mismatch for ${update.downloadFilename}`);
    }
    const actualSha1 = sha1?.digest('hex');
    if (actualSha1 && actualSha1 !== update.downloadSha1?.toLowerCase()) {
      throw new Error(`SHA-1 mismatch for ${update.downloadFilename}`);
    }

    throwIfAborted(signal);
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

    const normalized = normalizeCancellation(err, signal);
    if (isOperationCancelledError(normalized)) throw normalized;
    return {
      update,
      success: false,
      errorReason: normalized instanceof Error ? normalized.message : String(normalized),
    };
  }
}
