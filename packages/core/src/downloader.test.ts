import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { downloadFile } from './downloader.js';
import type { ModUpdate, Mod, ModFile } from './types.js';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

// fs-extra must be mocked via vi.mock (not vi.spyOn) in ESM
vi.mock('fs-extra', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

function makeModFile(filename: string, sha1: string): ModFile {
  return { path: `/mods/${filename}`, filename, sha1, sizeBytes: 1024 };
}

function makeMod(file: ModFile): Mod {
  return {
    file,
    projectId: 'project-id',
    projectSlug: 'mod-slug',
    displayName: 'Test Mod',
    installedVersionId: 'v1',
    installedVersionNumber: '1.0.0',
    loaders: ['fabric'],
    supportedMcVersions: ['1.20.1'],
  };
}

function makeUpdate(sha1: string, filename: string): ModUpdate {
  const file = makeModFile(`${filename}.jar`, sha1);
  return {
    mod: makeMod(file),
    latestVersionId: 'v2',
    latestVersionNumber: '2.0.0',
    downloadUrl: 'https://cdn.modrinth.com/data/test/file.jar',
    downloadFilename: `${filename}-2.0.0.jar`,
    downloadSizeBytes: 2048,
    status: 'pending',
  };
}

describe('downloadFile', () => {
  let mockRequest: ReturnType<typeof vi.fn>;
  let mockEnsureDir: ReturnType<typeof vi.fn>;
  let tempDir: string;

  beforeEach(async () => {
    const { request } = await import('undici');
    const fsExtra = await import('fs-extra');
    mockRequest = request as ReturnType<typeof vi.fn>;
    mockEnsureDir = fsExtra.ensureDir as ReturnType<typeof vi.fn>;
    mockRequest.mockReset();
    mockEnsureDir.mockReset();
    mockEnsureDir.mockResolvedValue(undefined);

    // Create a real temp directory for file system operations
    tempDir = await mkdtemp(path.join(tmpdir(), 'upmods-dl-test-'));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns success=true and file exists at outputPath', async () => {
    const content = Buffer.from('hello mod content');
    const mockBody = Readable.from([content]);

    mockRequest.mockResolvedValue({
      statusCode: 200,
      headers: { 'content-length': String(content.length) },
      body: mockBody,
    });

    const update = makeUpdate('abc123', 'mod');
    const result = await downloadFile(update, tempDir, vi.fn());

    expect(result.success).toBe(true);
    expect(result.outputPath).toBeDefined();
    expect(result.update).toBe(update);

    const fileContent = await readFile(result.outputPath!);
    expect(fileContent).toEqual(content);
  });

  it('returns success=false and no partial file on network error', async () => {
    mockRequest.mockRejectedValue(new Error('ECONNREFUSED'));

    const update = makeUpdate('def456', 'failing-mod');
    const result = await downloadFile(update, tempDir, vi.fn());

    expect(result.success).toBe(false);
    expect(result.errorReason).toContain('ECONNREFUSED');

    // Verify no temp file remains
    const tempPath = path.join(tempDir, `${update.downloadFilename}.tmp`);
    await expect(stat(tempPath)).rejects.toThrow();
  });

  it('returns success=false and no partial file on non-200 HTTP status', async () => {
    const mockBody = { resume: vi.fn() };
    mockRequest.mockResolvedValue({
      statusCode: 404,
      headers: {},
      body: mockBody,
    });

    const update = makeUpdate('ghi789', 'missing-mod');
    const result = await downloadFile(update, tempDir, vi.fn());

    expect(result.success).toBe(false);
    expect(result.errorReason).toContain('404');
    expect(mockBody.resume).toHaveBeenCalled();
  });

  it('invokes onProgress callback with increasing byte counts', async () => {
    const chunk1 = Buffer.from('Hello ');
    const chunk2 = Buffer.from('World!');
    const totalBytes = chunk1.length + chunk2.length;

    const mockBody = Readable.from([chunk1, chunk2]);
    mockRequest.mockResolvedValue({
      statusCode: 200,
      headers: { 'content-length': String(totalBytes) },
      body: mockBody,
    });

    const progressCalls: Array<{ bytes: number; total: number }> = [];
    const onProgress = (bytes: number, total: number) => {
      progressCalls.push({ bytes, total });
    };

    const update = makeUpdate('jkl012', 'progress-mod');
    await downloadFile(update, tempDir, onProgress);

    expect(progressCalls.length).toBeGreaterThan(0);
    // Byte counts should be monotonically increasing
    for (let i = 1; i < progressCalls.length; i++) {
      expect(progressCalls[i].bytes).toBeGreaterThanOrEqual(progressCalls[i - 1].bytes);
    }
    // Final call should report all bytes received
    const last = progressCalls[progressCalls.length - 1];
    expect(last.bytes).toBe(totalBytes);
  });

  it('calls ensureDir with outputDir before writing', async () => {
    const content = Buffer.from('content');
    const mockBody = Readable.from([content]);
    mockRequest.mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: mockBody,
    });

    const update = makeUpdate('mno345', 'ensure-mod');
    await downloadFile(update, tempDir, vi.fn());

    expect(mockEnsureDir).toHaveBeenCalledWith(tempDir);
  });

  it('verifies Modrinth SHA-512 before publishing the download', async () => {
    const content = Buffer.from('verified content');
    mockRequest.mockResolvedValue({
      statusCode: 200,
      headers: { 'content-length': String(content.length) },
      body: Readable.from([content]),
    });
    const update = makeUpdate('hash', 'verified-mod');
    update.downloadSha512 = createHash('sha512').update(content).digest('hex');

    const result = await downloadFile(update, tempDir, vi.fn());

    expect(result.success).toBe(true);
  });

  it('rejects a checksum mismatch and removes the partial file', async () => {
    const content = Buffer.from('tampered content');
    mockRequest.mockResolvedValue({
      statusCode: 200,
      headers: { 'content-length': String(content.length) },
      body: Readable.from([content]),
    });
    const update = makeUpdate('hash', 'tampered-mod');
    update.downloadSha512 = '0'.repeat(128);

    const result = await downloadFile(update, tempDir, vi.fn());

    expect(result.success).toBe(false);
    expect(result.errorReason).toContain('SHA-512 mismatch');
    await expect(stat(path.join(tempDir, `${update.downloadFilename}.tmp`))).rejects.toThrow();
    await expect(stat(path.join(tempDir, update.downloadFilename))).rejects.toThrow();
  });

  it('rejects download filenames that escape the output directory', async () => {
    const update = makeUpdate('hash', 'unsafe-mod');
    update.downloadFilename = path.join('..', 'escaped.jar');

    const result = await downloadFile(update, tempDir, vi.fn());

    expect(result.success).toBe(false);
    expect(result.errorReason).toContain('Unsafe download filename');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('aborts an in-progress transfer and removes temporary output', async () => {
    const controller = new AbortController();
    const first = Buffer.from('first chunk');
    const second = Buffer.from('second chunk');
    mockRequest.mockResolvedValue({
      statusCode: 200,
      headers: { 'content-length': String(first.length + second.length) },
      body: Readable.from((async function* () {
        yield first;
        await new Promise((resolve) => setTimeout(resolve, 50));
        yield second;
      })()),
    });
    const update = makeUpdate('cancel', 'cancelled-mod');

    const request = downloadFile(update, tempDir, () => controller.abort(), controller.signal);
    await expect(request).rejects.toMatchObject({ name: 'AbortError', code: 'UPMODS_CANCELLED' });
    await expect(stat(path.join(tempDir, `${update.downloadFilename}.tmp`))).rejects.toThrow();
    await expect(stat(path.join(tempDir, update.downloadFilename))).rejects.toThrow();
  });
});
