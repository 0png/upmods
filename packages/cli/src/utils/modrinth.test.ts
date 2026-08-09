import test from 'node:test';
import assert from 'node:assert/strict';
import type { Mod, ModUpdate } from '@upmods/core';
import {
  getInstalledVersionUrl,
  getModrinthVersionUrl,
  getUpdateVersionUrl,
} from './modrinth.js';

const mod: Mod = {
  file: {
    path: 'D:/mods/sodium.jar',
    filename: 'sodium.jar',
    sha1: 'sha-sodium',
    sizeBytes: 123,
  },
  projectId: 'AANobbMI',
  projectSlug: 'sodium',
  displayName: 'Sodium',
  installedVersionId: 'installed-123',
  installedVersionNumber: '0.6.0',
  loaders: ['fabric'],
  supportedMcVersions: ['1.21.1'],
};

const update: ModUpdate = {
  mod,
  latestVersionId: 'latest-456',
  latestVersionNumber: '0.6.1',
  downloadUrl: 'https://example.com/sodium.jar',
  downloadFilename: 'sodium.jar',
  downloadSizeBytes: 456,
  status: 'pending',
};

test('getModrinthVersionUrl builds a version page URL', () => {
  assert.equal(
    getModrinthVersionUrl('sodium', 'latest-456'),
    'https://modrinth.com/mod/sodium/version/latest-456',
  );
});

test('getUpdateVersionUrl uses the selected update version', () => {
  assert.equal(
    getUpdateVersionUrl(update),
    'https://modrinth.com/mod/sodium/version/latest-456',
  );
});

test('getInstalledVersionUrl uses the installed mod version', () => {
  assert.equal(
    getInstalledVersionUrl(mod),
    'https://modrinth.com/mod/sodium/version/installed-123',
  );
});
