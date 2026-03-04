import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashFile, scanDirectory } from './scanner.js';

describe('scanner', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `upmods-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('hashFile', () => {
    it('returns correct 40-char hex SHA-1 for known content', async () => {
      const testFile = join(testDir, 'test.jar');
      const content = 'test content';
      await writeFile(testFile, content);

      const hash = await hashFile(testFile);

      expect(hash).toHaveLength(40);
      expect(hash).toMatch(/^[0-9a-f]{40}$/);
      // Known SHA-1 of "test content"
      expect(hash).toBe('1eebdf4fdc9fc7bf283031b93f9aef3338de9052');
    });

    it('returns lowercase hex', async () => {
      const testFile = join(testDir, 'test.jar');
      await writeFile(testFile, 'UPPERCASE TEST');

      const hash = await hashFile(testFile);

      expect(hash).toBe(hash.toLowerCase());
    });
  });

  describe('scanDirectory', () => {
    it('returns correct ModFile count for directory with .jar files', async () => {
      await writeFile(join(testDir, 'mod1.jar'), 'content1');
      await writeFile(join(testDir, 'mod2.jar'), 'content2');

      const result = await scanDirectory(testDir);

      expect(result).toHaveLength(2);
      expect(result[0].filename).toMatch(/\.jar$/);
      expect(result[0].sha1).toHaveLength(40);
      expect(result[0].sizeBytes).toBeGreaterThan(0);
    });

    it('excludes non-.jar files', async () => {
      await writeFile(join(testDir, 'mod.jar'), 'jar content');
      await writeFile(join(testDir, 'readme.txt'), 'text content');
      await writeFile(join(testDir, 'config.json'), '{}');

      const result = await scanDirectory(testDir);

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('mod.jar');
    });

    it('returns empty array for empty directory', async () => {
      const result = await scanDirectory(testDir);

      expect(result).toEqual([]);
    });

    it('handles duplicate SHA-1 (both files appear in result)', async () => {
      const content = 'duplicate content';
      await writeFile(join(testDir, 'mod1.jar'), content);
      await writeFile(join(testDir, 'mod2.jar'), content);

      const result = await scanDirectory(testDir);

      expect(result).toHaveLength(2);
      expect(result[0].sha1).toBe(result[1].sha1);
    });

    it('calls onProgress callback for each file', async () => {
      await writeFile(join(testDir, 'mod1.jar'), 'content1');
      await writeFile(join(testDir, 'mod2.jar'), 'content2');
      await writeFile(join(testDir, 'mod3.jar'), 'content3');

      const progressCalls: Array<{ done: number; total: number }> = [];
      await scanDirectory(testDir, (done, total) => {
        progressCalls.push({ done, total });
      });

      expect(progressCalls).toHaveLength(3);
      expect(progressCalls[0]).toEqual({ done: 1, total: 3 });
      expect(progressCalls[1]).toEqual({ done: 2, total: 3 });
      expect(progressCalls[2]).toEqual({ done: 3, total: 3 });
    });
  });
});
