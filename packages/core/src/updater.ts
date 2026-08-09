import { EventEmitter } from 'node:events';
import type { CoreEvents } from './events.js';
import type {
  ScanResult,
  Mod,
  ModFile,
  MCVersion,
  ModUpdate,
  DownloadResult,
  ApplyResult,
  RollbackResult,
  LoaderDetection,
  LoaderMigrationPlan,
  MigrationResult,
  ModLoader,
} from './types.js';
import { scanDirectory } from './scanner.js';
import { ModrinthClient } from './modrinth.js';
import { downloadFile } from './downloader.js';
import { applyDownloadedUpdates, rollbackLatestBackupSession } from './backup.js';
import { detectSourceLoader, materializeMigrationPlan } from './migration.js';
import pLimit from 'p-limit';

// Declaration merging: overlay typed event methods on the class
// This gives full type-safety for CoreEvents without runtime overhead
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface UpmodsCore {
  on<K extends keyof CoreEvents>(event: K, listener: CoreEvents[K]): this;
  once<K extends keyof CoreEvents>(event: K, listener: CoreEvents[K]): this;
  off<K extends keyof CoreEvents>(event: K, listener: CoreEvents[K]): this;
  emit<K extends keyof CoreEvents>(event: K, ...args: Parameters<CoreEvents[K]>): boolean;
  removeListener<K extends keyof CoreEvents>(event: K, listener: CoreEvents[K]): this;
  removeAllListeners<K extends keyof CoreEvents>(event?: K): this;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UpmodsCore extends EventEmitter {
  private readonly modrinth: ModrinthClient;

  constructor() {
    super();
    this.modrinth = new ModrinthClient();
  }

  /**
   * Scan a directory for mod files, hash them, and identify them against Modrinth.
   * Emits progress events throughout the process.
   * @param dir Absolute path to the directory to scan
   * @returns ScanResult with identified mods and unidentified files
   */
  async scanAndIdentify(dir: string): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      let totalEmitted = false;
      const files = await scanDirectory(dir, (done, total) => {
        if (!totalEmitted) {
          totalEmitted = true;
          this.emit('scan:start', dir, total);
        }
        this.emit('scan:progress', done, total);
      });

      // Handle empty directory case — emit scan:start with 0 total
      if (files.length === 0) {
        this.emit('scan:start', dir, 0);
      }

      // Identify mods via Modrinth
      const sha1s = files.map((f) => f.sha1);
      const modMap = await this.modrinth.identifyMods(sha1s);

      const identified: Mod[] = [];
      const unidentified: ModFile[] = [];

      for (const file of files) {
        const mod = modMap.get(file.sha1);
        if (mod) {
          // Attach the real local file data (path, filename) to the mod
          const fullMod: Mod = {
            ...mod,
            file: {
              ...mod.file,
              path: file.path,
              filename: file.filename,
              sizeBytes: file.sizeBytes,
            },
          };
          identified.push(fullMod);
          this.emit('mod:identified', fullMod);
        } else {
          unidentified.push(file);
        }
      }

      this.emit('identify:complete', identified, unidentified);

      const result: ScanResult = {
        directory: dir,
        totalFiles: files.length,
        identifiedCount: identified.length,
        unidentifiedCount: unidentified.length,
        durationMs: Date.now() - startTime,
        identified,
        unidentified,
      };

      this.emit('scan:complete', result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get all Minecraft release versions from Modrinth.
   * Results are cached after the first call.
   * @returns Array of MCVersion objects, sorted newest-first
   */
  async getGameVersions(): Promise<MCVersion[]> {
    try {
      return await this.modrinth.getGameVersions();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Check for available updates for a list of mods for a specific Minecraft version.
   * Emits check:complete event with results.
   * @param mods Array of identified mods
   * @param mcVersion Target Minecraft version (e.g., "1.21.1")
   * @returns Object with updates array and upToDate array
   */
  async checkUpdates(
    mods: Mod[],
    mcVersion: string,
    loader?: string,
  ): Promise<{ updates: ModUpdate[]; upToDate: Mod[] }> {
    try {
      const result = loader === undefined
        ? await this.modrinth.checkUpdates(mods, mcVersion)
        : await this.modrinth.checkUpdates(mods, mcVersion, loader);
      this.emit('check:complete', result.updates, result.upToDate);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Download all available updates to the output directory in parallel (max 5 concurrent).
   * Emits download:start, download:progress, download:complete / download:error per update.
   * Emits all:done after all downloads settle (success or failure).
   * Does NOT throw on individual download failure — all downloads are attempted.
   * @param updates Array of ModUpdate objects from checkUpdates
   * @param outputDir Absolute path to the output directory (created if absent)
   * @returns Array of DownloadResult in the same order as updates
   */
  async downloadUpdates(updates: ModUpdate[], outputDir: string): Promise<DownloadResult[]> {
    const limit = pLimit(5);

    const resultPromises = updates.map((update) =>
      limit(async (): Promise<DownloadResult> => {
        this.emit('download:start', update);

        try {
          const result = await downloadFile(
            update,
            outputDir,
            (bytesReceived: number, totalBytes: number) => {
              this.emit('download:progress', update, bytesReceived, totalBytes);
            },
          );

          if (result.success) {
            this.emit('download:complete', result);
          } else {
            this.emit('download:error', update, new Error(result.errorReason ?? 'Download failed'));
          }

          return result;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.emit('download:error', update, error);
          return { update, success: false, errorReason: error.message };
        }
      }),
    );

    const results = await Promise.all(resultPromises);
    this.emit('all:done', results);
    return results;
  }

  async getModLoaders(): Promise<ModLoader[]> {
    try {
      return await this.modrinth.getModLoaders();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  detectSourceLoader(mods: Mod[]): LoaderDetection {
    return detectSourceLoader(mods);
  }

  async planLoaderMigration(
    mods: Mod[],
    mcVersion: string,
    sourceLoader: string,
    targetLoader: string,
  ): Promise<LoaderMigrationPlan> {
    try {
      const plan = await this.modrinth.planLoaderMigration(
        mods,
        mcVersion,
        sourceLoader,
        targetLoader,
      );
      this.emit('migration:plan-complete', plan);
      return plan;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  async materializeMigration(
    plan: LoaderMigrationPlan,
    selectedOptionalEntryIds: string[],
    outputDir: string,
  ): Promise<MigrationResult> {
    try {
      const result = await materializeMigrationPlan(
        plan,
        selectedOptionalEntryIds,
        outputDir,
        (entry, bytes, total) => this.emit('migration:progress', entry, bytes, total),
      );
      this.emit('migration:complete', result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  async applyUpdates(
    updates: ModUpdate[],
    downloadedDir: string,
    modsDir: string,
  ): Promise<ApplyResult> {
    try {
      return await applyDownloadedUpdates(updates, downloadedDir, modsDir);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  async rollbackLatestSession(modsDir: string): Promise<RollbackResult> {
    try {
      return await rollbackLatestBackupSession(modsDir);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }
}
