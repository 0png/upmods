import { request } from 'undici';
import type { Mod } from './types.js';

export interface ModrinthVersionResponse {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  loaders: string[];
  game_versions: string[];
  files: Array<{
    url: string;
    filename: string;
    primary: boolean;
    size: number;
    hashes: {
      sha1: string;
      sha512: string;
    };
  }>;
}

export interface ModrinthProjectResponse {
  id: string;
  slug: string;
  title: string;
}

export class ModrinthClient {
  readonly baseUrl = 'https://api.modrinth.com/v2';
  readonly userAgent: string;

  constructor(userAgent = 'upmods/0.1.0 (https://github.com/user/upmods)') {
    this.userAgent = userAgent;
  }

  /**
   * Identify mods by their SHA-1 hashes using Modrinth's bulk endpoint.
   * @param sha1s Array of lowercase hex SHA-1 hashes
   * @returns Map of sha1 → Mod (hashes not found in Modrinth are absent from map)
   */
  async identifyMods(sha1s: string[]): Promise<Map<string, Mod>> {
    if (sha1s.length === 0) {
      return new Map();
    }

    const response = await request(`${this.baseUrl}/version_files`, {
      method: 'POST',
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hashes: sha1s,
        algorithm: 'sha1',
      }),
    });

    if (response.statusCode !== 200) {
      throw new Error(`Modrinth API error: ${response.statusCode}`);
    }

    const data = (await response.body.json()) as Record<string, ModrinthVersionResponse>;
    const result = new Map<string, Mod>();

    for (const [sha1, versionData] of Object.entries(data)) {
      // Find the file in the version that matches this hash
      const file = versionData.files.find((f) => f.hashes.sha1 === sha1);
      if (!file) continue;

      // We need to fetch project details to get the display name
      // For now, use version name as display name (will be enhanced in future)
      result.set(sha1, {
        file: {
          path: '', // Will be filled by caller
          filename: file.filename,
          sha1,
          sizeBytes: file.size,
        },
        projectId: versionData.project_id,
        projectSlug: '', // Will fetch separately if needed
        displayName: versionData.name,
        installedVersionId: versionData.id,
        installedVersionNumber: versionData.version_number,
        loaders: versionData.loaders,
        supportedMcVersions: versionData.game_versions,
      });
    }

    return result;
  }
}
