import test from 'node:test';
import assert from 'node:assert/strict';
import type { DownloadResult, LoaderMigrationPlan, Mod, ModUpdate } from '@upmods/core';
import { initialState, reducer } from './reducer.js';

function createModUpdate(index: number): ModUpdate {
  const mod: Mod = {
    file: {
      path: `D:/mods/mod-${index}.jar`,
      filename: `mod-${index}.jar`,
      sha1: `sha-${index}`,
      sizeBytes: 100 + index,
    },
    projectId: `project-${index}`,
    projectSlug: `project-${index}`,
    displayName: `Mod ${index}`,
    installedVersionId: `installed-${index}`,
    installedVersionNumber: `1.${index}.0`,
    loaders: ['fabric'],
    supportedMcVersions: ['1.21.1'],
  };

  return {
    mod,
    latestVersionId: `latest-${index}`,
    latestVersionNumber: `1.${index}.1`,
    downloadUrl: `https://example.com/mod-${index}.jar`,
    downloadFilename: `mod-${index}-latest.jar`,
    downloadSizeBytes: 200 + index,
    status: 'pending',
  };
}

function createDownloadResult(update: ModUpdate, success = true): DownloadResult {
  return {
    update,
    success,
    outputPath: success ? `D:/mods-updated/${update.downloadFilename}` : undefined,
    errorReason: success ? undefined : 'failed',
  };
}

test('CHECK_COMPLETE initializes all updates as selected and resets cursor', () => {
  const updates = [createModUpdate(1), createModUpdate(2)];
  const previous = {
    ...initialState,
    phase: 'checking' as const,
    checkCursorIndex: 1,
    selectedUpdates: { old: false },
  };

  const next = reducer(previous, {
    type: 'CHECK_COMPLETE',
    updates,
    upToDate: [],
  });

  assert.equal(next.phase, 'check_complete');
  assert.equal(next.scanCursorIndex, 0);
  assert.equal(next.checkCursorIndex, 0);
  assert.equal(next.downloadCursorIndex, 0);
  assert.equal(next.summaryCursorIndex, 0);
  assert.deepEqual(next.selectedUpdates, {
    'sha-1': true,
    'sha-2': true,
  });
});

test('scan cursor navigation wraps around the merged scan list', () => {
  const previous = {
    ...initialState,
    phase: 'scan_complete' as const,
    scanResult: {
      directory: 'D:/mods',
      totalFiles: 3,
      identifiedCount: 2,
      unidentifiedCount: 1,
      durationMs: 10,
      identified: [createModUpdate(1).mod, createModUpdate(2).mod],
      unidentified: [createModUpdate(3).mod.file],
    },
  };

  const up = reducer(previous, { type: 'SCAN_CURSOR_UP' });
  const down = reducer(up, { type: 'SCAN_CURSOR_DOWN' });

  assert.equal(up.scanCursorIndex, 2);
  assert.equal(down.scanCursorIndex, 0);
});

test('check cursor navigation wraps around the update list', () => {
  const updates = [createModUpdate(1), createModUpdate(2)];
  const checked = reducer(initialState, {
    type: 'CHECK_COMPLETE',
    updates,
    upToDate: [createModUpdate(3).mod],
  });

  const downOnce = reducer(checked, { type: 'CHECK_CURSOR_DOWN' });
  const downTwice = reducer(downOnce, { type: 'CHECK_CURSOR_DOWN' });
  const downThrice = reducer(downTwice, { type: 'CHECK_CURSOR_DOWN' });
  const upOnce = reducer(downThrice, { type: 'CHECK_CURSOR_UP' });
  const upTwice = reducer(upOnce, {
    type: 'CHECK_CURSOR_UP',
  });

  assert.equal(downOnce.checkCursorIndex, 1);
  assert.equal(downTwice.checkCursorIndex, 2);
  assert.equal(downThrice.checkCursorIndex, 0);
  assert.equal(upOnce.checkCursorIndex, 2);
  assert.equal(upTwice.checkCursorIndex, 1);
});

test('toggle selection is a no-op when cursor is on an up-to-date item', () => {
  const updates = [createModUpdate(1)];
  const checked = reducer(initialState, {
    type: 'CHECK_COMPLETE',
    updates,
    upToDate: [createModUpdate(2).mod],
  });
  const movedToUpToDate = reducer(checked, { type: 'CHECK_CURSOR_DOWN' });
  const toggled = reducer(movedToUpToDate, { type: 'TOGGLE_UPDATE_SELECTION' });

  assert.equal(toggled.checkCursorIndex, 1);
  assert.deepEqual(toggled.selectedUpdates, {
    'sha-1': true,
  });
});

test('toggle, select all, and clear all update selection work as expected', () => {
  const updates = [createModUpdate(1), createModUpdate(2)];
  const checked = reducer(initialState, {
    type: 'CHECK_COMPLETE',
    updates,
    upToDate: [],
  });

  const toggled = reducer(checked, { type: 'TOGGLE_UPDATE_SELECTION' });
  const cleared = reducer(toggled, { type: 'CLEAR_ALL_UPDATES' });
  const restored = reducer(cleared, { type: 'SELECT_ALL_UPDATES' });

  assert.equal(toggled.selectedUpdates['sha-1'], false);
  assert.equal(toggled.selectedUpdates['sha-2'], true);
  assert.deepEqual(cleared.selectedUpdates, {
    'sha-1': false,
    'sha-2': false,
  });
  assert.deepEqual(restored.selectedUpdates, {
    'sha-1': true,
    'sha-2': true,
  });
});

test('START_DOWNLOAD does nothing when no updates are selected', () => {
  const updates = [createModUpdate(1), createModUpdate(2)];
  const checked = reducer(initialState, {
    type: 'CHECK_COMPLETE',
    updates,
    upToDate: [],
  });
  const cleared = reducer(checked, { type: 'CLEAR_ALL_UPDATES' });

  const next = reducer(cleared, { type: 'START_DOWNLOAD' });

  assert.equal(next.phase, 'check_complete');
  assert.equal(next.activeDownloads.length, 0);
});

test('START_DOWNLOAD only queues selected updates and resets progress state', () => {
  const updates = [createModUpdate(1), createModUpdate(2), createModUpdate(3)];
  const checked = reducer(initialState, {
    type: 'CHECK_COMPLETE',
    updates,
    upToDate: [],
  });
  const moved = reducer(checked, { type: 'CHECK_CURSOR_DOWN' });
  const deselectedSecond = reducer(moved, { type: 'TOGGLE_UPDATE_SELECTION' });
  const started = reducer(
    {
      ...deselectedSecond,
      downloadResults: [createDownloadResult(updates[0])],
      downloadProgress: { 'sha-1': { bytes: 10, total: 20 } },
    },
    { type: 'START_DOWNLOAD' },
  );

  assert.equal(started.phase, 'downloading');
  assert.deepEqual(
    started.activeDownloads.map((update) => update.mod.file.sha1),
    ['sha-1', 'sha-3'],
  );
  assert.deepEqual(started.downloadResults, []);
  assert.deepEqual(started.downloadProgress, {});
  assert.equal(started.downloadCursorIndex, 0);
});

test('download cursor navigation wraps around active download bounds', () => {
  const updates = [createModUpdate(1), createModUpdate(2), createModUpdate(3)];
  const downloading = reducer(
    reducer(initialState, {
      type: 'CHECK_COMPLETE',
      updates,
      upToDate: [],
    }),
    { type: 'START_DOWNLOAD' },
  );

  const down = reducer(reducer(downloading, { type: 'DOWNLOAD_CURSOR_DOWN' }), {
    type: 'DOWNLOAD_CURSOR_DOWN',
  });
  const wrapped = reducer(reducer(down, { type: 'DOWNLOAD_CURSOR_DOWN' }), {
    type: 'DOWNLOAD_CURSOR_DOWN',
  });
  const up = reducer(wrapped, { type: 'DOWNLOAD_CURSOR_UP' });

  assert.equal(down.downloadCursorIndex, 2);
  assert.equal(wrapped.downloadCursorIndex, 1);
  assert.equal(up.downloadCursorIndex, 0);
});

test('summary cursor navigation wraps around failed result bounds', () => {
  const updates = [createModUpdate(1), createModUpdate(2), createModUpdate(3)];
  const done = reducer(
    {
      ...initialState,
      phase: 'downloading',
      activeDownloads: updates,
      downloadResults: [
        createDownloadResult(updates[0], false),
        createDownloadResult(updates[1], true),
        createDownloadResult(updates[2], false),
      ],
    },
    { type: 'DOWNLOAD_ALL_DONE' },
  );

  const down = reducer(done, { type: 'SUMMARY_CURSOR_DOWN' });
  const wrappedDown = reducer(down, { type: 'SUMMARY_CURSOR_DOWN' });
  const wrappedUp = reducer(done, { type: 'SUMMARY_CURSOR_UP' });

  assert.equal(done.summaryCursorIndex, 0);
  assert.equal(down.summaryCursorIndex, 1);
  assert.equal(wrappedDown.summaryCursorIndex, 0);
  assert.equal(wrappedUp.summaryCursorIndex, 1);
});

test('loader selection defaults to the detected source and preserves normal update flow', () => {
  const loaded = reducer(initialState, {
    type: 'MOD_LOADERS_LOADED',
    loaders: [
      { name: 'fabric', supportedProjectTypes: ['mod'] },
      { name: 'forge', supportedProjectTypes: ['mod'] },
    ],
    detection: {
      detected: 'forge',
      candidates: [{ loader: 'forge', count: 3 }],
      ambiguous: false,
    },
  });
  const confirmed = reducer({ ...loaded, phase: 'loader_select' }, {
    type: 'CONFIRM_LOADER_SELECTION',
  });

  assert.equal(loaded.selectedSourceLoader, 'forge');
  assert.equal(loaded.targetLoaderIndex, 1);
  assert.equal(confirmed.phase, 'checking');
  assert.equal(confirmed.selectedTargetLoader, 'forge');
});

test('choosing a different target loader enters migration analysis', () => {
  const loaded = reducer(initialState, {
    type: 'MOD_LOADERS_LOADED',
    loaders: [
      { name: 'fabric', supportedProjectTypes: ['mod'] },
      { name: 'forge', supportedProjectTypes: ['mod'] },
    ],
    detection: {
      detected: 'forge',
      candidates: [{ loader: 'forge', count: 2 }],
      ambiguous: false,
    },
  });
  const moved = reducer({ ...loaded, phase: 'loader_select' }, { type: 'LOADER_CURSOR_UP' });
  const confirmed = reducer(moved, { type: 'CONFIRM_LOADER_SELECTION' });

  assert.equal(moved.targetLoaderIndex, 0);
  assert.equal(confirmed.selectedTargetLoader, 'fabric');
  assert.equal(confirmed.phase, 'migration_checking');
});

test('migration review only toggles optional dependencies', () => {
  const update = createModUpdate(1);
  const plan: LoaderMigrationPlan = {
    sourceLoader: 'forge',
    targetLoader: 'fabric',
    mcVersion: '1.21.1',
    complete: true,
    issues: [],
    entries: [
      {
        id: 'root:one',
        displayName: 'Root',
        projectId: 'one',
        projectSlug: 'one',
        sourceLoader: 'forge',
        targetLoader: 'fabric',
        status: 'convertible',
        dependencyType: 'root',
        locked: true,
        activationKeys: ['root'],
        update,
      },
      {
        id: 'dependency:optional',
        displayName: 'Optional',
        projectId: 'optional',
        projectSlug: 'optional',
        sourceLoader: 'forge',
        targetLoader: 'fabric',
        status: 'optional',
        dependencyType: 'optional',
        locked: false,
        activationKeys: ['dependency:optional'],
        update,
      },
    ],
  };
  const review = reducer(initialState, { type: 'MIGRATION_PLAN_COMPLETE', plan });
  const lockedAttempt = reducer(review, { type: 'TOGGLE_OPTIONAL_DEPENDENCY' });
  const onOptional = reducer(lockedAttempt, { type: 'MIGRATION_CURSOR_DOWN' });
  const selected = reducer(onOptional, { type: 'TOGGLE_OPTIONAL_DEPENDENCY' });

  assert.equal(review.phase, 'migration_review');
  assert.deepEqual(lockedAttempt.selectedOptionalEntries, { 'dependency:optional': false });
  assert.equal(selected.selectedOptionalEntries['dependency:optional'], true);
});
