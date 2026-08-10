import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
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

    it('rejects an already-cancelled hash without reading the file', async () => {
      const testFile = join(testDir, 'cancelled.jar');
      await writeFile(testFile, 'content');
      const controller = new AbortController();
      controller.abort();

      await expect(hashFile(testFile, controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
        code: 'UPMODS_CANCELLED',
      });
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

    it('writes and reuses a local SHA-1 cache', async () => {
      const modPath = join(testDir, 'cached.jar');
      await writeFile(modPath, 'cached content');

      const first = await scanDirectory(testDir);
      const cachePath = join(testDir, '.upmods-cache', 'scan-v1.json');
      const cacheBefore = await readFile(cachePath, 'utf8');

      const second = await scanDirectory(testDir);
      const cacheAfter = await readFile(cachePath, 'utf8');

      expect(second).toEqual(first);
      expect(cacheAfter).toBe(cacheBefore);
    });

    it('invalidates a cached hash when the JAR changes', async () => {
      const modPath = join(testDir, 'changing.jar');
      await writeFile(modPath, 'before');
      const before = await scanDirectory(testDir);

      await new Promise((resolve) => setTimeout(resolve, 10));
      await writeFile(modPath, 'after-and-longer');
      const after = await scanDirectory(testDir);

      expect(after[0].sha1).not.toBe(before[0].sha1);
      expect(after[0].sizeBytes).toBe((await stat(modPath)).size);
    });

    it('can disable cache writes', async () => {
      await writeFile(join(testDir, 'uncached.jar'), 'content');

      await scanDirectory(testDir, undefined, { cache: false });

      await expect(readFile(join(testDir, '.upmods-cache', 'scan-v1.json'), 'utf8'))
        .rejects.toThrow();
    });

    it('limits concurrent hashing while preserving deterministic order', async () => {
      await Promise.all([
        writeFile(join(testDir, 'z.jar'), 'z'),
        writeFile(join(testDir, 'a.jar'), 'a'),
        writeFile(join(testDir, 'm.jar'), 'm'),
      ]);

      const result = await scanDirectory(testDir, undefined, { cache: false, hashConcurrency: 2 });

      expect(result.map((file) => file.filename)).toEqual(['a.jar', 'm.jar', 'z.jar']);
    });

    it('does not create a cache when scanning is cancelled before it starts', async () => {
      await writeFile(join(testDir, 'cancelled.jar'), 'content');
      const controller = new AbortController();
      controller.abort();

      await expect(scanDirectory(testDir, undefined, { signal: controller.signal }))
        .rejects.toMatchObject({ name: 'AbortError', code: 'UPMODS_CANCELLED' });
      await expect(stat(join(testDir, '.upmods-cache'))).rejects.toThrow();
    });
  });
});
