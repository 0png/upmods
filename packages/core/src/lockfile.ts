import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  LockedMod,
  LockedUnidentifiedFile,
  LockfileChange,
  LockfileVerificationResult,
  ModpackLockfile,
  ScanResult,
} from './types.js';

export const MODPACK_LOCKFILE_FILENAME = '.upmods-lock.json';

function toLockedMod(result: ScanResult): LockedMod[] {
  return result.identified
    .map((mod) => ({
      projectId: mod.projectId,
      projectSlug: mod.projectSlug,
      displayName: mod.displayName,
      versionId: mod.installedVersionId,
      versionNumber: mod.installedVersionNumber,
      filename: mod.file.filename,
      sha1: mod.file.sha1,
      sizeBytes: mod.file.sizeBytes,
    }))
    .sort((a, b) => a.projectId.localeCompare(b.projectId) || a.filename.localeCompare(b.filename));
}

function toLockedUnidentified(result: ScanResult): LockedUnidentifiedFile[] {
  return result.unidentified
    .map((file) => ({
      filename: file.filename,
      sha1: file.sha1,
      sizeBytes: file.sizeBytes,
    }))
    .sort((a, b) => a.sha1.localeCompare(b.sha1) || a.filename.localeCompare(b.filename));
}

export function createModpackLockfile(result: ScanResult, now = new Date()): ModpackLockfile {
  return {
    schemaVersion: 1,
    createdAt: now.toISOString(),
    mods: toLockedMod(result),
    unidentified: toLockedUnidentified(result),
  };
}

export async function writeModpackLockfile(
  result: ScanResult,
  lockfilePath = path.join(result.directory, MODPACK_LOCKFILE_FILENAME),
): Promise<ModpackLockfile> {
  const lockfile = createModpackLockfile(result);
  const resolvedPath = path.resolve(lockfilePath);
  const tempPath = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(lockfile, null, 2)}\n`, 'utf8');
    await rename(tempPath, resolvedPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return lockfile;
}

function isLockedMod(value: unknown): value is LockedMod {
  if (!value || typeof value !== 'object') return false;
  const mod = value as Partial<LockedMod>;
  return typeof mod.projectId === 'string'
    && typeof mod.projectSlug === 'string'
    && typeof mod.displayName === 'string'
    && typeof mod.versionId === 'string'
    && typeof mod.versionNumber === 'string'
    && typeof mod.filename === 'string'
    && typeof mod.sha1 === 'string'
    && /^[0-9a-f]{40}$/.test(mod.sha1)
    && typeof mod.sizeBytes === 'number';
}

function isLockedUnidentified(value: unknown): value is LockedUnidentifiedFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<LockedUnidentifiedFile>;
  return typeof file.filename === 'string'
    && typeof file.sha1 === 'string'
    && /^[0-9a-f]{40}$/.test(file.sha1)
    && typeof file.sizeBytes === 'number';
}

export async function readModpackLockfile(lockfilePath: string): Promise<ModpackLockfile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(lockfilePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read lockfile ${lockfilePath}: ${message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid upmods lockfile: ${lockfilePath}`);
  }
  const lockfile = parsed as Partial<ModpackLockfile>;
  if (lockfile.schemaVersion !== 1
    || typeof lockfile.createdAt !== 'string'
    || !Array.isArray(lockfile.mods)
    || !lockfile.mods.every(isLockedMod)
    || !Array.isArray(lockfile.unidentified)
    || !lockfile.unidentified.every(isLockedUnidentified)) {
    throw new Error(`Invalid upmods lockfile: ${lockfilePath}`);
  }
  return lockfile as ModpackLockfile;
}

function groupBy<T>(values: T[], getKey: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = getKey(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function compareProjectMods(expected: LockedMod[], actual: LockedMod[]): LockfileChange[] {
  const changes: LockfileChange[] = [];
  const expectedGroups = groupBy(expected, (mod) => mod.projectId);
  const actualGroups = groupBy(actual, (mod) => mod.projectId);
  const projectIds = [...new Set([...expectedGroups.keys(), ...actualGroups.keys()])].sort();

  for (const projectId of projectIds) {
    const expectedRemaining = [...(expectedGroups.get(projectId) ?? [])];
    const actualRemaining = [...(actualGroups.get(projectId) ?? [])];

    for (let index = expectedRemaining.length - 1; index >= 0; index -= 1) {
      const matchIndex = actualRemaining.findIndex((mod) => mod.sha1 === expectedRemaining[index]?.sha1);
      if (matchIndex >= 0) {
        expectedRemaining.splice(index, 1);
        actualRemaining.splice(matchIndex, 1);
      }
    }

    while (expectedRemaining.length > 0 && actualRemaining.length > 0) {
      const expectedMod = expectedRemaining.shift()!;
      const actualMod = actualRemaining.shift()!;
      changes.push({
        kind: 'changed',
        projectId,
        displayName: actualMod.displayName || expectedMod.displayName,
        expected: expectedMod,
        actual: actualMod,
      });
    }
    for (const mod of expectedRemaining) {
      changes.push({ kind: 'removed', projectId, displayName: mod.displayName, expected: mod });
    }
    for (const mod of actualRemaining) {
      changes.push({ kind: 'added', projectId, displayName: mod.displayName, actual: mod });
    }
  }
  return changes;
}

function compareUnidentified(
  expected: LockedUnidentifiedFile[],
  actual: LockedUnidentifiedFile[],
): LockfileChange[] {
  const actualRemaining = [...actual];
  const changes: LockfileChange[] = [];
  for (const file of expected) {
    const matchIndex = actualRemaining.findIndex((candidate) => candidate.sha1 === file.sha1);
    if (matchIndex >= 0) {
      actualRemaining.splice(matchIndex, 1);
    } else {
      changes.push({ kind: 'removed', displayName: file.filename, expected: file });
    }
  }
  for (const file of actualRemaining) {
    changes.push({ kind: 'added', displayName: file.filename, actual: file });
  }
  return changes;
}

export function compareModpackLockfile(
  lockfile: ModpackLockfile,
  result: ScanResult,
  lockfilePath = path.join(result.directory, MODPACK_LOCKFILE_FILENAME),
): LockfileVerificationResult {
  const changes = [
    ...compareProjectMods(lockfile.mods, toLockedMod(result)),
    ...compareUnidentified(lockfile.unidentified, toLockedUnidentified(result)),
  ];
  return {
    valid: changes.length === 0,
    lockfilePath: path.resolve(lockfilePath),
    changes,
  };
}

export async function verifyModpackLockfile(
  result: ScanResult,
  lockfilePath = path.join(result.directory, MODPACK_LOCKFILE_FILENAME),
): Promise<LockfileVerificationResult> {
  const lockfile = await readModpackLockfile(lockfilePath);
  return compareModpackLockfile(lockfile, result, lockfilePath);
}
