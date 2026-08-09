import { spawn } from 'node:child_process';
import type { Mod, ModUpdate } from '@upmods/core';

export function getModrinthVersionUrl(projectSlug: string, versionId: string): string {
  return `https://modrinth.com/mod/${projectSlug}/version/${versionId}`;
}

export function getUpdateVersionUrl(update: ModUpdate): string {
  return getModrinthVersionUrl(update.mod.projectSlug, update.latestVersionId);
}

export function getInstalledVersionUrl(mod: Mod): string {
  return getModrinthVersionUrl(mod.projectSlug, mod.installedVersionId);
}

export function openExternalUrl(url: string): void {
  const platform = process.platform;

  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }

  if (platform === 'darwin') {
    spawn('open', [url], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }

  spawn('xdg-open', [url], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}
