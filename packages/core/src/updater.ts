import { EventEmitter } from 'node:events';
import type { CoreEvents } from './events.js';
import type { ScanResult, Mod, ModFile } from './types.js';
import { scanDirectory } from './scanner.js';
import { ModrinthClient } from './modrinth.js';

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
}
