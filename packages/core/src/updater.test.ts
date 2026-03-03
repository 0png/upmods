import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpmodsCore } from './updater.js';
import type { ModFile, Mod, ScanResult, MCVersion, ModUpdate, DownloadResult } from './types.js';

// Mock the scanner, modrinth, and downloader modules
vi.mock('./scanner.js', () => ({
  scanDirectory: vi.fn(),
}));

vi.mock('./modrinth.js', () => ({
  ModrinthClient: vi.fn().mockImplementation(() => ({
    identifyMods: vi.fn(),
    getGameVersions: vi.fn(),
    checkUpdates: vi.fn(),
  })),
}));

vi.mock('./downloader.js', () => ({
  downloadFile: vi.fn(),
}));

describe('UpmodsCore', () => {
  let core: UpmodsCore;
  let mockScanDirectory: ReturnType<typeof vi.fn>;
  let mockIdentifyMods: ReturnType<typeof vi.fn>;
  let mockGetGameVersions: ReturnType<typeof vi.fn>;
  let mockCheckUpdates: ReturnType<typeof vi.fn>;
  let mockDownloadFile: ReturnType<typeof vi.fn>;

  const makeModFile = (filename: string, sha1: string): ModFile => ({
    path: `/mods/${filename}`,
    filename,
    sha1,
    sizeBytes: 1024,
  });

  const makeMod = (file: ModFile): Mod => ({
    file,
    projectId: `proj-${file.sha1}`,
    projectSlug: `mod-${file.sha1.slice(0, 4)}`,
    displayName: `Mod ${file.sha1.slice(0, 4)}`,
    installedVersionId: `ver-${file.sha1}`,
    installedVersionNumber: '1.0.0',
    loaders: ['fabric'],
    supportedMcVersions: ['1.20.1'],
  });

  const makeUpdate = (sha1: string): ModUpdate => {
    const file = makeModFile(`${sha1}.jar`, sha1);
    return {
      mod: makeMod(file),
      latestVersionId: `new-ver-${sha1}`,
      latestVersionNumber: '2.0.0',
      downloadUrl: `https://example.com/${sha1}.jar`,
      downloadFilename: `mod-${sha1}-2.0.0.jar`,
      downloadSizeBytes: 2048,
      status: 'pending',
    };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { scanDirectory } = await import('./scanner.js');
    const { ModrinthClient } = await import('./modrinth.js');
    const { downloadFile } = await import('./downloader.js');
    mockScanDirectory = scanDirectory as ReturnType<typeof vi.fn>;
    mockDownloadFile = downloadFile as ReturnType<typeof vi.fn>;
    const MockClient = ModrinthClient as ReturnType<typeof vi.fn>;
    core = new UpmodsCore();
    // Access the private modrinth instance via the constructor mock
    const modrinthInstance = MockClient.mock.results[0].value;
    mockIdentifyMods = modrinthInstance.identifyMods;
    mockGetGameVersions = modrinthInstance.getGameVersions;
    mockCheckUpdates = modrinthInstance.checkUpdates;
  });

  describe('scanAndIdentify', () => {
    it('emits scan:start with correct total when files are found', async () => {
      const files = [makeModFile('mod1.jar', 'sha1'), makeModFile('mod2.jar', 'sha2')];
      mockScanDirectory.mockImplementation(
        async (dir: string, onProgress?: (done: number, total: number) => void) => {
          if (onProgress) {
            onProgress(1, 2);
            onProgress(2, 2);
          }
          return files;
        }
      );
      mockIdentifyMods.mockResolvedValue(new Map());

      const startEvents: Array<{ dir: string; total: number }> = [];
      core.on('scan:start', (dir: string, total: number) => startEvents.push({ dir, total }));

      await core.scanAndIdentify('/mods');

      expect(startEvents).toHaveLength(1);
      expect(startEvents[0]).toEqual({ dir: '/mods', total: 2 });
    });

    it('emits scan:progress once per file', async () => {
      const files = [makeModFile('mod1.jar', 'sha1'), makeModFile('mod2.jar', 'sha2')];
      mockScanDirectory.mockImplementation(
        async (dir: string, onProgress?: (done: number, total: number) => void) => {
          if (onProgress) {
            onProgress(1, 2);
            onProgress(2, 2);
          }
          return files;
        }
      );
      mockIdentifyMods.mockResolvedValue(new Map());

      const progressEvents: Array<{ done: number; total: number }> = [];
      core.on('scan:progress', (done: number, total: number) => progressEvents.push({ done, total }));

      await core.scanAndIdentify('/mods');

      expect(progressEvents).toHaveLength(2);
      expect(progressEvents[0]).toEqual({ done: 1, total: 2 });
      expect(progressEvents[1]).toEqual({ done: 2, total: 2 });
    });

    it('emits mod:identified for each matched mod', async () => {
      const file1 = makeModFile('mod1.jar', 'sha1abc');
      const file2 = makeModFile('mod2.jar', 'sha2def');
      const mod1 = makeMod(file1);
      const mod2 = makeMod(file2);

      mockScanDirectory.mockResolvedValue([file1, file2]);
      mockIdentifyMods.mockResolvedValue(
        new Map([
          ['sha1abc', mod1],
          ['sha2def', mod2],
        ])
      );

      const identifiedMods: Mod[] = [];
      core.on('mod:identified', (mod: Mod) => identifiedMods.push(mod));

      await core.scanAndIdentify('/mods');

      expect(identifiedMods).toHaveLength(2);
    });

    it('emits scan:complete with correct ScanResult counts', async () => {
      const file1 = makeModFile('mod1.jar', 'sha1abc');
      const file2 = makeModFile('unidentified.jar', 'sha2def');
      const mod1 = makeMod(file1);

      mockScanDirectory.mockResolvedValue([file1, file2]);
      mockIdentifyMods.mockResolvedValue(new Map([['sha1abc', mod1]]));

      let scanResult: ScanResult | null = null;
      core.on('scan:complete', (result: ScanResult) => {
        scanResult = result;
      });

      await core.scanAndIdentify('/mods');

      expect(scanResult).not.toBeNull();
      expect(scanResult!.totalFiles).toBe(2);
      expect(scanResult!.identifiedCount).toBe(1);
      expect(scanResult!.unidentifiedCount).toBe(1);
      expect(scanResult!.directory).toBe('/mods');
    });

    it('places unidentified files in ScanResult.unidentified', async () => {
      const file1 = makeModFile('identified.jar', 'sha1abc');
      const file2 = makeModFile('unidentified.jar', 'sha2def');
      const mod1 = makeMod(file1);

      mockScanDirectory.mockResolvedValue([file1, file2]);
      mockIdentifyMods.mockResolvedValue(new Map([['sha1abc', mod1]]));

      const result = await core.scanAndIdentify('/mods');

      expect(result.unidentified).toHaveLength(1);
      expect(result.unidentified[0].filename).toBe('unidentified.jar');
      expect(result.identified).toHaveLength(1);
    });

    it('emits error and rethrows when scanDirectory throws', async () => {
      const testError = new Error('scan failed');
      mockScanDirectory.mockRejectedValue(testError);

      const errorEvents: Error[] = [];
      core.on('error', (err: Error) => errorEvents.push(err));

      await expect(core.scanAndIdentify('/mods')).rejects.toThrow('scan failed');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toBe(testError);
    });
  });

  describe('getGameVersions', () => {
    it('delegates to ModrinthClient.getGameVersions', async () => {
      const mockVersions: MCVersion[] = [
        {
          version: '1.21.1',
          versionType: 'release',
          releaseDate: '2024-06-13T00:00:00Z',
          major: true,
        },
        {
          version: '1.20.1',
          versionType: 'release',
          releaseDate: '2023-06-12T00:00:00Z',
          major: true,
        },
      ];

      mockGetGameVersions.mockResolvedValue(mockVersions);

      const result = await core.getGameVersions();

      expect(result).toBe(mockVersions);
      expect(mockGetGameVersions).toHaveBeenCalledTimes(1);
    });

    it('emits error and rethrows when getGameVersions throws', async () => {
      const testError = new Error('API error');
      mockGetGameVersions.mockRejectedValue(testError);

      const errorEvents: Error[] = [];
      core.on('error', (err: Error) => errorEvents.push(err));

      await expect(core.getGameVersions()).rejects.toThrow('API error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toBe(testError);
    });
  });

  describe('checkUpdates', () => {
    const createMockMod = (sha1: string): Mod => ({
      file: makeModFile(`${sha1}.jar`, sha1),
      projectId: `proj-${sha1}`,
      projectSlug: `mod-${sha1}`,
      displayName: `Mod ${sha1}`,
      installedVersionId: `ver-${sha1}`,
      installedVersionNumber: '1.0.0',
      loaders: ['fabric'],
      supportedMcVersions: ['1.20.1'],
    });

    it('emits check:complete with correct updates and upToDate arrays', async () => {
      const mod1 = createMockMod('sha1abc');
      const mod2 = createMockMod('sha2def');

      const mockUpdate: ModUpdate = {
        mod: mod1,
        latestVersionId: 'new-ver-1',
        latestVersionNumber: '2.0.0',
        downloadUrl: 'https://example.com/file.jar',
        downloadFilename: 'mod-2.0.0.jar',
        downloadSizeBytes: 2048000,
        status: 'pending',
      };

      const mockResult = {
        updates: [mockUpdate],
        upToDate: [mod2],
      };

      mockCheckUpdates.mockResolvedValue(mockResult);

      const checkCompleteEvents: Array<{ updates: ModUpdate[]; upToDate: Mod[] }> = [];
      core.on('check:complete', (updates: ModUpdate[], upToDate: Mod[]) => {
        checkCompleteEvents.push({ updates, upToDate });
      });

      const result = await core.checkUpdates([mod1, mod2], '1.21.1');

      expect(result).toBe(mockResult);
      expect(checkCompleteEvents).toHaveLength(1);
      expect(checkCompleteEvents[0].updates).toEqual([mockUpdate]);
      expect(checkCompleteEvents[0].upToDate).toEqual([mod2]);
      expect(mockCheckUpdates).toHaveBeenCalledWith([mod1, mod2], '1.21.1');
    });

    it('emits error and rethrows when checkUpdates throws', async () => {
      const mod = createMockMod('sha1abc');
      const testError = new Error('API error');
      mockCheckUpdates.mockRejectedValue(testError);

      const errorEvents: Error[] = [];
      core.on('error', (err: Error) => errorEvents.push(err));

      await expect(core.checkUpdates([mod], '1.21.1')).rejects.toThrow('API error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toBe(testError);
    });
  });

  describe('downloadUpdates', () => {
    it('emits download:start for each update', async () => {
      const update1 = makeUpdate('sha1aaa');
      const update2 = makeUpdate('sha2bbb');

      const successResult = (u: ModUpdate): DownloadResult => ({
        update: u,
        success: true,
        outputPath: `/output/${u.downloadFilename}`,
      });

      mockDownloadFile
        .mockResolvedValueOnce(successResult(update1))
        .mockResolvedValueOnce(successResult(update2));

      const startEvents: ModUpdate[] = [];
      core.on('download:start', (u: ModUpdate) => startEvents.push(u));

      await core.downloadUpdates([update1, update2], '/output');

      expect(startEvents).toHaveLength(2);
      expect(startEvents).toContain(update1);
      expect(startEvents).toContain(update2);
    });

    it('continues remaining downloads when one fails', async () => {
      const update1 = makeUpdate('sha1fail');
      const update2 = makeUpdate('sha2ok');
      const update3 = makeUpdate('sha3ok');

      mockDownloadFile
        .mockResolvedValueOnce({ update: update1, success: false, errorReason: 'Network error' })
        .mockResolvedValueOnce({ update: update2, success: true, outputPath: '/output/u2.jar' })
        .mockResolvedValueOnce({ update: update3, success: true, outputPath: '/output/u3.jar' });

      const results = await core.downloadUpdates([update1, update2, update3], '/output');

      expect(results).toHaveLength(3);
      expect(mockDownloadFile).toHaveBeenCalledTimes(3);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);
    });

    it('emits all:done after all downloads settle', async () => {
      const update1 = makeUpdate('sha1aaa');
      const update2 = makeUpdate('sha2bbb');

      const r1: DownloadResult = { update: update1, success: true, outputPath: '/out/u1.jar' };
      const r2: DownloadResult = { update: update2, success: false, errorReason: 'fail' };

      mockDownloadFile
        .mockResolvedValueOnce(r1)
        .mockResolvedValueOnce(r2);

      const allDoneEvents: DownloadResult[][] = [];
      core.on('all:done', (results: DownloadResult[]) => allDoneEvents.push(results));

      const results = await core.downloadUpdates([update1, update2], '/output');

      expect(allDoneEvents).toHaveLength(1);
      expect(allDoneEvents[0]).toEqual(results);
    });

    it('emits download:complete for successful downloads', async () => {
      const update = makeUpdate('sha1ok');
      const result: DownloadResult = { update, success: true, outputPath: '/out/file.jar' };

      mockDownloadFile.mockResolvedValue(result);

      const completeEvents: DownloadResult[] = [];
      core.on('download:complete', (r: DownloadResult) => completeEvents.push(r));

      await core.downloadUpdates([update], '/output');

      expect(completeEvents).toHaveLength(1);
      expect(completeEvents[0]).toBe(result);
    });

    it('emits download:error for failed downloads', async () => {
      const update = makeUpdate('sha1fail');
      const result: DownloadResult = { update, success: false, errorReason: 'HTTP 500' };

      mockDownloadFile.mockResolvedValue(result);

      const errorEvents: Array<{ update: ModUpdate; error: Error }> = [];
      core.on('download:error', (u: ModUpdate, e: Error) => errorEvents.push({ update: u, error: e }));

      await core.downloadUpdates([update], '/output');

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].update).toBe(update);
      expect(errorEvents[0].error.message).toContain('HTTP 500');
    });

    it('respects p-limit(5) concurrency cap', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      mockDownloadFile.mockImplementation((update: ModUpdate): Promise<DownloadResult> =>
        new Promise((resolve) => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          setImmediate(() => {
            concurrent--;
            resolve({ update, success: true, outputPath: `/out/${update.downloadFilename}` });
          });
        }),
      );

      const updates = Array.from({ length: 7 }, (_, i) => makeUpdate(`sha${i}`));
      await core.downloadUpdates(updates, '/output');

      expect(maxConcurrent).toBeLessThanOrEqual(5);
      expect(mockDownloadFile).toHaveBeenCalledTimes(7);
    });

    it('returns empty array for empty updates input', async () => {
      const results = await core.downloadUpdates([], '/output');

      expect(results).toEqual([]);
      expect(mockDownloadFile).not.toHaveBeenCalled();

      // all:done should still be emitted
      // (we can test this separately, but here just verify the return value)
    });
  });
});
