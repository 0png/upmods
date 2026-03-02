import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModrinthClient } from './modrinth.js';
import type { ModrinthVersionResponse } from './modrinth.js';

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
});
