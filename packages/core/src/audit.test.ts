import { describe, expect, it } from 'vitest';
import { auditModSet, evaluateUpdateSafety, selectUpdatePlanItems } from './audit.js';
import type { Mod, ModFile, ModUpdate, ScanResult, UpdatePlanItem } from './types.js';

function file(filename: string, sha1: string, metadata?: ModFile['metadata']): ModFile {
  return { path: `/mods/${filename}`, filename, sha1, sizeBytes: 100, ...(metadata ? { metadata } : {}) };
}

function mod(projectId: string, filename: string, sha1: string, overrides: Partial<Mod> = {}): Mod {
  return {
    file: file(filename, sha1),
    projectId,
    projectSlug: projectId,
    displayName: projectId,
    installedVersionId: `${projectId}-v1`,
    installedVersionNumber: '1.0.0',
    loaders: ['fabric'],
    supportedMcVersions: ['1.21.1'],
    ...overrides,
  };
}

function scan(identified: Mod[], unidentified: ModFile[] = []): ScanResult {
  return {
    directory: '/mods', totalFiles: identified.length + unidentified.length,
    identifiedCount: identified.length, unidentifiedCount: unidentified.length,
    durationMs: 1, identified, unidentified,
  };
}

describe('auditModSet', () => {
  it('classifies duplicate projects and identical content as startup errors', () => {
    const report = auditModSet(scan([
      mod('sodium', 'sodium-a.jar', 'same'),
      mod('sodium', 'sodium-b.jar', 'same'),
    ]));
    expect(report.issues.map((entry) => entry.kind)).toEqual(expect.arrayContaining([
      'duplicate-project', 'duplicate-content',
    ]));
    expect(report.errorCount).toBe(2);
    expect(report.healthy).toBe(false);
  });

  it('reports loader, Minecraft, and dependency failures', () => {
    const owner = mod('owner', 'owner.jar', 'owner-sha', {
      loaders: ['forge'],
      supportedMcVersions: ['1.20.1'],
      dependencies: [
        { projectId: 'missing', versionId: null, fileName: null, dependencyType: 'required' },
        { projectId: 'conflict', versionId: null, fileName: null, dependencyType: 'incompatible' },
      ],
    });
    const report = auditModSet(scan([owner, mod('conflict', 'conflict.jar', 'conflict-sha')]), {
      loader: 'fabric', minecraftVersion: '1.21.1',
    });
    expect(report.issues.map((entry) => entry.kind)).toEqual(expect.arrayContaining([
      'loader-incompatible', 'minecraft-incompatible',
      'missing-required-dependency', 'incompatible-dependency',
    ]));
  });

  it('uses local metadata without treating it as a project mapping', () => {
    const unknown = file('local.jar', 'local-sha', {
      format: 'fabric', id: 'local', name: 'Local Mod', loaders: ['fabric'],
      minecraftVersionRange: '[1.20,1.21)', sourceEntry: 'fabric.mod.json', warnings: [],
      dependencies: [{ id: 'library', type: 'required' }],
    });
    const report = auditModSet(scan([], [unknown]), { loader: 'fabric', minecraftVersion: '1.21.1' });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'unidentified-jar', severity: 'warning' }),
      expect.objectContaining({ kind: 'minecraft-incompatible', severity: 'error' }),
      expect.objectContaining({ kind: 'missing-required-dependency', severity: 'error' }),
    ]));
  });

  it('keeps disabled JAR and lockfile drift as warnings', () => {
    const disabled = file('old.jar.disabled', 'old-sha');
    disabled.disabled = true;
    const report = auditModSet(scan([], [disabled]), {
      lockfileVerification: {
        valid: false, lockfilePath: '/mods/.upmods-lock.json',
        changes: [{ kind: 'added', displayName: 'new.jar', actual: { filename: 'new.jar', sha1: 'x', sizeBytes: 1 } }],
      },
    });
    expect(report.issues.find((entry) => entry.kind === 'disabled-or-legacy-jar')?.severity).toBe('warning');
    expect(report.issues.find((entry) => entry.kind === 'lockfile-drift')?.severity).toBe('warning');
  });

  it('does not let a disabled JAR satisfy or trigger an active dependency relationship', () => {
    const owner = mod('owner', 'owner.jar', 'owner-sha', {
      dependencies: [
        { projectId: 'library', versionId: null, fileName: null, dependencyType: 'required' },
        { projectId: 'conflict', versionId: null, fileName: null, dependencyType: 'incompatible' },
      ],
    });
    const library = mod('library', 'library.jar.disabled', 'library-sha');
    library.file.disabled = true;
    const conflict = mod('conflict', 'conflict.jar.disabled', 'conflict-sha');
    conflict.file.disabled = true;

    const report = auditModSet(scan([owner, library, conflict]));

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'missing-required-dependency' }),
    ]));
    expect(report.issues.some((entry) => entry.kind === 'incompatible-dependency')).toBe(false);
  });

  it('reports an installed dependency whose exact Modrinth version is incompatible', () => {
    const owner = mod('owner', 'owner.jar', 'owner-sha', {
      dependencies: [{
        projectId: 'library', versionId: 'library-v2', fileName: null, dependencyType: 'required',
      }],
    });
    const library = mod('library', 'library.jar', 'library-sha', {
      installedVersionId: 'library-v1',
      installedVersionNumber: '1.0.0',
    });

    const report = auditModSet(scan([owner, library]));

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'incompatible-dependency',
        severity: 'error',
        message: expect.stringContaining('library-v2'),
      }),
    ]));
  });

  it('resolves Modrinth dependencies that provide only a version ID', () => {
    const library = mod('library', 'library.jar', 'library-sha', {
      installedVersionId: 'library-v2',
      installedVersionNumber: '2.0.0',
    });
    const required = mod('required-owner', 'required-owner.jar', 'required-owner-sha', {
      dependencies: [{
        projectId: null, versionId: 'library-v2', fileName: null, dependencyType: 'required',
      }],
    });
    const incompatible = mod('incompatible-owner', 'incompatible-owner.jar', 'incompatible-owner-sha', {
      dependencies: [{
        projectId: null, versionId: 'library-v2', fileName: null, dependencyType: 'incompatible',
      }],
    });

    const report = auditModSet(scan([required, incompatible, library]));

    expect(report.issues.some((entry) => (
      entry.kind === 'missing-required-dependency' && entry.files.includes('required-owner.jar')
    ))).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'incompatible-dependency',
        files: ['incompatible-owner.jar', 'library.jar'],
      }),
    ]));
  });

  it('evaluates local required and incompatible dependency version ranges conservatively', () => {
    const owner = file('owner.jar', 'owner-sha', {
      format: 'fabric', id: 'owner', name: 'Owner', version: '1.0.0', loaders: ['fabric'],
      sourceEntry: 'fabric.mod.json', warnings: [],
      dependencies: [
        { id: 'library', type: 'required', versionRange: '[2,3)' },
        { id: 'conflict', type: 'incompatible', versionRange: '<2' },
      ],
    });
    const library = file('library.jar', 'library-sha', {
      format: 'fabric', id: 'library', name: 'Library', version: '1.5.0', loaders: ['fabric'],
      sourceEntry: 'fabric.mod.json', warnings: [], dependencies: [],
    });
    const conflict = file('conflict.jar', 'conflict-sha', {
      format: 'fabric', id: 'conflict', name: 'Conflict', version: '3.0.0', loaders: ['fabric'],
      sourceEntry: 'fabric.mod.json', warnings: [], dependencies: [],
    });

    const report = auditModSet(scan([], [owner, library, conflict]));
    const dependencyIssues = report.issues.filter((entry) => entry.kind === 'incompatible-dependency');

    expect(dependencyIssues).toHaveLength(1);
    expect(dependencyIssues[0]?.message).toContain('requires library [2,3)');
  });

  it('centralizes update blockers while allowing a planned replacement to repair environment compatibility', () => {
    const installed = mod('repairable', 'repairable.jar', 'repairable-sha', {
      loaders: ['forge'], supportedMcVersions: ['1.20.1'],
    });
    const update: ModUpdate = {
      mod: installed,
      latestVersionId: 'repairable-v2',
      latestVersionNumber: '2.0.0',
      downloadUrl: 'https://example.com/repairable.jar',
      downloadFilename: 'repairable-2.jar',
      downloadSizeBytes: 100,
      status: 'pending',
    };
    const items: UpdatePlanItem[] = [{
      mod: installed, action: 'update', update, reason: 'Compatible replacement found.',
    }];
    const environmentOnly = auditModSet(scan([installed]), {
      loader: 'fabric', minecraftVersion: '1.21.1',
    });
    expect(evaluateUpdateSafety(items, environmentOnly).safe).toBe(true);

    const missingDependency = mod('dependent', 'dependent.jar', 'dependent-sha', {
      dependencies: [{
        projectId: 'missing', versionId: null, fileName: null, dependencyType: 'required',
      }],
    });
    const blocked = auditModSet(scan([installed, missingDependency]), {
      loader: 'fabric', minecraftVersion: '1.21.1',
    });
    expect(evaluateUpdateSafety(items, blocked)).toMatchObject({
      safe: false,
      blockers: [expect.objectContaining({ kind: 'missing-required-dependency' })],
    });
  });

  it('blocks an incompatible update-plan decision even without audit errors', () => {
    const installed = mod('pinned', 'pinned.jar', 'pinned-sha');
    expect(evaluateUpdateSafety([{
      mod: installed,
      action: 'incompatible',
      pinnedVersion: 'missing-v2',
      reason: 'Pinned version is unavailable.',
    }], null)).toMatchObject({
      safe: false,
      blockers: [expect.objectContaining({ kind: 'incompatible-update-plan', source: 'plan' })],
    });
  });

  it('blocks an update that would introduce a missing required dependency', () => {
    const owner = mod('owner', 'owner.jar', 'owner-sha');
    const update: ModUpdate = {
      mod: owner,
      latestVersionId: 'owner-v2',
      latestVersionNumber: '2.0.0',
      downloadUrl: 'https://example.com/owner-v2.jar',
      downloadFilename: 'owner-v2.jar',
      downloadSizeBytes: 100,
      dependencies: [{
        projectId: 'new-library', versionId: null, fileName: null, dependencyType: 'required',
      }],
      status: 'pending',
    };
    const items: UpdatePlanItem[] = [{ mod: owner, action: 'update', update, reason: 'new release' }];
    const currentScan = scan([owner]);

    expect(evaluateUpdateSafety(items, auditModSet(currentScan), currentScan)).toMatchObject({
      safe: false,
      blockers: [expect.objectContaining({
        source: 'update-dependency',
        kind: 'missing-required-dependency',
        files: ['owner-v2.jar'],
      })],
    });
  });

  it('lets local metadata satisfy a dependency introduced by an update', () => {
    const owner = mod('owner', 'owner.jar', 'owner-sha');
    const update: ModUpdate = {
      mod: owner,
      latestVersionId: 'owner-v2',
      latestVersionNumber: '2.0.0',
      downloadUrl: 'https://example.com/owner-v2.jar',
      downloadFilename: 'owner-v2.jar',
      downloadSizeBytes: 100,
      dependencies: [{
        projectId: 'local-library', versionId: null, fileName: null, dependencyType: 'required',
      }],
      status: 'pending',
    };
    const localLibrary = file('local-library.jar', 'local-library-sha', {
      format: 'fabric', id: 'local-library', name: 'Local Library', version: '1.0.0',
      loaders: ['fabric'], sourceEntry: 'fabric.mod.json', warnings: [], dependencies: [],
    });
    const currentScan = scan([owner], [localLibrary]);
    const report = auditModSet(currentScan);

    expect(evaluateUpdateSafety([
      { mod: owner, action: 'update', update, reason: 'new release' },
    ], report, currentScan).safe).toBe(true);
  });

  it('rechecks the projected set so selected updates can repair old dependency errors', () => {
    const owner = mod('owner', 'owner.jar', 'owner-sha', {
      dependencies: [{
        projectId: 'library', versionId: 'library-v2', fileName: null, dependencyType: 'required',
      }],
    });
    const library = mod('library', 'library.jar', 'library-sha', {
      installedVersionId: 'library-v1', installedVersionNumber: '1.0.0',
    });
    const libraryUpdate: ModUpdate = {
      mod: library,
      latestVersionId: 'library-v2',
      latestVersionNumber: '2.0.0',
      downloadUrl: 'https://example.com/library-v2.jar',
      downloadFilename: 'library-v2.jar',
      downloadSizeBytes: 100,
      dependencies: [],
      status: 'pending',
    };
    const currentScan = scan([owner, library]);
    const currentAudit = auditModSet(currentScan);
    expect(currentAudit.issues.some((entry) => entry.kind === 'incompatible-dependency')).toBe(true);

    expect(evaluateUpdateSafety([
      { mod: owner, action: 'up-to-date', reason: 'current' },
      { mod: library, action: 'update', update: libraryUpdate, reason: 'repair' },
    ], currentAudit, currentScan).safe).toBe(true);
  });

  it('allows an updated owner to remove a dependency that is currently missing', () => {
    const owner = mod('owner', 'owner.jar', 'owner-sha', {
      dependencies: [{
        projectId: 'retired-library', versionId: null, fileName: null, dependencyType: 'required',
      }],
    });
    const update: ModUpdate = {
      mod: owner,
      latestVersionId: 'owner-v2',
      latestVersionNumber: '2.0.0',
      downloadUrl: 'https://example.com/owner-v2.jar',
      downloadFilename: 'owner-v2.jar',
      downloadSizeBytes: 100,
      dependencies: [],
      status: 'pending',
    };
    const currentScan = scan([owner]);
    const currentAudit = auditModSet(currentScan);
    expect(currentAudit.issues.some((entry) => entry.kind === 'missing-required-dependency')).toBe(true);

    expect(evaluateUpdateSafety([
      { mod: owner, action: 'update', update, reason: 'removes old dependency' },
    ], currentAudit, currentScan).safe).toBe(true);
  });

  it('projects safety onto the exact selected update subset without dropping plan decisions', () => {
    const first = mod('first', 'first.jar', 'first-sha');
    const second = mod('second', 'second.jar', 'second-sha');
    const firstUpdate: ModUpdate = {
      mod: first, latestVersionId: 'first-v2', latestVersionNumber: '2.0.0',
      downloadUrl: 'https://example.com/first.jar', downloadFilename: 'first-v2.jar',
      downloadSizeBytes: 100, status: 'pending',
    };
    const secondUpdate: ModUpdate = {
      mod: second, latestVersionId: 'second-v2', latestVersionNumber: '2.0.0',
      downloadUrl: 'https://example.com/second.jar', downloadFilename: 'second-v2.jar',
      downloadSizeBytes: 100, status: 'pending',
    };
    const incompatible = mod('third', 'third.jar', 'third-sha');
    const projected = selectUpdatePlanItems([
      { mod: first, action: 'update', update: firstUpdate, reason: 'first' },
      { mod: second, action: 'update', update: secondUpdate, reason: 'second' },
      { mod: incompatible, action: 'incompatible', reason: 'no compatible build' },
    ], ['second-sha']);

    expect(projected.map((item) => item.mod.projectId)).toEqual(['second', 'third']);
    expect(evaluateUpdateSafety(projected).blockers[0]?.kind).toBe('incompatible-update-plan');
  });
});
