import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModrinthClient } from './modrinth.js';
import type { ModrinthVersionResponse, ModrinthGameVersionResponse } from './modrinth.js';
import type { Mod } from './types.js';

// Mock undici
vi.mock('undici', () => ({
  request: vi.fn(),
}));

describe('ModrinthClient', () => {
  let client: ModrinthClient;
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { request } = await import('undici');
    mockRequest = request as ReturnType<typeof vi.fn>;
    mockRequest.mockClear();
    client = new ModrinthClient('test-agent/1.0.0');
  });

  describe('identifyMods', () => {
    it('maps response to Mod objects with correct fields', async () => {
      const testSha1 = 'abc123def456';
      const mockResponse: Record<string, ModrinthVersionResponse> = {
        [testSha1]: {
          id: 'version-id-1',
          project_id: 'project-id-1',
          name: 'Sodium 0.5.8',
          version_number: '0.5.8+mc1.20.1',
          loaders: ['fabric'],
          game_versions: ['1.20.1', '1.20.2'],
          files: [
            {
              url: 'https://cdn.modrinth.com/data/project/versions/file.jar',
              filename: 'sodium-0.5.8.jar',
              primary: true,
              size: 1024000,
              hashes: {
                sha1: testSha1,
                sha512: 'long-sha512-hash',
              },
            },
          ],
        },
      };

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockResponse,
        },
      });

      const result = await client.identifyMods([testSha1]);

      expect(result.size).toBe(1);
      const mod = result.get(testSha1);
      expect(mod).toBeDefined();
      expect(mod?.projectId).toBe('project-id-1');
      expect(mod?.displayName).toBe('Sodium 0.5.8');
      expect(mod?.installedVersionId).toBe('version-id-1');
      expect(mod?.installedVersionNumber).toBe('0.5.8+mc1.20.1');
      expect(mod?.loaders).toEqual(['fabric']);
      expect(mod?.supportedMcVersions).toEqual(['1.20.1', '1.20.2']);
    });

    it('excludes hashes not in response', async () => {
      const presentSha1 = 'present123';
      const absentSha1 = 'absent456';

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            [presentSha1]: {
              id: 'v1',
              project_id: 'p1',
              name: 'Mod 1',
              version_number: '1.0.0',
              loaders: ['fabric'],
              game_versions: ['1.20.1'],
              files: [
                {
                  url: 'https://example.com/file.jar',
                  filename: 'mod.jar',
                  primary: true,
                  size: 1000,
                  hashes: { sha1: presentSha1, sha512: 'hash' },
                },
              ],
            },
          }),
        },
      });

      const result = await client.identifyMods([presentSha1, absentSha1]);

      expect(result.size).toBe(1);
      expect(result.has(presentSha1)).toBe(true);
      expect(result.has(absentSha1)).toBe(false);
    });

    it('returns empty Map for empty input', async () => {
      const result = await client.identifyMods([]);

      expect(result.size).toBe(0);
      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('sends User-Agent header', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({}),
        },
      });

      await client.identifyMods(['test-hash']);

      expect(mockRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'test-agent/1.0.0',
          }),
        })
      );
    });
  });

  describe('getGameVersions', () => {
    it('returns only release versions sorted newest-first', async () => {
      const mockResponse: ModrinthGameVersionResponse[] = [
        {
          version: '1.20.1',
          version_type: 'release',
          date: '2023-06-12T00:00:00Z',
          major: true,
        },
        {
          version: '1.21.0',
          version_type: 'release',
          date: '2024-06-13T00:00:00Z',
          major: true,
        },
        {
          version: '24w14a',
          version_type: 'snapshot',
          date: '2024-04-03T00:00:00Z',
          major: false,
        },
        {
          version: '1.19.4',
          version_type: 'release',
          date: '2023-03-14T00:00:00Z',
          major: false,
        },
      ];

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockResponse,
        },
      });

      const result = await client.getGameVersions();

      // Should only include release versions
      expect(result.length).toBe(3);
      expect(result.every((v) => v.versionType === 'release')).toBe(true);

      // Should be sorted newest-first
      expect(result[0].version).toBe('1.21.0');
      expect(result[1].version).toBe('1.20.1');
      expect(result[2].version).toBe('1.19.4');
    });

    it('caches results on subsequent calls', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => [
            {
              version: '1.20.1',
              version_type: 'release',
              date: '2023-06-12T00:00:00Z',
              major: true,
            },
          ],
        },
      });

      const result1 = await client.getGameVersions();
      const result2 = await client.getGameVersions();

      expect(result1).toBe(result2); // Same reference
      expect(mockRequest).toHaveBeenCalledTimes(1); // Only called once
    });

    it('filters out non-release versions', async () => {
      const mockResponse: ModrinthGameVersionResponse[] = [
        {
          version: '1.20.1',
          version_type: 'release',
          date: '2023-06-12T00:00:00Z',
          major: true,
        },
        {
          version: '24w14a',
          version_type: 'snapshot',
          date: '2024-04-03T00:00:00Z',
          major: false,
        },
        {
          version: '1.20-pre1',
          version_type: 'beta',
          date: '2023-05-30T00:00:00Z',
          major: false,
        },
      ];

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockResponse,
        },
      });

      const result = await client.getGameVersions();

      expect(result.length).toBe(1);
      expect(result[0].version).toBe('1.20.1');
    });
  });

  describe('checkUpdates', () => {
    const createMockMod = (sha1: string, loader = 'fabric'): Mod => ({
      file: {
        path: `/mods/${sha1}.jar`,
        filename: `${sha1}.jar`,
        sha1,
        sizeBytes: 1000,
      },
      projectId: `project-${sha1}`,
      projectSlug: `mod-${sha1}`,
      displayName: `Mod ${sha1}`,
      installedVersionId: `version-${sha1}`,
      installedVersionNumber: '1.0.0',
      loaders: [loader],
      supportedMcVersions: ['1.20.1'],
    });

    it('returns ModUpdate for mods with newer versions', async () => {
      const mod = createMockMod('abc123');
      const mockResponse: Record<string, ModrinthVersionResponse> = {
        abc123: {
          id: 'new-version-id',
          project_id: 'project-abc123',
          name: 'Mod abc123 2.0',
          version_number: '2.0.0',
          loaders: ['fabric'],
          game_versions: ['1.21.1'],
          files: [
            {
              url: 'https://cdn.modrinth.com/data/project/versions/file.jar',
              filename: 'mod-2.0.0.jar',
              primary: true,
              size: 2048000,
              hashes: {
                sha1: 'new-sha1',
                sha512: 'new-sha512',
              },
            },
          ],
        },
      };

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => mockResponse,
        },
      });

      const result = await client.checkUpdates([mod], '1.21.1');

      expect(result.updates.length).toBe(1);
      expect(result.upToDate.length).toBe(0);

      const update = result.updates[0];
      expect(update.mod).toBe(mod);
      expect(update.latestVersionId).toBe('new-version-id');
      expect(update.latestVersionNumber).toBe('2.0.0');
      expect(update.downloadUrl).toBe('https://cdn.modrinth.com/data/project/versions/file.jar');
      expect(update.downloadFilename).toBe('mod-2.0.0.jar');
      expect(update.downloadSizeBytes).toBe(2048000);
      expect(update.status).toBe('pending');
    });

    it('returns upToDate for mods not in response', async () => {
      const mod1 = createMockMod('abc123');
      const mod2 = createMockMod('def456');

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({}), // Empty response - no updates
        },
      });

      const result = await client.checkUpdates([mod1, mod2], '1.21.1');

      expect(result.updates.length).toBe(0);
      expect(result.upToDate.length).toBe(2);
      expect(result.upToDate).toContain(mod1);
      expect(result.upToDate).toContain(mod2);
    });

    it('returns empty arrays for empty input', async () => {
      const result = await client.checkUpdates([], '1.21.1');

      expect(result.updates).toEqual([]);
      expect(result.upToDate).toEqual([]);
      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('sends correct game_versions in request body', async () => {
      const mod = createMockMod('abc123');

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({}),
        },
      });

      await client.checkUpdates([mod], '1.21.1');

      expect(mockRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"game_versions":["1.21.1"]'),
        })
      );
    });

    it('sends only the primary (most common) loader in request, not all loaders', async () => {
      const mod1 = createMockMod('abc123', 'fabric');
      const mod2 = createMockMod('def456', 'fabric');
      // One dual-loader mod should NOT cause neoforge to be sent
      const mod3 = { ...createMockMod('ghi789', 'fabric'), loaders: ['fabric', 'neoforge'] };

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: { json: async () => ({}) },
      });

      await client.checkUpdates([mod1, mod2, mod3], '1.21.6');

      const callBody = JSON.parse(mockRequest.mock.calls[0][1].body);
      // Primary loader is 'fabric' (appears in all 3 mods)
      expect(callBody.loaders).toEqual(['fabric']);
    });

    it('rejects neoforge-only update for a dual-loader installed mod (fabric is primary)', async () => {
      // WorldEdit scenario: installed jar supports ['fabric','neoforge']
      // but the update returned by API is neoforge-only
      const dualLoaderMod: Mod = {
        file: { path: '/mods/worldedit.jar', filename: 'worldedit.jar', sha1: 'we123', sizeBytes: 1000 },
        projectId: 'worldedit',
        projectSlug: 'worldedit',
        displayName: 'WorldEdit',
        installedVersionId: 'we-old-id',
        installedVersionNumber: '7.3.12',
        loaders: ['fabric', 'neoforge'],
        supportedMcVersions: ['1.21.5'],
      };
      const fabricMod = createMockMod('fab456', 'fabric');

      // API returns neoforge-only update for worldedit (because neoforge was in request)
      // Primary loader detection: fabric appears in both mods → primaryLoader = 'fabric'
      const mockResponse: Record<string, ModrinthVersionResponse> = {
        we123: {
          id: 'we-new-id',
          project_id: 'worldedit',
          name: 'WorldEdit 7.4.0',
          version_number: '7.4.0-neoforge',
          loaders: ['neoforge'], // NeoForge only — should be rejected
          game_versions: ['1.21.6'],
          files: [{
            url: 'https://cdn.modrinth.com/data/worldedit/file.jar',
            filename: 'worldedit-7.4.0-neoforge.jar',
            primary: true, size: 2000,
            hashes: { sha1: 'we-new-sha1', sha512: 'hash' },
          }],
        },
      };

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: { json: async () => mockResponse },
      });

      const result = await client.checkUpdates([dualLoaderMod, fabricMod], '1.21.6');

      // worldedit neoforge-only update must be rejected (primary loader is fabric)
      expect(result.updates.length).toBe(0);
      expect(result.upToDate.length).toBe(2);
    });

    it('treats same version ID as up to date (not a real update)', async () => {
      const mod = createMockMod('abc123');
      // API returns the same version the mod already has installed
      const mockResponse: Record<string, ModrinthVersionResponse> = {
        abc123: {
          id: `version-abc123`, // Same as installedVersionId
          project_id: 'project-abc123',
          name: 'Mod abc123 1.0',
          version_number: '1.0.0',
          loaders: ['fabric'],
          game_versions: ['1.21.1'],
          files: [
            {
              url: 'https://cdn.modrinth.com/data/project/versions/file.jar',
              filename: 'mod-1.0.0.jar',
              primary: true,
              size: 1000,
              hashes: { sha1: 'abc123', sha512: 'hash' },
            },
          ],
        },
      };

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: { json: async () => mockResponse },
      });

      const result = await client.checkUpdates([mod], '1.21.1');

      expect(result.updates.length).toBe(0);
      expect(result.upToDate.length).toBe(1);
      expect(result.upToDate[0]).toBe(mod);
    });

    it('rejects update with wrong loader (e.g. neoforge returned for fabric mod)', async () => {
      const mod = createMockMod('abc123', 'fabric');
      const mockResponse: Record<string, ModrinthVersionResponse> = {
        abc123: {
          id: 'new-version-id',
          project_id: 'project-abc123',
          name: 'Mod abc123 2.0 NeoForge',
          version_number: '2.0.0-neoforge',
          loaders: ['neoforge'], // Wrong loader
          game_versions: ['1.21.1'],
          files: [
            {
              url: 'https://cdn.modrinth.com/data/project/versions/file.jar',
              filename: 'mod-2.0.0-neoforge.jar',
              primary: true,
              size: 1000,
              hashes: { sha1: 'new-sha1', sha512: 'hash' },
            },
          ],
        },
      };

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: { json: async () => mockResponse },
      });

      const result = await client.checkUpdates([mod], '1.21.1');

      expect(result.updates.length).toBe(0);
      expect(result.upToDate.length).toBe(1);
    });

    it('rejects update for wrong MC version (e.g. 1.21.8 returned when 1.21.6 requested)', async () => {
      const mod = createMockMod('abc123', 'fabric');
      const mockResponse: Record<string, ModrinthVersionResponse> = {
        abc123: {
          id: 'new-version-id',
          project_id: 'project-abc123',
          name: 'Mod abc123 2.0',
          version_number: '2.0.0+mc1.21.8',
          loaders: ['fabric'],
          game_versions: ['1.21.8'], // Does not include the requested 1.21.6
          files: [
            {
              url: 'https://cdn.modrinth.com/data/project/versions/file.jar',
              filename: 'mod-2.0.0.jar',
              primary: true,
              size: 1000,
              hashes: { sha1: 'new-sha1', sha512: 'hash' },
            },
          ],
        },
      };

      mockRequest.mockResolvedValue({
        statusCode: 200,
        body: { json: async () => mockResponse },
      });

      const result = await client.checkUpdates([mod], '1.21.6');

      expect(result.updates.length).toBe(0);
      expect(result.upToDate.length).toBe(1);
    });
  });
});
