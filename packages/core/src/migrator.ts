import path from 'node:path';
import fs from 'node:fs/promises';
import fse from 'fs-extra';
import pLimit from 'p-limit';
import type { Mod, MigrationResult } from './types.js';
import { hashFile } from './scanner.js';

/**
 * Migrate a list of already-compatible mods to the output directory via
 * safe copy-then-verify-then-delete. The source file is only deleted after
 * SHA-1 of the destination is confirmed to match the source.
 *
 * Uses pLimit(5) for concurrency. Overwrites existing destination files.
 *
 * @param mods Array of Mod objects whose files are to be migrated
 * @param outputDir Absolute path to the output directory (created if absent)
 * @returns Array of MigrationResult (one per mod, in the same order)
 */
export async function migrateCompatibleMods(
  mods: Mod[],
  outputDir: string,
): Promise<MigrationResult[]> {
  await fse.ensureDir(outputDir);

  const limit = pLimit(5);

  const tasks = mods.map((mod) =>
    limit(async (): Promise<MigrationResult> => {
      const destPath = path.join(outputDir, mod.file.filename);

      try {
        // 1. Copy source to destination (overwrites if already exists)
        await fs.copyFile(mod.file.path, destPath);

        // 2. Verify integrity: compute SHA-1 of source and destination
        const [srcHash, dstHash] = await Promise.all([
          hashFile(mod.file.path),
          hashFile(destPath),
        ]);

        if (srcHash !== dstHash) {
          // Hashes differ — partial/corrupted copy, clean up destination
          try {
            await fs.unlink(destPath);
          } catch {
            // Ignore cleanup errors
          }
          return {
            mod,
            success: false,
            sourceDeleted: false,
            errorReason: 'Copy verification failed: hash mismatch',
          };
        }

        // 3. Hashes match — safe to delete source
        await fs.unlink(mod.file.path);

        return { mod, success: true, outputPath: destPath, sourceDeleted: true };
      } catch (err) {
        // On any unexpected error, attempt to clean up the partial destination
        try {
          await fs.unlink(destPath);
        } catch {
          // Ignore cleanup errors
        }
        return {
          mod,
          success: false,
          sourceDeleted: false,
          errorReason: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return Promise.all(tasks);
}
