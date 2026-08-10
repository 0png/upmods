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
  ScanOptions,
  ModpackLockfile,
  LockfileVerificationResult,
  AuditOptions,
  AuditReport,
  InstanceConfig,
  InstanceConfigPatch,
  InstanceConfigUpdateResult,
  InstanceResolution,
  UpdateExecutionResult,
  UpdatePlan,
  UpdatePlanItem,
  UpdatePolicy,
  UpdateSafetyReport,
} from './types.js';
import { scanDirectory } from './scanner.js';
import { readLocalJarMetadata } from './jar-metadata.js';
import { ModrinthClient } from './modrinth.js';
import type { ModrinthClientOptions } from './modrinth.js';
import { downloadFile } from './downloader.js';
import { applyDownloadedUpdates, rollbackLatestBackupSession } from './backup.js';
import { detectSourceLoader, materializeMigrationPlan } from './migration.js';
import pLimit from 'p-limit';
import { verifyModpackLockfile, writeModpackLockfile } from './lockfile.js';
import { auditModSet, evaluateUpdateSafety, updateSafetyFailureMessage } from './audit.js';
import { getInstanceConfig, resolveInstance, updateInstanceConfig, writeInstanceConfig } from './instance.js';
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { isOperationCancelledError, throwIfAborted } from './abort.js';

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

export interface UpmodsCoreOptions {
  modrinth?: ModrinthClientOptions;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UpmodsCore extends EventEmitter {
  private readonly modrinth: ModrinthClient;

  constructor(options: UpmodsCoreOptions = {}) {
    super();
    this.modrinth = new ModrinthClient(undefined, options.modrinth);
  }

  /**
   * Scan a directory for mod files, hash them, and identify them against Modrinth.
   * Emits progress events throughout the process.
   * @param dir Absolute path to the directory to scan
   * @returns ScanResult with identified mods and unidentified files
   */
  async scanAndIdentify(dir: string, options: ScanOptions = {}): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      let totalEmitted = false;
      const files = await scanDirectory(dir, (done, total) => {
        if (!totalEmitted) {
          totalEmitted = true;
          this.emit('scan:start', dir, total);
        }
        this.emit('scan:progress', done, total);
      }, options);

      // Handle empty directory case — emit scan:start with 0 total
      if (files.length === 0) {
        this.emit('scan:start', dir, 0);
      }

      // Identify mods via Modrinth
      const sha1s = files.map((f) => f.sha1);
      const modMap = options.signal
        ? await this.modrinth.identifyMods(sha1s, options.signal)
        : await this.modrinth.identifyMods(sha1s);

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

      if (options.metadataFallback !== false && unidentified.length > 0) {
        const metadataLimit = pLimit(Math.min(4, Math.max(1, options.hashConcurrency ?? 4)));
        await Promise.all(unidentified.map((file) => metadataLimit(async () => {
          throwIfAborted(options.signal);
          const metadata = await readLocalJarMetadata(file.path);
          throwIfAborted(options.signal);
          if (metadata) file.metadata = metadata;
        })));
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
  async getGameVersions(signal?: AbortSignal): Promise<MCVersion[]> {
    try {
      return signal
        ? await this.modrinth.getGameVersions(signal)
        : await this.modrinth.getGameVersions();
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
    channel: 'stable-only' | 'allow-beta' = 'stable-only',
    signal?: AbortSignal,
  ): Promise<{ updates: ModUpdate[]; upToDate: Mod[] }> {
    try {
      const result = signal
        ? await this.modrinth.checkUpdates(mods, mcVersion, loader, channel, signal)
        : loader === undefined && channel === 'stable-only'
        ? await this.modrinth.checkUpdates(mods, mcVersion)
        : await this.modrinth.checkUpdates(mods, mcVersion, loader, channel);
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
  async downloadUpdates(
    updates: ModUpdate[],
    outputDir: string,
    signal?: AbortSignal,
  ): Promise<DownloadResult[]> {
    throwIfAborted(signal);
    const limit = pLimit(5);
    const completedPaths = new Set<string>();

    const resultPromises = updates.map((update) =>
      limit(async (): Promise<DownloadResult> => {
        throwIfAborted(signal);
        this.emit('download:start', update);

        try {
          const progress = (
            bytesReceived: number,
            totalBytes: number,
          ) => {
            this.emit('download:progress', update, bytesReceived, totalBytes);
          };
          const result = signal ? await downloadFile(
            update,
            outputDir,
            progress,
            signal,
          ) : await downloadFile(update, outputDir, progress);

          if (result.success) {
            if (result.outputPath) completedPaths.add(result.outputPath);
            this.emit('download:complete', result);
          } else {
            this.emit('download:error', update, new Error(result.errorReason ?? 'Download failed'));
          }

          return result;
        } catch (err) {
          if (isOperationCancelledError(err)) throw err;
          const error = err instanceof Error ? err : new Error(String(err));
          this.emit('download:error', update, error);
          return { update, success: false, errorReason: error.message };
        }
      }),
    );

    let results: DownloadResult[];
    try {
      results = await Promise.all(resultPromises);
    } catch (error) {
      if (!isOperationCancelledError(error)) throw error;
      await Promise.allSettled(resultPromises);
      await Promise.all([...completedPaths].map((filePath) => (
        rm(filePath, { force: true }).catch(() => undefined)
      )));
      throw error;
    }
    this.emit('all:done', results);
    return results;
  }

  async getModLoaders(signal?: AbortSignal): Promise<ModLoader[]> {
    try {
      return signal
        ? await this.modrinth.getModLoaders(signal)
        : await this.modrinth.getModLoaders();
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
    signal?: AbortSignal,
  ): Promise<LoaderMigrationPlan> {
    try {
      const plan = await this.modrinth.planLoaderMigration(
        mods,
        mcVersion,
        sourceLoader,
        targetLoader,
        signal,
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
    signal?: AbortSignal,
  ): Promise<MigrationResult> {
    try {
      const result = await materializeMigrationPlan(
        plan,
        selectedOptionalEntryIds,
        outputDir,
        (entry, bytes, total) => this.emit('migration:progress', entry, bytes, total),
        signal,
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

  async writeLockfile(result: ScanResult): Promise<ModpackLockfile> {
    return await writeModpackLockfile(result);
  }

  async verifyLockfile(result: ScanResult): Promise<LockfileVerificationResult> {
    return await verifyModpackLockfile(result);
  }

  async resolveInstance(inputDir: string): Promise<InstanceResolution> {
    return await resolveInstance(inputDir);
  }

  async saveInstanceConfig(instanceDir: string, config: InstanceConfig): Promise<string> {
    return await writeInstanceConfig(instanceDir, config);
  }

  async updateInstanceConfig(
    instanceDir: string,
    patch: InstanceConfigPatch,
  ): Promise<InstanceConfigUpdateResult> {
    return await updateInstanceConfig(instanceDir, patch);
  }

  async getInstanceConfig(instanceDir: string): Promise<InstanceConfigUpdateResult> {
    return await getInstanceConfig(instanceDir);
  }

  audit(result: ScanResult, options: AuditOptions = {}): AuditReport {
    return auditModSet(result, options);
  }

  evaluateUpdateSafety(
    items: UpdatePlanItem[],
    auditReport?: AuditReport | null,
    scan?: ScanResult | null,
  ): UpdateSafetyReport {
    return evaluateUpdateSafety(items, auditReport, scan);
  }

  async planUpdates(
    mods: Mod[],
    mcVersion: string,
    loader: string,
    policy: UpdatePolicy,
    signal?: AbortSignal,
  ): Promise<UpdatePlan> {
    return await this.modrinth.planUpdates(mods, mcVersion, loader, policy, signal);
  }

  async executeUpdatePlan(
    plan: UpdatePlan,
    modsDir: string,
    signal?: AbortSignal,
    auditReport?: AuditReport,
    scan?: ScanResult,
  ): Promise<UpdateExecutionResult> {
    throwIfAborted(signal);
    const safety = evaluateUpdateSafety(plan.items, auditReport, scan);
    if (!safety.safe) throw new Error(updateSafetyFailureMessage(safety));
    if (plan.updates.length === 0) {
      return { plan, downloads: [], applied: false };
    }
    const resolvedModsDir = path.resolve(modsDir);
    const stageRoot = path.join(resolvedModsDir, '.upmods-stage');
    const stageDir = path.join(stageRoot, `${Date.now()}-${process.pid}`);
    await mkdir(stageDir, { recursive: true });
    try {
      const downloads = await this.downloadUpdates(plan.updates, stageDir, signal);
      const failed = downloads.filter((result) => !result.success);
      if (failed.length > 0) {
        return {
          plan,
          downloads,
          applied: false,
          failureReason: `${failed.length} download(s) failed checksum or transfer validation; nothing was applied.`,
        };
      }
      // Apply is a transaction boundary and must finish or restore once entered.
      throwIfAborted(signal);
      const applyResult = await this.applyUpdates(plan.updates, stageDir, resolvedModsDir);
      return { plan, downloads, applyResult, applied: true };
    } finally {
      await rm(stageDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
