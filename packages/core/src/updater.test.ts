import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpmodsCore } from './updater.js';
import type { ModFile, Mod, ScanResult, MCVersion, ModUpdate } from './types.js';

// Mock the scanner and modrinth modules
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

describe('UpmodsCore', () => {
  let core: UpmodsCore;
  let mockScanDirectory: ReturnType<typeof vi.fn>;
  let mockIdentifyMods: ReturnType<typeof vi.fn>;
  let mockGetGameVersions: ReturnType<typeof vi.fn>;
  let mockCheckUpdates: ReturnType<typeof vi.fn>;

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

  beforeEach(async () => {
    vi.clearAllMocks();
    const { scanDirectory } = await import('./scanner.js');
    const { ModrinthClient } = await import('./modrinth.js');
    mockScanDirectory = scanDirectory as ReturnType<typeof vi.fn>;
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
});
